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
      'A noble is missing — 2,000 gp reward offered.',
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
    return 'Roving vendor of sundry goods — roll on mundane or herbal trade goods tables (DCB).';
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
 * Generate details for an everyday mortal NPC.
 * @param {string} rawDescription - raw encounter table entry, e.g. "Angler (2d4)"
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
