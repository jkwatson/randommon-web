// How playable a module's map is at the table, measured on the drawn floor
// plan rather than the room list: a "room" 10 ft square reads as a bend in a
// corridor, and the passages between rooms are floor the party walks too.
//
// A dungeon plays well when most areas are real chambers (somewhere a scene
// can happen), the walk between them is short, and monsters sit where a
// monster would live — not in 10-ft passages, and not packed door to door
// with unrelated monsters.

import { buildFloorPlan } from './floorplan.js';

const CHAMBER_SQUARES = 4;  // 20 × 20 ft or more

const pathLength = pts => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const occupied = r => r?.contentType === 'monster' || r?.contentType === 'npc';

// Warnings, each a test and its explanation. Thresholds were set on a few
// hundred generated modules: a typical dungeon trips none or one.
const CHECKS = [
  { id: 'few-chambers', test: m => m.chambers / m.areas < 0.5,
    say: m => `only ${m.chambers} of ${m.areas} areas are real chambers (20 × 20 ft or more)` },
  { id: 'thin', test: m => m.thinShare > 0.55,
    say: m => `${Math.round(m.thinShare * 100)}% of the floor is corridors, passages, and 10-ft nooks` },
  { id: 'long-passages', test: m => m.meanPassageFt > 60,
    say: m => `the passages between areas average ${m.meanPassageFt} ft` },
  { id: 'cramped', test: m => m.cramped.length >= 3,
    say: m => `${m.cramped.length} monsters/NPCs are in corridors or nooks (${m.cramped.map(n => `#${n}`).join(', ')})` },
  { id: 'jammed', test: m => m.jammed.length >= 2,
    say: m => `${m.jammed.length} pairs of unrelated monster groups are next door to each other (${m.jammed.map(([a, b]) => `#${a}–#${b}`).join(', ')})` },
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
    if (a.faction && a.faction.name === b.faction?.name) continue;
    jammed.push([a._roomNumber, b._roomNumber].sort((x, y) => x - y));
  }

  const m = {
    areas: fp.rooms.length,
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
  // Lower is better: warnings first, then how thin the floor is.
  m.score = failed.length + m.thinShare;
  return m;
}

export function playabilityLine(m) {
  return `${m.areas} areas: ${m.chambers} chambers, ${m.nooks} nooks, ${m.corridors} corridors · ` +
         `${Math.round(m.thinShare * 100)}% thin floor · passages avg ${m.meanPassageFt} ft · ${m.monsters} monster areas`;
}
