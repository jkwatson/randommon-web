import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LAYOUTS, buildLayout } from '../dungeons/layouts.js';
import { fillZonesWithCycles } from '../dungeons/cyclic-layout.js';
import { generateModule } from '../dungeons/generator.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { formatBrief } from '../../../cli/format-brief.js';

const P = k => k.split(',').map(Number);
const zoneOf = (p, k) => p.cells.get(k).zone;
const walk = (p, from, { skip = () => false } = {}) => {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const e of p.edges) {
      if (skip(e)) continue;
      const n = e.a === c ? e.b : e.b === c && !e.oneWay ? e.a : null;
      if (n && !seen.has(n)) { seen.add(n); q.push(n); }
    }
    for (const v of p.verticals) {
      const n = v.a === c ? v.b : v.b === c ? v.a : null;
      if (n && !seen.has(n)) { seen.add(n); q.push(n); }
    }
  }
  return seen;
};
const filledPlans = (id, count = 20) => {
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = buildLayout(id, i % 2 ? 20 : 12);
    fillZonesWithCycles(p, id);
    out.push(p);
  }
  return out;
};

describe('cycles inside gestalt zones', () => {
  for (const id of Object.keys(LAYOUTS)) {
    it(`${id}: stays valid — size, adjacency, reachability, a way back, notes`, () => {
      for (const p of filledPlans(id)) {
        const n = [...p.cells.keys()].length;
        expect(n).toBe(p.cells.size);
        expect(walk(p, p.entrance).size).toBe(n);
        for (const k of p.cells.keys()) expect(walk(p, k).has(p.entrance), `${id}: stranded at ${k}`).toBe(true);
        for (const e of p.edges) expect(Math.max(Math.abs(P(e.a)[0] - P(e.b)[0]), Math.abs(P(e.a)[1] - P(e.b)[1]))).toBe(1);
        for (const k of p.cells.keys()) expect(p.blocked.has(k)).toBe(false);
        for (const note of p.notes) {
          expect(p.cells.has(note.key)).toBe(true);
          for (const m of note.text.matchAll(/@\{([^}]+)\}/g)) expect(p.cells.has(m[1])).toBe(true);
        }
      }
    });
  }

  it('keeps each layout\'s defining shape', () => {
    // Wings still meet only at the hub.
    for (const p of filledPlans('hub-and-spokes')) {
      const cross = p.edges.filter(e => zoneOf(p, e.a) !== zoneOf(p, e.b) && ![e.a, e.b].some(k => zoneOf(p, k) === 'the hub'));
      expect(cross.length).toBeLessThanOrEqual(1);
    }
    // The divide's sides and the clusters still meet only at crossing rooms.
    for (const id of ['great-divide', 'separated-clusters']) {
      for (const p of filledPlans(id)) {
        const crossing = k => p.cells.get(k).role === 'crossing';
        for (const e of p.edges) if (zoneOf(p, e.a) !== zoneOf(p, e.b)) expect(crossing(e.a) || crossing(e.b)).toBe(true);
      }
    }
    // Spine levels still join only by the shaft.
    for (const p of filledPlans('vertical-spine')) {
      for (const e of p.edges) expect(zoneOf(p, e.a)).toBe(zoneOf(p, e.b));
    }
    // The ratchet's sections are still left only by their one-way passages.
    for (const p of filledPlans('ratchet-and-return')) {
      const ratchets = p.edges.filter(e => e.oneWay && zoneOf(p, e.a) !== zoneOf(p, e.b));
      expect(ratchets).toHaveLength(4);
      expect(walk(p, p.entrance, { skip: e => ratchets.includes(e) }).size).toBeLessThan(p.cells.size);
    }
  });

  it('fills zones often in the layouts that suit it, never in those that are their zones', () => {
    const rate = id => filledPlans(id, 30).filter(p => (p.flows ?? []).length > 0).length / 30;
    expect(rate('vertical-spine')).toBeGreaterThan(0.8);
    expect(rate('separated-clusters')).toBeGreaterThan(0.7);
    expect(rate('great-divide')).toBeGreaterThan(0.6);
    for (const id of ['symmetry-and-repetition', 'concentric-layers', 'hollow-center', 'landmark-and-loop', 'parallel-paths']) {
      expect(rate(id)).toBe(0);
    }
  });
});

describe('modules with cycle-filled zones', () => {
  beforeAll(() => {
    const root = resolve(__dirname, '../../..');
    const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
      JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
    initMonsterDB(new MonsterDB(all));
  });

  it('carry each zone\'s flow into rooms and the brief, and can be turned off', () => {
    let withFlows = 0;
    for (let i = 0; i < 12; i++) {
      const mod = generateModule(2, { gestalts: ['vertical-spine'] });
      const flows = mod.dungeon.cycleFlows ?? [];
      if (!flows.length) continue;
      withFlows++;
      for (const [i2, { zone }] of flows.entries()) {
        expect(mod.rooms.filter(r => r._flowRef?.flow === i2).every(r => r._zone === zone)).toBe(true);
      }
      expect(formatBrief(mod)).toMatch(/## HOW THE DUNGEON FLOWS[\s\S]*In level \d/);
    }
    expect(withFlows).toBeGreaterThan(6);
    const off = generateModule(2, { gestalts: ['vertical-spine'], zoneCycles: false });
    expect(off.dungeon.cycleFlows).toBeUndefined();
  });
});
