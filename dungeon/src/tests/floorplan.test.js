import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SPATIAL_GESTALTS } from '../dungeons/gestalts.js';
import { generateModule } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { buildFloorPlan, doorKind, FT_PER_SQUARE, MAX_SIDE } from '../maps/floorplan.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

const SIDE_OF = { North: 'N', South: 'S', East: 'E', West: 'W', Northeast: 'NE', Northwest: 'NW', Southeast: 'SE', Southwest: 'SW' };
const EPS = 1e-6;

// Does segment p→q pass through the open interior of rect r?
function crossesInterior([px, py], [qx, qy], r) {
  const x0 = r.x + EPS, x1 = r.x + r.w - EPS, y0 = r.y + EPS, y1 = r.y + r.h - EPS;
  let t0 = 0, t1 = 1;
  const dx = qx - px, dy = qy - py;
  for (const [p, q] of [[-dx, px - x0], [dx, x1 - px], [-dy, py - y0], [dy, y1 - py]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > EPS;
}

function onWall([x, y], r, side) {
  const within = (v, a, b) => v >= a - EPS && v <= b + EPS;
  switch (side) {
    case 'N': return Math.abs(y - r.y) < EPS && within(x, r.x, r.x + r.w);
    case 'S': return Math.abs(y - (r.y + r.h)) < EPS && within(x, r.x, r.x + r.w);
    case 'W': return Math.abs(x - r.x) < EPS && within(y, r.y, r.y + r.h);
    case 'E': return Math.abs(x - (r.x + r.w)) < EPS && within(y, r.y, r.y + r.h);
  }
}

const modules = [];
function sample() {
  if (modules.length) return modules;
  for (const g of SPATIAL_GESTALTS) {
    for (let i = 0; i < 8; i++) {
      modules.push(generateModule(1 + (i % 5), { ...(i % 2 ? DOLMENWOOD_CONFIG : {}), gestalts: [g.id] }));
    }
  }
  return modules;
}

describe('floor plan', () => {
  it('draws every room at its true size (clamped to fit its block)', () => {
    for (const mod of sample()) {
      const fp = buildFloorPlan(mod);
      for (const r of mod.rooms) {
        const shape = fp.rooms.find(x => x.number === r._roomNumber);
        const sq = v => Math.max(1, Math.round((v ?? 20) / FT_PER_SQUARE));
        const want = [sq(r.roomSize?.width), sq(r.roomSize?.length)].map(v => Math.min(v, MAX_SIDE)).sort((a, b) => a - b);
        const got = [shape.rect.w, shape.rect.h].sort((a, b) => a - b);
        if (r.roomType === 'corridor') expect(got[0]).toBe(Math.min(sq(r.roomSize?.width), MAX_SIDE));
        else expect(got).toEqual(want);
      }
    }
  });

  it('never lets rooms touch', () => {
    for (const mod of sample()) {
      const rs = buildFloorPlan(mod).rooms.map(r => r.rect);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        const gap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
        expect(gap).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('draws one passage per connection, leaving through the wall each exit names', () => {
    for (const mod of sample()) {
      const fp = buildFloorPlan(mod);
      const flat = mod.map.edges.filter(e => !e.exitType?.startsWith('vertical:'));
      expect(fp.passages).toHaveLength(flat.length);
      for (const p of fp.passages) {
        const d = SIDE_OF[p.dir];
        const [da, db] = p.doors;
        const ra = fp.rooms.find(r => r.number === p.from).rect, rb = fp.rooms.find(r => r.number === p.to).rect;
        if (d.length === 1) {
          expect(da.side).toBe(d);
        } else {
          expect(d.split('')).toContain(da.side);  // a diagonal leaves by the corner
        }
        expect(onWall(da.at, ra, da.side)).toBe(true);
        expect(onWall(db.at, rb, db.side)).toBe(true);
        expect(p.points[0]).toEqual(da.at);
        expect(p.points.at(-1)).toEqual(db.at);
      }
    }
  });

  it('every room exit has a matching passage end on that room', () => {
    for (const mod of sample()) {
      const fp = buildFloorPlan(mod);
      for (const r of mod.rooms) {
        const ends = fp.passages.flatMap(p => p.doors.filter(d => d.room === r._roomNumber));
        expect(ends.length).toBe(r.exits.length);
      }
    }
  });

  it('never puts two doors at the same point of a room', () => {
    for (const mod of sample()) {
      const fp = buildFloorPlan(mod);
      for (const r of fp.rooms) {
        const pts = fp.passages.flatMap(p => p.doors.filter(d => d.room === r.number).map(d => d.at.join()));
        if (fp.entrance?.room === r.number) pts.push(fp.entrance.at.join());
        expect(new Set(pts).size).toBe(pts.length);
      }
    }
  });

  it('routes passages without crossing any room', () => {
    for (const mod of sample()) {
      const fp = buildFloorPlan(mod);
      for (const p of fp.passages) {
        for (let i = 1; i < p.points.length; i++) {
          for (const room of fp.rooms) {
            expect(crossesInterior(p.points[i - 1], p.points[i], room.rect),
              `passage ${p.from}→${p.to} crosses room ${room.number}`).toBe(false);
          }
        }
      }
    }
  });

  it('marks both ends of every vertical link inside their rooms', () => {
    for (const mod of sample()) {
      const fp = buildFloorPlan(mod);
      const vertical = mod.map.edges.filter(e => e.exitType?.startsWith('vertical:'));
      expect(fp.verticals).toHaveLength(vertical.length * 2);
      for (const v of fp.verticals) {
        const r = fp.rooms.find(x => x.number === v.room).rect;
        expect(v.at[0]).toBeGreaterThan(r.x); expect(v.at[0]).toBeLessThan(r.x + r.w);
        expect(v.at[1]).toBeGreaterThan(r.y); expect(v.at[1]).toBeLessThan(r.y + r.h);
      }
    }
  });

  it('runs cavern outlines through their doors', () => {
    for (const mod of sample()) {
      const fp = buildFloorPlan(mod);
      for (const room of fp.rooms.filter(r => r.kind === 'cavern')) {
        const doors = fp.passages.flatMap(p => p.doors.filter(d => d.room === room.number).map(d => d.at));
        for (const d of doors) expect(room.outline.some(([x, y]) => x === d[0] && y === d[1])).toBe(true);
      }
    }
  });

  it('places the outside entrance on a free wall of the entrance room', () => {
    for (const mod of sample()) {
      const fp = buildFloorPlan(mod);
      const r = fp.rooms.find(x => x.isEntrance);
      expect(fp.entrance.room).toBe(r.number);
      expect(onWall(fp.entrance.at, r.rect, fp.entrance.side)).toBe(true);
      const doors = fp.passages.flatMap(p => p.doors.filter(d => d.room === r.number).map(d => d.at.join()));
      expect(doors).not.toContain(fp.entrance.at.join());
    }
  });

  it('turns layout voids into terrain', () => {
    const fp = buildFloorPlan(generateModule(2, { gestalts: ['hollow-center'] }));
    expect(fp.terrain.length).toBeGreaterThan(0);
    expect(['courtyard', 'magma', 'water', 'pit']).toContain(fp.terrain[0].kind);
  });

  it('works on a module restored from a checkpoint (JSON round trip)', () => {
    const mod = sample()[5];
    const saved = JSON.parse(JSON.stringify({ rooms: mod.rooms, map: { ...mod.map, nodes: [...mod.map.nodes.entries()], positions: [...mod.map.positions] } }));
    const restored = { rooms: saved.rooms, map: { ...saved.map, nodes: new Map(saved.map.nodes), positions: new Set(saved.map.positions) } };
    expect(JSON.stringify(buildFloorPlan(restored))).toBe(JSON.stringify(buildFloorPlan(mod)));
  });

  it('is deterministic for a module', () => {
    const mod = sample()[3];
    expect(JSON.stringify(buildFloorPlan(mod))).toBe(JSON.stringify(buildFloorPlan(mod)));
  });

  it('classifies passage ends by exit type', () => {
    expect(doorKind('wooden door')).toBe('door');
    expect(doorKind('secret door')).toBe('secret');
    expect(doorKind('open archway')).toBe('open');
    expect(doorKind('portcullis')).toBe('portcullis');
    expect(doorKind('sealed vault door')).toBe('sealed');
    expect(doorKind('one-way: a drop too high to climb back up (cannot be passed from this side)')).toBe('oneway');
    expect(doorKind('locked door')).toBe('locked');
  });
});
