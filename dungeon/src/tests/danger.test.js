import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateModule } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { DANGER_LEVELS, rollDangerLevel, rollEncounterCheck, checkRule, encounterTables, TABLE_ROLLS, OMEN_ROLLS } from '../dungeons/danger.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { setModels, MODELS } from '../../../cli/polish.js';
import { lookupFactionCreature } from '../dungeons/gestalt-roles.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

describe('danger level and random encounters', () => {
  it('gives every dungeon a danger level and 2d4 tables with omens on the even rows', () => {
    for (let i = 0; i < 16; i++) {
      const { dungeon: d } = generateModule(1 + (i % 5), i % 2 ? DOLMENWOOD_CONFIG : {});
      expect(Object.keys(DANGER_LEVELS)).toContain(d.danger);
      for (const t of encounterTables(d)) {
        expect(t.rows.map(r => r.roll)).toEqual(TABLE_ROLLS);
        for (const r of t.rows) {
          expect(r.entry).not.toMatch(/undefined|null|^Something/);
          expect(!!r.omen).toBe(OMEN_ROLLS.includes(r.roll));
          expect(!!r.once).toBe(r.roll === 2 || r.roll === 8);
          if (r.once) expect(r.aftermath).toBeTruthy();
        }
      }
      expect(checkRule(d)).toMatch(/2d4/);
      expect(checkRule(d)).toMatch(i % 2 ? /turn/ : /crawling round/);
    }
  });

  it('gives a large dungeon with zones one table per zone, sharing the escalations', () => {
    let zoned = 0;
    for (let i = 0; i < 12 && !zoned; i++) {
      const { dungeon: d, rooms } = generateModule(3, { size: 'Large' });
      expect(d.size).toBe('Large');
      const zones = new Set(rooms.map(r => r._zone).filter(Boolean));
      const tables = encounterTables(d);
      if (zones.size < 2 || tables.length < 2) continue;
      zoned++;
      // Every zoned room is on exactly one table, and no table is a one- or two-room zone.
      expect(tables.flatMap(t => t.rooms).sort((a, b) => a - b))
        .toEqual(rooms.filter(r => r._zone).map(r => r._roomNumber).sort((a, b) => a - b));
      for (const t of tables) expect(t.rooms.length).toBeGreaterThanOrEqual(3);
      for (const t of tables) {
        expect(t.rows.find(r => r.roll === 2).entry).toBe(tables[0].rows.find(r => r.roll === 2).entry);
        expect(t.rooms.length).toBeGreaterThan(0);
      }
      expect(checkRule(d)).toMatch(/party's zone/);
    }
    expect(zoned).toBeGreaterThan(0);
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

  it('rolls checks: 1 is an encounter, doubles an omen, once rows spent, 6 the dungeon-wide event', () => {
    const rows = TABLE_ROLLS.map(n => ({ roll: n, entry: `e${n}`, ...(OMEN_ROLLS.includes(n) ? { omen: `o${n}` } : {}), ...(n === 2 || n === 8 ? { once: true, aftermath: `a${n}` } : {}) }));
    const d = { wanderingTable: rows, checkSix: 'the wave pulses' };
    const seq = vals => { let i = 0; return () => vals[i++]; };
    // check 1; dice 2+3 = 5: an event
    expect(rollEncounterCheck(d, seq([0, 0.3, 0.6]))).toMatchObject({ hit: true, roll: 5, entry: 'e5' });
    // check 1; dice 2+2 = 4: the omen, the event 1d4 later
    const omen = rollEncounterCheck(d, seq([0, 0.3, 0.3, 0.99]));
    expect(omen).toMatchObject({ roll: 4, omen: 'o4', entry: 'e4', delay: 4 });
    // 4+4 = 8 is always an omen, and once only: next time it is the aftermath
    expect(rollEncounterCheck(d, seq([0, 0.9, 0.9, 0]))).toMatchObject({ roll: 8, omen: 'o8', once: true });
    expect(rollEncounterCheck(d, seq([0, 0.9, 0.9, 0]))).toEqual({ hit: true, roll: 8, dice: [4, 4], entry: 'a8', monster: null });
    expect(rollEncounterCheck(d, seq([0.99]))).toEqual({ hit: false, six: 'the wave pulses' });
    expect(rollEncounterCheck(d, seq([0.5]))).toEqual({ hit: false });
  });

  it('keeps a faction\'s own creatures within two levels of the party', () => {
    expect(lookupFactionCreature({ creature: 'vampires' }).level).toBe('11');
    // No creature is called just "Ooze": the faction's kin stand in.
    expect(lookupFactionCreature({ creature: 'oozes' }, 1).name).toBe('GRAY OOZE');
    const lesser = lookupFactionCreature({ creature: 'vampires' }, 3);
    expect(lesser.name).toMatch(/VAMPIRE/);
    expect(parseInt(lesser.level)).toBeLessThanOrEqual(5);
    for (let i = 0; i < 20; i++) {
      const { dungeon: d, rooms } = generateModule(1 + (i % 3));
      // Faction creatures within two levels of the party; deliberate threats
      // (bosses, monster locks, hunters) within four.
      const kin = new Set(d.factions.map(f => lookupFactionCreature(f, d.partyLevel)?.name).filter(Boolean));
      for (const r of rooms.filter(x => x.monster?.level)) {
        const lv = r.monster.level === '*' ? 10 : parseInt(r.monster.level);
        expect(lv, `${r.monster.name} in Room ${r._roomNumber}`).toBeLessThanOrEqual(d.partyLevel + (kin.has(r.monster.name) ? 2 : 4));
      }
      const names = d.factions.map(f => f.npcName);
      expect(new Set(names).size).toBe(names.length);
    }
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
