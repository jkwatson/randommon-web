import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateModule } from '../dungeons/generator.js';
import { personalName, creatureName, hasNameLists } from '../dungeons/names.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  initMonsterDB(new MonsterDB(JSON.parse(readFileSync(resolve(root, 'public/data/core.json'), 'utf8'))));
});

describe('NPC names', () => {
  it('names leaders and room NPCs from a wide pool, rarely twice', () => {
    const names = [];
    for (let i = 0; i < 40; i++) {
      const { dungeon: d, rooms } = generateModule(3);
      names.push(...d.factions.map(f => f.npcName), ...rooms.filter(r => r.npcName).map(r => r.npcName));
    }
    for (const n of names) expect(n).toMatch(/^[A-Z]/);
    expect(new Set(names).size).toBeGreaterThan(names.length * (hasNameLists ? 0.8 : 0.5));
  });

  // Only where this machine has the local name lists (they're gitignored).
  it.runIf(hasNameLists)('fits a name to ancestry and sex, and a faction leader to its kind', () => {
    const one = () => 0;
    expect(personalName({ kindred: 'Human', sex: 'Female' }, one)).toBeTruthy();
    expect(personalName({ kindred: 'Human', sex: 'Female' }, one)).not.toBe(personalName({ kindred: 'Human', sex: 'Male' }, one));
    expect(personalName({ kindred: 'Dwarf' }, one)).toMatch(/^\S+ \S+$/);   // a name and a clan
    expect(creatureName('orcs', one)).toMatch(/ the /);                     // "Az the Mauler"
    expect(creatureName('giant spiders')).toBeNull();
  });
});
