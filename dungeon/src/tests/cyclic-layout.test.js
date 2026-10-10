import { describe, it, expect } from 'vitest';
import { generateFlow } from '../dungeons/cycles.js';
import { embedFlow, buildCyclicLayout } from '../dungeons/cyclic-layout.js';

const seeded = seed => { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
const P = k => k.split(',').map(Number);
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

// Walk a plan as the party can: one-way edges only forward.
function walk(plan, from) {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const e of plan.edges) {
      const n = e.a === c ? e.b : e.b === c && !e.oneWay ? e.a : null;
      if (n && !seen.has(n)) { seen.add(n); q.push(n); }
    }
  }
  return seen;
}

describe('embedFlow', () => {
  it('places every room on its own cell, next to every room it connects to', () => {
    for (let s = 1; s <= 60; s++) {
      const flow = generateFlow({ rooms: [8, 12, 20][s % 3], rand: seeded(s) });
      const pos = embedFlow(flow, { rand: seeded(s + 500) });
      if (!pos) continue;  // rare; buildCyclicLayout retries with a new flow
      expect(pos.size).toBe(flow.nodes.length);
      expect(new Set([...pos.values()].map(p => p.join())).size).toBe(flow.nodes.length);
      for (const e of flow.edges) if (e.kind !== 'sightline') expect(cheb(pos.get(e.a), pos.get(e.b))).toBe(1);
    }
  });

  it('never crosses two diagonal passages in one 2×2 block', () => {
    for (let s = 1; s <= 60; s++) {
      const flow = generateFlow({ rooms: 15, rand: seeded(s) });
      const pos = embedFlow(flow, { rand: seeded(s + 900) });
      if (!pos) continue;
      const at = new Map([...pos].map(([id, p]) => [p.join(), id]));
      const linked = new Set(flow.edges.filter(e => e.kind !== 'sightline').map(e => [e.a, e.b].sort((a, b) => a - b).join('-')));
      for (const e of flow.edges) {
        if (e.kind === 'sightline') continue;
        const a = pos.get(e.a), b = pos.get(e.b);
        if (a[0] === b[0] || a[1] === b[1]) continue;
        const p = at.get(`${a[0]},${b[1]}`), q = at.get(`${b[0]},${a[1]}`);
        if (p != null && q != null) expect(linked.has([p, q].sort((x, y) => x - y).join('-'))).toBe(false);
      }
    }
  });

  it('respects a region and fixed cells (for filling a gestalt zone)', () => {
    let placed = 0;
    for (let s = 1; s <= 30; s++) {
      const flow = generateFlow({ rooms: 8, rand: seeded(s) });
      const inBox = (x, y) => x >= 0 && x < 4 && y >= 0 && y < 4;
      const pos = embedFlow(flow, { rand: seeded(s), allowed: inBox, fixed: { [flow.entrance]: [0, 0] } });
      if (!pos) continue;
      placed++;
      expect(pos.get(flow.entrance)).toEqual([0, 0]);
      for (const p of pos.values()) expect(inBox(...p)).toBe(true);
    }
    expect(placed).toBeGreaterThan(20);
  });
});

describe('buildCyclicLayout', () => {
  it('makes a plan of exactly the requested size, faithful to the flow', () => {
    for (let s = 1; s <= 60; s++) {
      const n = [8, 12, 20, 9, 15][s % 5];
      const plan = buildCyclicLayout(n, seeded(s));
      expect(plan.cells.size).toBe(n);
      expect(plan.entrance && plan.final && plan.entrance !== plan.final).toBe(true);
      for (const e of plan.edges) expect(cheb(P(e.a), P(e.b))).toBe(1);
      // Secret and one-way passages carry their kind into the plan.
      expect(plan.edges.filter(e => e.type === 'secret door')).toHaveLength(plan.flow.edges.filter(e => e.kind === 'secret').length);
      expect(plan.edges.filter(e => e.oneWay)).toHaveLength(plan.flow.edges.filter(e => e.kind === 'oneway').length);
      for (const e of plan.edges.filter(x => x.oneWay)) expect(e.type).toMatch(/^one-way: /);
    }
  });

  it('keeps every room reachable, with a way back to the entrance from each', () => {
    for (let s = 1; s <= 60; s++) {
      const plan = buildCyclicLayout([8, 12, 20][s % 3], seeded(s));
      expect(walk(plan, plan.entrance).size).toBe(plan.cells.size);
      for (const k of plan.cells.keys()) expect(walk(plan, k).has(plan.entrance), `stranded at ${k}`).toBe(true);
    }
  });

  it('carries roles, locks, keys, zones, and sight-line notes into the plan', () => {
    for (let s = 1; s <= 40; s++) {
      const plan = buildCyclicLayout(15, seeded(s));
      const cells = [...plan.cells.values()];
      for (const lock of plan.flow.locks) {
        expect(cells.find(c => c.flowRef?.node === lock.node).lock).toBe(lock.id);
        for (const k of lock.keys) expect(cells.find(c => c.flowRef?.node === k).key).toBe(lock.id);
      }
      for (const c of cells) expect(plan.zones[c.zone]).toBeTruthy();
      const sights = plan.flow.edges.filter(e => e.kind === 'sightline').length;
      expect(plan.notes.filter(n => n.role === 'sight line')).toHaveLength(sights);
    }
  });

  it('is deterministic for a seed', () => {
    const a = buildCyclicLayout(15, seeded(5)), b = buildCyclicLayout(15, seeded(5));
    expect(JSON.stringify([...a.cells])).toBe(JSON.stringify([...b.cells]));
    expect(JSON.stringify(a.edges)).toBe(JSON.stringify(b.edges));
  });
});
