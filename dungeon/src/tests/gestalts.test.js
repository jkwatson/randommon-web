import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { rollGestalts, ALL_GESTALTS, SPATIAL_GESTALTS } from '../dungeons/gestalts.js';
import { generateModule } from '../dungeons/generator.js';
import { generateDolmenwoodDungeon, DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { formatBrief } from '../../../cli/format-brief.js';

const count = (gs, cat) => gs.filter(g => g.category === cat).length;

describe('gestalt catalogue', () => {
  it('has 12 patterns per category with unique ids', () => {
    expect(ALL_GESTALTS).toHaveLength(36);
    expect(new Set(ALL_GESTALTS.map(g => g.id)).size).toBe(36);
    for (const cat of ['spatial', 'transformational', 'relational']) {
      expect(ALL_GESTALTS.filter(g => g.category === cat)).toHaveLength(12);
    }
  });

  it('gives spatial patterns no stories and every other pattern at least one', () => {
    for (const g of ALL_GESTALTS) {
      if (g.category === 'spatial') expect(g.stories).toBeUndefined();
      else expect(g.stories?.length).toBeGreaterThan(0);
    }
  });
});

describe('rollGestalts', () => {
  it('rolls one spatial plus one other for small/medium dungeons', () => {
    for (let i = 0; i < 50; i++) {
      const gs = rollGestalts({ type: 'Crypt', size: 'Medium' });
      expect(gs).toHaveLength(2);
      expect(gs[0].category).toBe('spatial');
      expect(count(gs, 'transformational') + count(gs, 'relational')).toBe(1);
    }
  });

  it('rolls one of each category for large dungeons', () => {
    const gs = rollGestalts({ type: 'Cave', size: 'Large', factionCount: 3 });
    expect(gs.map(g => g.category)).toEqual(['spatial', 'transformational', 'relational']);
  });

  it('honors overrides and fills in the missing categories', () => {
    const gs = rollGestalts({ type: 'Crypt', size: 'Medium', overrides: ['countdown'] });
    expect(gs.map(g => g.id)).toContain('countdown');
    expect(count(gs, 'spatial')).toBe(1);
    expect(gs).toHaveLength(2);
  });

  it('rejects unknown ids', () => {
    expect(() => rollGestalts({ overrides: ['nope'] })).toThrow(/Unknown gestalt/);
  });

  it('skips faction-relationship patterns when there is only one faction', () => {
    for (let i = 0; i < 200; i++) {
      const gs = rollGestalts({ type: 'Bastion', size: 'Large', factionCount: 1 });
      for (const g of gs) expect(g.minFactions ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('strongly favors Hunter and Prey for a Menagerie', () => {
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      if (rollGestalts({ type: 'Menagerie', size: 'Medium' }).some(g => g.id === 'hunter-and-prey')) hits++;
    }
    expect(hits / 300).toBeGreaterThan(0.55);
  });

  it('is deterministic given a seeded rand', () => {
    const seeded = () => { let x = 42; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
    const a = rollGestalts({ type: 'Crypt', rand: seeded() }).map(g => g.id);
    const b = rollGestalts({ type: 'Crypt', rand: seeded() }).map(g => g.id);
    expect(a).toEqual(b);
    expect(SPATIAL_GESTALTS.map(g => g.id)).toContain(a[0]);
  });
});

describe('gestalts in generated modules', () => {
  beforeAll(() => {
    const root = resolve(__dirname, '../../..');
    const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
      JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
    initMonsterDB(new MonsterDB(all));
  });

  it('records gestalts on the dungeon and in the brief', () => {
    const mod = generateModule(3, { gestalts: ['locked-center', 'countdown'] });
    // Large dungeons also roll a relational pattern on top of the overrides.
    expect(mod.dungeon.gestalts.map(g => g.id).slice(0, 2)).toEqual(['locked-center', 'countdown']);
    const brief = formatBrief(mod);
    expect(brief).toContain('## GESTALT');
    expect(brief).toContain('SPATIAL — Locked Center');
    expect(brief).toContain('TRANSFORMATIONAL — Countdown');
  });

  it('makes Warring Factions dispositions all hostile', () => {
    const { dungeon: d } = generateModule(2, { gestalts: ['hub-and-spokes', 'warring-factions'] });
    for (const f of d.factions) {
      for (const disp of Object.values(f.dispositions)) expect(disp).toMatch(/open war/);
    }
  });

  it('casts a host and an intruder', () => {
    const { dungeon: d } = generateModule(2, { gestalts: ['great-divide', 'host-and-intruder'] });
    const g = d.gestalts.find(x => x.id === 'host-and-intruder');
    expect(g.cast.host).toBeTruthy();
    expect(g.cast.intruder).toBeTruthy();
    expect(g.cast.host).not.toBe(g.cast.intruder);
    expect(d.factions.find(f => f.name === g.cast.host).gestaltRole).toBe('host');
  });

  it('gives Hunter and Prey a real hunter that is not a faction creature, and puts it in the wandering table', () => {
    for (let i = 0; i < 10; i++) {
      const { dungeon: d } = generateModule(2, {
        types: [{ name: 'Cave', weight: 1, tags: ['monstrosity', 'insect', 'animal', 'ooze'], flavor: 'x', finalRoom: 'y' }],
        gestalts: ['artery-and-branches', 'hunter-and-prey'],
      });
      const g = d.gestalts.find(x => x.id === 'hunter-and-prey');
      expect(g.cast.hunter?.statblock).toBeTruthy();
      const creatures = d.factions.map(f => f.creature?.toUpperCase());
      expect(creatures).not.toContain(g.cast.hunter.name.toUpperCase());
      expect(d.wanderingTable.find(r => r.roll === 3).entry).toMatch(/THE HUNTER/);
    }
  });

  it('uses the Menagerie beast as the hunter', () => {
    const config = {
      types: [{ name: 'Menagerie', weight: 1, tags: ['monstrosity', 'animal'], flavor: 'x', finalRoom: 'y' }],
      inhabitantFactions: [],
      gestalts: ['hub-and-spokes', 'hunter-and-prey'],
    };
    const { dungeon: d } = generateModule(2, config);
    const g = d.gestalts.find(x => x.id === 'hunter-and-prey');
    expect(g.cast.hunter.isBeast).toBe(true);
    expect(g.cast.hunter.name).toBe(d.beast.epithet);
  });

  it('builds Dolmenwood modules from Dolmenwood types and factions, with gestalts', () => {
    const dwTypes = new Set(DOLMENWOOD_CONFIG.types.map(t => t.name));
    const dwFactions = new Set([
      ...DOLMENWOOD_CONFIG.inhabitantFactions.map(f => f.name),
      ...DOLMENWOOD_CONFIG.outsiderFactions,
    ]);
    for (let i = 0; i < 10; i++) {
      const { dungeon: d } = generateModule(2, { ...DOLMENWOOD_CONFIG, gestalts: ['vertical-spine'] });
      expect(dwTypes.has(d.type)).toBe(true);
      for (const f of d.factions) expect(dwFactions.has(f.name)).toBe(true);
      expect(d.gestalts[0].id).toBe('vertical-spine');
      expect(d.gestalts.length).toBeGreaterThanOrEqual(2);
    }
    expect(DOLMENWOOD_CONFIG.gestalts).toBeUndefined();
  });

  it('works for Dolmenwood dungeons', () => {
    const d = generateDolmenwoodDungeon(2);
    expect(d.gestalts.length).toBeGreaterThanOrEqual(2);
    expect(d.gestalts[0].category).toBe('spatial');
  });

  it('survives a JSON round trip (checkpoint resume)', () => {
    const { dungeon: d } = generateModule(2);
    expect(JSON.parse(JSON.stringify(d)).gestalts).toEqual(d.gestalts);
  });
});
