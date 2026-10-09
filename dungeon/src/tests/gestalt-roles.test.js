import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { RELATIONAL_GESTALTS } from '../dungeons/gestalts.js';
import { generateModule } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { displayName, poss } from '../dungeons/gestalt-roles.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { formatBrief } from '../../../cli/format-brief.js';
import { keyNpcBlock, changesBlock } from '../../../cli/polish.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

const gen = (relational, i = 0, spatial = 'hub-and-spokes') => generateModule(1 + (i % 5), {
  ...(i % 2 ? DOLMENWOOD_CONFIG : {}),
  gestalts: [spatial, relational],
});

const roomsWithRole = (rooms, role) => rooms.filter(r => r._gestalt?.some(x => x.role === role));

describe('helpers', () => {
  it('formats names and possessives', () => {
    expect(displayName('ORC, CHIEFTAIN')).toBe('orc chieftain');
    expect(poss('court of wights')).toBe("court of wights'");
    expect(poss('goblin warband')).toBe("goblin warband's");
  });
});

describe('bases and territories (every module)', () => {
  it('spreads one base per faction away from the entrance and final room, with disjoint territories', () => {
    for (let i = 0; i < 30; i++) {
      const { dungeon: d, rooms } = generateModule(2, i % 2 ? DOLMENWOOD_CONFIG : {});
      const bases = rooms.filter(r => r._factionBase);
      expect(bases).toHaveLength(d.factions.length);
      for (const b of bases) {
        expect(b._isEntrance).toBeFalsy();
        expect(b.finalRoomDesc).toBeFalsy();
        // A base holds its own faction, never a stray monster wearing its name.
        expect(b.faction?.name).toBe(b._factionBase.name);
        expect(b._territory).toBe(b._factionBase.name);
      }
      const claimed = d.factions.flatMap(f => f.territory);
      expect(new Set(claimed).size).toBe(claimed.length);
      const entrance = rooms.find(r => r._isEntrance);
      const final = rooms.find(r => r.finalRoomDesc);
      expect(entrance._territory).toBeNull();
      expect(final?._territory ?? null).toBeNull();
    }
  });

  it('never leaves a monster room without a stat block', () => {
    for (let i = 0; i < 30; i++) {
      const { rooms } = generateModule(1 + (i % 5), i % 2 ? DOLMENWOOD_CONFIG : {});
      for (const r of rooms.filter(r => r.contentType === 'monster' && !r.isBeast)) {
        expect(r.monster?.statblock, `room ${r._roomNumber}`).toBeTruthy();
      }
    }
  });

  it('lists territories and roles in the brief', () => {
    const mod = gen('host-and-intruder');
    const brief = formatBrief(mod);
    expect(brief).toMatch(/Territory: Rooms \d/);
    expect(brief).toMatch(/GESTALT — Host and Intruder \[breach\]/);
    expect(brief).toMatch(/Key rooms: .*breach → Room \d+/);
  });
});

describe('canonical Key NPC stat blocks', () => {
  it('appear once in their own brief section and verbatim in each base room', () => {
    for (let i = 0; i < 10; i++) {
      const mod = gen('host-and-intruder', i);
      const brief = formatBrief(mod);
      const block = keyNpcBlock(brief);
      expect(block).toMatch(/^## KEY NPC STAT BLOCKS\n/);
      expect(block).not.toMatch(/\n## /);
      for (const f of mod.dungeon.factions) {
        expect(block).toContain(`- ${f.npcName} (${f.name}`);
        expect(block).toContain(f.npcStatblock);
        const base = mod.rooms.find(r => r._factionBase?.name === f.name);
        const section = brief.split(/^--- /m).find(x => x.startsWith(`Room ${base._roomNumber} `));
        expect(section).toContain(`Key NPC stat block (copy exactly): ${f.npcName} — ${f.npcStatblock}`);
      }
    }
  });

  it('extracts sections independently of their order', () => {
    const brief = '## A\nx\n\n## KEY NPC STAT BLOCKS\n- Ann (x): AC 12\n\n## HOW THE DUNGEON CHANGES\n- Clock\n\n## Z\nz';
    expect(keyNpcBlock(brief)).toBe('## KEY NPC STAT BLOCKS\n- Ann (x): AC 12\n');
    expect(changesBlock(brief)).toBe('## HOW THE DUNGEON CHANGES\n- Clock\n');
    expect(keyNpcBlock('## A\nx')).toBe('');
  });
});

describe('relational roles', () => {
  for (const g of RELATIONAL_GESTALTS) {
    it(`${g.id}: assigns rooms whose references all exist`, () => {
      for (let i = 0; i < 12; i++) {
        const { dungeon: d, rooms } = gen(g.id, i);
        const gg = d.gestalts.find(x => x.id === g.id);
        expect(gg.rooms?.length, `run ${i}`).toBeGreaterThan(0);
        const nums = new Set(rooms.map(r => r._roomNumber));
        for (const r of rooms) {
          for (const x of r._gestalt ?? []) {
            expect(x.note).not.toMatch(/undefined|null|NaN/);
            for (const m of x.note.matchAll(/Rooms? ([\d, ]+)/g)) {
              for (const n of m[1].split(/,\s*/).filter(Boolean)) expect(nums.has(+n)).toBe(true);
            }
          }
        }
        for (const f of d.factions) expect(f.goal).not.toMatch(/undefined|null/);
      }
    });
  }

  it('contested-territory: the chamber is held by one contender and named in both goals', () => {
    for (let i = 0; i < 10; i++) {
      const { dungeon: d, rooms } = gen('contested-territory', i);
      const g = d.gestalts.find(x => x.id === 'contested-territory');
      const room = rooms.find(r => r._roomNumber === g.cast.contested);
      expect(g.cast.contenders).toContain(room.faction.name);
      for (const name of g.cast.contenders) {
        expect(d.factions.find(f => f.name === name).goal).toContain(`Room ${room._roomNumber}`);
      }
    }
  });

  it('hunter-and-prey: lair, signs, and prey goals point at the hunter', () => {
    for (let i = 0; i < 10; i++) {
      const { dungeon: d, rooms } = gen('hunter-and-prey', i);
      const g = d.gestalts.find(x => x.id === 'hunter-and-prey');
      const lair = rooms.find(r => r._roomNumber === g.cast.lair);
      expect(lair._factionBase).toBeFalsy();
      expect(lair.treasure).toBeTruthy();
      for (const name of g.cast.prey) {
        expect(d.factions.find(f => f.name === name).goal).toContain(displayName(g.cast.hunter.name));
      }
    }
  });

  it('containment: the prison is bound by 2-3 wards and the warden knows the rite', () => {
    for (let i = 0; i < 10; i++) {
      const { dungeon: d, rooms, map: gmap } = gen('containment', i);
      const g = d.gestalts.find(x => x.id === 'containment');
      expect(g.cast.wards.length).toBeGreaterThanOrEqual(2);
      expect(g.cast.wards).not.toContain(g.cast.prison);
      expect(roomsWithRole(rooms, 'ward').map(r => r._roomNumber).sort()).toEqual([...g.cast.wards].sort());
      expect(d.factions.find(f => f.name === g.cast.warden).goal).toMatch(/imprisoned/);
      // The prisoner's stat block travels with its room, not just the GESTALT section.
      const section = formatBrief({ dungeon: d, rooms, map: gmap }).split(/^--- /m).find(x => x.startsWith(`Room ${g.cast.prison} `));
      expect(section).toMatch(/Imprisoned creature stat block: AC/);
    }
  });

  it('host-and-intruder: the breach lies in intruder territory when they have any', () => {
    for (let i = 0; i < 10; i++) {
      const { dungeon: d, rooms } = gen('host-and-intruder', i);
      const g = d.gestalts.find(x => x.id === 'host-and-intruder');
      const intruder = d.factions.find(f => f.name === g.cast.intruder);
      const breach = rooms.find(r => r._roomNumber === g.cast.breach);
      const freeIntruderRooms = intruder.territory.filter(n => n !== rooms.find(r => r._factionBase === intruder)?._roomNumber);
      if (freeIntruderRooms.length) expect(breach._territory).toBe(intruder.name);
    }
  });

  it('warring-factions: border posts are garrisoned by their own faction', () => {
    for (let i = 0; i < 10; i++) {
      const { rooms } = gen('warring-factions', i);
      for (const r of roomsWithRole(rooms, 'border post')) {
        expect(r.faction?.name).toBe(r._territory);
      }
    }
  });

  it('dominant-and-subordinate: the overseer is a dominant-faction garrison', () => {
    for (let i = 0; i < 10; i++) {
      const { dungeon: d, rooms } = gen('dominant-and-subordinate', i);
      const g = d.gestalts.find(x => x.id === 'dominant-and-subordinate');
      for (const r of roomsWithRole(rooms, 'overseer')) expect(r.faction?.name).toBe(g.cast.dominant);
    }
  });
});
