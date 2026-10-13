import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateModule } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { PREMISES, rollPremise } from '../dungeons/premises.js';
import { encounterTables } from '../dungeons/danger.js';
import { buildFloorPlan } from '../maps/floorplan.js';
import { renderHandDrawnMap } from '../maps/render-handdrawn.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { formatBrief, budgetFor } from '../../../cli/format-brief.js';
import { storyBudget } from '../../../cli/polish.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  initMonsterDB(new MonsterDB(['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(n =>
    JSON.parse(readFileSync(resolve(root, `public/data/${n}.json`), 'utf8')))));
});

describe('premises', () => {
  it('rolls every premise, contested no more than about a quarter of the time', () => {
    const n = 2000, counts = {};
    for (let i = 0; i < n; i++) { const p = rollPremise(); counts[p.id] = (counts[p.id] ?? 0) + 1; }
    expect(Object.keys(counts).sort()).toEqual(PREMISES.map(p => p.id).sort());
    expect(counts.contested / n).toBeLessThan(0.32);
  });

  for (const p of PREMISES) {
    it(`${p.id}: ${p.factions} faction(s), fitting patterns, and a whole module`, () => {
      for (let i = 0; i < 9; i++) {
        const config = { ...(i % 2 ? DOLMENWOOD_CONFIG : {}), premise: p.id, size: ['Small', 'Medium', 'Large'][i % 3], ...(i === 4 ? { layout: 'cyclic' } : {}) };
        const mod = generateModule(1 + (i % 5), config);
        const d = mod.dungeon;
        expect(d.premise).toBe(p.id);
        expect(d.factions).toHaveLength(p.factions);
        const relational = d.gestalts.filter(g => g.category === 'relational').map(g => g.id);
        if (p.relational === false) expect(relational).toEqual([]);
        if (Array.isArray(p.relational)) for (const id of relational) expect(p.relational).toContain(id);
        if (p.transformational) expect(d.gestalts.map(g => g.id)).toContain(p.transformational);
        if (p.outsider) expect(d.factions[0].name).toBe(p.outsider);
        if (p.inhabitant && d.type !== 'Menagerie') expect(d.factions[0].isInhabitant).toBe(true);

        const brief = formatBrief(mod);
        expect(brief).not.toMatch(/undefined|NaN|\[object/);
        expect(brief).toMatch(new RegExp(`^PREMISE: ${p.label} — `, 'm'));
        expect(storyBudget(brief).premise.id).toBe(p.id);
        expect(renderHandDrawnMap(buildFloorPlan(mod))).not.toMatch(/NaN|undefined/);

        for (const t of encounterTables(d)) {
          for (const r of t.rows) expect(r.entry).not.toMatch(/undefined|null/);
          // With nobody in charge, nothing on the table is a faction.
          if (!p.factions) for (const r of t.rows) expect(`${r.entry} ${r.omen ?? ''}`).not.toMatch(/faction|members|storm the/i);
        }
      }
    });
  }

  it('gives a lost place no secrets and a shorter brief', () => {
    expect(budgetFor(12, 'lost-place')).toMatchObject({ secrets: 0, words: 600 });
    expect(budgetFor(24, 'holdout').secrets).toBe(1);
    expect(budgetFor(24, 'contested').secrets).toBe(2);
    const mod = generateModule(3, { premise: 'lost-place' });
    expect(formatBrief(mod)).toMatch(/## FACTIONS\nNone\./);
  });
});
