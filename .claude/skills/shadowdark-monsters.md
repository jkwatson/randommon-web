---
name: shadowdark-monsters
description: Use this skill whenever the user wants to create, design, or generate a Shadowdark RPG monster, creature, or NPC stat block. Triggers include any mention of "Shadowdark monster", "stat block", "new creature", "bestiary entry", or requests to homebrew a creature for Shadowdark. Also use when the user describes a concept, folklore creature, or setting idea and wants it turned into a playable Shadowdark monster. Always use this skill when the user wants lore/flavor text for a Shadowdark creature alongside mechanical stats.
---

# Shadowdark Monster Creator

A skill for generating lore-rich, mechanically balanced Shadowdark monsters and their stat blocks, based on the official design guidelines from *Creating & Adapting Monsters for use in Shadowdark RPG* (Night Noon Games).

## Workflow

1. **Gather concept** — Understand what the monster is (creature type, folklore origin, setting, vibe)
2. **Determine level** — Ask if not provided; LV drives all stat targets
3. **Generate flavor text** — 1–2 evocative sentences describing appearance/behavior
4. **Build the stat line** — Use the Quick Combat Statistics table below
5. **Design talents** — 0–3 talents that make the creature memorable
6. **Present the full entry** — Name, flavor, stat line, then talents

---

## Stat Block Format

```
NAME
[1–2 sentence flavor description. Vivid, atmospheric, present tense.]
AC [#], HP [#], ATK [attacks], MV [movement], S [mod], D [mod], C [mod], I [mod], W [mod], Ch [mod], AL [L/N/C], LV [#]
[Talent Name]. [Mechanical description.]
[Talent Name]. [Mechanical description.]
```

### Rules
- **Name**: ALL CAPS
- **Flavor**: 1–2 sentences, evocative and specific. Focus on appearance and one behavioral detail. Use natural language — no monster types, damage types, or sizes needed.
- **Stat line**: Always in this exact order — AC, HP, ATK, MV, S, D, C, I, W, Ch, AL, LV
- **AL**: L (Lawful), N (Neutral), or C (Chaotic) only
- **Talents**: Listed below the stat line, one per line, name followed by a period
- **No "saving throws"**: Shadowdark has no saving throw mechanic. Use "check" instead — e.g. "DC 12 CON or paralyzed" not "Save vs. paralysis". Bonuses to saves are written as "+2 to checks against magical effects".

### Stat Abbreviations
S = Strength, D = Dexterity, C = Constitution, I = Intelligence, W = Wisdom, Ch = Charisma, AL = Alignment, LV = Level

---

## Markdown Format

When writing stat blocks to a markdown file, use this layout:

```markdown
## MONSTER NAME
_1–2 sentence flavor description._

**AC** #, **HP** #, **ATK** attacks, **MV** movement, **S** mod, **D** mod, **C** mod, **I** mod, **W** mod, **Ch** mod, **AL** X, **LV** #

**Talent Name**. Talent description.

**Talent Name**. Talent description.

---
```

Rules:
- Flavor text in `_italics_`, on its own line, blank line after
- Stat line has each abbreviation in `**bold**`, blank line after
- Each talent on its own line with `**bold name**`, blank line between talents
- `---` horizontal rule after every entry

---

## Quick Combat Statistics (Official Benchmarks)

Use this table as the primary reference. Adjust AC, HP, and ATK around the median based on concept (nimble creatures get higher DEX/lower STR; tanks get more HP; glass cannons get less).

| LV | AC | HP  | ATK                  | Stat Mod Median [Low, High] | Talent DC |
|----|-----|-----|----------------------|-----------------------------|-----------|
| 0  | 11 | 1   | 1 atk +1 (1)         | -2 [-4, 1]                  | 9         |
| 1  | 12 | 4   | 1 atk +1 (1d4)       | +0 [-2, 1]                  | 12        |
| 2  | 12 | 10  | 1 atk +1 (1d6)       | +0 [-2, 2]                  | 12        |
| 3  | 13 | 14  | 2 atk +3 (1d6)       | +1 [-2, 2]                  | 12        |
| 4  | 13 | 19  | 2 atk +3 (1d6)       | +1 [-2, 3]                  | 12        |
| 5  | 13 | 24  | 2 atk +4 (1d8)       | +1 [-2, 3]                  | 15        |
| 6  | 14 | 29  | 3 atk +5 (1d10)      | +1 [-2, 4]                  | 15        |
| 7  | 14 | 34  | 3 atk +6 (1d10)      | +1 [-1, 4]                  | 15        |
| 8  | 14 | 38  | 3 atk +6 (1d10)      | +1 [-1, 4]                  | 15        |
| 9  | 15 | 43  | 3 atk +7 (2d8)       | +2 [-1, 5]                  | 15        |
| 10 | 15 | 48  | 3 atk +7 (2d8)       | +2 [-1, 5]                  | 15        |
| 11 | 15 | 52  | 3 atk +8 (2d8)       | +3 [1, 5]                   | 15        |
| 12 | 16 | 58  | 3 atk +8 (2d10)      | +3 [2, 5]                   | 15        |
| 13 | 16 | 61  | 4 atk +8 (2d10)      | +3 [2, 5]                   | 15        |
| 14 | 16 | 68  | 4 atk +9 (2d10)      | +3 [3, 5]                   | 15        |
| 15 | 17 | 70  | 4 atk +9 (2d10)      | +3 [3, 5]                   | 18        |
| 16 | 17 | 76  | 4 atk +9 (2d12)      | +4 [3, 6]                   | 18        |
| 17 | 17 | 80  | 4 atk +10 (2d12)     | +4 [3, 6]                   | 18        |
| 18 | 18 | 85  | 4 atk +10 (2d12)     | +4 [3, 6]                   | 18        |
| 19 | 18 | 89  | 4 atk +10 (2d12)     | +4 [3, 6]                   | 18        |

**HP formula**: (LV x 4.5) + CON mod. The hidden hit die is a d8; 4.5 is the average roll.

**Stat Mod notes**: PC stat mods max at +4, but monsters can go higher. At higher levels, tune down ported stat modifiers slightly. The Talent DC column gives the standard DC for that level — always use a standard DC (9, 12, 15, 18, or 20).

---

## Attack Formats

| Type | Format | Example |
|------|--------|---------|
| Melee | `[#] [name] +[mod] ([dice])` | `2 claw +4 (1d8)` |
| Ranged | `[#] [name] (far) +[mod] ([dice])` | `1 longbow (far) +3 (1d8)` |
| Close/near ranged | `[#] [name] (close/near) +[mod] ([dice])` | `2 spear (close/near) +2 (1d6)` |
| Special (no roll) | `[#] [name]` | `1 petrifying breath` |
| Multiple options | joined with `or` | `2 claw +4 (1d8) or 1 fire breath` |
| Spellcasting | `[#] spell +[mod]` | `1 spell +5` |

- Ride-along effects noted inline: `2 bite +4 (1d6 + poison)`

---

## Movement

- Default is `near` (standard speed)
- Add modifier in parens: `near (climb)`, `near (swim)`, `near (fly)`
- `double near` for unusually fast creatures
- `close` for slow/ponderous creatures
- `none` for immobile creatures

---

## Talents

Nearly every monster has talents — special features that make them unique. Three types:

**Innate** — Always on; part of what the monster is. No check required.
Examples: Undead, Feyblood, Stealthy, Iron Hide, Fireblood, Fearless, Pack Hunter

**Ride-Along** — Triggers with something else, usually when damage is dealt.
Examples: Blood Drain, Poison, Disease, Grab, Attach, Constrict, Barb

**Thematic** — Defines what the monster *is*. Often forces a check.
Examples: Petrify, Shapechange, Charge, Possess, Breath attacks, Regenerate, Animate Tree

### DC Guidelines
Always use standard Shadowdark DC values — no other values are valid:
- **DC 9** — Easy (typical for LV 0 monsters)
- **DC 12** — Normal (typical for LV 1–4 monsters)
- **DC 15** — Hard (typical for LV 5–14 monsters)
- **DC 18** — Extremely Difficult (typical for LV 15+ monsters)
- **DC 20** — Nearly Impossible (reserved for legendary effects)

Use the Talent DC column from the Quick Combat Statistics table to pick the right DC for the monster's level.

### Talent Design Goals
Each talent should:
- Add a new threat vector (Petrifying Breath)
- Enable a tactic (Charge, Grab)
- Create a puzzle (Shapechange, Phylactery)
- Or be a lore-relevant passive (Feyblood, Oath)

### Common Talent Templates

**Breath**: `Fills a [near/double near]-sized cube extending from [monster]. DC [15/18] [STAT] or [damage/effect].`

**Charge**: `In place of attacks, move up to double near in a straight line and make 1 [attack]. If hit, x[2/3] damage.`

**Grab**: `DC [12/15] STR or [held/immobilized]. DC [#] STR on turn to break free.`

**Poison/Toxin**: `DC [9/12/15] CON or [go to 0 HP / paralyzed 1d4 rounds / 1d4 damage / sleep].`

**Disease**: `DC [9/12] CON or 1d4 CON damage (can't heal while ill). Repeat check once per day; ends on success. Die at 0 CON.`

**Regenerate**: `Regains [2d6] HP on its turn unless wounds are cauterized with [fire/acid].`

**Shapechange**: `In place of attacks, transform into [any similarly-sized humanoid / a specific form list].`

**Possession**: `[Range]. Contested [STAT] check. If [monster] wins, it inhabits the target's body and controls it for 2d4 rounds.`

---

## Spells

Monster spells draw on unknowable Shadowdark magic — not PC spellcasting. They may resemble PC spells but aren't identical. Some monsters can cast more than one spell per turn.

**Spell DC**: DC = 10 + spell tier (Tier 1 = DC 11, Tier 2 = DC 12, Tier 3 = DC 13... round to nearest standard DC)

**Spell Tier Impact on Monster Level**:
| Spells | Tier | Level Adjustment |
|--------|------|-----------------|
| Up to 2 | 1 | +1 level |
| At least 1 | 2 | +2 levels |
| At least 1 | 3 | +4 levels |
| At least 1 | 4 | +6 levels |
| At least 1 | 5 | +10 levels (min.) |
| Each spell beyond 2 | — | +1 level per spell |

**Spell format**: `[Spell Name] ([STAT] Spell). DC [#]. [Range]. [Effect].`

---

## Alignment Guide

| AL | Meaning | Examples |
|----|---------|----------|
| L  | Lawful — order, hierarchy, codes | Elves, knights, celestials, blink dogs |
| N  | Neutral — survival, instinct, balance | Animals, constructs, elementals |
| C  | Chaotic — destruction, hunger, malice | Demons, hags, undead, bandits |

---

## Folklore & World Mythology

When adapting real-world folklore:
1. Identify the core fears or themes the creature embodies
2. Translate those into mechanical threats (e.g. kelpie drowns victims = Adhesive Hide + drowning talent)
3. Keep one talent that feels mythologically true to the source
4. Write flavor text that evokes the cultural origin without being reductive
5. Use natural language to convey what would be "types" in other systems

---

## Design Philosophy

- **Vibes over complexity** — boil the monster down to its essence; cut the fluff
- **Use natural language** — no formal damage types, sizes, or categories; trust the GM
- **Rules are guidelines** — benchmark against official monsters, then adjust for feel
- Monsters are an art, not a science

---

## Examples

### LV 1 — Simple Creature
```
RIVER SPRITE
A laughing child-sized figure made of rushing water. Leaves tiny wet footprints wherever it walks.
AC 12, HP 4, ATK 1 splash +1 (1d4), MV near (swim), S -1, D +3, C +0, I +1, W +2, Ch +2, AL N, LV 1
Slippery. Creatures attempting to grapple the sprite make DC 12 DEX or fall prone.
```

### LV 5 — Combat Specialist
```
IRON BEAR
A massive bear whose wounds have healed over with plates of rust-red iron. Its roar shakes the earth.
AC 15, HP 26, ATK 2 swipe +5 (1d8) or 1 maul, MV near, S +5, D -1, C +3, I -2, W +1, Ch -2, AL N, LV 5
Maul. Grapple one near target (DC 12 STR to resist). Grappled creatures take 1d6 damage at the start of each of the bear's turns.
Iron Hide. Half damage from non-magical weapons.
```

### LV 7 — Spellcasting Villain
```
THORNWITCH
An ancient woman whose fingers have grown into blackthorn branches. Her eyes are open seed pods.
AC 13, HP 34, ATK 1 spell +5 or 2 thorn +4 (1d6), MV near, S +1, D +2, C +2, I +3, W +3, Ch +2, AL C, LV 7
Briarpatch (WIS Spell). DC 12. Near, 10-ft area. Difficult terrain for 2d4 rounds; creatures entering take 1d4 damage.
Wither (WIS Spell). DC 15. Far, one target. Target's STR becomes -3 for 1d4 rounds.
Thorn Wall (WIS Spell). DC 15. Focus. Near. An impassable wall of thorns fills a near-sized line.
```

### LV 5 — Folklore Creature
```
KELPIE
A sleek black horse standing at the edge of still water, its mane perpetually dripping. Those who touch it find their hands will not let go.
AC 13, HP 24, ATK 2 bite +5 (1d8) or 1 drag under, MV double near (swim), S +4, D +3, C +2, I +1, W +0, Ch +4, AL C, LV 5
Adhesive Hide. A creature that touches the kelpie (including with bare hands) must make DC 12 STR or become stuck until the kelpie dies or releases them.
Drag Under. Pulls one stuck creature into water and submerges. The creature begins drowning and must make DC 12 CON each round or take 1d6 damage.
Alluring Form. Once per day, the kelpie appears as a tame, beautiful horse. DC 15 WIS to see through the illusion.
```
