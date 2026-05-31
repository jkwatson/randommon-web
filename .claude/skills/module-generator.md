---
name: module-generator
description: >
  Use this skill when the user wants to extend, fix, or redesign the one-click module
  generator in the dungeon app. Triggers on: "generate module", "module view", "module
  output", "one-click module", "pre-generate all rooms", "full dungeon document",
  "faction anchoring", "room cross-references", "exit cross-references",
  "generateModule function", "module export", "module print". Also use when the user
  wants to change what the module document contains or how it looks.
---

# Module Generator Skill

The dungeon app has a **Generate Module** button that pre-generates an entire dungeon —
all rooms, the map, faction anchoring, and cross-referenced exits — in one click, producing
a GM-ready document rather than the room-by-room crawl mode.

## What a Module Is (theory)

From the reference doc `temp/what_is_a_module.txt`:

> A technical manual of connected and interactive micro-fiction.

The three defining properties:

| Property | What it means | How the generator addresses it |
|---|---|---|
| **Technical manual** | Can be read partially, in any order, without full comprehension first | Numbered rooms, map up front, each room self-contained |
| **Interactive micro-fiction** | Entries describe an imagined space and invite player interaction | Room content (monster/trap/NPC etc.) with interactable details |
| **Connected together** | Entries reference each other to form a cohesive whole | Exit cross-refs (`→ Room N`), faction home-base anchoring, rumor room-pins |

The five module-writing skills that should inform any extension:
1. **Micro-fiction** — compelling descriptions in constrained space
2. **Interaction** — elements that invite player action
3. **Connection** — explicit links between entries (the main gap the generator closes)
4. **Comprehension** — structure that works without reading the whole thing
5. **Instruction** — clear "what happens when" details (bullets, trap tells, etc.)

## Key Files

| File | Role |
|---|---|
| `dungeon/src/dungeons/generator.js` | `generateModule()` + exported map helpers |
| `dungeon/src/main.js` | `renderModule()`, `renderModuleRoom()`, `resolveExitTarget()`, module button handler |
| `dungeon/index.html` | Module button (`#btn-module`), output container (`#output-module`), export button (`#btn-export-module`) |
| `dungeon/src/dungeon.css` | `.module-document`, `.module-room-list`, `.module-room-entry`, `.module-exit-ref`, `.module-faction-base` |

## How `generateModule()` Works

Located at the bottom of `generator.js`. Algorithm:

1. Calls `generateDungeon(partyLevel, config)` — sets `currentDungeon`, generates factions, concept, rumors, entrance.
2. Initialises a fresh map (`{ nodes, edges, positions, nextId, currentId }`).
3. Generates **room 1** (entrance) with `minExits: 2` via `stockRoom()`.
4. **BFS** over the exit queue: for each pending exit, checks if the target grid cell is occupied (loop-back edge) or free (new room). Calls `stockRoom()` for new rooms, which consults the budget system to hit content-type distribution targets.
5. If the queue empties before all rooms are placed, starts **disconnected sub-areas** via `findFreeCell()`.
6. Sets `map.currentId = null` — no room highlighted in the document view.
7. **Faction anchoring**: walks factions in order, assigns each a home-base room (preferring existing faction-tagged monster rooms, then any NPC/monster room, then any non-entrance room). Sets `room._factionBase = faction`.
8. **Rumor room-pins**: adds `d.rumorRefs = d.rumors.map(rumor => ({ text, roomRef: roomN }))`.
9. Calls `generateWanderingTable(partyLevel)` to populate `d.wanderingTable`.
10. Returns `{ dungeon, rooms, map }`.

### Map helper exports (from `generator.js`)

These are exported so `generateModule` can use them internally. `main.js` keeps its own local copies (which have extra entries for `up`/`down`/`up/down` vertical exits):

```js
export const DIR_OFFSETS   // cardinal + diagonal direction → [dx, dy]
export const OPPOSITE_DIR  // direction → its opposite
export function nodeAtPos(m, x, y)                        // find node at grid pos
export function addEdge(m, fromId, toId, dir, exitType)   // deduped edge insert
export function findFreeCell(x, y, positions)             // spiral search for free cell
```

## How `renderModule()` Works

In `main.js`. Structure of the rendered HTML:

```
.module-header
  Dungeon overview (type, flavor, aesthetic, concept, rumors with → Room N refs)
  Entrance + guard
  Faction blocks (each with → Room N base link)
  Wandering encounter table

.module-map
  renderMapSVG(map)  — all rooms visible, no current highlight

.module-room-list
  .module-room-entry[data-room-number="N"]  (one per room, in order)
    .module-room-header  — "Room N" + Final tag if applicable
    .module-faction-base  — faction callout if this room is a home base
    .module-room-meta    — room type, size, smell, sound, furnishing
    .module-room-exits   — exits with → Room N cross-refs via resolveExitTarget()
    [content body]       — same as crawl renderStockedRoom() but no exit buttons
```

### Exit cross-referencing

`resolveExitTarget(exit, room, map)` in `main.js`:
- Looks up the room's map node by `room._mapId`
- Applies `DIR_OFFSETS[exit.direction]` to get target grid coords
- Calls `nodeAtPos(map, tx, ty)` to find the target node
- Returns `node.roomNumber` or `null`

Rendered as: `North — wooden door <span class="module-exit-ref">→ Room 4</span>`

Map node click → scrolls to the corresponding `.module-room-entry`.

## Design Principles to Apply When Extending

From `shadowdark-dungeon-stocking.skill` (HOTT):
- **Hazards, Obstacles, Tricks, Traps** — the budget system already targets these; the module view should make all four visible at a glance
- **Faction anchoring** — factions should be *doing* something, not just listed; the home-base room should make the key NPC feel present
- **Specificity** — every room should have one detail that couldn't appear in any other dungeon (this is a table quality problem, not a rendering problem)
- **Reward curiosity** — bullets/details that respond to player investigation belong in content bodies

From the module theory:
- **Connection is the gap** — the crawl view has none; the module view adds cross-refs and faction anchors. Future extensions should add more: NPC A mentions Room 7, the key in Room 3 opens the door in Room 9, etc.
- **Comprehension without full reading** — room entries must be self-contained; don't put essential info only in the overview

## Common Extension Patterns

### Add a named room label
Derive from content type in `renderModuleRoom()` or add a `dungeonRoomName` Perchance list to `dungeon-stocking.txt` and call it in `stockRoom()`.

### Add an object cross-reference ("the key in Room X opens the door in Room Y")
In `generateModule()`, post-process rooms after BFS: find a trap/obstacle room and a locked-door exit elsewhere, inject a cross-reference string into both rooms' data before rendering.

### Add a "print-ready" export
Replace `window.print()` in `btnExportModule` handler with a call to a new `printModule({ dungeon, rooms, map })` in `print.js`, following the same pattern as `printDungeonCrawl`.

### Change content distribution for module mode
`generateModule` passes standard `stockRoom()` calls which consult `CONTENT_TARGETS` in `generator.js`. Adjust those weights or pass an override `config` to `generateDungeon` to shift the distribution for module-specific use cases.
