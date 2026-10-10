import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LAYOUTS, buildLayout, ringCells } from '../dungeons/layouts.js';
import { generateModule, DIR_OFFSETS, OPPOSITE_DIR } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { formatBrief } from '../../../cli/format-brief.js';
import { renderSvgMap } from '../../../cli/render-map.js';

const SIZES = [8, 12, 20];
const ids = Object.keys(LAYOUTS);
const repeat = (n, fn) => { for (let i = 0; i < n; i++) fn(i); };
const zoneOf = (p, k) => p.cells.get(k).zone;
// Plan connectivity with some edges ignored.
function reach(p, from, skip = () => false) {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const e of p.edges) {
      if (skip(e)) continue;
      const n = e.a === c ? e.b : e.b === c ? e.a : null;
      if (n && !seen.has(n)) { seen.add(n); q.push(n); }
    }
    for (const v of p.verticals) {
      const n = v.a === c ? v.b : v.b === c ? v.a : null;
      if (n && !seen.has(n) && !skip(v)) { seen.add(n); q.push(n); }
    }
  }
  return seen;
}

describe('every layout plan', () => {
  for (const id of ids) {
    it(`${id}: exact size, connected, adjacent passages, valid notes`, () => {
      for (const n of [...SIZES, 9, 15, 25]) repeat(15, () => {
        const p = buildLayout(id, n);
        expect(p.cells.size).toBe(n);
        expect(p.entrance && p.final && p.entrance !== p.final).toBe(true);
        expect(reach(p, p.entrance).size).toBe(n);
        for (const e of p.edges) {
          const a = p.cells.get(e.a), b = p.cells.get(e.b);
          expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
        }
        for (const k of p.cells.keys()) expect(p.blocked.has(k)).toBe(false);
        for (const note of p.notes) {
          expect(p.cells.has(note.key)).toBe(true);
          for (const m of note.text.matchAll(/@\{([^}]+)\}/g)) expect(p.cells.has(m[1])).toBe(true);
        }
      });
    });
  }
});

describe('layout patterns', () => {
  it('ringCells walks a closed orthogonal loop', () => {
    const r = ringCells(-2, -2, 2, 2);
    expect(r).toHaveLength(16);
    for (let i = 0; i < r.length; i++) {
      const [ax, ay] = r[i].split(',').map(Number), [bx, by] = r[(i + 1) % r.length].split(',').map(Number);
      expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1);
    }
  });

  it('hub-and-spokes: wings connect only through the hub (at most one shortcut)', () => repeat(20, i => {
    const p = buildLayout('hub-and-spokes', SIZES[i % 3]);
    const cross = p.edges.filter(e => zoneOf(p, e.a) !== zoneOf(p, e.b) &&
      ![e.a, e.b].some(k => zoneOf(p, k) === 'the hub'));
    expect(cross.length).toBeLessThanOrEqual(1);
  }));

  it('vertical-spine: levels are joined only by vertical links', () => repeat(20, i => {
    const p = buildLayout('vertical-spine', SIZES[i % 3]);
    for (const e of p.edges) expect(zoneOf(p, e.a)).toBe(zoneOf(p, e.b));
    expect(p.verticals.length).toBeGreaterThan(0);
  }));

  it('concentric-layers: few ways between rings, one into the sanctum', () => repeat(20, i => {
    const p = buildLayout('concentric-layers', SIZES[i % 3]);
    const between = (z1, z2) => p.edges.filter(e => new Set([zoneOf(p, e.a), zoneOf(p, e.b)]).size === 2 &&
      [z1, z2].includes(zoneOf(p, e.a)) && [z1, z2].includes(zoneOf(p, e.b)));
    expect(between('the outer ring', 'the middle ring').length).toBeLessThanOrEqual(2);
    expect(between('the middle ring', 'the inner sanctum')).toHaveLength(1);
    expect(zoneOf(p, p.final)).toBe('the inner sanctum');
  }));

  it('great-divide and separated-clusters: regions meet only at crossing rooms', () => {
    for (const id of ['great-divide', 'separated-clusters']) repeat(20, i => {
      const p = buildLayout(id, SIZES[i % 3]);
      const crossing = k => p.cells.get(k).role === 'crossing';
      for (const e of p.edges) {
        if (zoneOf(p, e.a) !== zoneOf(p, e.b)) expect(crossing(e.a) || crossing(e.b)).toBe(true);
      }
      // Removing the crossings splits the dungeon.
      expect(reach(p, p.entrance, e => crossing(e.a) || crossing(e.b)).size).toBeLessThan(p.cells.size);
    });
  });

  it('hollow-center: a closed ring around an empty void', () => repeat(20, i => {
    const p = buildLayout('hollow-center', SIZES[i % 3]);
    const ring = p.inZone('the ring');
    for (const k of ring) expect(p.neighbors(k).filter(n => ring.includes(n)).length).toBe(2);
    expect(p.blocked.size).toBeGreaterThan(0);
  }));

  it('ratchet-and-return: a one-way cycle that returns to the entrance', () => repeat(20, i => {
    const p = buildLayout('ratchet-and-return', SIZES[i % 3]);
    const oneWay = p.edges.filter(e => e.oneWay);
    expect(oneWay).toHaveLength(4);
    // Walk respecting one-way direction: everything is reachable and the entrance can be regained.
    const step = c => p.edges.flatMap(e => e.a === c ? [e.b] : e.b === c && !e.oneWay ? [e.a] : []);
    const seen = new Set([p.entrance]); const q = [p.entrance];
    while (q.length) for (const n of step(q.shift())) if (!seen.has(n)) { seen.add(n); q.push(n); }
    expect(seen.size).toBe(p.cells.size);
    // Without the one-way passages, no section can be left.
    expect(reach(p, p.entrance, e => e.oneWay).size).toBeLessThan(p.cells.size);
  }));

  it('locked-center: the vault is reachable early but only through its sealed door or a secret way', () => repeat(20, i => {
    const p = buildLayout('locked-center', SIZES[i % 3]);
    expect(p.dist(p.entrance).get(p.final)).toBe(2);
    const intoVault = p.edges.filter(e => e.a === p.final || e.b === p.final);
    for (const e of intoVault) expect(['sealed vault door', 'secret door']).toContain(e.type);
    expect([...p.cells.values()].filter(c => c.role === 'key').length).toBeGreaterThanOrEqual(2);
  }));

  it('landmark-and-loop: the landmark sits beside the entrance but is reached the long way', () => repeat(20, i => {
    const p = buildLayout('landmark-and-loop', SIZES[i % 3]);
    const [ex, ey] = p.entrance.split(',').map(Number), [fx, fy] = p.final.split(',').map(Number);
    expect(Math.abs(ex - fx) + Math.abs(ey - fy)).toBe(1);
    expect(p.linked(p.entrance, p.final)).toBe(false);
    expect(p.dist(p.entrance).get(p.final)).toBeGreaterThanOrEqual(5);
  }));

  it('symmetry-and-repetition: the wings repeat one shape, plus one deviation', () => repeat(20, i => {
    const p = buildLayout('symmetry-and-repetition', SIZES[i % 3]);
    const wings = ['the north wing', 'the east wing', 'the west wing'];
    const twins = w => p.inZone(w).filter(k => p.cells.get(k).twin != null).map(k => p.cells.get(k).twin).sort();
    expect(twins(wings[1])).toEqual(twins(wings[0]));
    expect(twins(wings[2])).toEqual(twins(wings[0]));
    expect([...p.cells.values()].filter(c => c.role === 'deviation')).toHaveLength(1);
  }));

  it('parallel-paths: two routes to the goal, joined by connecting doors', () => repeat(20, i => {
    const p = buildLayout('parallel-paths', SIZES[i % 3]);
    const routes = ['the exposed route', 'the concealed route'];
    for (const r of routes) {
      const other = routes.find(x => x !== r);
      expect(reach(p, p.entrance, e => [e.a, e.b].some(k => zoneOf(p, k) === other)).has(p.final)).toBe(true);
    }
    expect(p.edges.some(e => new Set(routes).has(zoneOf(p, e.a)) && new Set(routes).has(zoneOf(p, e.b)) && zoneOf(p, e.a) !== zoneOf(p, e.b))).toBe(true);
  }));
});

describe('planned layouts in generated modules', () => {
  beforeAll(() => {
    const root = resolve(__dirname, '../../..');
    const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
      JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
    initMonsterDB(new MonsterDB(all));
  });

  for (const id of ids) {
    it(`${id}: consistent exits, contiguous rooms, zones in the brief, renders`, () => repeat(6, i => {
      const mod = generateModule(1 + (i % 5), { ...(i % 2 ? DOLMENWOOD_CONFIG : {}), gestalts: [id] });
      const { dungeon: d, rooms, map } = mod;
      expect(rooms.filter(r => r._planKey)).toHaveLength(d.rooms);
      expect(rooms.map(r => r._roomNumber).sort((a, b) => a - b)).toEqual(rooms.map((_, k) => k + 1));
      const at = new Map([...map.nodes.values()].map(n => [`${n.x},${n.y}`, n]));
      const edges = new Set(map.edges.map(e => [e.fromId, e.toId].sort().join('-')));
      for (const r of rooms) {
        const node = map.nodes.get(r._mapId);
        for (const ex of r.exits) {
          const [dx, dy] = DIR_OFFSETS[ex.direction];
          const nb = at.get(`${node.x + dx},${node.y + dy}`);
          expect(nb, `room ${r._roomNumber} ${ex.direction}`).toBeTruthy();
          expect(edges.has([node.id, nb.id].sort().join('-'))).toBe(true);
          expect(nb.room.exits.some(e => e.direction === OPPOSITE_DIR[ex.direction])).toBe(true);
        }
      }
      const g = d.gestalts.find(x => x.id === id);
      expect(g.zones.length).toBeGreaterThan(0);
      expect(g.rooms.length).toBeGreaterThan(0);
      const brief = formatBrief(mod);
      expect(brief).toMatch(/Zone — /);
      expect(brief).not.toMatch(/@\{/);
      expect(renderSvgMap(map, rooms)).toMatch(/^<svg/);
    }));
  }

  it('marks the far side of a one-way passage as impassable', () => {
    const { rooms } = generateModule(2, { gestalts: ['ratchet-and-return'], zoneCycles: false });  // zone cycles add their own one-way barriers
    const exits = rooms.flatMap(r => r.exits);
    expect(exits.filter(e => e.type.startsWith('one-way') && !e.type.includes('cannot be passed'))).toHaveLength(4);
    expect(exits.filter(e => e.type.includes('cannot be passed from this side'))).toHaveLength(4);
  });
});
