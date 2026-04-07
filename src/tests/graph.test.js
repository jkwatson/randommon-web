import { describe, it, expect, beforeEach } from 'vitest';
import { MonsterGraph } from '../core/graph.js';

/** @returns {import('../core/monster.js').Monster} */
function makeMonster(overrides) {
  return {
    id: 0, name: 'Test', level: 3, tags: ['animal'], biomes: ['forest'],
    alignment: 'N', source: 'core', attack: '', page: '', rawStatBlock: '',
    statBlock: {}, description: null, abilities: null,
    ...overrides,
  };
}

const monsters = [
  makeMonster({ id: 1, name: 'Wolf',    level: 2, tags: ['animal'], biomes: ['forest'], alignment: 'N', source: 'core' }),
  makeMonster({ id: 2, name: 'Goblin',  level: 2, tags: ['humanoid'], biomes: ['forest', 'cave'], alignment: 'C', source: 'core' }),
  makeMonster({ id: 3, name: 'Dragon',  level: 10, tags: ['dragon'], biomes: ['mountain'], alignment: 'C', source: 'core' }),
  makeMonster({ id: 4, name: 'Spider',  level: 2, tags: ['animal'], biomes: ['forest', 'cave'], alignment: 'N', source: 'core' }),
];

describe('MonsterGraph', () => {
  let graph;

  beforeEach(() => {
    graph = new MonsterGraph();
    graph.build(monsters);
  });

  it('builds vertices for all monsters', () => {
    expect(graph.size).toBe(4);
  });

  it('getAdjacent returns neighbors in pool', () => {
    const pool = new Set([1, 2, 3, 4]);
    const adj = graph.getAdjacent(1, pool, 3);
    expect(adj.length).toBeGreaterThan(0);
    // Wolf (animal, forest, N) should be closest to Spider (animal, forest+cave, N)
    expect(adj[0].id).toBe(4);
  });

  it('getAdjacent respects pool restriction', () => {
    const pool = new Set([3]); // only Dragon
    const adj = graph.getAdjacent(1, pool, 3);
    // Dragon has negative level_strength with Wolf (level diff = 8 → 10-56 = -46)
    // so no edges to Dragon — result should be empty
    expect(adj.length).toBe(0);
  });

  it('getAdjacent respects limit', () => {
    const pool = new Set([1, 2, 3, 4]);
    const adj = graph.getAdjacent(1, pool, 1);
    expect(adj.length).toBe(1);
  });

  it('getNeighborExcluding skips excluded ids', () => {
    const pool = new Set([1, 2, 3, 4]);
    const excluded = new Set([4]); // exclude Spider (would be rank 1 for Wolf)
    const neighbor = graph.getNeighborExcluding(1, excluded, pool, 1);
    expect(neighbor.id).not.toBe(4);
  });
});
