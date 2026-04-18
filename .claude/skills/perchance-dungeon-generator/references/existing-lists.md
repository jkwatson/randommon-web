# Existing Lists Index

Quick reference for all major lists in the generator. Use this to avoid duplicating
list names and to know where to add content.

## Top-level outputs
- `title` — generator title
- `dungeon` — full dungeon overview block
- `room` — individual room generator
- `poiType` — room type picker (room / corridor / natural room)
- `crawlingEvent` — wandering encounter table

## Dungeon structure
- `dungeonType` — dungeon type list (Bastion, Mine, Temple, Crypt, etc.)
- `dunType` — pre-rolled dungeon type variable
- `type` — descriptive type text with conditional final room content
- `size` — Small/Medium/Big
- `architecture` — Human/Luxurious/Dwarven/Elven/Foreign/Elder
- `aesthetic` — Burnt/Crystalline/Demonic/Flooded/etc. (or "-" for none)
- `factions` — master faction list
- `faction1/2/3` — pre-rolled faction variables
- `factionChoice` — random pick from the three pre-rolled factions

## Room content
- `roomSelection` — dispatches to contentAndTreasure, stockingExpanded, or sdtdStuff
- `contentAndTreasure` — standard room content (trap/empty/special/monster/NPC)
- `stockingExpanded` — d4caltrops expanded stocking suggestions
- `emptyType` — furniture/feature in empty rooms
- `special` — special room feature list
- `specialDetails` — GM advice for special rooms

## Rooms and corridors
- `dungeonRooms` — room types (armory, crypt, forge, etc.)
- `buildingRooms` — building room subtypes
- `upperClassBuildings` / `lowerClassBuildings` — building types
- `corridorDetails` — optional corridor content
- `entranceRoom` — entrance room block
- `entranceGuards` — entrance guard options
- `numEntranceLinks` / `entranceLinks` — entrance room exits
- `numLinks` / `numCorridorLinks` — room exit counts
- `roomLinks` / `corridorLinks` — exit display blocks

## Links and doors
- `link` — a single exit (direction + type)
- `direction` — N/S/E/W/NE/etc.
- `linkType` — passage/door/obstacle/vertical/secret
- `normalDoor` — opening/wooden/stone/metal
- `obstacleType` — stuck/locked/portcullis/magic
- `magicDoor` — demon door / sealed
- `demonDoorTask` — what a demon door wants
- `verticalType` — stairs/ladder/rope/etc.
- `bothWayType` — two-way vertical types
- `hole` — one-way down
- `secretLinkType` — secret door or hidden stairs
- `secretLink` — secret door details
- `hiddenDoor` — what hides the hidden door
- `camouflaged` — how a secret is concealed
- `SecretDoorConcealment` — extended flavor concealment descriptions
- `plainSight` — secret in plain sight types
- `mechanism` — how to open the secret
- `clue` — hint that it exists
- `doorOpens` — how a weird door opens
- `weirdDoors` — sentient/unusual door descriptions

## Monsters
- `monster` — main monster generator (procedural animal-based or sdMonster or undead)
- `sdMonster` — Shadowdark stat block format monster
- `undeadMonster` — specific named undead stat blocks
- `combat` — level range relative to `pl`
- `quality` / `strength` / `weakness` — sdMonster attributes
- `mutation` / `mutation1/2/3` / `numMutations` — optional mutations
- `animal` / `aerialAnimals` / `terrestrialAnimals` / `aquaticAnimals` — base animals
- `monsterFeature` / `monsterTraits` / `monsterAbilities` / `monsterTactics` / `monsterPersonality` / `monsterWeakness`

## NPCs
- `npcWithDetails` — full NPC block
- `npcAncestry` — ancestry + name picker
- `humanNames` / `halfOrcNames` / `halflingNames` / `goblinNames` / `elfNames` / `dwarfNames`
- `npc` / `civilizedNPC` / `underworldNPC` / `wildernessNPC`
- `assets` / `liabilities` / `npcGoals` / `mannerisms`
- `misfortunes` / `missions` / `methods` / `secrets` / `reputations` / `hobbies`
- `personalities` / `physicalDetails` / `apperances` / `clothing` / `relationships`

## Traps & hazards
- `trapType` — trap types (very long list)
- `trapDetails` — GM advice for traps
- `magicEffect` — magic trap/effect types

## Treasure
- `Treasure` — main treasure block (picks between tiered and magic item)
- `Treasure03` / `Treasure46` / `Treasure79` — level-tiered treasure tables
- `UnguardedTreasure` — unguarded treasure display
- `HiddenTreasure` — ways treasure is concealed
- `valuableMaterials` — gemstones and precious materials
- `treasureItems` / `treasureTraits` — treasure item types and traits
- `d4MagicItem` — imported magic item generator

## Environment / flavor
- `Smell` / `GoodSmells` / `BadSmells` / `UglySmells`
- `dungeonSound` / `sound` / `volume` / `soundDirection`
- `hallways` — corridor decoration descriptions
- `Decoration` — wrapper for hallways
- `emptyType` — room contents when empty
- `InteractiveScenery` — interactive environmental elements
- `Furniture` / `furnitureType` / `furnitureDesc1` / `furnitureDesc2`
- `Statue` / `sculptures` — statue descriptions
- `FountainSpringOrPool` / `pools` — pool/fountain descriptions
- `bottomOfPit` — what's at the bottom of a pit trap
- `flora` / `fauna` — harmless dungeon flora and fauna
- `HarmlessDungeonFlora` / `HarmlessDungeonFauna` — wrappers for flora/fauna
- `DiscardedItems` / `discardedItem` — random loot in rooms

## Secret doors (extra flavor)
- `SecretOrConcealedDoor` / `doorOpens` — how a door opens
- `UnusualDoor` / `weirdDoors` — quirky sentient doors

## Shadowdome Thunderdark content
- `sdtdStuff` — SDTD room content dispatcher
- `sdtdRoom` — SDTD room type picker
- `sdtdEvent` — wandering event table
- `sdtdNPC` — SDTD NPCs
- `sdtdMonsterMob` — mob encounters
- `sdtdLightMishap` — torch/light problems
- `sdtdEmptyRoom` — SDTD empty room descriptions
- `sdtdHazard` — SDTD environmental hazards
- `sdtdTrap` — SDTD traps
- `sdtdTreasure` — SDTD treasure items
- `sdtdEncounters` — SDTD wandering encounters
- `mob` — mob type picker
- `mobWeirdness1` / `mobWeirdness2` — mob modifiers
- `soloMonster` — named solo monsters
- `bossMonster` — named boss monsters
- `crawlingEvent` — event table with wrapper
- Named stat blocks: `frogfolk`, `frogfolkKnight`, `mushySwarm`, `explodingToad`,
  `vampireStingbat`, `bogle`, `crystallineGiantCrab`, `theHatefulGoose`, `oilMonkii`,
  `vivianiteCorpse`

## Misc
- `reputation` / `Reputation` — NPC reputation table and wrapper
- `Mien` — link to d4caltrops mien tables
- `TraceTrackSpoor` — link to d4caltrops spoor tables
- `afterTheParty` — post-session consequences
- `divineDomains` — deity domain generator
- `spell` — spell name generator
- `physicalElements` / `etherealElements` / `physicalEffects` / `etherealEffects`
- `physicalForms` / `etherealForms`
- `item` / `miscellaneousItems` / `wornItems` / `weaponItems` / `toolItems`
- `potions` / `magicIngredients` / `bookSubjects` / `ediblePlants` / `poisonousPlants`
- `insanities` / `mutations`
- `dice` — imported dice plugin
- `pl` — party level variable (default 1)
