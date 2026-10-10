import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateModule } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { isChamber } from '../dungeons/room-fit.js';
import { playability } from '../maps/playability.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

const modules = [];
const sample = () => {
  if (!modules.length) {
    for (let i = 0; i < 30; i++) {
      const config = { ...(i % 2 ? DOLMENWOOD_CONFIG : {}), ...(i % 5 === 0 ? { layout: 'cyclic' } : {}) };
      modules.push(generateModule(1 + (i % 5), config));
    }
  }
  return modules;
};

describe('room fitting', () => {
  it('puts monsters, NPCs, and faction bases in chambers, unless the layout fixed a corridor there', () => {
    for (const { rooms } of sample()) {
      for (const r of rooms.filter(x => ['monster', 'npc'].includes(x.contentType) || x._factionBase)) {
        if (!r._fixedShape) expect(isChamber(r), `room ${r._roomNumber} (${r.roomType}, ${r.roomSize.label})`).toBe(true);
      }
    }
  });

  it('makes the final room a hall', () => {
    for (const { rooms } of sample()) {
      const f = rooms.find(r => r.finalRoomDesc);
      if (!f._fixedShape) expect(f.roomSize.width * f.roomSize.length).toBeGreaterThanOrEqual(900);
    }
  });

  it('keeps the map in step with the rooms it reshapes', () => {
    for (const { rooms, map } of sample()) {
      for (const n of map.nodes.values()) {
        const r = rooms.find(x => x._roomNumber === n.roomNumber);
        if (n.roomType) expect(n.roomType).toBe(r.roomType);
      }
      for (const r of rooms) expect(r.roomType === 'corridor' ? r.hallway : r.furnishing).toBeTruthy();
    }
  });

  it('moves stray monsters away from other monsters, keeping each group whole', () => {
    let strays = 0;
    for (const mod of sample()) {
      for (const r of mod.rooms.filter(x => x.contentType === 'monster')) {
        expect(r.monster ?? r.beast).toBeTruthy();
        expect(r.count).toBeGreaterThan(0);
      }
      strays += playability(mod).jammed.length;
    }
    expect(strays / sample().length).toBeLessThan(0.3);
  });

  it('leaves most rolls playable', () => {
    const good = sample().filter(m => playability(m).verdict === 'good').length;
    expect(good / sample().length).toBeGreaterThan(0.8);
  });
});
