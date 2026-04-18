import { rollDice } from '@wandering-monstrum/perchance-engine';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const d = n => Math.ceil(Math.random() * n);
const fmt = n => n >= 0 ? `+${n}` : `${n}`;

// ── Class stat block data by level tier ──────────────────────────────────────

const CLASSES = {
  bard: {
    label: 'Bard',
    alignment: 'any',
    tiers: [
      { level: 1, title: 'Rhymer',     ac: 12, hp: 3,  mv: 'near',  atk: '1 shortsword +0 (1d6)',              s:+0, d:+1, c:+0, i:+1, w:+1, ch:+2,
        gear: 'Leather armour, shortsword, sling + 20 stones',
        magic: 'Counter charm; Enchantment 1/day (mortals)',
        skills: 'Decipher Document, Legerdemain, Listen, Monster Lore',
        companions: null },
      { level: 3, title: 'Troubadour', ac: 14, hp: 10, mv: 'close', atk: '1 shortsword +1 (1d6)',              s:+1, d:+2, c:+1, i:+2, w:+1, ch:+3,
        gear: 'Chainmail, shortsword, silver dagger, shortbow, Vaporous Spirits',
        magic: 'Counter charm; Enchantment 3/day (mortals)',
        skills: 'Decipher Document, Legerdemain, Listen, Monster Lore',
        companions: '1d4 rhymers' },
      { level: 5, title: 'Lore-Master', ac: 15, hp: 17, mv: 'close', atk: '1 Arcane Shortsword +4 (1d6+2)',   s:+1, d:+2, c:+1, i:+2, w:+2, ch:+3,
        gear: 'Chainmail + shield, Arcane Shortsword (+2 attack), silver dagger, shortbow, Lute of Obscurement, Prismatic Elixir',
        magic: 'Counter charm; Enchantment 5/day (animals, demi-fey, mortals)',
        skills: 'Decipher Document, Legerdemain, Listen, Monster Lore',
        companions: '1d4 troubadours, 1d4 LV1 enchanters/hunters/thieves' },
    ],
  },

  cleric: {
    label: 'Cleric',
    alignment: 'L or N',
    note: 'LV3+ belong to a holy order: St Faxis (+2 saves vs arcane), St Sedge (lay on hands 1/day), or St Signis (+1 attack vs undead, harms undead without silver)',
    tiers: [
      { level: 1, title: 'Acolyte', ac: 15, hp: 3,  mv: 'close', atk: '1 longsword +0 (1d8)',              s:+1, d:+0, c:+1, i:+0, w:+2, ch:+1,
        gear: 'Chainmail + shield, longsword, shortbow',
        companions: null },
      { level: 3, title: 'Warden',  ac: 17, hp: 10, mv: 'close', atk: '1 longsword +1 (1d8)',              s:+1, d:+0, c:+1, i:+1, w:+3, ch:+2,
        gear: 'Plate mail + shield, longsword, shortbow, holy water',
        spells: 'Lesser Healing, Mantle of Protection',
        companions: '1d6 acolytes' },
      { level: 5, title: 'Elder',   ac: 19, hp: 17, mv: 'close', atk: '1 Holy Longsword +4 (1d8+2)',       s:+1, d:+0, c:+2, i:+1, w:+3, ch:+2,
        gear: 'Plate mail + Holy Shield, Holy Longsword (+2 attack), shortbow, 3× holy water, Prismatic Elixir, Scroll of Cure Affliction',
        spells: 'Lesser Healing, Light, Bless, Hold Person',
        companions: '1d4 wardens, 2d6 acolytes' },
    ],
  },

  enchanter: {
    label: 'Enchanter',
    alignment: 'any',
    note: 'Usually elves, grimalkins, or woodgrues',
    tiers: [
      { level: 1, title: 'Wanderer',  ac: 12, hp: 3,  mv: 'near',  atk: '1 shortsword +0 (1d6)',            s:-1, d:+1, c:+0, i:+2, w:+1, ch:+2,
        gear: 'Leather armour, shortsword',
        spells: 'Beguilement; Rune of Vanishing 1/day',
        skills: 'Detect Magic',
        companions: null },
      { level: 3, title: 'Beguiler',  ac: 14, hp: 10, mv: 'close', atk: '1 Fairy Dagger +3 (1d4+2)',        s:-1, d:+2, c:+0, i:+3, w:+1, ch:+3,
        gear: 'Chainmail, longsword, Fairy Dagger (+2 attack), Bottled Light',
        spells: "Fool's Gold, Forgetting, Subtle Sight; Deathly Blossom/Gust of Wind/Proof Against Deadly Harm 1/day each",
        skills: 'Detect Magic',
        companions: '1d4 wanderers' },
      { level: 5, title: 'Bewitcher', ac: 14, hp: 17, mv: 'close', atk: '1 Fairy Dagger +4 (1d4+2)',        s:-1, d:+2, c:+1, i:+3, w:+2, ch:+3,
        gear: 'Chainmail, longsword, Fairy Dagger (+2 attack), Liquid Time, Wand of Phantasm (10 charges)',
        spells: 'Awe, Cloak of Darkness, Disguise Object, Masquerade; Fog Cloud/Gust of Wind/Sway the Mortal Mind 2/day; Arcane Unbinding/Fairy Gold 1/week',
        skills: 'Detect Magic',
        companions: '1d4 beguilers, 1d4 LV1 bards/hunters/thieves' },
    ],
  },

  fighter: {
    label: 'Fighter',
    alignment: 'any',
    tiers: [
      { level: 1, title: 'Soldier',    ac: 15, hp: 4,  mv: 'close', atk: '1 longsword +1 (1d8)',             s:+2, d:+1, c:+2, i:-1, w:+0, ch:+0,
        gear: 'Chainmail + shield, longsword, shortbow',
        companions: null },
      { level: 3, title: 'Lieutenant', ac: 17, hp: 13, mv: 'close', atk: '1 longsword +2 (1d8)',             s:+3, d:+1, c:+2, i:-1, w:+0, ch:+1,
        gear: "Plate mail + shield, longsword, shortbow, Orgon's Scintillating Philtre",
        special: 'Combat talent: Cleave',
        companions: '2d4 soldiers' },
      { level: 5, title: 'Captain',    ac: 19, hp: 22, mv: 'close', atk: '1 Fairy Longsword +5 (1d8+2)',     s:+4, d:+1, c:+3, i:+0, w:+1, ch:+1,
        gear: 'Plate mail + Arcane Shield, Fairy Longsword (+2 attack), shortbow, Prismatic Elixir, Wereform Elixir',
        special: 'Combat talent: Leader',
        companions: '1d4 lieutenants, 2d6 soldiers' },
    ],
  },

  friar: {
    label: 'Friar',
    alignment: 'L or N',
    note: 'Usually humans',
    tiers: [
      { level: 1, title: 'Mendicant', ac: 12, hp: 2,  mv: 'near',  atk: '1 staff +0 (1d4)',                  s:+0, d:+1, c:+0, i:+0, w:+2, ch:+1,
        gear: 'Staff',
        spells: 'Lesser Healing',
        companions: null },
      { level: 3, title: 'Preacher',  ac: 12, hp: 7,  mv: 'near',  atk: '1 staff +0 (1d4)',                  s:+0, d:+1, c:+0, i:+1, w:+3, ch:+2,
        gear: 'Staff, sling + 20 stones, holy water, Scroll of Holy Light',
        spells: 'Detect Evil, Lesser Healing, Speak With Animals',
        companions: '1d4 mendicants' },
      { level: 5, title: 'Healer',    ac: 13, hp: 12, mv: 'near',  atk: '1 Holy Staff +3 (1d4+2)',            s:+0, d:+1, c:+1, i:+1, w:+3, ch:+2,
        gear: 'Holy Staff (+2 attack), sling + 20 stones, 2× holy water, Scroll of Remove Poison, Rod of Silence (5 charges)',
        spells: 'Detect Magic, Lesser Healing, Mantle of Protection, Bless, Reveal Alignment, Holy Light',
        companions: '1d4 preachers, 2d4 mendicants' },
    ],
  },

  hunter: {
    label: 'Hunter',
    alignment: 'any',
    tiers: [
      { level: 1, title: 'Guide',      ac: 12, hp: 4,  mv: 'near',  atk: '1 longbow +1 (1d6)',               s:+1, d:+2, c:+1, i:+0, w:+2, ch:+0,
        gear: 'Leather armour, shortsword, longbow + 20 arrows',
        skills: 'Alertness, Stalking, Survival, Tracking',
        companions: 'Spookhound' },
      { level: 3, title: 'Pathfinder', ac: 15, hp: 13, mv: 'near',  atk: '1 longbow +2 (1d6)',               s:+2, d:+3, c:+2, i:+0, w:+2, ch:+1,
        gear: 'Leather armour + Arcane Shield, shortsword, longbow + 20 arrows, Wyrmsblood Elixir',
        skills: 'Alertness, Stalking, Survival, Tracking',
        companions: 'Lankston mastiff, 2d4 guides' },
      { level: 5, title: 'Strider',    ac: 15, hp: 22, mv: 'near',  atk: '1 Fairy Longbow +5 (1d6+2)',       s:+2, d:+3, c:+2, i:+1, w:+3, ch:+1,
        gear: "Leather armour + Arcane Shield, shortsword, Fairy Longbow (+2 attack), Hunter's Balm, Elixir of Mutability",
        skills: 'Alertness, Stalking, Survival, Tracking',
        companions: 'Bear, 1d4 pathfinders, 2d4 guides' },
    ],
  },

  knight: {
    label: 'Knight',
    alignment: 'any',
    note: 'Usually humans or breggles',
    tiers: [
      { level: 1, title: 'Squire',  ac: 17, hp: 4,  mv: 'close', atk: '1 longsword +1 (1d8)',               s:+2, d:+0, c:+2, i:+0, w:+1, ch:+1,
        gear: 'Plate mail + shield, longsword',
        companions: null },
      { level: 3, title: 'Armiger', ac: 19, hp: 13, mv: 'close', atk: '1 longsword +2 (1d8)',               s:+3, d:+0, c:+2, i:+0, w:+1, ch:+2,
        gear: 'Arcane Plate Mail + shield, longsword, lance (1d6), Alchemical Tonic',
        companions: 'Charger, 1d4 squires' },
      { level: 5, title: 'Gallant', ac: 19, hp: 22, mv: 'close', atk: '1 Holy Lance +5 (1d6+2)',             s:+3, d:+0, c:+3, i:+0, w:+2, ch:+2,
        gear: 'Arcane Plate Mail + shield, longsword, Holy Lance (+2 attack), Prismatic Elixir',
        companions: 'Charger, 1d4 armigers, 2d4 squires' },
    ],
  },

  magician: {
    label: 'Magician',
    alignment: 'any',
    tiers: [
      { level: 1, title: 'Apprentice', ac: 10, hp: 2,  mv: 'near',  atk: '1 staff +0 (1d4)',                 s:-1, d:+0, c:+0, i:+3, w:+1, ch:+0,
        gear: 'Staff',
        spells: 'Vapours of Dream',
        skills: 'Detect Magic',
        companions: 'LV1 fighter' },
      { level: 3, title: 'Conjurer',   ac: 10, hp: 7,  mv: 'near',  atk: '1 staff +0 (1d4)',                 s:-1, d:+0, c:+0, i:+3, w:+2, ch:+0,
        gear: 'Staff, silver dagger, Scroll of Dispel Magic',
        spells: 'Fairy Servant, Ioun Shard, Phantasm',
        skills: 'Detect Magic',
        companions: '1d3 apprentices, 1d4 LV1 fighters' },
      { level: 5, title: 'Wizard',     ac: 10, hp: 12, mv: 'near',  atk: '1 Arcane Staff +3 (1d4+2)',        s:-1, d:+1, c:+0, i:+4, w:+2, ch:+1,
        gear: 'Arcane Staff (+2 attack), silver dagger, Scrolls of Knock and Fireball, Staff of Rainbow Hues (10 charges)',
        spells: 'Glyph of Sealing, Ingratiate, Dweomerlight, Flaming Spirit, Circle of Invisibility',
        skills: 'Detect Magic',
        companions: '1d2 conjurers, 1d4 apprentices, 1 LV3 fighter, 2d4 LV1 fighters' },
    ],
  },

  thief: {
    label: 'Thief',
    alignment: 'any',
    note: 'Often encountered as bandits or pirates in the wilds',
    tiers: [
      { level: 1, title: 'Footpad', ac: 12, hp: 2,  mv: 'near',  atk: '1 longsword +0 (1d8)',               s:+0, d:+2, c:+0, i:+1, w:+0, ch:+1,
        gear: 'Leather armour, longsword, 3× daggers',
        special: 'Back-stab: +4 to attack with dagger, 3d4 damage',
        skills: 'Climb Wall, Decipher Document, Disarm Mechanism, Legerdemain, Listen, Pick Lock, Search, Stealth',
        companions: null },
      { level: 3, title: 'Robber',  ac: 14, hp: 7,  mv: 'near',  atk: '1 longsword +1 (1d8)',               s:+1, d:+3, c:+1, i:+1, w:+1, ch:+2,
        gear: 'Fairy Leather Armour, longsword, 3× silver daggers, Vanishing Philtre',
        special: 'Back-stab: +4 to attack with dagger, 3d4 damage',
        skills: 'Climb Wall, Decipher Document, Disarm Mechanism, Legerdemain, Listen, Pick Lock, Search, Stealth',
        companions: '1d6 footpads' },
      { level: 5, title: 'Leader',  ac: 14, hp: 12, mv: 'near',  atk: '1 Arcane Shortsword +4 (1d6+2)',     s:+1, d:+4, c:+1, i:+2, w:+1, ch:+2,
        gear: "Fairy Leather Armour, Arcane Shortsword (+2 attack), 3× silver daggers, Liquid Time, Orgon's Scintillating Philtre",
        special: 'Back-stab: +4 to attack with dagger, 3d4 damage',
        skills: 'Climb Wall, Decipher Document, Disarm Mechanism, Legerdemain, Listen, Pick Lock, Search, Stealth',
        companions: '1d4 robbers, 2d6 footpads' },
    ],
  },
};

// ── Adventuring Party tables ──────────────────────────────────────────────────

// d12: Breggle 1-3, Elf 4, Grimalkin 5, Human 6-10, Mossling 11, Woodgrue 12
const KINDRED_RANGES = [
  { kindred: 'Breggle',   min: 1,  max: 3  },
  { kindred: 'Elf',       min: 4,  max: 4  },
  { kindred: 'Grimalkin', min: 5,  max: 5  },
  { kindred: 'Human',     min: 6,  max: 10 },
  { kindred: 'Mossling',  min: 11, max: 11 },
  { kindred: 'Woodgrue',  min: 12, max: 12 },
];

// d20 class by kindred; gaps (—) fall through to nearest available
const CLASS_BY_KINDRED = {
  Breggle:   [['bard',1,1],['cleric',2,2],['enchanter',3,3],['fighter',4,8],['friar',9,9],['hunter',10,11],['knight',12,15],['magician',16,18],['thief',19,20]],
  Elf:       [['bard',1,2],['enchanter',3,8],['fighter',9,12],['hunter',13,15],['magician',16,17],['thief',18,20]],
  Grimalkin: [['bard',1,4],['enchanter',5,8],['fighter',9,10],['hunter',11,14],['magician',15,16],['thief',17,20]],
  Human:     [['bard',1,2],['cleric',3,5],['enchanter',6,6],['fighter',7,10],['friar',11,12],['hunter',13,14],['knight',15,16],['magician',17,18],['thief',19,20]],
  Mossling:  [['bard',1,3],['enchanter',4,4],['fighter',5,10],['hunter',11,16],['magician',17,17],['thief',18,20]],
  Woodgrue:  [['bard',1,5],['enchanter',6,8],['fighter',9,10],['hunter',11,14],['magician',15,16],['thief',17,20]],
};

const LAWFUL_QUESTS = [
  'Locate a lost shrine and report to the Bishop of Brackenwold.',
  'Secretly carry a holy magic item to a patron.',
  'Destroy a powerful undead monster.',
  'Scout the movements of crookhorn troops and report to the duke.',
  'Capture a Chaotic NPC and bring them to Castle Brackenwold.',
  'Locate the lost relics of St Jorrael, rumoured to be buried in Mulchgrove (Hex 1705).',
];

const CHAOTIC_QUESTS = [
  'Scout the movements of human troops and report to Atanuwë.',
  'Rob any weaker-looking groups they encounter.',
  'Assassinate or kidnap a Lawful NPC.',
  'Secretly carry the remains of a saint to Atanuwë.',
  'Steal a precious item from an NPC.',
  'Sell poisonous substances to a paying client.',
];

function pickKindred() {
  const roll = d(12);
  return KINDRED_RANGES.find(k => roll >= k.min && roll <= k.max).kindred;
}

function pickClass(kindred) {
  const roll = d(20);
  const table = CLASS_BY_KINDRED[kindred];
  return (table.find(([, min, max]) => roll >= min && roll <= max) ?? table.at(-1))[0];
}

function levelToTier(level) {
  if (level <= 1) return 0;
  if (level <= 3) return 1;
  return 2;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a single adventurer NPC.
 * @param {string} rawDescription  e.g. "Cleric (1d20)", "Thief / Bandit (3d10)"
 * @returns {object|null}
 */
export function generateAdventurer(rawDescription) {
  // Normalise: "Thief / Bandit" → "thief", "Fortune-Teller" → not handled here
  const label = rawDescription.replace(/\s*\([^)]*\)/, '').trim();
  const typeName = label.split(/[/\\]/)[0].trim().toLowerCase();
  const data = CLASSES[typeName];
  if (!data) return null;

  // Level: 5/6 chance low (1d3), 1/6 chance high (1d6+3)
  const highLevel = d(6) === 1;
  const level = highLevel ? rollDice('1d6') + 3 : d(3);
  const tier = data.tiers[levelToTier(level)];

  const alignment = data.alignment === 'any'
    ? pick(['Lawful','Neutral','Neutral','Chaotic'])
    : pick(data.alignment.split(' or ').map(s => s.trim()));

  const statblock = [
    `AC ${tier.ac}`, `HP ${tier.hp}`,
    `ATK ${tier.atk}`, `MV ${tier.mv}`,
    `S ${fmt(tier.s)}`, `D ${fmt(tier.d)}`, `C ${fmt(tier.c)}`,
    `I ${fmt(tier.i)}`, `W ${fmt(tier.w)}`, `Ch ${fmt(tier.ch)}`,
    `AL ${alignment[0]}`, `LV ${tier.level}`,
  ].join(', ');

  return {
    label: data.label,
    title: tier.title,
    level: tier.level,
    alignment,
    statblock,
    gear:       tier.gear       ?? null,
    spells:     tier.spells     ?? null,
    magic:      tier.magic      ?? null,
    skills:     tier.skills     ?? null,
    special:    tier.special    ?? null,
    companions: tier.companions ?? null,
    note:       data.note       ?? null,
  };
}

/**
 * Generate a full adventuring party.
 * @returns {object}
 */
export function generateAdventuringParty() {
  const size = rollDice('1d4') + 4;
  const highLevel = d(6) === 1;

  const members = Array.from({ length: size }, () => {
    const kindred = pickKindred();
    const cls     = pickClass(kindred);
    const level   = highLevel ? rollDice('1d6') + 3 : d(3);
    const tier    = CLASSES[cls].tiers[levelToTier(level)];
    return { kindred, cls: CLASSES[cls].label, title: tier.title, level: tier.level };
  });

  const alignment = pick(['Lawful','Lawful','Neutral','Neutral','Chaotic','Chaotic']);
  const quest = alignment === 'Lawful' ? pick(LAWFUL_QUESTS)
              : alignment === 'Chaotic' ? pick(CHAOTIC_QUESTS)
              : null;

  const cp = rollDice('1d100');
  const sp = rollDice('1d100');
  const gp = rollDice('1d100');
  const gems = d(10) === 1 ? rollDice('1d4') : 0;
  const art  = d(10) === 1 ? rollDice('1d4') : 0;

  return { size, highLevel, members, alignment, quest, treasure: { cp, sp, gp, gems, art } };
}
