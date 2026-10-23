import { describe, it, expect } from 'vitest';
import { CYCLES, LOCK_TYPES, generateFlow, reachable, narrateFlow } from '../dungeons/cycles.js';

const seeded = seed => { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
const SIZES = [8, 12, 20, 9, 15];

// Which rooms can be reached from `from` without passing a lock's goal
// room — i.e. is each key obtainable before its lock is opened?
function reachableAvoiding(flow, from, avoid) {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const n = q.shift();
    for (const e of flow.edges) {
      if (e.kind === 'sightline') continue;
      const next = e.a === n ? e.b : e.kind !== 'oneway' && e.b === n ? e.a : null;
      if (next == null || seen.has(next) || next === avoid) continue;
      seen.add(next); q.push(next);
    }
  }
  return seen;
}

describe('cycle catalogue', () => {
  it('has the twelve cycles, d12 order, and the d6 lock table', () => {
    expect(CYCLES.map(c => c.d12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(LOCK_TYPES.filter(l => l.hard)).toHaveLength(3);
  });
});

describe('generateFlow', () => {
  it('produces exactly the requested number of rooms', () => {
    for (let s = 1; s <= 200; s++) {
      const n = SIZES[s % SIZES.length];
      expect(generateFlow({ rooms: n, rand: seeded(s) }).nodes).toHaveLength(n);
    }
  });

  it('lets the party reach every room, and get back to the entrance from anywhere', () => {
    for (let s = 1; s <= 200; s++) {
      const flow = generateFlow({ rooms: SIZES[s % SIZES.length], rand: seeded(s) });
      expect(reachable(flow).size, `seed ${s}`).toBe(flow.nodes.length);
      for (const n of flow.nodes) expect(reachable(flow, n.id).has(flow.entrance), `stranded in room ${n.id}, seed ${s}`).toBe(true);
    }
  });

  it('puts every key somewhere reachable without opening its own lock', () => {
    for (let s = 1; s <= 200; s++) {
      const flow = generateFlow({ rooms: SIZES[s % SIZES.length], rand: seeded(s) });
      for (const lock of flow.locks) {
        expect(lock.keys.length).toBeGreaterThan(0);
        // The lock gates its goal room's prize, not passage through it, so a
        // key may lie beyond the lock room — but never behind it alone.
        const ok = reachableAvoiding(flow, flow.entrance, lock.node);
        for (const k of lock.keys) {
          expect(flow.nodes[k].roles).toContain('key');
          expect(flow.nodes[k].key).toBe(lock.id);
          // Either reachable around the lock room, or lies past it on the
          // cycle's own loop (lock-and-key: the key is beyond the locked goal).
          if (!ok.has(k)) expect(['lock-and-key', 'simple-lock-and-key']).toContain(flow.cycles[lock.cycle].type);
        }
      }
    }
  });

  it('builds every cycle type as the overall cycle', () => {
    for (const c of CYCLES) {
      for (let s = 1; s <= 10; s++) {
        const flow = generateFlow({ rooms: 12, rand: seeded(s * 31), overall: c.id });
        expect(flow.cycles[0].type).toBe(c.id);
        expect(flow.nodes[flow.goal].roles).toContain('goal');
      }
    }
  });

  it("marks each cycle's defining features", () => {
    const has = (flow, pred) => flow.edges.some(pred) || flow.nodes.some(pred);
    const make = id => generateFlow({ rooms: 12, rand: seeded(7), overall: id, maxDepth: 0 });
    expect(has(make('hidden-shortcut'), e => e.kind === 'secret')).toBe(true);
    expect(has(make('foreshadowing-loop'), e => e.kind === 'sightline')).toBe(true);
    expect(make('blocked-retreat').edges.some(e => e.kind === 'oneway' && e.barrier)).toBe(true);
    expect(make('lock-and-key').edges.some(e => e.kind === 'oneway')).toBe(true);
    expect(make('two-keys').locks[0].keys).toHaveLength(2);
    expect(make('false-goal').nodes.some(n => n.roles.includes('false-goal'))).toBe(true);
    expect(make('monster-patrol').nodes.some(n => n.roles.includes('valuable'))).toBe(true);
    expect(make('altered-return').nodes[0].roles).toContain('altered');
    expect(make('gambit').nodes.some(n => n.roles.includes('reward'))).toBe(true);
    expect(make('dangerous-route').nodes.some(n => n.roles.includes('danger'))).toBe(true);
    expect(make('two-alternative-paths').nodes.filter(n => n.theme).length).toBeGreaterThan(3);
  });

  it('nests sub-cycles at insertion points in larger dungeons', () => {
    let nested = 0;
    for (let s = 1; s <= 50; s++) {
      const flow = generateFlow({ rooms: 20, rand: seeded(s) });
      if (flow.cycles.some(c => c.depth >= 1)) nested++;
      for (const c of flow.cycles.slice(1)) expect(flow.cycles[c.parent]).toBeTruthy();
    }
    expect(nested).toBeGreaterThan(40);
  });

  it('is deterministic for a seed and narrates its cycles', () => {
    const a = generateFlow({ rooms: 15, rand: seeded(99) }), b = generateFlow({ rooms: 15, rand: seeded(99) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const story = narrateFlow(a);
    expect(story.split('\n')).toHaveLength(a.cycles.length);
    expect(story).not.toMatch(/undefined|null|NaN/);
  });
});
