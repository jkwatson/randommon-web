// Cyclic dungeon generation (Sersa Victory's tabletop adaptation of Joris
// Dormans's algorithm from Unexplored; see temp/cyclic-dungeon-generation.md).
//
// A dungeon's flow is built from nested cycles: loops of rooms between a
// start and a goal, each designed for a particular flow of play (lock and
// key, hidden shortcut, foreshadowing loop…). An overall cycle is rolled;
// its ♦ insertion points are replaced by rolled sub-cycles, recursively,
// until the room budget is spent; plain side rooms make up the remainder.
//
// generateFlow() returns a typed flow graph — rooms with roles, edges of
// kind open / secret / oneway / sightline, locks tied to their keys, and the
// cycle tree — with no geometry. Embedding it on a map is a separate step.

// ── Tables ────────────────────────────────────────────────────────

// d6: what a "lock" and its "key" are. Hard locks admit no way past without
// the key; soft locks can be braved at great risk.
export const LOCK_TYPES = [
  { roll: 1, hard: true,  lock: 'a locked door',                          key: 'its key' },
  { roll: 2, hard: true,  lock: 'a pedestal, altar, mechanism, or NPC',    key: 'the item it needs' },
  { roll: 3, hard: true,  lock: 'an impassable hazard or magical effect',  key: 'the means to pass or dispel it' },
  { roll: 4, hard: false, lock: 'a powerful (but passable) monster',       key: 'the means to slay or evade it' },
  { roll: 5, hard: false, lock: 'a lethal (but passable) trap',            key: 'the means to disable or evade it' },
  { roll: 6, hard: false, lock: 'a perilous (but passable) hazard',        key: 'the means to neutralize or evade it' },
];

// d4: what blocks the way back in a blocked retreat.
export const BARRIERS = [
  'a physical or magical barrier that appears behind the party (a dropping stone, a wall of force)',
  'a one-way path (a portal, a gate)',
  'a one-way trap (a pit, a chute, a portal)',
  'a very dangerous (but passable) monster, trap, or hazard that appears behind the party',
];

const THEMES = [
  ['monsters', 'traps'], ['melee', 'magic'], ['corridors', 'caves'],
  ['the living', 'the dead'], ['light', 'darkness'], ['stone', 'water'],
];

const DANGERS = ['a powerful monster', 'a lethal gauntlet of traps', 'a perilous environmental hazard', 'a monster amid traps'];

// ── The twelve cycles ─────────────────────────────────────────────
//
// Each cycle is built by `build(c)`, where `c` is a small builder bound to
// the cycle's start and goal (see instantiate()). Arcs are paths from one
// end to the other: short = 0–1 rooms between, long = 2–3. `c.arc()` returns
// the arc's intermediate rooms so points of interest and insertion points
// (♦) can be marked on them. `min` is the fewest rooms a cycle adds beyond
// its start (which already exists) — used to keep within the room budget.

export const CYCLES = [
  {
    id: 'two-alternative-paths', name: 'Two alternative paths', d12: 1, min: 5,
    summary: c => `Two long ways to ${c.goalName}, one of ${c.data.themes[0]} and one of ${c.data.themes[1]}, equally dangerous and rewarding.`,
    build(c) {
      const themes = c.pick(THEMES);
      c.data.themes = themes;
      const a = c.arc(c.start, c.goal, 'long'), b = c.arc(c.start, c.goal, 'long');
      a.forEach(n => c.tag(n, 'theme', { theme: themes[0] }));
      b.forEach(n => c.tag(n, 'theme', { theme: themes[1] }));
      c.insert(c.middle(a)); c.insert(c.middle(b));
    },
  },
  {
    id: 'two-keys', name: 'Two keys', d12: 2, min: 5,
    summary: c => `Two long ways to ${c.goalName}, which is locked: ${c.lockText}. A key lies midway along each.`,
    build(c) {
      const a = c.arc(c.start, c.goal, 'long'), b = c.arc(c.start, c.goal, 'long');
      const lock = c.lock(c.goal);
      for (const arc of [a, b]) {
        const k = c.middle(arc);
        c.key(k, lock);
        c.insert(k);
      }
    },
  },
  {
    id: 'hidden-shortcut', name: 'Hidden shortcut', d12: 3, min: 3,
    summary: c => `A long, dangerous way to ${c.goalName} — and a secret short way, hidden near the start.`,
    build(c) {
      const long = c.arc(c.start, c.goal, 'long', { danger: true });
      c.arc(c.start, c.goal, 'short', { kind: 'secret' });
      c.insert(long[0]); c.insert(long.at(-1));
    },
  },
  {
    id: 'dangerous-route', name: 'Dangerous route', d12: 4, min: 4,
    summary: c => `A choice: a safer long way to ${c.goalName}, or a short way past ${c.data.danger}.`,
    build(c) {
      c.data.danger = c.pick(DANGERS);
      const long = c.arc(c.start, c.goal, 'long');
      const short = c.arc(c.start, c.goal, 'short', { exact: 1 });
      short.forEach(n => c.tag(n, 'danger', { danger: c.data.danger }));
      c.insert(long[0]); c.insert(long.at(-1));
    },
  },
  {
    id: 'foreshadowing-loop', name: 'Foreshadowing loop', d12: 5, min: 3,
    summary: c => `${cap(c.goalName)} is visible from the start but out of reach; a long way loops around to it.`,
    build(c) {
      const long = c.arc(c.start, c.goal, 'long');
      c.edge(c.start, c.goal, { kind: 'sightline' });
      c.insert(long[0]); c.insert(long.at(-1));
    },
  },
  {
    id: 'lock-and-key', name: 'Lock-and-key cycle', d12: 6, min: 4,
    summary: c => `A short way to ${c.goalName}, locked: ${c.lockText}. A long way on leads to the key, whose room has a one-way exit back to the start.`,
    build(c) {
      c.arc(c.start, c.goal, 'short');
      const lock = c.lock(c.goal);
      // From the goal, the long way to the key, then one-way back to the start.
      const long = c.arc(c.goal, null, 'long');
      const keyRoom = c.room();
      c.edge(long.at(-1), keyRoom);
      c.key(keyRoom, lock);
      c.edge(keyRoom, c.start, { kind: 'oneway', barrier: 'a door or portal that opens only from this side' });
      c.insert(long[0]); c.insert(long.at(-1));
    },
  },
  {
    id: 'blocked-retreat', name: 'Blocked retreat', d12: 7, min: 3,
    summary: c => `A short way to ${c.goalName} — but ${c.data.barrier} cuts off the way back; the only return is a long, dangerous loop to the start.`,
    build(c) {
      c.data.barrier = c.pick(BARRIERS);
      c.edge(c.start, c.goal, { kind: 'oneway', barrier: c.data.barrier });
      const long = c.arc(c.goal, c.start, 'long', { danger: true });
      c.insert(long[0]); c.insert(long.at(-1));
    },
  },
  {
    id: 'monster-patrol', name: 'Monster patrol', d12: 8, min: 2,
    summary: c => `A very powerful monster patrols a tight loop between the start and ${c.goalName}; something valuable lies on its beat.`,
    build(c) {
      const a = c.arc(c.start, c.goal, 'short', { exact: 1 });
      const b = c.arc(c.start, c.goal, 'short', { exact: 1 });
      for (const n of [c.start, ...a, c.goal, ...b]) c.tag(n, 'patrolled');
      c.tag(c.pick([...a, ...b]), 'valuable');
      c.insert(a[0]);
    },
  },
  {
    id: 'altered-return', name: 'Altered return', d12: 9, min: 3,
    summary: c => `A short way to ${c.goalName}; coming back through the start, what waited there has changed for the worse.`,
    build(c) {
      c.arc(c.start, c.goal, 'short', { exact: 1 });
      const long = c.arc(c.start, c.goal, 'long');
      c.tag(c.start, 'altered');
      c.insert(c.middle(long));
    },
  },
  {
    id: 'false-goal', name: 'False goal', d12: 10, min: 4,
    summary: c => `What looks like ${c.goalName} is a trap or trick; the real one lies at the end of a long way on${c.data.secret ? ', behind a secret door' : ''}.`,
    build(c) {
      // The cycle's goal is the true goal; a false one comes first.
      const fake = c.room();
      c.arc(c.start, fake, 'short');
      c.tag(fake, 'false-goal');
      c.data.secret = c.rand() < 1 / 3;
      const long = c.arc(fake, c.goal, 'long', { kind: c.data.secret ? 'secret-first' : 'open' });
      c.tag(c.goal, 'true-goal');
      c.insert(long[0]); c.insert(long.at(-1));
    },
  },
  {
    id: 'simple-lock-and-key', name: 'Simple lock-and-key', d12: 11, min: 2,
    summary: c => `A short way to ${c.goalName}, locked: ${c.lockText}. The key is a short way past it.`,
    build(c) {
      const a = c.arc(c.start, c.goal, 'short', { exact: 1 });
      const lock = c.lock(c.goal);
      const keyRoom = c.room();
      c.edge(c.goal, keyRoom);
      c.key(keyRoom, lock);
      c.insert(a[0]);
    },
  },
  {
    id: 'gambit', name: 'Gambit', d12: 12, min: 3,
    summary: c => `A short way to ${c.goalName}; from there an extra reward is in sight, but ${c.data.danger} guards the way to it.`,
    build(c) {
      c.data.danger = c.pick(DANGERS);
      const a = c.arc(c.start, c.goal, 'short', { exact: 1 });
      const guard = c.room(), reward = c.room();
      c.edge(c.goal, guard); c.edge(guard, reward);
      c.tag(guard, 'danger', { danger: c.data.danger });
      c.tag(reward, 'reward');
      c.edge(c.goal, reward, { kind: 'sightline' });
      c.insert(a[0]);
    },
  },
];

const BY_ID = new Map(CYCLES.map(c => [c.id, c]));
export const getCycle = id => BY_ID.get(id) ?? null;

const cap = s => s[0].toUpperCase() + s.slice(1);

// ── Flow graph ────────────────────────────────────────────────────

class Flow {
  constructor() {
    this.nodes = [];    // { id, roles: Set, cycle, theme?, danger?, lock?, key? }
    this.edges = [];    // { a, b, kind, cycle, barrier?, danger? }  (oneway: a → b)
    this.cycles = [];   // { id, type, name, depth, parent, start, goal, nodes, summary }
    this.locks = [];    // { id, node, keys: [], type, hard, lock, key }
  }
  add(cycle) {
    const n = { id: this.nodes.length, roles: new Set(), cycle };
    this.nodes.push(n);
    return n.id;
  }
  node(id) { return this.nodes[id]; }
}

// Build the cycle `def` between existing node `start` and node `goal`
// (created if null). Returns the insertion-point node ids it marked.
function instantiate(flow, def, start, goal, { depth, parent, rand, goalName }) {
  const id = flow.cycles.length;
  const record = { id, type: def.id, name: def.name, depth, parent, start, goal: null, nodes: [start], data: {}, summary: '' };
  flow.cycles.push(record);
  if (goal == null) goal = flow.add(id);
  record.goal = goal;
  record.nodes.push(goal);
  const inserts = [];
  let lockRecord = null;

  const c = {
    start, goal, data: record.data, rand,
    pick: list => list[Math.floor(rand() * list.length)],
    room() { const n = flow.add(id); record.nodes.push(n); return n; },
    edge(a, b, opts = {}) { flow.edges.push({ a, b, kind: opts.kind ?? 'open', cycle: id, ...(opts.barrier ? { barrier: opts.barrier } : {}) }); },
    // A path of new rooms from `from` to `to` (or ending open if `to` is null).
    arc(from, to, len, opts = {}) {
      const count = opts.exact ?? (len === 'short' ? Math.floor(rand() * 2) : 2 + Math.floor(rand() * 2));
      const rooms = Array.from({ length: count }, () => c.room());
      const chain = [from, ...rooms, ...(to == null ? [] : [to])];
      // A secret arc is entered by a secret door; the rest of it is open.
      const secret = opts.kind === 'secret' || opts.kind === 'secret-first';
      for (let i = 1; i < chain.length; i++) c.edge(chain[i - 1], chain[i], { kind: secret && i === 1 ? 'secret' : 'open' });
      if (opts.danger) rooms.forEach(n => c.tag(n, 'danger', { danger: 'danger along the long way' }));
      // Callers mark points of interest on an arc's rooms; a roomless short
      // arc has none, so give a room-needing caller the arc's far end.
      return rooms.length ? rooms : [to ?? from];
    },
    middle: rooms => rooms[Math.floor((rooms.length - 1) / 2)],
    tag(n, role, extra = {}) { const node = flow.node(n); node.roles.add(role); Object.assign(node, extra); },
    insert(n) { if (n !== start && n !== goal) inserts.push(n); },
    lock(n) {
      const t = c.pick(LOCK_TYPES);
      lockRecord = { id: flow.locks.length, node: n, keys: [], type: t.roll, hard: t.hard, lock: t.lock, key: t.key, cycle: id };
      flow.locks.push(lockRecord);
      c.tag(n, 'lock', { lock: lockRecord.id });
      return lockRecord;
    },
    key(n, lock) {
      lock.keys.push(n);
      c.tag(n, 'key', { key: lock.id });
    },
  };
  def.build(c);
  record.summary = def.summary({ ...c, goalName: goalName ?? 'the goal', lockText: lockRecord ? `${lockRecord.lock} (${lockRecord.hard ? 'hard' : 'soft'} lock)` : '' });
  return [...new Set(inserts)];
}

// Replace insertion node `x` with a sub-cycle: `x` becomes its start, a new
// node becomes its goal, and whatever `x` carried onward — its parent-arc
// edges beyond it, and any key or lock role — moves to that goal.
function expand(flow, x, def, opts) {
  const parentCycle = flow.node(x).cycle;
  // Edges from x that continue along the parent arc (away from where the arc came in).
  const onward = flow.edges.filter(e => e.cycle === parentCycle && e.a === x && e.kind !== 'sightline');
  const node = flow.node(x);
  const carried = { roles: [...node.roles].filter(r => r === 'key'), key: node.key };
  const before = flow.nodes.length;
  const inserts = instantiate(flow, def, x, null, { ...opts, goalName: carried.roles.includes('key') ? 'the key' : 'its goal' });
  const goal = flow.cycles.at(-1).goal;
  for (const e of onward) e.a = goal;
  if (carried.roles.includes('key')) {
    node.roles.delete('key');
    const lock = flow.locks[carried.key];
    lock.keys = lock.keys.map(k => (k === x ? goal : k));
    flow.node(goal).roles.add('key');
    flow.node(goal).key = carried.key;
    delete node.key;
  }
  return { inserts, added: flow.nodes.length - before };
}

// Generate a flow graph of exactly `rooms` rooms.
//   overall — force the overall cycle (id); otherwise rolled
//   cycles  — restrict rolled cycles to these ids
export function generateFlow(opts = {}) {
  // An overall cycle rolled at its longest can outgrow a tiny budget; roll again.
  for (let attempt = 0; attempt < 30; attempt++) {
    const flow = attemptFlow(opts);
    if (flow) return flow;
  }
  throw new Error(`generateFlow: no flow fits ${opts.rooms} rooms`);
}

function attemptFlow({ rooms = 12, rand = Math.random, overall = null, cycles = null, maxDepth = 3 } = {}) {
  const pool = (cycles ?? CYCLES.map(c => c.id)).map(getCycle).filter(Boolean);
  const pick = list => list[Math.floor(rand() * list.length)];
  const flow = new Flow();
  const entrance = flow.add(0);
  flow.node(entrance).roles.add('entrance');

  // The overall cycle: forced, or rolled among those that fit the budget.
  const fits = d => d.min + 1 <= rooms;
  const overallDef = getCycle(overall) ?? pick(pool.filter(fits).length ? pool.filter(fits) : pool);
  let slots = instantiate(flow, overallDef, entrance, null, { depth: 0, parent: null, rand, goalName: 'the heart of the dungeon' });
  flow.node(flow.cycles[0].goal).roles.add('goal');
  if (flow.nodes.length > rooms) return null;

  // Sub-cycles at insertion points, breadth-first, while they fit.
  const used = new Set([overallDef.id]);
  const queue = slots.map(n => ({ n, depth: 1 }));
  while (queue.length) {
    const { n, depth } = queue.shift();
    const remaining = rooms - flow.nodes.length;
    if (depth > maxDepth || remaining < 2) continue;
    // Prefer cycles not used yet ("re-roll duplicates"), within budget.
    const fitting = pool.filter(d => d.min <= remaining);
    if (!fitting.length) continue;
    const fresh = fitting.filter(d => !used.has(d.id));
    const def = pick(fresh.length ? fresh : fitting);
    // A cycle's maximum size can overshoot; try, and undo if it does.
    const snapshot = JSON.stringify(serialize(flow));
    const { inserts } = expand(flow, n, def, { depth, parent: flow.node(n).cycle, rand });
    if (flow.nodes.length > rooms) { restore(flow, JSON.parse(snapshot)); continue; }
    used.add(def.id);
    queue.push(...inserts.map(m => ({ n: m, depth: depth + 1 })));
  }

  // Keys hidden in a secret cache off their room (1-in-4), budget allowing.
  for (const lock of flow.locks) {
    for (let i = 0; i < lock.keys.length; i++) {
      if (flow.nodes.length >= rooms || rand() >= 0.25) continue;
      const room = lock.keys[i];
      const cache = flow.add(flow.node(room).cycle);
      flow.edges.push({ a: room, b: cache, kind: 'secret', cycle: flow.node(room).cycle });
      flow.node(room).roles.delete('key');
      delete flow.node(room).key;
      flow.node(cache).roles.add('key').add('secret-cache');
      flow.node(cache).key = lock.id;
      lock.keys[i] = cache;
    }
  }

  // Side rooms make up the rest: dead ends off rooms with no special role.
  const plain = () => flow.nodes.filter(n => !n.roles.has('secret-cache'));
  while (flow.nodes.length < rooms) {
    const host = pick(plain());
    const side = flow.add(host.cycle);
    flow.node(side).roles.add('side');
    flow.edges.push({ a: host.id, b: side, kind: 'open', cycle: host.cycle });
  }

  return serialize(flow);
}

function serialize(flow) {
  return {
    nodes: flow.nodes.map(n => ({ ...n, roles: [...n.roles] })),
    edges: flow.edges.map(e => ({ ...e })),
    cycles: flow.cycles.map(({ data, ...c }) => ({ ...c, nodes: [...c.nodes] })),
    locks: flow.locks.map(l => ({ ...l, keys: [...l.keys] })),
    entrance: 0,
    goal: flow.cycles[0]?.goal ?? null,
  };
}

function restore(flow, snap) {
  flow.nodes = snap.nodes.map(n => ({ ...n, roles: new Set(n.roles) }));
  flow.edges = snap.edges;
  flow.cycles = snap.cycles.map(c => ({ ...c, data: {} }));
  flow.locks = snap.locks;
}

// ── Reading a flow ────────────────────────────────────────────────

// Rooms reachable from `from`, walking edges as the party can: open and
// secret both ways, one-way only forward, sight lines never.
export function reachable(flow, from = flow.entrance) {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const n = q.shift();
    for (const e of flow.edges) {
      if (e.kind === 'sightline') continue;
      const next = e.a === n ? e.b : e.kind !== 'oneway' && e.b === n ? e.a : null;
      if (next != null && !seen.has(next)) { seen.add(next); q.push(next); }
    }
  }
  return seen;
}

// The flow, told as a short story: one line per cycle, nested like the tree.
export function narrateFlow(flow) {
  return flow.cycles.map(c => `${'  '.repeat(c.depth)}- ${c.name}: ${c.summary}`).join('\n');
}
