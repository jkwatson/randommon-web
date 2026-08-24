import { createEngine, rollDice } from '@wandering-monstrum/perchance-engine';
import { getDB } from '../monsterStore.js';
import { basicDetails, generateKeyNPCStatblock } from '../encounters/mortals.js';
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
  {
    name: 'Menagerie', weight: 3,
    tags: ['monstrosity', 'aberration', 'animal', 'construct'],
    flavor: 'A private collection of mutant experiments. The beast has broken free. It hunts.',
    finalRoom: "The beast's den — cracked cages, gnawed bones, scattered notes from the last keeper.",
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
  { label: 'Small',  rooms: 8,  factions: 2, weight: 4 },
  { label: 'Medium', rooms: 12, factions: 2, weight: 7 },
  { label: 'Large',  rooms: 20, factions: 3, weight: 5 },
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

// ── Map helpers (exported for use in main.js and generateModule) ──
export const DIR_OFFSETS = {
  North: [0, -1], South: [0, 1], East: [1, 0], West: [-1, 0],
  Northeast: [1, -1], Northwest: [-1, -1], Southeast: [1, 1], Southwest: [-1, 1],
};

export const OPPOSITE_DIR = {
  North: 'South', South: 'North', East: 'West', West: 'East',
  Northeast: 'Southwest', Southwest: 'Northeast', Northwest: 'Southeast', Southeast: 'Northwest',
  down: 'up', up: 'down', both: 'both',
};

export function nodeAtPos(m, x, y) {
  for (const n of m.nodes.values()) {
    if (n.x === x && n.y === y) return n;
  }
  return null;
}

export function addEdge(m, fromId, toId, dir, exitType) {
  const dup = m.edges.some(
    e => (e.fromId === fromId && e.toId === toId) ||
         (e.fromId === toId   && e.toId === fromId)
  );
  if (!dup) m.edges.push({ fromId, toId, dir, exitType });
}

export function findFreeCell(x, y, positions) {
  if (!positions.has(`${x},${y}`)) return [x, y];
  for (let r = 1; r < 20; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (!positions.has(`${x+dx},${y+dy}`)) return [x+dx, y+dy];
      }
    }
  }
  return [x + 20, y];
}

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

function pickUnique(fn, n) {
  const seen = new Set();
  const results = [];
  for (let attempts = 0; results.length < n && attempts < n * 6; attempts++) {
    const v = fn();
    if (!seen.has(v)) { seen.add(v); results.push(v); }
  }
  return results;
}

// Tag-flavored entrance-guard pools, biased in (not exclusive) when the dungeon
// type carries the matching tag — reinforces the separately-rolled guard monster,
// which is already picked against these same dungeon-type tags via pickMonster().
const ENTRANCE_GUARD_TAG_LISTS = {
  undead:    'dungeonEntranceGuardCreatureUndead',
  construct: 'dungeonEntranceGuardCreatureConstruct',
  ooze:      'dungeonEntranceGuardCreatureOoze',
  humanoid:  'dungeonEntranceGuardCreatureHumanoid',
};

function pickEntranceGuardFlavor(tags) {
  const matchingLists = (tags ?? []).map(t => ENTRANCE_GUARD_TAG_LISTS[t]).filter(Boolean);
  if (matchingLists.length && Math.random() < 0.5) {
    return engine.evaluate(pick(matchingLists));
  }
  return engine.evaluate('dungeonEntranceGuardCreature');
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
function pickFactionEntry(dungeonTypeTags, inhabitantFactions = INHABITANT_FACTIONS, outsiderFactions = OUTSIDER_FACTIONS) {
  const isInhabitant = inhabitantFactions.length > 0 && Math.random() < 0.75;
  if (isInhabitant) {
    const matching = inhabitantFactions.filter(f =>
      f.tags.some(t => dungeonTypeTags.includes(t))
    );
    if (matching.length > 0 && Math.random() < 0.6) return pick(matching);
    return pick(inhabitantFactions);
  }
  return { name: pick(outsiderFactions), creature: null, tags: [], isOutsider: true };
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
    goal:         engine.evaluate(isInhabitant ? 'factionInhabitantGoal' : 'factionOutsiderGoal'),
    npcName:      engine.evaluate('factionKeyNPCName'),
    npcTrait:     engine.evaluate('factionKeyNPCTrait'),
    npcStatblock: generateKeyNPCStatblock(partyLevel),
    secret:       engine.evaluate('factionSecret'),
    dispositionTowardPCs: engine.evaluate('factionDispositionPC'),
    dispositions,
  };
}

// ── Dungeon generation ────────────────────────────────────────────
export function generateDungeon(partyLevel = 1, config = {}) {
  const types              = config.types              ?? DUNGEON_TYPES;
  const architectures      = config.architectures      ?? ARCHITECTURES;
  const aesthetics         = config.aesthetics         ?? AESTHETICS;
  const sizes              = config.sizes              ?? SIZES;
  const outsiderFactions   = config.outsiderFactions   ?? OUTSIDER_FACTIONS;
  const monsterSource      = config.monsterSource      ?? 'core';

  const type      = rollWeighted(types);
  // Menagerie has no permanent inhabitants — all factions are outsiders who entered after the escape
  const inhabitantFactions = config.inhabitantFactions ??
    (type.name === 'Menagerie' ? [] : INHABITANT_FACTIONS);
  const arch      = rollWeighted(architectures);
  const aesthetic = rollWeighted(aesthetics);
  const size      = rollWeighted(sizes);
  const factionCount = size.factions ?? 3;
  const seen = new Set();
  const dedupedEntries = Array.from({ length: factionCount }, () => {
    let entry = pickFactionEntry(type.tags, inhabitantFactions, outsiderFactions);
    let attempts = 0;
    while (seen.has(entry.name) && attempts < 10) {
      entry = pickFactionEntry(type.tags, inhabitantFactions, outsiderFactions);
      attempts++;
    }
    seen.add(entry.name);
    return entry;
  });
  const factionNames = dedupedEntries.map(e => e.name);
  const factions     = dedupedEntries.map(e => buildFaction(e, factionNames, partyLevel));

  // Derive monster tags from inhabitant factions — these drive creature selection
  const factionTags = [...new Set(
    factions.filter(f => f.isInhabitant).flatMap(f => f.tags)
  )];

  currentDungeon = {
    type:          type.name,
    tags:          type.tags,
    factionTags,
    flavor:        type.flavor,
    finalRoom:     type.finalRoom,
    architecture:  arch.name,
    aesthetic:     aesthetic.name,
    aestheticDesc: aesthetic.description,
    factions,
    size:          size.label,
    rooms:         size.rooms,
    monsterSource,
    entrance:             engine.evaluate('dungeonEntrance'),
    entranceGuard:        null,
    entranceGuardMonster: null,
    concept: {
      theme: engine.evaluate('dungeonTheme'),
      story: engine.evaluate('dungeonStoryHook'),
    },
    budget:        freshBudget(),
    wanderingTable: null,
    rumors: pickUnique(() => engine.evaluate('dungeonRumor'), 3),
  };
  if (type.name === 'Menagerie') {
    // The beast is a real, randomly-picked monster (uncapped by party level — a final
    // boss shouldn't be constrained the way ordinary encounters are), reskinned with
    // the escaped-specimen flavor text below.
    const beastMonster = pickMonster(partyLevel, 2, { uncapped: true });
    currentDungeon.beast = {
      specimen:      engine.evaluate('menagerieSpecimen'),
      trait:         engine.evaluate('menagerieBeastTrait'),
      epithet:       engine.evaluate('menagerieBeastEpithet'),
      monster:       beastMonster,
      baseStatblock: beastMonster?.statblock
        ?? 'AC 13, HP 18, ATK 2 claws +3 (1d3) and 1 bite +3 (1d6), MV near, S +4, D +0, C +3, I −3, W +1, Ch −2, AL N, LV 4',
    };
  }

  const hasCreatureGuard = Math.random() < 0.40;
  currentDungeon.entranceGuard = hasCreatureGuard
    ? pickEntranceGuardFlavor(type.tags)
    : engine.evaluate('dungeonEntranceGuardPassive');
  if (hasCreatureGuard) {
    currentDungeon.entranceGuardMonster = pickMonster(partyLevel);
  }

  return currentDungeon;
}

// ── Exits ─────────────────────────────────────────────────────────
const EXIT_DIRECTIONS = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];

// Picks a wall for the dungeon's exterior entrance that doesn't collide with
// one of the room's real interior exits, so the map can mark it distinctly.
export function pickEntranceDirection(exits) {
  const used = new Set((exits ?? []).map(e => e.direction));
  const free = EXIT_DIRECTIONS.filter(d => !used.has(d));
  return pick(free.length ? free : EXIT_DIRECTIONS);
}

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
  const typePool = shuffle(EXIT_TYPES.flatMap(e => Array(e.weight).fill(e.type)));
  const usedTypes = new Set();
  const uniqueTypes = [];
  for (const t of typePool) {
    if (!usedTypes.has(t)) { usedTypes.add(t); uniqueTypes.push(t); }
    if (uniqueTypes.length === count) break;
  }
  const usedLabels = new Set();
  return shuffle(EXIT_DIRECTIONS).slice(0, count).map((direction, i) => {
    const type = uniqueTypes[i];
    const listName = type === 'secret door' ? 'dungeonSecretDoor' : 'dungeonPassage';
    let label;
    do { label = engine.evaluate(listName); } while (usedLabels.has(label) && usedLabels.size < 15);
    usedLabels.add(label);
    return { direction, type, label };
  });
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

// Bosses and other final-room threats aren't meant to be capped by party level —
// a level-appropriate dungeon can still have a final boss well above the party.
function pickMonster(partyLevel, levelBoost = 0, { uncapped = false } = {}) {
  const db = getDB();
  const source = currentDungeon?.monsterSource ?? 'core';
  const pl = parseInt(partyLevel) || 1;
  const maxLevel = uncapped
    ? undefined
    : Math.random() < 0.15 ? pl + 2 + levelBoost : pl + 1 + levelBoost;
  if (currentDungeon) {
    if (currentDungeon.factionTags?.length) {
      const m = db?.random({ source, tags: currentDungeon.factionTags, maxLevel });
      if (m) return m;
    }
    const m = db?.random({ source, tags: currentDungeon.tags, maxLevel });
    if (m) return m;
  }
  return db?.random({ source, biome: DUNGEON_BIOMES, maxLevel }) ?? null;
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

const SPECIAL_EXTRA_LISTS = {
  'Sphinx':                'specialSphinx',
  'Strange egg(s)':        'specialStrangeEgg',
  'Talking skull':         'specialTalkingSkull',
  'Talking statue':        'specialTalkingStatue',
  'Mislabelled potions':   'specialMislabelledPotions',
  'Magic fountain':        'specialMagicFountain',
  'Magic pool':            'specialMagicPool',
  'Magic forge':           'specialMagicForge',
  'Merchant in a wall':    'specialMerchantInWall',
  'Cursed room':           'specialCursedRoom',
  'Cursed treasure':       'specialCursedTreasure',
  'Aviary':                'specialAviary',
  'Maddening mural':       'specialMaddeningMural',
  'Petrified adventurers': 'specialPetrifiedAdventurers',
};

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
        feature: currentDungeon?.type === 'Menagerie'
          ? engine.evaluate('menagerieEmptyType')
          : engine.evaluate('dungeonEmptyType'),
        treasure: Math.random() < 0.15 ? {
          item:   treasureForLevel(partyLevel),
          hidden: engine.evaluate('HiddenTreasure'),
        } : null,
      };

    case 'trap':
      return {
        contentType, ...atmo, finalRoomDesc,
        trapType:   engine.evaluate('dungeonTrapType'),
        trapTell:   engine.evaluate('dungeonTrapTell'),
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

    case 'special': {
      const special = engine.evaluate('dungeonSpecial');
      const specialDetail = engine.evaluate('dungeonSpecialDetail');
      if (special === 'Valuable monster (alive)') {
        return {
          contentType, ...atmo, finalRoomDesc,
          special, specialDetail,
          valuableMonster: pickMonster(partyLevel),
          valuableMonsterReason: engine.evaluate('valuableMonsterReason'),
        };
      }
      if (special === 'Boss monster lair') {
        return {
          contentType, ...atmo, finalRoomDesc,
          special, specialDetail,
          specialMonster: pickMonster(partyLevel, 2, { uncapped: true }),
        };
      }
      const extraList = SPECIAL_EXTRA_LISTS[special];
      return {
        contentType, ...atmo, finalRoomDesc,
        special, specialDetail,
        specialExtra: extraList ? engine.evaluate(extraList) : null,
      };
    }

    case 'monster': {
      // Menagerie final room uses the Beast rather than a random DB monster
      const isBeast = isFinalRoom && currentDungeon?.type === 'Menagerie' && !!currentDungeon?.beast;
      const levelBoost = isFinalRoom ? 2 : 0;
      const monster = isBeast ? null : pickMonster(partyLevel, levelBoost, { uncapped: isFinalRoom });
      return {
        contentType, ...atmo, finalRoomDesc,
        monster,
        isBeast,
        beast:    isBeast ? currentDungeon.beast : null,
        count:    isBeast ? 1 : (monster ? rollCount(monster.level, partyLevel) : 0),
        activity: pick(ACTIVITIES),
        faction:  Math.random() < 0.35 ? faction : null,
        treasure: Math.random() < 0.5 ? { item: treasureForLevel(partyLevel) } : null,
      };
    }

    case 'npc':
      return {
        contentType, ...atmo, finalRoomDesc,
        npcName:     engine.evaluate('npcFirstName'),
        npcPhysical: basicDetails(),
        npcRole:     engine.evaluate('dungeonNPCRole'),
        npcDesire:   engine.evaluate('dungeonNPCDesire'),
        npcMood:     engine.evaluate('dungeonNPCMood'),
        npcHook:     engine.evaluate('npcHook'),
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

  const [f0, f1, f2 = f0] = d.factions;

  function lookupCreature(name) {
    if (!name) return null;
    const db = getDB();
    return db?.get(name) || db?.get(name.replace(/s$/i, '')) || db?.get(name.replace(/ies$/i, 'y')) || null;
  }

  function monsterLine(levelBoost = 0) {
    const m = pickMonster(partyLevel, levelBoost);
    if (!m) return { text: 'a dungeon denizen, drawn by noise', monster: null };
    const count = rollDice('1d4');
    return { text: `${count > 1 ? `${count}× ` : ''}${m.name} (LV ${m.level})`, monster: m };
  }

  function patrolEntry(faction, size = '1d4') {
    if (faction.isInhabitant && faction.creature) {
      return {
        text:    `${faction.creature} (${faction.name}), ${size}, ${pick(WANDERING_ACTIVITIES)}`,
        monster: lookupCreature(faction.creature),
      };
    }
    return { text: `${faction.name} operatives, ${size}, ${pick(WANDERING_ACTIVITIES)}`, monster: null };
  }

  function loneEntry(faction) {
    if (faction.isInhabitant && faction.creature) {
      return {
        text:    `lone ${faction.creature.replace(/s$/, '')} from the ${faction.name} — separated or scouting`,
        monster: lookupCreature(faction.creature),
      };
    }
    return { text: `lone ${faction.name} member — lost or abandoned by their group`, monster: null };
  }

  if (d.type === 'Menagerie' && d.beast) {
    const beastLabel = `${d.beast.epithet} (${d.beast.specimen})`;
    const BEAST_SIGNS = [
      'Claw gouges at shoulder height along both walls — something large passed through here fast',
      "A keeper's boot, still laced, no foot inside",
      'Drag marks leading toward the far passage; something heavy, irregular',
      'The remains of another escaped specimen — killed by something stronger',
      'A handprint in blood on the wall, too high for a standing human to reach',
      'Containment apparatus bent outward from the inside',
    ];
    const ml6   = monsterLine();
    const ml7   = monsterLine();
    const lone4 = loneEntry(f1);
    const lone10 = loneEntry(f0);
    const pat8  = patrolEntry(f2);
    const menagerieTable = [
      { roll: 2,  entry: `THE BEAST — ${beastLabel} · ${d.beast.trait}; it is here, now, hunting`, monster: d.beast.monster },
      { roll: 3,  entry: `Sign of the beast: ${pick(BEAST_SIGNS)}`,                                monster: null },
      { roll: 4,  entry: `${lone4.text} — moving toward the exit`,                                monster: lone4.monster },
      { roll: 5,  entry: pick(WANDERING_EVENTS),                                                  monster: null },
      { roll: 6,  entry: `${ml6.text}, an escaped specimen, ${pick(WANDERING_ACTIVITIES)}`,       monster: ml6.monster },
      { roll: 7,  entry: `${ml7.text}, ${pick(WANDERING_ACTIVITIES)}`,                            monster: ml7.monster },
      { roll: 8,  entry: `${pat8.text} — weapons drawn, watching every shadow`,                   monster: pat8.monster },
      { roll: 9,  entry: `${f0.name} survivors and ${f1.name} survivors — reluctant truce, both trying to reach the exit`, monster: null },
      { roll: 10, entry: `${lone10.text} — wounded and terrified, will trade everything they know`, monster: lone10.monster },
      { roll: 11, entry: `Sign: ${pick(WANDERING_SIGNS)}`,                                        monster: null },
      { roll: 12, entry: `The beast, inexplicably still — ${d.beast.trait} — then it moves`,      monster: d.beast.monster },
    ];
    d.wanderingTable = menagerieTable;
    return menagerieTable;
  }

  const ml3  = monsterLine(2);
  const ml7  = monsterLine();
  const lone4  = loneEntry(f1);
  const lone10 = loneEntry(f0);
  const pat6 = patrolEntry(f0);
  const pat8 = patrolEntry(f2);

  const table = [
    {
      roll: 2,
      entry: `${f0.name.toUpperCase()} IN FORCE — ${f0.goal}`,
      monster: lookupCreature(f0.creature),
    },
    {
      roll: 3,
      entry: `${ml3.text}, hunting — drawn by sound or smell, not chance`,
      monster: ml3.monster,
    },
    {
      roll: 4,
      entry: lone4.text,
      monster: lone4.monster,
    },
    {
      roll: 5,
      entry: pick(WANDERING_EVENTS),
      monster: null,
    },
    {
      roll: 6,
      entry: pat6.text,
      monster: pat6.monster,
    },
    {
      roll: 7,
      entry: `${ml7.text}, ${pick(WANDERING_ACTIVITIES)}`,
      monster: ml7.monster,
    },
    {
      roll: 8,
      entry: pat8.text,
      monster: pat8.monster,
    },
    {
      roll: 9,
      entry: d.factions.length >= 3
        ? `${f1.name} and ${f2.name} on a collision course — neither has noticed the other yet`
        : `${f0.name} IN FORCE — ${f0.goal}; ${f1.name} caught in the middle`,
      monster: null,
    },
    {
      roll: 10,
      entry: `${lone10.text} — wounded and desperate, may bargain`,
      monster: lone10.monster,
    },
    {
      roll: 11,
      entry: `Sign: ${pick(WANDERING_SIGNS)}`,
      monster: null,
    },
    {
      roll: 12,
      entry: `Something inexplicable: ${engine.evaluate('dungeonWeird')}`,
      monster: null,
    },
  ];

  d.wanderingTable = table;
  return table;
}

// ── One-click module generation ───────────────────────────────────
export function generateModule(partyLevel, config = {}) {
  generateDungeon(partyLevel, config);
  const d = currentDungeon;
  const target = d.rooms;

  const map = { nodes: new Map(), edges: [], positions: new Set(), nextId: 0, currentId: null };
  const rooms = [];
  let placed = 0;
  // Pool entries carry depth so we can weight toward deeper exploration.
  // { fromId, fromX, fromY, exit, depth }
  const pool = [];

  function placeRoom(room, x, y, fromId, exit) {
    const id = map.nextId++;
    room._mapId = id;
    room._roomNumber = ++placed;
    map.positions.add(`${x},${y}`);
    map.nodes.set(id, {
      id, x, y,
      contentType: room.contentType,
      roomType:    room.roomType,
      roomSize:    room.roomSize,
      entryDir:    exit?.direction ?? null,
      isFinalRoom: !!room.finalRoomDesc,
      room,
      roomNumber:  room._roomNumber,
    });
    room._mapNode = { x, y };
    if (fromId !== null) addEdge(map, fromId, id, exit.direction, exit.type);
    map.currentId = id;
    return id;
  }

  // Resolve exits that already point to occupied cells immediately rather than
  // parking them in the pool. Loop-back exits sitting in the pool get picked
  // preferentially by depth weighting, drain the pool, and can cause the
  // dungeon to run out of exits before all rooms are placed.
  function addToPool(fromId, fromX, fromY, room, depth) {
    for (const exit of room.exits ?? []) {
      const off = DIR_OFFSETS[exit.direction];
      if (!off) continue;
      const existing = nodeAtPos(map, fromX + off[0], fromY + off[1]);
      if (existing) {
        addEdge(map, fromId, existing.id, exit.direction, exit.type);
      } else {
        pool.push({ fromId, fromX, fromY, exit, depth });
      }
    }
  }

  // Linear depth weighting: prefer deeper exits to push the dungeon inward,
  // but don't starve shallow exits the way quadratic weighting did.
  function pickFromPool() {
    let total = 0;
    for (const e of pool) total += e.depth;
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].depth;
      if (r <= 0) return i;
    }
    return pool.length - 1;
  }

  function nextRoom(opts = {}) {
    const isFinalRoom = placed === target - 1;
    return stockRoom(partyLevel, {
      ...opts,
      isFinalRoom,
      finalRoomDesc: isFinalRoom ? d.finalRoom : null,
    });
  }

  // Entrance: force at least 2 exits so the dungeon branches from the start
  {
    const room = nextRoom({ minExits: 2 });
    room._isEntrance = true;
    rooms.push(room);
    const id = placeRoom(room, 0, 0, null, null);
    addToPool(id, 0, 0, room, 1);
  }

  while (placed < target) {
    if (pool.length === 0) {
      // Pool exhausted. Rather than creating a disconnected island, find an
      // existing room that has a free adjacent cell and force a connection.
      let didPlace = false;
      const shuffled = [...rooms].sort(() => Math.random() - 0.5);
      outer: for (const existing of shuffled) {
        const { x, y } = existing._mapNode;
        const dirEntries = Object.entries(DIR_OFFSETS).sort(() => Math.random() - 0.5);
        for (const [dir, [dx, dy]] of dirEntries) {
          const nx = x + dx, ny = y + dy;
          if (!map.positions.has(`${nx},${ny}`)) {
            const room = nextRoom({ minExits: placed < target - 1 ? 1 : 0 });
            room._fromExit = { dir, type: 'open archway' };
            rooms.push(room);
            const id = placeRoom(room, nx, ny, existing._mapId, { direction: dir, type: 'open archway' });
            if (placed < target) addToPool(id, nx, ny, room, 2);
            didPlace = true;
            break outer;
          }
        }
      }
      if (!didPlace) {
        // Grid fully surrounded (very unlikely) — last resort disconnected room
        const [fx, fy] = findFreeCell(0, 0, map.positions);
        const room = nextRoom({ minExits: placed < target - 1 ? 1 : 0 });
        rooms.push(room);
        const id = placeRoom(room, fx, fy, null, null);
        if (placed < target) addToPool(id, fx, fy, room, 1);
      }
      continue;
    }

    const idx = pickFromPool();
    const { fromId, fromX, fromY, exit, depth } = pool.splice(idx, 1)[0];

    const offset = DIR_OFFSETS[exit.direction];
    if (!offset) continue;
    const tx = fromX + offset[0];
    const ty = fromY + offset[1];

    const existing = nodeAtPos(map, tx, ty);
    if (existing) {
      addEdge(map, fromId, existing.id, exit.direction, exit.type);
      continue;
    }

    const room = nextRoom();
    room._fromExit = { dir: exit.direction, type: exit.type };
    rooms.push(room);
    const id = placeRoom(room, tx, ty, fromId, exit);
    if (placed < target) addToPool(id, tx, ty, room, depth + 1);
  }

  // No room is "current" in the full-document view
  map.currentId = null;

  // Post-hoc final room: BFS from the entrance to find the room with the greatest
  // graph distance, then move the final-room designation there if it isn't already.
  // DFS placement means the last-placed room is usually deep, but not always the deepest.
  {
    const startId = rooms[0]._mapId;
    const dist = new Map([[startId, 0]]);
    const bfsQ = [startId];
    while (bfsQ.length) {
      const cur = bfsQ.shift();
      for (const e of map.edges) {
        const nb = e.fromId === cur ? e.toId : e.toId === cur ? e.fromId : null;
        if (nb !== null && !dist.has(nb)) {
          dist.set(nb, dist.get(cur) + 1);
          bfsQ.push(nb);
        }
      }
    }
    let maxDist = -1, deepestMapId = startId;
    for (const [id, d2] of dist) {
      if (d2 > maxDist) { maxDist = d2; deepestMapId = id; }
    }
    const deepestRoom = rooms.find(r => r._mapId === deepestMapId);
    const currentFinal = rooms.find(r => r.finalRoomDesc);
    if (deepestRoom && deepestRoom !== currentFinal) {
      if (currentFinal) {
        currentFinal.finalRoomDesc = null;
        const n = map.nodes.get(currentFinal._mapId);
        if (n) n.isFinalRoom = false;
      }
      deepestRoom.finalRoomDesc = d.finalRoom;
      const n = map.nodes.get(deepestRoom._mapId);
      if (n) n.isFinalRoom = true;
    }
  }

  // ── Resolve vertical exits to connected pocket rooms ─────────────
  // Each room with a downward (or bidirectional) vertical exit gets a real
  // target room placed at a free grid cell.  The sub-room is stocked normally
  // but not added to the BFS pool, so its own exits won't be followed — the
  // reconcile pass below will prune them, leaving it as an isolated pocket.
  for (const room of [...rooms]) {
    const ve = room.verticalExit;
    if (!ve || ve.dir === 'up') continue;  // 'up'-only rooms are targets, not sources
    const { x, y } = room._mapNode;
    const [fx, fy] = findFreeCell(x, y, map.positions);
    const sub = stockRoom(partyLevel, {});
    sub.verticalExit = { form: ve.form, dir: ve.dir === 'down' ? 'up' : 'both' };
    rooms.push(sub);
    const subId = placeRoom(sub, fx, fy, null, null);
    addEdge(map, room._mapId, subId, ve.dir, `vertical:${ve.dir}`);
    room._verticalTarget  = sub._roomNumber;
    sub._verticalSource = room._roomNumber;
  }

  // Reconcile room.exits with the actual map graph:
  // 1. Remove exits that point to unplaced cells (room limit hit before they were followed).
  // 2. Add exits implied by map edges that aren't in room.exits — this covers forced
  //    connections (the existing room didn't originally have an exit toward the new room)
  //    and loop-backs discovered during generation.
  // 3. Clear vertical exits — single-level module has nowhere to go up or down.
  for (const room of rooms) {
    if (!room._mapNode) continue;
    const { x, y } = room._mapNode;
    const kept = new Set();

    room.exits = (room.exits ?? []).filter(exit => {
      const off = DIR_OFFSETS[exit.direction];
      if (!off) return false;
      if (nodeAtPos(map, x + off[0], y + off[1]) !== null) {
        kept.add(exit.direction);
        return true;
      }
      return false;
    });

    for (const edge of map.edges) {
      if (edge.exitType?.startsWith('vertical:')) continue;  // handled separately
      let edgeDir = null, edgeType = null;
      if (edge.fromId === room._mapId) {
        edgeDir = edge.dir; edgeType = edge.exitType;
      } else if (edge.toId === room._mapId && edge.dir) {
        edgeDir = OPPOSITE_DIR[edge.dir]; edgeType = edge.exitType;
      }
      if (edgeDir && !kept.has(edgeDir)) {
        const type = edgeType ?? 'open archway';
        const label = engine.evaluate(type === 'secret door' ? 'dungeonSecretDoor' : 'dungeonPassage');
        room.exits.push({ direction: edgeDir, type, label });
        kept.add(edgeDir);
      }
    }
    // verticalExit is preserved — it drives map rendering and room description
  }

  // Pick the entrance's exterior wall only once its exits are final — the
  // reconciliation pass above can still add exits after initial placement.
  const entranceRoom = rooms.find(r => r._isEntrance);
  if (entranceRoom) entranceRoom._entranceDir = pickEntranceDirection(entranceRoom.exits);

  // Anchor each faction to a specific room as their home base
  const anchored = new Set();
  for (const faction of d.factions) {
    const r =
      rooms.find(r => !anchored.has(r._roomNumber) && r._roomNumber > 1 &&
        r.contentType === 'monster' && r.faction?.name === faction.name) ??
      rooms.find(r => !anchored.has(r._roomNumber) && r._roomNumber > 1 &&
        (r.contentType === 'monster' || r.contentType === 'npc')) ??
      rooms.find(r => !anchored.has(r._roomNumber) && r._roomNumber > 1);
    if (r) { anchored.add(r._roomNumber); r._factionBase = faction; }
  }

  // Annotate each rumor with a specific room reference
  d.rumorRefs = d.rumors.map(rumor => {
    const ref = rooms[Math.floor(Math.random() * (rooms.length - 1))];
    return { text: rumor, roomRef: ref._roomNumber };
  });

  generateWanderingTable(partyLevel);

  return { dungeon: d, rooms, map };
}
