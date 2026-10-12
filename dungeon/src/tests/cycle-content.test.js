import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateModule, DIR_OFFSETS, OPPOSITE_DIR } from '../dungeons/generator.js';
import { DOLMENWOOD_CONFIG } from '../dungeons/dolmenwood-generator.js';
import { buildFloorPlan } from '../maps/floorplan.js';
import { renderHandDrawnMap } from '../maps/render-handdrawn.js';
import { MonsterDB } from '../monsters.js';
import { initMonsterDB } from '../monsterStore.js';
import { formatBrief } from '../../../cli/format-brief.js';
import { flowBlock } from '../../../cli/polish.js';

beforeAll(() => {
  const root = resolve(__dirname, '../../..');
  const all = ['core', 'dolmenwood', 'dolmenwood-animals'].flatMap(name =>
    JSON.parse(readFileSync(resolve(root, 'public/data', `${name}.json`), 'utf8')));
  initMonsterDB(new MonsterDB(all));
});

const modules = [];
const sample = () => {
  if (!modules.length) {
    for (let i = 0; i < 24; i++) modules.push(generateModule(1 + (i % 5), { ...(i % 2 ? DOLMENWOOD_CONFIG : {}), layout: 'cyclic' }));
  }
  return modules;
};
const notes = (r, role) => (r._gestalt ?? []).filter(x => x.role === role);

describe('cyclic modules', () => {
  it('build from cycles instead of a spatial gestalt, at the planned size', () => {
    for (const { dungeon: d, rooms } of sample()) {
      expect(d.gestalts.some(g => g.category === 'spatial')).toBe(false);
      expect(d.cycleFlow.nodes).toHaveLength(d.rooms);
      expect(rooms.filter(r => r._flowRef != null)).toHaveLength(d.rooms);
      expect(rooms.map(r => r._roomNumber).sort((a, b) => a - b)).toEqual(rooms.map((_, k) => k + 1));
    }
  });

  it('never puts a key behind its own lock', () => {
    // Zone cycles too (a gestalt layout with cycles inside its zones).
    const zoned = Array.from({ length: 12 }, (_, i) => generateModule(1 + (i % 5), { size: 'Large' }));
    for (const { dungeon: d, rooms, map } of [...sample(), ...zoned]) {
      const byNum = new Map(rooms.map(r => [r._roomNumber, r]));
      const hardRooms = new Set((d.cycleLocks ?? []).filter(l => l.hard).map(l => byNum.get(l.room)?._mapId));
      // Only a hard lock's own door bars the way; any other locked door can be picked or forced.
      const gate = e => !!e.byLock;
      const opened = new Set();
      const start = rooms.find(r => r._isEntrance)._mapId;
      let seen;
      for (let changed = true; changed;) {
        seen = new Set([start]);
        const queue = [start];
        while (queue.length) {
          const n = queue.shift();
          for (const e of map.edges) {
            const m = e.fromId === n ? e.toId : e.toId === n ? e.fromId : null;
            if (m == null || seen.has(m)) continue;
            if (gate(e) && !opened.has(e.fromId) && !opened.has(e.toId)) continue;
            seen.add(m); queue.push(m);
          }
        }
        changed = false;
        for (const l of (d.cycleLocks ?? []).filter(x => x.hard)) {
          const lockId = byNum.get(l.room)?._mapId;
          if (!opened.has(lockId) && l.keys.every(k => seen.has(byNum.get(k.room)?._mapId))) { opened.add(lockId); changed = true; }
        }
      }
      for (const l of d.cycleLocks ?? []) {
        for (const k of l.keys) expect(seen.has(byNum.get(k.room)?._mapId), `key for Room ${l.room} in Room ${k.room}`).toBe(true);
        // A key room is never behind a rolled locked door.
        const keyId = byNum.get(l.keys[0].room)?._mapId;
        for (const e of map.edges.filter(x => x.fromId === keyId || x.toId === keyId)) {
          if (/locked|sealed/.test(e.exitType ?? '')) expect(gate(e)).toBe(true);
        }
        // A soft lock holds only what it guards.
        if (!l.hard) expect(byNum.get(l.room)._gestalt.find(g => /SOFT LOCK/.test(g.note)).note).toMatch(/It fills only .* The rest of the room is clear/);
      }
    }
  });

  it('ties every lock and its keys together by room number', () => {
    for (const { dungeon: d, rooms } of sample()) {
      const at = n => rooms.find(r => r._roomNumber === n);
      for (const l of d.cycleLocks ?? []) {
        const lockRoom = at(l.room);
        expect([...notes(lockRoom, 'lock'), ...notes(lockRoom, 'lock-feature')].length).toBeGreaterThan(0);
        expect(new Set(l.keys.map(k => k.item)).size).toBe(l.keys.length);  // keys are different things
        for (const k of l.keys) {
          expect(lockRoom._gestalt.map(x => x.note).join(' ')).toContain(`(Room ${k.room})`);
          const keyNote = notes(at(k.room), 'key')[0];
          expect(keyNote.note).toContain(`Room ${l.room}`);
        }
      }
    }
  });

  it('closes the way on behind hard locks, and stocks soft locks with real danger', () => {
    for (const { dungeon: d, rooms, map } of sample()) {
      for (const lock of d.cycleFlow.locks) {
        const r = rooms.find(x => x._flowRef?.flow === 0 && x._flowRef.node === lock.node);
        if (!lock.hard && r && !r.finalRoomDesc && !r._isEntrance) {
          expect(['monster', 'trap', 'hazard']).toContain(r.contentType);
        }
      }
      // Any locked/sealed passage has that type on both sides.
      for (const r of rooms) {
        const node = map.nodes.get(r._mapId);
        for (const ex of r.exits.filter(e => /locked door|sealed door/.test(e.type))) {
          const [dx, dy] = DIR_OFFSETS[ex.direction];
          const nb = [...map.nodes.values()].find(n => n.x === node.x + dx && n.y === node.y + dy);
          expect(nb.room.exits.find(e => e.direction === OPPOSITE_DIR[ex.direction]).type).toBe(ex.type);
        }
      }
    }
  });

  it('turns false goals into traps and keeps cycle monsters out of faction garrisons', () => {
    for (const { rooms } of sample()) {
      for (const r of rooms.filter(x => notes(x, 'false goal').length)) expect(r.contentType).toBe('trap');
      for (const r of rooms.filter(x => x._cycleHold && x.contentType === 'monster')) expect(r.faction ?? null).toBeNull();
    }
  });

  it('sends a patrol monster round its loop, and onto the wandering table', () => {
    for (let i = 0; i < 6; i++) {
      const { dungeon: d, rooms } = generateModule(2, { layout: 'cyclic', cycle: 'monster-patrol' });
      expect(d.cycleFlow.cycles[0].type).toBe('monster-patrol');
      expect(d.cyclePatrols.length).toBeGreaterThan(0);
      const p = d.cyclePatrols[0];
      expect(d.wanderingTable.find(r => r.roll === 6).entry).toContain(p.name);
      for (const n of p.rooms) expect(notes(rooms.find(r => r._roomNumber === n), 'patrol').length).toBeGreaterThan(0);
    }
  });

  it('tells the flow with room numbers in the brief', () => {
    for (const mod of sample().slice(0, 8)) {
      const block = flowBlock(formatBrief(mod));
      expect(block).toMatch(/^## HOW THE DUNGEON FLOWS/);
      expect(block).toMatch(/\(Rooms \d+ → \d+\)/);
      expect(block).not.toMatch(/undefined|null|NaN/);
      if (mod.dungeon.cycleLocks.length) expect(block).toContain('LOCKS AND KEYS');
    }
  });

  it('draws as a normal map, with one-way passages marked', () => {
    for (const mod of sample().slice(0, 10)) {
      const svg = renderHandDrawnMap(buildFloorPlan(mod));
      expect(svg).not.toMatch(/NaN|undefined/);
      const oneWays = mod.dungeon.cycleFlow.edges.filter(e => e.kind === 'oneway').length;
      expect(mod.rooms.flatMap(r => r.exits).filter(e => /cannot be passed from this side|the hard way back/.test(e.type))).toHaveLength(oneWays);
    }
  });
});
