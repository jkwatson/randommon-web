import { describe, it, expect } from 'vitest';
import { calculateConnectionStrength } from '../core/strength.js';

const base = {
  id: 0, name: 'A', level: 3, tags: ['animal'], biomes: ['forest'],
  alignment: 'N', source: 'core', attack: '', page: '', rawStatBlock: '',
  statBlock: {}, description: null, abilities: null,
};

describe('calculateConnectionStrength', () => {
  it('same monster type scores highly', () => {
    const m1 = { ...base, id: 1 };
    const m2 = { ...base, id: 2 };
    const s = calculateConnectionStrength(m1, m2);
    // level_strength=10, tag=10, biome=5, alignment=15, source=10 → 50
    expect(s.total).toBe(50);
    expect(s.level).toBe(10);
    expect(s.tag).toBe(10);
    expect(s.biome).toBe(5);
    expect(s.alignment).toBe(15);
    expect(s.source).toBe(10);
  });

  it('level difference reduces strength', () => {
    const m1 = { ...base, id: 1, level: 1 };
    const m2 = { ...base, id: 2, level: 5 };
    const s = calculateConnectionStrength(m1, m2);
    // level_strength = 10 - 7*4 = -18
    expect(s.level).toBe(-18);
  });

  it('monsters 2 levels apart still connect', () => {
    const m1 = { ...base, id: 1, level: 3 };
    const m2 = { ...base, id: 2, level: 5, source: 'other', alignment: 'C', tags: [], biomes: [] };
    const s = calculateConnectionStrength(m1, m2);
    // level_strength = 10 - 7*2 = -4, all else 0
    expect(s.total).toBe(-4);
  });

  it('biome cap at 3', () => {
    const m1 = { ...base, id: 1, biomes: ['forest', 'cave', 'dungeon', 'swamp'] };
    const m2 = { ...base, id: 2, biomes: ['forest', 'cave', 'dungeon', 'swamp'] };
    const s = calculateConnectionStrength(m1, m2);
    expect(s.biome).toBe(15); // 5 * min(4, 3)
  });

  it('wildcard biome matches all of other monster biomes', () => {
    const m1 = { ...base, id: 1, biomes: ['*'] };
    const m2 = { ...base, id: 2, biomes: ['forest', 'cave', 'dungeon', 'swamp'] };
    const s = calculateConnectionStrength(m1, m2);
    expect(s.biome).toBe(15); // 5 * min(4, 3)
  });

  it('different alignment gives no alignment bonus', () => {
    const m1 = { ...base, id: 1, alignment: 'L' };
    const m2 = { ...base, id: 2, alignment: 'C' };
    const s = calculateConnectionStrength(m1, m2);
    expect(s.alignment).toBe(0);
  });
});
