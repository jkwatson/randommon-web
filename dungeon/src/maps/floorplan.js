// Turns a generated module's abstract map (rooms on a coarse layout grid,
// joined by edges) into a real floor plan measured in 10-ft squares:
// rooms at their true dimensions, caverns as irregular outlines, passages
// that leave through the wall each exit names, door symbols by exit type,
// stairs and shafts for vertical links, and layout voids as terrain.
//
// Pure data — no SVG. Renderers draw a FloorPlan; tests check it against
// the module. Coordinates are in squares; y grows southward.
//
// Placement guarantees: each layout cell becomes a block of squares — every
// column as wide as its widest room plus a gap, every row as tall as its
// tallest — and a room sits inside its own block with at least one square of
// margin. So rooms never overlap, and every passage runs from its room's wall
// to the shared block boundary (or corner) and on to the other room — it
// never enters a third room's block.

import { oneWayInfo } from '../dungeons/one-way.js';

export const FT_PER_SQUARE = 10;
export const MAX_SIDE = 10;      // longest room side drawn, in squares (100 ft)
const GAP = 2;                   // squares added to a column/row beyond its largest room
const EMPTY_TRACK = 3;           // an unused column/row
const TERRAIN_TRACK = 5;         // a column/row of voids, chasms, water…

const SIDE_OF = {
  North: 'N', South: 'S', East: 'E', West: 'W',
  Northeast: 'NE', Northwest: 'NW', Southeast: 'SE', Southwest: 'SW',
};
const VEC = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0], NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1] };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' };
const DIAGONAL = new Set(['NE', 'NW', 'SE', 'SW']);

// Seeded PRNG (mulberry32) so a module always draws the same map.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function moduleSeed({ rooms, map }) {
  // A map that carries its own seed keeps its layout through a renumbering.
  if (map.seed != null) return map.seed;
  const nodes = [...map.nodes.values()].map(n => `${n.roomNumber}@${n.x},${n.y}`).sort().join(';');
  const sizes = rooms.map(r => `${r._roomNumber}:${r.roomType}:${r.roomSize?.label ?? ''}`).join(';');
  return hashString(`${nodes}|${sizes}`);
}

// What kind of passage end an exit type draws.
export function doorKind(type = '') {
  const t = type.toLowerCase();
  if (t.startsWith('vertical:')) return null;
  if (t.includes('one-way')) return 'oneway';
  if (t.includes('secret') || t.includes('hidden') || t.includes('concealed')) return 'secret';
  if (t.includes('portcullis')) return 'portcullis';
  if (t.includes('bar')) return 'barred';
  if (t.includes('sealed') || t.includes('vault')) return 'sealed';
  if (t.includes('locked')) return 'locked';
  if (t.includes('arch') || t.includes('open') || t.includes('passage')) return 'open';
  return 'door';
}

function verticalKind(form = '') {
  const f = form.toLowerCase();
  if (f.includes('stair')) return 'stairs';
  if (f.includes('ladder') || f.includes('rung') || f.includes('rope')) return 'ladder';
  if (f.includes('climb') || f.includes('chimney') || f.includes('crack')) return 'climb';
  return 'shaft';  // pit, chute, shaft, dumbwaiter, well
}

// Room footprint in squares: [short, long], clamped to fit its block.
function footprint(room) {
  const ft = v => Math.max(1, Math.round((v ?? 20) / FT_PER_SQUARE));
  const a = ft(room.roomSize?.width), b = ft(room.roomSize?.length);
  // A corridor's width is always its short side, and it is longer than wide.
  if (room.roomType === 'corridor') return [Math.min(a, MAX_SIDE), Math.min(Math.max(b, a + 1), MAX_SIDE)];
  return [Math.min(a, b, MAX_SIDE), Math.min(Math.max(a, b), MAX_SIDE)];
}

export function buildFloorPlan(mod, { seed = moduleSeed(mod) } = {}) {
  const { rooms, map } = mod;
  const rand = seededRandom(seed);
  const byId = new Map([...map.nodes.values()].map(n => [n.id, n]));
  // By room number, not node.room: after a checkpoint round trip the nodes
  // hold copies of the room objects, not the ones in `rooms`.
  const byNumber = new Map(rooms.map(r => [r._roomNumber, r]));
  const roomOf = id => byNumber.get(byId.get(id)?.roomNumber);

  // ── Edges by room and side ──────────────────────────────────────
  const flat = map.edges.filter(e => !e.exitType?.startsWith('vertical:'));
  const sidesOf = new Map(rooms.map(r => [r, { N: [], S: [], E: [], W: [], NE: [], NW: [], SE: [], SW: [] }]));
  for (const e of flat) {
    const d = SIDE_OF[e.dir];
    if (!d) continue;
    sidesOf.get(roomOf(e.fromId))?.[d].push(e);
    sidesOf.get(roomOf(e.toId))?.[OPP[d]].push(e);
  }

  // ── Rooms: footprint and orientation ────────────────────────────
  const dims = new Map();
  for (const room of rooms) {
    const sides = sidesOf.get(room);
    const [short, long] = footprint(room);
    const ew = sides.E.length + sides.W.length, ns = sides.N.length + sides.S.length;
    // Long axis follows the passages through it (corridors especially).
    const horizontal = ew === ns ? rand() < 0.5 : ew > ns;
    dims.set(room, horizontal ? [long, short] : [short, long]);
  }

  // ── Column widths and row heights, sized to their rooms ──────────
  const terrainCells = new Set((map.layout?.terrain ?? []).map(([k]) => k));
  const cells = [...map.nodes.values()].map(n => [n.x, n.y]).concat([...terrainCells].map(k => k.split(',').map(Number)));
  const xs0 = Math.min(...cells.map(c => c[0])), xs1 = Math.max(...cells.map(c => c[0]));
  const ys0 = Math.min(...cells.map(c => c[1])), ys1 = Math.max(...cells.map(c => c[1]));
  const track = (lo, hi, axis) => {
    const sizes = new Map();
    for (let i = lo; i <= hi; i++) {
      const inTrack = rooms.filter(r => byId.get(r._mapId)[axis] === i);
      const largest = Math.max(0, ...inTrack.map(r => dims.get(r)[axis === 'x' ? 0 : 1]));
      const hasTerrain = [...terrainCells].some(k => Number(k.split(',')[axis === 'x' ? 0 : 1]) === i);
      sizes.set(i, largest ? largest + GAP + Math.floor(rand() * 2) : hasTerrain ? TERRAIN_TRACK : EMPTY_TRACK);
    }
    const start = new Map();
    let at = 0;
    for (let i = lo; i <= hi; i++) { start.set(i, at); at += sizes.get(i); }
    start.set(hi + 1, at);
    return { size: sizes, start };
  };
  const cols = track(xs0, xs1, 'x'), rows = track(ys0, ys1, 'y');

  // ── Rooms placed inside their blocks ─────────────────────────────
  const geo = new Map();
  for (const room of rooms) {
    const node = byId.get(room._mapId);
    const [w, h] = dims.get(room);
    // Somewhere inside the block with a square of margin, leaning to center.
    const pos = (start, span, size) => start + 1 + Math.round(((rand() + rand()) / 2) * Math.max(0, span - 2 - size));
    const x = pos(cols.start.get(node.x), cols.size.get(node.x), w);
    const y = pos(rows.start.get(node.y), rows.size.get(node.y), h);
    geo.set(room, { room, x, y, w, h, cell: [node.x, node.y], taken: { N: new Set(), S: new Set(), E: new Set(), W: new Set() } });
  }

  // ── Door slots on walls ──────────────────────────────────────────
  // A slot is a square index along a wall; doors sit at square centers.
  const wallLen = (g, side) => (side === 'N' || side === 'S' ? g.w : g.h);
  const wallStart = (g, side) => (side === 'N' || side === 'S' ? g.x : g.y);
  function doorPoint(g, side, i) {
    switch (side) {
      case 'N': return [g.x + i + 0.5, g.y];
      case 'S': return [g.x + i + 0.5, g.y + g.h];
      case 'W': return [g.x, g.y + i + 0.5];
      case 'E': return [g.x + g.w, g.y + i + 0.5];
    }
  }
  const hasFree = (g, side) => g.taken[side].size < wallLen(g, side);
  // Square slots first, keeping a square of wall between doors so their
  // passages don't run side by side and merge into one; then any free square;
  // on a full wall, quarter-square offsets so two doors never share a point.
  function takeSlot(g, side, wanted) {
    const len = wallLen(g, side);
    const byDistance = list => list.sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted));
    const whole = byDistance([...Array(len).keys()]);
    const spaced = whole.filter(k => [...g.taken[side]].every(t => Math.abs(t - k) >= 2));
    const offsets = byDistance(whole.flatMap(k => [k - 0.25, k + 0.25]));
    const i = [...spaced, ...whole, ...offsets].find(k => !g.taken[side].has(k)) ?? wanted;
    g.taken[side].add(i);
    return i;
  }
  // Diagonal exits leave by the corner: the end square of the N/S wall, or
  // of the E/W wall when the N/S wall is already full.
  function cornerDoor(g, diag) {
    const ns = diag[0], ew = diag[1];
    const nsIndex = ew === 'E' ? g.w - 1 : 0;
    const ewIndex = ns === 'S' ? g.h - 1 : 0;
    const sides = sidesOf.get(g.room);
    // Leave a one-square wall to the straight exit that needs it.
    const nsFree = !g.taken[ns].has(nsIndex) && !(g.w === 1 && sides[ns].length);
    const ewFree = !g.taken[ew].has(ewIndex) && !(g.h === 1 && sides[ew].length);
    if (nsFree || !ewFree) {
      const i = takeSlot(g, ns, nsIndex);
      return { side: ns, point: doorPoint(g, ns, i) };
    }
    const i = takeSlot(g, ew, ewIndex);
    return { side: ew, point: doorPoint(g, ew, i) };
  }

  // Reserve corner squares for diagonal exits before placing straight ones.
  const corners = new Map();
  for (const e of flat) {
    const d = SIDE_OF[e.dir];
    if (!DIAGONAL.has(d)) continue;
    const a = geo.get(roomOf(e.fromId)), b = geo.get(roomOf(e.toId));
    corners.set(e, { a: cornerDoor(a, d), b: cornerDoor(b, OPP[d]) });
  }

  // ── Passages ─────────────────────────────────────────────────────
  const passages = [];
  for (const e of flat) {
    const d = SIDE_OF[e.dir];
    const ra = roomOf(e.fromId), rb = roomOf(e.toId);
    const a = geo.get(ra), b = geo.get(rb);
    let doorA, doorB, sideA, sideB, points;
    if (DIAGONAL.has(d)) {
      ({ point: doorA, side: sideA } = corners.get(e).a);
      ({ point: doorB, side: sideB } = corners.get(e).b);
      // Out one square from each wall, then through the shared block corner.
      const corner = [cols.start.get(Math.max(a.cell[0], b.cell[0])), rows.start.get(Math.max(a.cell[1], b.cell[1]))];
      const out = (p, side) => [p[0] + VEC[side][0], p[1] + VEC[side][1]];
      points = [doorA, out(doorA, sideA), corner, out(doorB, sideB), doorB];
    } else {
      sideA = d; sideB = OPP[d];
      const along = d === 'E' || d === 'W' ? 1 : 0;  // coordinate index shared along the wall
      // Prefer a straight run where the two walls overlap.
      const lo = Math.max(wallStart(a, sideA), wallStart(b, sideB));
      const hi = Math.min(wallStart(a, sideA) + wallLen(a, sideA), wallStart(b, sideB) + wallLen(b, sideB)) - 1;
      const target = lo <= hi ? lo + Math.floor(rand() * (hi - lo + 1)) : (wallStart(b, sideB) + wallLen(b, sideB) / 2);
      const ia = takeSlot(a, sideA, target - wallStart(a, sideA));
      doorA = doorPoint(a, sideA, ia);
      const ib = takeSlot(b, sideB, doorA[along] - 0.5 - wallStart(b, sideB));
      doorB = doorPoint(b, sideB, ib);
      // Along the exit, jog on the block boundary if the doors don't line up.
      const boundary = along === 1
        ? cols.start.get(Math.max(a.cell[0], b.cell[0]))
        : rows.start.get(Math.max(a.cell[1], b.cell[1]));
      points = along === 1
        ? [doorA, [boundary, doorA[1]], [boundary, doorB[1]], doorB]
        : [doorA, [doorA[0], boundary], [doorB[0], boundary], doorB];
    }
    passages.push({
      from: ra._roomNumber, to: rb._roomNumber,
      dir: e.dir,
      type: e.exitType,
      kind: doorKind(e.exitType),
      points: dedupe(points),
      doors: [{ room: ra._roomNumber, side: sideA, at: doorA }, { room: rb._roomNumber, side: sideB, at: doorB }],
      // One-way passages are traversable from `from` to `to` only — easily;
      // a soft one can be gone back through the hard way.
      oneWay: doorKind(e.exitType) === 'oneway',
      ...(doorKind(e.exitType) === 'oneway' ? { soft: !!oneWayInfo(e.exitType)?.soft, label: oneWayInfo(e.exitType)?.label } : {}),
    });
  }

  // ── Room shapes (caverns get an irregular outline through their doors) ──
  const roomShapes = rooms.map(room => {
    const g = geo.get(room);
    const doors = passages.flatMap(p => p.doors.filter(dd => dd.room === room._roomNumber).map(dd => dd.at));
    const shape = room.roomType === 'cavern' ? cavernOutline(g, doors, rand) : null;
    return {
      number: room._roomNumber,
      kind: room.roomType === 'corridor' ? 'corridor' : room.roomType === 'cavern' ? 'cavern' : 'room',
      rect: { x: g.x, y: g.y, w: g.w, h: g.h },
      outline: shape,
      center: [g.x + g.w / 2, g.y + g.h / 2],
      zone: room._zone ?? null,
      role: room._layoutRole ?? null,
      isEntrance: !!room._isEntrance,
      isFinal: !!room.finalRoomDesc,
      contentType: room.contentType,
    };
  });

  // ── Vertical links: a stair, ladder, or shaft square in each room ──
  const verticals = [];
  for (const e of map.edges.filter(x => x.exitType?.startsWith('vertical:'))) {
    const ra = roomOf(e.fromId), rb = roomOf(e.toId);
    const form = ra.verticalExit?.form ?? rb.verticalExit?.form ?? 'stairs';
    for (const [r, dir, other] of [[ra, 'down', rb], [rb, 'up', ra]]) {
      verticals.push({ room: r._roomNumber, to: other._roomNumber, dir, kind: verticalKind(form), form, at: freeSquare(geo.get(r), passages, verticals, r._roomNumber) });
    }
  }

  // ── The way in from outside ──────────────────────────────────────
  // A short passage off the edge of the map, on a wall with nothing between
  // it and the outside (else the arrow reads as a door between two rooms);
  // with no such wall, a stair up to the surface inside the room.
  let entrance = null;
  const ent = rooms.find(r => r._isEntrance);
  if (ent) {
    const g = geo.get(ent);
    const preferred = SIDE_OF[ent._entranceDir];
    const sides = [...new Set([...(DIAGONAL.has(preferred) ? [...preferred] : preferred ? [preferred] : []), 'S', 'W', 'N', 'E'])];
    const others = [...geo.values()].filter(o => o !== g);
    const extent = {
      x0: Math.min(...[...geo.values()].map(o => o.x)), x1: Math.max(...[...geo.values()].map(o => o.x + o.w)),
      y0: Math.min(...[...geo.values()].map(o => o.y)), y1: Math.max(...[...geo.values()].map(o => o.y + o.h)),
    };
    const pts = passages.flatMap(p => sample(p.points));
    // Is the strip from this door out past everything else on the map empty?
    const clear = ([x, y], side) => {
      const [dx, dy] = VEC[side];
      const far = dx ? (dx > 0 ? extent.x1 + 1 : extent.x0 - 1) : (dy > 0 ? extent.y1 + 1 : extent.y0 - 1);
      const box = dx
        ? { x0: Math.min(x, far), x1: Math.max(x, far), y0: y - 1.2, y1: y + 1.2 }
        : { x0: x - 1.2, x1: x + 1.2, y0: Math.min(y, far), y1: Math.max(y, far) };
      const hits = (x0, x1, y0, y1) => x0 < box.x1 && x1 > box.x0 && y0 < box.y1 && y1 > box.y0;
      return !others.some(o => hits(o.x - 0.5, o.x + o.w + 0.5, o.y - 0.5, o.y + o.h + 0.5)) &&
             !pts.some(([px, py]) => hits(px - 0.5, px + 0.5, py - 0.5, py + 0.5) && !(Math.abs(px - x) < 0.6 && Math.abs(py - y) < 0.6));
    };
    const STUB = 3;
    for (const side of sides) {
      const len = wallLen(g, side);
      const slots = [...Array(len).keys()].filter(k => !g.taken[side].has(k))
        .sort((p, q) => Math.abs(p - (len - 1) / 2) - Math.abs(q - (len - 1) / 2));
      const k = slots.find(k => clear(doorPoint(g, side, k), side));
      if (k == null) continue;
      g.taken[side].add(k);
      const at = doorPoint(g, side, k);
      const [dx, dy] = VEC[side];
      entrance = { room: ent._roomNumber, side, at, points: [at, [at[0] + dx * STUB, at[1] + dy * STUB]] };
      break;
    }
    if (!entrance) entrance = { room: ent._roomNumber, side: null, stair: true, at: freeSquare(g, passages, verticals, ent._roomNumber) };
  }

  // ── Furnishings: pillars, altars, sarcophagi… from each room's text ──
  for (const shape of roomShapes) {
    const room = byNumber.get(shape.number);
    const doors = passages.flatMap(p => p.doors.filter(d => d.room === shape.number).map(d => d));
    if (entrance?.room === shape.number && !entrance.stair) doors.push({ side: entrance.side, at: entrance.at });
    shape.features = placeFeatures(room, shape, doors, verticals.filter(v => v.room === shape.number), rand);
  }

  // ── Terrain from the layout (voids, chasms, water…) ──────────────
  const terrain = (map.layout?.terrain ?? []).map(([key, kind]) => {
    const [cx, cy] = key.split(',').map(Number);
    return { kind, rect: { x: cols.start.get(cx), y: rows.start.get(cy), w: cols.size.get(cx), h: rows.size.get(cy) } };
  });

  // ── Bounds ───────────────────────────────────────────────────────
  const xs = [], ys = [];
  for (const r of roomShapes) { xs.push(r.rect.x, r.rect.x + r.rect.w); ys.push(r.rect.y, r.rect.y + r.rect.h); }
  for (const p of passages) for (const [x, y] of p.points) { xs.push(x); ys.push(y); }
  for (const [x, y] of entrance?.points ?? []) { xs.push(x); ys.push(y); }
  const margin = 3;
  const bounds = {
    x: Math.floor(Math.min(...xs)) - margin, y: Math.floor(Math.min(...ys)) - margin,
    w: Math.ceil(Math.max(...xs)) - Math.floor(Math.min(...xs)) + margin * 2,
    h: Math.ceil(Math.max(...ys)) - Math.floor(Math.min(...ys)) + margin * 2,
  };

  return { ftPerSquare: FT_PER_SQUARE, seed, bounds, rooms: roomShapes, passages, verticals, entrance, terrain, layout: map.layout?.id ?? null };
}

// Points every half square along a polyline.
function sample(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let j = 0; j <= n; j++) out.push([ax + (bx - ax) * j / n, ay + (by - ay) * j / n]);
  }
  return out;
}

function dedupe(points) {
  return points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
}

// An irregular closed outline inside the room's rect that passes through
// every door point, so passages meet the cave wall cleanly.
function cavernOutline(g, doors, rand) {
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  const rx = g.w / 2, ry = g.h / 2;
  const pts = [];
  const n = Math.max(10, Math.round((g.w + g.h) * 2));
  const angle = ([x, y]) => (Math.atan2(y - cy, x - cx) + Math.PI * 2) % (Math.PI * 2);
  const doorAngles = doors.map(angle);
  const near = t => Math.min(Math.PI, ...doorAngles.map(a => Math.min(Math.abs(t - a), Math.PI * 2 - Math.abs(t - a))));
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    // Swell out to the footprint around each door so passages meet a cave mouth.
    const swell = Math.max(0, 1 - near(t) / 0.55);
    const k = (0.78 + rand() * 0.22) * (1 - swell) + swell;
    // Superellipse-ish so caves fill their footprint rather than shrink to a circle.
    const c = Math.cos(t), s = Math.sin(t);
    const px = cx + rx * k * Math.sign(c) * Math.abs(c) ** 0.7;
    const py = cy + ry * k * Math.sign(s) * Math.abs(s) ** 0.7;
    pts.push({ t, p: [px, py] });
  }
  for (const d of doors) pts.push({ t: angle(d), p: d });
  return pts.sort((a, b) => a.t - b.t).map(x => x.p);
}

// A square inside the room, away from its doors and other markers.
function freeSquare(g, passages, verticals, number) {
  const doors = passages.flatMap(p => p.doors.filter(d => d.room === number).map(d => d.at));
  const used = verticals.filter(v => v.room === number).map(v => v.at);
  let best = null, bs = -Infinity;
  for (let x = 0; x < g.w; x++) for (let y = 0; y < g.h; y++) {
    const c = [g.x + x + 0.5, g.y + y + 0.5];
    if (used.some(u => u[0] === c[0] && u[1] === c[1])) continue;
    const s = Math.min(9, ...doors.map(d => Math.hypot(d[0] - c[0], d[1] - c[1])));
    if (s > bs) { bs = s; best = c; }
  }
  return best ?? [g.x + 0.5, g.y + 0.5];
}

// ── Furnishings ────────────────────────────────────────────────────

// What a room's own text says is in it, as map features. Order matters:
// the first matches win when a small room has space for only one or two.
const FEATURE_WORDS = [
  ['glyph',       /\bward\b|warding|binding circle|sigil|rune circle|summoning circle/i],
  ['altar',       /\baltar|shrine|sanctum|chapel|reliquary/i],
  ['throne',      /\bthrone/i],
  ['sarcophagus', /sarcophag|coffin|\btomb|burial|ossuary|crypt\b/i],
  ['pool',        /\bpool|fountain|spring\b|\bwell\b|basin|cistern/i],
  ['statue',      /statue|idol|effigy|gargoyle/i],
  ['brazier',     /brazier|forge|hearth|firepit|fire pit/i],
  ['table',       /\btable|banquet|feast|desk|workbench|library|bookshel|lectern/i],
  ['bed',         /\bbeds?\b|bunks?|barracks|sleeping/i],
  ['rubble',      /rubble|collapsed|cave-in|debris/i],
];

const ROLE_FEATURES = {
  ward: 'glyph', prison: 'glyph', demonstration: 'glyph', 'early sign': null,
  key: 'chest', asset: 'chest', "hunter's lair": 'bones', cache: 'chest', resource: 'pool',
  'contested chamber': 'barricade', barricade: 'barricade', 'border post': 'barricade',
  'lock-feature': 'altar', 'false goal': 'chest', reward: 'chest', valuable: 'chest',
};

function roomText(room) {
  return [
    room.special, room.specialDetail, room.specialExtra, room.feature, room.furnishing,
    room.trapType, room.hazard, room.obstacle, room.trick, room.weird, room.finalRoomDesc,
  ].filter(Boolean).join(' ');
}

export function featureKinds(room) {
  const kinds = [];
  for (const g of room?._gestalt ?? []) {
    const k = ROLE_FEATURES[g.role];
    if (k && !kinds.includes(k)) kinds.push(k);
  }
  const text = roomText(room ?? {});
  for (const [kind, re] of FEATURE_WORDS) if (re.test(text) && !kinds.includes(kind)) kinds.push(kind);
  if (room?.treasure && !kinds.includes('chest')) kinds.push('chest');
  return kinds;
}

function inOutline([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Place features on free squares: away from doorways, stairs, and the
// center (where the room number goes). Each feature is
// { kind, at: [x, y] (center, squares), w, h, rot (degrees) }.
function placeFeatures(room, shape, doors, verticals, rand) {
  if (!room || shape.kind === 'corridor') return [];
  const { x, y, w, h } = shape.rect;
  const squares = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
    const c = [x + i + 0.5, y + j + 0.5];
    if (shape.outline && !inOutline(c, shape.outline)) continue;
    squares.push({ i, j, c });
  }
  const key = (i, j) => `${i},${j}`;
  const blocked = new Set();
  for (const d of doors) {
    // The square just inside each doorway, and its neighbours along the wall.
    const ii = Math.min(w - 1, Math.max(0, Math.floor(d.at[0] - x - (d.side === 'E' ? 0.5 : 0))));
    const jj = Math.min(h - 1, Math.max(0, Math.floor(d.at[1] - y - (d.side === 'S' ? 0.5 : 0))));
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) blocked.add(key(ii + a, jj + b));
  }
  for (const v of verticals) blocked.add(key(Math.floor(v.at[0] - x), Math.floor(v.at[1] - y)));
  // The room number sits at the center.
  for (const ci of [Math.floor((w - 1) / 2), Math.ceil((w - 1) / 2)]) for (const cj of [Math.floor((h - 1) / 2), Math.ceil((h - 1) / 2)]) blocked.add(key(ci, cj));
  const free = () => squares.filter(s => !blocked.has(key(s.i, s.j)));
  const take = s => blocked.add(key(s.i, s.j));
  const onWall = s => s.i === 0 || s.j === 0 || s.i === w - 1 || s.j === h - 1;
  // The wall facing the first doorway is where an altar or throne goes.
  const main = doors[0]?.side ?? 'S';
  const far = { N: s => s.j === h - 1, S: s => s.j === 0, E: s => s.i === 0, W: s => s.i === w - 1 }[main] ?? (() => true);
  const pick = list => list[Math.floor(rand() * list.length)];

  const out = [];
  const add = (kind, s, extra = {}) => { take(s); out.push({ kind, at: s.c, w: 1, h: 1, rot: 0, ...extra }); };

  // Pillars in the larger halls, in rows a square in from the walls.
  const big = Math.min(w, h) >= 4 && shape.kind === 'room';
  const grand = ['hub', 'center', 'vault', 'antechamber', 'landmark'].includes(shape.role);
  if (big && (grand || rand() < 0.35)) {
    for (let i = 1; i < w - 1; i += 2) for (const j of [1, h - 2]) {
      const s = squares.find(q => q.i === i && q.j === j);
      if (s && !blocked.has(key(i, j))) out.push({ kind: 'pillar', at: [x + i, y + j], w: 0, h: 0, rot: 0 }), take(s);
    }
  }

  const kinds = featureKinds(room).slice(0, Math.min(w, h) >= 3 ? 3 : 1);
  for (const kind of kinds) {
    const cands = free();
    if (!cands.length) break;
    switch (kind) {
      case 'altar': case 'throne': {
        const s = pick(cands.filter(far).length ? cands.filter(far) : cands);
        add(kind, s, { rot: { N: 180, S: 0, E: 90, W: 270 }[main] ?? 0 });
        break;
      }
      case 'sarcophagus': {
        const wall = cands.filter(onWall);
        for (let n = 0; n < Math.min(3, Math.max(1, Math.floor((w + h) / 4))); n++) {
          const pool = wall.filter(s => !blocked.has(key(s.i, s.j)));
          if (!pool.length) break;
          const s = pick(pool);
          add(kind, s, { rot: s.i === 0 || s.i === w - 1 ? 0 : 90 });
        }
        break;
      }
      case 'bed': {
        const wall = cands.filter(onWall);
        for (let n = 0; n < 2 && wall.length; n++) {
          const pool = wall.filter(s => !blocked.has(key(s.i, s.j)));
          if (!pool.length) break;
          const s = pick(pool);
          add(kind, s, { rot: s.i === 0 || s.i === w - 1 ? 90 : 0 });
        }
        break;
      }
      case 'statue': {
        const corners = cands.filter(s => (s.i === 0 || s.i === w - 1) && (s.j === 0 || s.j === h - 1));
        add(kind, pick(corners.length ? corners : cands));
        break;
      }
      case 'chest': case 'bones': {
        const edge = cands.filter(onWall);
        add(kind, pick(edge.length ? edge : cands));
        break;
      }
      case 'glyph': case 'pool': {
        // Toward the middle (the number sits on top with a halo).
        const mid = [...cands].sort((a, b) => Math.hypot(a.i - (w - 1) / 2, a.j - (h - 1) / 2) - Math.hypot(b.i - (w - 1) / 2, b.j - (h - 1) / 2));
        add(kind, mid[0], { w: kind === 'pool' && Math.min(w, h) >= 4 ? 1.6 : 1 });
        break;
      }
      default:
        add(kind, pick(cands));
    }
  }
  return out;
}
