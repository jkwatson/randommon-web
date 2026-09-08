import { createEngine, rollDice } from '@wandering-monstrum/perchance-engine';
import { getDB } from '../monsterStore.js';
import { generateKeyNPCStatblock } from '../encounters/mortals.js';
import wildernessStocking from '../../tables/wilderness-stocking.txt?raw';
import dungeonStocking from '../../tables/dungeon-stocking.txt?raw';

// Shared faction/NPC tables live in dungeon-stocking.txt; wilderness content in its own file.
const engine = createEngine(wildernessStocking + '\n\n' + dungeonStocking);

// ── Terrain definitions ────────────────────────────────────────────
export const TERRAIN_TYPES = {
  Forest:     { biomes: ['forest'],          tags: ['animal', 'plant', 'fey', 'humanoid'] },
  Hills:      { biomes: ['hills'],           tags: ['animal', 'humanoid', 'giant'] },
  Mountains:  { biomes: ['mountain'],        tags: ['animal', 'dragon', 'giant', 'monstrosity'] },
  Swamp:      { biomes: ['swamp'],           tags: ['animal', 'plant', 'undead', 'aberration'] },
  Grasslands: { biomes: ['grassland'],       tags: ['animal', 'humanoid'] },
  Coast:      { biomes: ['river/coast'],     tags: ['animal', 'humanoid', 'monstrosity'] },
  Desert:     { biomes: ['desert'],          tags: ['animal', 'humanoid', 'monstrosity'] },
  Ruins:      { biomes: ['ruins'],           tags: ['undead', 'humanoid', 'construct'] },
  Borderland: { biomes: ['forest', 'hills', 'ruins'], tags: ['animal', 'humanoid', 'undead'] },
  // Showcase terrain: an old hunting reserve now dominated by a single apex
  // predator (region.beast) — the wilderness counterpart to the dungeon's Menagerie.
  'Feral Preserve': { biomes: ['forest', 'hills', 'grassland'], tags: ['monstrosity', 'animal', 'aberration', 'giant'] },
};

// Maps a terrain name to its adventure-hook table. Falls back to the generic
// table for any terrain without one (shouldn't happen for the fixed list above).
const HOOK_TABLE_BY_TERRAIN = {
  Forest:     'wildernessHookForest',
  Hills:      'wildernessHookHills',
  Mountains:  'wildernessHookMountains',
  Swamp:      'wildernessHookSwamp',
  Grasslands: 'wildernessHookGrasslands',
  Coast:      'wildernessHookCoast',
  Desert:     'wildernessHookDesert',
  Ruins:      'wildernessHookRuins',
  Borderland: 'wildernessHookBorderland',
  'Feral Preserve': 'wildernessHookFeralPreserve',
};

// ── Factions ──────────────────────────────────────────────────────
const WILDERNESS_INHABITANT_FACTIONS = [
  { name: 'wolf pack',                         creature: 'wolves',       tags: ['animal'] },
  { name: 'goblin raiding band',               creature: 'goblins',      tags: ['humanoid'] },
  { name: 'gnoll hunting pack',                creature: 'gnolls',       tags: ['humanoid'] },
  { name: 'orc warband',                       creature: 'orcs',         tags: ['humanoid'] },
  { name: 'bandit company',                    creature: 'bandits',      tags: ['humanoid'] },
  { name: 'kobold ambush clan',                creature: 'kobolds',      tags: ['humanoid'] },
  { name: 'troll family territory',            creature: 'trolls',       tags: ['monstrosity', 'giant'] },
  { name: 'harpy flock',                       creature: 'harpies',      tags: ['monstrosity'] },
  { name: 'lizardfolk hunters',                creature: 'lizardfolk',   tags: ['humanoid'] },
  { name: 'ogre clan',                         creature: 'ogres',        tags: ['giant'] },
  { name: 'wight barrow-lord and thralls',     creature: 'wights',       tags: ['undead'] },
  { name: 'cultist cell',                      creature: 'cultists',     tags: ['humanoid', 'fiend'] },
  { name: 'giant spider colony',               creature: 'giant spiders',tags: ['insect'] },
  { name: 'hill giant territory',              creature: 'hill giants',  tags: ['giant'] },
  { name: 'undead remnant of a routed army',   creature: 'undead',       tags: ['undead'] },
  { name: 'merfolk river-wardens',             creature: 'merfolk',      tags: ['humanoid'] },
];

const WILDERNESS_OUTSIDER_FACTIONS = [
  'merchant caravan', 'royal patrol', 'pilgrim band', 'refugee column',
  "monster hunters' company", "thieves' guild advance party", 'noble house scouts',
  'inquisition warband', 'free company seeking employment',
  "mage's expedition", 'escaped prisoners', 'rival adventuring party',
  'religious order on a mission', 'border garrison patrol',
];

// ── Sizes ─────────────────────────────────────────────────────────
const WILDERNESS_SIZES = [
  { label: 'Compact',   hexes: 8,  factions: 2, weight: 3 },
  { label: 'Medium',    hexes: 12, factions: 2, weight: 5 },
  { label: 'Sprawling', hexes: 20, factions: 3, weight: 3 },
];

// ── Helpers ───────────────────────────────────────────────────────
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function rollWeighted(table) {
  const total = table.reduce((s, e) => s + (e.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const entry of table) {
    r -= (entry.weight ?? 1);
    if (r <= 0) return entry;
  }
  return table[table.length - 1];
}

// ── Module state ──────────────────────────────────────────────────
let currentRegion = null;
export function getCurrentRegion() { return currentRegion; }
export function setCurrentRegion(r) { currentRegion = r; }

// ── Budget ────────────────────────────────────────────────────────
const CONTENT_BASE_WEIGHTS = {
  empty:    3.0,
  monster:  2.0,
  npc:      1.5,
  special:  1.5,
  trap:     0.8,
  trick:    0.6,
  hazard:   1.0,
  obstacle: 0.7,
  weird:    0.3,
};

const CONTENT_TARGETS = {
  empty:    0.30,
  monster:  0.22,
  npc:      0.13,
  special:  0.11,
  trap:     0.07,
  trick:    0.05,
  hazard:   0.07,
  obstacle: 0.04,
  weird:    0.01,
};

export function freshBudget() {
  return { counts: Object.fromEntries(Object.keys(CONTENT_BASE_WEIGHTS).map(k => [k, 0])) };
}

function rollContentType(budget) {
  const placed = Object.values(budget.counts).reduce((a, b) => a + b, 0);
  const adjusted = Object.entries(CONTENT_BASE_WEIGHTS).map(([type, baseW]) => {
    const target = CONTENT_TARGETS[type] ?? 0;
    const actual = placed > 0 ? (budget.counts[type] / placed) : 0;
    const ratio  = target > 0 ? (actual / target) : 1;
    const factor = Math.max(0.25, Math.min(4.0, 2 - ratio));
    return { type, weight: baseW * factor };
  });
  return rollWeighted(adjusted).type;
}

// ── Faction building (mirrors generator.js) ───────────────────────
function pickFactionEntry(terrainTags, allowInhabitants = true) {
  const isInhabitant = allowInhabitants && Math.random() < 0.70;
  if (isInhabitant) {
    const matching = WILDERNESS_INHABITANT_FACTIONS.filter(f =>
      f.tags.some(t => terrainTags.includes(t))
    );
    if (matching.length > 0 && Math.random() < 0.6) return pick(matching);
    return pick(WILDERNESS_INHABITANT_FACTIONS);
  }
  return { name: pick(WILDERNESS_OUTSIDER_FACTIONS), creature: null, tags: [], isOutsider: true };
}

function buildFaction(entry, allNames, partyLevel) {
  const isInhabitant = !entry.isOutsider;
  const others = allNames.filter(n => n !== entry.name);
  const dispositions = Object.fromEntries(
    others.map(other => [other, engine.evaluate('factionDispositionMutual')])
  );
  return {
    name:         entry.name,
    creature:     entry.creature ?? null,
    tags:         entry.tags ?? [],
    isInhabitant,
    goal:         engine.evaluate(isInhabitant ? 'wildernessFactionInhabitantGoal' : 'wildernessFactionOutsiderGoal'),
    npcName:      engine.evaluate('factionKeyNPCName'),
    npcTrait:     engine.evaluate('factionKeyNPCTrait'),
    npcStatblock: generateKeyNPCStatblock(partyLevel),
    secret:       engine.evaluate('wildernessFactionSecret'),
    dispositionTowardPCs: engine.evaluate('factionDispositionPC'),
    dispositions,
  };
}

// Fills in a faction-tied hook template with a randomly chosen rolled faction
// and its Key NPC — e.g. "hired by [npcName] of the [factionName]".
function buildFactionHook(factions) {
  const faction = pick(factions);
  engine.vars.factionName = faction.name;
  engine.vars.npcName = faction.npcName;
  return engine.evaluate('wildernessHookFaction');
}

// Monster Hunt's faction-tied hook always ties to the guaranteed rival
// "monster hunters' company" specifically, so it still reads as a hunt rather
// than an unrelated errand for whichever faction the generic roll landed on.
function buildMonsterHuntFactionHook(factions) {
  const company = factions.find(f => f.name === "monster hunters' company") ?? pick(factions);
  engine.vars.npcName = company.npcName;
  return engine.evaluate('wildernessHookMonsterHuntFaction');
}

// ── Region generation ─────────────────────────────────────────────
// isMonsterHunt is an independent modifier, not a terrain — it seeds a specific
// quarry and a rival hunting company on top of whatever terrain is chosen
// (including Feral Preserve, whose own beast simply doubles as the quarry).
export function generateWildernessRegion(partyLevel = 1, terrainName = 'Forest', isMonsterHunt = false) {
  const terrain = TERRAIN_TYPES[terrainName] ?? TERRAIN_TYPES.Forest;
  const size = rollWeighted(WILDERNESS_SIZES);
  // The Feral Preserve has no permanent inhabitants — the beast dominates the
  // land alone, and any factions present are outsiders drawn in after it.
  const allowInhabitants = terrainName !== 'Feral Preserve';

  const seen = new Set();
  const dedupedEntries = [];
  // Monster Hunt guarantees a rival "monster hunters' company" among the
  // factions — the whole point of the seeded faction that inspired this feature.
  if (isMonsterHunt) {
    const rivalCompany = { name: "monster hunters' company", creature: null, tags: [], isOutsider: true };
    dedupedEntries.push(rivalCompany);
    seen.add(rivalCompany.name);
  }
  while (dedupedEntries.length < size.factions) {
    let entry = pickFactionEntry(terrain.tags, allowInhabitants);
    let attempts = 0;
    while (seen.has(entry.name) && attempts < 10) {
      entry = pickFactionEntry(terrain.tags, allowInhabitants);
      attempts++;
    }
    seen.add(entry.name);
    dedupedEntries.push(entry);
  }
  const factionNames = dedupedEntries.map(e => e.name);
  const factions     = dedupedEntries.map(e => buildFaction(e, factionNames, partyLevel));

  const factionTags = [...new Set(
    factions.filter(f => f.isInhabitant).flatMap(f => f.tags)
  )];

  // Roughly half the time, tie the hook to one of the rolled factions (and its
  // Key NPC) rather than a generic terrain-flavored reason. Monster Hunt always
  // uses the hunt-specific hook table otherwise, regardless of terrain.
  const useFactionHook = factions.length && Math.random() < 0.5;
  const hook = isMonsterHunt
    ? (useFactionHook ? buildMonsterHuntFactionHook(factions) : engine.evaluate('wildernessHookMonsterHunt'))
    : (useFactionHook ? buildFactionHook(factions) : engine.evaluate(HOOK_TABLE_BY_TERRAIN[terrainName] ?? 'wildernessHookGeneric'));

  currentRegion = {
    terrain:     terrainName,
    isMonsterHunt,
    biomes:      terrain.biomes,
    terrainTags: terrain.tags,
    factions,
    factionTags,
    size,
    concept: {
      theme: engine.evaluate('wildernessRegionTheme'),
      story: engine.evaluate('wildernessRegionHook'),
    },
    destination: engine.evaluate('wildernessDestination'),
    entrance:             engine.evaluate('wildernessEntrance'),
    entranceGuard:        null,
    entranceGuardMonster: null,
    budget:      freshBudget(),
    wanderingTable: null,
    totalHexes:  0,
    hooks: [hook],
  };

  const hasCreatureGuard = Math.random() < 0.40;
  currentRegion.entranceGuard = engine.evaluate(
    hasCreatureGuard ? 'wildernessEntranceGuardCreature' : 'wildernessEntranceGuardPassive'
  );
  if (hasCreatureGuard) {
    currentRegion.entranceGuardMonster = pickMonster(partyLevel);
  }

  if (terrainName === 'Feral Preserve') {
    // The beast is a real, randomly-picked monster (uncapped by party level — a
    // final boss shouldn't be constrained the way ordinary encounters are).
    const beastMonster = pickMonster(partyLevel, 2, { uncapped: true });
    currentRegion.beast = {
      specimen:      engine.evaluate('wildernessFeralPreserveSpecimen'),
      trait:         engine.evaluate('wildernessFeralPreserveTrait'),
      epithet:       engine.evaluate('wildernessFeralPreserveEpithet'),
      monster:       beastMonster,
      baseStatblock: beastMonster?.statblock
        ?? 'AC 13, HP 22, ATK 2 claws +4 (1d6) and 1 bite +4 (1d8), MV near, S +4, D +1, C +3, I −2, W +2, Ch −1, AL N, LV 5',
    };
  } else if (isMonsterHunt) {
    // The quarry is a real, randomly-picked monster (uncapped by party level —
    // a contract's target shouldn't be constrained the way ordinary encounters
    // are), matched to whatever terrain was actually chosen.
    const quarryMonster = pickMonster(partyLevel, 2, { uncapped: true });
    currentRegion.beast = {
      specimen:      engine.evaluate('wildernessQuarrySpecimen'),
      trait:         engine.evaluate('wildernessQuarryTrait'),
      epithet:       engine.evaluate('wildernessQuarryEpithet'),
      monster:       quarryMonster,
      baseStatblock: quarryMonster?.statblock
        ?? 'AC 13, HP 26, ATK 2 claws +4 (1d8) and 1 bite +4 (1d10), MV near, S +4, D +1, C +3, I −1, W +2, Ch −1, AL N, LV 6',
    };
  }

  return currentRegion;
}

// ── Exits ─────────────────────────────────────────────────────────
const WILDERNESS_EXIT_DIRECTIONS = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];

const WILDERNESS_EXIT_COUNT_WEIGHTS = [
  { n: 1, weight: 1 },
  { n: 2, weight: 4 },
  { n: 3, weight: 8 },
  { n: 4, weight: 4 },
];

const TERRAIN_PATH_LIST = {
  Forest:     'wildernessPathForest',
  Hills:      'wildernessPathHills',
  Mountains:  'wildernessPathMountains',
  Swamp:      'wildernessPathSwamp',
  Grasslands: 'wildernessPathGrasslands',
  Coast:      'wildernessPathCoast',
  Desert:     'wildernessPathDesert',
  Ruins:      'wildernessPathRuins',
  Borderland: 'wildernessPathBorderland',
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


function rollExits(minExits = 0) {
  const terrain  = currentRegion?.terrain ?? 'Forest';
  const listName = TERRAIN_PATH_LIST[terrain] ?? 'wildernessPathForest';
  const count = Math.max(minExits, rollWeighted(WILDERNESS_EXIT_COUNT_WEIGHTS).n);
  return shuffle(WILDERNESS_EXIT_DIRECTIONS).slice(0, count).map(direction => ({
    direction,
    type: 'open archway',
    label: engine.evaluate(listName),
  }));
}

// ── Monster selection ─────────────────────────────────────────────
// Bosses (and the Feral Preserve's beast) aren't meant to be capped by party
// level — see pickMonster's uncapped option in dungeons/generator.js.
function pickMonster(partyLevel, levelBoost = 0, { uncapped = false } = {}) {
  const db = getDB();
  const pl = parseInt(partyLevel) || 1;

  if (uncapped) {
    // A final boss (or a hunt's quarry) should be a real threat — aim for the
    // party's level (plus boost) as a floor, stepping it down only if nothing
    // matches, so the toughest available monster wins out.
    for (let minLevel = pl + levelBoost; minLevel >= 1; minLevel--) {
      if (currentRegion?.factionTags?.length) {
        const m = db?.random({ tags: currentRegion.factionTags, biome: currentRegion.biomes, minLevel });
        if (m) return m;
      }
      const m = db?.random({ biome: currentRegion?.biomes, minLevel });
      if (m) return m;
    }
    return db?.random({}) ?? null;
  }

  const maxLevel = Math.random() < 0.15 ? pl + 2 + levelBoost : pl + 1 + levelBoost;
  if (currentRegion?.factionTags?.length) {
    const m = db?.random({ tags: currentRegion.factionTags, biome: currentRegion.biomes, maxLevel });
    if (m) return m;
  }
  const m = db?.random({ biome: currentRegion?.biomes, maxLevel });
  if (m) return m;
  return db?.random({ maxLevel }) ?? null;
}

function rollCount(monsterLevel, partyLevel) {
  const diff = (parseInt(monsterLevel) || 1) - (parseInt(partyLevel) || 1);
  if (diff >= 2)  return 1;
  if (diff >= 1)  return Math.ceil(Math.random() * 2);
  if (diff >= 0)  return rollDice('1d3');
  if (diff >= -1) return rollDice('1d4');
  return rollDice('1d6');
}

function treasureForLevel(partyLevel) {
  if (partyLevel <= 3) return engine.evaluate('Treasure03');
  if (partyLevel <= 6) return engine.evaluate('Treasure46') || engine.evaluate('Treasure03');
  return engine.evaluate('Treasure79') || engine.evaluate('Treasure46');
}

// ── Hex atmosphere ────────────────────────────────────────────────
function atmosphere(minExits = 0) {
  return {
    exits:          rollExits(minExits),
    weather:        engine.evaluate('wildernessWeather'),
    terrainFeature: Math.random() < 0.65 ? engine.evaluate('wildernessTerrainFeature') : null,
    sign:           Math.random() < 0.35 ? engine.evaluate('wildernessEmptyFeature') : null,
  };
}

const WILDERNESS_ACTIVITIES = [
  'hunting', 'resting', 'drinking at the water', 'feeding', 'marking territory',
  'moving through', 'sleeping', 'watching from cover', 'returning to lair', 'foraging',
  'following the party', 'crossing ahead',
];

const FINAL_HEX_WEIGHTS = [
  { type: 'monster', weight: 3 },
  { type: 'special', weight: 2 },
  { type: 'npc',     weight: 1 },
];

// A handful of named phenomena get their own bespoke follow-up table instead
// of the generic wildernessLandmarkDetail — mirrors dungeonSpecial's approach.
const WILDERNESS_SPECIAL_EXTRA_LISTS = {
  'A fairy ring of mushrooms, unnervingly perfect, pulsing faintly at dusk': 'wildernessPhenomenonFairyRing',
  'A circle of standing stones, none matching the local rock, arranged with clear purpose': 'wildernessPhenomenonStandingStones',
  'Something petrified mid-stride — a person, or what was once a person, turned entirely to stone': 'wildernessPhenomenonPetrifiedTraveler',
  'An animal that speaks, plainly, and without apparent surprise at doing so': 'wildernessPhenomenonTalkingAnimal',
  "A will-o'-the-wisp drifting along a fixed, repeating path every night": 'wildernessPhenomenonWillOWisp',
};

const SPECIAL_KIND_WEIGHTS = [
  { kind: 'ruin',       weight: 35 },
  { kind: 'landmark',   weight: 35 },
  { kind: 'phenomenon', weight: 30 },
];

// ── Hex stocking ─────────────────────────────────────────────────
export function stockHex(partyLevel, { minExits = 0, isFinalHex = false, finalHexDesc = null } = {}) {
  const budget      = currentRegion?.budget;
  const contentType = isFinalHex
    ? rollWeighted(FINAL_HEX_WEIGHTS).type
    : rollContentType(budget ?? { counts: {} });

  if (budget && !isFinalHex) {
    budget.counts[contentType] = (budget.counts[contentType] ?? 0) + 1;
  }

  const atmo    = atmosphere(minExits);
  const terrain = currentRegion?.terrain ?? 'Wilderness';
  const faction = currentRegion ? pick(currentRegion.factions) : null;

  switch (contentType) {
    case 'empty':
      return { contentType, terrain, finalHexDesc, ...atmo };

    case 'monster': {
      // Feral Preserve's / Monster Hunt's final hex uses the Beast/Quarry rather
      // than a random DB monster
      const isBeast = isFinalHex && !!currentRegion?.beast;
      const levelBoost = isFinalHex ? 2 : 0;
      const monster = isBeast ? null : pickMonster(partyLevel, levelBoost, { uncapped: isFinalHex });
      return {
        contentType, terrain, finalHexDesc, ...atmo,
        monster,
        isBeast,
        beast:    isBeast ? currentRegion.beast : null,
        count:    isBeast ? 1 : (monster ? rollCount(monster.level, partyLevel) : 0),
        activity: pick(WILDERNESS_ACTIVITIES),
        faction:  Math.random() < 0.30 ? faction : null,
        treasure: Math.random() < 0.45 ? { item: treasureForLevel(partyLevel) } : null,
      };
    }

    case 'npc': {
      const isSettlement = Math.random() < 0.30;
      return {
        contentType, terrain, finalHexDesc, ...atmo,
        isSettlement,
        npcRole:   engine.evaluate(isSettlement ? 'wildernessSettlement' : 'wildernessNPCRole'),
        npcDesire: isSettlement ? null : engine.evaluate('wildernessNPCDesire'),
        npcMood:   engine.evaluate('wildernessNPCMood'),
        faction:   Math.random() < 0.25 ? faction : null,
      };
    }

    case 'special': {
      const specialKind = rollWeighted(SPECIAL_KIND_WEIGHTS).kind;
      if (specialKind === 'phenomenon') {
        const special = engine.evaluate('wildernessPhenomenon');
        const extraList = WILDERNESS_SPECIAL_EXTRA_LISTS[special];
        return {
          contentType, terrain, finalHexDesc, ...atmo,
          specialKind, special,
          specialDetail: engine.evaluate('wildernessLandmarkDetail'),
          specialExtra:  extraList ? engine.evaluate(extraList) : null,
          treasure: Math.random() < 0.25 ? { item: treasureForLevel(partyLevel) } : null,
        };
      }
      return {
        contentType, terrain, finalHexDesc, ...atmo,
        specialKind,
        special:       engine.evaluate(specialKind === 'ruin' ? 'wildernessRuin' : 'wildernessLandmark'),
        specialDetail: engine.evaluate('wildernessLandmarkDetail'),
        treasure: specialKind === 'ruin' && Math.random() < 0.40 ? { item: treasureForLevel(partyLevel) } : null,
      };
    }

    case 'trap':
      return {
        contentType, terrain, finalHexDesc, ...atmo,
        trapType:   engine.evaluate('wildernessTrapType'),
        trapTell:   engine.evaluate('wildernessTrapTell'),
        trapDetail: engine.evaluate('wildernessTrapDetail'),
        treasure: Math.random() < 0.20 ? { item: treasureForLevel(partyLevel) } : null,
      };

    case 'trick':
      return {
        contentType, terrain, finalHexDesc, ...atmo,
        trick:       engine.evaluate('wildernessTrick'),
        trickDetail: engine.evaluate('wildernessTrickDetail'),
      };

    case 'hazard':
      return {
        contentType, terrain, finalHexDesc, ...atmo,
        hazard:       engine.evaluate('wildernessHazard'),
        hazardDetail: engine.evaluate('wildernessHazardDetail'),
      };

    case 'obstacle':
      return {
        contentType, terrain, finalHexDesc, ...atmo,
        obstacle:       engine.evaluate('wildernessObstacle'),
        obstacleDetail: engine.evaluate('wildernessObstacleDetail'),
      };

    case 'weird':
      return {
        contentType, terrain, finalHexDesc, ...atmo,
        weird: engine.evaluate('wildernessWeird'),
      };
  }
}

// ── Wandering table ───────────────────────────────────────────────
const WILDERNESS_WANDERING_ACTIVITIES = [
  'moving through', 'hunting', 'patrolling', 'returning to camp', 'searching for something',
];

const WILDERNESS_WANDERING_SIGNS = [
  'Fresh tracks crossing the path — large, within the hour',
  'Something watching from the treeline; gone when you look directly',
  'A dead animal on the path, uneaten — territorial warning',
  'Distant smoke; camp or wildfire, no way to tell',
  'The sound of something large moving parallel in the undergrowth',
  'Fresh horse dung on the trail — riders, moving fast',
  'A tripwire recently cut through — someone found it first',
  'A dead fire with a single boot beside it; nothing else',
  'Arrows embedded in trees along the path, pointing backward',
  'A crude marker torn down and left on the ground',
];

const WILDERNESS_BEAST_SIGNS = [
  'Claw marks on a tree trunk at twice a person\'s height, still weeping sap',
  'A hunting party\'s abandoned camp — gear intact, no bodies, no blood',
  'Territorial markings that no known animal makes, spaced with clear intention',
  'The remains of prey too large for any common predator to have brought down alone',
  "An old warden's equipment, rusted, half-buried, clearly dropped in a hurry",
  'A section of old fence or wall, broken outward from the inside',
];

const WILDERNESS_QUARRY_SIGNS = [
  'Fresh kill, still warm, fed on but not finished — deliberately left, or interrupted?',
  "A tracker's broken equipment, abandoned mid-pursuit",
  'Claw or tooth marks matching no catalogued creature exactly',
  "A trail that doubles back on itself, as if the quarry knows it's being followed",
  'Territory marking fresher than anything the local trackers have seen before',
  "A rival hunting party's signal fire, unanswered for two days",
];

export function generateWildernessWanderingTable(partyLevel) {
  const r = currentRegion;
  if (!r) return null;

  const [f0, f1, f2] = r.factions;

  function lookupCreature(name) {
    if (!name) return null;
    const db = getDB();
    return db?.get(name) || db?.get(name.replace(/s$/i, '')) || db?.get(name.replace(/ies$/i, 'y')) || null;
  }

  // Inhabitant factions get their real creature's stat block; outsider factions
  // (people, not monsters) fall back to their faction's own Key NPC stat block,
  // already generated and printed in the Factions section, so a random patrol
  // isn't left with no stats at all.
  function factionMonster(faction) {
    return lookupCreature(faction.creature) ?? (faction.npcStatblock ? { statblock: faction.npcStatblock } : null);
  }

  function monsterLine(levelBoost = 0) {
    const m = pickMonster(partyLevel, levelBoost);
    if (!m) return { text: 'a territorial creature, drawn by noise or scent', monster: null };
    const count = rollDice('1d4');
    return { text: `${count > 1 ? `${count}× ` : ''}${m.name} (LV ${m.level})`, monster: m };
  }

  function patrolEntry(faction) {
    const text = faction.isInhabitant && faction.creature
      ? `${faction.creature} (${faction.name}), 1d4, ${pick(WILDERNESS_WANDERING_ACTIVITIES)} — ${faction.goal}`
      : `${faction.name} operatives, 1d4, ${pick(WILDERNESS_WANDERING_ACTIVITIES)} — ${faction.goal}`;
    return { text, monster: factionMonster(faction) };
  }

  function loneEntry(faction) {
    const text = faction.isInhabitant && faction.creature
      ? `lone ${faction.creature.replace(/s$/, '')} from the ${faction.name} — separated or scouting; the group's goal: ${faction.goal}`
      : `lone ${faction.name} member — lost or abandoned; the group's goal: ${faction.goal}`;
    return { text, monster: factionMonster(faction) };
  }

  if (r.beast) {
    // The Monster Hunt framing (contract, tracking, a rival company) applies
    // whenever the checkbox was on, even if the beast actually came from a
    // Feral Preserve rolled alongside it.
    const isHunt = !!r.isMonsterHunt;
    const label = isHunt ? 'THE QUARRY' : 'THE BEAST';
    const signs = isHunt ? WILDERNESS_QUARRY_SIGNS : WILDERNESS_BEAST_SIGNS;
    const territoryWord = isHunt ? "the quarry's range" : "the beast's territory";
    const beastLabel = `${r.beast.epithet} (${r.beast.specimen})`;
    const ml6  = monsterLine();
    const ml7b = monsterLine();
    const lone4b  = f1 ? loneEntry(f1) : { text: 'a lone hunter, lost and off the marked trails', monster: null };
    const lone10b = f0 ? loneEntry(f0) : { text: 'a lone hunter, wounded and desperate', monster: null };
    const pat8b   = (f2 ?? f1) ? patrolEntry(f2 ?? f1) : { text: 'a hunting party, weapons drawn', monster: null };
    const table = [
      { roll: 2,  entry: `${label} — ${beastLabel} · ${r.beast.trait}; it is here, now, hunting`,   monster: r.beast.monster },
      { roll: 3,  entry: `Sign: ${pick(signs)}`,                                                    monster: null },
      { roll: 4,  entry: `${lone4b.text} — moving away from ${territoryWord}`,                      monster: lone4b.monster },
      { roll: 5,  entry: pick(WILDERNESS_WANDERING_SIGNS),                                          monster: null },
      { roll: 6,  entry: `${ml6.text}, prey fleeing something bigger, ${pick(WILDERNESS_WANDERING_ACTIVITIES)}`, monster: ml6.monster },
      { roll: 7,  entry: `${ml7b.text}, ${pick(WILDERNESS_WANDERING_ACTIVITIES)}`,                  monster: ml7b.monster },
      { roll: 8,  entry: `${pat8b.text} — armed for something big, watching every shadow`,          monster: pat8b.monster },
      { roll: 9,  entry: f0 && f1 ? `${f0.name} and ${f1.name} survivors — reluctant truce, both trying to leave` : 'Two hunting parties converging, neither aware of the other', monster: null },
      { roll: 10, entry: `${lone10b.text} — wounded and terrified, will trade everything they know`, monster: lone10b.monster },
      { roll: 11, entry: `Sign: ${pick(signs)}`,                                                    monster: null },
      { roll: 12, entry: `${isHunt ? 'The quarry' : 'The beast'}, inexplicably still — ${r.beast.trait} — then it moves`, monster: r.beast.monster },
    ];
    r.wanderingTable = table;
    return table;
  }

  const ml3    = monsterLine(2);
  const ml7    = monsterLine();
  const lone4  = loneEntry(f1);
  const lone10 = loneEntry(f0);
  const pat6   = patrolEntry(f0);
  const pat8   = patrolEntry(f2 ?? f1);

  const table = [
    { roll: 2,  entry: `${f0.name.toUpperCase()} IN FORCE — ${f0.goal}`,                              monster: factionMonster(f0) },
    { roll: 3,  entry: `${ml3.text}, actively hunting — intent, not chance`,                          monster: ml3.monster },
    { roll: 4,  entry: lone4.text,                                                                     monster: lone4.monster },
    { roll: 5,  entry: `Sign: ${pick(WILDERNESS_WANDERING_SIGNS)}`,                                   monster: null },
    { roll: 6,  entry: pat6.text,                                                                      monster: pat6.monster },
    { roll: 7,  entry: `${ml7.text}, ${pick(WILDERNESS_WANDERING_ACTIVITIES)}`,                       monster: ml7.monster },
    { roll: 8,  entry: pat8.text,                                                                      monster: pat8.monster },
    { roll: 9,  entry: `${f1.name} and ${f2 ? f2.name : 'unknown party'} converging — neither aware of the other yet`, monster: null },
    { roll: 10, entry: `${lone10.text} — injured, may bargain`,                                       monster: lone10.monster },
    { roll: 11, entry: `Sign: ${pick(WILDERNESS_WANDERING_SIGNS)}`,                                   monster: null },
    { roll: 12, entry: `Something inexplicable: ${engine.evaluate('wildernessWeird')}`,               monster: null },
  ];

  r.wanderingTable = table;
  return table;
}
