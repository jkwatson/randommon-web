---
name: perchance-dungeon-generator
description: >
  Use this skill whenever the user wants to add features, fix bugs, or extend their Perchance
  dungeon generator (or any Perchance generator). Triggers on: "add X to my generator",
  "how do I make perchance do X", "write perchance syntax for X", "help with my perchance
  generator", "add a list for X", "make the output show Y", "how do I use weights/conditions/
  imports in perchance", "add a new room/monster/NPC/table to my generator". Use this even
  if the user just pastes a block of Perchance code and asks for help — assume it's their
  generator. This skill covers both the Perchance syntax and the specific conventions of this
  user's dungeon generator.
---

# Perchance Dungeon Generator Skill

The user has a working dungeon generator at perchance.org. It is a Shadowdark RPG-flavored
dungeon stocking tool. Read this skill before writing any Perchance code.

## Key facts about THIS generator

- It uses `pl` (party level) as a variable: `pl=1`
- It imports two plugins: `dice-plugin` (as `dice`) and `d4caltrops-magic-items` (as `d4MagicItem`)
- Dungeon type is captured early: `dunType=[dungeonType]`
- Three factions are pre-rolled: `faction1`, `faction2`, `faction3`
- The main outputs are `dungeon` (overview) and `room`/`poiType` (individual rooms)
- **Shadowdome Thunderdark** is a special dungeon type with its own content branch (`sdtdStuff`)
- **Crypt** type biases toward undead monsters using conditional weighting
- Monster stat blocks follow **Shadowdark RPG** format: AC, HP, ATK, MV, S/D/C/I/W/Ch, AL, LV

## Perchance Syntax Reference

### Basics
```
listName
  item1
  item2^3      ← weighted 3x
  item3^0      ← never selected (disabled)
```

### Referencing lists
```
[listName]           ← random item from list
[listName.selectOne] ← same, explicit
{option1|option2}    ← inline list (equal weight)
{rare^1|common^5}   ← inline weighted
```

### Variables and conditionals
```
myVar = someValue               ← set a variable
[myVar]                         ← use a variable

item^[condition]                ← conditional weight (0 or truthy)
item^[dunType=="Crypt"]         ← only shows if dunType is Crypt
item^[dunType!="Shadowdome Thunderdark"]
item^[dunType=="Crypt" ? 5 : 2] ← ternary: 5x if Crypt, else 2x
```

### Dice
```
[dice("1d6")]        ← rolls 1d6
[dice("2d4+1")]      ← rolls 2d4+1
[dice("1d4")*10]     ← multiply result
```

### selectMany and joinItems
```
[list.selectMany(3).joinItems(", ")]     ← pick 3, join with comma
[list.selectMany(numVar).joinItems("<br>")] ← pick numVar items
```

### HTML in output
Items can contain raw HTML. The generator uses:
- `<b>bold</b>`, `<i>italic</i>`, `<h2>`, `<h3>`, `<h4>`
- `<br>` for line breaks
- `<ul><li>...</ul>` for lists
- `<a href\="url" target\="_blank">link text</a>` ← note escaped `\=`

### Imports
```
myAlias = {import:plugin-name}
[myAlias.output]   ← use the imported generator's output
```

### Computed values
```
[10*dice("2d3")]    ← arithmetic in references
[hd >= 0 ? ("+" + hd) : hd]   ← JS ternary expressions work
```

### selectOne with assignment
```
[hd = combat.selectOne, ""]   ← assign during selection, output ""
```

## Generator conventions to follow

### Stat block format (Shadowdark)
```
<b>MONSTER NAME</b><br>
<i>Flavor description.</i><br>
AC X, HP X, ATK X attack +X (Xd X) or special, MV near, 
S +X, D +X, C +X, I +X, W +X, Ch +X, AL N/C/L, LV X<br>
<b>Special Ability.</b> Description.
```

### Room output format
```
<h2>Room [size]x[size]</h2>
Formerly a [dungeonRooms]<br>
<h3>Details</h3>[roomSelection]<br>[roomLinks]
```

### Link format
```
[direction] - [linkType]
```

### NPC format
```
<b>[ancestry]</b><br>
<i>background</i>: [npc]<br>
<i>mannerism</i>: [mannerisms]<br>
<i>asset</i>: [assets]<br>
<i>liability</i>: [liabilities]<br>
<i>goal</i>: [npcGoals]
```

### Treasure format
Uses three tier lists: `Treasure03` (lvl 0-3), `Treasure46` (lvl 4-6), `Treasure79` (lvl 7-9).
The `Treasure` list randomly picks between a tiered display and a d4caltrops magic item.

## Common tasks and how to do them

### Adding a new dungeon type
1. Add it to `dungeonType` with a weight
2. Add a matching entry to `type` with the condition `^[dunType=="YourType"]`
3. If it needs special room content, consider a new branch in `roomSelection`

### Adding a new monster stat block
Add to `undeadMonster`, `sdMonster`, or create a new named list. Follow the stat block format above.
For the procedural `sdMonster`, the system uses `combat`, `quality`, `strength`, `weakness`, `mutation1/2/3`.

### Adding a new NPC ancestry
1. Add a `[ancestry]Names` list with 20 names
2. Add the ancestry to `npcAncestry` referencing the new name list

### Adding content to existing tables
Just add indented items to the relevant list. Use `^N` for weight. Disable with `^0`.

### Creating a new special room type for Shadowdome Thunderdark
Add to `sdtdRoom`. Can include embedded stat blocks directly or reference named stat block lists.

### Adding a new faction
Add to `factions`. No other changes needed — factions are pre-rolled into faction1/2/3.

## What NOT to do

- Don't break the `dunType` conditional system — always match strings exactly
- Don't use `form` HTML tags (not supported in Claude artifact context, but Perchance itself is fine)
- Don't forget to escape `=` in HTML attributes: `href\="..."` not `href="..."`
- Don't use `pl` variable directly in expressions unless you mean party level math
- Don't remove the `dice` and `d4MagicItem` import lines at the top

## Reference files

- `references/sdtd-content.md` — All Shadowdome Thunderdark stat blocks and content lists
- `references/existing-lists.md` — Index of all major list names in the generator for quick lookup

Read these when you need to add to or modify specific subsystems.
