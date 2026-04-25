import { createEngine, rollDice } from '@wandering-monstrum/perchance-engine';
import { getDB } from '../monsterStore.js';
import starterTables from '../../tables/starter.txt?raw';
import stockingTables from '../../tables/dungeon-stocking.txt?raw';

const engine = createEngine(starterTables + '\n\n' + stockingTables);

// ── Dungeon type definitions ───────────────────────────────────────
const DUNGEON_TYPES = [
  {
    name: 'Bastion', weight: 3,
    tags: ['humanoid'],
    flavor: 'A military fortification, now fallen. Soldiers, mercenaries, or worse hold its halls.',
    finalRoom: 'An armory — a magic weapon or suit of armor may be stored here.',
  },
  {
    name: 'Mine', weight: 2,
    tags: ['humanoid', 'insect', 'ooze'],
    flavor: 'Tunnels carved for ore or stone. Something has moved in since.',
    finalRoom: 'The deepest vein — precious metal, or the source of an ancient evil.',
  },
  {
    name: 'Temple/Monastery', weight: 2,
    tags: ['humanoid', 'undead', 'fiend'],
    flavor: 'A place of worship, long abandoned or thoroughly corrupted.',
    finalRoom: 'The inner sanctum — a cursed or blessed relic awaits.',
  },
  {
    name: 'Crypt', weight: 10,
    tags: ['undead', 'ooze'],
    flavor: 'The dead do not rest easy here.',
    finalRoom: 'The grand tomb — its occupant is almost certainly still present.',
  },
  {
    name: 'Wizard Tower', weight: 1,
    tags: ['construct', 'aberration', 'ooze', 'fiend'],
    flavor: "A wizard's sanctum, abandoned or transformed into something stranger.",
    finalRoom: 'The inner laboratory — a trove of magical items, looted or intact.',
  },
  {
    name: 'Castle/Palace', weight: 1,
    tags: ['humanoid', 'undead'],
    flavor: 'Once a seat of power. The current occupants have other plans.',
    finalRoom: 'The treasury — well-stocked with the wealth of former rulers.',
  },
  {
    name: 'Prison', weight: 1,
    tags: ['humanoid', 'aberration', 'fiend'],
    flavor: 'What was held here may no longer be contained.',
    finalRoom: 'The high-security cell — its prisoner alive, dead, or long escaped.',
  },
  {
    name: 'Vault/Archive', weight: 1,
    tags: ['construct', 'undead'],
    flavor: 'Something of immense value is kept here. Guardians remain.',
    finalRoom: 'The vault — a special item, valuable book, or forbidden tome.',
  },
  {
    name: 'Sewer', weight: 1,
    tags: ['humanoid', 'ooze', 'insect'],
    flavor: 'Beneath the streets, things find their way in.',
    finalRoom: 'A hidden chamber — a monster nest or secret passage to the surface.',
  },
  {
    name: 'Catacombs', weight: 1,
    tags: ['undead'],
    flavor: 'Layer upon layer of the dead. Not all stay buried.',
    finalRoom: 'The ossuary — a vast burial chamber of immense antiquity.',
  },
  {
    name: 'Cave', weight: 1,
    tags: ['monstrosity', 'insect', 'animal', 'ooze'],
    flavor: 'A natural system of caverns, claimed by whatever is strongest.',
    finalRoom: 'The deepest chamber — a monster lair or hidden cache.',
  },
  {
    name: 'Laboratory', weight: 1,
    tags: ['construct', 'aberration', 'ooze'],
    flavor: 'Experiments went wrong here. The results linger.',
    finalRoom: 'The main experiment chamber — something dangerous is still active.',
  },
  {
    name: 'Library', weight: 1,
    tags: ['undead', 'construct', 'aberration'],
    flavor: 'Knowledge was power here. Some of it remains guarded.',
    finalRoom: 'The restricted stacks — forbidden or invaluable knowledge within.',
  },
  {
    name: 'Museum', weight: 1,
    tags: ['construct', 'undead'],
    flavor: 'A collector assembled remarkable things here. Some came alive.',
    finalRoom: 'The collection vault — a prized artifact is the centrepiece.',
  },
];

const ARCHITECTURES = [
  { name: 'Human',       weight: 12 },
  { name: 'Luxurious',   weight: 13 },
  { name: 'Dwarven',     weight: 2  },
  { name: 'Elven',       weight: 1  },
  { name: 'Foreign',     weight: 1  },
  { name: 'Elder/Alien', weight: 1  },
];

const AESTHETICS = [
  { name: null, description: null, weight: 12 },
  { name: 'Burnt',       description: 'Ash and scorch marks cover every surface; traces of explosion throughout.',      weight: 1 },
  { name: 'Crystalline', description: 'Crystals grow from every crack; some walls are transparent, echoes distort.',    weight: 1 },
  { name: 'Demonic',     description: 'Red glowing glyphs cover the walls; distant cries of pain; chained prisoners.', weight: 1 },
  { name: 'Flooded',     description: 'Deeper levels are submerged; upper areas perpetually damp and dripping.',        weight: 1 },
  { name: 'Fungal',      description: 'Every surface is thick with fungi; spores drift in the still air.',              weight: 1 },
  { name: 'Haunted',     description: 'Chains sound from empty rooms; torches gutter from unseen cold drafts.',        weight: 1 },
  { name: 'Vegetal',     description: 'Creeping plants cover floor and walls; roots and vines hang from the ceiling.', weight: 1 },
];

const SIZES = [
  { label: 'Small',  rooms: 8,  weight: 4 },
  { label: 'Medium', rooms: 12, weight: 7 },
  { label: 'Large',  rooms: 20, weight: 5 },
];

// Inhabitant factions live in the dungeon. Their tags feed monster selection.
const INHABITANT_FACTIONS = [
  // Humanoid
  { name: 'goblin warband',                          creature: 'goblins',       tags: ['humanoid'] },
  { name: 'hobgoblin garrison',                      creature: 'hobgoblins',    tags: ['humanoid'] },
  { name: 'gnoll pack',                              creature: 'gnolls',        tags: ['humanoid'] },
  { name: 'kobold warren',                           creature: 'kobolds',       tags: ['humanoid'] },
  { name: "orc warlord's retinue",                   creature: 'orcs',          tags: ['humanoid'] },
  { name: 'bandits turned squatters',                creature: 'bandits',       tags: ['humanoid'] },
  { name: 'cultist cell',                            creature: 'cultists',      tags: ['humanoid', 'fiend'] },
  { name: 'ogre family',                             creature: 'ogres',         tags: ['giant'] },
  { name: 'lizardfolk hunters',                      creature: 'lizardfolk',    tags: ['humanoid'] },
  { name: 'troglodyte tribe',                        creature: 'troglodytes',   tags: ['humanoid'] },
  { name: 'mercenary company, contract long expired',creature: 'mercenaries',   tags: ['humanoid'] },
  { name: 'dwarven survivors of the original collapse', creature: 'dwarves',    tags: ['humanoid'] },
  // Undead
  { name: 'court of wights',                         creature: 'wights',        tags: ['undead'] },
  { name: 'ghoul congregation',                      creature: 'ghouls',        tags: ['undead'] },
  { name: 'vampire lord and spawn',                  creature: 'vampires',      tags: ['undead'] },
  { name: 'revenant and its raised dead',            creature: 'undead',        tags: ['undead'] },
  { name: "necromancer's skeleton legion",           creature: 'skeletons',     tags: ['undead', 'humanoid'] },
  { name: 'shadows of the former inhabitants',       creature: 'shadows',       tags: ['undead'] },
  // Monstrous
  { name: "spider matriarch's brood",                creature: 'giant spiders', tags: ['insect'] },
  { name: 'harpy flock',                             creature: 'harpies',       tags: ['monstrosity'] },
  { name: 'myconid colony',                          creature: 'myconids',      tags: ['plant'] },
  { name: 'troll patriarch and offspring',           creature: 'trolls',        tags: ['monstrosity', 'giant'] },
  { name: 'giant insect nest',                       creature: 'giant insects', tags: ['insect'] },
  { name: 'construct army following old orders',     creature: 'constructs',    tags: ['construct'] },
  { name: 'ooze bloom in the lower passages',        creature: 'oozes',         tags: ['ooze'] },
  { name: 'aberrant thing and its thralls',          creature: 'aberrations',   tags: ['aberration'] },
];

// Outsider factions have entered the dungeon for a purpose. No creature tags.
const OUTSIDER_FACTIONS = [
  'dark cult', "thieves' guild", 'free company', 'heist crew',
  'heretical sect', 'hired killers', 'noble house', 'outlander clan',
  'outlaw gang', 'religious order', "explorer's club", "scholar's circle",
  'secret society', 'spy network', 'inquisition warband', 'resistance cell',
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

function sampleN(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// ── Module state ─────────────────────────────────────────────────
let currentDungeon = null;

export function getCurrentDungeon() { return currentDungeon; }
export function setCurrentDungeon(d) { currentDungeon = d; }

// ── Budget ────────────────────────────────────────────────────────
// Base weights and target fractions for the "Dangerous" distribution.
// Budget only nudges — never zeroes — via a dampened ratio adjustment.
const CONTENT_BASE_WEIGHTS = {
  empty:    1.5,
  monster:  2.5,
  npc:      0.8,
  trap:     1.0,
  hazard:   0.8,
  obstacle: 0.8,
  trick:    0.8,
  special:  1.2,
  weird:    0.3,  // low base — rarity is the point; budget boosts it toward ~1 per 10 rooms
};

const CONTENT_TARGETS = {
  monster:  0.30,
  empty:    0.18,
  special:  0.15,
  trap:     0.10,
  npc:      0.10,
  hazard:   0.07,
  obstacle: 0.05,
  trick:    0.05,
  weird:    0.10,
};

function freshBudget() {
  return { counts: Object.fromEntries(Object.keys(CONTENT_BASE_WEIGHTS).map(k => [k, 0])) };
}

function rollContentType(budget) {
  const placed = Object.values(budget.counts).reduce((a, b) => a + b, 0);
  const adjusted = Object.entries(CONTENT_BASE_WEIGHTS).map(([type, baseW]) => {
    const target = CONTENT_TARGETS[type] ?? 0;
    const actual = placed > 0 ? (budget.counts[type] / placed) : 0;
    // ratio > 1 = over target (suppress), < 1 = under target (boost)
    // floor at 0.25× base, ceiling at 4× base
    const ratio  = target > 0 ? (actual / target) : 1;
    const factor = Math.max(0.25, Math.min(4.0, 2 - ratio));
    return { type, weight: baseW * factor };
  });
  return rollWeighted(adjusted).type;
}

// ── Faction building ──────────────────────────────────────────────

// Pick a faction entry, biasing inhabitants ~75% of the time.
// Inhabitants are further biased toward the dungeon type's tags (~60% tag-match).
function pickFactionEntry(dungeonTypeTags) {
  const isInhabitant = Math.random() < 0.75;
  if (isInhabitant) {
    const matching = INHABITANT_FACTIONS.filter(f =>
      f.tags.some(t => dungeonTypeTags.includes(t))
    );
    if (matching.length > 0 && Math.random() < 0.6) return pick(matching);
    return pick(INHABITANT_FACTIONS);
  }
  return { name: pick(OUTSIDER_FACTIONS), creature: null, tags: [], isOutsider: true };
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

// ── Dungeon generation ────────────────────────────────────────────
export function generateDungeon(partyLevel = 1) {
  const type      = rollWeighted(DUNGEON_TYPES);
  const arch      = rollWeighted(ARCHITECTURES);
  const aesthetic = rollWeighted(AESTHETICS);
  const size      = rollWeighted(SIZES);
  const factionEntries = [
    pickFactionEntry(type.tags),
    pickFactionEntry(type.tags),
    pickFactionEntry(type.tags),
  ];
  // Ensure no duplicate faction names
  const seen = new Set();
  const dedupedEntries = factionEntries.map(e => {
    let entry = e;
    let attempts = 0;
    while (seen.has(entry.name) && attempts < 10) {
      entry = pickFactionEntry(type.tags);
      attempts++;
    }
    seen.add(entry.name);
    return entry;
  });
  const factionNames = dedupedEntries.map(e => e.name);
  const factions     = dedupedEntries.map(e => buildFaction(e, factionNames));

  // Derive monster tags from inhabitant factions — these drive creature selection
  const factionTags = [...new Set(
    factions.filter(f => f.isInhabitant).flatMap(f => f.tags)
  )];

  currentDungeon = {
    type:          type.name,
    tags:          type.tags,       // dungeon-type fallback
    factionTags,                    // primary monster source — derived from inhabitants
    flavor:        type.flavor,
    finalRoom:     type.finalRoom,
    architecture:  arch.name,
    aesthetic:     aesthetic.name,
    aestheticDesc: aesthetic.description,
    factions,
    size:          size.label,
    rooms:         size.rooms,
    entrance:             engine.evaluate('dungeonEntrance'),
    entranceGuard:        null,
    entranceGuardMonster: null,
    concept: {
      theme: engine.evaluate('dungeonTheme'),
      story: engine.evaluate('dungeonStoryHook'),
    },
    budget:        freshBudget(),
    wanderingTable: null,
  };
  const hasCreatureGuard = Math.random() < 0.40;
  currentDungeon.entranceGuard = engine.evaluate(
    hasCreatureGuard ? 'dungeonEntranceGuardCreature' : 'dungeonEntranceGuardPassive'
  );
  if (hasCreatureGuard) {
    currentDungeon.entranceGuardMonster = pickMonster(partyLevel);
  }

  return currentDungeon;
}

// ── Exits ─────────────────────────────────────────────────────────
const EXIT_DIRECTIONS = ['North', 'South', 'East', 'West'];

const EXIT_TYPES = [
  { type: 'open archway', weight: 3 },
  { type: 'wooden door',  weight: 5 },
  { type: 'stone door',   weight: 3 },
  { type: 'iron door',    weight: 2 },
  { type: 'locked door',  weight: 2 },
  { type: 'barred door',  weight: 1 },
  { type: 'portcullis',   weight: 1 },
  { type: 'secret door',  weight: 1 },
];

const VERTICAL_CHANCE = 0.18;

const VERTICAL_TYPES = [
  { form: 'stairs',        dir: 'both', weight: 5 },
  { form: 'stairs',        dir: 'down', weight: 3 },
  { form: 'stairs',        dir: 'up',   weight: 2 },
  { form: 'spiral stairs', dir: 'both', weight: 3 },
  { form: 'broken stairs', dir: 'down', weight: 2 },
  { form: 'ladder',        dir: 'both', weight: 3 },
  { form: 'ladder',        dir: 'down', weight: 2 },
  { form: 'rope descent',  dir: 'down', weight: 2 },
  { form: 'pit',           dir: 'down', weight: 2 },
  { form: 'chute',         dir: 'down', weight: 1 },
  { form: 'dumbwaiter',    dir: 'both', weight: 1 },
];

const EXIT_COUNT_WEIGHTS = [
  { n: 0, weight: 1 },
  { n: 1, weight: 3 },
  { n: 2, weight: 5 },
  { n: 3, weight: 3 },
  { n: 4, weight: 1 },
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
  const count = Math.max(minExits, rollWeighted(EXIT_COUNT_WEIGHTS).n);
  return shuffle(EXIT_DIRECTIONS).slice(0, count).map(direction => ({
    direction,
    type: rollWeighted(EXIT_TYPES).type,
  }));
}

function rollVerticalExit() {
  if (Math.random() > VERTICAL_CHANCE) return null;
  const { form, dir } = rollWeighted(VERTICAL_TYPES);
  return { form, dir };
}

// ── Room sizes ────────────────────────────────────────────────────
const ROOM_DIMS = [
  { w: 10, l: 10, weight: 1 },
  { w: 10, l: 20, weight: 2 },
  { w: 20, l: 20, weight: 4 },
  { w: 20, l: 30, weight: 5 },
  { w: 20, l: 40, weight: 3 },
  { w: 30, l: 30, weight: 3 },
  { w: 30, l: 40, weight: 3 },
  { w: 30, l: 60, weight: 2 },
  { w: 40, l: 40, weight: 2 },
  { w: 40, l: 60, weight: 1 },
  { w: 40, l: 80, weight: 1 },
];

const CORRIDOR_LENGTHS = [
  { v: 10, weight: 1 }, { v: 20, weight: 3 }, { v: 30, weight: 4 },
  { v: 40, weight: 3 }, { v: 60, weight: 2 }, { v: 90, weight: 1 },
];

const CORRIDOR_WIDTHS = [
  { v: 5, weight: 2 }, { v: 10, weight: 5 }, { v: 15, weight: 1 },
];

function rollRoomSize(roomType) {
  if (roomType === 'corridor') {
    const length = rollWeighted(CORRIDOR_LENGTHS).v;
    const width  = rollWeighted(CORRIDOR_WIDTHS).v;
    return { width, length, label: `${length} ft long, ${width} ft wide` };
  }
  const { w, l } = rollWeighted(ROOM_DIMS);
  const label = roomType === 'cavern' ? `roughly ${w} × ${l} ft` : `${w} × ${l} ft`;
  return { width: w, length: l, label };
}

// ── Room stocking ─────────────────────────────────────────────────
const DUNGEON_BIOMES = ['cave', 'deeps', 'ruins', 'tomb'];

const ROOM_TYPE_WEIGHTS = [
  { type: 'room',     weight: 4 },
  { type: 'corridor', weight: 2 },
  { type: 'cavern',   weight: 1 },
];

const ACTIVITIES = [
  'guarding', 'sleeping', 'feeding', 'patrolling', 'resting',
  'lurking', 'arguing', 'searching', 'working', 'feasting',
];

function rollCount(monsterLevel, partyLevel) {
  const diff = (parseInt(monsterLevel) || 1) - (parseInt(partyLevel) || 1);
  if (diff >= 2)  return 1;
  if (diff >= 1)  return Math.ceil(Math.random() * 2);
  if (diff >= 0)  return rollDice('1d3');
  if (diff >= -1) return rollDice('1d4');
  return rollDice('1d6');
}

function evaluateTableWithFallback(...tableNames) {
  for (const tableName of tableNames) {
    const result = engine.evaluate(tableName);
    if (typeof result !== 'string' || !result.includes('[unknown list:')) {
      return result;
    }
  }
  return '';
}

function treasureForLevel(partyLevel) {
  if (partyLevel <= 3) return evaluateTableWithFallback('Treasure03');
  if (partyLevel <= 6) return evaluateTableWithFallback('Treasure46', 'Treasure03');
  return evaluateTableWithFallback('Treasure79', 'Treasure46', 'Treasure03');
}

function pickMonster(partyLevel, levelBoost = 0) {
  const db = getDB();
  const pl = parseInt(partyLevel) || 1;
  const maxLevel = Math.random() < 0.15 ? pl + 2 + levelBoost : pl + 1 + levelBoost;
  if (currentDungeon) {
    // Faction inhabitants are the primary source
    if (currentDungeon.factionTags?.length) {
      const m = db?.random({ source: 'core', tags: currentDungeon.factionTags, maxLevel });
      if (m) return m;
    }
    // Fall back to dungeon-type tags
    const m = db?.random({ source: 'core', tags: currentDungeon.tags, maxLevel });
    if (m) return m;
  }
  return db?.random({ source: 'core', biome: DUNGEON_BIOMES, maxLevel }) ?? null;
}

function atmosphere({ minExits = 0 } = {}) {
  const roomType = rollWeighted(ROOM_TYPE_WEIGHTS).type;
  return {
    roomType,
    roomSize:     rollRoomSize(roomType),
    exits:        rollExits(minExits),
    verticalExit: rollVerticalExit(),
    smell:        Math.random() < 0.5 ? engine.evaluate('Smell') : null,
    sound:        Math.random() < 0.5 ? engine.evaluate('dungeonSound') : null,
    furnishing:   roomType !== 'corridor' ? engine.evaluate('Furniture') : null,
    hallway:      roomType === 'corridor'  ? engine.evaluate('hallways')  : null,
  };
}

const FINAL_ROOM_WEIGHTS = [
  { type: 'monster', weight: 4 },
  { type: 'special', weight: 2 },
  { type: 'trap',    weight: 1 },
];

export function stockRoom(partyLevel, { minExits = 0, isFinalRoom = false, finalRoomDesc = null } = {}) {
  const budget = currentDungeon?.budget;
  const contentType = isFinalRoom
    ? rollWeighted(FINAL_ROOM_WEIGHTS).type
    : rollContentType(budget ?? { counts: {} });

  if (budget && !isFinalRoom) {
    budget.counts[contentType] = (budget.counts[contentType] ?? 0) + 1;
  }

  const atmo    = atmosphere({ minExits });
  const faction = currentDungeon ? pick(currentDungeon.factions) : null;

  switch (contentType) {
    case 'empty':
      return {
        contentType, ...atmo, finalRoomDesc,
        feature: engine.evaluate('dungeonEmptyType'),
        treasure: Math.random() < 0.15 ? {
          item:   treasureForLevel(partyLevel),
          hidden: engine.evaluate('HiddenTreasure'),
        } : null,
      };

    case 'trap':
      return {
        contentType, ...atmo, finalRoomDesc,
        trapType:   engine.evaluate('dungeonTrapType'),
        trapDetail: engine.evaluate('dungeonTrapDetail'),
        treasure: Math.random() < 0.25 ? { item: treasureForLevel(partyLevel) } : null,
      };

    case 'hazard':
      return {
        contentType, ...atmo, finalRoomDesc,
        hazard:       engine.evaluate('dungeonHazard'),
        hazardDetail: engine.evaluate('dungeonHazardDetail'),
      };

    case 'obstacle':
      return {
        contentType, ...atmo, finalRoomDesc,
        obstacle:       engine.evaluate('dungeonObstacle'),
        obstacleDetail: engine.evaluate('dungeonObstacleDetail'),
      };

    case 'trick':
      return {
        contentType, ...atmo, finalRoomDesc,
        trick:       engine.evaluate('dungeonTrick'),
        trickDetail: engine.evaluate('dungeonTrickDetail'),
      };

    case 'weird':
      return {
        contentType, ...atmo, finalRoomDesc,
        weird: engine.evaluate('dungeonWeird'),
      };

    case 'special':
      return {
        contentType, ...atmo, finalRoomDesc,
        special:       engine.evaluate('dungeonSpecial'),
        specialDetail: engine.evaluate('dungeonSpecialDetail'),
      };

    case 'monster': {
      // Final room gets a boosted monster (boss-tier)
      const levelBoost = isFinalRoom ? 2 : 0;
      const monster = pickMonster(partyLevel, levelBoost);
      return {
        contentType, ...atmo, finalRoomDesc,
        monster,
        count:    monster ? rollCount(monster.level, partyLevel) : 0,
        activity: pick(ACTIVITIES),
        faction:  Math.random() < 0.35 ? faction : null,
        treasure: Math.random() < 0.5 ? { item: treasureForLevel(partyLevel) } : null,
      };
    }

    case 'npc':
      return {
        contentType, ...atmo, finalRoomDesc,
        npcRole:   engine.evaluate('dungeonNPCRole'),
        npcDesire: engine.evaluate('dungeonNPCDesire'),
        npcMood:   engine.evaluate('dungeonNPCMood'),
        faction,
      };
  }
}

// ── Random encounter table ────────────────────────────────────────
const WANDERING_SIGNS = [
  'Fresh blood trailing toward the far passage',
  'A distant scream, then silence',
  'The sound of something heavy being dragged',
  'A torch left burning on the floor, still lit',
  'The smell of smoke from somewhere ahead',
  'Fresh scratch marks on the wall at knee height',
  'Muffled arguing, source unclear',
  'A single dropped item — a coin, a button, a tooth',
  'A door left ajar that was closed before',
  'Footprints in dust heading away from the party',
];

const WANDERING_ACTIVITIES = [
  'on patrol', 'returning from somewhere deeper', 'responding to a noise',
  'moving with clear purpose', 'searching for something',
];

const WANDERING_EVENTS = [
  'Distant torchlight moving away — someone else is down here',
  'An unfamiliar creature, dead, no visible wounds; still warm',
  'Sounds of combat from a nearby passage — then silence',
  'A recently abandoned camp: bedrolls, embers, gear left in haste',
  'Something large moving through a parallel passage, unseen',
  'A faction patrol heard overhead or behind a wall — they pass without entering',
  'A faint, persistent knocking from somewhere below the floor',
  'The smell of cooking — something has made a fire nearby and recently',
];

export function generateWanderingTable(partyLevel) {
  const d = currentDungeon;
  if (!d) return null;

  const [f0, f1, f2] = d.factions;

  function monsterLine(levelBoost = 0) {
    const m = pickMonster(partyLevel, levelBoost);
    if (!m) return 'a dungeon denizen, drawn by noise';
    const count = rollDice('1d4');
    return `${count > 1 ? `${count}× ` : ''}${m.name} (LV ${m.level})`;
  }

  function patrolEntry(faction, size = '1d4') {
    return faction.isInhabitant && faction.creature
      ? `${faction.creature} (${faction.name}), ${size}, ${pick(WANDERING_ACTIVITIES)}`
      : `${faction.name} operatives, ${size}, ${pick(WANDERING_ACTIVITIES)}`;
  }

  function loneEntry(faction) {
    return faction.isInhabitant && faction.creature
      ? `lone ${faction.creature.replace(/s$/, '')} from the ${faction.name} — separated or scouting`
      : `lone ${faction.name} member — lost or abandoned by their group`;
  }

  const table = [
    {
      roll: 2,
      entry: `${f0.name.toUpperCase()} IN FORCE — ${f0.goal}`,
    },
    {
      roll: 3,
      entry: `${monsterLine(2)}, hunting — drawn by sound or smell, not chance`,
    },
    {
      roll: 4,
      entry: loneEntry(f1),
    },
    {
      roll: 5,
      entry: pick(WANDERING_EVENTS),
    },
    {
      roll: 6,
      entry: patrolEntry(f0),
    },
    {
      roll: 7,
      entry: `${monsterLine()}, ${pick(WANDERING_ACTIVITIES)}`,
    },
    {
      roll: 8,
      entry: patrolEntry(f2),
    },
    {
      roll: 9,
      entry: `${f1.name} and ${f2.name} on a collision course — neither has noticed the other yet`,
    },
    {
      roll: 10,
      entry: `${loneEntry(f0)} — wounded and desperate, may bargain`,
    },
    {
      roll: 11,
      entry: `Sign: ${pick(WANDERING_SIGNS)}`,
    },
    {
      roll: 12,
      entry: `Something inexplicable: ${engine.evaluate('dungeonWeird')}`,
    },
  ];

  d.wanderingTable = table;
  return table;
}
