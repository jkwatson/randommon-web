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
  { name: 'Human',      weight: 12 },
  { name: 'Luxurious',  weight: 13 },
  { name: 'Dwarven',    weight: 2  },
  { name: 'Elven',      weight: 1  },
  { name: 'Foreign',    weight: 1  },
  { name: 'Elder/Alien',weight: 1  },
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

const FACTIONS = [
  'art movement', "beggar's guild", 'black market', 'brotherhood',
  'city guard', 'conspiracy', 'craft guild', 'crime family', 'crime ring',
  'dark cult', "explorer's club", 'free company', 'heist crew',
  'heretical sect', 'high council', 'hired killers', 'local militia',
  'national church', 'noble house', 'outlander clan', 'outlaw gang',
  'political party', 'religious order', 'religious sect', 'resistance',
  'royal army', 'royal house', "scholar's circle", 'secret society',
  'spy network', 'street gang', 'trade company',
];

// ── Helpers ───────────────────────────────────────────────────────
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function rollWeighted(table) {
  const total = table.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const entry of table) {
    r -= entry.weight;
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

export function generateDungeon() {
  const type      = rollWeighted(DUNGEON_TYPES);
  const arch      = rollWeighted(ARCHITECTURES);
  const aesthetic = rollWeighted(AESTHETICS);
  const size      = rollWeighted(SIZES);
  const factions  = sampleN(FACTIONS, 3);

  currentDungeon = {
    type:          type.name,
    tags:          type.tags,
    flavor:        type.flavor,
    finalRoom:     type.finalRoom,
    architecture:  arch.name,
    aesthetic:     aesthetic.name,
    aestheticDesc: aesthetic.description,
    factions,
    size:          size.label,
    rooms:         size.rooms,
    entrance:      engine.evaluate('dungeonEntrance'),
    entranceGuard: engine.evaluate('dungeonEntranceGuard'),
  };
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

const CONTENT_WEIGHTS = [
  { type: 'empty',   weight: 2 },
  { type: 'trap',    weight: 1 },
  { type: 'special', weight: 1 },
  { type: 'monster', weight: 2 },
  { type: 'npc',     weight: 1 },
];

const ROOM_TYPE_WEIGHTS = [
  { type: 'room',     weight: 4 },
  { type: 'corridor', weight: 2 },
  { type: 'cavern',   weight: 1 },
];

const ACTIVITIES = [
  'guarding', 'sleeping', 'feeding', 'patrolling', 'resting',
  'lurking', 'arguing', 'searching', 'working', 'feasting',
];

function rollContentType() {
  return rollWeighted(CONTENT_WEIGHTS).type;
}

function rollCount(monsterLevel, partyLevel) {
  const diff = (parseInt(monsterLevel) || 1) - (parseInt(partyLevel) || 1);
  if (diff >= 2)  return 1;
  if (diff >= 1)  return Math.ceil(Math.random() * 2);  // 1–2
  if (diff >= 0)  return rollDice('1d3');               // 1–3
  if (diff >= -1) return rollDice('1d4');               // 1–4
  return rollDice('1d6');                               // 1–6
}

function treasureForLevel(partyLevel) {
  if (partyLevel <= 3) return engine.evaluate('Treasure03');
  if (partyLevel <= 6) return engine.evaluate('Treasure46');
  return engine.evaluate('Treasure79');
}

function pickMonster(partyLevel) {
  const db = getDB();
  const pl = parseInt(partyLevel) || 1;
  // Allow monsters up to 1 level above party; 15% chance of allowing +2
  const maxLevel = Math.random() < 0.15 ? pl + 2 : pl + 1;
  if (currentDungeon) {
    const themed = db?.random({ source: 'core', tags: currentDungeon.tags, maxLevel });
    if (themed) return themed;
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
  const contentType = isFinalRoom
    ? rollWeighted(FINAL_ROOM_WEIGHTS).type
    : rollContentType();
  const atmo = atmosphere({ minExits });
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

    case 'special':
      return {
        contentType, ...atmo, finalRoomDesc,
        special:       engine.evaluate('dungeonSpecial'),
        specialDetail: engine.evaluate('dungeonSpecialDetail'),
      };

    case 'monster': {
      const monster = pickMonster(partyLevel);
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
