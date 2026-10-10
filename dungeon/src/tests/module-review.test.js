import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateModule } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { structureText, reviewHtml, roomContents } from '../../../cli/review.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

describe('module review', () => {
  it('summarizes the structure: playability, then every room and its contents', () => {
    for (let i = 0; i < 8; i++) {
      const mod = generateModule(1 + (i % 5), i % 2 ? DOLMENWOOD_CONFIG : {});
      const text = structureText(mod);
      expect(text).toMatch(/^Playability: (GOOD|FAIR|POOR) — /m);
      for (const r of mod.rooms) expect(text).toMatch(new RegExp(`^[ !] +${r._roomNumber} `, 'm'));
      expect(text).not.toMatch(/undefined|null|NaN/);
      for (const r of mod.rooms) expect(roomContents(r)).toBeTruthy();
    }
  });

  it('draws a self-contained preview, with the concept once there is one', () => {
    const mod = generateModule(3);
    const html = reviewHtml(mod);
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/undefined|NaN/);
    expect(html).not.toContain('Concept (Pass 1 blueprint)');
    const withConcept = reviewHtml(mod, { stage: 'concept', blueprint: 'TITLE: The <Drowned> Abbey\nCONCEPT: x' });
    expect(withConcept).toContain('<h1>The &lt;Drowned&gt; Abbey</h1>');
    expect(withConcept).toContain('Concept (Pass 1 blueprint)');
  });
});
