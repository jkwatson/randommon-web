// Incremental dungeon module polisher.
// Breaks generation into small, focused calls so no single call is too large.
//
//  Pass 1  — Blueprint (Haiku):    creative spine — title, factions, concept, connections
//  Pass 2  — Preamble (4 × Haiku): overview, factions, encounters, entrance
//  Pass 3  — Rooms (Haiku × N):    one call per room in BFS order from entrance;
//                                   each call sees the blueprint + adjacent written rooms
//  Pass 4  — Editorial (Haiku × preamble sections + rooms):
//            independent agent tightens each section against Shadowdark stocking criteria
//
// Uses the local `claude` CLI (no API key needed). Output format: json
// so the result field is clean text with no thinking-block contamination.

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';

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
      }, null, 2), 'utf8');
    } catch (err) {
      stderr.write(`  Warning: could not save checkpoint: ${err.message}\n`);
    }
  }
}

const HAIKU  = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';
const FABLE  = 'claude-fable-5';
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

function roomSections(brief) {
  const map = new Map();
  const re  = /^(--- Room (\d+)\b[^\n]*\n[\s\S]*?)(?=^--- Room |\Z)/gm;
  for (const m of brief.matchAll(re)) map.set(parseInt(m[2]), m[1].trim());
  return map;
}

// ── System prompts ────────────────────────────────────────────────

const BLUEPRINT_SYS = `\
You are a Shadowdark RPG dungeon designer. Given a mechanical dungeon outline, produce \
a compact creative brief that will guide all subsequent writing. Be specific and opinionated — \
invent concrete names, histories, and details. This brief is the creative spine for the module.

Your output MUST begin with: TITLE: [one evocative proper name for this specific dungeon]`;

// Preamble uses Haiku for every sub-call so nothing is consumed by thinking blocks.
// Sonnet drafts the title/factions/encounters as thinking and only surfaces the entrance
// as final text — switching to Haiku avoids that entirely.
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
first). One sentence: one specific sensory detail that couldn't exist in any other dungeon. \
Bold every element a PC might interact with.

- **Bolded element.** What happens when a PC engages with it. One sentence.
  + Hidden detail uncovered during engagement (only if genuinely rewarding).

≤3 bullets. Only for things that reward interaction — omit bullets entirely if the room \
has nothing worth investigating. Stat block verbatim after bullets if there's a monster:

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
- If the room type is "Faction Base", the faction's key NPC must appear in this room \
  with a full Shadowdark stat block, even if they are not listed as the stocked monster — \
  place them alongside whatever else is stocked.
- SHADOWDARK MECHANICS — no D&D 5e terminology:
  · Checks use raw attributes only: STR / DEX / CON / INT / WIS / CHA.
    Never write skill names. "DC 12 DEX" not "Stealth DC 12"; "DC 15 WIS" not "Perception DC 15".
  · No saves or saving throws. Write "DC 12 CON or paralyzed", never "CON save DC 12".`;

// ── Per-pass user prompts ─────────────────────────────────────────

function blueprintPrompt(brief, factionContext) {
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
Produce a creative brief in EXACTLY this format. Be specific — invent real names, history, \
and details. Do not use generic placeholders.

TITLE: [evocative name]
SUBTITLE: [dungeon type · architecture · size · party level N]
CONCEPT: [1 sentence — what this place is and what is happening in it right now]
STORY: [2-3 sentences — current situation, faction tensions, approaching crisis]
WEIRD: [1 concrete inexplicable observable detail — not "eerie atmosphere"]

FACTIONS:
[Repeat for each faction:]
NAME: [full in-world name for this faction]
Identity: [who they are, history, personality in 1 sentence]
Goal: [their concrete immediate goal]
Secret: [what they're hiding that changes everything]
Key NPC: [Name — trait. What they want in the next 10 minutes.]
Toward PCs: [one word disposition + one sentence reason]

RANDOM ENCOUNTERS (2d6):
2: [entry]
3-4: [entry]
5-6: [entry]
7: [entry]
8-9: [entry]
10-11: [entry]
12: [entry]

ENTRANCE: [2 sentences — what the party sees approaching and entering]

CROSS-ROOM CONNECTIONS (3-6 specific links):
- Room X → Room Y: [specific object, info, or NPC that links them]`;
}

// Four focused preamble prompts — one per section — so each call is small
// enough that Haiku writes it all as direct text with no thinking overhead.
const PREAMBLE_CTX = (blueprint, brief) =>
  `CREATIVE BRIEF:\n${blueprint}\n\nDUNGEON DATA (for reference):\n${brief}\n\n---\n`;

function overviewPrompt(blueprint, brief) {
  return `${PREAMBLE_CTX(blueprint, brief)}\
Write ONLY the opening three lines of the module — nothing else:
1. # TITLE  (an evocative name drawn from the creative brief)
2. *Subtitle: dungeon type · architecture · size · party level N*
3. A three-line overview block using exactly these bold labels on separate lines:
   **The Concept:** one sentence.
   **The Story:** 2-3 sentences on the current situation and approaching crisis.
   **The Weird:** one concrete, arguable inexplicable detail.

Output these four items and nothing else. No ## headings, no extra prose.`;
}

function factionsPrompt(blueprint, brief) {
  return `${PREAMBLE_CTX(blueprint, brief)}\
Write ONLY the ## Factions section.

Start with: ## Factions

For each faction: a bold header with its full in-world name, then a short paragraph \
covering its identity, goal, secret, and key NPC (name, trait, current location). \
Close with one sentence on their disposition toward the PCs.

Nothing before or after the ## Factions section.`;
}

function encountersPrompt(blueprint, brief) {
  return `${PREAMBLE_CTX(blueprint, brief)}\
Write ONLY the ## Random Encounters section.

Start with: ## Random Encounters

Then a markdown table with columns | Roll | Entry | covering rolls 2 through 12. \
Keep entries brief — one sentence each. Include a mix of faction members, hazards, \
and Dolmenwood weirdness.

Nothing before or after the table.`;
}

function entrancePrompt(blueprint, brief) {
  return `${PREAMBLE_CTX(blueprint, brief)}\
Write ONLY the ## Entrance section.

Start with: ## Entrance

Then 2-3 tight sentences describing what the party sees approaching and stepping inside. \
Lead with the most arresting or threatening thing visible. Bold any interactable element.

Nothing before or after the ## Entrance section.`;
}

function roomPrompt(blueprint, roomSection, adjacentRooms) {
  const adjBlock = adjacentRooms.length
    ? `ADJACENT ROOMS (already written — cross-reference naturally where it adds value):\n\n${adjacentRooms.join('\n\n')}\n\n`
    : '';
  return `CREATIVE BRIEF (for coherence — do not quote verbatim):
${blueprint}

${adjBlock}ROOM TO WRITE:
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
- Stat blocks: copy verbatim, alter nothing.
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
- Preamble: factions need a concrete current goal and a secret with teeth. \
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

function editorialRoomPrompt(roomText) {
  return `Edit the following room entry against the criteria. \
Return only the revised room entry — preserve the ### heading exactly.\n\n${roomText}`;
}

// ── GM section system prompt ──────────────────────────────────────

const GMSECTION_SYS = `\
You are writing the GM reference block for a Shadowdark RPG dungeon module. \
The GM reads this before the session; players never see it. Generate all four sections below IN ORDER.

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

## Key NPCs
For every named NPC from the creative brief (faction leaders, primary antagonist, any named figure) \
who does NOT already have a stat block inside a room description: write one entry per NPC.

Format per entry:
**NAME** (Room N or Roaming [area]) — one sentence on personality and current mental state. \
Tactics: one sentence on how they fight or negotiate under pressure.
> NAME  AC# HP# ATK [attack] +# ([damage])  MV near  S +# D +# C +# I +# W +# Ch +#  AL [L/N/C]  LV #
> *Up to two special abilities — each one sentence.*

Use Shadowdark Quick Combat Statistics benchmarks for the NPC's level:
LV 1: AC 12 HP 4 ATK +1 (1d6) | LV 2: AC 13 HP 8 ATK +2 (1d6) | LV 3: AC 13 HP 12 ATK +3 (1d8) \
| LV 4: AC 14 HP 16 ATK +4 (1d8) | LV 5: AC 15 HP 20 ATK +5 (1d10) | LV 6+: scale up accordingly.

If every named NPC already has a stat block in their room, write: *All key NPCs are statted in their rooms.*

---

## Tension & Timing
If the dungeon has a countdown device, ticking mechanism, or imminent deadline in its concept:
- **Time remaining:** [specific amount — e.g., 6 exploration turns, 4 hours, 3 days]
- **Half-time warning:** [one specific observable sign the players notice at ~halfway]
- **Final warning:** [one escalating sign near zero]
- **At zero:** [the concrete consequence — one sentence]
- **Intervention:** [one way players can delay or stop it — or "Cannot be stopped."]

If this dungeon has no countdown element, omit this section entirely — do not write it.

---

## Treasure
Shadowdark XP rule: 1 gp = 1 XP. Target total for this dungeon: (party level × room count × 15) gp.
List specific treasure placements for rooms that currently have no loot in the room summaries. \
Prioritize dead ends, empty rooms, and monster rooms with no listed valuables.

Format per entry: Room N — [specific item or coin amount], [gp value].
Close with: **Total: ~X gp across Y rooms.**`;

// ── Hooks & Rumors system prompt ─────────────────────────────────

const HOOKS_SYS = `\
You are writing the Adventure Hooks and Rumors section for a Shadowdark RPG dungeon module.

ADVENTURE HOOKS (2-3 items):
- One sentence each. Pull the party in without revealing what's inside.
- Lead with the most immediately actionable hook (a job, a missing person, a bounty).
- Each hook implies a concrete reward or urgent reason to act now.

RUMORS (5 items, table format):
- Exactly 2 true, 2 false, 1 partially true.
- Each rumor is one tight sentence the party might hear in a nearby settlement.
- Write in player-facing language — no room numbers. Describe locations as an NPC would: "the altar beneath the hill", "the locked vault at the dungeon's heart", "the chamber where the old king was buried".
- Reference faction names, named NPCs, or evocative features — never "Room N".
- No rumor may be purely atmospheric — each must imply something the party could act on.

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

function gmSectionPrompt(blueprint, roomSummary) {
  return `CREATIVE BRIEF (factions, concept, secrets — do not quote verbatim):\n${blueprint}\n\nROOM SUMMARY (use room numbers from this list for all references):\n${roomSummary}\n\n---\nWrite all four GM reference sections as specified.`;
}

function hooksPrompt(blueprint, roomSummary) {
  return `CREATIVE BRIEF (do not quote verbatim):\n${blueprint}\n\nROOM SUMMARY (reference these room numbers in rumors):\n${roomSummary}\n\n---\nWrite the ## Adventure Hooks and ## Rumors sections.`;
}

// ── Pass 4 editorial prompts ──────────────────────────────────────

function editorialGmSectionPrompt(section) {
  return `Edit the following GM reference sections. Apply these rules per section:

## What's Really Going On — every bullet must name a room, NPC, or faction and end with a \
"→ Room N: [discovery method]" note. Cut any bullet that is purely atmospheric.

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

Return a JSON array — no surrounding text, no markdown fences:
[
  {
    "location": "Room N — HEADING NAME" or "GM Section" or "Factions" etc.,
    "type": "prop_conflict" | "npc_invisible" | "dead_end" | "inaccessible_loot" | \
            "exit_mismatch" | "missing_mechanic",
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

export async function runDesignReview(doc, checkpointFile, model = SONNET) {
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

  stderr.write('Pass 6: running design review (Sonnet)...\n');
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

export async function applyDesignFix(doc, issue, chosenOption, model = HAIKU) {
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

export { HAIKU as HAIKU_MODEL, SONNET as SONNET_MODEL, FABLE as FABLE_MODEL };

export async function polish(brief, rooms, map, { factionContext = null, checkpointFile = null, editorModel = HAIKU } = {}) {
  const cp      = Checkpoint.load(checkpointFile);
  const byNum   = new Map(rooms.map(r => [r._roomNumber, r]));
  const sections = roomSections(brief);

  // ── Pass 1: Blueprint ──────────────────────────────────────────
  let blueprint;
  if (cp.blueprint) {
    stderr.write('Pass 1: blueprint loaded from checkpoint.\n\n');
    blueprint = cp.blueprint;
  } else {
    stderr.write('Pass 1: generating creative blueprint...\n');
    const t1 = Date.now();
    blueprint = await callClaudeWithRetry(BLUEPRINT_SYS, blueprintPrompt(brief, factionContext), HAIKU);
    stderr.write(`  done in ${((Date.now()-t1)/1000).toFixed(1)}s\n\n`);
    cp.blueprint = blueprint;
    cp.save();
  }

  // ── Pass 2: Preamble (4 small Haiku calls, one per section) ──────
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
    stderr.write('Pass 2: writing preamble (4 sections via Haiku)...\n');
    const t2 = Date.now();
    for (let i = 0; i < preambleLabels.length; i++) {
      const label = preambleLabels[i];
      if (cp.preambleSections[label]) { stderr.write(`  ${label} (cached)\r`); continue; }
      stderr.write(`  ${label}...\r`);
      cp.preambleSections[label] = await callClaudeWithRetry(PREAMBLE_SYS, preamblePrompts[i], HAIKU);
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
    stderr.write(`Pass 3: writing ${pendingRooms.length} rooms${label} via Haiku, BFS order...\n`);
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
      const content = await callClaudeWithRetry(ROOM_SYS, roomPrompt(blueprint, section, adjacentRooms), HAIKU);
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
      cp.gmSection = await callClaudeWithRetry(GMSECTION_SYS, gmSectionPrompt(blueprint, roomSummary), HAIKU);
      cp.save();
    } else {
      stderr.write('  GM section (cached)\r');
    }

    if (!cp.hooks) {
      stderr.write('  hooks & rumors...\r');
      cp.hooks = await callClaudeWithRetry(HOOKS_SYS, hooksPrompt(blueprint, roomSummary), HAIKU);
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
      cp.editedRooms[num] = await tryEdit(editorialRoomPrompt(orig), orig);
      cp.save();
      await sleep(300);
    }

    if (cp.gmSection && !cp.editedGmSection) {
      stderr.write(`  GM section...                    \r`);
      cp.editedGmSection = await tryEdit(editorialGmSectionPrompt(cp.gmSection), cp.gmSection);
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

  const titleMatch = blueprint.match(/TITLE[*:]+\s*([^*\n]+)/);
  const blueprintTitle = titleMatch ? titleMatch[1].trim() : null;

  // Resolve each preamble section by label — robust against partial editorial pass.
  // Document order: overview → factions → GM section → encounters → entrance → hooks
  // Factions must precede the GM section so characters are introduced before they're referenced.
  const preambleByLabel = {};
  for (let i = 0; i < preambleLabels.length; i++) {
    preambleByLabel[preambleLabels[i]] = cp.editedPreambleSections[i] ?? cp.preambleSections[preambleLabels[i]] ?? null;
  }

  // Fallback: pull title from the overview's # heading before stripping it.
  const overviewRaw   = preambleByLabel['overview'] ?? '';
  const overviewTitle = overviewRaw.match(/^#\s+(.+)/)?.[1]?.trim() ?? null;
  const title         = blueprintTitle ?? overviewTitle;
  const overviewClean = overviewRaw.replace(/^#[^\n]*\n+/, '');

  const gmBlock    = cp.editedGmSection ?? cp.gmSection ?? null;
  const hooksBlock = cp.editedHooks     ?? cp.hooks     ?? null;
  const bodyParts = [
    overviewClean,
    preambleByLabel['factions'],
    gmBlock,
    preambleByLabel['encounters'],
    preambleByLabel['entrance'],
    hooksBlock,
  ].filter(Boolean);

  const sortedOrder     = [...order].sort((a, b) => a - b);
  const editedRoomsBody = sortedOrder.map(n => cp.editedRooms[n] ?? '').join('\n\n');
  const titleBlock      = title ? `# ${title}\n\n` : '';
  return `${titleBlock}${bodyParts.join('\n\n')}\n\n## Rooms\n\n${editedRoomsBody}`;
}
