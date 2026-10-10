import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SPATIAL_GESTALTS } from '../dungeons/gestalts.js';
import { generateModule } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { buildFloorPlan } from '../maps/floorplan.js';
import { renderHandDrawnMap, passagePolygon } from '../maps/render-handdrawn.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

describe('hand-drawn map renderer', () => {
  it('renders every layout as clean SVG with every room numbered', () => {
    for (const g of SPATIAL_GESTALTS) {
      for (let i = 0; i < 3; i++) {
        const mod = generateModule(1 + i, { ...(i % 2 ? DOLMENWOOD_CONFIG : {}), gestalts: [g.id] });
        const svg = renderHandDrawnMap(buildFloorPlan(mod));
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).not.toMatch(/NaN|undefined|Infinity/);
        // WeasyPrint ignores paint-order; labels must not depend on it.
        expect(svg).not.toMatch(/paint-order="/);
        for (const r of mod.rooms) expect(svg, `${g.id} room ${r._roomNumber}`).toContain(`>${r._roomNumber}</text>`);
      }
    }
  });

  it('is deterministic for a module, with ids unique to its map', () => {
    const mod = generateModule(2, { gestalts: ['hollow-center'] });
    const fp = buildFloorPlan(mod);
    const a = renderHandDrawnMap(fp), b = renderHandDrawnMap(fp);
    expect(a).toBe(b);
    const ids = [...a.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith(`m${(fp.seed >>> 0).toString(36)}`)).toBe(true);
  });

  it('thickens a passage to its width and tucks its ends into the rooms', () => {
    const poly = passagePolygon([[0, 0], [4, 0]], 1, 0.5);
    const ys = poly.map(p => p[1]), xs = poly.map(p => p[0]);
    expect(Math.min(...ys)).toBeCloseTo(-0.5);
    expect(Math.max(...ys)).toBeCloseTo(0.5);
    expect(Math.min(...xs)).toBeCloseTo(-0.5);
    expect(Math.max(...xs)).toBeCloseTo(4.5);
    // A right-angle bend keeps its width through the corner.
    const bend = passagePolygon([[0, 0], [2, 0], [2, 2]], 1, 0);
    expect(bend.some(([x, y]) => Math.abs(x - 2.5) < 1e-9 && Math.abs(y + 0.5) < 1e-9)).toBe(true);
  });
});
