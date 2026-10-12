import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateModule } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { DANGER_LEVELS, rollDangerLevel, rollEncounterCheck, checkRule } from '../dungeons/danger.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { setModels, MODELS } from '../../../cli/polish.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

describe('danger level and random encounters', () => {
  it('gives every dungeon a danger level and a flat table every entry of which can turn up', () => {
    for (let i = 0; i < 16; i++) {
      const { dungeon: d } = generateModule(1 + (i % 5), i % 2 ? DOLMENWOOD_CONFIG : {});
      expect(Object.keys(DANGER_LEVELS)).toContain(d.danger);
      expect(d.wanderingDie).toBe(d.size === 'Large' ? 8 : 6);
      expect(d.wanderingTable.map(r => r.roll)).toEqual([...Array(d.wanderingDie).keys()].map(k => k + 1));
      for (const r of d.wanderingTable) expect(r.entry).not.toMatch(/undefined|null/);
      expect(checkRule(d)).toMatch(new RegExp(`d${d.wanderingDie}`));
      expect(checkRule(d)).toMatch(i % 2 ? /turn/ : /crawling round/);
    }
  });

  it('puts a random pulse on the check die, not at the tail of the table', () => {
    const { dungeon: d } = generateModule(3, { gestalts: ['hub-and-spokes', 'random-pulse'] });
    const pulse = d.gestalts.find(g => g.id === 'random-pulse').system;
    expect(d.checkSix).toContain(pulse.pulse);
    expect(pulse.summary[0]).toMatch(/shows a 6/);
  });

  it('makes a hunted dungeon more dangerous', () => {
    const hunted = Array.from({ length: 200 }, () => rollDangerLevel({ gestalts: [{ id: 'hunter-and-prey' }] }));
    expect(hunted).not.toContain('unsafe');
  });

  it('rolls checks: 1 is an encounter, 6 the dungeon-wide event', () => {
    const d = { wanderingDie: 8, wanderingTable: [...Array(8).keys()].map(k => ({ roll: k + 1, entry: `e${k + 1}` })), checkSix: 'the wave pulses' };
    const seq = vals => { let i = 0; return () => vals[i++]; };
    expect(rollEncounterCheck(d, seq([0, 0.99]))).toMatchObject({ hit: true, roll: 8, entry: 'e8' });
    expect(rollEncounterCheck(d, seq([0.99]))).toEqual({ hit: false, six: 'the wave pulses' });
    expect(rollEncounterCheck(d, seq([0.5]))).toEqual({ hit: false });
  });

  it('keeps large dungeons to two factions', () => {
    for (let i = 0; i < 20; i++) expect(generateModule(3).dungeon.factions.length).toBeLessThanOrEqual(2);
  });
});

describe('model choice', () => {
  it('overrides a step\'s model by alias or id, and rejects unknown steps', () => {
    const before = { ...MODELS };
    setModels('rooms:sonnet, editor=claude-haiku-5-5');
    expect(MODELS.rooms).toBe('sonnet');
    expect(MODELS.editor).toBe('claude-haiku-5-5');
    expect(() => setModels('roms:opus')).toThrow(/unknown step/);
    Object.assign(MODELS, before);
  });
});
