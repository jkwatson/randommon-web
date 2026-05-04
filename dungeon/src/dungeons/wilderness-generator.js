import { createEngine, rollDice } from '@wandering-monstrum/perchance-engine';
import { getDB } from '../monsterStore.js';
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
  hazard:   1.0,
  obstacle: 0.7,
  weird:    0.3,
};

const CONTENT_TARGETS = {
  empty:    0.35,
  monster:  0.25,
  npc:      0.15,
  special:  0.12,
  hazard:   0.08,
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
function pickFactionEntry(terrainTags) {
  const isInhabitant = Math.random() < 0.70;
  if (isInhabitant) {
    const matching = WILDERNESS_INHABITANT_FACTIONS.filter(f =>
      f.tags.some(t => terrainTags.includes(t))
    );
    if (matching.length > 0 && Math.random() < 0.6) return pick(matching);
    return pick(WILDERNESS_INHABITANT_FACTIONS);
  }
  return { name: pick(WILDERNESS_OUTSIDER_FACTIONS), creature: null, tags: [], isOutsider: true };
}

function buildFaction(entry, allNames) {
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
    goal:         engine.evaluate(isInhabitant ? 'factionInhabitantGoal' : 'factionOutsiderGoal'),
    npcName:      engine.evaluate('factionKeyNPCName'),
    npcTrait:     engine.evaluate('factionKeyNPCTrait'),
    secret:       engine.evaluate('factionSecret'),
    dispositionTowardPCs: engine.evaluate('factionDispositionPC'),
    dispositions,
  };
}

// ── Region generation ─────────────────────────────────────────────
export function generateWildernessRegion(partyLevel = 1, terrainName = 'Forest') {
  const terrain = TERRAIN_TYPES[terrainName] ?? TERRAIN_TYPES.Forest;
  const size = rollWeighted(WILDERNESS_SIZES);

  const seen = new Set();
  const dedupedEntries = Array.from({ length: size.factions }, () => {
    let entry = pickFactionEntry(terrain.tags);
    let attempts = 0;
    while (seen.has(entry.name) && attempts < 10) {
      entry = pickFactionEntry(terrain.tags);
      attempts++;
    }
    seen.add(entry.name);
    return entry;
  });
  const factionNames = dedupedEntries.map(e => e.name);
  const factions     = dedupedEntries.map(e => buildFaction(e, factionNames));

  const factionTags = [...new Set(
    factions.filter(f => f.isInhabitant).flatMap(f => f.tags)
  )];

  currentRegion = {
    terrain:     terrainName,
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
    budget:      freshBudget(),
    wanderingTable: null,
    totalHexes:  0,
  };

  return currentRegion;
}

// ── Exits ─────────────────────────────────────────────────────────
const WILDERNESS_EXIT_DIRECTIONS = ['North', 'South', 'East', 'West'];

const WILDERNESS_EXIT_COUNT_WEIGHTS = [
  { n: 1, weight: 1 },
  { n: 2, weight: 4 },
  { n: 3, weight: 8 },
  { n: 4, weight: 4 },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rollExits(minExits = 0) {
  const count = Math.max(minExits, rollWeighted(WILDERNESS_EXIT_COUNT_WEIGHTS).n);
  return shuffle(WILDERNESS_EXIT_DIRECTIONS).slice(0, count).map(direction => ({
    direction,
    type: 'open archway',
  }));
}

// ── Monster selection ─────────────────────────────────────────────
function pickMonster(partyLevel, levelBoost = 0) {
  const db = getDB();
  const pl = parseInt(partyLevel) || 1;
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
      const levelBoost = isFinalHex ? 2 : 0;
      const monster = pickMonster(partyLevel, levelBoost);
      return {
        contentType, terrain, finalHexDesc, ...atmo,
        monster,
        count:    monster ? rollCount(monster.level, partyLevel) : 0,
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
      const isRuin = Math.random() < 0.45;
      return {
        contentType, terrain, finalHexDesc, ...atmo,
        isRuin,
        special:       engine.evaluate(isRuin ? 'wildernessRuin' : 'wildernessLandmark'),
        specialDetail: engine.evaluate('wildernessLandmarkDetail'),
        treasure: isRuin && Math.random() < 0.40 ? { item: treasureForLevel(partyLevel) } : null,
      };
    }

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

export function generateWildernessWanderingTable(partyLevel) {
  const r = currentRegion;
  if (!r) return null;

  const [f0, f1, f2] = r.factions;

  function monsterLine(levelBoost = 0) {
    const m = pickMonster(partyLevel, levelBoost);
    if (!m) return 'a territorial creature, drawn by noise or scent';
    const count = rollDice('1d4');
    return `${count > 1 ? `${count}× ` : ''}${m.name} (LV ${m.level})`;
  }

  function patrolEntry(faction) {
    return faction.isInhabitant && faction.creature
      ? `${faction.creature} (${faction.name}), 1d4, ${pick(WILDERNESS_WANDERING_ACTIVITIES)}`
      : `${faction.name} operatives, 1d4, moving with purpose`;
  }

  function loneEntry(faction) {
    return faction.isInhabitant && faction.creature
      ? `lone ${faction.creature.replace(/s$/, '')} from the ${faction.name} — separated or scouting`
      : `lone ${faction.name} member — lost or abandoned`;
  }

  const table = [
    { roll: 2,  entry: `${f0.name.toUpperCase()} IN FORCE — ${f0.goal}` },
    { roll: 3,  entry: `${monsterLine(2)}, actively hunting — intent, not chance` },
    { roll: 4,  entry: loneEntry(f1) },
    { roll: 5,  entry: `Sign: ${pick(WILDERNESS_WANDERING_SIGNS)}` },
    { roll: 6,  entry: patrolEntry(f0) },
    { roll: 7,  entry: `${monsterLine()}, ${pick(WILDERNESS_WANDERING_ACTIVITIES)}` },
    { roll: 8,  entry: patrolEntry(f2 ?? f1) },
    { roll: 9,  entry: `${f1.name} and ${f2 ? f2.name : 'unknown party'} converging — neither aware of the other yet` },
    { roll: 10, entry: `${loneEntry(f0)} — injured, may bargain` },
    { roll: 11, entry: `Sign: ${pick(WILDERNESS_WANDERING_SIGNS)}` },
    { roll: 12, entry: `Something inexplicable: ${engine.evaluate('wildernessWeird')}` },
  ];

  r.wanderingTable = table;
  return table;
}
