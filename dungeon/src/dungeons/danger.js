// How dangerous a dungeon is to linger in: how often the GM checks for a
// random encounter, and what the check die can turn up.
//
// Shadowdark checks every few crawling rounds by danger level (Unsafe 3,
// Risky 2, Deadly 1); Dolmenwood counts exploration turns. Either way the
// check is a d6: a 1 means an encounter, rolled on the dungeon's table. The
// table is a flat die (d6, or d8 in a large dungeon) so every entry turns up
// in an ordinary delve; a dungeon-wide event (a pulse, a sign) rides on the
// check die's 6 instead of hiding at the tail of a bell curve.

export const DANGER_LEVELS = {
  unsafe: { label: 'Unsafe', interval: 3 },
  risky:  { label: 'Risky',  interval: 2 },
  deadly: { label: 'Deadly', interval: 1 },
};

const KEYS = ['unsafe', 'risky', 'deadly'];
const WEIGHTS = { unsafe: 3, risky: 5, deadly: 1 };

// Something that hunts the halls, or a dungeon whose dangers escalate, makes
// lingering worse: one step more dangerous.
const DANGEROUS_GESTALTS = new Set(['hunter-and-prey', 'threat-and-refuge']);

export function rollDangerLevel({ gestalts = [], type = null, rand = Math.random } = {}) {
  const total = KEYS.reduce((s, k) => s + WEIGHTS[k], 0);
  let r = rand() * total;
  let i = KEYS.findIndex(k => (r -= WEIGHTS[k]) < 0);
  if (i < 0) i = 1;
  if (type === 'Menagerie' || gestalts.some(g => DANGEROUS_GESTALTS.has(g.id ?? g))) i = Math.min(i + 1, KEYS.length - 1);
  return KEYS[i];
}

// The table's die: every entry should be able to turn up in one delve.
export const tableDie = size => size === 'Large' ? 8 : 6;

export function encounterUnit(d) {
  return d?.monsterSource === 'dolmenwood' ? 'turn' : 'crawling round';
}

// "Risky — check every 2 crawling rounds"
export function checkCadence(d) {
  const lvl = DANGER_LEVELS[d?.danger] ?? DANGER_LEVELS.risky;
  const unit = encounterUnit(d);
  return `${lvl.label} — check every ${lvl.interval === 1 ? unit : `${lvl.interval} ${unit}s`}`;
}

// The full rule, for the module and the brief:
// "Risky — check every 2 crawling rounds. Roll a d6: on a 1, …"
export function checkRule(d) {
  const die = d?.wanderingDie ?? 6;
  const six = d?.checkSix ? ` On a 6, ${d.checkSix}.` : '';
  return `${checkCadence(d)}. Roll a d6: on a 1, roll a d${die} on the table below.${six}`;
}

// One encounter check against a dungeon: { hit, roll, entry, monster, six }.
export function rollEncounterCheck(d, rand = Math.random) {
  if (!d?.wanderingTable) return null;
  const check = 1 + Math.floor(rand() * 6);
  if (check === 6 && d.checkSix) return { hit: false, six: d.checkSix };
  if (check !== 1) return { hit: false };
  const roll = 1 + Math.floor(rand() * (d.wanderingDie ?? d.wanderingTable.length));
  const row = d.wanderingTable.find(r => r.roll === roll);
  return { hit: true, roll, entry: row?.entry ?? '…', monster: row?.monster ?? null };
}
