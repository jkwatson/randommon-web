import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateModule } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { buildFloorPlan } from '../maps/floorplan.js';
import { playability } from '../maps/playability.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

describe('playability', () => {
  it('measures the drawn floor plan consistently', () => {
    for (let i = 0; i < 12; i++) {
      const mod = generateModule(1 + (i % 5), i % 2 ? DOLMENWOOD_CONFIG : {});
      const fp = buildFloorPlan(mod);
      const m = playability(mod, fp);
      expect(m.areas).toBe(mod.rooms.length);
      expect(m.chambers + m.nooks + m.corridors).toBe(m.areas);
      expect(m.thinShare).toBeGreaterThan(0);
      expect(m.thinShare).toBeLessThan(1);
      expect(m.meanPassageFt % fp.ftPerSquare).toBe(0);
      // Cramped areas are monster/NPC areas that aren't chambers.
      for (const n of m.cramped) {
        const shape = fp.rooms.find(s => s.number === n);
        expect(shape.kind === 'corridor' || shape.rect.w * shape.rect.h < 4).toBe(true);
        expect(['monster', 'npc']).toContain(mod.rooms.find(r => r._roomNumber === n).contentType);
      }
      expect(m.verdict).toBe(['good', 'fair'][m.warnings.length] ?? 'poor');
    }
  });

  it('flags monsters crowded into corridors and packed next door to each other', () => {
    const mod = generateModule(3);
    for (const r of mod.rooms) {
      r.contentType = 'monster';
      r.faction = null;
      r.roomType = 'corridor';
      r.roomSize = { width: 10, length: 40 };
    }
    const m = playability(mod);
    expect(m.verdict).toBe('poor');
    expect(m.warnings.map(w => w.id)).toEqual(expect.arrayContaining(['few-chambers', 'thin', 'cramped', 'jammed']));
    expect(m.cramped).toHaveLength(mod.rooms.length);
  });

  it('does not count faction garrisons sharing a wall as jammed — that is a border', () => {
    const mod = generateModule(3);
    mod.rooms.forEach((r, i) => { r.contentType = 'monster'; r.faction = { name: i % 2 ? 'one band' : 'their rivals' }; });
    expect(playability(mod).jammed).toHaveLength(0);
  });
});
