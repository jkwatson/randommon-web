// One-click dungeon module generator + AI polisher.
// Generates a dungeon using the existing generator, then sends it to Claude
// to be rewritten as a polished, publishable Shadowdark adventure module.
// Uses the local `claude` CLI — no API key required.
//
// Usage:
//   npm run generate-module -- --level=3
//   npm run generate-module -- --level=3 --setting=dolmenwood --out=my-dungeon.md
//   npm run generate-module -- --level=3 --setting=menagerie --out=my-dungeon.md
//
// Run directly:
//   npx vite-node cli/generate-module.js --level=3 --out=dungeon.md

import { readFileSync, writeFileSync, existsSync } from 'fs';
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
import { polish, UsageLimitError, ModelError, HAIKU_MODEL, SONNET_MODEL, FABLE_MODEL, runDesignReview, applyDesignFix } from './polish.js';
import { renderSvgMap, renderMiniMap, svgToEmbed } from './render-map.js';

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
    return { brief, dungeon, rooms, map: deserializeMap(mapData) };
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
].join(' ');

if (isResuming) {
  process.stderr.write(`\nResuming from checkpoint: ${checkpointFile}\n`);
} else {
  process.stderr.write(`\nProgress file: ${checkpointFile}\n`);
  process.stderr.write(`To resume if interrupted:\n  ${resumeCmd}\n`);
}

// ── Generate or load dungeon state ───────────────────────────────
const config = setting === 'dolmenwood' ? { monsterSource: 'dolmenwood' }
             : setting === 'menagerie'  ? { types: [{ name: 'Menagerie', weight: 1, tags: ['monstrosity', 'aberration', 'animal', 'construct'], flavor: 'A private collection of mutant experiments. The beast has broken free. It hunts.', finalRoom: "The beast's den — cracked cages, gnawed bones, scattered notes from the last keeper." }], inhabitantFactions: [] }
             : {};

let moduleData, brief;
const savedState = isResuming ? loadCheckpointDungeonState(checkpointFile) : null;

if (savedState) {
  moduleData = { dungeon: savedState.dungeon, rooms: savedState.rooms, map: savedState.map };
  brief = savedState.brief;
  const { dungeon: d, rooms } = moduleData;
  process.stderr.write(`Loaded:    ${d.type} — ${d.size} · ${rooms.length} rooms · ${d.factions.length} factions\n\n`);
} else {
  process.stderr.write(`\nGenerating ${setting} dungeon (party level ${partyLevel})...\n`);
  moduleData = generateModule(partyLevel, config);
  brief = formatBrief(moduleData);
  const { dungeon: d, rooms } = moduleData;
  process.stderr.write(`Generated: ${d.type} — ${d.size} · ${rooms.length} rooms · ${d.factions.length} factions\n\n`);
  saveCheckpointDungeonState(checkpointFile, brief, moduleData);
}

const { rooms, map } = moduleData;

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

// ── Inject overall map before ## Rooms ───────────────────────────
const mapSvg = renderSvgMap(map, rooms);
if (mapSvg) {
  const mapBlock = `## Dungeon Map\n\n${svgToEmbed(mapSvg, 'Dungeon Map')}\n\n`;
  if (/^## Rooms\b/m.test(output)) {
    output = output.replace(/^(## Rooms\b)/m, `${mapBlock}$1`);
  } else {
    output += `\n\n${mapBlock}`;
  }
}

// ── Inject per-room mini-maps after each ### Room N heading ───────
output = output.replace(/^(### Room (\d+)\b[^\n]*)\n/mg, (match, heading, numStr) => {
  const num    = parseInt(numStr, 10);
  const miniSvg = renderMiniMap(num, map, rooms);
  if (!miniSvg) return match;
  return `${heading}\n\n${svgToEmbed(miniSvg, `Room ${num} exits`)}\n\n`;
});

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
process.stderr.write(`\nSaved to ${finalOutFile}\n`);
