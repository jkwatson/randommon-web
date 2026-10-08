// Spatial gestalts as real map layouts.
//
// Each layout is a pure function (roomCount, rand) → Plan: grid cells with
// zones and roles, the passages between them, vertical links, blocked cells
// (voids, chasms), the entrance, the final room, and room notes. Ordinary
// passages only join grid-adjacent cells (8-neighbourhood) so the map
// renderers can draw them; vertical links may join any two cells.
//
// generateModule() stocks a plan's cells in exploration order. Notes use
// `@{x,y}` placeholders for "Room N" references, resolved after numbering.

const K = (x, y) => `${x},${y}`;
const P = k => k.split(',').map(Number);
const ORTHO = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const ref = k => `@{${k}}`;

export class Plan {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.cells = new Map();      // key → { x, y, zone, role, roomType, content }
    this.edges = [];             // { a, b, type?, oneWay? }  (a → b for one-way)
    this.verticals = [];         // { a, b, form }            (a is above b)
    this.blocked = new Set();    // cells that must stay empty
    this.notes = [];             // { key, role, text }
    this.zones = {};             // zone name → description
    this.entrance = null;
    this.final = null;
    this.meta = {};              // flavor picks (void, barrier, key form…) for rumors and tells
  }

  has(x, y) { return this.cells.has(K(x, y)); }
  free(x, y) { const k = K(x, y); return !this.cells.has(k) && !this.blocked.has(k); }
  add(x, y, props = {}) {
    const k = K(x, y);
    this.cells.set(k, { ...(this.cells.get(k) ?? { x, y }), ...props, x, y });
    return k;
  }
  linked(a, b) { return this.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a)); }
  link(a, b, props = {}) {
    if (a === b || this.linked(a, b)) return;
    const [ax, ay] = P(a), [bx, by] = P(b);
    if (Math.max(Math.abs(ax - bx), Math.abs(ay - by)) !== 1) throw new Error(`Plan: ${a} and ${b} are not adjacent`);
    this.edges.push({ a, b, ...props });
  }
  vertical(a, b, form) { this.verticals.push({ a, b, form }); }
  note(key, role, text) { if (key) this.notes.push({ key, role, text }); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  neighbors(k) {
    const out = [];
    for (const e of this.edges) { if (e.a === k) out.push(e.b); else if (e.b === k) out.push(e.a); }
    for (const v of this.verticals) { if (v.a === k) out.push(v.b); else if (v.b === k) out.push(v.a); }
    return out;
  }
  dist(from) {
    const d = new Map([[from, 0]]);
    const q = [from];
    while (q.length) {
      const c = q.shift();
      for (const n of this.neighbors(c)) if (!d.has(n)) { d.set(n, d.get(c) + 1); q.push(n); }
    }
    return d;
  }
  // Exploration order from the entrance (room numbering), then any stragglers.
  order() {
    const d = this.dist(this.entrance);
    const seen = [...d.keys()];
    return [...seen, ...[...this.cells.keys()].filter(k => !d.has(k))];
  }
  inZone(z) { return [...this.cells.keys()].filter(k => this.cells.get(k).zone === z); }
  farthest(from, keys) {
    const d = this.dist(from);
    return keys.map(k => ({ k, s: (d.get(k) ?? -1) + this.rand() * 0.5 })).sort((a, b) => b.s - a.s)[0]?.k ?? null;
  }

  // Grow `n` new cells off `region` (orthogonally), each linked to one
  // existing region cell. Higher `score` wins; ties broken randomly.
  grow(region, n, { zone, allowed = () => true, score = () => 0, props = {}, linkProps = {} } = {}) {
    region = [...region];
    const added = [];
    for (let i = 0; i < n; i++) {
      const cands = new Map();
      for (const k of region) {
        const [x, y] = P(k);
        for (const [dx, dy] of ORTHO) {
          const nx = x + dx, ny = y + dy;
          if (!this.free(nx, ny) || !allowed(nx, ny)) continue;
          const nk = K(nx, ny);
          if (!cands.has(nk)) cands.set(nk, []);
          cands.get(nk).push(k);
        }
      }
      if (!cands.size) break;
      let best = null, bs = -Infinity;
      for (const nk of cands.keys()) {
        const [nx, ny] = P(nk);
        const s = score(nx, ny) + this.rand() * 1.5;
        if (s > bs) { bs = s; best = nk; }
      }
      const [bx, by] = P(best);
      this.add(bx, by, { zone, ...props });
      this.link(this.pick(cands.get(best)), best, linkProps);
      region.push(best);
      added.push(best);
    }
    return added;
  }

  // Route a corridor of new cells from `region` to the existing cell `target`.
  connect(region, target, { zone, allowed = () => true } = {}) {
    if (region.includes(target)) return [];
    const prev = new Map(region.map(k => [k, null]));
    const q = [...region];
    while (q.length) {
      const c = q.shift();
      const [x, y] = P(c);
      for (const [dx, dy] of this.shuffle(ORTHO)) {
        const nk = K(x + dx, y + dy);
        if (prev.has(nk)) continue;
        if (nk === target) {
          const path = [];
          for (let p = c; prev.get(p) !== null; p = prev.get(p)) path.unshift(p);
          for (const p of path) this.add(...P(p), { zone });
          const chain = [...(path.length ? [prev.get(path[0])] : [c]), ...path, target];
          for (let i = 1; i < chain.length; i++) this.link(chain[i - 1], chain[i]);
          return path;
        }
        if (!this.free(x + dx, y + dy) || !allowed(x + dx, y + dy)) continue;
        prev.set(nk, c);
        q.push(nk);
      }
    }
    return null;
  }

  // Add up to n extra passages between orthogonally adjacent, unlinked cells.
  loops(n, filter = () => true, props = {}) {
    const pairs = [];
    for (const k of this.cells.keys()) {
      const [x, y] = P(k);
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nk = K(x + dx, y + dy);
        if (this.cells.has(nk) && !this.linked(k, nk) && filter(k, nk)) pairs.push([k, nk]);
      }
    }
    for (const [a, b] of this.shuffle(pairs).slice(0, n)) this.link(a, b, props);
  }

  // Make the plan exactly `n` rooms: grow plain cells off unremarkable rooms,
  // or prune unremarkable dead ends.
  fitTo(n, { zoneFor = null, allowed = () => true } = {}) {
    const plain = k => {
      const c = this.cells.get(k);
      return k !== this.entrance && k !== this.final && !c.role;
    };
    while (this.cells.size > n) {
      const leaf = [...this.cells.keys()].find(k => plain(k) && this.neighbors(k).length === 1 &&
        !this.verticals.some(v => v.a === k || v.b === k));
      if (!leaf) break;
      this.cells.delete(leaf);
      this.edges = this.edges.filter(e => e.a !== leaf && e.b !== leaf);
      this.notes = this.notes.filter(x => x.key !== leaf);
    }
    let guard = 0;
    while (this.cells.size < n && guard++ < 200) {
      const roots = this.shuffle([...this.cells.keys()].filter(k => plain(k) || k === this.entrance));
      let grew = false;
      for (const r of roots) {
        const zone = zoneFor ? zoneFor(r) : this.cells.get(r).zone;
        if (this.grow([r], 1, { zone, allowed }).length) { grew = true; break; }
      }
      if (!grew) break;
    }
    return this;
  }
}

// Perimeter of the rectangle (x0,y0)–(x1,y1), clockwise from the top-left;
// consecutive cells (and last→first) are orthogonally adjacent.
export function ringCells(x0, y0, x1, y1) {
  const out = [];
  for (let x = x0; x <= x1; x++) out.push(K(x, y0));
  for (let y = y0 + 1; y <= y1; y++) out.push(K(x1, y));
  for (let x = x1 - 1; x >= x0; x--) out.push(K(x, y1));
  for (let y = y1 - 1; y > y0; y--) out.push(K(x0, y));
  return out;
}

const arc = (ring, start, len, dir = 1) =>
  Array.from({ length: len }, (_, i) => ring[((start + i * dir) % ring.length + ring.length) % ring.length]);
const orthAdj = (a, b) => { const [ax, ay] = P(a), [bx, by] = P(b); return Math.abs(ax - bx) + Math.abs(ay - by) === 1; };
const chainLink = (plan, keys, props = {}, closed = false) => {
  for (let i = 1; i < keys.length; i++) plan.link(keys[i - 1], keys[i], props);
  if (closed && keys.length > 2) plan.link(keys.at(-1), keys[0], props);
};
const split = (total, parts, rand) => {
  const base = Math.floor(total / parts);
  const out = Array(parts).fill(base);
  for (let i = 0; i < total - base * parts; i++) out[Math.floor(rand() * parts)]++;
  return out;
};
// Strict cones around the origin, so rotated copies never collide.
const cone = (dir, x, y) => ({
  N: y < 0 && Math.abs(x) < -y,
  S: y > 0 && Math.abs(x) < y,
  E: x > 0 && Math.abs(y) < x,
  W: x < 0 && Math.abs(y) < -x,
})[dir];
const zoneOf = (p, k) => p.cells.get(k).zone;
const DIR_NAMES = { N: 'north', E: 'east', S: 'south', W: 'west' };
const ROOT = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

// ── Layouts ───────────────────────────────────────────────────────

function hubAndSpokes(n, rand) {
  const p = new Plan(rand);
  const four = n >= 12;
  const hub = p.add(0, 0, { zone: 'the hub', role: 'hub', roomType: 'large' });
  // With four wings the entrance comes in diagonally, between two of them.
  p.entrance = four ? p.add(-1, 1, { zone: 'the hub' }) : p.add(0, 1, { zone: 'the hub' });
  p.link(p.entrance, hub, { type: 'open archway' });
  const dirs = four ? ['N', 'E', 'S', 'W'] : ['N', 'E', 'W'];
  const sizes = split(n - 2, dirs.length, rand);
  const wings = dirs.map((dir, i) => {
    const zone = `the ${DIR_NAMES[dir]} wing`;
    const root = p.add(...ROOT[dir], { zone, role: 'wing threshold' });
    p.link(hub, root);
    const cells = [root, ...p.grow([root], sizes[i] - 1, {
      zone, allowed: (x, y) => cone(dir, x, y), score: (x, y) => Math.max(Math.abs(x), Math.abs(y)),
    })];
    p.zones[zone] = 'one of the separate wings off the hub — give it its own identity';
    p.note(root, 'wing threshold', `Threshold of ${zone}: its doorway off the hub shows what lies beyond (distinct tracks, symbols, smell).`);
    return { zone, cells };
  });
  p.zones['the hub'] = 'the central hall every wing opens onto';
  // "Only a few connect directly": occasionally one passage between wings.
  if (rand() < 0.35) p.loops(1, (a, b) => p.cells.get(a).zone !== p.cells.get(b).zone &&
    ![a, b].some(k => p.cells.get(k).zone === 'the hub'));
  p.final = p.farthest(p.entrance, wings.flatMap(w => w.cells));
  p.note(hub, 'hub', `HUB — every wing opens off this hall (${wings.map(w => `${w.zone}: ${ref(w.cells[0])}`).join('; ')}). Travelling between wings means coming back through here.`);
  return p;
}

function verticalSpine(n, rand) {
  const p = new Plan(rand);
  const levels = n <= 8 ? 2 : n <= 14 ? 3 : 4;
  const sizes = split(n, levels, rand);
  const form = p.pick(['a great shaft with iron rungs', 'a spiral stair around an open well', 'a natural chimney with carved handholds']);
  p.meta = { spine: form, levels };
  const landings = [];
  const levelCells = [];
  for (let k = 0; k < levels; k++) {
    const y0 = k * 3;
    const zone = `level ${k + 1}${k === 0 ? ' (upper)' : k === levels - 1 ? ' (deepest)' : ''}`;
    p.zones[zone] = k === 0 ? 'the shallowest level, where the spine begins' : `depth ${k + 1} — more dangerous than the level above`;
    const landing = p.add(0, y0, { zone, role: 'landing' });
    landings.push(landing);
    const inLevel = (x, y) => y >= y0 && y <= y0 + 1 && Math.abs(x) <= 3;
    levelCells.push([landing, ...p.grow([landing], sizes[k] - 1, { zone, allowed: inLevel, score: (x) => Math.abs(x) * 0.5 })]);
    for (let x = -3; x <= 3; x++) if (k < levels - 1) p.blocked.add(K(x, y0 + 2));
    if (k > 0) p.vertical(landings[k - 1], landing, form);
  }
  p.entrance = landings[0];
  p.final = p.farthest(landings.at(-1), levelCells.at(-1).filter(k => k !== landings.at(-1)).length
    ? levelCells.at(-1).filter(k => k !== landings.at(-1)) : levelCells.at(-1));
  // A second, riskier way between two levels.
  for (let k = 0; k < levels - 1 && rand() < 0.5; k++) {
    const upper = levelCells[k].filter(c => c !== landings[k] && P(c)[1] === k * 3 + 1);
    const lower = levelCells[k + 1].filter(c => c !== landings[k + 1] && P(c)[1] === (k + 1) * 3);
    const pair = upper.flatMap(u => lower.filter(l => P(l)[0] === P(u)[0]).map(l => [u, l]))[0];
    if (pair) {
      p.vertical(pair[0], pair[1], 'a crumbling climb down a crack (DC 12 STR, 1d6 on a fall)');
      p.cells.get(pair[0]).role = p.cells.get(pair[1]).role = 'side climb';
      break;
    }
  }
  landings.forEach((l, k) => p.note(l, 'landing', `LANDING on the spine (${form}) — level ${k + 1} of ${levels}.${k < levels - 1 ? ` It continues down to ${ref(landings[k + 1])}.` : ' The bottom of the spine.'} Deeper levels are visibly older and more dangerous; sounds and air drift up the shaft.`));
  return p;
}

function arteryAndBranches(n, rand) {
  const p = new Plan(rand);
  const len = Math.max(4, Math.round(n * 0.4));
  const artery = [];
  for (let x = 0; x < len; x++) artery.push(p.add(x, 0, { zone: 'the artery', role: 'artery', roomType: x === 0 || x === len - 1 ? 'large' : p.pick(['corridor', 'corridor', 'large']) }));
  chainLink(p, artery, { type: 'open archway' });
  p.zones['the artery'] = 'the great route spanning the dungeon — fast, oriented, and exposed';
  p.entrance = artery[0];
  p.final = artery.at(-1);
  // Branches: spaced roots alternating north and south of the artery.
  const roots = [];
  for (let x = 1; x < len - 1; x++) roots.push({ x, side: (x % 2 ? -1 : 1) * (rand() < 0.5 ? 1 : -1) });
  let rest = n - len, b = 0;
  for (const r of p.shuffle(roots)) {
    if (rest <= 0) break;
    const size = Math.min(rest, 1 + Math.floor(rand() * 3));
    const zone = `branch ${String.fromCharCode(65 + b++)}`;
    p.zones[zone] = 'a side area off the artery';
    const root = p.add(r.x, r.side, { zone });
    p.link(artery[r.x], root);
    const cells = p.grow([root], size - 1, { zone, allowed: (x, y) => Math.sign(y) === r.side && Math.abs(x - r.x) <= 1, score: (x, y) => Math.abs(y) });
    rest -= 1 + cells.length;
  }
  p.fitTo(n, { allowed: (x, y) => y !== 0 });
  p.note(artery[Math.floor(len / 2)], 'artery', `THE ARTERY — the main route runs straight through here from ${ref(artery[0])} to ${ref(artery.at(-1))}; every side area opens off it. It is the fastest way through and the most watched.`);
  p.note(p.final, 'terminus', 'The far end of the artery: everything along the route leads here.');
  return p;
}

function concentricLayers(n, rand) {
  const p = new Plan(rand);
  const center = p.add(0, 0, { zone: 'the inner sanctum', role: 'center', roomType: 'large' });
  p.final = center;
  const m1 = Math.min(8, Math.max(3, Math.round((n - 1) * 0.35)));
  const m2 = Math.min(16, n - 1 - m1);
  const mid = ringCells(-1, -1, 1, 1), outer = ringCells(-2, -2, 2, 2);
  const onAxis = k => { const [x, y] = P(k); return x === 0 || y === 0; };
  // Brute-force the arcs so players must circle each ring to find the way in.
  let best = null;
  for (let ms = 0; ms < 8; ms++) for (const md of [1, -1]) {
    const midArc = arc(mid, ms, m1, md);
    for (let os = 0; os < 16; os++) for (const od of [1, -1]) {
      const outArc = arc(outer, os, m2, od);
      for (let j = outArc.length - 1; j > 0; j--) {
        const entry = midArc.findIndex(c => orthAdj(c, outArc[j]));
        if (entry < 0) continue;
        const inner = midArc.map((c, i) => ({ c, i })).filter(x => onAxis(x.c)).sort((a, b) => Math.abs(b.i - entry) - Math.abs(a.i - entry))[0];
        if (!inner) continue;
        const s = j + Math.abs(inner.i - entry) + rand();
        if (!best || s > best.s) best = { s, midArc, outArc, j, entry, inner: inner.c };
        break;
      }
    }
  }
  const { midArc, outArc, j, entry, inner } = best;
  midArc.forEach(k => p.add(...P(k), { zone: 'the middle ring' }));
  outArc.forEach(k => p.add(...P(k), { zone: 'the outer ring' }));
  chainLink(p, midArc, {}, m1 === 8);
  chainLink(p, outArc, {}, m2 === 16);
  p.entrance = outArc[0];
  const doorType = p.pick(['secret door', 'hidden passage behind a tapestry', 'concealed trapdoor']);
  p.link(outArc[j], midArc[entry], { type: doorType });
  p.link(inner, center, { type: 'sealed stone door' });
  p.cells.get(outArc[j]).role = p.cells.get(midArc[entry]).role = 'way inward';
  p.cells.get(inner).role = 'way inward';
  p.zones['the outer ring'] = 'the first layer, circling everything inside';
  p.zones['the middle ring'] = 'the second layer — reached only through a hidden way';
  p.zones['the inner sanctum'] = 'the heart of the layers';
  p.note(outArc[j], 'way inward', `THE WAY INWARD (${doorType}) to the middle ring at ${ref(midArc[entry])} — one of the very few passages between layers. Better made, better hidden, and better guarded than anything else in the outer ring.`);
  p.note(inner, 'way inward', `The only door into the inner sanctum (${ref(center)}).`);
  p.note(center, 'center', 'The innermost layer: reached only by circling both rings.');
  p.fitTo(n, { allowed: (x, y) => Math.max(Math.abs(x), Math.abs(y)) >= 3 });
  return p;
}

// Lay out boxes (sections), join neighbouring boxes with ports, and grow
// each box to its room count. gap 1 puts a crossing cell in the lane
// between boxes; gap 0 joins the ports directly.
function boxed(p, boxes, links, gap) {
  const seeds = boxes.map(() => []);
  const used = new Set();
  for (const L of links) {
    const A = boxes[L.i], B = boxes[L.j];
    let cands = [];
    if (B.x0 === A.x0 + A.w + gap) {
      for (let y = Math.max(A.y0, B.y0); y < Math.min(A.y0 + A.h, B.y0 + B.h); y++) cands.push([A.x0 + A.w - 1, y, B.x0, y, A.x0 + A.w, y]);
    } else if (A.x0 === B.x0 + B.w + gap) {
      for (let y = Math.max(A.y0, B.y0); y < Math.min(A.y0 + A.h, B.y0 + B.h); y++) cands.push([A.x0, y, B.x0 + B.w - 1, y, B.x0 + B.w, y]);
    } else if (B.y0 === A.y0 + A.h + gap) {
      for (let x = Math.max(A.x0, B.x0); x < Math.min(A.x0 + A.w, B.x0 + B.w); x++) cands.push([x, A.y0 + A.h - 1, x, B.y0, x, A.y0 + A.h]);
    } else if (A.y0 === B.y0 + B.h + gap) {
      for (let x = Math.max(A.x0, B.x0); x < Math.min(A.x0 + A.w, B.x0 + B.w); x++) cands.push([x, A.y0, x, B.y0 + B.h - 1, x, B.y0 + B.h]);
    } else {
      throw new Error('boxed: boxes are not neighbours');
    }
    if (gap) for (const c of cands) if (!p.cells.has(K(c[4], c[5]))) p.blocked.add(K(c[4], c[5]));
    // Two links between the same boxes must not share a crossing.
    cands = cands.filter(c => !used.has(`${K(c[0], c[1])}|${K(c[2], c[3])}`) && !p.cells.has(K(c[4], c[5])) || !gap && !used.has(`${K(c[0], c[1])}|${K(c[2], c[3])}`));
    // Prefer ports that reuse or sit near cells each box already has, so
    // joining them inside the box costs as few extra rooms as possible.
    const near = (x, y, box, i) => {
      const own = [...(box.start ? [box.start] : []), ...seeds[i]].map(P);
      return own.length ? Math.min(...own.map(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y))) : 0;
    };
    const [ax, ay, bx, by, cx, cy] = cands
      .map(c => ({ c, s: near(c[0], c[1], A, L.i) + near(c[2], c[3], B, L.j) + p.rand() * 0.9 }))
      .sort((x, y) => x.s - y.s)[0].c;
    const a = p.add(ax, ay, { zone: A.zone, role: 'port' }), b = p.add(bx, by, { zone: B.zone, role: 'port' });
    used.add(`${a}|${b}`);
    if (gap) {
      p.blocked.delete(K(cx, cy));
      const c = p.add(cx, cy, { zone: L.crossingZone, role: 'crossing', roomType: 'corridor', content: L.content });
      p.link(a, c, { type: 'open archway' });
      p.link(c, b, { type: 'open archway' });
      L.cell = c;
    } else {
      p.link(a, b, { type: L.type, oneWay: L.oneWay });
    }
    L.from = a; L.to = b;
    if (!seeds[L.i].includes(a)) seeds[L.i].push(a);
    if (!seeds[L.j].includes(b)) seeds[L.j].push(b);
  }
  boxes.forEach((B, i) => {
    const inBox = (x, y) => x >= B.x0 && x < B.x0 + B.w && y >= B.y0 && y < B.y0 + B.h;
    const s = [...(B.start ? [B.start] : []), ...seeds[i]];
    const first = s[0] ?? p.add(B.x0, B.y0, { zone: B.zone });
    const region = [first];
    for (const t of s.slice(1)) {
      const path = p.connect(region, t, { zone: B.zone, allowed: inBox });
      if (path) region.push(...path, t);
    }
    const have = p.inZone(B.zone).length;
    region.push(...p.grow(region, Math.max(0, B.n - have), { zone: B.zone, allowed: inBox }));
    B.cells = p.inZone(B.zone);
  });
}

// The box cell least like a doorway to elsewhere: a plain cell far from the
// box's ports, or a port if the box has nothing else.
function farthestFromPorts(p, cells) {
  const ports = cells.filter(k => p.cells.get(k).role === 'port');
  const plain = cells.filter(k => !p.cells.get(k).role);
  if (!plain.length) return cells[0];
  const d = ports.map(k => p.dist(k));
  return plain.map(k => ({ k, s: Math.min(...d.map(m => m.get(k) ?? 0)) + p.rand() * 0.5 })).sort((a, b) => b.s - a.s)[0].k;
}

const boxSize = n => { const w = Math.max(2, Math.ceil(Math.sqrt(n * 1.7))); return { w, h: Math.max(2, Math.ceil((n * 1.7) / w)) }; };

function greatDivide(n, rand) {
  const p = new Plan(rand);
  const crossings = n >= 12 ? 2 : 1;
  const [nw, ne] = split(n - crossings, 2, rand);
  const h = n <= 8 ? 2 : 3;
  const ww = Math.max(2, Math.ceil(nw * 1.5 / h)), we = Math.max(2, Math.ceil(ne * 1.5 / h));
  const west = { x0: 0, y0: 0, w: ww, h, zone: 'the near side', n: nw };
  const east = { x0: ww + 1, y0: 0, w: we, h, zone: 'the far side', n: ne };
  const links = Array.from({ length: crossings }, (_, i) => ({ i: 0, j: 1, crossingZone: 'the divide', content: i % 2 ? 'hazard' : 'obstacle' }));
  boxed(p, [west, east], links, 1);
  for (let y = 0; y < h; y++) if (!p.has(ww, y)) p.blocked.add(K(ww, y));
  p.entrance = farthestFromPorts(p, west.cells);
  p.final = p.farthest(p.entrance, east.cells.filter(k => p.cells.get(k).role !== 'port').length ? east.cells.filter(k => p.cells.get(k).role !== 'port') : east.cells);
  const barrier = p.pick(['a deep chasm', 'a collapsed, impassable section', 'a fast underground river', 'a sheer drop into darkness']);
  p.meta = { barrier, crossings };
  p.zones['the near side'] = `the side of the divide the party enters on`;
  p.zones['the far side'] = `beyond the divide — visible, but reachable only by the crossings`;
  p.zones['the divide'] = `${barrier} splitting the dungeon in two`;
  for (const L of links) p.note(L.cell, 'crossing', `CROSSING over ${barrier} — one of only ${crossings} ways between the two halves. Its wear, ropes, or bodies show it is used, and it is dangerous in its own right.`);
  p.note(links[0].from, 'overlook', `The far side of ${barrier} is visible from here (${ref(links[0].to)} and beyond) long before it can be reached.`);
  return p;
}

function separatedClusters(n, rand) {
  const p = new Plan(rand);
  const k = n <= 8 ? 2 : n <= 14 ? 3 : 4;
  const pairs = k === 2 ? [[0, 1]] : k === 3 ? [[0, 1], [0, 2]] : [[0, 1], [1, 3], [3, 2], [2, 0]];
  const sizes = split(n - pairs.length, k, rand);
  const { w, h } = boxSize(Math.max(...sizes));
  const names = ['first', 'second', 'third', 'fourth'];
  const boxes = sizes.map((sz, i) => ({ x0: (i % 2) * (w + 1), y0: Math.floor(i / 2) * (h + 1), w, h, zone: `the ${names[i]} cluster`, n: sz }));
  const terrain = p.pick(['open, storm-swept ground', 'black water', 'a chasm crossed by old bridges', 'collapsed, unstable rubble']);
  p.meta = { terrain, clusters: k };
  const links = pairs.map(([i, j], x) => ({ i, j, crossingZone: 'between the clusters', content: x % 2 ? 'obstacle' : 'hazard' }));
  boxed(p, boxes, links, 1);
  p.entrance = farthestFromPorts(p, boxes[0].cells);
  // Close the lanes so nothing else bridges the gaps.
  const xs = [...p.cells.values()].map(c => c.x), ys = [...p.cells.values()].map(c => c.y);
  for (let x = Math.min(...xs); x <= Math.max(...xs); x++) for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    if (!p.has(x, y) && (x === w || y === h)) p.blocked.add(K(x, y));
  }
  const last = boxes.at(-1);
  p.final = p.farthest(p.entrance, last.cells);
  boxes.forEach(b => { p.zones[b.zone] = 'a self-contained site with its own inhabitants'; });
  p.zones['between the clusters'] = `${terrain} separating the clusters`;
  for (const L of links) p.note(L.cell, 'crossing', `CROSSING — ${terrain} between ${boxes[L.i].zone} and ${boxes[L.j].zone}. Exposed and dangerous; the only way between them.`);
  return p;
}

function hollowCenter(n, rand) {
  const p = new Plan(rand);
  let v = Math.max(1, Math.floor((n - 4) / 4));
  if (n >= 16) v -= 1;
  for (let x = 0; x < v; x++) for (let y = 0; y < v; y++) p.blocked.add(K(x, y));
  const ring = ringCells(-1, -1, v, v);
  ring.forEach(k => p.add(...P(k), { zone: 'the ring' }));
  chainLink(p, ring, {}, true);
  p.entrance = ring[0];
  const opposite = ring[Math.floor(ring.length / 2)];
  const outside = (x, y) => x < -1 || y < -1 || x > v || y > v;
  if (n > ring.length) {
    p.final = p.grow([opposite], 1, { zone: 'beyond the ring', allowed: outside })[0] ?? opposite;
    p.cells.get(p.final).role = 'beyond';
  } else {
    p.final = opposite;
  }
  p.fitTo(n, { allowed: outside, zoneFor: () => 'beyond the ring' });
  const voidName = p.pick(['a vast sealed courtyard', 'a pit of magma', 'a sunken black lake', 'a bottomless shaft']);
  p.meta = { voidName };
  p.zones['the ring'] = `the halls circling ${voidName}`;
  p.zones['beyond the ring'] = 'rooms leading outward from the ring';
  for (const i of [Math.floor(ring.length / 4), Math.floor(ring.length * 3 / 4)]) {
    const across = ring[(i + Math.floor(ring.length / 2)) % ring.length];
    p.note(ring[i], 'overlook', `OVERLOOK onto ${voidName} at the dungeon's heart: ${ref(across)} is visible across it, but the only way there is around.`);
  }
  p.note(p.entrance, 'overlook', `${voidName[0].toUpperCase()}${voidName.slice(1)} fills the dungeon's center; the halls ring it in both directions.`);
  return p;
}

function ratchetAndReturn(n, rand) {
  const p = new Plan(rand);
  const sizes = split(n, 4, rand);
  const { w, h } = boxSize(Math.max(...sizes));
  const pos = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const boxes = sizes.map((sz, i) => ({ x0: pos[i][0] * w, y0: pos[i][1] * h, w, h, zone: `section ${i + 1}`, n: sz }));
  const forms = p.shuffle([
    'one-way: a stone block that slides shut behind',
    'one-way: a drop too high to climb back up',
    'one-way: a water chute',
    'one-way: a gate that seals once passed',
  ]);
  const links = [0, 1, 2, 3].map(i => ({ i, j: (i + 1) % 4, type: forms[i], oneWay: true }));
  boxed(p, boxes, links, 0);
  // The party enters where the way back finally returns.
  p.entrance = links[3].to;
  for (const b of boxes) p.loops(1, (x, y) => p.cells.get(x).zone === b.zone && p.cells.get(y).zone === b.zone);
  p.final = p.farthest(p.entrance, boxes[2].cells);
  boxes.forEach((b, i) => { p.zones[b.zone] = i === 0 ? 'where the party enters — and where the way back finally returns' : 'a section reached only by a one-way passage'; });
  links.forEach((L, i) => {
    const form = L.type.replace('one-way: ', '');
    p.note(L.from, 'one-way', i === 3
      ? `THE WAY BACK: ${form} returns to ${ref(L.to)} near the entrance — the only route out short of fighting back the way you came.`
      : `ONE-WAY: ${form} leads on to ${ref(L.to)}. Once through, there is no going back this way. Visible from both sides (scratch marks, debris) so it is never a surprise.`);
  });
  p.note(links[3].to, 'return', `Signs of a way back: a draft and faint light from ${ref(links[3].from)} — sealed from this side, so the only way on is forward.`);
  return p;
}

function lockedCenter(n, rand) {
  const p = new Plan(rand);
  const vault = p.add(0, 0, { zone: 'the vault', role: 'vault', roomType: 'large' });
  const ante = p.add(0, 1, { zone: 'the antechamber', role: 'antechamber' });
  p.entrance = p.add(0, 2, { zone: 'the antechamber' });
  p.final = vault;
  p.link(p.entrance, ante, { type: 'open archway' });
  p.link(ante, vault, { type: 'sealed vault door' });
  const wings = n >= 12
    ? [{ zone: 'the west wing', root: [-1, 1], from: ante, side: x => x < 0 }, { zone: 'the east wing', root: [1, 1], from: ante, side: x => x > 0 }, { zone: 'the south wing', root: [0, 3], from: p.entrance, side: (x, y) => y >= 3 }]
    : [{ zone: 'the west wing', root: [-1, 1], from: ante, side: x => x < 0 }, { zone: 'the east wing', root: [1, 1], from: ante, side: x => x > 0 }];
  const sizes = split(n - 3, wings.length, rand);
  for (const [i, wg] of wings.entries()) {
    const root = p.add(...wg.root, { zone: wg.zone });
    p.link(wg.from, root);
    wg.cells = [root, ...p.grow([root], sizes[i] - 1, {
      zone: wg.zone,
      allowed: (x, y) => wg.side(x, y) && !(x === 0 && y === 0),
      score: (x, y) => (wg.zone === 'the south wing' ? y : -y) + Math.abs(x) * 0.3,
    })];
    p.zones[wg.zone] = 'a wing wrapped around the sealed vault';
  }
  p.zones['the antechamber'] = 'just inside the entrance, before the sealed vault door';
  p.zones['the vault'] = 'the sealed heart of the dungeon';
  const keyCount = n >= 16 ? 3 : 2;
  const keys = wings.slice(0, keyCount).map(wg => p.farthest(p.entrance, wg.cells));
  while (keys.length < keyCount) keys.push(p.farthest(p.entrance, wings[0].cells.filter(c => !keys.includes(c))));
  // Every key is a physical object that fits a socket in the vault door.
  const { one: keyForm, many: keyForms } = p.pick([
    { one: 'funerary seal', many: 'funerary seals' },
    { one: 'bronze key', many: 'bronze keys' },
    { one: 'carved sigil-stone', many: 'carved sigil-stones' },
    { one: 'graven word-tablet', many: 'graven word-tablets' },
  ]);
  p.meta = { keyForm, keyForms, keyCount };
  for (const k of keys) p.zones[zoneOf(p, k)] = 'a wing wrapped around the sealed vault, holding one of its keys';
  keys.forEach((k, i) => { p.cells.get(k).role = 'key'; p.note(k, 'key', `KEY ${i + 1} of ${keyCount}: a ${keyForm} for the sealed vault (${ref(vault)}). It visibly matches one of the empty sockets on the vault door.`); });
  p.note(ante, 'antechamber', `The sealed vault door (to ${ref(vault)}) stands here, reached within moments of entering: ${keyCount} empty sockets, each shaped for a ${keyForm}.`);
  p.note(vault, 'vault', `SEALED VAULT — opens only when all ${keyCount} ${keyForms} are set in the door (keys in ${keys.map(ref).join(', ')}).`);
  // An alternative way in, for players who look for one.
  // (Never a key room — the key must stay where the vault door says it is.)
  const back = [K(-1, 0), K(1, 0), K(0, -1)].filter(k => p.cells.has(k) && !keys.includes(k));
  if (back.length && rand() < 0.6) {
    const b = p.pick(back);
    p.link(b, vault, { type: 'secret door' });
    p.cells.get(b).role = 'back way';
    p.note(b, 'back way', `A hidden way into the vault (${ref(vault)}) that bypasses the seals — whoever built the vault knew of it and guarded or trapped it.`);
  }
  return p;
}

function landmarkAndLoop(n, rand) {
  const p = new Plan(rand);
  const v = Math.max(1, Math.floor((n * 0.7 - 4) / 4));
  for (let x = 0; x < v; x++) for (let y = 0; y < v; y++) p.blocked.add(K(x, y));
  const ring = ringCells(-1, -1, v, v);
  ring.forEach(k => p.add(...P(k), { zone: 'the long way around' }));
  chainLink(p, ring);        // open loop: no passage between ring[last] and ring[0]
  // Entrance and landmark sit side by side at the loop's two ends.
  p.entrance = ring.at(-1);
  p.final = ring[0];
  p.cells.get(p.final).role = 'landmark';
  p.cells.get(p.final).zone = 'the landmark';
  const outside = (x, y) => x < -1 || y < -1 || x > v || y > v;
  p.fitTo(n, { allowed: outside, zoneFor: () => 'side passages' });
  const what = p.pick(['a golden shrine', 'a glowing crystal cavern', 'a great lit throne', 'a column of falling light']);
  p.meta = { landmark: what };
  p.zones['the long way around'] = `the circuitous route that eventually reaches ${what} from behind`;
  p.zones['the landmark'] = what;
  p.zones['side passages'] = 'detours off the long route';
  p.note(p.entrance, 'sightline', `${what[0].toUpperCase()}${what.slice(1)} (${ref(p.final)}) is visible from here — through a grate, across a gap — but there is no way through. The route to it winds through most of the dungeon.`);
  p.note(ring[Math.floor(ring.length / 2)], 'glimpse', `${what[0].toUpperCase()}${what.slice(1)} glimpsed again from a new angle — players can triangulate how far round they have come.`);
  p.note(p.final, 'landmark', `THE LANDMARK — first seen from the entrance (${ref(p.entrance)}); the only way in is from behind.`);
  return p;
}

function symmetryAndRepetition(n, rand) {
  const p = new Plan(rand);
  const m = Math.max(1, Math.floor((n - 3) / 3));
  const hub = p.add(0, 0, { zone: 'the central hall', role: 'hub', roomType: 'large' });
  p.entrance = p.add(0, 1, { zone: 'the central hall' });
  p.link(p.entrance, hub, { type: 'open archway' });
  // Grow one template wing in the north cone, then rotate it into the others.
  const tmpl = new Plan(rand);
  tmpl.add(0, -1, {});
  tmpl.grow([K(0, -1)], m - 1, { allowed: (x, y) => cone('N', x, y), score: (x, y) => -y });
  const rot = { N: ([x, y]) => [x, y], E: ([x, y]) => [-y, x], W: ([x, y]) => [y, -x] };
  const wings = ['N', 'E', 'W'].map(dir => {
    const zone = `the ${DIR_NAMES[dir]} wing`;
    p.zones[zone] = 'one of the identical wings';
    const map = new Map();
    for (const k of tmpl.cells.keys()) {
      const [x, y] = rot[dir](P(k));
      map.set(k, p.add(x, y, { zone, twin: k }));
    }
    for (const e of tmpl.edges) p.link(map.get(e.a), map.get(e.b));
    p.link(hub, map.get(K(0, -1)));
    return { dir, zone, map };
  });
  // The deviation: one wing has a room the others lack, behind a secret door.
  const odd = p.pick(wings);
  const cells = [...odd.map.values()];
  const extra = p.grow(cells, 1, { zone: odd.zone, allowed: (x, y) => cone(odd.dir, x, y), linkProps: { type: 'secret door' } })[0];
  if (extra) {
    p.cells.get(extra).role = 'deviation';
    p.note(extra, 'deviation', `DEVIATION — this room exists only in ${odd.zone}; the matching spot in the other wings is solid wall. Players who learned the pattern will notice the extra space.`);
  }
  p.fitTo(n, { allowed: (x, y) => cone('S', x, y) && y >= 2, zoneFor: () => 'the approach' });
  p.zones['the approach'] = 'the way in, before the central hall';
  p.zones['the central hall'] = 'the hall the identical wings open from';
  p.final = p.farthest(p.entrance, [...odd.map.values()]);
  for (const w of wings) {
    const others = wings.filter(x => x !== w).map(x => ref(x.map.get(K(0, -1))));
    p.note(w.map.get(K(0, -1)), 'mirror', `This wing repeats the same arrangement as the others (${others.join(', ')}): same doors, same rooms, same furnishings. Exploring one predicts the rest — and makes any difference stand out.`);
  }
  return p;
}

function parallelPaths(n, rand) {
  const p = new Plan(rand);
  const len = Math.max(2, Math.floor((n - 2) / 2));
  p.entrance = p.add(-1, 0, { zone: 'the entry' });
  const a = [], b = [];
  for (let x = 0; x < len; x++) {
    a.push(p.add(x, 0, { zone: 'the exposed route', roomType: 'large', content: x % 2 === 0 ? 'monster' : undefined }));
    b.push(p.add(x, 1, { zone: 'the concealed route', roomType: 'corridor', content: x % 2 === 1 ? p.pick(['trap', 'hazard', 'empty']) : undefined }));
  }
  chainLink(p, a, { type: 'open archway' });
  chainLink(p, b);
  p.link(p.entrance, a[0], { type: 'open archway' });
  p.link(p.entrance, b[0], { type: 'secret door' });
  p.final = p.add(len, 0, { zone: 'the goal', roomType: 'large' });
  p.link(a.at(-1), p.final);
  p.link(b.at(-1), p.final, { type: 'secret door' });
  const connectors = [];
  for (let x = 1; x < len; x += 3) { p.link(a[x], b[x], { type: 'secret door' }); connectors.push(x); }
  if (!connectors.length && len > 1) { p.link(a[0], b[0], { type: 'secret door' }); connectors.push(0); }
  p.fitTo(n, { allowed: (x, y) => y >= 2, zoneFor: () => 'the concealed route' });
  p.zones['the exposed route'] = 'the direct, patrolled main route — fast but watched';
  p.zones['the concealed route'] = 'cramped hidden passages alongside it — slow but unseen';
  p.zones['the goal'] = 'where both routes meet';
  p.note(a[0], 'route', `The exposed route: broad, direct, and patrolled all the way to ${ref(p.final)}. Fast, but every room is watched.`);
  p.note(b[0], 'route', `The concealed route: cramped passages running parallel to the main halls — slow, trapped, and unwatched.`);
  for (const x of connectors) p.note(b[x], 'connector', `CONNECTING DOOR to the exposed route (${ref(a[x])}): a place to switch routes, or spy on the other.`);
  return p;
}

export const LAYOUTS = {
  'hub-and-spokes':          hubAndSpokes,
  'vertical-spine':          verticalSpine,
  'artery-and-branches':     arteryAndBranches,
  'concentric-layers':       concentricLayers,
  'great-divide':            greatDivide,
  'separated-clusters':      separatedClusters,
  'hollow-center':           hollowCenter,
  'ratchet-and-return':      ratchetAndReturn,
  'locked-center':           lockedCenter,
  'landmark-and-loop':       landmarkAndLoop,
  'symmetry-and-repetition': symmetryAndRepetition,
  'parallel-paths':          parallelPaths,
};

export function buildLayout(id, n, rand = Math.random) {
  const fn = LAYOUTS[id];
  if (!fn) return null;
  const plan = fn(n, rand);
  plan.fitTo(n);
  return plan;
}
