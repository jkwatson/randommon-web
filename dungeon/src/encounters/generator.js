import { createEngine, rollDice } from '@wandering-monstrum/perchance-engine';
import tableText from '../../tables/dolmenwood-encounters.txt?raw';
import treasureTableText from '../../tables/dungeon-stocking.txt?raw';
import { generateEverydayMortal, generateMortalDetail } from './mortals.js';
import { generateAdventurer, generateAdventuringParty } from './adventurers.js';
import { ensureDB } from '../monsterStore.js';
import { nameForCreature, randomBanditCompanyName } from './dolmenwood-names.js';
import { loreForCreature, entourageForCreature } from './dolmenwood-lore.js';

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
  aldweald:          'regionalAldweald',
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
const treasureEngine = createEngine(treasureTableText);

function rollHoard(tier) {
  if (!tier) return null;
  const count = rollDice('1d3');
  return Array.from({ length: count }, () => treasureEngine.evaluate(tier));
}

// A creature "carrying a possession" is a single item, unlike a multi-item lair hoard.
function rollPossession(tier) {
  return tier ? treasureEngine.evaluate(tier) : null;
}

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
  'SKELETON, MINDLESS':     'SKELETON',
};

let db = null;

export async function loadMonsters() {
  db = await ensureDB();
}

/**
 * @param {'road'|'wild'} terrain
 * @param {'day'|'night'} time
 * @param {boolean} fire - nighttime only: is there a fire?
 * @param {string} region - key from REGION_TO_LIST
 * @param {number} [_depth] - recursion depth; secondary encounters increment this
 * @returns {object} encounter result
 */
export function generateEncounter({ terrain, time, fire, region }, _depth = 0) {
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
  let adventurerDetails = null;
  let leaderName = null;
  let covenName = null;
  let trait = null;
  let hasLair = false;
  let hoard = null;
  let lairFeature = null;
  let lairComplication = null;
  let possession = null;
  let vulnerability = null;
  let mount = null;
  let entourage = null;
  let extra = null;
  if (isMortal) {
    description = rawEntry.slice(1).trim();
    if (npcType === 'everydayMortal') {
      mortalDetails = generateEverydayMortal(description);
    } else if (npcType === 'adventurer') {
      const isParty = description.toLowerCase().startsWith('adventuring party');
      if (isParty) {
        adventurerDetails = { party: generateAdventuringParty() };
      } else {
        // Parse count from parentheses: "Fighter (2d6)" → roll 2d6.
        // Some entries instead have a page reference, e.g. "The Hag (see p82)" —
        // only treat the parenthetical as a count if it actually looks like one.
        const diceMatch = description.match(/\(([^)]+)\)/);
        if (diceMatch) {
          const inner = diceMatch[1].trim();
          if (/^\d+$/.test(inner)) {
            count = parseInt(inner);
          } else if (/^\d+d\d+$/i.test(inner)) {
            count = rollDice(inner);
          }
        }
        const npc = generateAdventurer(description);
        if (npc) {
          // Thieves encountered as a gang ("Thief / Bandit", "Thief / Pirate") in
          // groups get a company name, like adventuring parties do.
          const isGang = /\/\s*(Bandit|Pirate)/i.test(description) && count > 1;
          adventurerDetails = { npc, companyName: isGang ? randomBanditCompanyName() : null };
        } else {
          // Not a class-based NPC — try the mortal detail generator for flavor
          mortalDetails = generateMortalDetail(description);
        }
      }
    }
  } else {
    const [name, dice] = rawEntry.split('|');
    creatureName = name.trim();
    countDice = dice?.trim() ?? '1';
    count = /^\d+$/.test(countDice) ? parseInt(countDice) : rollDice(countDice);
    const lookupName = NAME_MAP[creatureName] ?? creatureName;
    monster = db?.get(lookupName) ?? null;
    ({ name: leaderName, covenName } = nameForCreature(creatureName));
    const lore = loreForCreature(creatureName, monster?.level);
    trait = lore.trait;
    hasLair = lore.hasLair;
    hoard = rollHoard(lore.hoardTier);
    possession = rollPossession(lore.possessionTier);
    vulnerability = lore.vulnerability;
    extra = lore.extra;
    ({ mount, entourage } = entourageForCreature(creatureName, hasLair));
    if (hasLair) {
      lairFeature = engine.evaluate('lairFeature');
      if (Math.random() < 0.3) lairComplication = engine.evaluate('lairComplication');
    }
  }

  // Step 4: activity and distance
  let activity = engine.evaluate('activity');
  const distance = (rollDice('2d6') + 1) * 30;

  // Step 5: if activity calls for a secondary encounter, roll one and name it inline
  let secondaryEncounter = null;
  if (_depth < 10 && activity.includes('roll another encounter')) {
    secondaryEncounter = generateEncounter({ terrain, time, fire, region }, _depth + 1);
    const sec = secondaryEncounter;
    const secLabel = sec.isMortal
      ? (sec.mortalDetails?.label ?? sec.adventurerDetails?.npc?.label ?? sec.description)
      : sec.count > 1
        ? `${sec.count}× ${sec.creatureName}`
        : sec.creatureName;
    activity = activity.replace('roll another encounter', secLabel);
  }

  return {
    encounterType,
    isMortal,
    npcType,       // 'adventurer' | 'everydayMortal' | null
    creatureName,
    count,
    monster,
    description,
    mortalDetails,     // populated for everydayMortal entries
    adventurerDetails, // populated for adventurer entries
    leaderName,        // named leader/individual, for creature types that get one
    covenName,         // witch coven name, WITCH encounters only
    trait,             // a short physical/behavioral detail, for curated species
    hasLair,           // true if this encounter is at the creature's lair
    hoard,             // array of treasure items, only when hasLair and the species has a hoard
    lairFeature,       // a physical sign of habitation, only when hasLair
    lairComplication,  // an optional extra hook at the lair (~30% chance), only when hasLair
    possession,        // a single carried item, for species with hasPoss, only when NOT at a lair
    vulnerability,     // a specific weakness, WYRM-* encounters only
    mount,             // what this encounter is riding, for the handful of species that can be mounted
    entourage,         // an escort accompanying this encounter, for the handful of species that get one
    extra,             // { label, text } bonus detail for a handful of species (sprite type, mutation, etc.)
    activity,
    distance,
    secondaryEncounter,
  };
}

function resolveIndex(terrain, time, fire) {
  if (time === 'day') return terrain === 'road' ? 0 : 1;
  return fire ? 2 : 3;
}
