// Makes each area's shape fit what is in it, once all content is settled
// (stocking, cycles, gestalt roles). Room shape and contents are rolled
// independently, so without this a vampire lord ends up keeping court in a
// 10-ft passage and the final chamber is a closet.
//
//  1. Lairs get chambers. Monsters, NPCs, faction bases, and the final room
//     move out of corridors and 10-ft nooks: the area grows into a chamber
//     (the final room into a hall). Shapes a layout or cycle set on purpose
//     (`_fixedShape`) are kept; a twin is resized with its twins.
//  2. Stray monsters don't sit next door to other monsters. A group with no
//     faction and no role a pattern gave it, sharing a wall with another
//     monster group, trades places with a quiet chamber away from the others
//     (an empty one if possible); if there is none, it stays. So does anyone
//     left in a corridor whose shape the layout keeps.

import { placed } from '../maps/playability.js';

const CHAMBER_SQ_FT = 400;  // 20 × 20 ft

const area = r => (r.roomSize?.width ?? 20) * (r.roomSize?.length ?? 20);
export const isChamber = r => r.roomType !== 'corridor' && area(r) >= CHAMBER_SQ_FT;
const isMonster = r => r?.contentType === 'monster';
const occupied = r => isMonster(r) || r?.contentType === 'npc';
const needsChamber = r => isMonster(r) || r.contentType === 'npc' || !!r._factionBase || !!r.finalRoomDesc;

// Fields that describe the room's contents rather than its shape, its place
// on the map, or the roles laid on it — the ones that move with a monster.
const FIXED_FIELDS = new Set(['roomType', 'roomSize', 'exits', 'verticalExit', 'smell', 'sound', 'furnishing', 'hallway', 'finalRoomDesc']);
const contentFields = r => Object.keys(r).filter(k => !FIXED_FIELDS.has(k) && !k.startsWith('_'));

function swapContents(a, b) {
  const ca = Object.fromEntries(contentFields(a).map(k => [k, a[k]]));
  const cb = Object.fromEntries(contentFields(b).map(k => [k, b[k]]));
  for (const k of Object.keys(ca)) delete a[k];
  for (const k of Object.keys(cb)) delete b[k];
  Object.assign(a, cb);
  Object.assign(b, ca);
}

export function fitRooms({ rooms, map, chamberSize, hallSize, reshape }) {
  // ── 1. Lairs get chambers ─────────────────────────────────────────
  const twins = t => rooms.filter(r => r._twin != null && r._twin === t);
  for (const r of rooms) {
    if (!needsChamber(r) || r._fixedShape) continue;
    const small = !isChamber(r);
    const finalTooSmall = r.finalRoomDesc && area(r) < 900;  // the final room is a hall: 30 × 30 ft or more
    if (!small && !finalTooSmall) continue;
    const roomType = r.roomType === 'cavern' ? 'cavern' : 'room';
    const size = r.finalRoomDesc ? hallSize(roomType) : chamberSize(roomType);
    for (const t of r._twin != null ? twins(r._twin) : [r]) reshape(t, roomType, size);
  }

  // ── 2. Unaffiliated monsters move away from other monsters ─────────
  const byId = new Map([...map.nodes.values()].map(n => [n.id, n.roomNumber]));
  const byNum = new Map(rooms.map(r => [r._roomNumber, r]));
  const neighbours = new Map(rooms.map(r => [r, []]));
  for (const e of map.edges) {
    const a = byNum.get(byId.get(e.fromId)), b = byNum.get(byId.get(e.toId));
    if (a && b) { neighbours.get(a).push(b); neighbours.get(b).push(a); }
  }
  const stray = r => isMonster(r) && !r.faction && !placed(r);
  const crowded = r => neighbours.get(r).some(isMonster);
  // A quiet chamber: nothing living in it or next door, and no role to keep.
  const moveToQuiet = r => {
    // A faction's own stay on its ground.
    const quiet = rooms.filter(t => t !== r && isChamber(t) && !placed(t) && !occupied(t) && !t._twin
      && (!r.faction || t._territory === r.faction.name)
      && !neighbours.get(t).some(n => n !== r && isMonster(n)));
    const empty = quiet.filter(t => t.contentType === 'empty');
    const to = empty.length ? empty : quiet;
    if (to.length) swapContents(r, to[Math.floor(Math.random() * to.length)]);
  };
  for (const r of rooms) {
    // Still in a corridor the layout wants kept (so step 1 couldn't grow it).
    if (occupied(r) && !isChamber(r) && !placed(r)) moveToQuiet(r);
    else if (stray(r) && crowded(r)) moveToQuiet(r);
  }
}
