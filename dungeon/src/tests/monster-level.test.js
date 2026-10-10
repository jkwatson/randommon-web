import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MonsterDB, monsterLevel } from '../monsters.js';

const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../public/data', `${name}.json`), 'utf8')));
const db = new MonsterDB(all);

describe('monster levels', () => {
  it('treats "*" as level 10', () => {
    expect(monsterLevel('*')).toBe(10);
    expect(monsterLevel('3')).toBe(3);
  });

  it('keeps "*"-level monsters out of low-level picks and in high-level ones', () => {
    expect(db.filter({ maxLevel: 3 }).some(m => m.level === '*')).toBe(false);
    expect(db.filter({ minLevel: 9 }).some(m => m.level === '*')).toBe(true);
  });
});
