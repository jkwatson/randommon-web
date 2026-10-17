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
  // Two fixed rooms joined by a passage must already be neighbours.
  const fixedIds = Object.keys(fixed).map(Number);
  for (const a of fixedIds) for (const b of fixedIds) {
    if (a < b && linked(a, b) && cheb(fixed[a], fixed[b]) !== 1) return null;
  }
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
  if (b.includes('one-way trap') || b.includes('chute') || b.includes('pit')) return 'one-way: a steep chute';
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

// Put an embedded flow's rooms and passages into a plan. `zone` gives every
// room one zone name (zone fill); otherwise rooms get the flow's own zones
// (the main way and its wings). Existing cells at a flow position (a zone's
// entry rooms) keep their props and gain the flow's.
export function addFlowToPlan(p, flow, pos, { flowIndex = 0, zone = null } = {}) {
  const key = id => K(...pos.get(id));
  const zones = zone ? flow.nodes.map(() => zone) : zonesOf(flow);
  for (const node of flow.nodes) {
    const [x, y] = pos.get(node.id);
    const existing = p.cells.get(K(x, y));
    p.add(x, y, {
      zone: existing?.zone ?? zones[node.id],
      role: existing?.role ?? primaryRole(node.roles),
      flowRoles: node.roles,
      flowRef: { flow: flowIndex, node: node.id },
      ...(node.lock != null ? { lock: node.lock } : {}),
      ...(node.key != null ? { key: node.key } : {}),
    });
  }
  for (const e of flow.edges) {
    if (e.kind === 'sightline') continue;
    const props = e.kind === 'secret' ? { type: 'secret door' }
      : e.kind === 'oneway' ? { type: oneWayType(e.barrier), oneWay: true }
      : {};
    p.link(key(e.a), key(e.b), props);
  }
  // Sight lines are seen, not walked: a note on each end. Only rooms that
  // came out next to each other can see one another; a far one is
  // foreshadowed instead, by what can be found here of it.
  for (const e of flow.edges.filter(x => x.kind === 'sightline')) {
    const [a, b] = [pos.get(e.a), pos.get(e.b)];
    const near = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) <= 1;
    p.note(key(e.a), 'sight line', near
      ? `@{${key(e.b)}} is visible from here — through a grate in the shared wall — but there is no way through from this side.`
      : `@{${key(e.b)}} is foreshadowed here by something the party can find (a map or carving of it, a survivor's scrawl, its sound carried through the rock); it is reached only the long way round.`);
  }
  (p.flows ??= [])[flowIndex] = { flow, zone };
  return zones;
}

// Turn an embedded flow into a layout Plan (a whole cyclic dungeon).
export function flowToPlan(flow, pos, rand = Math.random) {
  const p = new Plan(rand);
  const zones = addFlowToPlan(p, flow, pos);
  p.entrance = K(...pos.get(flow.entrance));
  p.final = K(...pos.get(flow.goal));
  p.flow = flow;
  p.zones['the main way'] = 'the dungeon\'s overall loop, from the entrance to its heart';
  for (const z of new Set(zones)) if (z !== 'the main way') p.zones[z] = 'a wing built around its own loop of rooms';
  return p;
}

// ── Cycles inside gestalt zones ───────────────────────────────────

// Layouts whose zones *are* their pattern: leave them alone.
const KEEP_ZONES = new Set(['symmetry-and-repetition', 'concentric-layers', 'hollow-center', 'landmark-and-loop', 'parallel-paths']);

// Rebuild each suitable zone of a gestalt layout as a cycle flow of the same
// size, embedded in the zone's own region with its entry rooms fixed: one
// entry → the flow's entrance; two → its entrance and its goal (a section
// whose loop leads on to the next). Zones with roles or notes inside, with
// more than two entries, or under 4 rooms keep their layout. Every change
// stays inside the zone, so the layout's own guarantees still hold. (A third
// entry, if any, is pinned to one of the flow's plain rooms.)
export function fillZonesWithCycles(p, layoutId, rand = Math.random, { minRooms = 4, tries = 6 } = {}) {
  if (KEEP_ZONES.has(layoutId)) return 0;
  const P = k => k.split(',').map(Number);
  const referenced = new Set(p.notes.flatMap(n => [n.key, ...[...n.text.matchAll(/@\{([^}]+)\}/g)].map(m => m[1])]));
  const vertical = new Set(p.verticals.flatMap(v => [v.a, v.b]));
  let filled = 0;
  for (const zone of Object.keys(p.zones)) {
    const cells = [...p.cells.keys()].filter(k => p.cells.get(k).zone === zone);
    if (cells.length < minRooms) continue;
    const inZone = new Set(cells);
    const external = new Set();
    for (const e of p.edges) {
      if (inZone.has(e.a) && !inZone.has(e.b)) external.add(e.a);
      if (inZone.has(e.b) && !inZone.has(e.a)) external.add(e.b);
    }
    for (const k of cells) if (vertical.has(k)) external.add(k);
    // The dungeon's entrance and final room are fixed points too.
    const entries = [...new Set([
      ...(inZone.has(p.entrance) ? [p.entrance] : []),
      ...external,
      ...(inZone.has(p.final) ? [p.final] : []),
    ])];
    if (!entries.length || entries.length > 3) continue;
    const inner = cells.filter(k => !entries.includes(k));
    if (inner.some(k => p.cells.get(k).role || referenced.has(k) || vertical.has(k))) continue;

    // The zone's region: its cells' bounding box, minus everything else.
    const xs = cells.map(k => P(k)[0]), ys = cells.map(k => P(k)[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const allowed = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const blocked = new Set([...p.blocked, ...[...p.cells.keys()].filter(k => !inZone.has(k))]);

    for (let t = 0; t < tries; t++) {
      const flow = generateFlow({ rooms: cells.length, rand, maxDepth: 1 });
      const fixed = { [flow.entrance]: P(entries[0]) };
      if (entries[1]) fixed[flow.goal] = P(entries[1]);
      // A third fixed room (a second crossing, say) becomes one of the flow's
      // plain rooms — never a lock, key, or other room with a job.
      if (entries[2]) {
        const spare = flow.nodes.filter(nd => nd.id !== flow.entrance && nd.id !== flow.goal &&
          !nd.roles.some(r => ['lock', 'key', 'false-goal', 'reward', 'valuable', 'secret-cache'].includes(r)));
        if (!spare.length) continue;
        fixed[spare[Math.floor(rand() * spare.length)].id] = P(entries[2]);
      }
      const pos = embedFlow(flow, { rand, allowed, blocked, fixed, budget: 6000, restarts: 4 });
      if (!pos) continue;
      // Swap the zone's rooms for the flow's: drop inner cells and the
      // zone's own passages, keep the entries and their outside links.
      for (const k of inner) p.cells.delete(k);
      p.edges = p.edges.filter(e => !(inZone.has(e.a) && inZone.has(e.b)));
      for (const k of entries) delete p.cells.get(k).flowRef;
      addFlowToPlan(p, flow, pos, { flowIndex: (p.flows ?? []).length, zone });
      filled++;
      break;
    }
  }
  return filled;
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
