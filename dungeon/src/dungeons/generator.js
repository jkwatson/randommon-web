import { createEngine, rollDice } from '@wandering-monstrum/perchance-engine';
import { getDB } from '../monsterStore.js';
import { monsterLevel } from '../monsters.js';
import { basicDetails, generateKeyNPCStatblock, rankAndFileStatblock, SHADOWDARK_ANCESTRIES } from '../encounters/mortals.js';
import { rollGestalts, getGestalt } from './gestalts.js';
import { castGestalts, applyGestaltRoles } from './gestalt-roles.js';
import { castChanges, applyChanges } from './gestalt-changes.js';
import { buildLayout, addLoops, planLoops } from './layouts.js';
import { buildCyclicLayout, fillZonesWithCycles } from './cyclic-layout.js';
import { applyCycleContent } from './cycle-content.js';
import { applyTells, gestaltRumors, changeEncounter } from './gestalt-tells.js';
import { rollDangerLevel, tableDie } from './danger.js';
import { fitRooms } from './room-fit.js';

const getGestaltStories = id => getGestalt(id)?.stories ?? [];
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

// Maps a dungeon type's name to its adventure-hook table. Types without an
// entry here (custom config.types overrides, other settings) fall back to
// the generic table.
const HOOK_TABLE_BY_TYPE = {
  'Bastion':          'dungeonHookBastion',
  'Mine':             'dungeonHookMine',
  'Temple/Monastery': 'dungeonHookTemple',
  'Crypt':            'dungeonHookCrypt',
  'Wizard Tower':     'dungeonHookWizardTower',
  'Castle/Palace':    'dungeonHookCastle',
  'Prison':           'dungeonHookPrison',
  'Vault/Archive':    'dungeonHookVault',
  'Sewer':            'dungeonHookSewer',
  'Catacombs':        'dungeonHookCatacombs',
  'Cave':             'dungeonHookCave',
  'Laboratory':       'dungeonHookLaboratory',
  'Library':          'dungeonHookLibrary',
  'Museum':           'dungeonHookMuseum',
  'Menagerie':        'dungeonHookMenagerie',
  // Dolmenwood-specific types (dolmenwood-generator.js)
  'Barrow':               'dungeonHookBarrow',
  'Fairy Mound':          'dungeonHookFairyMound',
  'Drune Sanctum':        'dungeonHookDruneSanctum',
  'Bog Warren':           'dungeonHookBogWarren',
  'Witch-Mound':          'dungeonHookWitchMound',
  "Nag-Lord's Outpost":   'dungeonHookNagLordOutpost',
  'Ancient Ruin':         'dungeonHookAncientRuin',
  'Collapsed Temple':     'dungeonHookCollapsedTemple',
  'Fomorian Fastness':    'dungeonHookFomorianFastness',
};

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
  { label: 'Large',  rooms: 20, factions: 2, weight: 5 },
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

// Fills in a faction-tied hook template with a randomly chosen rolled faction
// and its Key NPC — e.g. "hired by [npcName] of the [factionName]".
function buildFactionHook(factions) {
  const faction = pick(factions);
  engine.vars.factionName = faction.name;
  engine.vars.npcName = faction.npcName;
  return engine.evaluate('dungeonHookFaction');
}

// ── Gestalt application ───────────────────────────────────────────

// Strips selection-only fields so the dungeon state stays small and serializable.
function gestaltRecord(g) {
  const { id, name, category, summary, guidance, tells } = g;
  return { id, name, category, summary, guidance, tells, cast: {} };
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

  // Gestalts are the dungeon's organizing patterns. They're applied before the
  // story and the rooms so those can be generated to fit them.
  const gestalts = rollGestalts({
    type:         type.name,
    tags:         type.tags,
    aesthetic:    aesthetic.name,
    size:         size.label,
    factionCount: factions.length,
    overrides:    config.gestalts ?? [],
    spatial:      config.layout !== 'cyclic',
  }).map(gestaltRecord);

  // Prefer a story that embodies a gestalt; keep some table variety.
  const gestaltStories = gestalts.flatMap(g => getGestaltStories(g.id));
  const story = gestaltStories.length && Math.random() < 0.7
    ? pick(gestaltStories)
    : engine.evaluate('dungeonStoryHook');

  // Roughly half the time, tie the hook to one of the rolled factions (and its Key
  // NPC) rather than a generic dungeon-type reason — a concrete "who" for the party
  // to have hired them, be hunting, or be double-crossed by.
  const hook = factions.length && Math.random() < 0.5
    ? buildFactionHook(factions)
    : engine.evaluate(HOOK_TABLE_BY_TYPE[type.name] ?? 'dungeonHookGeneric');

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
    partyLevel:    parseInt(partyLevel) || 1,
    entrance:             engine.evaluate('dungeonEntrance'),
    entranceGuard:        null,
    entranceGuardMonster: null,
    concept: {
      theme: engine.evaluate('dungeonTheme'),
      story,
    },
    gestalts,
    // How often to check for random encounters (see danger.js).
    danger:        config.danger ?? rollDangerLevel({ gestalts, type: type.name }),
    budget:        freshBudget(),
    wanderingTable: null,
    rumors: pickUnique(() => engine.evaluate('dungeonRumor'), 3),
    hook,
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

  // Faction roles, goals, and cast monsters (hunter, prisoner…) for the
  // relational gestalts. Needs currentDungeon and the Menagerie beast in place.
  castGestalts(currentDungeon, partyLevel, { pickMonster });
  // Clocks, states, cycles, fronts… for the transformational gestalts.
  castChanges(currentDungeon);

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

// A hall-sized room for layout roles like hubs, vaults, and sanctums.
function largeRoomSize(roomType = 'room') {
  const { w, l } = rollWeighted(ROOM_DIMS.filter(d => d.w >= 30));
  return { width: w, length: l, label: roomType === 'cavern' ? `roughly ${w} × ${l} ft` : `${w} × ${l} ft` };
}

// A room big enough for a scene: 20 × 20 ft or more.
function chamberSize(roomType = 'room') {
  const { w, l } = rollWeighted(ROOM_DIMS.filter(d => d.w * d.l >= 400));
  return { width: w, length: l, label: roomType === 'cavern' ? `roughly ${w} × ${l} ft` : `${w} × ${l} ft` };
}

// A passage type for a planned layout edge. Secret doors are left to the
// layouts that want them, so a random one never hides a whole wing.
function rollExitType() {
  return rollWeighted(EXIT_TYPES.filter(e => e.type !== 'secret door')).type;
}

function dirFromDelta(dx, dy) {
  return Object.entries(DIR_OFFSETS).find(([, [ox, oy]]) => ox === dx && oy === dy)?.[0] ?? null;
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

function rollCount(level, partyLevel) {
  const diff = (monsterLevel(level) || 1) - (parseInt(partyLevel) || 1);
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

  if (uncapped) {
    // A final boss should be a real threat, not just "whatever fits" — aim for
    // the party's level (plus boost) as a floor, and only step the floor down
    // if nothing matches, so the toughest available monster wins out.
    for (let minLevel = pl + levelBoost; minLevel >= 1; minLevel--) {
      if (currentDungeon?.factionTags?.length) {
        const m = db?.random({ source, tags: currentDungeon.factionTags, minLevel });
        if (m) return m;
      }
      if (currentDungeon) {
        const m = db?.random({ source, tags: currentDungeon.tags, minLevel });
        if (m) return m;
      }
      const m = db?.random({ source, biome: DUNGEON_BIOMES, minLevel });
      if (m) return m;
    }
    return db?.random({ source }) ?? db?.random({}) ?? null;
  }

  const maxLevel = Math.random() < 0.15 ? pl + 2 + levelBoost : pl + 1 + levelBoost;
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

export function stockRoom(partyLevel, { minExits = 0, isFinalRoom = false, finalRoomDesc = null, contentType: forced = null } = {}) {
  const budget = currentDungeon?.budget;
  const contentType = forced ?? (isFinalRoom
    ? rollWeighted(FINAL_ROOM_WEIGHTS).type
    : rollContentType(budget ?? { counts: {} }));

  if (budget && !isFinalRoom) {
    budget.counts[contentType] = (budget.counts[contentType] ?? 0) + 1;
  }

  return {
    contentType,
    ...atmosphere({ minExits }),
    finalRoomDesc,
    ...stockContent(partyLevel, contentType, { isFinalRoom }),
  };
}

// Content fields for a room of the given type, independent of its atmosphere
// (exits, size, smell…). Exported so gestalt roles can restock a room in place.
export function stockContent(partyLevel, contentType, { isFinalRoom = false, faction = undefined } = {}) {
  if (faction === undefined) faction = currentDungeon ? pick(currentDungeon.factions) : null;

  switch (contentType) {
    case 'empty':
      return {
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
        trapType:   engine.evaluate('dungeonTrapType'),
        trapTell:   engine.evaluate('dungeonTrapTell'),
        trapDetail: engine.evaluate('dungeonTrapDetail'),
        treasure: Math.random() < 0.25 ? { item: treasureForLevel(partyLevel) } : null,
      };

    case 'hazard':
      return {
        hazard:       engine.evaluate('dungeonHazard'),
        hazardDetail: engine.evaluate('dungeonHazardDetail'),
      };

    case 'obstacle':
      return {
        obstacle:       engine.evaluate('dungeonObstacle'),
        obstacleDetail: engine.evaluate('dungeonObstacleDetail'),
      };

    case 'trick':
      return {
        trick:       engine.evaluate('dungeonTrick'),
        trickDetail: engine.evaluate('dungeonTrickDetail'),
      };

    case 'weird':
      return {
        weird: engine.evaluate('dungeonWeird'),
      };

    case 'special': {
      const special = engine.evaluate('dungeonSpecial');
      const specialDetail = engine.evaluate('dungeonSpecialDetail');
      if (special === 'Valuable monster (alive)') {
        return {
          special, specialDetail,
          valuableMonster: pickMonster(partyLevel),
          valuableMonsterReason: engine.evaluate('valuableMonsterReason'),
        };
      }
      if (special === 'Boss monster lair') {
        return {
          special, specialDetail,
          specialMonster: pickMonster(partyLevel, 2, { uncapped: true }),
        };
      }
      const extraList = SPECIAL_EXTRA_LISTS[special];
      return {
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
        npcName:     engine.evaluate('npcFirstName'),
        npcPhysical: basicDetails(currentDungeon?.monsterSource === 'dolmenwood' ? undefined : SHADOWDARK_ANCESTRIES),
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

  // Inhabitant factions get their real creature's stat block; outsider factions
  // (people, not monsters) fall back to rank-and-file stats
  // scaled a step below that faction's Key NPC, so a random patrol isn't left
  // with no stats at all (nor a squad of leaders).
  function factionMonster(faction) {
    return lookupCreature(faction.creature) ?? (faction.npcStatblock ? { statblock: rankAndFileStatblock(faction.npcStatblock) } : null);
  }

  function monsterLine(levelBoost = 0) {
    const m = pickMonster(partyLevel, levelBoost);
    if (!m) return { text: 'a dungeon denizen, drawn by noise', monster: null };
    const count = rollDice('1d4');
    return { text: `${count > 1 ? `${count}× ` : ''}${m.name} (LV ${m.level})`, monster: m };
  }

  function patrolEntry(faction, size = '1d4') {
    const text = faction.isInhabitant && faction.creature
      ? `${faction.creature} (${faction.name}), ${size}, ${pick(WANDERING_ACTIVITIES)} — ${faction.goal}`
      : `${faction.name} operatives, ${size}, ${pick(WANDERING_ACTIVITIES)} — ${faction.goal}`;
    return { text, monster: factionMonster(faction) };
  }

  function loneEntry(faction) {
    const text = faction.isInhabitant && faction.creature
      ? `lone ${faction.creature.replace(/s$/, '')} from the ${faction.name} — separated or scouting; the group's goal: ${faction.goal}`
      : `lone ${faction.name} member — lost or abandoned by their group; the group's goal: ${faction.goal}`;
    return { text, monster: factionMonster(faction) };
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
    // In priority order; the table keeps as many as its die has faces. Same
    // slots as the standard table: a patrol at 3, the dungeon's change at 4.
    const menagerieRows = [
      { entry: `THE BEAST — ${beastLabel} · ${d.beast.trait}; it is here, now, hunting`, monster: d.beast.monster },
      { entry: `${pat8.text} — weapons drawn, watching every shadow`,                   monster: pat8.monster },
      d.cyclePatrols?.length
        ? { entry: `The patrolling ${d.cyclePatrols[0].name}, on its loop through Rooms ${d.cyclePatrols[0].rooms.join(', ')}`, monster: { name: d.cyclePatrols[0].name, statblock: d.cyclePatrols[0].statblock } }
        : { entry: `${ml6.text}, an escaped specimen, ${pick(WANDERING_ACTIVITIES)}`,       monster: ml6.monster },
      { entry: changeEncounter(d) ?? pick(WANDERING_EVENTS),                            monster: null },
      { entry: `${lone4.text} — moving toward the exit`,                                monster: lone4.monster },
      { entry: `${lone10.text} — wounded and terrified, will trade everything they know`, monster: lone10.monster },
      { entry: `${f0.name} survivors and ${f1.name} survivors — reluctant truce, both trying to reach the exit`, monster: null },
      { entry: `${ml7.text}, ${pick(WANDERING_ACTIVITIES)}`,                          monster: ml7.monster },
    ];
    return finishTable(d, menagerieRows, `the beast is near: ${pick(BEAST_SIGNS).replace(/^./, c => c.toLowerCase())}`);
  }

  const ml3  = monsterLine(2);
  const ml7  = monsterLine();
  // Hunter and Prey's hunter, or Threat and Refuge's threat, roams the halls.
  const hunterGestalt = d.gestalts?.find(g => g.cast?.hunter) ?? null;
  const hunter = hunterGestalt?.cast.hunter ?? null;
  const hunterLabel = hunterGestalt?.id === 'threat-and-refuge' ? 'THREAT' : 'HUNTER';
  const preyName = hunterGestalt?.cast.prey?.[0] ?? hunterGestalt?.cast.refugees?.[0] ?? f0.name;
  const HUNTER_SIGNS = [
    `${preyName} remains, freshly killed and partly eaten`,
    `fleeing ${preyName} — panicked, they will not stop to fight or talk`,
    `an abandoned ${preyName} post, gear left behind in haste`,
    'a silence where there should be sound — everything nearby is hiding',
  ];
  const lone10 = loneEntry(f0);
  const pat0 = patrolEntry(f0);
  const pat1 = patrolEntry(f1);

  // In priority order; the table keeps as many as its die has faces.
  const rows = [
    hunter ? {
      entry: `THE ${hunterLabel} — ${hunter.name}, stalking the ${preyName}; it treats the party as more prey`,
      monster: hunter.statblock ? { name: hunter.name, statblock: hunter.statblock } : null,
    } : {
      entry: `${ml3.text}, hunting — drawn by sound or smell, not chance`,
      monster: ml3.monster,
    },
    { entry: pat0.text, monster: pat0.monster },
    // A cyclic dungeon's patrol is met on its loop.
    d.cyclePatrols?.length ? {
      entry: `The patrolling ${d.cyclePatrols[0].name}, on its loop through Rooms ${d.cyclePatrols[0].rooms.join(', ')}`,
      monster: { name: d.cyclePatrols[0].name, statblock: d.cyclePatrols[0].statblock },
    } : { entry: pat1.text, monster: pat1.monster },
    { entry: changeEncounter(d) ?? pick(WANDERING_EVENTS), monster: null },
    {
      entry: f2 !== f0
        ? `${f1.name} and ${f2.name} on a collision course — neither has noticed the other yet`
        : `${f0.name} and ${f1.name} skirmishing — the party arrives mid-fight; either side might want help`,
      monster: null,
    },
    { entry: `${lone10.text} — wounded and desperate, may bargain`, monster: lone10.monster },
    d.cyclePatrols?.length ? { entry: pat1.text, monster: pat1.monster } : { entry: `${ml7.text}, ${pick(WANDERING_ACTIVITIES)}`, monster: ml7.monster },
    { entry: `Something inexplicable: ${engine.evaluate('dungeonWeird')}`, monster: null },
  ];
  // The check die's 6: news of the hunter, or just signs of life.
  const six = hunter
    ? `a sign of the ${hunterLabel.toLowerCase()} (${hunter.name}): ${pick(HUNTER_SIGNS)}`
    : `a sign of what lives here: ${pick(WANDERING_SIGNS).replace(/^./, c => c.toLowerCase())}`;
  return finishTable(d, rows, six);
}

// Numbers the table's rows for its die, and settles what the check die's 6
// means: a random pulse, if the dungeon has one, outranks a mere sign.
function finishTable(d, rows, sign) {
  d.wanderingDie = tableDie(d.size);
  const pulse = d.gestalts?.find(g => g.id === 'random-pulse')?.system;
  d.checkSix = pulse?.pulse
    ? `the ${pulse.pulse} pulses (${pulse.duration}; warning one round before: ${pulse.sign})`
    : sign;
  const table = rows.slice(0, d.wanderingDie).map((r, i) => ({ roll: i + 1, ...r }));
  d.wanderingTable = table;
  return table;
}

// ── One-click module generation ───────────────────────────────────
// Layouts whose zones may be looped together directly: neighbouring wings or
// branches (never through the hub or artery itself). The rest keep their
// zones apart — that separation is the layout.
const LOOP_CROSS_ZONES = {
  'hub-and-spokes': (a, b) => a !== 'the hub' && b !== 'the hub',
  'artery-and-branches': (a, b) => a !== 'the artery' && b !== 'the artery',
};

// Zones whose shape is the point: the landmark's long way round gets no shortcut.
const LOOP_KEEP_ZONES = {
  'landmark-and-loop': ['the long way around', 'the landmark'],
};

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

  // Spatial gestalt → a planned layout; `layout: 'cyclic'` → nested cycles
  // instead. Without either, grow the classic eclectic map from rolled exits.
  const cyclic = config.layout === 'cyclic';
  const spatial = cyclic ? null : d.gestalts?.find(g => g.category === 'spatial') ?? null;
  // config.cycle forces the overall cycle (a cycle id from cycles.js).
  const plan = cyclic ? buildCyclicLayout(target, Math.random, { overall: config.cycle ?? null }) : spatial ? buildLayout(spatial.id, target) : null;
  // By default, suitable gestalt zones are rebuilt as cycles of their own.
  if (plan && spatial && config.zoneCycles !== false) fillZonesWithCycles(plan, spatial.id);
  // Loops, so there are routes to choose between (cycle flows have their own).
  if (plan && spatial && config.loops !== false) {
    const opts = { crossZone: LOOP_CROSS_ZONES[spatial.id], keepZones: LOOP_KEEP_ZONES[spatial.id], keepRoute: spatial.id === 'landmark-and-loop' };
    addLoops(plan, opts);
    // Still one way through: close a loop even at the cost of a room.
    if (planLoops(plan) < 1) addLoops(plan, { ...opts, target: 1, fixedSize: false });
    d.rooms = plan.cells.size;
  }
  if (plan?.flows?.length) {
    d.cycleLayout = { id: 'cyclic', name: 'Cycles', category: 'cyclic', cast: {}, rooms: [], zones: [] };
    d.cycleFlows = plan.flows.filter(Boolean).map(f => ({ flow: f.flow, zone: f.zone }));
  }
  if (cyclic) d.cycleFlow = plan.flow;
  // What the layout's notes and zones belong to: the spatial gestalt, or the cycles.
  const layoutOwner = cyclic ? d.cycleLayout : spatial;
  const oneWays = [];
  if (plan) placeFromPlan(plan);
  else growEclectic();

  // Stock each planned cell in exploration order (so room numbers rise with
  // depth), then lay the planned passages and vertical links.
  function placeFromPlan(plan) {
    const idOf = new Map();
    const firstTwin = new Map();
    for (const k of plan.order()) {
      const c = plan.cells.get(k);
      const isFinalRoom = k === plan.final;
      const room = stockRoom(partyLevel, {
        isFinalRoom,
        finalRoomDesc: isFinalRoom ? d.finalRoom : null,
        contentType: isFinalRoom ? null : (c.content ?? null),
      });
      room.exits = [];  // passages come from the plan, not from rolled exits
      if (c.roomType) {
        room._fixedShape = true;  // the layout wants this shape
        room.roomType   = c.roomType === 'large' ? 'room' : c.roomType;
        room.roomSize   = c.roomType === 'large' ? largeRoomSize() : rollRoomSize(c.roomType);
        room.hallway    = room.roomType === 'corridor' ? (room.hallway ?? engine.evaluate('hallways')) : null;
        room.furnishing = room.roomType === 'corridor' ? null : (room.furnishing ?? engine.evaluate('Furniture'));
      }
      // Repeated wings share their twins' shape and furnishings.
      if (c.twin != null) {
        const t = firstTwin.get(c.twin);
        if (t) Object.assign(room, { roomType: t.roomType, roomSize: t.roomSize, furnishing: t.furnishing, hallway: t.hallway });
        else firstTwin.set(c.twin, room);
        room._twin = c.twin;
      }
      if (k === plan.entrance) room._isEntrance = true;
      room._zone = c.zone ?? null;
      room._layoutRole = c.role ?? null;
      if (c.flowRef) {
        room._flowRef = c.flowRef;
        room._flowRoles = c.flowRoles;
      }
      room._planKey = k;
      rooms.push(room);
      idOf.set(k, placeRoom(room, c.x, c.y, null, null));
    }
    for (const e of plan.edges) {
      const ca = plan.cells.get(e.a), cb = plan.cells.get(e.b);
      const dir = dirFromDelta(cb.x - ca.x, cb.y - ca.y);
      const type = e.type ?? rollExitType();
      addEdge(map, idOf.get(e.a), idOf.get(e.b), dir, type);
      if (e.oneWay) oneWays.push({ to: idOf.get(e.b), dir, type });
    }
    const roomAt = id => map.nodes.get(id).room;
    const vert = new Map();
    for (const v of plan.verticals) {
      const ia = idOf.get(v.a), ib = idOf.get(v.b);
      addEdge(map, ia, ib, 'down', 'vertical:down');
      const ra = roomAt(ia), rb = roomAt(ib);
      for (const [r, dir, other] of [[ra, 'down', rb], [rb, 'up', ra]]) {
        const st = vert.get(r) ?? { form: v.form, up: false, down: false };
        st[dir] = true;
        vert.set(r, st);
        if (dir === 'down') r._verticalTarget = other._roomNumber;
        else r._verticalSource = other._roomNumber;
      }
    }
    for (const r of rooms) {
      const st = vert.get(r);
      if (st) {
        r.verticalExit = { form: st.form, dir: st.up && st.down ? 'both' : st.down ? 'down' : 'up' };
        r._planVertical = true;
      }
    }
  }

  function growEclectic() {
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
  }

  // No room is "current" in the full-document view
  map.currentId = null;

  // Post-hoc final room: BFS from the entrance to find the room with the greatest
  // graph distance, then move the final-room designation there if it isn't already.
  // DFS placement means the last-placed room is usually deep, but not always the deepest.
  // Planned layouts place their final room deliberately.
  if (!plan) {
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
  // Planned voids, chasms, and lanes stay empty.
  const occupied = () => new Set([...map.positions, ...(plan?.blocked ?? [])]);
  for (const room of [...rooms]) {
    const ve = room.verticalExit;
    if (!ve || ve.dir === 'up' || room._planVertical) continue;  // 'up'-only rooms are targets, not sources
    const { x, y } = room._mapNode;
    const [fx, fy] = findFreeCell(x, y, occupied());
    const sub = stockRoom(partyLevel, {});
    sub.exits = [];  // a pocket is reached only by its vertical link
    sub._zone = room._zone ?? null;
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

  // One-way passages read as impassable from their far side.
  for (const ow of oneWays) {
    const ex = map.nodes.get(ow.to).room.exits.find(e => e.direction === OPPOSITE_DIR[ow.dir]);
    if (ex) ex.type = `${ow.type} (cannot be passed from this side)`;
  }

  if (plan) applyLayoutNotes(plan, layoutOwner, rooms);
  // Kept for the floor-plan renderer: which layout this is, and its terrain cells.
  map.layout = plan ? { id: layoutOwner.id, terrain: plan.terrain ?? [] } : null;

  // Cycles (a cyclic dungeon, or cycle-filled zones): locks, keys, barriers,
  // danger, patrols… as room content.
  const reshape = (room, roomType, size = rollRoomSize(roomType)) => {
    room.roomType = roomType;
    room.roomSize = size;
    room.hallway = roomType === 'corridor' ? (room.hallway ?? engine.evaluate('hallways')) : null;
    room.furnishing = roomType === 'corridor' ? null : (room.furnishing ?? engine.evaluate('Furniture'));
    const node = map.nodes.get(room._mapId);
    if (node) { node.roomType = roomType; node.roomSize = room.roomSize; }
  };
  if (d.cycleFlows?.length) {
    // A cycle that reshapes a room (a route through caves or corridors) wants that shape.
    const resize = (room, roomType) => { reshape(room, roomType); room._fixedShape = true; };
    applyCycleContent({ d, rooms, map, partyLevel, stockContent, pickMonster, rollCount, treasureForLevel, resize });
  }

  // Faction bases (spread apart), territories, faction-owned rooms, and the
  // room roles each relational gestalt calls for.
  applyGestaltRoles({ d, rooms, map, partyLevel, stockContent, pickMonster, rollCount, treasureForLevel });
  // Place the transformational systems on the room graph.
  applyChanges({ d, rooms, map });
  // Make every pattern learnable from near the entrance.
  applyTells({ d, rooms, map });
  // Shapes to fit contents: lairs in chambers, wandering monsters apart.
  fitRooms({ rooms, map, reshape, chamberSize, hallSize: largeRoomSize });

  // Rumors: up to two hint at the gestalts (pinned to their key rooms); the
  // rest are table rumors pinned to random rooms.
  const patternRumors = gestaltRumors(d, rooms, 2);
  d.rumorRefs = [
    ...patternRumors.map(r => ({ text: r.text, roomRef: r.roomRef ?? rooms[1 + Math.floor(Math.random() * (rooms.length - 1))]._roomNumber })),
    ...d.rumors.slice(0, Math.max(1, 3 - patternRumors.length)).map(rumor => {
      const ref = rooms[Math.floor(Math.random() * (rooms.length - 1))];
      return { text: rumor, roomRef: ref._roomNumber };
    }),
  ];

  generateWanderingTable(partyLevel);

  return { dungeon: d, rooms, map };
}

// Turn a plan's notes and zones into gestalt annotations on the stocked rooms.
function applyLayoutNotes(plan, g, rooms) {
  const byKey = new Map(rooms.filter(r => r._planKey).map(r => [r._planKey, r]));
  const resolve = text => text.replace(/@\{([^}]+)\}/g, (_, k) => byKey.has(k) ? `Room ${byKey.get(k)._roomNumber}` : 'another room');
  for (const n of plan.notes) {
    const room = byKey.get(n.key);
    if (!room) continue;
    (room._gestalt ??= []).push({ pattern: g.name, role: n.role, note: resolve(n.text) });
    (g.rooms ??= []).push({ room: room._roomNumber, role: n.role });
  }
  Object.assign(g.cast ??= {}, plan.meta);
  g.zones = Object.entries(plan.zones).map(([name, desc]) => ({
    name, desc,
    rooms: rooms.filter(r => r._zone === name).map(r => r._roomNumber),
  })).filter(z => z.rooms.length);
}
