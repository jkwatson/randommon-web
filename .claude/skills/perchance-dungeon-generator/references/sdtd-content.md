# Shadowdome Thunderdark Content Reference

This file documents the SDTD subsystem — the special dungeon mode that triggers when
`dunType=="Shadowdome Thunderdark"`. The premise: a madcap hunt for a magic feather
that grants a Wish! Tone is surreal, gonzo, neon-lit dungeon-crawl.

## Tone and Style

SDTD content should feel like:
- A blacklight fever dream in a swamp casino
- Frogfolk civilization, crystal parasites, stingbats
- Shadowdark mechanics but with ridiculous names
- Absurdist humor that is still gameable at the table

When adding new content, match the voice: vivid, specific, funny but not silly.

## Stat Block Conventions for SDTD

All SDTD stat blocks use Shadowdark format:
```
<b>NAME</b><br>
<i>Flavor text.</i><br>
AC X, HP X, ATK [attacks], MV near [modifiers], 
S +X, D +X, C +X, I +X, W +X, Ch +X, AL N/C/L, LV X<br>
<b>Special.</b> Description.
```

Movement modifiers: `(fly)`, `(swim)`, `(climb)`, `(burrow)`

## Existing Named SDTD Stat Blocks

### Foes (mob-level)
- **frogfolk** — LV 1, spear, jump ability
- **frogfolkKnight** — LV 3, plate+shield, bastard sword, jump
- **mushySwarm** — LV 4, carnivorous mushrooms, spore spray, stealth
- **explodingToad** — LV 0, 1 HP, explodes at 0 HP (FAFO ability)
- **vampireStingbat** — LV 1, blood drain, undead, sun sensitivity
- **bogle** — LV 2, fey, slippery, glutton

### Solo Monsters (named)
- Enormous frog (paralyzing breath)
- Mesmerotoad (hypnotic, eats gear)
- Crystal golem (crystal shards, neon flash)
- Arachnid hog (fast, wall climb)
- The Main, Maine Coon (LV 5 lion, Cheshire cat voice)
- Mantatrice (manticore+cockatrice, petrifying smoke, heat-seeking barbs)
- **crystallineGiantCrab** — LV 5, prismatic laser (named stat block)
- **theHatefulGoose** — LV 5, immune to fire/mind, fire breath (named stat block)
- Crystal-warped crocodile (magic missile, telepathic)
- Cursed conductor (forced movement, creepy songs)
- Gelatinous cube (glow sticks, prismatic lasers, phasing)
- **oilMonkii** — LV 4, STR/DEX swapped, pickpocket (named stat block)

### Bosses
- The Lavender Mega-Toad (hungry, distracted by food)
- Shibberwins the Night Hag (iron cauldron, summons toads)
- The Shimmering (aboleth, crystal controller, frogfolk god)
- Ossified swamp dragon (undead, zombie-hand breath, missing back half)
- The Knight of the Pond (frogfolk on giant frog mount, swallow)
- Crystaltron 6400b (stone golem from the future)
- Rahot, Sand Ooze (LV 10 black pudding, neon red, burns crystal walls)
- The Jagged Crown (insists it's a polymorphed wizard)
- The Opal-Lich (sapphire eyes, opal bones, full of spiders, tending tomatoes)
- Guhuru, King of Spores (LV 8 mushroomfolk, neon herbs, spore sleep)

### Non-mob encounters
- **vivianiteCorpse** — LV 2 zombie variant, infected (killed humanoids rise in 1hr)

## Content Categories

### sdtdEmptyRoom (50 items)
Surreal, vivid room descriptions. No monsters, no traps. Range from melancholy to
absurd. All are gameable and evocative. When adding: be specific, lean into the
frog/crystal/neon aesthetic.

### sdtdHazard (12 items)
Format: `[Name], [Primary effect], [Secondary effect]`
Three comma-separated elements: environmental name, mechanical harm, side effect.

### sdtdTrap (12 items)
Format: `[Name], trigger: [what sets it off]; [effect]`

### sdtdNPC (12 items)
Format: `[Ancestry], [Alignment], [Description/motivation]`
Alignments: Chaotic, Neutral, Lawful. Keep a mix.

### sdtdTreasure (50 items)
Mostly unique magic items. Some mundane with twist. One-sentence format: name, then
brief mechanical effect if any. SDTD treasure should feel neon-weird and specific.

### sdtdEncounters (50 items)
Wandering encounters for the SDTD dungeon. Mix of: dangerous, strange, comic relief,
potentially useful. Many reference `[frogfolk]` to pull in the stat block.

### mob (12 entries)
Format: `[dice("XdY")] [creature type]<br>[namedStatBlock]` or just the creature count.
The `mobWeirdness1` and `mobWeirdness2` tables apply modifiers to any mob.

## Conditional System

SDTD content triggers via:
```
^[dunType=="Shadowdome Thunderdark"]
```

And regular content is suppressed with:
```
^[dunType!="Shadowdome Thunderdark"]
```

The `roomSelection` list dispatches:
- `contentAndTreasure` — only if NOT SDTD
- `stockingExpanded` — only if NOT SDTD
- `sdtdStuff` — only if SDTD

## Adding New SDTD Content

### New mob type
Add to `mob` list with format `[dice] creature<br>[statBlockName]`. Create the named
stat block list separately. Add any new `mobWeirdness` options to both tables if desired.

### New solo monster
Add a line to `soloMonster`. If it needs a full stat block, create a named list (like
`crystallineGiantCrab`) and reference it inline with `<br>[listName]`.

### New boss
Add to `bossMonster`. Bosses should have: a memorable gimmick, one mechanical twist,
and a dash of personality/humor in the description.

### New treasure
Add to `sdtdTreasure`. One to two sentences max. If it has a mechanical effect,
italicize the name or bold it for clarity — but match the existing style.

### New NPC
Add to `sdtdNPC`. Format: `Ancestry, Alignment, Motivational description`.
Lean into the absurd. The "Goblin, Neutral, Obsessed dancer" entry is a good template.
