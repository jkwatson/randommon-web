import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ALL_GESTALTS, SPATIAL_GESTALTS, TRANSFORMATIONAL_GESTALTS } from '../dungeons/gestalts.js';
import { generateModule, generateDungeon, generateWanderingTable } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { buildGraph } from '../dungeons/gestalt-roles.js';
import { changeEncounter } from '../dungeons/gestalt-tells.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

const gen = (g, i) => generateModule(1 + (i % 5), {
  ...(i % 2 ? DOLMENWOOD_CONFIG : {}),
  gestalts: g.category === 'spatial' ? [g.id] : [SPATIAL_GESTALTS[i % 12].id, g.id],
});

describe('legibility', () => {
  for (const g of ALL_GESTALTS) {
    it(`${g.id}: shows itself within two rooms of the entrance`, () => {
      for (let i = 0; i < 4; i++) {
        const { dungeon: d, rooms, map } = gen(g, i);
        const dist = buildGraph(rooms, map).bfs(rooms.find(r => r._isEntrance)._roomNumber);
        for (const gg of d.gestalts) {
          const near = rooms.filter(r => (dist.get(r._roomNumber) ?? 99) <= 2 &&
            r._gestalt?.some(x => x.pattern === gg.name));
          expect(near.length, `${gg.id} run ${i}`).toBeGreaterThan(0);
        }
        for (const r of rooms) for (const x of r._gestalt ?? []) expect(x.note).not.toMatch(/undefined|null|NaN/);
      }
    });
  }
});

describe('pattern rumors', () => {
  it('hint at the gestalts, pinned to rooms that exist, without room numbers', () => {
    for (let i = 0; i < 24; i++) {
      const { dungeon: d, rooms } = gen(ALL_GESTALTS[i % 36], i);
      expect(d.rumorRefs.length).toBeGreaterThanOrEqual(2);
      const nums = new Set(rooms.map(r => r._roomNumber));
      for (const r of d.rumorRefs) {
        expect(nums.has(r.roomRef)).toBe(true);
        expect(r.text).not.toMatch(/undefined|null|Room \d/);
      }
      expect(d.rumorRefs.some(r => !d.rumors.includes(r.text))).toBe(true);
    }
  });
});

describe('wandering table', () => {
  for (const g of TRANSFORMATIONAL_GESTALTS) {
    it(`${g.id}: roll 3 advances or shows the system (crawl and module)`, () => {
      const crawl = generateDungeon(2, { gestalts: ['hub-and-spokes', g.id] });
      const roll3 = generateWanderingTable(2).find(r => r.roll === 3).entry;
      expect(roll3).toBe(changeEncounter(crawl));
      expect(roll3).not.toMatch(/undefined|null/);
      const { dungeon: d } = generateModule(2, { gestalts: ['hub-and-spokes', g.id] });
      expect(d.wanderingTable.find(r => r.roll === 3).entry).toBe(changeEncounter(d));
    });
  }
});
