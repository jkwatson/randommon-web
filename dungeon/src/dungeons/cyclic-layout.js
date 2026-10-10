// Embeds a cyclic flow graph (cycles.js) on the layout grid, producing an
// ordinary layout Plan (layouts.js) — so floor plans, maps, gestalt roles,
// and change systems all work on cyclic dungeons unchanged.
//
// Every passage in the flow must join grid-neighbouring cells (8-way), loops
// must close on the grid, and no two diagonal passages may cross inside one
// 2×2 block. embedFlow() finds such a placement by depth-first backtracking:
// a room may only go next to all of its placed neighbours, and if it is k
// steps (through unplaced rooms) from a placed room, it must land within k
// cells of it — the lookahead that lets long arcs bend back and close.

import { Plan } from './layouts.js';
import { generateFlow } from './cycles.js';

const K = (x, y) => `${x},${y}`;
const ADJ8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

// Place every flow node on a grid cell. Options:
//   allowed(x, y) — restrict cells (e.g. to a gestalt zone's box)
//   fixed         — { nodeId: [x, y] } pre-placed nodes (e.g. a zone's port)
//   blocked       — Set of "x,y" cells already taken by other rooms
// Returns Map(nodeId → [x, y]), or null if no placement was found.
export function embedFlow(flow, { rand = Math.random, allowed = () => true, fixed = {}, blocked = new Set(), budget = 20000, restarts = 12 } = {}) {
  const n = flow.nodes.length;
  const nbrs = Array.from({ length: n }, () => new Set());
  const edgeSet = new Set();
  for (const e of flow.edges) {
    if (e.kind === 'sightline') continue;
    nbrs[e.a].add(e.b); nbrs[e.b].add(e.a);
    edgeSet.add(`${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`);
  }
  const linked = (a, b) => edgeSet.has(`${Math.min(a, b)}-${Math.max(a, b)}`);
  const sight = flow.edges.filter(e => e.kind === 'sightline');

  // Depth-first order from the entrance (or the fixed nodes), so placement
  // walks around each cycle's arcs instead of fanning out.
  const order = [];
  const seen = new Set();
  const visit = id => {
    if (seen.has(id)) return;
    seen.add(id); order.push(id);
    for (const m of [...nbrs[id]].sort((a, b) => a - b)) visit(m);
  };
  for (const id of Object.keys(fixed).map(Number)) visit(id);
  visit(flow.entrance ?? 0);
  for (let i = 0; i < n; i++) visit(i);

  for (let attempt = 0; attempt < restarts; attempt++) {
    const pos = new Map(Object.entries(fixed).map(([k, v]) => [Number(k), v]));
    const at = new Map([...pos].map(([id, p]) => [K(...p), id]));
    let steps = 0;

    // Rooms within reach: for each placed room w connected to `id` by a path
    // of unplaced rooms of length k, the cell for `id` must be within k of w.
    const reach = id => {
      const out = [];
      const dist = new Map([[id, 0]]);
      const q = [id];
      while (q.length) {
        const c = q.shift();
        for (const m of nbrs[c]) {
          if (dist.has(m)) continue;
          dist.set(m, dist.get(c) + 1);
          if (pos.has(m)) out.push([m, dist.get(m)]);
          else q.push(m);
        }
      }
      return out;
    };

    const crosses = (cell, other) => {
      // A diagonal passage cell–other crosses the opposite diagonal of its 2×2 block.
      if (cell[0] === other[0] || cell[1] === other[1]) return false;
      const p = at.get(K(cell[0], other[1])), q = at.get(K(other[0], cell[1]));
      return p != null && q != null && linked(p, q);
    };

    const place = i => {
      if (i === order.length) return true;
      if (++steps > budget) return false;
      const id = order[i];
      if (pos.has(id)) return place(i + 1);
      const placed = [...nbrs[id]].filter(m => pos.has(m));
      const constraints = reach(id);
      // Candidate cells: next to every placed neighbour.
      const seeds = placed.length ? placed : [...pos.keys()];
      const cands = new Map();
      for (const s of seeds.length ? seeds : [null]) {
        const base = s == null ? [0, 0] : pos.get(s);
        for (const [dx, dy] of s == null ? [[0, 0]] : ADJ8) {
          const c = [base[0] + dx, base[1] + dy];
          const k = K(...c);
          if (cands.has(k) || at.has(k) || blocked.has(k) || !allowed(...c)) continue;
          if (placed.some(m => cheb(c, pos.get(m)) !== 1)) continue;
          if (placed.some(m => crosses(c, pos.get(m)))) continue;
          if (constraints.some(([w, d]) => cheb(c, pos.get(w)) > d)) continue;
          cands.set(k, c);
        }
      }
      if (!cands.size) return false;
      const centroid = [...pos.values()].reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]).map(v => v / Math.max(1, pos.size));
      const scored = [...cands.values()].map(c => {
        let s = rand() * 1.2;
        for (const m of placed) { const p = pos.get(m); if (p[0] === c[0] || p[1] === c[1]) s += 1.5; }   // straight passages
        s -= 0.15 * Math.hypot(c[0] - centroid[0], c[1] - centroid[1]);                                    // compact
        for (const [w, d] of constraints) s -= 0.3 * Math.max(0, cheb(c, pos.get(w)) - (d - 1));           // keep loops closable
        for (const e of sight) {                                                                          // sight lines close together
          const other = e.a === id ? e.b : e.b === id ? e.a : null;
          if (other != null && pos.has(other)) s += cheb(c, pos.get(other)) <= 2 ? 2 : -0.5;
        }
        // Free neighbouring cells, for the rooms still to come.
        s += 0.12 * ADJ8.filter(([dx, dy]) => !at.has(K(c[0] + dx, c[1] + dy))).length;
        return { c, s };
      }).sort((a, b) => b.s - a.s);
      for (const { c } of scored) {
        pos.set(id, c); at.set(K(...c), id);
        if (place(i + 1)) return true;
        pos.delete(id); at.delete(K(...c));
        if (steps > budget) return false;
      }
      return false;
    };

    if (place(0)) return pos;
  }
  return null;
}

// Short exit types for one-way passages, by the flow's barrier text.
function oneWayType(barrier = '') {
  const b = barrier.toLowerCase();
  if (b.includes('dropping stone') || b.includes('wall of force')) return 'one-way: a stone block that drops behind';
  if (b.includes('one-way trap') || b.includes('chute') || b.includes('pit')) return 'one-way: a chute too steep to climb back';
  if (b.includes('portal') && !b.includes('door')) return 'one-way: a portal that works one way';
  if (b.includes('very dangerous')) return 'one-way: a way back that something deadly now guards';
  return 'one-way: a door that opens only from the far side';
}

// The role a room is known by on the map, among its flow roles.
const ROLE_ORDER = ['goal', 'true-goal', 'false-goal', 'lock', 'key', 'reward', 'valuable', 'danger', 'altered', 'patrolled', 'theme', 'secret-cache', 'side'];
const primaryRole = roles => ROLE_ORDER.find(r => roles.includes(r)) ?? null;

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

// Zones: the overall cycle's rooms are "the main way"; each top-level
// sub-cycle (and everything nested in it) is a wing.
function zonesOf(flow) {
  const top = new Map();
  let k = 0;
  for (const c of flow.cycles) {
    if (c.depth === 1) top.set(c.id, `the ${ORDINAL[k++] ?? `${k}th`} wing`);
  }
  const ancestor = id => {
    let c = flow.cycles[id];
    while (c && c.depth > 1) c = flow.cycles[c.parent];
    return c;
  };
  return flow.nodes.map(node => {
    const c = ancestor(node.cycle);
    return c && c.depth === 1 ? top.get(c.id) : 'the main way';
  });
}

// Turn an embedded flow into a layout Plan.
export function flowToPlan(flow, pos, rand = Math.random) {
  const p = new Plan(rand);
  const key = id => K(...pos.get(id));
  const zones = zonesOf(flow);
  for (const node of flow.nodes) {
    const [x, y] = pos.get(node.id);
    p.add(x, y, { zone: zones[node.id], role: primaryRole(node.roles), flowRoles: node.roles, flowNode: node.id, ...(node.lock != null ? { lock: node.lock } : {}), ...(node.key != null ? { key: node.key } : {}) });
  }
  for (const e of flow.edges) {
    if (e.kind === 'sightline') continue;
    const props = e.kind === 'secret' ? { type: 'secret door' }
      : e.kind === 'oneway' ? { type: oneWayType(e.barrier), oneWay: true }
      : {};
    p.link(key(e.a), key(e.b), props);
  }
  p.entrance = key(flow.entrance);
  p.final = key(flow.goal);
  p.flow = flow;
  p.zones['the main way'] = 'the dungeon\'s overall loop, from the entrance to its heart';
  for (const z of new Set(zones)) if (z !== 'the main way') p.zones[z] = 'a wing built around its own loop of rooms';
  // Sight lines are seen, not walked: a note on each end.
  for (const e of flow.edges.filter(x => x.kind === 'sightline')) {
    p.note(key(e.a), 'sight line', `@{${key(e.b)}} is visible from here — through a grate, across a gap — but there is no way through from this side.`);
  }
  return p;
}

// A whole dungeon from cycles: generate a flow of `rooms` rooms and embed it.
// Retries with fresh flows if a placement isn't found.
export function buildCyclicLayout(rooms, rand = Math.random, opts = {}) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const flow = generateFlow({ rooms, rand, ...opts });
    const pos = embedFlow(flow, { rand });
    if (pos) return flowToPlan(flow, pos, rand);
  }
  throw new Error(`buildCyclicLayout: could not embed a ${rooms}-room cyclic dungeon`);
}
