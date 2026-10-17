// Turns a cyclic dungeon's flow roles (cycles.js → cyclic-layout.js) into
// room content and notes: locks and their keys from the d6 table, barriers,
// danger arcs, false goals, monster patrols, altered returns, rewards,
// hidden shortcuts, and themed alternative paths. Also tells the flow with
// room numbers for the brief.
//
// Runs in generateModule() after the map is placed and before the gestalt
// roles, marking the rooms it stocks (room._cycleHold) so later passes leave
// them alone.

import { displayName } from './gestalt-roles.js';

const pick = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];
const cap = s => s[0].toUpperCase() + s.slice(1);

// Content fields kept when a room is restocked (its place and atmosphere).
const ATMO_KEYS = new Set(['roomType', 'roomSize', 'exits', 'verticalExit', 'smell', 'sound', 'furnishing', 'hallway', 'finalRoomDesc']);

// ── Lock and key details, by d6 lock type ─────────────────────────

const LITERAL_KEYS = ['a key of black iron on a rotten cord', 'a bronze key with a jeweled bow', 'a long iron key, its teeth shaped like a crown'];
const PAIRED_ITEMS = [
  ['the scepter', 'the crown'], ['the sun-disc', 'the moon-disc'],
  ['the left gauntlet', 'the right gauntlet'], ['the first seal', 'the second seal'],
  ['the silver eye', 'the gold eye'],
];
const FEATURE_LOCKS = [
  ['a pedestal with an empty heart-shaped socket', 'a carved stone heart'],
  ['an altar stripped of its holy relic', 'the relic itself, a saint\'s finger-bone in silver'],
  ['a great mechanism missing one cog', 'a bronze cog stamped with the maker\'s mark'],
  ['a guardian statue holding out an empty hand', 'its stone sword'],
  ['a spirit that bars the way until it is given its grave-token', 'the grave-token it was buried with'],
];
const HAZARD_LOCKS = [
  ['a curtain of green flame filling the archway', 'a ward-rod that parts the flame'],
  ['a shimmering wall of force', 'the counter-word, carved on a tablet'],
  ['a flooded shaft too deep to swim', 'a breathing reed of the old priests'],
  ['a drift of choking, magical darkness', 'a lantern that burns through it'],
  ['webs as hard as wire', 'a jar of dissolving oil'],
];
const MONSTER_MEANS = ['a draught that sends it to sleep', 'a blade it fears, silvered and blessed', 'its true name, scratched on a tablet', 'a bait it cannot resist', 'the command word it was bound to obey'];
const TRAP_MEANS = ['the maker\'s notes, marking the safe stones', 'the lever that locks the mechanism', 'a map of the pressure plates', 'the key to its arming box'];
const HAZARD_MEANS = ['a valve wheel that cuts off the flow', 'fire-salve enough for the party', 'a wind-charm that clears the air', 'planks long enough to bridge it'];

const BAITS = [
  'a gilded chest on a dais, chained to a deadfall',
  'a jeweled crown that is painted copper, watched from the cracks above',
  'an open sarcophagus whose "treasure" is a lure for what nests beneath',
  'a glowing relic that is an illusion over a pit',
];
const ALTERATIONS = [
  'the dead here rise, and they are hungry',
  'the floor gives way into a pit that was not there before',
  'water floods in to waist height',
  'the guardian here wakes, enraged by the theft',
  'the trap rearms, twice as deadly',
  'something has followed the party back and waits here',
];

// Theme → how a themed path's rooms are stocked.
const THEME_STOCK = {
  monsters: { contentType: 'monster' }, traps: { contentType: 'trap' },
  melee: { contentType: 'monster' }, magic: { contentType: 'trick' },
  corridors: { roomType: 'corridor' }, caves: { roomType: 'cavern' },
  'the living': { contentType: 'npc' }, 'the dead': { contentType: 'monster' },
  light: { note: 'lit by guttering braziers that never go out' }, darkness: { note: 'unnaturally dark — light sources dim to half range' },
  stone: { contentType: 'obstacle' }, water: { contentType: 'hazard' },
};

// One pass per flow: a cyclic dungeon has one; a gestalt layout has one per
// zone filled with cycles.
export function applyCycleContent(ctx) {
  const { d } = ctx;
  d.cycleLocks = [];
  d.cyclePatrols = [];
  d.cycleFlowText = [];
  (d.cycleFlows ?? []).forEach(({ flow, zone }, i) => applyFlow(ctx, flow, i, zone));
}

function flowDistances(flow, from) {
  const dist = { [from]: 0 };
  const queue = [from];
  while (queue.length) {
    const n = queue.shift();
    for (const e of flow.edges) {
      if (e.kind === 'sightline') continue;
      const m = e.a === n ? e.b : e.b === n ? e.a : null;
      if (m != null && dist[m] == null) { dist[m] = dist[n] + 1; queue.push(m); }
    }
  }
  return dist;
}

function applyFlow({ d, rooms, map, partyLevel, stockContent, pickMonster, rollCount, treasureForLevel, resize, rand = Math.random }, flow, flowIndex, zone) {
  const owner = d.cycleLayout;
  const byNode = new Map(rooms.filter(r => r._flowRef?.flow === flowIndex).map(r => [r._flowRef.node, r]));
  const room = id => byNode.get(id);
  const num = id => room(id)?._roomNumber;
  const nums = ids => ids.map(num).filter(Boolean).join(', ');
  const entrance = rooms.find(r => r._isEntrance);
  const finalRoom = rooms.find(r => r.finalRoomDesc);
  const pickR = arr => pick(arr, rand);
  // n different entries (keys to one lock must be different things).
  const distinct = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);

  const mark = (r, cycle, role, note) => {
    if (!r) return;
    (r._gestalt ??= []).push({ pattern: cycle?.name ?? 'Cycles', role, note });
    (owner.rooms ??= []).push({ room: r._roomNumber, role });
  };
  const restock = (r, contentType, opts = {}) => {
    if (!r || r === entrance || r === finalRoom) return false;
    for (const k of Object.keys(r)) if (!k.startsWith('_') && !ATMO_KEYS.has(k)) delete r[k];
    Object.assign(r, { contentType }, stockContent(partyLevel, contentType, { faction: null, ...opts }));
    const node = map.nodes.get(r._mapId);
    if (node) node.contentType = contentType;
    r._cycleHold = true;
    return true;
  };
  const powerful = r => {
    if (!restock(r, 'monster')) return null;
    const m = pickMonster(partyLevel, 2, { uncapped: true });
    if (m) { r.monster = m; r.count = 1; r.activity = 'barring the way'; }
    return m;
  };
  const cycleOf = n => flow.cycles[flow.nodes[n].cycle];
  // A reward worth the risk: the most valuable of several treasure rolls.
  const gp = item => Number(String(item).match(/\(([\d,]+)\s*gp\)/)?.[1]?.replace(/,/g, '') ?? 0);
  const bestTreasure = (level, tries = 4) => Array.from({ length: tries }, () => treasureForLevel(level)).sort((a, b) => gp(b) - gp(a))[0];

  // Set the exit type on both sides of the passage between two rooms.
  const setPassage = (a, b, type) => {
    const na = map.nodes.get(a._mapId), nb = map.nodes.get(b._mapId);
    const e = map.edges.find(x => (x.fromId === na.id && x.toId === nb.id) || (x.fromId === nb.id && x.toId === na.id));
    if (!e) return null;
    e.exitType = type;
    for (const [r, from, to] of [[a, na, nb], [b, nb, na]]) {
      const dir = Object.entries({ North: [0, -1], South: [0, 1], East: [1, 0], West: [-1, 0], Northeast: [1, -1], Northwest: [-1, -1], Southeast: [1, 1], Southwest: [-1, 1] })
        .find(([, [dx, dy]]) => from.x + dx === to.x && from.y + dy === to.y)?.[0];
      const ex = r.exits.find(x => x.direction === dir);
      if (ex) ex.type = type;
    }
    return e;
  };

  // ── Locks and keys ───────────────────────────────────────────────
  const lockMade = new Set();   // passages a hard lock closed
  // Steps from the flow's way in, to tell a lock room's way in from its way on.
  const dist = flowDistances(flow, flow.cycles[0]?.start ?? 0);
  for (const lock of flow.locks) {
    const lockRoom = room(lock.node);
    const keyRooms = lock.keys.map(room).filter(Boolean);
    const cycle = flow.cycles[lock.cycle];
    // The passages on from the lock room into the parent flow, if any — never
    // the way the party arrives (a nested cycle on the way in is not "onward").
    const onward = flow.edges
      .filter(e => (e.a === lock.node || e.b === lock.node) && e.kind !== 'sightline')
      .map(e => (e.a === lock.node ? e.b : e.a))
      .filter(n => flow.nodes[n].cycle !== lock.cycle && !cycle.nodes.includes(n))
      .filter(n => dist[n] !== dist[lock.node] - 1);
    const gates = onward.length
      ? `It bars the way on to Room ${nums(onward)}.`
      : lockRoom === finalRoom ? 'It seals the heart of the dungeon and its prize.' : 'It seals this room\'s prize.';
    // The key is reached from the lock room, so a soft lock (a hazard, trap or
    // monster) holds only what it guards — never the room the key is reached through.
    const where = onward.length ? `the passage on to Room ${nums(onward)}` : 'the alcove holding this room\'s prize';
    const clear = keyRooms.length ? ` The rest of the room is clear, and so is the way to Room ${keyRooms.map(r => r._roomNumber).join(' and ')}.` : '';
    let lockText, keyItems;
    const two = keyRooms.length > 1;
    switch (lock.type) {
      case 1: lockText = 'a heavy iron-bound door with a great lock'; keyItems = two ? pickR(PAIRED_ITEMS).map(k => `${k} (half of the key)`) : [pickR(LITERAL_KEYS)]; break;
      case 2: { const [l, k] = pickR(FEATURE_LOCKS); lockText = l; keyItems = two ? pickR(PAIRED_ITEMS) : [k]; break; }
      case 3: { const [l, k] = pickR(HAZARD_LOCKS); lockText = l; keyItems = two ? [k, /^an? /.test(k) ? k.replace(/^an? /, 'a second ') : `a copy of ${k}`] : [k]; break; }
      case 4: { const m = powerful(lockRoom); lockText = m ? `a ${displayName(m.name)} that is far beyond the party` : 'a monster far beyond the party'; keyItems = distinct(MONSTER_MEANS, keyRooms.length); break; }
      case 5: { restock(lockRoom, 'trap'); lockText = 'a lethal trap'; keyItems = distinct(TRAP_MEANS, keyRooms.length); break; }
      default: { restock(lockRoom, 'hazard'); lockText = 'a perilous hazard'; keyItems = distinct(HAZARD_MEANS, keyRooms.length); break; }
    }
    // Hard locks close the passage on; soft locks are braved, not opened.
    if (lock.hard) for (const n of onward) {
      const e = setPassage(lockRoom, room(n), lock.type === 1 ? 'locked door' : 'sealed door');
      if (e) { e.byLock = true; lockMade.add(e); }
    }
    if (lockRoom) lockRoom._cycleHold = true;
    const keyList = keyRooms.map((r, i) => `${keyItems[i]} (Room ${r._roomNumber})`).join(' and ');
    mark(lockRoom, cycle, lock.type === 2 ? 'lock-feature' : 'lock', `${lock.hard ? 'LOCK' : 'SOFT LOCK'} — ${lockText}. ${gates} ${lock.hard
      ? `It opens only with ${keyList}.`
      : `It fills only ${where}.${clear} It can be braved at great risk; the safe way past needs ${keyList}.`}`);
    // Nothing locks the way to the lock or from it to its key: a rolled locked
    // or sealed door there becomes an ordinary one.
    for (const r of [lockRoom, ...keyRooms].filter(Boolean)) {
      for (const e of map.edges.filter(x => x.fromId === r._mapId || x.toId === r._mapId)) {
        if (!/locked|sealed/.test(e.exitType ?? '') || lockMade.has(e)) continue;
        const other = rooms.find(x => x._mapId === (e.fromId === r._mapId ? e.toId : e.fromId));
        if (other) setPassage(r, other, 'wooden door');
      }
    }
    keyRooms.forEach((r, i) => {
      r._cycleHold = true;
      if (!r.treasure) r.treasure = { item: keyItems[i] };
      mark(r, cycle, 'key', `KEY — ${keyItems[i]}, needed for ${lockText} in Room ${lockRoom?._roomNumber}.${flow.nodes[lock.keys[i]].roles.includes('secret-cache') ? ` Hidden in a secret cache off this room's neighbour.` : ''}`);
    });
    d.cycleLocks.push({ lock: lockText, hard: lock.hard, room: lockRoom?._roomNumber, keys: keyRooms.map((r, i) => ({ room: r._roomNumber, item: keyItems[i] })) });
  }

  // ── Per-cycle features ───────────────────────────────────────────
  for (const c of flow.cycles) {
    const S = room(c.start), G = room(c.goal);
    switch (c.type) {
      case 'hidden-shortcut':
        mark(S, c, 'shortcut', `A secret short way to Room ${G?._roomNumber} starts here (a secret door) — far safer than the long way round.`);
        break;
      case 'foreshadowing-loop':
        mark(G, c, 'foreshadowed', `Foreshadowed in Room ${S?._roomNumber} (seen or learned of there); reached only the long way round.`);
        break;
      case 'blocked-retreat': {
        const e = flow.edges.find(x => x.cycle === c.id && x.kind === 'oneway');
        mark(G, c, 'barrier', `BARRIER — once the party passes from Room ${S?._roomNumber} into this room, the way back closes: ${e?.barrier ?? 'a barrier falls behind them'}. The only return is the long, dangerous way round to Room ${S?._roomNumber}.`);
        break;
      }
      case 'lock-and-key': {
        const e = flow.edges.find(x => x.cycle === c.id && x.kind === 'oneway');
        if (e) mark(room(e.a), c, 'return', `A one-way exit leads straight back to Room ${num(e.b)}: ${e.barrier}.`);
        break;
      }
      case 'altered-return':
        mark(S, c, 'altered', `ALTERED RETURN — when the party comes back through here after reaching Room ${G?._roomNumber}, ${pickR(ALTERATIONS)}.`);
        break;
      case 'monster-patrol': {
        const patrolled = c.nodes.filter(n => flow.nodes[n].roles.includes('patrolled'));
        const m = pickMonster(partyLevel, 2, { uncapped: true });
        const loop = nums(patrolled);
        const period = patrolled.length * 2;
        if (m) d.cyclePatrols.push({ name: m.name, statblock: m.statblock, rooms: patrolled.map(num), period });
        for (const n of patrolled) {
          mark(room(n), c, 'patrol', `PATROL — ${m ? `a ${displayName(m.name)}` : 'a very powerful monster'} walks a loop through Rooms ${loop}, passing through here every ${period} turns. Tracks and gouges mark its beat.`);
        }
        for (const n of c.nodes.filter(x => flow.nodes[x].roles.includes('valuable'))) {
          const r = room(n);
          if (r) { r.treasure = { item: bestTreasure(partyLevel + 1) }; r._cycleHold = true; }
          mark(r, c, 'valuable', `ON THE PATROL'S BEAT — something valuable lies here (${r?.treasure?.item}); taking it means timing the monster's loop.`);
        }
        break;
      }
      case 'false-goal': {
        const F = c.nodes.map(room).find(r => r && flow.nodes[r._flowRef.node].roles.includes('false-goal'));
        if (F && restock(F, 'trap')) {
          mark(F, c, 'false goal', `FALSE GOAL — ${pickR(BAITS)}. It looks like the prize but is a trap; the real one is Room ${G?._roomNumber}.`);
        }
        mark(G, c, 'true goal', `TRUE GOAL — the real prize that the false goal in Room ${F?._roomNumber} imitates.`);
        break;
      }
      case 'gambit': {
        const R = c.nodes.map(room).find(r => r && flow.nodes[r._flowRef.node].roles.includes('reward'));
        const guard = c.nodes.map(room).find(r => r && flow.nodes[r._flowRef.node].roles.includes('danger'));
        if (R) { R.treasure = { item: bestTreasure(partyLevel + 2, 6) }; R._cycleHold = true; }
        mark(R, c, 'reward', `OPTIONAL REWARD — ${R?.treasure?.item}, in plain sight from Room ${G?._roomNumber}; ${guard ? `the way to it runs through Room ${guard._roomNumber}` : 'something guards the way'}.`);
        break;
      }
    }
  }

  // ── Danger and themes, room by room ──────────────────────────────
  for (const node of flow.nodes) {
    const r = room(node.id);
    if (!r || r._cycleHold) continue;
    if (node.roles.includes('danger')) {
      const t = node.danger ?? '';
      if (/monster/.test(t)) powerful(r);
      else if (/trap/.test(t)) restock(r, 'trap');
      else if (/hazard/.test(t)) restock(r, 'hazard');
      else restock(r, pickR(['monster', 'trap', 'hazard']));
      mark(r, cycleOf(node.id), 'danger', `DANGER — ${t || 'the perilous way'}: the short way through is the deadly one.`);
    } else if (node.roles.includes('theme') && node.theme) {
      const how = THEME_STOCK[node.theme] ?? {};
      if (how.contentType) restock(r, how.contentType);
      if (how.roomType && resize) resize(r, how.roomType);
      mark(r, cycleOf(node.id), 'theme', `The way of ${node.theme}${how.note ? `: ${how.note}` : ''}.`);
    }
  }

  // ── The flow, told with room numbers ─────────────────────────────
  if (zone) d.cycleFlowText.push(`In ${zone}:`);
  const indent = zone ? 1 : 0;
  // A zone's flow ends at "the heart of the dungeon" only if its goal is the final room.
  const zoneGoal = zone && room(flow.goal) !== finalRoom;
  for (const c of flow.cycles) {
    const span = `Rooms ${num(c.start)} → ${num(c.goal)}`;
    const summary = zoneGoal && c.depth === 0
      ? c.summary.replace(/(t)he heart of the dungeon/i, (m, t) => `${t}he far end of ${zone}`)
      : c.summary;
    d.cycleFlowText.push(`${'  '.repeat(c.depth + indent)}- ${c.name} (${span}): ${summary}`);
  }
}
