import { describe, it, expect, beforeEach } from 'vitest';
import { MonsterGraph } from '../core/graph.js';
import { applyFilters, availableLevels, availableBiomes, availableTags,
         cluster, walk, search } from '../core/wrangler.js';

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
  makeMonster({ id: 3, name: 'Dragon',  level: 10, tags: ['dragon'], biomes: ['mountain'], alignment: 'C', source: 'cs1' }),
  makeMonster({ id: 4, name: 'Spider',  level: 2, tags: ['animal'], biomes: ['forest', 'cave'], alignment: 'N', source: 'core' }),
  makeMonster({ id: 5, name: 'Bat',     level: 1, tags: ['animal'], biomes: ['cave'], alignment: 'N', source: 'core' }),
];

const defaultChoices = { level: null, biome: null, tag: null, sources: [], randomness: 1, seedMonster: null };

describe('applyFilters', () => {
  let graph;
  beforeEach(() => { graph = new MonsterGraph(); graph.build(monsters); });

  it('no filters returns all', () => {
    expect(applyFilters(graph, defaultChoices).size).toBe(5);
  });

  it('filter by level', () => {
    const ids = applyFilters(graph, { ...defaultChoices, level: 2 });
    expect(ids.size).toBe(3); // Wolf, Goblin, Spider
    expect(ids.has(3)).toBe(false); // Dragon excluded
  });

  it('filter by biome', () => {
    const ids = applyFilters(graph, { ...defaultChoices, biome: 'cave' });
    expect(ids.size).toBe(3); // Goblin, Spider, Bat
  });

  it('filter by tag', () => {
    const ids = applyFilters(graph, { ...defaultChoices, tag: 'animal' });
    expect(ids.size).toBe(3); // Wolf, Spider, Bat
  });

  it('combined filters', () => {
    const ids = applyFilters(graph, { ...defaultChoices, biome: 'cave', tag: 'animal' });
    expect(ids.size).toBe(2); // Spider, Bat
  });
});

describe('availableLevels / availableBiomes / availableTags', () => {
  let graph;
  beforeEach(() => { graph = new MonsterGraph(); graph.build(monsters); });

  it('availableLevels ignores current level filter', () => {
    const levels = availableLevels(graph, { ...defaultChoices, level: 2 });
    expect(levels).toContain(10); // Dragon still appears
  });

  it('availableBiomes ignores current biome filter', () => {
    const biomes = availableBiomes(graph, { ...defaultChoices, biome: 'cave' });
    expect(biomes).toContain('forest');
    expect(biomes).toContain('mountain');
  });

  it('availableTags ignores current tag filter', () => {
    const tags = availableTags(graph, { ...defaultChoices, tag: 'animal' });
    expect(tags).toContain('humanoid');
    expect(tags).toContain('dragon');
  });
});

describe('cluster', () => {
  let graph;
  beforeEach(() => { graph = new MonsterGraph(); graph.build(monsters); });

  it('returns n monsters', () => {
    const seed = monsters[0];
    const result = cluster(3, graph, { ...defaultChoices, randomness: 2, seedMonster: seed });
    expect(result.length).toBe(3);
    expect(result[0]).toEqual(seed);
  });

  it('seed is always first', () => {
    const seed = monsters[3]; // Spider
    const result = cluster(2, graph, { ...defaultChoices, randomness: 1, seedMonster: seed });
    expect(result[0].id).toBe(seed.id);
  });
});

describe('walk', () => {
  let graph;
  beforeEach(() => { graph = new MonsterGraph(); graph.build(monsters); });

  it('returns up to n monsters', () => {
    const result = walk(4, graph, { ...defaultChoices, seedMonster: monsters[0] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('first monster is the seed', () => {
    const seed = monsters[1];
    const result = walk(3, graph, { ...defaultChoices, seedMonster: seed });
    expect(result[0].id).toBe(seed.id);
  });

  it('no duplicates in result', () => {
    const result = walk(4, graph, { ...defaultChoices, seedMonster: monsters[0] });
    const ids = result.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('search', () => {
  let graph;
  beforeEach(() => { graph = new MonsterGraph(); graph.build(monsters); });

  it('finds by name', () => {
    const results = search('wolf', graph, defaultChoices);
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Wolf');
  });

  it('finds by tag', () => {
    const results = search('humanoid', graph, defaultChoices);
    expect(results.map(m => m.name)).toContain('Goblin');
  });

  it('finds by biome', () => {
    const results = search('mountain', graph, defaultChoices);
    expect(results.map(m => m.name)).toContain('Dragon');
  });

  it('respects active filters', () => {
    const results = search('animal', graph, { ...defaultChoices, biome: 'cave' });
    // Only cave animals: Spider, Bat
    expect(results.length).toBe(2);
  });
});
