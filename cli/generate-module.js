// One-click dungeon module generator + AI polisher.
// Generates a dungeon using the existing generator, then sends it to Claude
// to be rewritten as a polished, publishable Shadowdark adventure module.
// Uses the local `claude` CLI — no API key required.
//
// Usage:
//   npm run generate-module -- --level=3
//   npm run generate-module -- --level=3 --setting=dolmenwood --out=my-dungeon.md
//   npm run generate-module -- --level=3 --setting=menagerie --out=my-dungeon.md
//   npm run generate-module -- --level=3 --no-pdf          (skip the printable PDF)
//   npm run generate-module -- --level=3 --map-style=classic (box-and-line maps instead of hand-drawn)
//   npm run generate-module -- --level=3 --layout=cyclic [--cycle=two-keys]
//     (a dungeon built purely from nested cycles; --cycle picks the overall cycle — ids in
//      dungeon/src/dungeons/cycles.js)
//   npm run generate-module -- --level=3 --no-zone-cycles   (keep gestalt zones as laid out)
//   npm run generate-module -- --level=3 --size=large        (small / medium / large; rolled otherwise)
//
// Review: before the expensive passes the run stops twice for the GM — once
// on the structure (map + room contents, opened in the browser), once on the
// concept (the Pass 1 blueprint). Accept, reroll, or quit; a quit (or no TTY)
// saves the checkpoint and prints how to continue. Flags:
//   --approve / --reroll [--note="..."]  answer the open review step non-interactively
//   --no-review                          skip both steps (unattended runs)
//   --no-open                            don't open the preview in a browser
// Models: each step's model is in MODELS in cli/polish.js (Opus for the concept,
// Sonnet for the check/preamble/GM section/review, Haiku for rooms and editing);
//   --models=rooms:sonnet,editor:sonnet  overrides them (haiku, sonnet, opus, fable, or a model id)
// Playability: each roll is measured on its floor plan (dungeon/src/maps/playability.js)
// and the best of up to --tries=6 rolls is kept; --tries=1 takes the first.
//   npm run generate-module -- --level=3 --gestalt=hub-and-spokes,host-and-intruder
//     (gestalt ids are in dungeon/src/dungeons/gestalts.js; unspecified categories are rolled)
//
// Run directly:
//   npx vite-node cli/generate-module.js --level=3 --out=dungeon.md

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { createInterface } from 'readline';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

// ── CLI args ──────────────────────────────────────────────────────
const args = {};
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith('--')) continue;
  const [key, ...rest] = arg.slice(2).split('=');
  args[key] = rest.length ? rest.join('=') : true;
}

const partyLevel   = parseInt(args.level ?? args['party-level'] ?? '3');
const setting      = args.setting ?? 'generic';
const outFile      = args.out ?? args.output ?? null;
const editorArg    = args.editor ?? args['editor-model'] ?? null;
const editorModel  = editorArg === 'fable' ? FABLE_MODEL : editorArg ?? undefined;
if (typeof args.models === 'string') {
  try { setModels(args.models); } catch (err) { console.error(err.message); process.exit(1); }
}
const gestaltIds   = [args.gestalt, args.gestalts, args.spatial]
  .filter(v => typeof v === 'string')
  .flatMap(v => v.split(',').map(s => s.trim()).filter(Boolean));

// ── Monster DB (Node-compatible init) ─────────────────────────────
import { MonsterDB }    from '../dungeon/src/monsters.js';
import { initMonsterDB } from '../dungeon/src/monsterStore.js';

const monsterSources = ['core', 'dolmenwood', 'dolmenwood-animals'];
const allMonsters = monsterSources.flatMap(name => {
  try {
    return JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8'));
  } catch {
    return [];
  }
});
initMonsterDB(new MonsterDB(allMonsters));

// ── Generate ──────────────────────────────────────────────────────
import { generateModule } from '../dungeon/src/dungeons/generator.js';
import { formatBrief }    from './format-brief.js';
import { DOLMENWOOD_CONFIG } from '../dungeon/src/dungeons/dolmenwood-generator.js';
import { polish, generateBlueprint, UsageLimitError, ModelError, HAIKU_MODEL, SONNET_MODEL, FABLE_MODEL, MODELS, setModels, runDesignReview, applyDesignFix } from './polish.js';
import { structureText, writeReview, openInBrowser, ask } from './review.js';
import { playability } from '../dungeon/src/maps/playability.js';
import { injectMaps } from './inject-maps.js';
import { CYCLES, getCycle } from '../dungeon/src/dungeons/cycles.js';

// ── Checkpoint helpers ────────────────────────────────────────────

function serializeMap(map) {
  return { ...map, nodes: [...map.nodes.entries()], positions: [...map.positions] };
}

function deserializeMap(data) {
  return { ...data, nodes: new Map(data.nodes), positions: new Set(data.positions) };
}

function saveCheckpointDungeonState(checkpointFile, brief, moduleData) {
  const { dungeon, rooms, map } = moduleData;
  let existing = {};
  try { existing = JSON.parse(readFileSync(checkpointFile, 'utf8')); } catch {}
  writeFileSync(checkpointFile, JSON.stringify({
    ...existing,
    dungeonState: { brief, dungeon, rooms, map: serializeMap(map) },
  }, null, 2), 'utf8');
}

function loadCheckpointDungeonState(checkpointFile) {
  try {
    const data = JSON.parse(readFileSync(checkpointFile, 'utf8'));
    if (!data.dungeonState) return null;
    const { brief, dungeon, rooms, map: mapData } = data.dungeonState;
    // Until the concept is accepted nothing has been written from the brief,
    // so rebuild it: brief-format fixes reach a structure saved before them.
    const settled = data.review?.concept || data.preambleSections || data.rooms;
    return { brief, dungeon, rooms, map: deserializeMap(mapData), rebuildBrief: !settled };
  } catch { return null; }
}

// ── Checkpoint path ───────────────────────────────────────────────
// Always checkpoint so progress survives a token-limit interruption.
// Use --checkpoint=<path> to specify a path (also used for resume).
// Otherwise auto-generate a path and print it so the user can resume later.

const checkpointFile = args.checkpoint ?? `./module-${Date.now()}.checkpoint.json`;
const isResuming     = !!args.checkpoint && existsSync(args.checkpoint);

// Resolve outFile: CLI arg > checkpoint > auto-derive from checkpoint path
function loadCheckpointOutFile(path) {
  try { return JSON.parse(readFileSync(path, 'utf8'))?.outFile ?? null; } catch { return null; }
}
function saveCheckpointOutFile(path, file) {
  try {
    let existing = {};
    try { existing = JSON.parse(readFileSync(path, 'utf8')); } catch {}
    writeFileSync(path, JSON.stringify({ ...existing, outFile: file }, null, 2), 'utf8');
  } catch {}
}

const resolvedOutFile =
  outFile ??
  (isResuming ? loadCheckpointOutFile(checkpointFile) : null) ??
  checkpointFile.replace(/\.checkpoint\.json$/, '.md');

if (!outFile && !isResuming) {
  saveCheckpointOutFile(checkpointFile, resolvedOutFile);
}

const resumeCmd = [
  'npm run generate-module --',
  `--level=${partyLevel}`,
  `--setting=${setting}`,
  `--out=${resolvedOutFile}`,
  `--checkpoint=${checkpointFile}`,
  ...(editorArg ? [`--editor=${editorArg}`] : []),
  ...(typeof args.models === 'string' ? [`--models=${args.models}`] : []),
  // Generation options, so a reroll at the review step keeps them.
  ...(gestaltIds.length ? [`--gestalt=${gestaltIds.join(',')}`] : []),
  ...['layout', 'cycle', 'size', 'map-style', 'tries'].filter(k => typeof args[k] === 'string').map(k => `--${k}=${args[k]}`),
  ...['no-zone-cycles', 'no-pdf', 'no-open'].filter(k => args[k]).map(k => `--${k}`),
].join(' ');

if (isResuming) {
  process.stderr.write(`\nResuming from checkpoint: ${checkpointFile}\n`);
} else {
  process.stderr.write(`\nProgress file: ${checkpointFile}\n`);
  process.stderr.write(`To resume if interrupted:\n  ${resumeCmd}\n`);
}
process.stderr.write(`Models: ${Object.entries(MODELS).map(([k, v]) => `${k} ${v}`).join(' · ')}\n`);

// ── Generate or load dungeon state ───────────────────────────────
const config = setting === 'dolmenwood' ? { ...DOLMENWOOD_CONFIG }
             : setting === 'menagerie'  ? { types: [{ name: 'Menagerie', weight: 1, tags: ['monstrosity', 'aberration', 'animal', 'construct'], flavor: 'A private collection of mutant experiments. The beast has broken free. It hunts.', finalRoom: "The beast's den — cracked cages, gnawed bones, scattered notes from the last keeper." }], inhabitantFactions: [] }
             : {};
if (gestaltIds.length) config.gestalts = gestaltIds;
if (args.layout) {
  if (args.layout !== 'cyclic') { process.stderr.write(`Unknown --layout "${args.layout}" (only "cyclic").\n`); process.exit(1); }
  config.layout = 'cyclic';
}
if (typeof args.cycle === 'string') {
  if (!getCycle(args.cycle)) { process.stderr.write(`Unknown --cycle "${args.cycle}". Valid: ${CYCLES.map(c => c.id).join(', ')}\n`); process.exit(1); }
  config.layout = 'cyclic';
  config.cycle = args.cycle;
}
if (args['no-zone-cycles']) config.zoneCycles = false;
if (typeof args.size === 'string') {
  const size = args.size[0].toUpperCase() + args.size.slice(1).toLowerCase();
  if (!['Small', 'Medium', 'Large'].includes(size)) { process.stderr.write(`Unknown --size "${args.size}" (small, medium, large).\n`); process.exit(1); }
  config.size = size;
}

// Rolls up to --tries dungeons (default 6) and keeps the most playable one,
// stopping at the first with no playability warnings.
function generatePlayable() {
  const tries = Math.max(1, parseInt(args.tries ?? '6', 10) || 1);
  let best = null;
  for (let i = 1; i <= tries; i++) {
    const mod = generateModule(partyLevel, config);
    const play = playability(mod);
    if (!best || play.score < best.play.score) best = { mod, play };
    if (play.verdict === 'good') { best.tried = i; break; }
    best.tried = i;
  }
  process.stderr.write(`Playability: ${best.play.verdict}${best.tried > 1 ? ` (best of ${best.tried} rolls)` : ''}\n`);
  return best.mod;
}

let moduleData, brief;
const savedState = isResuming ? loadCheckpointDungeonState(checkpointFile) : null;

if (savedState) {
  moduleData = { dungeon: savedState.dungeon, rooms: savedState.rooms, map: savedState.map };
  brief = savedState.rebuildBrief ? formatBrief(moduleData) : savedState.brief;
  if (savedState.rebuildBrief) saveCheckpointDungeonState(checkpointFile, brief, moduleData);
  const { dungeon: d, rooms } = moduleData;
  process.stderr.write(`Loaded:    ${d.type} — ${d.size} · ${rooms.length} rooms · ${d.factions.length} factions\n\n`);
} else {
  process.stderr.write(`\nGenerating ${setting} dungeon (party level ${partyLevel})...\n`);
  moduleData = generatePlayable();
  brief = formatBrief(moduleData);
  const { dungeon: d, rooms } = moduleData;
  process.stderr.write(`Generated: ${d.type} — ${d.size} · ${rooms.length} rooms · ${d.factions.length} factions\n`);
  process.stderr.write(`Gestalts:  ${(d.gestalts ?? []).map(g => g.name).join(' + ') || 'none'}\n`);
  const flows = d.cycleFlows ?? [];
  process.stderr.write(`Cycles:    ${flows.length ? flows.map(f => `${f.flow.cycles[0].name}${f.zone ? ` (${f.zone})` : ''}`).join(', ') : 'none'}\n\n`);
  saveCheckpointDungeonState(checkpointFile, brief, moduleData);
}

// ── Format & polish ───────────────────────────────────────────────
// Load setting-specific faction context if available
let factionContext = null;
if (setting === 'dolmenwood') {
  try {
    factionContext = readFileSync(resolve(root, 'temp/dolmenwood_factions.txt'), 'utf8').trim();
  } catch {
    process.stderr.write('Warning: could not load dolmenwood_factions.txt — generic factions will be used.\n');
  }
}

// ── Review: structure, then concept, before any expensive pass ────
// Gate 1 shows the map and what is in each room (no LLM calls yet), Gate 2
// the Pass 1 blueprint. Answers are kept in the checkpoint, so a stopped
// review (no TTY, or [q]) resumes at the same gate.
const readCheckpoint  = () => { try { return JSON.parse(readFileSync(checkpointFile, 'utf8')); } catch { return {}; } };
const patchCheckpoint = fields => writeFileSync(checkpointFile, JSON.stringify({ ...readCheckpoint(), ...fields }, null, 2), 'utf8');

async function reviewModule() {
  const base        = checkpointFile.replace(/\.checkpoint\.json$/, '');
  const reviewFile  = `${base}.review.html`;
  const conceptFile = `${base}.concept.txt`;
  let answer = args.approve ? 'a' : args.reroll ? 'r' : null;  // non-interactive answer for the first open gate
  const take = async question => { const a = answer ?? await ask(question); answer = null; return a; };
  let opened = !!args['no-open'];
  const show = opts => {
    const file = writeReview(reviewFile, moduleData, opts);
    if (!opened) { openInBrowser(file); opened = true; }
    process.stderr.write(`Map and room list: ${file}\n\n`);
  };
  const stop = gate => {
    const sep = '─'.repeat(60);
    process.stderr.write(`\n${sep}\nReview paused at the ${gate} step.\n  Preview:  ${resolve(reviewFile)}\n`);
    if (gate === 'concept') process.stderr.write(`  Concept:  ${resolve(conceptFile)} (edit it to change the concept by hand)\n`);
    process.stderr.write(`\nContinue (asks again):\n  ${resumeCmd}\nOr answer from the command line:\n  ${resumeCmd} --approve\n` +
      `  ${resumeCmd} --reroll${gate === 'concept' ? ' [--note="what to change"]' : ''}\n${sep}\n`);
    process.exit(0);
  };
  const sep = '─'.repeat(60);

  while (true) {
    const review = readCheckpoint().review ?? {};
    if (!review.structure) {
      process.stderr.write(`\n${sep}\nREVIEW 1/2 — STRUCTURE\n${sep}\n${structureText(moduleData)}\n\n`);
      show({ stage: 'structure' });
      const a = await take('[a]ccept · [r]eroll the dungeon · [q]uit: ');
      if (a === null || /^q/i.test(a)) stop('structure');
      if (/^r/i.test(a)) {
        moduleData = generatePlayable();
        brief = formatBrief(moduleData);
        saveCheckpointDungeonState(checkpointFile, brief, moduleData);
        patchCheckpoint({ blueprint: null });
      } else if (/^a/i.test(a)) {
        patchCheckpoint({ review: { structure: true } });
      }
      continue;
    }
    if (!review.concept) {
      let blueprint = readCheckpoint().blueprint;
      if (!blueprint || !existsSync(conceptFile)) {
        if (!blueprint) {
          blueprint = await generateBlueprint(brief, factionContext, reviewNote);
          reviewNote = '';
          patchCheckpoint({ blueprint });
        }
        writeFileSync(conceptFile, blueprint, 'utf8');
      }
      process.stderr.write(`\n${sep}\nREVIEW 2/2 — CONCEPT\n${sep}\n${blueprint}\n\n`);
      process.stderr.write(`To change it by hand, edit ${resolve(conceptFile)} and then accept.\n`);
      show({ stage: 'concept', blueprint });
      const interactive = answer === null;
      const a = await take('[a]ccept · [r]egenerate (with an optional note) · [b]ack to the dungeon · [q]uit: ');
      if (a === null || /^q/i.test(a)) stop('concept');
      if (/^r/i.test(a)) {
        reviewNote = interactive ? (await ask('Note for the rewrite (Enter for none): ')) ?? '' : reviewNote;
        patchCheckpoint({ blueprint: null });
      } else if (/^b/i.test(a)) {
        patchCheckpoint({ blueprint: null, review: {} });
      } else if (/^a/i.test(a)) {
        const edited = readFileSync(conceptFile, 'utf8').trim();
        patchCheckpoint({ blueprint: edited || blueprint, review: { structure: true, concept: true } });
        return;
      }
      continue;
    }
    return;
  }
}

// A run already past Pass 1 (or a checkpoint from before reviews existed) isn't reviewed again.
let reviewNote = typeof args.note === 'string' ? args.note : '';
const started = (() => { const c = readCheckpoint(); return Object.keys(c.rooms ?? {}).length > 0 || Object.keys(c.preambleSections ?? {}).length > 0; })();
if (!args['no-review'] && !started) await reviewModule();

const { rooms, map } = moduleData;

// Prompt the user to pick a fallback editor model when the requested one fails.
// Returns a model string to retry with, or null if the user wants to stop.
// Returns null immediately when stdin is not a TTY (piped/CI — just fail).
async function promptEditorFallback(err) {
  if (!process.stdin.isTTY) return null;
  const sep = '─'.repeat(60);
  process.stderr.write(`\n${sep}\n`);
  process.stderr.write(`MODEL ERROR — the editorial pass failed.\n`);
  process.stderr.write(`  ${err.message}\n\n`);
  process.stderr.write(`Passes 1–3 are checkpointed — only the editorial pass needs to retry.\n\n`);
  process.stderr.write(`Retry with a different model?\n`);
  process.stderr.write(`  [h] Haiku   (fast, default)\n`);
  process.stderr.write(`  [s] Sonnet\n`);
  process.stderr.write(`  [n] Stop\n`);
  process.stderr.write(`${sep}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question('Choice [h/s/n, default=h]: ', answer => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === 'n' || a === 'no' || a === 'stop') resolve(null);
      else if (a === 's' || a === 'sonnet') resolve(SONNET_MODEL);
      else resolve(HAIKU_MODEL); // 'h', empty, or anything else → haiku
    });
  });
}

let output;
let activeEditorModel = editorModel;
while (true) {
  try {
    output = await polish(brief, rooms, map, { factionContext, checkpointFile, editorModel: activeEditorModel });
    break;
  } catch (err) {
    if (err instanceof ModelError) {
      const fallback = await promptEditorFallback(err);
      if (fallback) { activeEditorModel = fallback; continue; }
      // No TTY or user chose to stop
      process.stderr.write(`\n${'─'.repeat(60)}\n`);
      process.stderr.write(`MODEL ERROR — stopping.\n\n`);
      process.stderr.write(`Progress is saved. Resume (without --editor) with:\n  ${resumeCmd}\n`);
      process.stderr.write(`${'─'.repeat(60)}\n`);
      process.exit(1);
    }
    if (err instanceof UsageLimitError) {
      process.stderr.write(`\n${'─'.repeat(60)}\n`);
      process.stderr.write(`USAGE LIMIT REACHED — no tokens available right now.\n\n`);
      process.stderr.write(`Progress has been saved to:\n  ${checkpointFile}\n\n`);
      process.stderr.write(`When tokens are available again, resume with:\n  ${resumeCmd}\n`);
      process.stderr.write(`${'─'.repeat(60)}\n`);
      process.exit(1);
    }
    throw err;
  }
}

// ── Pass 6: Design review (auto-fix) ─────────────────────────────
// Runs on the assembled text before SVG injection (no base64 noise for the model).
// Only runs in interactive sessions; skipped in CI / piped mode.
if (process.stdin.isTTY) {
  const issues = await runDesignReview(output, checkpointFile);
  if (issues.length > 0) {
    const sep = '─'.repeat(60);
    process.stderr.write(`\n${sep}\n`);
    process.stderr.write(`DESIGN REVIEW — ${issues.length} issue${issues.length !== 1 ? 's' : ''} found\n`);
    process.stderr.write(`${sep}\n`);

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const fix   = issue.options?.[0];
      process.stderr.write(`\n[${i + 1}/${issues.length}] ${issue.location}\n`);
      process.stderr.write(`  ${issue.problem}\n`);
      if (fix) {
        process.stderr.write(`  Applying: ${fix}\n`);
        output = await applyDesignFix(output, issue, fix);
      } else {
        process.stderr.write(`  (no fix available — skipped)\n`);
      }
    }

    process.stderr.write(`\n${'─'.repeat(60)}\n\n`);
  } else {
    process.stderr.write('\nPass 6: design review — no issues found.\n\n');
  }
}

// ── Maps: hand-drawn by default, the old box-and-line diagrams on request ──
output = injectMaps(output, { rooms, map }, { classic: args['map-style'] === 'classic' });

// ── Output ────────────────────────────────────────────────────────
// If no --out was given, derive the filename from the module title.
let finalOutFile = resolvedOutFile;
if (!outFile) {
  const titleLine = output.match(/^#\s+(.+)/)?.[1]?.trim();
  if (titleLine) {
    const slug = titleLine
      .toLowerCase()
      .replace(/['']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/, '');
    finalOutFile = `${slug}.md`;
  }
}
writeFileSync(finalOutFile, output, 'utf8');

// ── Printable PDF (cli/module_pdf.py; needs python3 with weasyprint + markdown) ──
if (!args['no-pdf']) {
  const pdf = spawnSync('python3', [resolve(__dir, 'module_pdf.py'), finalOutFile], { stdio: 'inherit' });
  if (pdf.error || pdf.status !== 0) {
    process.stderr.write(`PDF not generated. Retry with: npm run module-pdf -- ${finalOutFile}\n`);
  }
}
process.stderr.write(`\nSaved to ${finalOutFile}\n`);
