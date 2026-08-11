---
name: dungeon-design-checklist
description: >
  Use before and after writing any dungeon — manual stocking or module generation.
  Seven design principles (steal, kill, be killed by, paths, talk, experiment, hidden).
  Maps each item to existing stocking skill sections and Perchance lists; fills in
  design guidance not covered elsewhere. Triggers on: "check my dungeon", "does my
  dungeon have everything", "what am I missing", or any dungeon review request.
---

# Dungeon Design Checklist

Read once before writing the dungeon. Read again when done to verify coverage.

Seven things. Every dungeon needs all seven.

---

## 1. Something to Steal

Treasure is the prime mover. XP is tied to treasure recovered, so treasure is what gives players a reason to go in. But treasure doesn't have to be coins:

- **Shiny stuff**: coins, jewels, the jewelled brassiere of the zombie queen
- **Knowledge**: where to find more treasure, blackmail material, a sage who answers one question honestly
- **Friendship**: a creature that follows the party and protects them (sometimes)
- **Trade goods**: a wagon of tea worth 10,000 gp (award half XP now, half when sold)
- **Territorial**: a tower, an apartment, a safe house the party can claim
- **Useful gear**: magic items, scrolls, tools

Treasure also tells a story. Cover it in religious symbols, anoint it in trollblood. Don't let coins just be coins.

**Existing coverage**: stocking skill → *Treasure and XP* section (XP values, treasure targets per level).
**Perchance lists**: `Treasure`, `Treasure03` / `Treasure46` / `Treasure79` (level-tiered), `UnguardedTreasure`, `HiddenTreasure`, `d4MagicItem`.

---

## 2. Something to be Killed

Of course. But make even basic encounters tell the dungeon's story through specific nouns: not "orcs" but "degenerate cannibal versions of the original dwarven inhabitants." Describe creatures in terms that reveal history — barnacle-covered zombies, an iron golem charred by dragonfire, goblins wearing elven armour scraps.

**Existing coverage**: stocking skill → room distribution table (25–35% monster rooms by danger level), *Be Specific*, faction encounter design.
**Perchance lists**: `monster`, `sdMonster`, `contentAndTreasure`, `crawlingEvent`.

---

## 3. Something to Kill You

The dungeon must feel like it was *designed to be unbeatable*, even though it wasn't. You need at least one thing that is clearly, visibly, terrifyingly dangerous.

Two rules — follow at least one:

1. **Label your deadly shit.** A sleeping dragon. A barricaded door with a warning sign. These look deadly from a distance.
2. **Always provide an escape.** The dragon can't fit into the smaller tunnels. The manticore is chained to a rock.

Both rules serve the same purpose: they let players choose their own battles. This also makes the dungeon self-scaling — level 1 parties tip-toe past the dragon; level 6 parties might try to steal what it's sleeping on.

Nearly all combats should be escapable, sometimes at a cost (dropped food, gold, a hireling). Don't put inescapable death rooms in your dungeon.

**Special case — destructible entry points:** If the only way into a region is via a passage that can be destroyed (a staircase that collapses, a floor that gives way, a shaft that falls one way), the escape provision is especially critical. The alternate exit from that region must survive the destruction — it cannot depend on the same passage. A party that falls through a collapsing floor into a chamber with no second exit is trapped with no player agency.

**Trap completeness:** A trap is not a design element until it specifies all three: (1) what *triggers* it, (2) how players can *detect* it, and (3) how they can *avoid or disarm* it. "A crushing wall" with no trigger is GM homework, not dungeon design. Every trap should be fully specified so a GM running the dungeon cold can adjudicate it without invention.

**Existing coverage**: stocking skill → *Balance Is a Suggestion*, HOTT Hazards and Obstacles.
**Gap this fills**: the explicit design principle that deadly threats must be *avoidable and telegraphed*, and that this is what creates player agency and level-agnostic content.

---

## 4. Different Paths

A branching dungeon is the default. Multiple routes serve three things:

- **Player choice**: the party with two clerics takes the zombie tunnel; the party with air support drops into the courtyard. Compositions affect strategy.
- **Retreat options**: players who walk away from a room they don't like need somewhere to go. Dead ends trap parties; loops give them options.
- **Dungeon mastery**: players who return learn the geography. They can lure the carrion crawler over the pit they know is there. They can retreat into a known loop instead of unknown rooms.

Linear sections aren't sins — they're useful for teaching players things (show them the eerily clean hall before the gelatinous cube). But branching should be the default assumption.

**Watch for bottlenecks:** A single dangerous room or destructible passage that is the *only* route between dungeon levels is a design problem. If the only way to the lower level goes through a collapsing floor trap, players who trigger it accidentally may be stranded below with no staircase. Either add a second path between levels, or ensure the dangerous passage has a clearly visible alternate crossing (a ledge, a rope anchor, a crawlway around it).

**Existing coverage**: module-generator.md → BFS layout, `minExits` settings, exit cross-references.
**Gap this fills**: the *design principle* behind branching — why it matters for player agency, party composition, and replayability — not just the mechanical implementation.

---

## 5. Someone to Talk To

Every dungeon needs someone to talk to. This is a roleplaying game. An NPC is the cheapest, easiest way to add depth, and it takes almost no space: "There is a goblin in a cage. His name is Zerglum and he was imprisoned by his fellows for setting rats free."

The problem: tombs, vaults, and abandoned mines are full of undead, oozes, and golems — none of which are chatty. So get creative:

- Rival adventuring party
- Goblins (never need explanation)
- Sympathetic ghost (everyone expects them to be jerks — subvert it)
- Ghoul head on a shelf (blow through the neck-hole to make it talk)
- Magic mouth spell
- Old man trapped in a painting (communicates by painting)
- Demon in a mirror (repeats your own phrases back at you)
- Ancient war machine seeking enemies who died 1,000 years ago
- Time-displaced wizard, resets every 3 minutes
- Pterodactyl-riding barbarians who are also looting the place

**Existing coverage**: stocking skill → *Factions* Step 4 ("at least one faction willing to talk before fighting").
**Gap this fills**: the *explicit principle* that every dungeon needs a talker, plus creative options beyond faction members — especially for dungeons where factions don't fit (tombs, vaults, ruins).
**Perchance lists**: `npcWithDetails`, `npc`, `underworldNPC`, `sdtdNPC`.

---

## 6. Something to Experiment With

Interactive, puzzly, rule-breaking elements where players don't know the answer and have to figure it out. This is distinct from "Make It Weird" (atmosphere) — this is weird *mechanics*.

Examples:
- A room with two doors of different sizes. Small door in → emerges from large door twice as big, and vice versa. Twice in the same direction: terrible consequences.
- A pedestal that turns things into their opposite (the opposite of a sword is an axe; the opposite of a banana is a puzzle).
- Wishing wells that are portals — destination determined by what you throw in first.
- Two holes in the wall. Two limbs in: they're swapped. One limb in: it's severed. Can be used to graft new limbs onto amputees.
- A sundial that controls the sun.
- A machine that turns finished products into raw goods and raw goods into ammunition.

**Why this works:**
- Combat is a solved problem for experienced players. Weird mechanics introduce unsolved problems.
- Level-agnostic: a level 1 character can stick an arm into a hole just as well as a level 10 character.
- Bonus points if it could unbalance the game. Player agency peaks when they can derail the setting.
- Even better if it hurts first, then rewards once understood.

**Specify the interface.** An experimental mechanic must tell the GM what the player actually *does* to engage with it. "The wailing shifts pitch based on which doors are open" is a great mechanic — but also specify: how does a player discover this? What's the observable tell? What do they do to test it? What does success look like? A mechanic without a specified interface gets improvised inconsistently at the table, or worse, the GM doesn't realize it's interactive and just describes it as atmosphere.

**False-information mechanics need failure states.** If the mechanic works by showing players something that isn't true (a mirror that reflects a different room configuration, an illusion hiding a pit, a portal disguised as a wall), specify what happens when a player acts on the false information. "The mirror shows the east passage as open" is half-finished; the other half is "characters who attempt to walk through it take 1d6 damage and bounce back." A false-positive with no consequence is unplayable and confusing.

**Existing coverage**: stocking skill → HOTT *Tricks*, *Make It Weird*.
**Gap this fills**: the distinction between weird *atmosphere* (which "Make It Weird" covers well) and weird *interactive mechanics* (which is what the Experiment item is about). Both are needed. A dungeon should have at least one of each.
**Perchance lists**: `special`, `specialDetails` (special room features and GM advice).

---

## 7. Something the Players Probably Won't Find

Put a few things in the dungeon that only the most thorough party will find. This doesn't require whole rooms — a sentence is enough: "Inside the purple worm's stomach is a bag of holding full of 1,000 gallons of purple worm stomach acid."

**Why:**
- Creates a sense of *enormity*. Players who can't explore 100% will always feel there was more to find.
- Rewards thoroughness as a skill. Finding things (thinking about where they might be, exploring despite the risk) is a way to be *good* at this game.
- Completion is a nice feeling — but so is wonderment.

**The spectrum of hiddenness:**
- Most things: obvious, out in the open
- Some things: behind a curtain, requiring a search
- A few things: tucked deeply away — inside a stomach, under a flagstone, behind a painting that depicts the same room

A mural of a defeated king presenting tribute to a conqueror? Put an actual treasure chest in the wall behind the painting of a treasure chest.

**Existing coverage**: stocking skill → `HiddenTreasure` and secret door content (implicit), *Reward the Curious*.
**Gap this fills**: the *design principle* of intentional hiddenness as a spectrum — not just "some things are hidden" but "deliberately place a few things only the most thorough party will ever find."
**Perchance lists**: `secretLinkType`, `hiddenDoor`, `SecretDoorConcealment`, `HiddenTreasure`.

---

## Quick Checklist (use this after writing)

- [ ] **Steal** — Is there treasure worth going in for? Does it tell a story?
- [ ] **Kill** — Are there monsters? Do they reveal the dungeon's history through their descriptions?
- [ ] **Be killed** — Is there at least one clearly deadly, avoidable threat? Is it labelled? Can they escape — including if the entry route is destroyed? Do traps specify trigger, detection, and resolution?
- [ ] **Paths** — Can parties take different routes? Are there loops to retreat into? Is any single dangerous room or destructible passage the *only* route between major areas?
- [ ] **Talk** — Is there someone (or something) to have a conversation with?
- [ ] **Experiment** — Is there at least one interactive mechanic players have to figure out? Does it specify what the player *does* to engage with it? If it shows false information, does it specify what happens when players act on that false information?

---

## Module Integrity Check (generated modules only — run after the seven-point checklist)

- [ ] **Room count** — Does the document have every room from 1 to N? No gaps in numbering? Verify two ways: (a) count the room headings, and (b) check that max room number equals count. A gap at Room 10 in a 12-room module is a design error even if the count is technically right.
- [ ] **Dangling exits** — Does every exit destination number correspond to an actual room heading? Check in both directions.
- [ ] **Garbage text signals a missing room** — When garbage text mentions a specific room number ("I need Room 10's text to apply the fix"), treat that room as almost certainly absent. The garbage text and the missing room are the same incident — the generator tried to cross-reference a room it never wrote. Check whether that room number exists in the document.
- [ ] **Intro promises kept** — Does "The Weird" mechanic appear in the named room? Does every "→ Room N" in "What's Really Going On" have the promised content in that room? Does every faction NPC live in an existing room?
- [ ] **NPC stat consistency** — For every NPC in the Key NPCs section, is the in-room stat block a verbatim copy — including alignment, level, and talent names? If the NPC appears in multiple rooms, every room gets the same block. If a named NPC is in a room where combat is possible, the stat block must be present — not omitted and left for the GM to look up during play.
- [ ] **Character description consistency** — For every named NPC, does the room's prose description match the Key NPCs entry? A room that describes a "one-armed child in formal dress" when Key NPCs says "skeleton hermit" is the same class of error as a stat drift — the NPC was freshly imagined rather than faithfully placed.
- [ ] **System consistency** — Are all stat blocks in the same game system format? No 5e terms (necrotic damage, radiant damage, psychic damage, passive Perception, numeric fly speeds like "40 ft fly") in a Shadowdark document? No numeric MV values (`MV 30 ft`, `MV 9`) — Shadowdark uses near/close/far only. No ability score damage mechanics ("1d4 CON damage," "STR drain," "0 CON = death") — Shadowdark uses HP damage plus CON checks. No numeric bonus-for-assistance ("+2 for helpers") — Shadowdark uses advantage. Check the **Key NPCs section** too — 5e terms there will propagate into every room where that NPC appears.
- [ ] **Garbage text** — Does the document contain any agent meta-commentary, error messages, or generation scaffolding? Look for: (1) error/refusal phrases: "I cannot apply," "please provide," "I need X's text"; (2) failed self-repair instructions between room entries: "I need the full text of Room X to apply the fix," "Please provide Room N's complete description so I can add…" — these appear between room headings and look like editorial notes but are generation artifacts.
- [ ] **Not find** — Have you hidden a few things only the most thorough party will ever discover?
