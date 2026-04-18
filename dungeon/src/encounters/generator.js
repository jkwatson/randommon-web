import { createEngine, rollDice } from '@wandering-monstrum/perchance-engine';
import tableText from '../../tables/dolmenwood-encounters.txt?raw';
import { generateEverydayMortal } from './mortals.js';

// Encounter type table: indexed [d8roll-1][terrainTimeIndex]
// terrainTimeIndex: 0=daytimeRoad, 1=daytimeWild, 2=nighttimeFire, 3=nighttimeNoFire
const ENCOUNTER_TYPE_TABLE = [
  ['animal',   'animal',   'monster', 'animal'],
  ['animal',   'monster',  'monster', 'monster'],
  ['mortal',   'mortal',   'mortal',  'monster'],
  ['monster',  'monster',  'monster', 'monster'],
  ['sentient', 'regional', 'sentient','sentient'],
  ['sentient', 'regional', 'sentient','regional'],
  ['regional', 'regional', 'regional','regional'],
  ['regional', 'regional', 'regional','regional'],
];

const TYPE_TO_LIST = {
  animal:   'commonAnimal',
  monster:  'commonMonster',
  mortal:   'commonMortal',
  sentient: 'commonSentient',
};

const REGION_TO_LIST = {
  aldwoad:          'regionalAldwoad',
  aquatic:          'regionalAquatic',
  dwelmfurgh:       'regionalDwelmfurgh',
  feverMarsh:       'regionalFeverMarsh',
  hagsAddle:        'regionalHagsAddle',
  highWold:         'regionalHighWold',
  mulchgrove:       'regionalMulchgrove',
  nagwood:          'regionalNagwood',
  northernScratch:  'regionalNorthernScratch',
  tableDowns:       'regionalTableDowns',
  tithelands:       'regionalTithelands',
  valleyOfWiseBeasts: 'regionalValleyOfWiseBeasts',
};

const engine = createEngine(tableText);

// Creature names in the encounter tables mapped to their JSON equivalents.
// Either OSE→Shadowdark name differences, or Dolmenwood creatures sharing
// a stat block with a core monster.
const NAME_MAP = {
  'TOAD, GIANT':            'FROG, GIANT',
  'SHAGGY MAMMOTH':         'MAMMOTH',
  'SPINNING SPIDER, GIANT': 'SPIDER, GIANT',
  'SWAMP SPIDER, GIANT':    'SPIDER, GIANT',
  'TREOWERE (CHAOTIC)':     'TREOWERE',
  'KILLER BEE':             'WASP, GIANT',
  'ANT, GIANT':             'DUNG BEETLE, GIANT',
  'FALSE UNICORN':          'UNICORN-CORRUPT',
  'BEAR':                   'BEAR, BROWN',
  'BURROWING BEETLE':       'DUNG BEETLE, GIANT',
  'FIRE BEETLE, GIANT':     'DUNG BEETLE, GIANT',
  'INSECT SWARM':           'RAT, SWARM',
  'SNAKE—ADDER':            'SNAKE, COBRA',
  'RAPACIOUS BEETLE':       'RAPACIOUS BEETLE, GIANT',
};

let monsterIndex = null;

export async function loadMonsters() {
  const [dwRes, coreRes, animalsRes] = await Promise.all([
    fetch('/data/dolmenwood.json'),
    fetch('/data/core.json'),
    fetch('/data/dolmenwood-animals.json'),
  ]);
  const [dw, core, animals] = await Promise.all([dwRes.json(), coreRes.json(), animalsRes.json()]);
  // Core loaded first; dolmenwood entries take precedence on name collisions
  monsterIndex = new Map([
    ...core.map(m => [m.name.toUpperCase(), m]),
    ...dw.map(m => [m.name.toUpperCase(), m]),
    ...animals.map(m => [m.name.toUpperCase(), m]),
  ]);
}

/**
 * @param {'road'|'wild'} terrain
 * @param {'day'|'night'} time
 * @param {boolean} fire - nighttime only: is there a fire?
 * @param {string} region - key from REGION_TO_LIST
 * @returns {object} encounter result
 */
export function generateEncounter({ terrain, time, fire, region }) {
  // Step 1: resolve encounter type
  const terrainTimeIndex = resolveIndex(terrain, time, fire);
  const typeRow = ENCOUNTER_TYPE_TABLE[rollDice('1d8') - 1];
  const encounterType = typeRow[terrainTimeIndex];

  // Step 2: pick the right list and select an entry
  const listName = encounterType === 'regional'
    ? REGION_TO_LIST[region]
    : TYPE_TO_LIST[encounterType];

  const rawEntry = engine.evaluate(listName);

  // Step 3: parse entry
  // Formats: "CREATURE_NAME|dice", "†Adventurer NPC", "‡Everyday Mortal NPC"
  const isMortal = rawEntry.startsWith('†') || rawEntry.startsWith('‡');
  const npcType = rawEntry.startsWith('‡') ? 'everydayMortal' : rawEntry.startsWith('†') ? 'adventurer' : null;
  let creatureName = null;
  let countDice = null;
  let count = null;
  let monster = null;
  let description = null;

  let mortalDetails = null;
  if (isMortal) {
    description = rawEntry.slice(1).trim();
    if (npcType === 'everydayMortal') {
      mortalDetails = generateEverydayMortal(description);
    }
  } else {
    const [name, dice] = rawEntry.split('|');
    creatureName = name.trim();
    countDice = dice?.trim() ?? '1';
    count = /^\d+$/.test(countDice) ? parseInt(countDice) : rollDice(countDice);
    const lookupName = NAME_MAP[creatureName] ?? creatureName;
    monster = monsterIndex?.get(lookupName) ?? null;
  }

  // Step 4: activity and distance
  const activity = engine.evaluate('activity');
  const distance = (rollDice('2d6') + 1) * 30;

  return {
    encounterType,
    isMortal,
    npcType,       // 'adventurer' | 'everydayMortal' | null
    creatureName,
    count,
    monster,
    description,
    mortalDetails, // populated for everydayMortal entries
    activity,
    distance,
  };
}

function resolveIndex(terrain, time, fire) {
  if (time === 'day') return terrain === 'road' ? 0 : 1;
  return fire ? 2 : 3;
}
