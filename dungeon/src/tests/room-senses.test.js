import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateModule } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { fabricFor, airFor, exitClue } from '../dungeons/room-senses.js';
import { farSideType } from '../dungeons/one-way.js';
import { moduleMaps } from '../maps/module-maps.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { formatBrief } from '../../../cli/format-brief.js';
import { publishedRoom, roomSections, stockedNpcs, parseBeyond } from '../../../cli/polish.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  initMonsterDB(new MonsterDB(['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(n =>
    JSON.parse(readFileSync(resolve(root, `public/data/${n}.json`), 'utf8')))));
});

describe('room senses', () => {
  it('gives every room a ceiling, floor, walls and air, in either setting', () => {
    for (let i = 0; i < 8; i++) {
      const { rooms } = generateModule(1 + (i % 5), i % 2 ? DOLMENWOOD_CONFIG : {});
      for (const r of rooms) {
        expect(r.fabric.ceiling).toMatch(/\d+.*ft/);
        expect(r.fabric.floor).toBeTruthy();
        expect(r.fabric.walls).toBeTruthy();
        expect(r.air).toBeTruthy();
      }
    }
  });

  it('fits the ceiling to the room and the air to what is in it', () => {
    const one = () => 0;
    expect(fabricFor({ roomType: 'corridor', roomSize: { width: 10, length: 40 } }, { architecture: 'Luxurious' }, one).ceiling).toMatch(/^8 ft/);
    expect(fabricFor({ roomType: 'room', roomSize: { width: 40, length: 60 } }, { architecture: 'Luxurious' }, one)).toMatchObject({ ceiling: '20 ft, vaulted', floor: 'polished marble' });
    expect(fabricFor({ roomType: 'cavern', roomSize: { width: 30, length: 30 } }, {}, one).ceiling).toMatch(/uneven/);
    expect(airFor({ hazard: 'Bad air — torches gutter' })).toMatch(/foul/);
    expect(airFor({ roomType: 'room', monster: { tags: 'undead' } }, {}, one)).toMatch(/cold/);
  });

  it('tells what lies beyond an exit (a secret door too, once found), but never gives away a trap', () => {
    expect(exitClue({ contentType: 'monster', monster: { name: 'SKELETON', tags: 'undead' } })).toMatch(/bones/);
    expect(exitClue({ contentType: 'monster', monster: { name: 'BANDIT', tags: 'humanoid' }, count: 3 })).toMatch(/voices/);
    expect(exitClue({ contentType: 'monster', monster: { name: 'OGRE', tags: 'giant' }, activity: 'sleeping' })).toMatch(/breathing/);
    expect(exitClue({ contentType: 'hazard', hazard: 'Bad air — torches gutter' })).toMatch(/foul air/);
    // A trap room reads like a quiet room; no clue at all would give it away.
    expect(exitClue({ contentType: 'trap', trapType: 'Spike pit' })).toBe('silence');
    expect(exitClue({ contentType: 'empty' })).toBe('silence');
  });

  it('never makes the entrance an obstacle', () => {
    for (let i = 0; i < 30; i++) {
      const { rooms } = generateModule(3);
      expect(rooms.find(r => r._isEntrance).contentType).not.toBe('obstacle');
    }
  });

  it('prints fabric, air and a clue at each exit in the brief, and publishes them with the room', () => {
    const mod = generateModule(3);
    const brief = formatBrief(mod);
    expect(brief).toMatch(/^Fabric: ceiling \d+.* · floor: .+ · walls: .+$/m);
    expect(brief).toMatch(/^Air: .+$/m);
    expect(brief).toMatch(/→ Room \d+ \[[^\]]+\] — beyond: /);
    const [n, section] = [...roomSections(brief)][0];
    const out = publishedRoom(`### Room ${n} — HALL\n\n*Monster · Room*\n\nA hall.\n\nRoom ${n} — Key: a thing.\n\n*Exits: N [door → Room 2]*`, section);
    expect(out).toMatch(/^\*(Room|Corridor|Cavern)[^*]*· ceiling \d+[^*]*· floor: [^*]+· walls: [^*]+\*$/m);
    expect(out).not.toMatch(/— Key:/);
    expect(out).toMatch(/^\*Exits:\*\n\n- \*\*\w+/m);
  });

  it('prefers what the finished rooms say lies beyond a door over the data\'s clue', () => {
    const sec = '--- Room 12 — Empty — Room, 20 × 20 ft\nExits: East → Room 13 [wooden door] — beyond: silence\nFabric: ceiling 10 ft, flat · floor: marble · walls: plaster';
    expect(publishedRoom('### Room 12 — X\n\nText.', sec, { 13: 'dripping water, a cold wet smell' })).toContain('→ Room 13: *dripping water, a cold wet smell*.');
    expect(publishedRoom('### Room 12 — X\n\nText.', sec)).toContain('→ Room 13: *silence*.');
    expect(parseBeyond('13: dripping water.\nRoom 17 — hammering\n99: no such room', [13, 17])).toEqual({ 13: 'dripping water', 17: 'hammering' });
  });

  it('lists the NPCs the rooms stock, for the concept and its check', () => {
    expect(stockedNpcs('## ROOMS\n\n--- Room 3 — NPC — Room, 20 × 20 ft\n  NPC: Duna\n\n--- Room 5 — Empty — Room\n')).toEqual(['Duna (Room 3)']);
  });

  it('describes a one-way passage\'s far end as it looks from there', () => {
    expect(farSideType('one-way: a sheer 20 ft drop')).toMatch(/^one-way: the foot of a sheer 20 ft drop, a climb up \(the hard way back: .*DC 15 STR/);
    expect(farSideType('one-way: a gate that seals once passed')).toBe('one-way: a gate sealed from the far side (cannot be passed from this side)');
    const { rooms } = generateModule(3, { gestalts: ['ratchet-and-return'], zoneCycles: false });
    expect(rooms.flatMap(r => r.exits).some(e => /the foot of|sealed from the far side|slid shut from the far side|dropped shut|no handle|does not answer/.test(e.type))).toBe(true);
  });

  it('keeps one-way arrows off a finished module\'s map, but on the review\'s', () => {
    const mod = generateModule(3, { gestalts: ['ratchet-and-return'], zoneCycles: false });
    const arrows = svg => (svg.match(/<path d="M[^"]*Z" fill="#(?:ffffff|1b1b1b)" stroke="#1b1b1b"/g) ?? []).length;
    // The difference is each one-way passage's arrow plus the key's one or two
    // arrow samples (the entrance arrow and the compass stay).
    const oneWays = moduleMaps(mod).floorPlan.passages.filter(p => p.kind === 'oneway').length;
    expect(oneWays).toBeGreaterThanOrEqual(4);
    const gone = arrows(moduleMaps(mod).overview()) - arrows(moduleMaps(mod, { flow: false }).overview());
    expect(gone).toBeGreaterThanOrEqual(oneWays + 1);
    expect(gone).toBeLessThanOrEqual(oneWays + 2);
    expect(moduleMaps(mod, { flow: false }).overview()).not.toMatch(/One-way \(/);
  });
});
