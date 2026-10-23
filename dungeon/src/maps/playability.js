// How playable a module's map is at the table, measured on the drawn floor
// plan rather than the room list: a "room" 10 ft square reads as a bend in a
// corridor, and the passages between rooms are floor the party walks too.
//
// A dungeon plays well when there is more than one way through (loops give
// the players route choices), most areas are real chambers (somewhere a scene
// can happen), the walk between them is short, and monsters sit where a
// monster would live — not in 10-ft passages, and not a stray group packed
// door to door with other monsters (two factions sharing a wall is a border,
// and fine).

import { buildFloorPlan } from './floorplan.js';

const CHAMBER_SQUARES = 4;  // 20 × 20 ft or more

const pathLength = pts => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const occupied = r => r?.contentType === 'monster' || r?.contentType === 'npc';
export const placed = r => !!(r._isEntrance || r.finalRoomDesc || r._factionBase || r._cycleHold || (r._gestalt ?? []).length);
const stray = r => !r.faction && !placed(r);

// Warnings, each a test and its explanation. Thresholds were set on a few
// hundred generated modules: a typical dungeon trips none or one.
const CHECKS = [
  { id: 'linear', test: m => m.loops < 1,
    say: () => 'no loops — there is only one way through, so the players never choose a route' },
  { id: 'few-chambers', test: m => m.chambers / m.areas < 0.5,
    say: m => `only ${m.chambers} of ${m.areas} areas are real chambers (20 × 20 ft or more)` },
  { id: 'thin', test: m => m.thinShare > 0.55,
    say: m => `${Math.round(m.thinShare * 100)}% of the floor is corridors, passages, and 10-ft nooks` },
  { id: 'long-passages', test: m => m.meanPassageFt > 60,
    say: m => `the passages between areas average ${m.meanPassageFt} ft` },
  { id: 'cramped', test: m => m.cramped.length >= 3,
    say: m => `${m.cramped.length} monsters/NPCs are in corridors or nooks (${m.cramped.map(n => `#${n}`).join(', ')})` },
  { id: 'jammed', test: m => m.jammed.length >= 2,
    say: m => `${m.jammed.length} stray monster groups (no faction, no role) are next door to other monsters (${m.jammed.map(([a, b]) => `#${a}–#${b}`).join(', ')})` },
];

export function playability(mod, fp = buildFloorPlan(mod)) {
  const byNum = new Map(mod.rooms.map(r => [r._roomNumber, r]));
  const area = s => s.rect.w * s.rect.h;
  const chambers = fp.rooms.filter(s => s.kind !== 'corridor' && area(s) >= CHAMBER_SQUARES);
  const tight = fp.rooms.filter(s => !chambers.includes(s));
  const passageSquares = fp.passages.reduce((s, p) => s + pathLength(p.points), 0);
  const thin = passageSquares + tight.reduce((s, x) => s + area(x), 0);
  const chamberArea = chambers.reduce((s, x) => s + area(x), 0);

  const roomAt = new Map([...mod.map.nodes.values()].map(n => [n.id, byNum.get(n.roomNumber)]));
  const jammed = [];
  for (const e of mod.map.edges) {
    const a = roomAt.get(e.fromId), b = roomAt.get(e.toId);
    if (a?.contentType !== 'monster' || b?.contentType !== 'monster') continue;
    // Two factions sharing a wall is a border, and a monster a pattern placed
    // (boss, entrance guard, cycle danger, gestalt role) is where it means to
    // be; only a stray group with neither is out of place.
    if (!stray(a) && !stray(b)) continue;
    jammed.push([a._roomNumber, b._roomNumber].sort((x, y) => x - y));
  }

  // Independent loops: passages (and stairs/shafts) beyond a tree. Each is
  // a choice of route — around, back, or past something.
  const links = new Set(mod.map.edges.map(e => [e.fromId, e.toId].sort((x, y) => x - y).join('-')));

  const m = {
    areas: fp.rooms.length,
    loops: links.size - mod.map.nodes.size + 1,
    chambers: chambers.length,
    corridors: fp.rooms.filter(s => s.kind === 'corridor').length,
    nooks: tight.filter(s => s.kind !== 'corridor').length,
    thinShare: thin / Math.max(1, thin + chamberArea),
    meanPassageFt: Math.round(passageSquares / Math.max(1, fp.passages.length)) * fp.ftPerSquare,
    monsters: mod.rooms.filter(r => r.contentType === 'monster').length,
    cramped: tight.map(s => s.number).filter(n => occupied(byNum.get(n))).sort((a, b) => a - b),
    jammed,
  };
  const failed = CHECKS.filter(c => c.test(m));
  m.warnings = failed.map(c => ({ id: c.id, text: c.say(m) }));
  m.verdict = failed.length === 0 ? 'good' : failed.length === 1 ? 'fair' : 'poor';
  // How much of the map's footprint is rooms: a sprawling map is mostly empty rock.
  m.fill = fp.rooms.reduce((s, r) => s + area(r), 0) / Math.max(1, fp.bounds.w * fp.bounds.h);
  // Lower is better: warnings first, then thin floor, few loops, and sprawl.
  m.score = failed.length + m.thinShare - 0.15 * Math.min(m.loops, 6) - m.fill;
  return m;
}

export function playabilityLine(m) {
  return `${m.areas} areas: ${m.chambers} chambers, ${m.nooks} nooks, ${m.corridors} corridors · ` +
         `${m.loops} loop${m.loops === 1 ? '' : 's'} · ${Math.round(m.thinShare * 100)}% thin floor · passages avg ${m.meanPassageFt} ft · ${m.monsters} monster areas`;
}
