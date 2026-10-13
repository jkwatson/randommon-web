// Incremental dungeon module polisher.
// Breaks generation into small, focused calls so no single call is too large.
//
//  Pass 1  — Blueprint (Opus):     creative spine — title, factions, concept, connections;
//            then a plausibility check (Sonnet) and, if it finds problems, one revision
//  Pass 2  — Preamble (4 × Sonnet): overview, factions, encounters, entrance
//  Pass 3  — Rooms (Haiku × N):    one call per room in BFS order from entrance;
//                                   each call sees the blueprint + adjacent written rooms
//  Pass 4  — Editorial (Haiku × preamble sections + rooms):
//            independent agent tightens each section against Shadowdark stocking criteria
//
// Which model runs each step is in MODELS (aliases, so they track the newest
// release); --models=rooms:sonnet,... overrides them.
//
// Uses the local `claude` CLI (no API key needed). Output format: json
// so the result field is clean text with no thinking-block contamination.

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { budgetFor } from './format-brief.js';
import { PREMISES } from '../dungeon/src/dungeons/premises.js';
import { ALL_GESTALTS } from '../dungeon/src/dungeons/gestalts.js';
import { CYCLES } from '../dungeon/src/dungeons/cycles.js';

// ── Error types ───────────────────────────────────────────────────

class TimeoutError extends Error {
  constructor(msg) { super(msg); this.name = 'TimeoutError'; }
}

export class UsageLimitError extends Error {
  constructor(msg) { super(msg); this.name = 'UsageLimitError'; }
}

export class ModelError extends Error {
  constructor(msg) { super(msg); this.name = 'ModelError'; }
}

// ── Shared infra ──────────────────────────────────────────────────

const CLAUDE_CWD = tmpdir();

function tempFiles(sys, usr) {
  const base = `${CLAUDE_CWD}/_cl_${process.pid}_${Date.now()}`;
  const sf = `${base}_s.txt`, uf = `${base}_u.txt`, of = `${base}_o.txt`, ef = `${base}_e.txt`;
  writeFileSync(sf, sys, 'utf8');
  writeFileSync(uf, usr, 'utf8');
  return { sf, uf, of, ef };
}

function claudeCmd(model, sf, uf, of, ef) {
  return `claude --print --output-format json --effort low --model ${model} --system-prompt-file ${sf} < ${uf} > ${of} 2> ${ef}`;
}

function extractResult(raw) {
  try { return JSON.parse(raw)?.result?.trim() ?? ''; } catch { return raw.trim(); }
}

const USAGE_LIMIT_PATTERNS = [
  /usage limit/i,
  /session limit/i,
  /rate.?limit/i,
  /out of tokens/i,
  /upgrade your plan/i,
  /claude\.ai\/upgrade/i,
  /exceeded.*limit/i,
  /no.*credits/i,
  /resets \d+:\d+/i,
];

const MODEL_ERROR_PATTERNS = [
  /issue with the selected model/i,
  /may not exist or you may not have access/i,
  /run --model to pick a different model/i,
  /unknown model/i,
  /invalid model/i,
  /model not found/i,
  /is currently unavailable/i,
];

function detectPattern(patterns, raw) {
  if (!raw) return false;
  if (patterns.some(p => p.test(raw))) return true;
  try {
    const parsed = JSON.parse(raw);
    const text = parsed?.result ?? parsed?.error?.message ?? '';
    if (text && patterns.some(p => p.test(text))) return true;
  } catch {}
  return false;
}

function detectUsageLimit(raw) { return detectPattern(USAGE_LIMIT_PATTERNS, raw); }
function detectModelError(raw)  { return detectPattern(MODEL_ERROR_PATTERNS,  raw); }

function callClaude(sys, usr, model, timeoutMs = 300_000) {
  const { sf, uf, of, ef } = tempFiles(sys, usr);

  return new Promise((resolve, reject) => {
    const proc = spawn('sh', ['-c', claudeCmd(model, sf, uf, of, ef)], {
      cwd: CLAUDE_CWD, stdio: 'ignore',
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      // give it a moment to flush, then clean up
      setTimeout(() => {
        for (const f of [sf, uf, of, ef]) try { unlinkSync(f); } catch {}
      }, 500);
      reject(new TimeoutError(`Claude timed out after ${(timeoutMs / 1000).toFixed(0)}s`));
    }, timeoutMs);

    proc.on('error', err => {
      clearTimeout(timer);
      for (const f of [sf, uf, of, ef]) try { unlinkSync(f); } catch {}
      reject(err);
    });

    proc.on('exit', (code, signal) => {
      clearTimeout(timer);

      let raw = '';
      try { raw = readFileSync(of, 'utf8'); } catch {}
      let errOut = '';
      try { errOut = readFileSync(ef, 'utf8'); } catch {}
      for (const f of [sf, uf, of, ef]) try { unlinkSync(f); } catch {}

      if (signal) {
        reject(new TimeoutError(`Claude killed by signal ${signal}`));
        return;
      }
      if (detectModelError(raw) || detectModelError(errOut)) {
        const msg = extractResult(raw) || errOut.trim() || 'Model unavailable.';
        reject(new ModelError(msg));
        return;
      }
      if (detectUsageLimit(raw) || detectUsageLimit(errOut)) {
        const msg = extractResult(raw) || errOut.trim() || 'Usage limit reached — no tokens available.';
        reject(new UsageLimitError(msg));
        return;
      }
      if (code !== 0 && !raw.trim()) {
        // Non-zero exit with no output: transient error (network, cold start, internal CLI retry).
        // Treat as retriable rather than halting the run.
        reject(new TimeoutError(errOut.trim() || 'Claude exited with no output'));
        return;
      }
      resolve(extractResult(raw));
    });
  });
}

async function callClaudeWithRetry(sys, usr, model, timeoutMs = 300_000, retries = 2) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await callClaude(sys, usr, model, timeoutMs);
    } catch (err) {
      if (err instanceof UsageLimitError) throw err;
      if (err instanceof ModelError) throw err;
      if (attempt > retries) throw err;
      const waitSec = attempt * 15;
      stderr.write(`\n  error on attempt ${attempt}/${retries + 1}, retrying in ${waitSec}s: ${err.message}\n`);
      await new Promise(r => setTimeout(r, waitSec * 1_000));
    }
  }
}

// ── Checkpoint ────────────────────────────────────────────────────
// Saves AI-generated content after each step so a run interrupted by a
// usage limit can be resumed from where it stopped.

export class Checkpoint {
  constructor(path) {
    this.path       = path;
    this.blueprint  = null;
    this.preambleSections       = {};   // label → text
    this.rooms                  = {};   // roomNum → written text
    this.gmSection              = null; // "What's Really Going On" (GM-only)
    this.hooks                  = null; // Adventure Hooks + Rumors
    this.editedPreambleSections = {};   // index → edited text
    this.editedRooms            = {};   // roomNum → edited text
    this.editedGmSection        = null;
    this.editedHooks            = null;
    this.specifiedRooms         = {};   // roomNum → text after the specificity pass
    this.swept                  = {};   // 'preamble-i' | 'gm' | 'hooks' | 'room-N' → text after the plain-words sweep
    this.beyond                 = null; // roomNum → what can be sensed of it from outside its doors
  }

  static load(path) {
    const cp = new Checkpoint(path);
    if (!path || !existsSync(path)) return cp;
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (data.blueprint)                cp.blueprint                = data.blueprint;
      if (data.preambleSections)         cp.preambleSections         = data.preambleSections;
      if (data.rooms)                    cp.rooms                    = data.rooms;
      if (data.gmSection)                cp.gmSection                = data.gmSection;
      if (data.hooks)                    cp.hooks                    = data.hooks;
      if (data.editedPreambleSections) {
        // Normalize: old format was a completed array, new format is index → text object.
        const eps = data.editedPreambleSections;
        cp.editedPreambleSections = Array.isArray(eps)
          ? Object.fromEntries(eps.map((v, i) => [i, v]))
          : eps;
      }
      if (data.editedRooms)              cp.editedRooms              = data.editedRooms;
      if (data.editedGmSection)          cp.editedGmSection          = data.editedGmSection;
      if (data.editedHooks)              cp.editedHooks              = data.editedHooks;
      if (data.specifiedRooms)           cp.specifiedRooms           = data.specifiedRooms;
      if (data.swept)                    cp.swept                    = data.swept;
      if (data.beyond)                   cp.beyond                   = data.beyond;
    } catch {}
    return cp;
  }

  save() {
    if (!this.path) return;
    try {
      // Merge with the file so dungeonState written by generate-module.js is preserved.
      let existing = {};
      try { existing = JSON.parse(readFileSync(this.path, 'utf8')); } catch {}
      writeFileSync(this.path, JSON.stringify({
        ...existing,
        blueprint:               this.blueprint,
        preambleSections:        this.preambleSections,
        rooms:                   this.rooms,
        gmSection:               this.gmSection,
        hooks:                   this.hooks,
        editedPreambleSections:  this.editedPreambleSections,
        editedRooms:             this.editedRooms,
        editedGmSection:         this.editedGmSection,
        editedHooks:             this.editedHooks,
        specifiedRooms:          this.specifiedRooms,
        swept:                   this.swept,
        beyond:                  this.beyond,
      }, null, 2), 'utf8');
    } catch (err) {
      stderr.write(`  Warning: could not save checkpoint: ${err.message}\n`);
    }
  }
}

const HAIKU  = 'haiku';
const SONNET = 'sonnet';
const OPUS   = 'opus';
const FABLE  = 'claude-fable-5-1';

// The concept is one call that everything else follows, so it gets the
// strongest model; the many room and editing calls get the fast one.
export const MODELS = {
  blueprint: OPUS,
  check:     SONNET,   // plausibility check of the blueprint
  preamble:  SONNET,
  rooms:     HAIKU,
  gm:        SONNET,   // GM section and hooks
  editor:    HAIKU,
  review:    SONNET,   // Pass 6 design review
  fix:       HAIKU,
  specify:   SONNET,   // resolves "something"/"someone" in rooms into this dungeon's specifics
};
const ALIASES = { haiku: HAIKU, sonnet: SONNET, opus: OPUS, fable: FABLE };

// "rooms:sonnet,blueprint:opus" → MODELS updated in place.
export function setModels(spec = '') {
  for (const part of spec.split(',').map(x => x.trim()).filter(Boolean)) {
    const [step, model] = part.split(/[:=]/).map(x => x.trim());
    if (!(step in MODELS) || !model) throw new Error(`--models: unknown step "${step}" (steps: ${Object.keys(MODELS).join(', ')})`);
    MODELS[step] = ALIASES[model] ?? model;
  }
  return MODELS;
}
const stderr = process.stderr;

// ── Map traversal ─────────────────────────────────────────────────

const DIR_OFFSETS = {
  North:[0,-1], South:[0,1], East:[1,0], West:[-1,0],
  Northeast:[1,-1], Northwest:[-1,-1], Southeast:[1,1], Southwest:[-1,1],
};

function exitTarget(exit, room, map) {
  const from = map.nodes.get(room._mapId);
  if (!from) return null;
  const off = DIR_OFFSETS[exit.direction];
  if (!off) return null;
  for (const n of map.nodes.values()) {
    if (n.x === from.x + off[0] && n.y === from.y + off[1]) return n.roomNumber;
  }
  return null;
}

function bfsOrder(rooms, map) {
  const byNum   = new Map(rooms.map(r => [r._roomNumber, r]));
  const start   = (rooms.find(r => r._isEntrance) ?? rooms[0])._roomNumber;
  const visited = new Set();
  const queue   = [start];
  const order   = [];
  while (queue.length) {
    const n = queue.shift();
    if (visited.has(n)) continue;
    visited.add(n); order.push(n);
    for (const ex of byNum.get(n)?.exits ?? []) {
      const t = exitTarget(ex, byNum.get(n), map);
      if (t != null && !visited.has(t)) queue.push(t);
    }
  }
  for (const r of rooms) if (!visited.has(r._roomNumber)) order.push(r._roomNumber);
  return order;
}

// ── Brief parsing ─────────────────────────────────────────────────

export function roomSections(brief) {
  const map = new Map();
  // JS has no \Z: `(?![\s\S])` is end-of-input. (\Z matched a literal "Z",
  // cutting sections short at "Zone:" lines or ZOMBIE stat blocks.)
  const re  = /^(--- Room (\d+)\b[^\n]*\n[\s\S]*?)(?=^--- Room |(?![\s\S]))/gm;
  for (const m of brief.matchAll(re)) map.set(parseInt(m[2]), m[1].trim());
  return map;
}

// ── System prompts ────────────────────────────────────────────────

const BLUEPRINT_SYS = `\
You are a Shadowdark RPG dungeon designer. Given a mechanical dungeon outline, produce \
a compact creative brief that will guide all subsequent writing. Be specific and opinionated — \
invent concrete names, histories, and details. This brief is the creative spine for the module.

The dungeon data includes a GESTALT section: the abstract patterns that organize this dungeon \
(how its spaces are arranged, how it changes, how its inhabitants relate). Treat the gestalt as \
the structural spine — the theme is how it looks, the gestalt is how it works. Every faction, \
story beat, and cross-room connection should reinforce it, and players must be able to discover \
each pattern through concrete clues in specific rooms.

If the data includes HOW THE DUNGEON FLOWS, the dungeon is built from nested cycles (locks and keys, \
shortcuts, barriers, false goals). Build the story around them: give every lock and key a concrete, \
named form that fits the theme, and keep their rooms exactly as given.

KEEP IT PLAUSIBLE. A GM will run this at the table and players will poke at every claim:
- Scale: the dungeon is as big as SIZE says — a party crosses it in an afternoon. Outsiders carry days of food and light, not months; anyone here longer must live here (a lair, a water source, a way to eat). Time spans for visitors are hours or days.
- Nature: each faction can only do what its kind can. The undead cannot pass as living people; mindless creatures do not scheme, bargain, or keep secrets; beasts do not hold meetings. A spy, traitor, or double agent must be someone who could actually be in that group unnoticed.
- Secrets must be discoverable in this dungeon (a room, an NPC, a document) and must change what the players would do.
- Use exactly the factions in the data — no more. In a dungeon this size, a third power belongs only as a single creature or an absent patron, never a full faction.

Every NPC the room data places in a room (lines "NPC: name") is in this dungeon: give each one a \
place in the story — even a single line in CROSS-ROOM CONNECTIONS or a faction — or make them a \
minor figure with a plain reason to be there. Never drop one, and never contradict their room data.

Names: invent fresh ones. Avoid names that recur across these modules — Oswin, Pell, Bram, Brannoc, \
Crewe, Lem, Fela, Isolde, Varric, Edric, Wulf, Corvin, Kasra, Morna, Hesta, Dael.

Your output MUST begin with: TITLE: [one evocative proper name for this specific dungeon]`;

// Each preamble call writes exactly one section, so a model that drafts in its
// thinking still surfaces the whole section as text.
const PREAMBLE_SYS = `\
You are a Shadowdark RPG dungeon designer writing polished, publishable adventure content. \
Be evocative and specific. Every sentence must earn its place.

Standard DCs: 9 easy / 12 moderate / 15 hard / 18 very hard / 20 near-impossible.
Treasure XP: 1 XP mundane · 3 XP magical/remarkable · 10 XP legendary/hoard.

SHADOWDARK MECHANICS — no D&D 5e terminology:
- Checks use the 6 raw attributes only: STR / DEX / CON / INT / WIS / CHA.
  Never use skill names. "DC 15 WIS" not "Perception DC 15"; "STR check" not "Athletics check".
- No saves or saving throws. Write "DC 12 CON or paralyzed", never "CON save DC 12".`;

const ROOM_SYS = `\
You write terse dungeon room descriptions for Shadowdark RPG. Brevity is non-negotiable.

FORMAT:
### Room N — NAME IN ALL CAPS
*Content type · Room type · Dimensions*

One sentence: the most threatening or arresting thing visible from the doorway (inhabitants \
first). One sentence: a specific sensory anchor — what the room smells of, how the air feels \
(cold, damp, close, a draught), or what can be heard — drawn from the room's Smell, Air and Sound \
lines and made concrete for this room, so players can feel where they are. Bold every element a \
PC might interact with. The ceiling, floor and walls (the Fabric line) and what lies beyond each \
exit are printed for the GM separately: mention them only where they matter to play.

- **Bolded element.** What happens when a PC engages with it. One sentence.
  + Hidden detail uncovered during engagement (only if genuinely rewarding).

≤3 bullets. Only for things that reward interaction — omit bullets entirely if the room \
has nothing worth investigating. Every stat block in the room data ("Stat block:", "Imprisoned \
creature stat block:", "Key NPC stat block") goes verbatim after the bullets — including creatures \
that are bound, asleep, or not yet hostile:

> NAME ×N  AC# HP# ATK ... MV ... AL X LV#
> *Special abilities.*

End every room with an exits line — copy directions, door types, and target room numbers \
exactly from the ROOM TO WRITE data. Format:
*Exits: N [wooden door → Room 3]  ·  E [open archway → Room 7]*
If the room is a dead end, write: *Exits: none*

HARD RULES:
- No atmosphere-only sentences.
- No restating the room type in prose.
- No bullet for anything a PC cannot meaningfully interact with.
- Damage, DCs, and durations must be concrete. Standard DCs only: 9 / 12 / 15 / 18 / 20.
- Never use EMPTY or EMPTY ROOM as the room name. If the content type is empty, derive the \
  heading from the room's actual dominant feature or obstacle.
- If this room has only one exit (a dead end), it must contain either a notable reward \
  (treasure, key information, or a unique item) or a genuinely memorable encounter — \
  a dead end that only punishes exploration without payoff wastes the players' choice.
- Lines starting "GESTALT —" are structural: each describes this room's role in the dungeon's \
  organizing pattern. Every one must be concretely present — as the room's lead image or as a \
  bullet with an interaction — never dropped or reduced to atmosphere. Keep their numbers, checks, \
  and effects exactly; never add deadlines, prerequisites, or limits they do not state.
- If the room has a "Territory:" line, show whose ground it is (their marks, gear, sentries).
- Time is counted in rounds, crawling rounds, or turns — never minutes or hours of exposure. \
  A hazard that wears on the party triggers on entering, on each crawling round spent, or on an action.
- Everything is pre-modern fantasy. Translate any modern or brand-name detail from the room data \
  (ketchup, crayons, pipe tobacco brands, noodle water, lemon pepper, glue guns) into a fitting \
  period equivalent, or drop it.
- Be specific. Room data entries are prompts: resolve every "something", "someone" or "whatever" \
  into a named creature, faction, NPC, or room from this dungeon (the creative brief and its random \
  encounters), and say concretely what happens — how many, from where, how soon, what they do. \
  Never leave the GM to invent what an effect means.
- Pattern names, role tags and design terms are notes for you, not text for the GM: never print \
  "Great Divide", "Power Network", "[crossing]", "[conduit]", "[consumer]", "sight line", \
  "foreshadowing loop", "cycle", or a gestalt line's label in a room. Describe the physical thing \
  (the bridge, the pipes, the grate and what it shows), and state each mechanic once.
- Write the room from inside it. A line that says this room is SEEN FROM another room means \
  that view's subject must be here; never describe the view out of the other room.
- An NPC lives in exactly one room. If a requirement says an NPC is in another room, only refer \
  to them (what they took, what they saw) — never place them here.
- If the room type is "Faction Base", the faction's key NPC must appear in this room \
  with their stat block, even if they are not listed as the stocked monster — place them \
  alongside whatever else is stocked.
- KEY NPC STAT BLOCKS are canonical. Whenever a listed NPC appears in a room with a stat block, \
  copy their block exactly — same AC, HP, ATK, MV, ability modifiers, AL, and LV, no added \
  talents — formatted as: > NAME  AC # HP # ATK ... MV ... S # D # C # I # W # Ch # AL X LV #. \
  Never write a new stat block for them.
- SHADOWDARK MECHANICS — no D&D 5e terminology:
  · Checks use raw attributes only: STR / DEX / CON / INT / WIS / CHA.
    Never write skill names. "DC 12 DEX" not "Stealth DC 12"; "DC 15 WIS" not "Perception DC 15".
  · No saves or saving throws. Write "DC 12 CON or paralyzed", never "CON save DC 12".`;

// ── Per-pass user prompts ─────────────────────────────────────────

// How much story a dungeon can hold (see storyBudget in format-brief.js).
export function storyBudget(brief) {
  const label = brief.match(/^PREMISE: (.+?) — /m)?.[1];
  const premise = PREMISES.find(p => p.label === label)?.id ?? 'contested';
  return budgetFor(parseInt(brief.match(/^SIZE:.*?(\d+) areas/m)?.[1] ?? '12'), premise);
}

const secretsText = b => b.secrets === 0
  ? 'NO secrets to unmask: the mystery is what happened here, and the rooms tell it to players who look'
  : b.secrets === 1 ? 'ONE secret in the whole dungeon (one faction has it; any others have "Secret: none")'
  : 'TWO secrets in the whole dungeon';

const budgetText = b => `\
PREMISE: ${b.premise.label}. ${b.premise.pitch}
${b.premise.guidance}

KEEP IT SIMPLE. This dungeon has ${b.areas} areas — one session of play. Budget:
- ONE central ${b.premise.factions ? 'conflict' : 'mystery or goal'} the players grasp within a few rooms. Everything else supports it.
- ${b.secrets === 0 ? secretsText(b) : `At most ${secretsText(b)}`}.
- ${b.links} cross-room connections.
- Each pattern is one clear, physical thing the players can see and use; don't stack \
mechanisms (no pump that also runs a ward that also holds back a third group).
- Plain, concrete language a GM can read aloud. No invented lore that never reaches the table.
- The whole brief stays under ${b.words} words, not counting the RANDOM ENCOUNTERS tables.

`;

function blueprintPrompt(brief, factionContext) {
  const budget = storyBudget(brief);
  // Encounter zones are the unindented "Zone — " lines under RANDOM ENCOUNTERS.
  const zoneTables = [...brief.matchAll(/^Zone — (.+):$/gm)].map(m => m[1]);
  const factionBlock = factionContext ? `\
SETTING: DOLMENWOOD
Factions must be drawn from — or be specific sub-groups within — the real factions of \
Dolmenwood. You may use a major faction directly, or (encouraged) invent a named cell, \
chapter, splinter, or local branch that gives it a concrete identity tied to this dungeon. \
For example: not "the Drune" but "the Pale Quorum, a rogue Drune circle expelled from the \
cabal for conducting unsanctioned rites on this barrow's hearthstone."

Do NOT invent wholly unconnected factions — every faction must anchor to one of these:

${factionContext}

` : '';

  return `${brief}

---
${factionBlock}\
${budgetText(budget)}Produce a creative brief in EXACTLY this format. Be specific — invent real names and \
details. Do not use generic placeholders.

TITLE: [evocative name]
SUBTITLE: [dungeon type · architecture · size · party level N — N is the PARTY LEVEL from the dungeon data, exactly; never a range or a different number]
CONCEPT: [1 sentence — what this place is and what is happening in it right now]
STORY: [2-3 sentences — ${budget.premise.factions ? 'current situation, faction tensions, approaching crisis' : 'what happened here, what is left, and what makes it dangerous now'}]
WEIRD: [1 concrete inexplicable observable detail — not "eerie atmosphere"]
GESTALT: [${budget.gestaltSentences} sentences, like a dungeon concept pitch: how this theme realizes EACH pattern in \
the GESTALT section — the concrete physical feature, mechanism, or relationship that embodies it, \
and how players can read it and exploit it. Name rooms by number.]

${budget.premise.factions ? `FACTIONS:
[Repeat for each faction:]
NAME: [full in-world name for this faction]
Identity: [who they are, history, personality in 1 sentence]
Goal: [their concrete immediate goal]
Secret: [what they're hiding that would change what the players do — or "none" (see the budget)]
Key NPC: [Name — trait. What they want from the party when they meet.]
Toward PCs: [one word disposition + one sentence reason]
` : `FACTIONS: none
`}
RANDOM ENCOUNTERS (2d4. Follow the dungeon data's RANDOM ENCOUNTERS exactly — same rows, numbers, \
zones and creatures — and make every line specific to this theme. An omen is what the party sees, hears \
or smells 1d4 rounds before THAT event, specific enough that they can prepare, hide or run — never \
"you hear something". Rows 2 and 8 are the dungeon's two one-time escalations: big, story-changing \
events, each with an aftermath saying how the dungeon is different afterwards. Give each zone's rows \
the character of that zone. Dungeon-wide events stay on the check die's 6 as given):
Dungeon-wide, once each:
2: [event] | Omen: [sign] | After: [how the dungeon is changed]
8: [event] | Omen: [sign] | After: [how the dungeon is changed]
${zoneTables.length
  ? `[One block per encounter zone — exactly these ${zoneTables.length}, by their names and rooms: ${zoneTables.join('; ')}]`
  : '[Exactly ONE block, headed "Everyday encounters:" — this dungeon has a single table, whatever zones its layout has]'}
3: [event]
4: [event] | Omen: [sign]
5: [event]
6: [event] | Omen: [sign]
7: [event]

ENTRANCE: [2 sentences — what the party sees approaching and entering]

PRIZE: Room N — [1-2 sentences: what lies behind the dungeon's final lock or at the factions' goal, \
concretely (what it is, what it's worth or does), and what happens to the story when someone takes it. \
N is the room holding it.]

CROSS-ROOM CONNECTIONS (${budget.links} specific links):
- Room X → Room Y: [specific object, info, or NPC that links them. An NPC is in Room X only; Room Y holds what they point to]

GESTALT IN ROOMS (one line per room. The ROOMS data already assigns gestalt roles on lines starting \
"GESTALT —" — keep every one of those rooms and roles and make each specific to this theme. \
${budget.extraRooms ? 'Add 1-2 more rooms per pattern only where needed so players can learn it' : 'Add no other rooms'}; for patterns with \
no assigned rooms, choose ${budget.extraRooms ? '2-4' : '2'} rooms whose exits and contents fit):
- Room N — [Pattern name]: [the specific feature, clue, or mechanism in this room that lets players perceive or exploit the pattern]`;
}

// Four focused preamble prompts — one per section — so each call is small
// enough that Haiku writes it all as direct text with no thinking overhead.
const PREAMBLE_CTX = (blueprint, brief) =>
  `CREATIVE BRIEF:\n${blueprint}\n\nDUNGEON DATA (for reference):\n${brief}\n\n---\n`;

function overviewPrompt(blueprint, brief) {
  return `${PREAMBLE_CTX(blueprint, brief)}\
Write ONLY the opening three lines of the module — nothing else:
1. # TITLE  (an evocative name drawn from the creative brief)
2. *Subtitle: dungeon type · architecture · size · party level N* (N = the PARTY LEVEL in the dungeon data, exactly)
3. A four-line overview block using exactly these bold labels on separate lines:
   **The Concept:** one sentence.
   **The Story:** 2-3 sentences restating the brief's STORY — the current situation and approaching crisis. \
Invent nothing: no secrets, plots, or facts that are not in the creative brief.
   **The Weird:** one concrete, arguable inexplicable detail.
   **Danger Level:** the DANGER LEVEL line from the dungeon data, verbatim.

Output these items and nothing else. No ## headings, no extra prose.`;
}

function factionsPrompt(blueprint, brief) {
  // No factions: the same slot describes what lives here instead.
  if (/^## FACTIONS\nNone\./m.test(brief)) return `${PREAMBLE_CTX(blueprint, brief)}\
Write ONLY a ## What Lives Here section.

Start with: ## What Lives Here

Nobody holds this place. In 3-5 bullets, name the creatures and dangers a party meets here — \
wildlife, vermin, guardians, things that moved in — with the rooms where each is found and one \
sentence on how it behaves (what it wants, what drives it off, whether it can be avoided). Use only \
creatures in the dungeon data.

Nothing before or after the section.`;
  return `${PREAMBLE_CTX(blueprint, brief)}\
Write ONLY the ## Factions section.

Start with: ## Factions

For each faction: a bold header with its full in-world name, then a short paragraph \
covering its identity, goal, secret (only if the creative brief gives it one — never invent one), and key NPC (name, trait, current location). \
Close with one sentence on their disposition toward the PCs.

Nothing before or after the ## Factions section.`;
}

function encountersPrompt(blueprint, brief) {
  // Zone tables are unindented "Zone — " lines (the gestalt's zones are indented).
  const zoned = /^Zone — /m.test(brief);
  // Every table is whole: a GM rolling on a section's table finds every result
  // in it, so the two dungeon-wide escalations repeat in each.
  const tables = zoned ? `\
Then, for each zone in the blueprint, a bold line with the zone's name and rooms and a complete table \
| 2d4 | Event | Omen (doubles) | with rows 2–8 in order: that zone's rows 3–7, and the blueprint's \
dungeon-wide rows 2 and 8 in every zone's table, each starting "**Once (whole dungeon).**" and ending \
"*After:* [aftermath]".` : `\
Then one markdown table | 2d4 | Event | Omen (doubles) | with rows 2–8 in order. Rows 2 and 8 start \
"**Once.**" and end "*After:* [aftermath]".`;
  return `${PREAMBLE_CTX(blueprint, brief)}\
Write ONLY the ## Random Encounters section.

Start with: ## Random Encounters

Then one line in italics giving the danger level and the check, exactly as the RANDOM ENCOUNTERS \
heading in the dungeon data states it.${tables}
Use the blueprint's RANDOM ENCOUNTERS, same numbers; the Omen cell is blank for rows without one. \
Keep each cell to one sentence, and keep creature counts and stat references.

Nothing before or after the section.`;
}

function entrancePrompt(blueprint, brief) {
  return `${PREAMBLE_CTX(blueprint, brief)}\
Write ONLY the ## Entrance section.

Start with: ## Entrance

Then 2-3 tight sentences describing what the party sees approaching and stepping inside. \
Lead with the most arresting or threatening thing visible. Bold any interactable element.

Nothing before or after the ## Entrance section.`;
}

// Blueprint lines (cross-room connections, gestalt-in-rooms, the prize) that
// name this room — the room writer must deliver them and the editor must not
// cut them. Each line belongs to the room it is about: a gestalt line to the
// room it leads with (the room it merely mentions is told it is seen from
// there), a connection's NPC to its source room (the far end gets only what
// the link points to).
export function roomRequirements(blueprint, num) {
  const out = [];
  let section = null;
  const roomRe = new RegExp(`\\bRooms?\\s+(?:\\d+\\s*(?:,|and|&)\\s*)*${num}\\b`);
  for (const raw of blueprint.split('\n')) {
    const line = raw.replace(/\*\*/g, '').trim();
    const header = line.match(/^([A-Z][A-Z \-]+?)(?:\s*\(.*\))?:/);
    if (header && !line.startsWith('-')) {
      section = header[1].trim();
      if (section === 'PRIZE' && leadRoom(line.slice(header[0].length)) === num) out.push(`PRIZE${line.slice(header[0].length - 1)}`);
      continue;
    }
    if (!line.startsWith('-') || !roomRe.test(line)) continue;
    const item = line.replace(/^-\s*/, '');
    if (section === 'GESTALT IN ROOMS') {
      const lead = leadRoom(item);
      out.push(lead === null || lead === num ? item
        : `SEEN FROM Room ${lead} (${item}) [NOTE TO YOU, not text for the room: whatever that room sees of this one must be here; write this room from inside it.]`);
    } else if (section === 'CROSS-ROOM CONNECTIONS') {
      const link = item.match(/^Rooms?\s+(\d+)\s*(?:→|->)\s*Rooms?\s+(\d+)/);
      const [from, to] = link ? [parseInt(link[1]), parseInt(link[2])] : [num, null];
      out.push(from === num ? item
        : to === num ? `${item} [NOTE TO YOU, not text for the room: this is the far end of the link — put here only what it points to; a person it names stays in Room ${from}.]`
        : `${item} [NOTE TO YOU, not text for the room: this link only mentions Room ${num} — put here what it says is here, and nobody from it.]`);
    }
  }
  return out;
}

const leadRoom = text => {
  const m = text.match(/^\s*Rooms?\s+(\d+)\b/);
  return m ? parseInt(m[1]) : null;
};

function requirementsBlock(reqs) {
  return reqs.length
    ? `REQUIRED IN THIS ROOM (from the creative brief — each must be concretely present and interactable):\n${reqs.map(r => `- ${r}`).join('\n')}\n\n`
    : '';
}

function roomPrompt(blueprint, roomSection, adjacentRooms, num, keyNpcs = '') {
  const adjBlock = adjacentRooms.length
    ? `ADJACENT ROOMS (already written — cross-reference naturally where it adds value):\n\n${adjacentRooms.join('\n\n')}\n\n`
    : '';
  return `CREATIVE BRIEF (for coherence — do not quote verbatim):
${blueprint}

${adjBlock}${keyNpcs ? `${keyNpcs}\n\n` : ''}${requirementsBlock(roomRequirements(blueprint, num))}ROOM TO WRITE:
${roomSection}

---
Write this room entry. Follow the format exactly. Be extremely terse — two tight sentences \
of prose maximum, bullets only for interactable elements. Cut anything that doesn't help a \
GM run this room at the table.`;
}

// ── Editorial system prompt ───────────────────────────────────────

const EDITOR_SYS = `\
You are a brutal dungeon editor for Shadowdark RPG. You receive a complete drafted module \
and return the full revised text — tighter, leaner, and immediately usable at the table. \
You edit; you do not comment or explain.

PROSE RULES (enforce strictly):
- Two sentences maximum of visible-from-the-doorway prose per room.
- First sentence leads with the most immediately threatening or arresting thing present — \
inhabitants first, then hazards, then atmosphere. Never atmosphere first.
- Second sentence: one sensory detail that could only exist in this specific room.
- Cut any sentence that only establishes mood without giving the GM something concrete.
- Bold every interactable element inline. Unobservable or untouchable things are not bolded.

BULLET RULES:
- A bullet exists only if a PC can meaningfully interact with that element and something \
happens as a result. Pure description does not earn a bullet.
- One tight sentence per bullet. A sub-bullet (+) only if interaction reveals something hidden.
- Maximum 3 bullets per room. Cut the weakest if there are more.

MECHANICS:
- Every trap, hazard, trick, and obstacle must have a concrete mechanical effect.
- Only Shadowdark standard DCs: 9 / 12 / 15 / 18 / 20. No other values.
- Damage expressions, durations, and check results must be explicit.
- Stat blocks: copy verbatim, alter nothing — except movement and alignment written in another \
  system's terms: movement is MV close / near / far (MV 20 ft or less → close; 30–40 → near; \
  60+ → far; flying → MV near (fly)), alignment is AL L / N / C.
- Damage has no types: "2 psychic damage" → "2 damage".
- Time is counted in rounds, crawling rounds, or turns — never minutes or hours of exposure. \
  A hazard that wears on the party triggers on entering, on each crawling round spent, or on an action.
- Everything is pre-modern fantasy. Translate any modern or brand-name detail \
  (ketchup, crayons, pipe tobacco brands, noodle water, lemon pepper, glue guns) into a fitting \
  period equivalent, or drop it.
- Pattern names, role tags and design terms are notes for you, not text for the GM: never print \
  "Great Divide", "Power Network", "[crossing]", "[conduit]", "[consumer]", "sight line", \
  "foreshadowing loop", "cycle", or a gestalt line's label in a room. Describe the physical thing \
  (the bridge, the pipes, the grate and what it shows), and state each mechanic once.
- Never make a specific detail vaguer, and never introduce "something" or "someone" in place of \
  a named creature, person, or place.
- SHADOWDARK TERMINOLOGY — correct any D&D 5e language you find:
  · Checks reference raw attributes only: STR / DEX / CON / INT / WIS / CHA.
    Rewrite any 5e skill names: "Perception DC 15" → "DC 15 WIS"; "Stealth check" → "DEX check";
    "Athletics" → "STR"; "Investigation" → "INT"; "Persuasion/Deception/Intimidation" → "CHA".
  · No saves or saving throws of any kind. Rewrite on sight:
    "DEX save DC 12" → "DC 12 DEX or [effect]"; "CON saving throw" → "DC X CON or [effect]".

STRUCTURE:
- Preserve every ## and ### heading exactly as written (including room numbers and names).
- Preserve stat block blockquote format (> lines).
- Preserve the *Exits:* line verbatim — never edit, reorder, or remove exit information.
- If any ### Room heading contains the word EMPTY, replace it with a descriptive name \
  derived from the room's actual content (its dominant feature, obstacle, or atmosphere).
- If the GM section contains a ## Key NPCs entry that names an NPC in a specific room, \
  verify that NPC appears in the corresponding room entry; if absent, add one sentence \
  placing them in the room.
- Preamble: factions need a concrete current goal. Keep each faction's secret exactly as \
  written; a faction without one stays without one — never invent secrets, plots, or facts. \
  Random encounter entries must be playable with no extra prep.
- Do not add new content beyond the two structural checks above. Cut and tighten existing content.
- Do not add meta-commentary, editor's notes, or explanations — revised text only.`;

// Editorial prompts — kept small so each call completes quickly.
// Rooms don't need blueprint context: stocking-criteria checks are local.
// Preamble gets just the title/concept line so faction edits stay on-setting.

function editorialPreamblePrompt(blueprint, section) {
  const oneLiner = blueprint.split('\n').find(l => l.startsWith('CONCEPT:')) ?? '';
  const ctx = oneLiner ? `Context: ${oneLiner}\n\n` : '';
  return `${ctx}Edit the following preamble section to be tight and specific. \
Apply all criteria. Return only the revised text — no commentary, no new headings.\n\n${section}`;
}

function editorialRoomPrompt(roomText, reqs = [], keyNpcs = '') {
  const keep = reqs.length
    ? `This room carries the following structural content from the module design. Keep it — \
tighten the wording if needed, but never cut it:\n${reqs.map(r => `- ${r}`).join('\n')}\n\n`
    : '';
  return `${keep}${canonicalNpcRule(keyNpcs)}Edit the following room entry against the criteria. \
Return only the revised room entry — preserve the ### heading exactly.\n\n${roomText}`;
}

// Editor instruction: force any drifted Key NPC stat block back to canonical.
function canonicalNpcRule(keyNpcs) {
  return keyNpcs
    ? `${keyNpcs}\nIf this text contains a stat block for any NPC listed above, its AC, HP, ATK, MV, \
ability modifiers, AL, and LV must match the canonical block exactly, with no added talents — \
correct any that differ.\n\n`
    : '';
}

// ── Specificity pass ──────────────────────────────────────────────
// The stocking tables are GM prompts ("something in the dungeon is drawn to
// the scent"). A room that still says "something" after editing goes back,
// with the creative brief, to be made concrete.

// "whoever carries it" names a role, not a mystery, so only these count.
const VAGUE_RE = /\b(something|someone|somebody)\b|\bwhatever (caused|did|made|lives|left|placed|waits)\b/i;

// A curse mentioned without saying what it does.
const UNSTATED_CURSE_RE = /\bcurse(s|d)?\b/i;

// Prose and bullet sentences that leave the GM to invent who or what.
// Also flags design jargon: a gestalt role tag ("[crossing]"), a pattern name
// passed in `terms` (this room's gestalt patterns), or "foreshadowing loop".
export function vagueSpots(roomText, terms = []) {
  const jargon = new RegExp([
    '\\[(?:[a-z]+[ -]?){1,3}\\]', 'foreshadowing loop', 'sight line',
    ...terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  ].join('|'), 'i');
  return roomText.split('\n')
    .filter(l => !/^\s*(>|#|\*Exits:)/.test(l))
    .flatMap(l => l.split(/(?<=[.;!?])\s+/))
    .filter(x => VAGUE_RE.test(x) || jargon.test(x)
      || UNSTATED_CURSE_RE.test(x) && !/\d|DC|disadvantage/i.test(x))
    .map(x => x.replace(/^\s*[-+]\s*/, '').trim());
}

const SPECIFY_SYS = `\
You make Shadowdark dungeon room entries specific enough to run with no prep. You receive one room \
entry, the module's creative brief, and the list of rooms. Some sentences leave the GM to invent \
who or what is meant ("something in the dungeon is attracted to it", "someone placed it here", \
"whatever caused it is still active", "its curse falls on the taker").

A flagged sentence may instead print design jargon — a pattern name ("Great Divide", "Power \
Network"), a role tag ("[crossing]", "[consumer]"), "sight line" or "foreshadowing loop". Rewrite \
it as the physical thing the party sees and uses, keeping its numbers; if it only repeats a \
mechanic stated elsewhere in the room, delete it.

Rewrite each vague flagged sentence so it names exactly who or what: one creature, faction, NPC, or room \
from THIS dungeon — prefer ones already in the creative brief and its random encounters — and \
states the one concrete thing that happens (how many, from which room, how soon, what they do). \
Use crawling rounds or turns for time, standard DCs (9/12/15/18/20) for checks.

Stay consistent: who is where comes from the KEY NPCS block and the brief — never move an NPC or \
faction. When several flagged sentences are about the same thing (one curse, one mystery \
creature), decide one answer, state it in full once, and have the other sentences refer back to it. Stay short: each rewritten \
sentence is no longer than the original plus about 25 words; no new mechanics beyond the one answer. \
If a flagged sentence is already specific (an ordinary use of the word), leave it exactly as is.

Change nothing else: keep the ### heading, the italic type line, every other sentence, the stat \
blocks and the *Exits:* line exactly. Return only the full room entry.`;

function specifyPrompt(blueprint, roomText, spots, roomList, keyNpcs = '', roomData = '') {
  return `CREATIVE BRIEF:\n${blueprint}\n\n${keyNpcs ? `${keyNpcs}\n\n` : ''}ROOMS:\n${roomList}\n\n\
${roomData ? `ROOM DATA (the generator's stocking for this room — where it already answers a flagged sentence, use its answer):\n${roomData}\n\n` : ''}---\nFLAGGED SENTENCES:\n${spots.map(x => `- ${x}`).join('\n')}\n\nROOM ENTRY:\n${roomText}`;
}

// ── Plain-words sweep ─────────────────────────────────────────────
// The last pass: any sentence anywhere in the module that still uses the
// generator's design vocabulary goes back to be said in the dungeon's terms.

const escapeRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const DESIGN_TERMS = new RegExp([
  '\\bgestalts?\\b', '\\bfaction base\\b', '\\bzones?\\b', '\\bforeshadowing loop\\b', '\\bsight ?lines?\\b',
  '\\block[- ]and[- ]key\\b', '\\bratchet', '\\bmodule design\\b', '\\bstructural\\b',
  // Multi-word pattern and cycle names (one-word ones, like Countdown, are ordinary words too).
  ...[...ALL_GESTALTS.map(g => g.name), ...CYCLES.map(c => c.name)].filter(n => /\s/.test(n)).map(n => `\\b${escapeRe(n)}\\b`),
].join('|'), 'i');

export function jargonSpots(text) {
  return (text ?? '').split('\n')
    .filter(l => !/^\s*(>|#)/.test(l))
    .flatMap(l => l.split(/(?<=[.;!?])\s+/))
    .filter(x => DESIGN_TERMS.test(x))
    .map(x => x.replace(/^\s*[-+|]\s*/, '').trim());
}

const SWEEP_SYS = `\
You make one section of a Shadowdark dungeon module read as a finished, published product. Some \
flagged sentences still use the generator's design vocabulary (gestalt, zone, faction base, sight \
line, foreshadowing loop, lock and key, ratchet, a pattern's name like "Vertical Spine"). Rewrite \
each flagged sentence in the dungeon's own terms — say what the thing is (the stair and the well, \
the long way round, the gate that seals behind you) — keeping every fact, number, room reference \
and check. A bold label that is a pattern name becomes a plain name for the thing. If a flagged \
sentence uses a word in its ordinary sense, leave it as is.

Change nothing else: keep every heading, table, stat block, exits line and other sentence exactly. \
Return only the full section.`;

const sweepPrompt = (text, spots) => `FLAGGED SENTENCES:\n${spots.map(x => `- ${x}`).join('\n')}\n\nSECTION:\n${text}`;

// ── What lies beyond each door ────────────────────────────────────
// One call over the finished rooms: what someone standing outside each
// room's doors would hear, smell, see or feel — so a clue at a door matches
// what the writer actually put behind it (a forge's hammering, floodwater).

const BEYOND_SYS = `\
You write, for each room of a dungeon module, what a party standing OUTSIDE one of its doors \
would sense of it — a sound, a smell, light under the door, heat, cold, damp, a draught. \
It must match the room as written. Never give away a trap, a hidden thing, treasure, or anything \
that can't be heard, smelled or seen through a door; a room with a trap reads like any quiet room \
(its air, its smell). A sleeping creature is slow breathing. At most 12 words, lower case, no \
final full stop.

Output one line per room and nothing else, exactly: N: what is sensed`;

function beyondPrompt(roomTexts) {
  return `ROOMS:\n\n${roomTexts.map(([n, t]) => t.replace(/^\*Exits:[\s\S]*$/m, '').trim()).join('\n\n')}\n\n---\nOne line per room, "N: what is sensed", for Rooms ${roomTexts.map(([n]) => n).join(', ')}.`;
}

export function parseBeyond(text, nums) {
  const out = {};
  for (const m of (text ?? '').matchAll(/^\s*(?:Room\s+)?(\d+)\s*[:—-]\s*(.+?)\s*\.?\s*$/gm)) {
    if (nums.includes(parseInt(m[1]))) out[m[1]] = m[2].replace(/^\*|\*$/g, '');
  }
  return out;
}

// ── GM section system prompt ──────────────────────────────────────

const GMSECTION_SYS = () => `\
${PLAIN_WORDS}

You are writing the GM reference block for a Shadowdark RPG dungeon module. \
The GM reads this before the session; players never see it. Generate all five sections below IN ORDER.

CRITICAL: Do NOT output a top-level # heading. Begin your output directly with ## What's Really Going On.

---

## What's Really Going On
4-6 bullets. Each bullet must:
- Answer one of: What do the factions actually want and why? What secret is hidden from obvious view? \
  What will surprise even a prepared party? What happens if the PCs do nothing?
- Reference a specific room number, named NPC, or named faction.
- End with a discovery note in this format: → Room N: [how players can discover this — NPC dialogue / \
  a specific letter / an environmental clue / etc.]. If not discoverable by players, note that too.
- Be one tight sentence plus the discovery note. No vague atmospheric statements.

---

## How the Dungeon Works
One bullet per pattern in the creative brief's GESTALT — the dungeon's organizing structure. Each bullet:
- Starts with a short bold name for what it IS in this dungeon ("The Stair and the Well", "Fire \
  Holds Them Back") — never the pattern's own name — then one sentence on how it works here \
  (the concrete feature, mechanism, or relationship — not the abstract definition).
- One sentence on how players can exploit or change it.
- Ends with the rooms where players can learn it: → Room N, Room M: [the clue in each].
Use only room numbers that appear in the brief's GESTALT IN ROOMS lines or the room summary.
For a pattern listed under HOW THE DUNGEON CHANGES, state its mechanics exactly as given there \
(clock length, states, thresholds, capacities, routes) — do not invent different numbers or rooms.
If HOW THE DUNGEON FLOWS is given, add one bullet per cycle it lists (a bold name for what it is here — \
"The Long Way Round", not "Foreshadowing loop" — the rooms it spans, what blocks the way and how players \
get past) and state every lock and key with its exact rooms.

---

## Key NPCs
One entry for every NPC in KEY NPC STAT BLOCKS, then one for any other named NPC from the creative \
brief (primary antagonist, any named figure) who does not already have a stat block in a room.
For NPCs in KEY NPC STAT BLOCKS, the stat block line uses that block's numbers exactly — same AC, HP, \
ATK, MV, ability modifiers, AL, and LV — and has NO ability line: their leverage (a secret, a ledger) \
belongs in the personality or Tactics sentence, never as an invented talent.

Format per entry:
**NAME** (Room N or Roaming [area]) — one sentence on personality and current mental state. \
Tactics: one sentence on how they fight or negotiate under pressure.
> NAME  AC# HP# ATK [attack] +# ([damage])  MV near  S +# D +# C +# I +# W +# Ch +#  AL [L/N/C]  LV #
> *Up to two special abilities, each one sentence — only for NPCs not in KEY NPC STAT BLOCKS, and only real \
combat or exploration abilities with a concrete effect (a number, a DC, a duration) — not what they know \
or a vague risk.*

Where an NPC is: a named NPC who appears in a room of the room summary is listed with that room and \
uses the stat block that room gives them (a named spawn in Room 12 has Room 12's VAMPIRE SPAWN block, \
not a new one). An NPC who is never in the dungeon (a buyer in town, an absent patron) gets one line \
and NO stat block. Any other NPC with a stat block must be placed: a room number, or "Roaming" with \
the rooms of their route.

For NPCs not in KEY NPC STAT BLOCKS and not in a room, use Shadowdark Quick Combat Statistics benchmarks for the NPC's level:
LV 1: AC 12 HP 4 ATK +1 (1d6) | LV 2: AC 13 HP 8 ATK +2 (1d6) | LV 3: AC 13 HP 12 ATK +3 (1d8) \
| LV 4: AC 14 HP 16 ATK +4 (1d8) | LV 5: AC 15 HP 20 ATK +5 (1d10) | LV 6+: scale up accordingly.


---

## Tension & Timing
If the dungeon has a countdown device, ticking mechanism, cycle, pulse, or imminent deadline in its \
concept or GESTALT (e.g. a Countdown, Cycle of States, or Random Pulse pattern). When HOW THE DUNGEON \
CHANGES gives a Countdown clock, copy its turn count, its three signs (as the warnings), its at-zero \
consequence, and its intervention room exactly:
- **Time remaining:** [specific amount — e.g., 6 exploration turns, 4 hours, 3 days]
- **Half-time warning:** [one specific observable sign the players notice at ~halfway]
- **Final warning:** [one escalating sign near zero]
- **At zero:** [the concrete consequence — one sentence]
- **Intervention:** [one way players can delay or stop it — or "Cannot be stopped."] When HOW THE \
  DUNGEON CHANGES states an intervention, copy its room, cost, check, effect, and whether it can stop \
  the clock exactly. Never add deadlines, prerequisites, or limits it does not state.

If this dungeon has no countdown element, omit this section entirely — do not write it.

---

## Treasure
Shadowdark XP rule: 1 gp = 1 XP. Target total for this dungeon: (party level × room count × 15) gp, using the party level in the creative brief's SUBTITLE.
List specific treasure placements for rooms that currently have no loot in the room summaries. \
Prioritize dead ends, empty rooms, and monster rooms with no listed valuables.

Format per entry: Room N — [specific item or coin amount], [gp value].
Close with: **Total: ~X gp across Y rooms.** Never print the target or how it was worked out — \
just the placements and the total.`;

// Words from the generator's design vocabulary that never reach the page.
const PLAIN_WORDS = `\
Write for the GM at the table, in the dungeon's own terms. Never use the generator's design \
vocabulary: "gestalt", "pattern", "cycle", "zone", "faction base", "territory", "sight line", \
"foreshadowing loop", "lock and key", "ratchet", "spine", or a pattern's name (Vertical Spine, \
Great Divide, Hidden Shortcut, Attraction or Repulsion…). Say what the thing is: the stair and the \
well, the long way round, the gate that seals behind you, fire holds them back.`;

// ── Hooks & Rumors system prompt ─────────────────────────────────

const HOOKS_SYS = `\
${PLAIN_WORDS}

You are writing the Adventure Hooks and Rumors section for a Shadowdark RPG dungeon module.

ADVENTURE HOOKS (2-3 items):
- One sentence each. Pull the party in without revealing what's inside.
- Lead with the most immediately actionable hook (a job, a missing person, a bounty).
- Each hook implies a concrete reward or urgent reason to act now; a payment is a sum in gp.
- Every person, object, or place a hook or rumor names must exist in this module (the creative \
  brief, its NPCs, or the room summary) — never send the party after something that isn't there.

RUMORS (5 items, table format):
- Exactly 2 true, 2 false, 1 partially true. A PARTIALLY TRUE rumor states one true fact AND one \
  specific false detail (wrong place, wrong person, wrong reason) — a rumor that is simply true, or \
  merely unconfirmed, is TRUE. After the table, add **Notes for the GM** with one bullet saying which \
  part of the partially true rumor is false.
- Each rumor is one tight sentence the party might hear in a nearby settlement.
- Write in player-facing language — no room numbers. Describe locations as an NPC would: "the altar beneath the hill", "the locked vault at the dungeon's heart", "the chamber where the old king was buried".
- Reference faction names, named NPCs, or evocative features — never "Room N".
- No rumor may be purely atmospheric — each must imply something the party could act on.
- At least two TRUE rumors must hint at how the dungeon is organized or how it changes (the \
  creative brief's GESTALT) — e.g. "every passage leads back to one great hall", "the wards are failing".
  Players who listen should be able to anticipate the dungeon's structure.

Output format:
## Adventure Hooks
1. ...
2. ...
3. ...

## Rumors
| # | Rumor | Accuracy |
|---|-------|----------|
| 1 | ...   | TRUE     |
...`;

// ── Pass 4 helpers ────────────────────────────────────────────────

// Builds a compact one-line-per-room summary so Pass 4 prompts can reference room numbers.
function buildRoomSummary(rooms, written) {
  return rooms
    .filter(r => written.has(r._roomNumber))
    .map(r => {
      const text = written.get(r._roomNumber) ?? '';
      const desc = text.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('>')) ?? '';
      return `Room ${r._roomNumber} (${r.contentType}): ${desc.trim().slice(0, 120)}`;
    })
    .join('\n');
}

// The room's GESTALT lines from its brief section, as must-keep requirements.
export function gestaltLines(roomSection) {
  return (roomSection ?? '').split('\n')
    .map(l => l.match(/^GESTALT — (.+?) \[(.+?)\]: (.+)$/))
    .filter(Boolean)
    .map(([, pattern, role, note]) => ({ pattern, role, note }));
}

// Every stat block the room's data carries: { name, block }.
function roomStatBlocks(roomSection) {
  const out = [];
  let name = null;
  for (const raw of (roomSection ?? '').split('\n')) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^(?:Monster|Creature|Imprisoned creature): (.+?)(?: ×\d+)?(?: — .*)?$/))) name = m[1];
    else if ((m = l.match(/^(?:Imprisoned creature )?[Ss]tat block: (.+)$/)) && name) out.push({ name, block: m[1] });
    else if ((m = l.match(/^Key NPC stat block \(copy exactly\): (.+?) — (.+)$/))) out.push({ name: m[1], block: m[2] });
  }
  return out;
}

// The check rule is mechanics, not prose: put the brief's DANGER LEVEL line
// back verbatim in the overview and under the encounters heading, however the
// writer or editor shortened it.
// The overview as published: the subtitle in title case ("Crypt · Luxurious
// · Large (22 areas) · party level 3"), and each bold label — The Concept,
// The Story, The Weird, Danger Level — its own small heading over its own
// paragraph, rather than four lines run together into one.
export function overviewHeadings(text) {
  if (!text) return text;
  return text
    .replace(/^\*([^*\n]+)\*[ \t]*$/m, (line, inner) => `*${inner.split(' · ').map(p => /^party level/i.test(p) ? p : p.replace(/^./, c => c.toUpperCase())).join(' · ')}*`)
    .replace(/^\*\*([^*:\n]+):\*\*[ \t]*/gm, '\n#### $1\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The rooms, and the encounters section, as published. When the encounters
// section holds one table per zone (each under a bold "Section 1 (Rooms 1,
// 3, 7)" line), the rooms are grouped by zone — each zone a "## Section"
// with its own encounter table, then its rooms — and the encounters section
// keeps only the check rule. Otherwise: one "## Rooms" in number order.
export function sectionByZone(encountersMd, roomTexts) {
  const byNumber = [...roomTexts.keys()].sort((a, b) => a - b);
  const plain = { encounters: encountersMd, rooms: `## Rooms\n\n${byNumber.map(n => roomTexts.get(n)).join('\n\n')}` };
  if (!encountersMd) return plain;
  const heads = [...encountersMd.matchAll(/^\*\*([^*\n]+?)\*\*[ \t]*$/gm)]
    .map(m => ({ m, rooms: (m[1].match(/Rooms?\s+([\d,\s]+(?:and\s+\d+)?)/i)?.[1] ?? '').match(/\d+/g)?.map(Number) ?? [] }))
    .filter(h => h.rooms.length);
  if (heads.length < 2) return plain;
  const blocks = heads.map((h, i) => ({
    title: h.m[1].trim(),
    rooms: h.rooms.filter(n => roomTexts.has(n)),
    table: encountersMd.slice(h.m.index + h.m[0].length, heads[i + 1]?.m.index ?? encountersMd.length).trim(),
  }));
  // Numbered sections in their own order ("Section 1", "Section 2"…), else by first room.
  const num = b => parseInt(b.title.match(/^section\s+(\d+)/i)?.[1] ?? '', 10);
  blocks.sort(blocks.every(b => !isNaN(num(b))) ? (a, b) => num(a) - num(b) : (a, b) => Math.min(...a.rooms) - Math.min(...b.rooms));
  const placed = new Set(blocks.flatMap(b => b.rooms));
  const cap = t => t.replace(/^./, c => c.toUpperCase());
  const sectionsMd = blocks.map(b => [
    `## ${/^section\b/i.test(b.title) ? cap(b.title) : `Section: ${cap(b.title)}`}`,
    `#### Random Encounters\n\n${b.table}`,
    ...b.rooms.sort((x, y) => x - y).map(n => roomTexts.get(n)),
  ].join('\n\n'));
  const strays = byNumber.filter(n => !placed.has(n));
  if (strays.length) sectionsMd.push(`## Other Rooms\n\n${strays.map(n => roomTexts.get(n)).join('\n\n')}`);
  const rule = encountersMd.slice(0, heads[0].m.index).trim();
  return {
    encounters: `${rule}\n\nEach section's table is printed at the start of that section, with its rooms.`,
    rooms: sectionsMd.join('\n\n'),
  };
}

// A preamble section whose heading the editor dropped gets it back.
export function withHeading(text, has, heading) {
  if (!text) return text;
  return has.test(text) ? text : `${heading}\n\n${text.trim()}`;
}

export function enforceDangerLine(text, brief) {
  const rule = brief.match(/^DANGER LEVEL:\s*(.+)$/m)?.[1]?.trim();
  if (!text || !rule) return text;
  return text
    .replace(/^(\*\*Danger Level:\*\*).*$/m, `$1 ${rule.replace(/the table below/, "the Random Encounters table")}`)
    .replace(/^(## Random Encounters\s*\n+)\*[^\n]*\*[ \t]*$/m, `$1*${rule}*`);
}

// The GM section's fixed parts: every Key NPC's stat line is put back to the
// canonical block with no invented ability line, and a treasure "Target:"
// calculation never reaches the page.
// `roomTexts`: Map of room number → final room text. A named NPC the GM
// section places in a room takes that room's stat block for them: one whose
// name is theirs, or the room's only one when the room's text names them.
export function enforceGmSection(text, brief, roomTexts = null) {
  if (!text) return text;
  if (roomTexts) text = roomStatBlocksForNpcs(text, roomTexts);
  const canon = [...keyNpcBlock(brief).matchAll(/^- (.+?) \([^)]*\): (AC .+)$/gm)].map(([, name, block]) => ({ name, block }));
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const named = l => canon.find(c => l.replace(/^>\s*\**/, '').toLowerCase().startsWith(c.name.toLowerCase()));
    let npc = /^>\s/.test(lines[i]) && /\bAC\s*\d/.test(lines[i]) && named(lines[i]);
    // "> Name" on its own line, stats on the next
    if (!npc && /^>\s*\**[^*\d]+\**\s*$/.test(lines[i]) && /^>\s*AC\s*\d/.test(lines[i + 1] ?? '')) {
      npc = named(lines[i]);
      if (!npc) {   // another named NPC: just join its name and stats on one line
        out.push(`> ${lines[i].replace(/^>\s*|\*/g, '').trim()}  ${lines[i + 1].replace(/^>\s*/, '').replace(/,\s*/g, ' ')}`);
        i++;
        continue;
      }
      i++;
    }
    if (npc) {
      out.push(`> ${npc.name}  ${npc.block.replace(/,\s*/g, ' ')}`);
      while (/^>\s*\*[^*]/.test(lines[i + 1] ?? '')) i++;   // drop its ability lines
      continue;
    }
    if (/^\s*\**Target\b[^\n]*gp/i.test(lines[i])) continue;
    out.push(lines[i]);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function roomStatBlocksForNpcs(text, roomTexts) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Never in the dungeon (a buyer in town): no stat block.
    if (/^\*\*[^*]+\*\*\s*\([^)]*\b(off-site|in town|outside the dungeon|absent)\b/i.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && !/^\*\*/.test(lines[j])) {
        if (/^>\s/.test(lines[j])) lines.splice(j, 1); else j++;
      }
      continue;
    }
    const head = lines[i].match(/^\*\*([^*]+)\*\*\s*\(Room (\d+)\b/);
    if (!head) continue;
    const name = head[1].trim(), room = roomTexts.get(parseInt(head[2]));
    if (!room) continue;
    const blocks = room.split('\n').map((l, k, all) => /^>\s*[A-Z]/.test(l) && /\bAC\s*\d/.test(l) ? { line: l, abil: /^>\s*\*/.test(all[k + 1] ?? '') ? all[k + 1] : null } : null).filter(Boolean);
    const own = blocks.find(b => b.line.replace(/^>\s*/, '').toUpperCase().startsWith(name.toUpperCase()));
    const only = blocks.length === 1 && new RegExp(`\\b${name.split(/\s+/)[0]}\\b`, 'i').test(room) ? blocks[0] : null;
    const use = own ?? only;
    if (!use) continue;
    // The entry's stat block: the first "> … AC" line after the heading, and its ability lines.
    let j = i + 1;
    while (j < lines.length && !/^\*\*/.test(lines[j]) && !(/^>\s/.test(lines[j]) && /\bAC\s*\d/.test(lines[j]))) j++;
    if (j >= lines.length || /^\*\*/.test(lines[j])) continue;
    const stats = use.line.replace(/^.*?(?=\bAC\s*\d)/, '');
    let end = j + 1;
    while (/^>\s*\*/.test(lines[end] ?? '')) end++;
    lines.splice(j, end - j, `> ${name}  ${stats.trim()}`, ...(use.abil ? [use.abil] : []));
  }
  return lines.join('\n');
}

// Deterministic safety net for the LLM-written room: any stat block from the
// room's data whose HP never appears, and any gestalt mechanic whose numbers
// (DCs, turn counts) were dropped or changed, is appended before the exits.
export function enforceRoomData(roomText, roomSection) {
  if (!roomText || !roomSection) return roomText;
  // A standalone italic line other than the type line and the exits is a
  // design note the writer echoed (its mechanic is in a bullet); drop it, and
  // the check below re-adds it if its numbers are missing elsewhere.
  roomText = roomText.replace(/^\*(?!Exits:)[^*\n·]+\*[ \t]*\n+/gm, '');
  const add = [];
  for (const { name, block } of roomStatBlocks(roomSection)) {
    const hp = block.match(/HP (\d+)/)?.[1];
    if (hp && !new RegExp(`HP\\s*${hp}\\b`).test(roomText)) add.push(`> ${name.toUpperCase()}  ${block}`);
  }
  for (const { role, note } of gestaltLines(roomSection)) {
    const tokens = note.match(/DC \d+|\d+ (?:exploration )?turns?|\d+ rounds?/g) ?? [];
    const missing = tokens.filter(t => !roomText.toLowerCase().includes(t.toLowerCase()));
    if (missing.length) add.push(`- ${note.replace(/^[A-Z][A-Z' -]+ — /, '').replace(/^./, c => c.toUpperCase())}`);
  }
  if (!add.length) return roomText;
  const block = add.join('\n\n');
  const exits = roomText.search(/^\*Exits:/m);
  return exits >= 0
    ? `${roomText.slice(0, exits).trimEnd()}\n\n${block}\n\n${roomText.slice(exits)}`
    : `${roomText.trimEnd()}\n\n${block}`;
}

// A room's italic type line, as published: its shape and size only — never
// the generator's stocking category ("*Monster · Faction Base · 20 × 20 ft*"
// → "*Room, 20 × 20 ft*").
export function plainTypeLine(roomText) {
  // The first all-italic line that isn't the exits: the type line.
  return roomText.replace(/^\*(?!Exits:)([^*\n]+)\*[ \t]*$/m, (line, inner) => {
    if (!/·|—|\d+\s*(×|ft)/.test(inner)) return line;
    const size = inner.match(/~?\d+\s*×\s*\d+\s*ft|\d+\s*ft long(?:,\s*\d+\s*ft wide)?/)?.[0];
    const shape = inner.match(/\b(cavern|corridor|passage|hall|chamber|stair|room)\b/i)?.[1] ?? 'room';
    const word = shape[0].toUpperCase() + shape.slice(1).toLowerCase();
    return size ? `*${word}, ${size.replace(/^~/, '')}*` : `*${word}*`;
  });
}

// A room as published, from its written text and its brief data: the type
// line and the exits line come from the data (shape, size, ceiling and
// materials; every exit with what can be sensed beyond it), and any line
// the writer copied from its requirements ("Room 14 — Key: …") is dropped.
// `beyond`: roomNum → what can be sensed of that room from outside, read from
// the finished rooms; it outranks the data's clue.
export function publishedRoom(roomText, roomSection, beyond = {}) {
  if (!roomText || !roomSection) return plainTypeLine(roomText ?? '');
  const lines = roomSection.split('\n');
  const head = lines[0].match(/—\s*([^—]+?)\s*$/)?.[1] ?? '';            // "Room, 30 × 60 ft"
  const fabric = lines.find(l => l.startsWith('Fabric: '))?.slice(8);
  const typeLine = `*${head}${fabric ? ` · ${fabric}` : ''}*`;

  // Exits from the data, in the published form.
  const exits = [];
  const exitData = lines.find(l => l.startsWith('Exits: '))?.slice(7) ?? '';
  for (const part of exitData === '(dead end)' ? [] : exitData.split('  ·  ')) {
    const m = part.match(/^(\S+) → Room (\d+) \[([^\]]+)\](?: — beyond: (.+))?$/);
    if (m) {
      // "one-way: a sheer drop (the hard way back: …)" → the cost as its own sentence.
      const [, kind, aside] = m[3].match(/^(.*?)\s*(?:\((.+)\))?$/);
      const note = aside ? ` ${aside[0].toUpperCase()}${aside.slice(1)}.` : '';
      const clue = beyond[m[2]] ?? m[4];
      exits.push(`- **${m[1]}** (${kind}) → Room ${m[2]}${clue ? `: *${clue}*.` : ''}${note}`);
    }
  }
  for (const l of lines) {
    const v = l.match(/^Vertical \((up\/down|down|up)\): (.+?) → Room (\d+)(?: — beyond: (.+))?$/);
    if (v) {
      const clue = beyond[v[3]] ?? v[4];
      exits.push(`- **${v[1][0].toUpperCase()}${v[1].slice(1).replace('/d', '/D')}** (${v[2]}) → Room ${v[3]}${clue ? `: *${clue}*.` : ''}`);
    }
  }
  // A list, one exit per line, each with what can be sensed beyond it.
  const exitsLine = exits.length ? `*Exits:*\n${exits.join('\n')}` : '*Exits: none*';

  let text = roomText
    .split('\n').filter(l => !/^\s*(?:-\s*)?Rooms? \d+(?:\s*[/,]\s*Room \d+)*\s*(?:→|—)\s/.test(l)).join('\n');
  // The type line: replace the writer's, or add one under the heading.
  const typeRe = /^\*(?!Exits:)([^*\n]+)\*[ \t]*$/m;
  const writerType = text.match(typeRe);
  text = writerType && /·|—|\d+\s*(×|ft)|\b(room|corridor|cavern|hall|chamber)\b/i.test(writerType[1])
    ? text.replace(typeRe, typeLine)
    : text.replace(/^(###[^\n]*\n)/, `$1\n${typeLine}\n`);
  text = /^\*Exits:/m.test(text)
    ? text.replace(/^\*Exits:.*$/m, exitsLine)
    : `${text.trimEnd()}\n\n${exitsLine}`;
  return text.replace(/\n{3,}/g, '\n\n');
}

// One `## HEADING` section of the brief, through to the next section.
function briefSection(brief, heading) {
  // No /m flag: `$` must mean end of brief, not end of line.
  return brief.match(new RegExp(`(?:^|\\n)(## ${heading}\\n[\\s\\S]*?)(?=\\n## |$)`))?.[1] ?? '';
}

// The brief's exact change mechanics (clocks, states, thresholds), if any.
export function changesBlock(brief) {
  return briefSection(brief, 'HOW THE DUNGEON CHANGES');
}

// The brief's cyclic flow (locks, keys, loops), if any.
export function flowBlock(brief) {
  return briefSection(brief, 'HOW THE DUNGEON FLOWS');
}

// The brief's canonical Key NPC stat blocks, if any.
export function keyNpcBlock(brief) {
  return briefSection(brief, 'KEY NPC STAT BLOCKS');
}

function gmSectionPrompt(blueprint, roomSummary, changes = '', keyNpcs = '', noFactions = false) {
  const changesPart = changes
    ? `\n\n${changes}\n(Use these mechanics exactly — same numbers, same room references.)`
    : '';
  const npcPart = keyNpcs ? `\n\n${keyNpcs}` : '';
  const premisePart = noFactions
    ? `\n\nThis dungeon has NO factions. In What's Really Going On, answer instead: what happened here, \
what is still dangerous and why, what a careful explorer can find, and what happens if the party \
lingers. Skip Key NPCs unless the brief names a person.`
    : '';
  return `CREATIVE BRIEF (factions, concept, secrets — do not quote verbatim):\n${blueprint}${changesPart}${npcPart}${premisePart}\n\nROOM SUMMARY (use room numbers from this list for all references):\n${roomSummary}\n\n---\nWrite all the GM reference sections as specified.`;
}

function hooksPrompt(blueprint, roomSummary) {
  return `CREATIVE BRIEF (do not quote verbatim):\n${blueprint}\n\nROOM SUMMARY (reference these room numbers in rumors):\n${roomSummary}\n\n---\nWrite the ## Adventure Hooks and ## Rumors sections.`;
}

// ── Pass 4 editorial prompts ──────────────────────────────────────

function editorialGmSectionPrompt(section, keyNpcs = '') {
  return `${canonicalNpcRule(keyNpcs)}Edit the following GM reference sections. Apply these rules per section:

## What's Really Going On — every bullet must name a room, NPC, or faction and end with a \
"→ Room N: [discovery method]" note. Cut any bullet that is purely atmospheric.

## How the Dungeon Works — one bullet per pattern; each must say concretely how it works here, \
how players can exploit it, and end with the rooms where it can be learned. Never cut a pattern. \
Each bullet's bold name says what the thing is in this dungeon, never the pattern's own name.

${PLAIN_WORDS}

## Key NPCs — stat blocks must use exact Shadowdark format. Tighten personality and tactics \
to one sentence each. Every NPC must have a room or roaming location specified.

## Tension & Timing — if present, all five fields must be concrete and specific with no vague language.

## Treasure — every entry must list a specific item or coin amount with a gp value. \
Verify the stated total matches the sum.

Return only the revised text — preserve all ## headings exactly.\n\n${section}`;
}

function editorialHooksPrompt(section) {
  return `Edit the following hooks and rumors. \
Hooks: one sentence each, immediately actionable, implies a concrete reward. \
Rumors: player-facing language only — no room numbers ever. Locations must be described as an NPC would say them \
("the altar beneath the hill", "the sealed vault", "the chamber where the warlord fell"). \
Every rumor must reference a named faction, named NPC, named place, or evocative feature — no vague generalities. \
Preserve the table format and TRUE/FALSE/PARTIAL labels. \
${PLAIN_WORDS}
Return only the revised text — preserve all ## headings.\n\n${section}`;
}

// ── Design review system prompts ──────────────────────────────────

const DESIGN_REVIEW_SYS = `\
You are a Shadowdark RPG module quality reviewer. Read the dungeon module and identify \
concrete, fixable design problems that would cause confusion at the GM's table or frustrate \
players. Do NOT flag stylistic choices or things that are unusual but internally consistent. \
Only flag issues you are confident about.

Look for these issue types only:

PROP_CONFLICT — the same type of object appears in two or more rooms with incompatible \
behaviors (e.g., a pocket watch you can take freely in one room vs. one that triggers a \
dangerous event in another). Only flag when the conflict would genuinely confuse a GM or \
player running the dungeon.

NPC_INVISIBLE — a named NPC is listed as a bullet-point entry in a room but does not appear \
by name in the room's opening paragraph. A GM reading quickly will not know they are present.

DEAD_END — a room with exactly one exit offers nothing useful: no treasure, no information \
the party needs, no encounter with any real consequence. Pure atmosphere at a dead end wastes \
the party's choice to explore it. Only flag if there is genuinely nothing rewarding here.

INACCESSIBLE_LOOT — a trap or obstacle has visible loot (scattered coins, items in plain \
sight) that the text explicitly says becomes permanently unreachable after the trap triggers. \
Do not flag loot that is guarded or hard to reach — only loot the text says becomes inaccessible.

EXIT_MISMATCH — Room A's exits list a connection to Room B, but Room B's exits list has no \
corresponding connection back. Do not flag vertical connections (stairs, ladders, pits) or \
passages the text describes as one-way.

MISSING_MECHANIC — a rule reference has no mechanical resolution: a check with no attribute \
named, an effect with no duration, or a consequence left completely unspecified.

GESTALT_UNDELIVERED — the "How the Dungeon Works" section (or "What's Really Going On") says a \
specific room contains a clue, feature, or mechanism, but that room's entry has no such content. \
Fixes should add the missing content to the room, not remove it from the GM section.

Return a JSON array — no surrounding text, no markdown fences:
[
  {
    "location": "Room N — HEADING NAME" or "GM Section" or "Factions" etc.,
    "type": "prop_conflict" | "npc_invisible" | "dead_end" | "inaccessible_loot" | \
            "exit_mismatch" | "missing_mechanic" | "gestalt_undelivered",
    "problem": "one sentence: what is wrong and exactly where in that location",
    "options": [
      "concrete fix in one sentence",
      "alternative fix in one sentence",
      "minimal fix in one sentence"
    ]
  }
]

If you find no issues, return: []`;

const FIX_SYS = `\
You are a dungeon module editor making a single targeted fix. \
Apply the specified fix to the provided text. \
Return ONLY the revised text — no commentary, no explanation. \
Preserve all headings, stat blocks, exits lines, and formatting exactly as written. \
Change only what the fix requires; do not rewrite, expand, or tighten anything else.`;

// ── Design review functions ───────────────────────────────────────

export async function runDesignReview(doc, checkpointFile, model = MODELS.review) {
  // Load from checkpoint if the analysis was already run.
  if (checkpointFile && existsSync(checkpointFile)) {
    try {
      const data = JSON.parse(readFileSync(checkpointFile, 'utf8'));
      if (data.designIssues !== undefined) {
        const n = data.designIssues.length;
        stderr.write(`Pass 6: design review loaded from checkpoint (${n} issue${n !== 1 ? 's' : ''}).\n\n`);
        return data.designIssues;
      }
    } catch {}
  }

  stderr.write(`Pass 6: running design review (${model})...\n`);
  const t = Date.now();
  let issues = [];

  try {
    const raw = await callClaudeWithRetry(DESIGN_REVIEW_SYS, doc, model, 300_000);
    // Strip markdown fences, then fall back to extracting the first [...] block
    // in case the model wrapped the JSON in prose.
    const stripped = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const jsonStart = stripped.indexOf('[');
    const jsonEnd   = stripped.lastIndexOf(']');
    const cleaned   = (jsonStart !== -1 && jsonEnd > jsonStart)
      ? stripped.slice(jsonStart, jsonEnd + 1)
      : stripped;
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) issues = parsed;
  } catch (err) {
    stderr.write(`  Error: design review failed (${err.message}) — exiting. Re-run to resume from checkpoint.\n`);
    throw err;
  }

  const n = issues.length;
  stderr.write(`  found ${n} issue${n !== 1 ? 's' : ''} in ${((Date.now() - t) / 1000).toFixed(1)}s\n\n`);

  // Persist so a resume doesn't re-run the analysis.
  if (checkpointFile) {
    try {
      let existing = {};
      try { existing = JSON.parse(readFileSync(checkpointFile, 'utf8')); } catch {}
      writeFileSync(checkpointFile, JSON.stringify({ ...existing, designIssues: issues }, null, 2), 'utf8');
    } catch {}
  }

  return issues;
}

export async function applyDesignFix(doc, issue, chosenOption, model = MODELS.fix) {
  // Extract the affected section from the document.
  const roomMatch = (issue.location ?? '').match(/\bRoom\s+(\d+)\b/i);
  let sectionText = null;

  if (roomMatch) {
    const num = roomMatch[1];
    const re = new RegExp(`### Room ${num}\\b[^\\n]*\\n[\\s\\S]*?(?=\\n### |\\n## |$)`);
    const m = re.exec(doc);
    if (m) sectionText = m[0];
  } else {
    // Non-room section: find the ## heading most closely matching the location string.
    const keyword = (issue.location ?? '').split(/\s+/).find(w => w.length > 4) ?? '';
    if (keyword) {
      const re = new RegExp(`(## [^\\n]*${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n[\\s\\S]*?)(?=\\n## |$)`, 'i');
      const m = re.exec(doc);
      if (m) sectionText = m[1];
    }
  }

  if (!sectionText) {
    stderr.write(`  Warning: could not locate "${issue.location}" in document — fix skipped.\n`);
    return doc;
  }

  try {
    const prompt = `ISSUE: ${issue.problem}\n\nFIX TO APPLY: ${chosenOption}\n\nTEXT TO EDIT:\n${sectionText}`;
    const patched = await callClaudeWithRetry(FIX_SYS, prompt, model, 180_000);
    if (!patched || patched.trim() === sectionText.trim()) return doc;
    return doc.replace(sectionText, patched);
  } catch (err) {
    stderr.write(`  Warning: fix application failed (${err.message}) — skipped.\n`);
    return doc;
  }
}

// ── Main export ───────────────────────────────────────────────────

// Pass 1 on its own, so the CLI can show the concept for review before the
// expensive passes. A GM's note ("make it a flooded temple") steers a reroll.
export async function generateBlueprint(brief, factionContext = null, note = '') {
  stderr.write('Pass 1: generating creative blueprint...\n');
  const t1 = Date.now();
  const direction = note ? `\n\nDIRECTION FROM THE GM (follow it closely):\n${note}` : '';
  const prompt = blueprintPrompt(brief, factionContext) + direction;
  let blueprint = await callClaudeWithRetry(BLUEPRINT_SYS, prompt, MODELS.blueprint);
  stderr.write(`  done in ${((Date.now()-t1)/1000).toFixed(1)}s\n`);

  // A second reader checks it the way players would, and the designer fixes
  // what it finds once — cheaper than finding out at the table.
  const problems = await checkBlueprint(brief, blueprint);
  if (problems.length) {
    stderr.write(`  plausibility check: ${problems.length} problem${problems.length === 1 ? '' : 's'} — revising\n`);
    for (const p of problems) stderr.write(`    - ${p}\n`);
    const revised = await callClaudeWithRetry(BLUEPRINT_SYS, `${prompt}

---
YOUR DRAFT:
${blueprint}

A reviewer found these problems with the draft:
${problems.map(p => `- ${p}`).join('\n')}

Rewrite the whole brief in the same format, fixing each problem with the smallest change that \
works — and where a problem is "too much", by cutting. Keep everything else — names, room numbers, \
structure — as it is. Output only the brief: no notes on what changed.`, MODELS.blueprint).catch(() => null);
    // Drop any "what changed" notes after the brief's last section.
    if (revised?.startsWith('TITLE:')) blueprint = revised.replace(/\n-{3,}\s*\n[\s\S]*$/, '').trim();
  } else {
    stderr.write('  plausibility check: no problems\n');
  }
  stderr.write(`  total ${((Date.now()-t1)/1000).toFixed(1)}s\n\n`);
  return blueprint;
}

const CHECK_SYS = `\
You check tabletop dungeon concepts for things that would break at the table. You are blunt and \
brief, and you only report real problems — never style, taste, or missing flourishes.`;

// Problems a sharp player would notice: wrong scale, things a faction can't
// do, secrets that can't be found, more powers than the dungeon holds.
// NPCs the room data stocks: "Duna (Room 8)".
export function stockedNpcs(brief) {
  return [...roomSections(brief)].flatMap(([n, sec]) =>
    [...sec.matchAll(/^\s*NPC: (.+)$/gm)].map(m => `${m[1].trim()} (Room ${n})`));
}

export async function checkBlueprint(brief, blueprint) {
  const budget = storyBudget(brief);
  const header = brief.split('\n## ')[0];
  const factions = brief.match(/^## FACTIONS\n[\s\S]*?(?=\n## )/m)?.[0] ?? '';
  const npcs = stockedNpcs(brief);
  const prompt = `DUNGEON DATA:
${header}

${factions}
${npcs.length ? `\nNPCs STOCKED IN ROOMS (they are in the dungeon; never cut them): ${npcs.join(', ')}\n` : ''}
CONCEPT TO CHECK:
${blueprint}

---
Check the concept for problems of these kinds only:
1. Scale — time spans, numbers, or supplies that don't fit a dungeon this size (outsiders \
camped for months, armies in twenty rooms).
2. Nature — a faction or NPC doing what its kind can't (undead passing as living, mindless \
things scheming, a spy who could never blend in).
3. Logic — a secret or plan that contradicts another part of the concept, or that nobody in the \
dungeon could know or reveal.
4. Count — more factions or powers than the dungeon data lists. An NPC the room data stocks \
("NPC: name") may not be cut; if one doesn't fit, say what role would make them fit.
5. Too much — ${budget.secrets === 0 ? 'any faction, political situation or secret at all (this dungeon has none)' : `more than ${budget.secrets === 1 ? 'one secret in the whole dungeon' : 'two secrets'}`}, more than \
${budget.links.split('-').pop()} cross-room connections, or mechanisms stacked on mechanisms. A ${budget.areas}-area \
dungeon is one session; name what to cut.

Reply with one line per problem, each starting "- " and saying what is wrong and the smallest \
fix. If there are none, reply exactly: NONE`;
  try {
    const out = await callClaudeWithRetry(CHECK_SYS, prompt, MODELS.check, 180_000);
    return out.split('\n').map(l => l.trim()).filter(l => l.startsWith('- ')).map(l => l.slice(2).trim());
  } catch (err) {
    stderr.write(`  Warning: plausibility check failed (${err.message}) — skipped.\n`);
    return [];
  }
}

export { HAIKU as HAIKU_MODEL, SONNET as SONNET_MODEL, OPUS as OPUS_MODEL, FABLE as FABLE_MODEL };

export async function polish(brief, rooms, map, { factionContext = null, checkpointFile = null, editorModel = MODELS.editor } = {}) {
  const cp      = Checkpoint.load(checkpointFile);
  const byNum   = new Map(rooms.map(r => [r._roomNumber, r]));
  const sections = roomSections(brief);

  // ── Pass 1: Blueprint ──────────────────────────────────────────
  let blueprint;
  if (cp.blueprint) {
    stderr.write('Pass 1: blueprint loaded from checkpoint.\n\n');
    blueprint = cp.blueprint;
  } else {
    blueprint = await generateBlueprint(brief, factionContext);
    cp.blueprint = blueprint;
    cp.save();
  }

  // ── Pass 2: Preamble (4 small calls, one per section) ──────────
  const preambleLabels  = ['overview', 'factions', 'encounters', 'entrance'];
  const preamblePrompts = [
    overviewPrompt(blueprint, brief),
    factionsPrompt(blueprint, brief),
    encountersPrompt(blueprint, brief),
    entrancePrompt(blueprint, brief),
  ];

  if (preambleLabels.every(l => cp.preambleSections[l])) {
    stderr.write('Pass 2: preamble loaded from checkpoint.\n\n');
  } else {
    stderr.write(`Pass 2: writing preamble (4 sections via ${MODELS.preamble})...\n`);
    const t2 = Date.now();
    for (let i = 0; i < preambleLabels.length; i++) {
      const label = preambleLabels[i];
      if (cp.preambleSections[label]) { stderr.write(`  ${label} (cached)\r`); continue; }
      stderr.write(`  ${label}...\r`);
      cp.preambleSections[label] = await callClaudeWithRetry(PREAMBLE_SYS, preamblePrompts[i], MODELS.preamble);
      cp.save();
    }
    stderr.write(`  done in ${((Date.now()-t2)/1000).toFixed(1)}s        \n\n`);
  }
  const preambleSections = preambleLabels.map(l => cp.preambleSections[l]).filter(Boolean);
  const preamble         = preambleSections.join('\n\n');

  // ── Pass 3: Rooms in BFS order ─────────────────────────────────
  const order   = bfsOrder(rooms, map);
  const written = new Map(Object.entries(cp.rooms).map(([k, v]) => [parseInt(k), v]));

  const pendingRooms = order.filter(n => !written.has(n));
  if (pendingRooms.length === 0) {
    stderr.write(`Pass 3: all ${order.length} rooms loaded from checkpoint.\n\n`);
  } else {
    const cached = order.length - pendingRooms.length;
    const label  = cached > 0 ? ` (${cached} cached)` : '';
    stderr.write(`Pass 3: writing ${pendingRooms.length} rooms${label} via ${MODELS.rooms}, BFS order...\n`);
    const t3 = Date.now();

    for (let i = 0; i < order.length; i++) {
      const num  = order[i];
      if (written.has(num)) { stderr.write(`  [${i+1}/${order.length}] Room ${num} (cached)\r`); continue; }

      const room = byNum.get(num);
      stderr.write(`  [${i+1}/${order.length}] Room ${num}...\r`);

      const adjacentRooms = [];
      for (const ex of room?.exits ?? []) {
        const t = exitTarget(ex, room, map);
        if (t != null && written.has(t)) adjacentRooms.push(written.get(t));
      }
      // Also include rooms connected via vertical edges (stairs/pits)
      for (const e of map.edges ?? []) {
        if (!e.exitType?.startsWith('vertical:')) continue;
        const connId = e.fromId === room._mapId ? e.toId
                     : e.toId   === room._mapId ? e.fromId : null;
        if (!connId) continue;
        const connNode = map.nodes.get(connId);
        if (connNode && written.has(connNode.roomNumber)) {
          adjacentRooms.push(written.get(connNode.roomNumber));
        }
      }

      const section = sections.get(num) ?? `--- Room ${num}\n(no data)`;
      const content = await callClaudeWithRetry(ROOM_SYS, roomPrompt(blueprint, section, adjacentRooms, num, keyNpcBlock(brief)), MODELS.rooms);
      written.set(num, content);
      cp.rooms[num] = content;
      cp.save();
    }

    stderr.write(`  done — ${pendingRooms.length} rooms in ${((Date.now()-t3)/1000).toFixed(1)}s\n\n`);
  }

  // ── Pass 4: GM section + Adventure Hooks ─────────────────────────
  // Run after rooms so rumors can reference specific room numbers.

  if (cp.gmSection && cp.hooks) {
    stderr.write('Pass 4: GM section and hooks loaded from checkpoint.\n\n');
  } else {
    stderr.write('Pass 4: writing GM section and adventure hooks...\n');
    const t4 = Date.now();
    const roomSummary = buildRoomSummary(rooms, written);

    if (!cp.gmSection) {
      stderr.write('  GM section...\r');
      cp.gmSection = await callClaudeWithRetry(GMSECTION_SYS(), gmSectionPrompt(blueprint, roomSummary, [changesBlock(brief), flowBlock(brief)].filter(Boolean).join('\n\n'), keyNpcBlock(brief), /^## FACTIONS\nNone\./m.test(brief)), MODELS.gm);
      cp.save();
    } else {
      stderr.write('  GM section (cached)\r');
    }

    if (!cp.hooks) {
      stderr.write('  hooks & rumors...\r');
      cp.hooks = await callClaudeWithRetry(HOOKS_SYS, hooksPrompt(blueprint, roomSummary), MODELS.gm);
      cp.save();
    } else {
      stderr.write('  hooks & rumors (cached)\r');
    }

    stderr.write(`  done in ${((Date.now()-t4)/1000).toFixed(1)}s          \n\n`);
  }

  // ── Pass 5: Editorial review (per section, blueprint as global context) ─
  const tryEdit = async (prompt, fallback) => {
    try { return (await callClaudeWithRetry(EDITOR_SYS, prompt, editorModel, 180_000)) || fallback; }
    catch (err) {
      if (err instanceof UsageLimitError) throw err;
      return fallback;
    }
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const pendingEditRooms     = order.filter(n => !cp.editedRooms[n]);
  const pendingEditPreamble  = preambleSections.map((_, i) => i).filter(i => !cp.editedPreambleSections[i]);
  const pendingEditGmSection = cp.gmSection && !cp.editedGmSection ? 1 : 0;
  const pendingEditHooks     = cp.hooks && !cp.editedHooks ? 1 : 0;
  const allEdited            = pendingEditPreamble.length === 0 && pendingEditRooms.length === 0
                             && !pendingEditGmSection && !pendingEditHooks;

  if (allEdited) {
    stderr.write(`Pass 5: all editorial edits loaded from checkpoint.\n\n`);
  } else {
    const totalPending = pendingEditPreamble.length + pendingEditRooms.length + pendingEditGmSection + pendingEditHooks;
    stderr.write(`Pass 5: editorial review (${totalPending} pending)...\n`);
    const t5 = Date.now();

    for (const i of pendingEditPreamble) {
      stderr.write(`  preamble ${i + 1}/${preambleSections.length}...\r`);
      cp.editedPreambleSections[i] = await tryEdit(editorialPreamblePrompt(blueprint, preambleSections[i]), preambleSections[i]);
      cp.save();
      await sleep(300);
    }
    if (pendingEditPreamble.length === 0) stderr.write(`  preamble (cached)\n`);

    for (let i = 0; i < order.length; i++) {
      const num = order[i];
      if (cp.editedRooms[num]) { stderr.write(`  room ${num} (${i+1}/${order.length}) cached\r`); continue; }
      stderr.write(`  room ${num} (${i+1}/${order.length})...          \r`);
      const orig = written.get(num) ?? '';
      const keep = [
        ...roomRequirements(blueprint, num),
        ...gestaltLines(sections.get(num)).map(x => `${x.pattern} [${x.role}]: ${x.note} (keep its numbers exactly)`),
      ];
      cp.editedRooms[num] = await tryEdit(editorialRoomPrompt(orig, keep, keyNpcBlock(brief)), orig);
      cp.save();
      await sleep(300);
    }

    if (cp.gmSection && !cp.editedGmSection) {
      stderr.write(`  GM section...                    \r`);
      cp.editedGmSection = await tryEdit(editorialGmSectionPrompt(cp.gmSection, keyNpcBlock(brief)), cp.gmSection);
      cp.save();
      await sleep(300);
    }

    if (cp.hooks && !cp.editedHooks) {
      stderr.write(`  hooks & rumors...                \r`);
      cp.editedHooks = await tryEdit(editorialHooksPrompt(cp.hooks), cp.hooks);
      cp.save();
      await sleep(300);
    }

    stderr.write(`  done in ${((Date.now()-t5)/1000).toFixed(1)}s                    \n\n`);
  }

  // ── Pass 5b: make vague room details specific ─────────────────────
  const roomList = order.slice().sort((a, b) => a - b)
    .map(n => (cp.editedRooms[n] ?? '').match(/^###\s*(.+)$/m)?.[1] ?? `Room ${n}`).join('\n');
  const spotsIn = (n, text) => vagueSpots(text ?? '', gestaltLines(sections.get(n)).map(g => g.pattern));
  const vague = order.filter(n => !cp.specifiedRooms[n] && spotsIn(n, cp.editedRooms[n]).length);
  if (vague.length) {
    stderr.write(`Pass 5b: making ${vague.length} room(s) specific and jargon-free via ${MODELS.specify}...\n`);
    for (const num of vague) {
      stderr.write(`  room ${num}...          \r`);
      const orig = cp.editedRooms[num];
      let out = orig;
      try {
        out = await callClaudeWithRetry(SPECIFY_SYS, specifyPrompt(blueprint, orig, spotsIn(num, orig), roomList, keyNpcBlock(brief), sections.get(num)), MODELS.specify);
        if (!new RegExp(`^###\\s*Room\\s+${num}\\b`, 'm').test(out)) out = orig;
      } catch (err) {
        stderr.write(`  room ${num}: ${err.message} — keeping the edited text\n`);
      }
      cp.specifiedRooms[num] = out.trim();
      cp.save();
    }
    stderr.write(`  done                    \n\n`);
  }

  // ── Pass 5c: plain words everywhere ────────────────────────────────
  const finalRoom = n => cp.swept[`room-${n}`] ?? cp.specifiedRooms[n] ?? cp.editedRooms[n] ?? '';
  const sweepTargets = [
    ...preambleLabels.map((l, i) => [`preamble-${i}`, cp.editedPreambleSections[i] ?? cp.preambleSections[l]]),
    ['gm', cp.editedGmSection ?? cp.gmSection],
    ['hooks', cp.editedHooks ?? cp.hooks],
    // Rooms with their type line already made plain (that needs no model).
    ...order.map(n => [`room-${n}`, plainTypeLine(cp.specifiedRooms[n] ?? cp.editedRooms[n] ?? '')]),
  ].filter(([k, t]) => t && !(k in cp.swept) && jargonSpots(t).length);
  if (sweepTargets.length) {
    stderr.write(`Pass 5c: plain words in ${sweepTargets.length} section(s) via ${MODELS.specify}...\n`);
    const headings = t => (t.match(/^#{2,3} .+$/gm) ?? []).join('|');
    for (const [key, orig] of sweepTargets) {
      stderr.write(`  ${key}...          \r`);
      let out = orig;
      try {
        out = (await callClaudeWithRetry(SWEEP_SYS, sweepPrompt(orig, jargonSpots(orig)), MODELS.specify)).trim();
        // A sweep that lost or renamed a heading is not trusted.
        if (headings(out) !== headings(orig)) out = orig;
      } catch (err) {
        stderr.write(`  ${key}: ${err.message} — keeping the text\n`);
      }
      cp.swept[key] = out;
      cp.save();
    }
    stderr.write(`  done                    \n\n`);
  }

  // ── Pass 5d: what lies beyond each door, from the finished rooms ─────
  if (!cp.beyond) {
    stderr.write(`Pass 5d: what can be sensed beyond each door via ${MODELS.specify}...\n`);
    try {
      const texts = order.slice().sort((a, b) => a - b).map(n => [n, finalRoom(n)]);
      cp.beyond = parseBeyond(await callClaudeWithRetry(BEYOND_SYS, beyondPrompt(texts), MODELS.specify), order);
      stderr.write(`  ${Object.keys(cp.beyond).length} of ${order.length} rooms\n\n`);
    } catch (err) {
      stderr.write(`  ${err.message} — using the data's clues\n\n`);
      cp.beyond = {};
    }
    cp.save();
  }

  // Tolerates markdown bold around the label or the value: "TITLE: **Name**".
  const titleMatch = blueprint.match(/TITLE[*:\s]+([^*\n]+)/);
  const blueprintTitle = titleMatch?.[1]?.trim() || null;

  // Resolve each preamble section by label — robust against partial editorial pass.
  // Document order: overview → factions → GM section → encounters → entrance → hooks
  // Factions must precede the GM section so characters are introduced before they're referenced.
  const preambleByLabel = {};
  for (let i = 0; i < preambleLabels.length; i++) {
    preambleByLabel[preambleLabels[i]] = cp.swept[`preamble-${i}`] ?? cp.editedPreambleSections[i] ?? cp.preambleSections[preambleLabels[i]] ?? null;
  }

  // Fallback: pull title from the overview's # heading before stripping it.
  const overviewRaw   = preambleByLabel['overview'] ?? '';
  const overviewTitle = overviewRaw.match(/^#\s+(.+)/)?.[1]?.trim() ?? null;
  const title         = blueprintTitle || overviewTitle;
  // The prompt's own "Subtitle:" label sometimes comes back in the italic line.
  const overviewClean = overviewHeadings(enforceDangerLine(overviewRaw.replace(/^#[^\n]*\n+/, '').replace(/^\*Subtitle:\s*/m, '*'), brief));

  const finalRooms = new Map(order.map(n => [n, finalRoom(n)]));
  // With a table per zone, each table goes with its section's rooms.
  const roomTexts = new Map([...order].map(n => [n, publishedRoom(enforceRoomData(finalRoom(n), sections.get(n)), sections.get(n), cp.beyond ?? {})]));
  const sectioned = sectionByZone(preambleByLabel['encounters'], roomTexts);
  const gmBlock    = enforceGmSection(cp.swept.gm ?? cp.editedGmSection ?? cp.gmSection ?? null, brief, finalRooms);
  const hooksBlock = cp.swept.hooks ?? cp.editedHooks ?? cp.hooks ?? null;
  const bodyParts = [
    overviewClean,
    withHeading(preambleByLabel['factions'], /^## (Factions|What Lives Here)/m, '## Factions'),
    gmBlock,
    withHeading(enforceDangerLine(sectioned.encounters, brief), /^## Random Encounters/m, '## Random Encounters'),
    withHeading(preambleByLabel['entrance'], /^## Entrance/m, '## Entrance'),
    hooksBlock,
  ].filter(Boolean);

  const titleBlock      = title ? `# ${title}\n\n` : '';
  return `${titleBlock}${bodyParts.join('\n\n')}\n\n${sectioned.rooms}`;
}
