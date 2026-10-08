import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TRANSFORMATIONAL_GESTALTS } from '../dungeons/gestalts.js';
import { generateModule, generateDungeon } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { buildGraph } from '../dungeons/gestalt-roles.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { formatBrief } from '../../../cli/format-brief.js';
import { changesBlock } from '../../../cli/polish.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

const gen = (ids, i = 0) => generateModule(1 + (i % 5), {
  ...(i % 2 ? DOLMENWOOD_CONFIG : {}),
  gestalts: ['hub-and-spokes', ...ids],
});
// Role names can repeat across patterns (e.g. "consumer"), so match both.
const withRole = (rooms, role, pattern = null) =>
  rooms.filter(r => r._gestalt?.some(x => x.role === role && (!pattern || x.pattern === pattern)));
const noteFor = (r, role, pattern = null) =>
  r._gestalt.find(x => x.role === role && (!pattern || x.pattern === pattern)).note;

describe('transformational systems', () => {
  for (const g of TRANSFORMATIONAL_GESTALTS) {
    it(`${g.id}: has a summary in crawl mode`, () => {
      const d = generateDungeon(2, { gestalts: ['hub-and-spokes', g.id] });
      expect(d.gestalts.find(x => x.id === g.id).system.summary.length).toBeGreaterThan(0);
    });

    it(`${g.id}: is placed on real rooms in modules`, () => {
      for (let i = 0; i < 10; i++) {
        const mod = gen([g.id], i);
        const { dungeon: d, rooms } = mod;
        const gg = d.gestalts.find(x => x.id === g.id);
        expect(gg.rooms?.length, `run ${i}`).toBeGreaterThan(0);
        const nums = new Set(rooms.map(r => r._roomNumber));
        const texts = [...gg.system.summary, ...rooms.flatMap(r => (r._gestalt ?? []).map(x => x.note))];
        for (const t of texts) {
          expect(t).not.toMatch(/undefined|null|NaN|Infinity/);
          for (const m of t.matchAll(/Rooms? ([\d, ]+)/g)) {
            for (const n of m[1].split(/,\s*/).filter(Boolean)) expect(nums.has(+n)).toBe(true);
          }
        }
        expect(rooms.find(r => r._isEntrance)._gestalt?.some(x => x.pattern === gg.name) ?? false).toBe(false);
        expect(formatBrief(mod)).toContain('## HOW THE DUNGEON CHANGES');
      }
    });
  }

  it('countdown: escalating stages before zero', () => {
    const { dungeon: d } = gen(['countdown']);
    const sys = d.gestalts.find(x => x.id === 'countdown').system;
    expect(sys.stages[0]).toBeLessThan(sys.stages[1]);
    expect(sys.stages[1]).toBeLessThan(sys.stages[2]);
    expect(sys.stages[2]).toBeLessThan(sys.turns);
  });

  it('countdown + containment: the prisoner breaks out, and a ward room is the intervention point', () => {
    for (let i = 0; i < 8; i++) {
      const { dungeon: d, rooms } = gen(['countdown', 'containment'], i);
      const cd = d.gestalts.find(x => x.id === 'countdown');
      const ct = d.gestalts.find(x => x.id === 'containment');
      expect(cd.system.id).toBe('breakout');
      expect(withRole(rooms, 'epicenter')[0]._roomNumber).toBe(ct.cast.prison);
      expect(ct.cast.wards).toContain(withRole(rooms, 'intervention')[0]._roomNumber);
    }
  });

  it('advancing-front: bands follow graph distance from the origin', () => {
    for (let i = 0; i < 10; i++) {
      const { rooms, map } = gen(['advancing-front'], i);
      const G = buildGraph(rooms, map);
      const origin = withRole(rooms, 'origin')[0];
      const dist = G.bfs(origin._roomNumber);
      const consumed = withRole(rooms, 'consumed').map(r => dist.get(r._roomNumber));
      const front = withRole(rooms, 'front').map(r => dist.get(r._roomNumber));
      if (consumed.length && front.length) expect(Math.max(...consumed)).toBeLessThan(Math.min(...front));
      for (const k of front) expect(k).toBeLessThanOrEqual(2);
    }
  });

  it('traveling-state: the route moves between connected rooms', () => {
    for (let i = 0; i < 10; i++) {
      const { dungeon: d, rooms, map } = gen(['traveling-state'], i);
      const G = buildGraph(rooms, map);
      const route = withRole(rooms, 'circuit')
        .map(r => ({ n: r._roomNumber, stop: +noteFor(r, 'circuit').match(/stop (\d+)/)[1] }))
        .sort((a, b) => a.stop - b.stop).map(x => x.n);
      for (let k = 1; k < route.length; k++) expect(G.adj.get(route[k - 1]).has(route[k])).toBe(true);
      const summary = d.gestalts.find(x => x.id === 'traveling-state').system.summary.join(' ');
      if (summary.includes('around again')) expect(G.adj.get(route.at(-1)).has(route[0])).toBe(true);
    }
  });

  it('two-states: affected rooms describe different changes', () => {
    for (let i = 0; i < 10; i++) {
      const { rooms } = gen(['two-states'], i);
      const notes = withRole(rooms, 'two states').map(r => noteFor(r, 'two states').replace(/ \w+ exit .*$/, ''));
      expect(new Set(notes).size).toBe(notes.length);
    }
  });

  it('power-network: two of three consumers are powered', () => {
    const { rooms } = gen(['power-network']);
    const consumers = withRole(rooms, 'consumer', 'Power Network');
    expect(consumers).toHaveLength(3);
    expect(consumers.filter(r => noteFor(r, 'consumer', 'Power Network').includes('Currently POWERED'))).toHaveLength(2);
  });

  it('linked-changes: each control drives a different room', () => {
    const { rooms } = gen(['linked-changes']);
    for (const c of withRole(rooms, 'control', 'Linked Changes')) {
      const target = +noteFor(c, 'control', 'Linked Changes').match(/changes Room (\d+)/)[1];
      expect(target).not.toBe(c._roomNumber);
      expect(withRole(rooms, 'linked', 'Linked Changes').map(r => r._roomNumber)).toContain(target);
    }
  });

  it('hands the exact mechanics to the GM-section prompt', () => {
    const brief = formatBrief(gen(['countdown']));
    const block = changesBlock(brief);
    expect(block).toMatch(/^## HOW THE DUNGEON CHANGES/);
    expect(block).toMatch(/Clock: \d+ exploration turns/);
    expect(block).not.toContain('## RUMORS');
    expect(changesBlock('## CONCEPT\nnothing here')).toBe('');
  });
});
