# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Vite dev server (serves both apps)
npm run build     # production build to dist/
npm run preview   # preview the production build
npm run test      # run all Vitest tests (root + packages)
```

Run a single test file:
```bash
npx vitest run src/tests/wrangler.test.js
npx vitest run packages/perchance-engine/tests/evaluator.test.js
```

## Architecture

This is an npm workspace (`packages/*`) with two separate web apps built by Vite, plus one shared internal package.

### Two apps, one Vite build

`vite.config.js` defines two entry points:
- **Main app** (`index.html` / `src/`) — monster browser/picker
- **Dungeon app** (`dungeon/index.html` / `dungeon/src/`) — encounter and dungeon generator

### Shared package: `@wandering-monstrum/perchance-engine`

Located at `packages/perchance-engine/`. This is a custom engine for the Perchance random-table format:
- `parser.js` → parses indented table text into a list structure
- `evaluator.js` (`Engine`) → picks weighted random entries, resolves `[listRef]` and `{a|b}` inline syntax, and dice expressions like `[dice("2d6")]`
- `dice.js` → `rollDice(expr)` utility
- `createEngine(text)` is the convenience entry point

Table files live in `dungeon/tables/*.txt` and are imported as raw strings via `?raw`.

### Main app — monster graph (`src/`)

All heavy computation runs in a **Web Worker** (`src/worker.js`). The main thread communicates via `src/worker-client.js` using request/response message pairs.

Data flow:
1. Worker fetches all `public/data/*.json` on load, calling `parseMonster()` for each entry
2. `MonsterGraph.build()` computes an adjacency list: every pair of monsters is scored by `calculateConnectionStrength()` (level proximity, shared tags/biomes, alignment, same source)
3. UI queries the worker with ops: `cluster`, `walk`, `rando`, `search`, `filter`, `availableLevels`, `availableBiomes`, `availableTags`
4. `cluster` — picks a seed, grabs `randomness × n` nearest neighbors, shuffles and slices to `n`
5. `walk` — hops monster-to-monster; each hop picks a random step distance 1–9 in the sorted adjacency list

State lives in `AppState` (extends `EventTarget`), which emits `change` events. UI components in `src/ui/` listen and re-render.

### Dungeon app — encounter/dungeon generator (`dungeon/src/`)

Uses the Perchance engine to evaluate tables from `dungeon/tables/`. Monster stat blocks are looked up via `MonsterDB` (a `Map<uppercase-name, monster>` built from a subset of the same JSON files).

Key modules:
- `encounters/generator.js` — resolves encounter type from a `d8 × terrain/time` table, looks up a Perchance list, parses the result, and fetches a stat block from `MonsterDB`
- `dungeons/generator.js` — generates dungeon metadata (type, factions, rooms) and `stockRoom()` which produces typed room contents (monster, trap, trick, etc.)
- `dungeons/dolmenwood-generator.js` — Dolmenwood-specific dungeon generation variant
- `encounters/mortals.js` / `encounters/adventurers.js` — NPC generation helpers
- `monsterStore.js` — singleton async loader for `MonsterDB`; multiple callers share one pending promise

### Monster data format

JSON arrays in `public/data/`. Each entry has:
```json
{
  "name": "WOLF",
  "alignment": "N",
  "biome": "forest,mountain",
  "level": "3",
  "source": "core",
  "statblock": "AC 13, HP 11, ATK ...",
  "tags": "animal",
  "page": "212",
  "attack": "...",
  "description": "optional",
  "abilities": [{ "name": "...", "description": "..." }]
}
```

`biome: "*"` means the monster appears everywhere. Level `"*"` is treated as level 10 in the main app. The dungeon app's `MonsterDB` looks up monsters by uppercase name; `NAME_MAP` in `encounters/generator.js` handles name mismatches between encounter tables and JSON data.

Adding a new data file requires registering it in **both** `src/worker.js` (`DATA_FILES`) and `dungeon/src/monsters.js` (`files` array) if the dungeon app should see it.

## Skills (`.claude/skills/`)

These are reference documents for common workflows. Read the relevant one before starting the task.

### `shadowdark-monsters.md` — Shadowdark stat block design
Use when creating or reviewing monster stat blocks. Contains:
- The Quick Combat Statistics table (AC/HP/ATK benchmarks by level 0–19)
- Exact stat block format: `NAME`, flavor sentence, `AC # HP # ATK … MV … S D C I W Ch AL LV`
- Talent design guidelines (innate / ride-along / thematic) with common templates (Breath, Grab, Poison, Regenerate, etc.)
- Standard DCs: 9 / 12 / 15 / 18 / 20 only — no other values
- Attack and movement format tables

### `shadowdark-dungeon-stocking.skill` — Dungeon stocking workflow (ZIP)
Use when populating a dungeon map. Covers: map reading, establishing dungeon concept + factions, per-room stocking (room entry format, distribution tables by danger level), and wandering monster table construction.

### `extract-monsters.md` — Extracting monster data from PDFs
Workflow for adding a new sourcebook's monsters to the JSON data files:
1. Convert PDF → Markdown with `cd temp && uv run docling --image-export-mode=placeholder <file.pdf>` (`temp/` has a `pyproject.toml` with docling)
2. Audit tags and biomes against the sourcebook's terrain tables
3. Write a Python update script in `temp/update_<sourcebook>.py` using `set_monster(name, description, abilities)`
4. Run it and check for any monsters with missing data

### `perchance-dungeon-generator/SKILL.md` — Perchance generator conventions
Use when editing `dungeon/tables/*.txt` or adding Perchance syntax. Key points:
- Weighted items: `item^3` (3×), `item^0` (disabled), `item^[condition]` (conditional)
- List references: `[listName]`, inline: `{a|b}`, dice: `[dice("2d6")]`
- `selectMany` + `joinItems` for picking multiple items
- HTML is supported in output; escape `=` in attributes: `href\="..."`
- See `references/existing-lists.md` for the index of all list names in the generator
