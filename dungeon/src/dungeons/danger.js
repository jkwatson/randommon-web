// How dangerous a dungeon is to linger in: how often the GM checks for a
// random encounter, and what the check die can turn up.
//
// Shadowdark checks every few crawling rounds by danger level (Unsafe 3,
// Risky 2, Deadly 1); Dolmenwood counts exploration turns. Either way the
// check is a d6: a 1 means an encounter, rolled on the dungeon's table; a
// dungeon-wide event (a pulse, a sign) rides on the check die's 6.
//
// The table is 2d4 (rows 2-8). Doubles on an even row bring that row's omen
// instead, and its event follows 1d4 rounds (or turns) later, so a quarter of
// encounters arrive telegraphed. 2 and 8 can only be rolled as doubles: they
// hold the dungeon's two one-time escalations, always foreshadowed, each
// replaced by its aftermath once it has happened. A large dungeon has one
// table per zone (sharing the escalations).

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

export const TABLE_DICE = '2d4';
export const TABLE_ROLLS = [2, 3, 4, 5, 6, 7, 8];
export const OMEN_ROLLS = [2, 4, 6, 8];
export const ONCE_ROLLS = [2, 8];

export function encounterUnit(d) {
  return d?.monsterSource === 'dolmenwood' ? 'turn' : 'crawling round';
}

// "Risky — check every 2 crawling rounds"
export function checkCadence(d) {
  const lvl = DANGER_LEVELS[d?.danger] ?? DANGER_LEVELS.risky;
  const unit = encounterUnit(d);
  return `${lvl.label} — check every ${lvl.interval === 1 ? unit : `${lvl.interval} ${unit}s`}`;
}

// The dungeon's tables: one per zone in a large dungeon, else one.
export function encounterTables(d) {
  if (d?.encounterTables?.length) return d.encounterTables;
  return d?.wanderingTable ? [{ zone: null, rooms: null, rows: d.wanderingTable }] : [];
}

// The full rule, for the module and the brief:
// "Risky — check every 2 crawling rounds. Roll a d6: on a 1, …"
export function checkRule(d) {
  const unit = encounterUnit(d);
  const which = encounterTables(d).length > 1 ? "the table for the party's zone" : 'the table below';
  const six = d?.checkSix ? ` On a 6, ${d.checkSix}.` : '';
  return `${checkCadence(d)}. Roll a d6: on a 1, roll ${TABLE_DICE} on ${which}; doubles on a row with an omen bring the omen instead, and its event follows 1d4 ${unit}s later. Rows marked once happen once, then use their aftermath.${six}`;
}

// One encounter check: { hit, roll, dice, entry, monster, omen, delay, six }.
// An omen (doubles on an omen row) returns the omen as `omen`, the event as
// `entry`, and `delay` in rounds/turns; a once row is spent when rolled.
export function rollEncounterCheck(d, rand = Math.random, zone = null) {
  const tables = encounterTables(d);
  if (!tables.length) return null;
  const check = 1 + Math.floor(rand() * 6);
  if (check === 6 && d.checkSix) return { hit: false, six: d.checkSix };
  if (check !== 1) return { hit: false };
  const table = tables.find(t => t.zone && t.zone === zone) ?? tables[0];
  const dice = [1 + Math.floor(rand() * 4), 1 + Math.floor(rand() * 4)];
  const roll = dice[0] + dice[1];
  const row = table.rows.find(r => r.roll === roll);
  if (!row) return { hit: true, roll, dice, entry: '…', monster: null };
  // A spent escalation is now its aftermath.
  if (row.once && spent(d, roll)) return { hit: true, roll, dice, entry: row.aftermath ?? row.entry, monster: null };
  if (row.once) markSpent(d, roll);
  const base = { hit: true, roll, dice, entry: row.entry, monster: row.monster ?? null, once: !!row.once };
  if (dice[0] === dice[1] && row.omen) return { ...base, omen: row.omen, delay: 1 + Math.floor(rand() * 4) };
  return base;
}

// Escalations are dungeon-wide: spent in one zone's table, spent in all.
const spent = (d, roll) => (d.spentEncounters ?? []).includes(roll);
function markSpent(d, roll) { d.spentEncounters = [...(d.spentEncounters ?? []), roll]; }

// The tables as HTML rows (web app and print share it).
export function encounterTablesHtml(d, { esc = x => x, tableClass = 'wandering-table' } = {}) {
  const tables = encounterTables(d);
  return tables.map(t => `
    ${tables.length > 1 ? `<div class="wt-zone"><b>${esc(t.zone)}</b>${t.rooms?.length ? ` (Rooms ${t.rooms.join(', ')})` : ''}</div>` : ''}
    <table class="${tableClass}">
      <tr><th>${TABLE_DICE}</th><th>Event</th><th>Omen (doubles)</th></tr>
      ${t.rows.map(r => `<tr><td class="wt-roll">${r.roll}</td><td>${r.once ? '<b>Once.</b> ' : ''}${esc(r.entry)}${r.aftermath ? `<br><i>After:</i> ${esc(r.aftermath)}` : ''}</td><td>${r.omen ? esc(r.omen) : ''}</td></tr>`).join('')}
    </table>`).join('');
}
