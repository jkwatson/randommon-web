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

### Verify against the dungeon design checklist
Before calling a module done, run through `dungeon-design-checklist.md`: something to **steal**, something to **kill**, something to **kill you** (avoidable + telegraphed), **different paths** (loops, not just branches), **someone to talk to**, **something to experiment with** (weird interactive mechanic, not just atmosphere), and **something probably not found** (a sentence of deeply hidden reward).

## Common Failure Modes (verify before calling a module done)

These are the most common ways a generated or manually written module fails at the table. Run through this list as a final check.

**Room completeness** — All rooms 1–N must be present. A gap in numbering (rooms 1–2 then 4–14 with no Room 3) is a critical error. A GM cannot run a dungeon with missing rooms. Check that every room referenced by an exit, an NPC, a rumor, or the timing section actually exists in the document.

**NPC stat consistency** — Do not write a stat block for a major NPC at room-generation time. Copy the Key NPCs block verbatim into every room where that NPC appears. This is not a reconciliation step after the fact — it is the only correct workflow. Writing a fresh stat block for each room is what causes the drift; every fresh block will differ in at least one field. The correct process:

1. Write the Key NPCs section first, with final values.
2. When a room needs that NPC's stat block, paste the Key NPCs block directly — unchanged.
3. If an NPC appears in two or more rooms, both rooms get the same pasted block.

When reviewing a completed module: if any room's stat block differs from the Key NPCs block in HP, AC, ATK, MV, AL, LV, or any talent name, the room block is wrong. Delete it and paste the Key NPCs block in. This includes alignment — an alignment change between sections is not a design choice, it is a generation error. Level drift is the most dangerous discrepancy because it silently changes the entire encounter difficulty — a LV 4 NPC becoming LV 7 in a room nearly doubles effective threat without any obvious tell in the text.

**Missing stat blocks are also a failure.** If a named NPC has a stat block in Key NPCs and is placed in a room where combat is possible ("attacks intruders on sight," "defends her post tenaciously"), the room must include that stat block — pasted verbatim. An NPC with no in-room stat block forces the GM to interrupt the encounter and flip back to the Key NPCs section mid-session. Omitting the stat block is only acceptable when the NPC is purely social with zero combat possibility, and even then it should be a deliberate choice, not an omission.

**Character description must also match.** The Key NPCs section is the canonical description — if it says "skeleton hermit," every room where that NPC appears must describe a skeleton hermit. A freshly generated room frequently re-imagines the NPC from scratch, producing a different species, form, and apparent nature entirely (skeleton → one-armed child; revenant → Mossling). This is not a lore variation; it is a generation artifact. Audit every named NPC: does the room's prose description match the Key NPCs entry? A description mismatch is the same class of error as a stat mismatch and must be corrected to the Key NPCs version.

**Ghost characters** — Every named NPC or faction member who appears in a room must have: (1) what faction they belong to and what they want, and (2) a clear talk/fight disposition. A character with a stat block but no personality, motive, or faction affiliation is a ghost — GMs have nothing to work with when the party interacts with them.

**Stat block system consistency** — All stat blocks in the same document must use the same game system. Mixing Shadowdark format with 5e format (AC/HP/ATK vs. STR/DEX/CON with parenthetical modifiers, passive Perception, etc.) is a silent failure that a GM may not catch until mid-combat.

The most common contamination vector is **movement**: Shadowdark uses descriptive categories (`MV near`, `MV close`, `MV far`, `MV near [fly]`), never feet or squares. `MV 30 ft`, `MV 10`, `MV 9` are all wrong in a Shadowdark document. If any stat block uses a numeric movement value, it must be converted. The mapping is approximate: close ≈ 20 ft or less, near ≈ 30–40 ft, far ≈ 60 ft+. When in doubt use `near`. Also check for these specific 5e terms that don't belong in a Shadowdark document: "necrotic damage," "radiant damage," "psychic damage," "passive Perception," numeric fly speeds ("40 ft fly," "fly speed 30"). Note: "advantage" and "disadvantage" are valid Shadowdark mechanics — do not flag these. Also flag **ability score damage** mechanics ("1d4 CON damage per round," "0 CON = death," "STR drain"). Shadowdark handles environmental hazards and poison with HP damage plus a CON check, not ability score drain. Convert to the Shadowdark pattern: "DC [X] CON or take [Y] HP damage."

**Critical: check the Key NPCs section, not just room stat blocks.** 5e terms that appear in the Key NPCs section propagate into every room where that NPC is pasted. A talent that says "grant advantage" in the Key NPCs section infects every room. Audit Key NPCs for 5e terms as carefully as individual room entries. Also audit stat block *formatting*: if Key NPCs uses space-separated fields and a room uses comma-separated fields (or vice versa), the room block was freshly generated rather than pasted — which means it will also have drifted values.

**Interactive resolution** — Any element that *can* be interacted with must specify *how*. "The fissure can be sealed" requires a mechanism: what material, what DC, how long. "The inscription contains a clue" requires what it actually says. Describing a puzzle without its solution interface leaves the GM to improvise at the worst moment.

Two specific sub-cases: (1) If a room implies a creature — "something large stirs in the darkness," "the bones begin to shift" — without providing a stat block, the GM has nothing to resolve the combat with. Include the stat block or cut the creature. (2) If a mechanic *names* player-facing content — a riddle, a password, a combination — that content must be written out in full. "A voice poses a riddle" without the riddle text is an unrunnable mechanic. The GM cannot be expected to improvise the core content of an interactive moment.

**Unidirectional death traps** — If a room can only be entered via a destructible passage (a floor that collapses, stairs that are destroyed, a shaft that falls one way), that room must have a second exit. A party that falls in cannot be permanently stranded. If the only exit from a lower chamber is "back up the stairs you just destroyed," the dungeon has an inescapable death pocket. Add a crack, a drainage tunnel, a barred crawlway — anything.

**Multi-mechanism rooms** — When a single room has multiple distinct triggers that produce similar effects (e.g., a weakened floor *and* a set of levers, both capable of causing a collapse), label each as a clearly separate sub-entry with its own trigger, its own effect, and its own DC. Conflating them causes GMs to misadjudicate which trigger fired.

**Misleading props and false-information mechanics** — If any element deliberately shows false or altered information (a falsified map, a forged letter, a mirror that shows blocked passages as open, an illusion hiding a pit), specify the failure consequence: exactly what wrong action the element encourages, and what happens when a player acts on it. "This section is falsified" is incomplete; "this section shows the floor as solid — characters who trust it and walk normally trigger the collapse trap" is actionable. Same principle for magical false-positives: "the mirror shows the east door as open" is incomplete; add "characters who try to pass through the mirrored east wall take 1d6 damage and are shoved back into the room."

**Dangling exits** — Every room number that appears in an exit line must correspond to an actual room heading in the document. If a room's exit says "→ Room 25" but the dungeon only has 24 rooms, the dungeon is unrunnable at that point. Before calling a module done, verify that every exit destination exists. Also check the inverse: if Room A exits to Room B, Room B should exit back to Room A (or explicitly note why it doesn't — a one-way drop, a secret door).

**Trap triggers** — Every trap must specify all three components: (1) what *activates* it (stepping on a pressure plate, opening the sarcophagus, crossing the doorway threshold), (2) how players can *detect* it beforehand (a worn floor, old bloodstains, a faint wire visible on a Perception check), and (3) how they can *disable or avoid* it (DC to disarm, DC to leap over, an alternate route). Missing any one of these makes the trap unrunnable. "A crushing wall closes in (DC 14 STR to stop it)" is missing the trigger and detection. "Opening the inner lid triggers the crushing wall; DC 13 Perception to spot the seam; DC 14 STR to jam the mechanism once it starts" is complete.

**Duplicate exits** — A room listing two separate exits that both lead to the same destination room is a navigation error. Either they represent physically distinct paths and must be labeled as such ("wooden door → Room 18" and "stone stairs → Room 18 lower gallery"), or one is an error and must be removed. Ambiguous duplicate exits make it impossible for the GM to track where the party is.

**Intro-to-room mismatch** — The module header sections (The Concept, The Weird, What's Really Going On, faction descriptions) are generated before the individual rooms. Content promised in those sections must actually appear in the named rooms. Before calling a module done, audit every room reference in the header:
- **The Weird** names a room. Open that room's entry and confirm the mechanic is written there, with full interactive resolution. If the header says "In Room 5, a brass basin reflects a different chamber," Room 5 must contain a brass basin with instructions for how to interact with it.
- **What's Really Going On** cross-references rooms with "→ Room N." Open each referenced room and confirm the promised clue, NPC behavior, or evidence is written *in that room's text* — not just inferable by a GM who read the intro. If the header says "→ Room 7: Fresh, deliberate damage patterns reveal the collapse was intentional," Room 7 must contain a bullet describing those damage patterns, what they look like, and how a player discovers they're intentional. A room that just describes "rubble and moaning" does not deliver this clue — the GM has no text to read aloud or respond to investigation with.
- **Faction descriptions** name NPC home rooms. Confirm those rooms exist and contain the NPC.

If a promise made in the header is not honored in the room, the room must be updated to include it — not the other way around. The header defines the dungeon's design intent; the rooms must deliver it.

A second intro-to-room failure mode: the content exists but is placed in the *wrong room*. "→ Room 5: A coherent undead scout will explain the plague tracks with tremors" is broken if the scout is in Room 9. The room number in What's Really Going On must match where the content actually lives. Verify both that the clue is present *and* that it lives in the room whose number is cited. A reference that points at the wrong room gives a GM nothing to work with and no obvious way to notice the error mid-session.

**Garbage text** — Generated modules frequently contain agent meta-commentary that was never removed. Two failure patterns:

1. **Error/refusal phrases** embedded in room content or between sections: "I cannot apply," "please provide," "I need X's text." These appear when the generator couldn't complete a step and logged the failure inline instead of fixing it.

2. **Failed self-repair instructions** between room headings: phrases like "I need the full text of Room 12 to apply the fix" or "Please provide Room N's complete description so I can add [exit] to its exits." These appear when the generator attempted a post-hoc correction pass, couldn't access the original text, and left its own instructions in the document rather than the actual room content. They are typically sandwiched between two room headings and look superficially like editorial notes.

Both patterns produce unrunnable documents — a GM who encounters this text mid-session has nothing to work with. Scan the entire document for these patterns before calling a module done. The self-repair pattern is especially dangerous because it can mask missing rooms: the room appears to be "there" (sandwiched text between headings) but the actual content was never written.

**Garbage text as missing-room evidence** — When a self-repair instruction names a specific room number ("I need Room 10's text to apply the fix"), that room is almost certainly absent from the document. The garbage text and the missing room are the same incident: the generator tried to cross-reference a room it never wrote, then left its own diagnostic note in the output. Always check whether the room number named in the garbage text exists as a room heading. If it doesn't, the module is missing a room — not just corrupted text.

**Room count — contiguous numbering check** — The module header declares a room count (e.g., "12 rooms"). That number must equal both (a) the count of room headings and (b) the maximum room number. A 12-room module with rooms numbered 1–9 and 11–13 has the right count but a gap where Room 10should be. This is a design error: any exit pointing to Room 10 becomes a dangle, and GMs will be confused by the skip. Room numbering must be contiguous from 1 to N.

**Dead-end pockets with significant content** — A room with one entrance and no other exits is a dead-end pocket. These are fine for side-content. They become a problem when they contain major NPCs or significant rewards players are expected to reach and interact with deeply — players arrive, take the treasure or finish the conversation, and leave the same way with no ability to loop, use the room to bypass a threat, or retreat into it from a different direction.

## Common Extension Patterns

### Add a named room label
Derive from content type in `renderModuleRoom()` or add a `dungeonRoomName` Perchance list to `dungeon-stocking.txt` and call it in `stockRoom()`.

### Add an object cross-reference ("the key in Room X opens the door in Room Y")
In `generateModule()`, post-process rooms after BFS: find a trap/obstacle room and a locked-door exit elsewhere, inject a cross-reference string into both rooms' data before rendering.

### Add a "print-ready" export
Replace `window.print()` in `btnExportModule` handler with a call to a new `printModule({ dungeon, rooms, map })` in `print.js`, following the same pattern as `printDungeonCrawl`.

### Change content distribution for module mode
`generateModule` passes standard `stockRoom()` calls which consult `CONTENT_TARGETS` in `generator.js`. Adjust those weights or pass an override `config` to `generateDungeon` to shift the distribution for module-specific use cases.
