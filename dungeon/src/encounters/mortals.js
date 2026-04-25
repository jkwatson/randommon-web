import { rollDice } from '@wandering-monstrum/perchance-engine';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const d = n => Math.ceil(Math.random() * n);

// Basic Details table: d4=sex, d6=age, d8=dress, d10=feature, d12=kindred
const SEX     = ['Female','Female','Male','Male'];
const AGE     = ['Child','Youth','Adult','Mature','Old','Decrepit'];
const DRESS   = ['Drab','Elaborate','Formal','Messy','Pristine','Scant','Tatty','Uniform'];
const FEATURE = ['Bald','Beautiful','Hairy','Lost limb','Muscular','Obese','Scrawny','Short','Tall','Ugly'];
const KINDRED = ['Breggle','Breggle','Breggle','Human','Human','Human','Human','Human','Human','Human','Mossling','Mossling'];

export const EVERYDAY_STATBLOCK =
  'AC 10, HP 2, ATK 1 weapon −1 (1d4), MV near, S +0, D +0, C +0, I +0, W +0, Ch +0, AL any, LV 1';

function basicDetails() {
  return {
    sex:     pick(SEX),
    age:     pick(AGE),
    dress:   pick(DRESS),
    feature: pick(FEATURE),
    kindred: pick(KINDRED),
  };
}

// ── Trade goods tables (d20) ─────────────────────────────────────────────────
// Entries marked with a sub-type are placeholders until those tables are provided.
const HERBAL_TABLE = [
  'Arrowhame',
  'Blood Canker',
  'Blushing Mandrake',
  'common item',   // 4–7
  'common item',
  'common item',
  'common item',
  'edible fungus', // 8–9
  'edible fungus',
  'edible plant',  // 10–11
  'edible plant',
  'Marshwick',     // 12
  'Mind-Moss',     // 13
  'rare fungus',   // 14–15
  'rare fungus',
  'rare herb',     // 16–18
  'rare herb',
  'rare herb',
  'Sage Toe',      // 19
  'Wallowmost',    // 20
];

const MUNDANE_TABLE = [
  'bedrolls',              // 1
  'bottles of beer',       // 2 (type TBD)
  'bottles of wine',       // 3 (type TBD)
  'bundles of firewood',   // 4
  'casks of beer',         // 5 (type TBD)
  "coils of rope (50')",   // 6
  'cooking pot sets',      // 7
  'edible fungus',         // 8 (type TBD)
  'edible plant',          // 9 (type TBD)
  'fresh rations (cheese)',     // 10
  'fresh rations (fish)',       // 11
  'fresh rations (root veg.)',  // 12
  'fresh rations (sausages)',   // 13
  'gourd pipes',           // 14
  'hammers (small)',        // 15
  'musical instruments (wind)', // 16
  'oil flasks',            // 17
  'pipeleaf',              // 18 (type TBD)
  'pipeleaf',              // 19 (type TBD)
  'torches (bundles of 3)', // 20
];

const COMMON_FUNGI_HERBS = [
  'Arrowhame', 'Blood Canker', "Bosun's Balm", 'Fenob', 'Gillywort',
  "Grue's Ear", 'Hogscap', 'Lankswith', 'Lilywhite', 'Marshwick',
  'Moonhaw', 'Ofteritch', 'Sallow Parsley', 'Smottlebread', 'Spirithame',
  'Tom-a-Merry', 'Wallowmost', 'Wayfarrow', "Witch's Oyster", 'Wolfsbane',
];

const EDIBLE_FUNGI = [
  'Amethyst orb',
  'Chanctonslip',
  'Drounberry',
  'Fairy veil',
  'Goodgilly',
  'Hell horns (1 ration feeds 2)',
  'Liverwort Jack',
  'Mangy horns',
  'Marshguts',
  'Meat and bread',
  'Monkskull',
  'Moonchook (worth 1d6 gp/ration)',
  'Old Duchess',
  'Purple piper',
  "Scrabey's hair",
  'Shank-orbs (no nutritive effect)',
  'Spatchcock',
  'Willy-be-bold',
  'Windcap',
  "Woodsman's fancy",
];

const EDIBLE_PLANTS = [
  'Barb cone',
  'Bent leek',
  'Black medlar',
  'Bogsnip',
  'Butter mandrake (wriggles when uprooted)',
  'Creeping prune',
  'Gobble-drop',
  "Hag's mantle",
  'Hangleberry',
  'Hob nut (−2 to saves vs. magic until next day)',
  'Jellycup (mild psychedelia if eaten after dark)',
  'Lankleaf root',
  'Noosenut',
  'Prehensile radish',
  'Shankroot',
  'Snodberry',
  'Wallow shoot',
  'Westernut',
  'Witch-elm lantern',
  'Wranklefrond',
];

const RARE_FUNGI = [
  "Angel's Lament (eat: lose 1d6 INT/WIS/CHA for 2d12h; death if any reach 0)",
  'Bloodcap (eat: save or faint 1d6 rounds in stimulating situations for 24h)',
  "Devil's Grease (eat: save or act like animal 1d6h; −1d4 CON for a week)",
  'Foolscap (eat: save or transform into werewolf until dawn)',
  "Goatman's Goblet (eat: merry disorientation 1d4h; facial hair increases)",
  'Grinning Jenny (eat: +1 atk/dmg/saves 3d6 turns; then catatonia 1d10 turns)',
  "Hob's Lewd (drink slime: jubilation 2d6h; sleep 24h after or −2 atk/saves)",
  'Lambent Stinkhorn (eat: stinkhorns erupt on face; +1 max HP, −1 reaction)',
  "Lover's Gasp (eat: +1 CHA with one specific visualised individual)",
  "Mawbarg's Jam (rub: heals 1d4 HP; eat: save or vomit; success = weightless 1d6 turns)",
  'Mossmulch (eat: poisonous — −2 atk/saves; save or coma 1d6 days)',
  'Mottlecap (eat: headache 24h; save or sleepless; −2 saves vs. magic)',
  'Numblings (eat: grow a new organ after 1d6 days — d6: 1 brain, 2 heart, 3 eye, 4 tongue, 5 finger, 6 nose)',
  "Puck's Ear (eat: trance 1d4h; save or assailed by 1d3 malicious sprites)",
  'Purple Nightcap (eat: save or die of asphyxiation; success = coma 1d4 days)',
  'Rotting Mazegill (eat: lose 3d6 CON, save halves; death if CON below 1)',
  'Shaggy Sage (eat: sleep 2d3h in paradise; save or become obsessed with returning)',
  'Speckled Sporange (eat: 2-in-6 → +1 CON permanently; otherwise −1 STR and CON)',
  'Velvet Flounder (eat: blood-lust, attack all for 1d3 turns)',
  "Witch's Purple (eat: psychedelic state; skin turns violet for 1d4 days)",
];

const PIPELEAF = [
  'Barley Blend', "Burglar's Blend", "Crofter's Daughter", 'Dusty Abbot',
  'Fatty Lumper', 'Flufftop', 'Gamgy Weed', "The Gibbet's Gift",
  'Green Jenny', 'Lanksbottom Leaf', 'Mogglemoss', "Mummer's Farce",
  'Old Doby', 'Pedlar Puff', 'Shaggy Pony', 'Special Shag',
  'Speckled Wyrm', 'Wayside Wisp', "Westling's Weed", "Witch's Shag",
];

const WINES = [
  'Buckston Fizz', 'The Cold Prince', "Faggley's Iced",
  'Inkling Wine', 'Lady Mauve', "Underbrood's Vintage",
];

const BEERS = [
  'Barrowblaster', 'Cobsworth Pale', "Halthwidden's", "Keye's Balm",
  'Marrowhyte Dark', 'Merryweather', "Pilston's Heartbreaker", 'Tithelands Cider',
];

const RARE_HERBS = [
  'Black Clover', 'Blushing Mandrake', 'Frondhelm', 'Goatsweed',
  'Groaning Mandrake', "Hag's Tears", 'Horridwort', 'Knobbled Mandrake',
  'Mind-Moss', 'Oddy Sorrel', "Parson's Gobble", 'Prancing Mandrake',
  'Rindlewort', 'Sage Toe', "Sclubber's Twist", 'Shub Eggs',
  'Snogglebeard', 'Woodpurse', 'Worm-Mallow', 'Writhing Mandrake',
];

// Map from sub-type key → table to roll on (populated as tables are added)
const SUB_TYPE_TABLES = {
  'common item':   COMMON_FUNGI_HERBS,
  'edible fungus': EDIBLE_FUNGI,
  'edible plant':  EDIBLE_PLANTS,
  'rare fungus':    RARE_FUNGI,
  'rare herb':      RARE_HERBS,
  'bottles of beer':  BEERS,
  'casks of beer':    BEERS,
  'bottles of wine':  WINES,
  'pipeleaf':         PIPELEAF,
};

// Sub-types with no table yet
const PENDING_SUB_TYPE = new Set();

function rollTradeGood(table) {
  const item = pick(table);
  if (SUB_TYPE_TABLES[item]) return pick(SUB_TYPE_TABLES[item]);
  return PENDING_SUB_TYPE.has(item) ? `${item} (type TBD)` : item;
}

const TYPE_GENERATORS = {
  angler() {
    const hasFish = d(6) <= 3;
    return hasFish
      ? `Carrying ${rollDice('2d6')} rations of fresh fish (1 gp each) — may be willing to sell.`
      : 'No fish to sell today.';
  },

  crier() {
    const news = [
      '25% taxation of the mercantile and adventuring classes.',
      'A noble is missing — 2,000 sp reward offered.',
      'Berryld Ramius won the Victor of Ramius\' Tourney.',
      'Lady Zoemina (duke\'s daughter) to marry Lord Ramius.',
      'Strong youths sought for training for impending war.',
      'Upcoming 2-week religious festival; all travel banned.',
    ];
    return `News: "${pick(news)}"`;
  },

  'fortune-teller'() {
    const results = [
      'Weal — the proposed course of action ends well.',
      'Weal — the proposed course of action ends well.',
      'Woe — the proposed course of action ends in ruin.',
      'Woe — the proposed course of action ends in ruin.',
      'Truth — weal or woe, per the Referee\'s judgement.',
      'Truth — weal or woe, per the Referee\'s judgement.',
    ];
    const methods = [
      'Astrology','Card reading','Casting bones','Crystal ball',
      'Fire gazing','Ley line dowsing','Melting wax','Oracular vision',
      'Palm reading','Sparrow entrails','Spirit board','Tea leaves',
    ];
    const fee = rollDice('1d10');
    return `Method: ${pick(methods)}. Fee: ${fee} gp (traditionally paid in silver). Reading: ${pick(results)}`;
  },

  'lost soul'() {
    const fates = [
      'Escaped from the realms of the dead.',
      'Kidnapped by fairies as a child, recently expelled.',
      'Lost in the wilds — starving and ragged.',
      `Slept for ${rollDice('1d100')} years, recently awoke.`,
      'Teleported by ley line discharge, now hopelessly lost.',
      `Wandered in Fairy for ${rollDice('2d100')} years.`,
    ];
    const homes = [
      'Castle Brackenwold (Hex 1508)',
      'Dreg (Hex 1110)',
      'Drigbolton (Hex 0702)',
      'Fort Vulgar (Hex 0604)',
      'Lankshorn (Hex 0710)',
      'Meagre\'s Reach (Hex 1703)',
      'Odd (Hex 1403)',
      'Prigwort (Hex 1106)',
      'Woodcutters\' Encampment (Hex 1109)',
      pick(['Bogwitt Manor (Hex 1210)','Hall of Sleep (Hex 1304)','Harrowmoor Keep (Hex 1105)','Nodding Castle (Hex 0210)']),
    ];
    return `Fate: ${pick(fates)} Seeking: ${pick(homes)}.`;
  },

  merchant() {
    const tiers = [
      { wealth: `${rollDice('1d100')} gp`,           guards: '2 soldiers per wagon' },
      { wealth: `${rollDice('1d100') * 2} gp`,        guards: '3 soldiers per wagon' },
      { wealth: `${rollDice('1d100') * 3} gp + 1 gem`, guards: '4 soldiers/wagon, 1 lieutenant per 5 wagons' },
      { wealth: `${rollDice('1d100') * 4} gp + 1d3 gems`, guards: '5 soldiers/wagon, 2 lieutenants per 5 wagons' },
      { wealth: `${rollDice('1d100') * 5} gp + 1d4 gems + 1 art object`, guards: '6 soldiers/wagon, 2 lieutenants per 4 wagons, 1 captain' },
      { wealth: `${rollDice('1d100') * 6} gp + 2d4 gems + 1d4 art objects`, guards: '7 soldiers/wagon, 2 lieutenants per 3 wagons, 1 captain' },
    ];
    const t = tiers[d(6) - 1];
    return `Wealth per wagon: ${t.wealth}. Guards: ${t.guards}. (1 wagon per merchant)`;
  },

  pedlar() {
    const herbalCount  = d(3);
    const mundaneCount = d(3);
    const herbal  = Array.from({ length: herbalCount },  () => rollTradeGood(HERBAL_TABLE));
    const mundane = Array.from({ length: mundaneCount }, () => rollTradeGood(MUNDANE_TABLE));
    return `Herbal (${herbalCount}): ${herbal.join(', ')}. Mundane (${mundaneCount}): ${mundane.join(', ')}.`;
  },

  pilgrim() {
    const destinations = [
      'Church of St Pastery (Lankshorn)',
      'Church of St Waylaine (Prigwort)',
      'A lost shrine (correct location)',
      'A lost shrine (incorrect location)',
      'Cathedral of St Signis (Castle Brackenwold)',
      'Three Martyrs Minster (High-Hankle)',
    ];
    const flagellants = d(6) <= 2 ? ' — flagellants' : '';
    return `Destination: ${pick(destinations)}${flagellants}.`;
  },

  priest() {
    const functions = [
      'Administrator','Alms collector','Cantor','Confessor',
      'Evangelist','Herbalist','Lichward','Mendicant',
      'Preacher','Scholar','Scribe','Tithe collector',
    ];
    return `Function: ${pick(functions)}.`;
  },

  villager() {
    const activities = [
      'Calling for a lost child','Chasing errant swine','Collecting eggs',
      'Cutting wood','Fetching water','Foraging','Hanging corn dollies',
      'Hunting fowl','Masked capering','Praying to a saint','Trysting','Whittling',
    ];
    return `Activity: ${pick(activities)}.`;
  },
};

/**
 * Generate full everyday mortal details (‡ entries).
 * @param {string} rawDescription - e.g. "Angler (2d4)"
 * @returns {{ typeName, label, basic, detail, statblock }}
 */
export function generateEverydayMortal(rawDescription) {
  const label = rawDescription.replace(/\s*\([^)]*\)/, '').trim();
  const typeName = label.toLowerCase();
  const fn = TYPE_GENERATORS[typeName] ?? (() => '');
  return {
    typeName,
    label,
    basic: basicDetails(),
    detail: fn(),
    statblock: EVERYDAY_STATBLOCK,
  };
}

/**
 * Generate detail-only mortal info for † entries with no class stat block.
 * Returns null if there is no generator for the given type.
 * @param {string} rawDescription - e.g. "Lost Soul (1d4)"
 * @returns {{ typeName, label, basic: null, detail, statblock: null } | null}
 */
export function generateMortalDetail(rawDescription) {
  const label = rawDescription.replace(/\s*\([^)]*\)/, '').trim();
  const typeName = label.toLowerCase();
  const fn = TYPE_GENERATORS[typeName] ?? null;
  if (!fn) return null;
  return { typeName, label, basic: basicDetails(), detail: fn(), statblock: null };
}
