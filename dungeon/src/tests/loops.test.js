import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LAYOUTS, buildLayout, addLoops, planLoops } from '../dungeons/layouts.js';
import { generateModule } from '../dungeons/generator.js';
import { playability } from '../maps/playability.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';

const P = k => k.split(',').map(Number);
const zoneOf = (p, k) => p.cells.get(k).zone;
const reach = (p, from) => {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) for (const n of p.neighbors(q.shift())) if (!seen.has(n)) { seen.add(n); q.push(n); }
  return seen;
};
const snapshot = p => new Set(p.edges.map(e => `${e.a}|${e.b}`));

describe('closing loops in layout plans', () => {
  for (const id of Object.keys(LAYOUTS)) {
    it(`${id}: keeps size, adjacency, reachability, and every zone boundary`, () => {
      for (let i = 0; i < 15; i++) {
        const p = buildLayout(id, [8, 12, 16, 20, 25][i % 5]);
        const size = p.cells.size;
        const before = snapshot(p);
        const crossBefore = p.edges.filter(e => zoneOf(p, e.a) !== zoneOf(p, e.b)).length;
        addLoops(p);
        expect(p.cells.size).toBe(size);
        expect(reach(p, p.entrance).size).toBe(size);
        for (const e of p.edges) {
          const [ax, ay] = P(e.a), [bx, by] = P(e.b);
          expect(Math.max(Math.abs(ax - bx), Math.abs(ay - by))).toBe(1);
        }
        for (const k of p.cells.keys()) expect(p.blocked.has(k)).toBe(false);
        // New passages stay inside one zone (no crossZone given).
        for (const e of p.edges.filter(x => !before.has(`${x.a}|${x.b}`))) expect(zoneOf(p, e.a)).toBe(zoneOf(p, e.b));
        expect(p.edges.filter(e => zoneOf(p, e.a) !== zoneOf(p, e.b)).length).toBeLessThanOrEqual(crossBefore);
        // Two diagonal passages never cross at a corner.
        const linked = (a, b) => p.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
        for (const e of p.edges) {
          const [ax, ay] = P(e.a), [bx, by] = P(e.b);
          if (ax !== bx && ay !== by) expect(linked(`${ax},${by}`, `${bx},${ay}`)).toBe(false);
        }
      }
    });
  }

  it('gives tree-shaped layouts loops', () => {
    for (const id of ['hub-and-spokes', 'artery-and-branches', 'locked-center']) {
      let looped = 0;
      for (let i = 0; i < 12; i++) {
        const p = buildLayout(id, 16);
        const opts = { crossZone: (a, b) => !['the hub', 'the artery'].includes(a) && !['the hub', 'the artery'].includes(b) };
        addLoops(p, opts);
        if (planLoops(p) < 1) addLoops(p, { ...opts, target: 1, fixedSize: false });  // as generateModule does
        if (planLoops(p) >= 1) looped++;
      }
      expect(looped, id).toBeGreaterThanOrEqual(8);
    }
  });

  it('never shortens the landmark\'s long way around', () => {
    for (let i = 0; i < 12; i++) {
      const p = buildLayout('landmark-and-loop', 16);
      const before = p.dist(p.entrance).get(p.final);
      addLoops(p, { keepZones: ['the long way around', 'the landmark'], keepRoute: true });
      addLoops(p, { keepZones: ['the long way around', 'the landmark'], keepRoute: true, target: 1, fixedSize: false });
      expect(p.dist(p.entrance).get(p.final)).toBe(before);
    }
  });

  it('repeats a loop in every symmetric wing alike', () => {
    const p = buildLayout('symmetry-and-repetition', 20);
    const wingLoops = ['the north wing', 'the east wing', 'the west wing'].map(z => {
      const cells = p.inZone(z);
      return p.edges.filter(e => cells.includes(e.a) && cells.includes(e.b)).length - cells.length + 1;
    });
    expect(new Set(wingLoops).size).toBe(1);
    expect(wingLoops[0]).toBeGreaterThanOrEqual(1);
  });
});

describe('modules have route choices', () => {
  beforeAll(() => {
    const root = resolve(__dirname, '../../..');
    const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
      JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
    initMonsterDB(new MonsterDB(all));
  });

  it('most generated dungeons have at least one loop', () => {
    let looped = 0;
    for (let i = 0; i < 24; i++) {
      const mod = generateModule(1 + (i % 5));
      if (playability(mod).loops >= 1) looped++;
    }
    expect(looped).toBeGreaterThanOrEqual(18);
  });

  it('can be turned off', () => {
    const mod = generateModule(3, { gestalts: ['concentric-layers'], loops: false, zoneCycles: false });
    expect(playability(mod).loops).toBeLessThanOrEqual(0);
  });
});
