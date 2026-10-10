// Draws a FloorPlan (floorplan.js) as a hand-drawn, black-and-white dungeon
// map: white rooms on a faint 10-ft grid, rock shaded with clusters of hatch
// strokes along the walls, slightly irregular ink walls, door and stair
// symbols, and terrain for layout voids.
//
// Everything is plain SVG geometry (no filters), so it renders the same in
// browsers and in WeasyPrint for the module PDF. Seeded by the plan, so a
// module always draws the same map.

import { seededRandom } from './floorplan.js';

const INK = '#1b1b1b';
const SHADE = '#d9d6cf';
const GRID = '#c9c9c9';
const PAPER = '#ffffff';

const f = n => (Math.round(n * 100) / 100).toString();

// Text with a white halo, drawn as two copies (halo, then ink) because
// WeasyPrint ignores the SVG paint-order property.
function label(x, y, text, { size, bold = false, anchor = 'middle', halo = 0.18 } = {}) {
  const attrs = `x="${f(x)}" y="${f(y)}" font-family="Georgia, 'Times New Roman', serif"${bold ? ' font-weight="bold"' : ''} font-size="${f(size)}" text-anchor="${anchor}"`;
  return `<text ${attrs} fill="${PAPER}" stroke="${PAPER}" stroke-width="${f(size * halo)}" stroke-linejoin="round">${text}</text><text ${attrs} fill="${INK}">${text}</text>`;
}

export function renderHandDrawnMap(fp, { unit = 16, title = null } = {}) {
  const rand = seededRandom(fp.seed ^ 0x5eed);
  const b = fp.bounds;
  const U = unit;
  const X = x => (x - b.x) * U, Y = y => (y - b.y) * U;
  const W = b.w * U, H = b.h * U;

  // ── Floor shapes as polygons (squares) ──────────────────────────
  const roomPolys = fp.rooms.map(r => ({ room: r, poly: r.outline ?? rectPoly(r.rect) }));
  const passagePolys = fp.passages.map(p => ({ passage: p, poly: passagePolygon(p.points, 1, 0.45) }));
  const floorPolys = [...roomPolys.map(x => x.poly), ...passagePolys.map(x => x.poly)];

  const wob = (poly, amp = 0.045) => wobblyPath(poly, true, amp, rand, X, Y);
  const roomPaths = roomPolys.map(x => wob(x.poly, x.room.kind === 'cavern' ? 0.07 : 0.04));
  const passagePaths = passagePolys.map(x => wob(x.poly, 0.035));
  const floorD = [...roomPaths, ...passagePaths].join(' ');

  // ── Rasterize the floor to find the rock band along the walls ───
  const field = floorField(floorPolys, b, 4);

  // IDs unique to this map, so several maps can share one HTML page.
  const uid = `m${(fp.seed >>> 0).toString(36)}`;
  const o = [];
  o.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);

  // Terrain sits in the rock, under everything else.
  mergeTerrain(fp.terrain).forEach((t, i) => o.push(terrainSvg(t, rand, X, Y, U, `${uid}t${i}`)));

  // Light shadow strip, then rock hatching, hugging the walls.
  o.push(`<path d="${floorD}" fill="none" stroke="${SHADE}" stroke-width="${f(U * 0.9)}" stroke-linejoin="round"/>`);
  o.push(`<path d="${hatching(field, b, rand, X, Y, U)}" fill="none" stroke="${INK}" stroke-width="${f(U * 0.055)}" stroke-linecap="round"/>`);

  // Walls: everything stroked thick, then floors filled on top, so rooms
  // and passages merge into one outline with open doorways.
  o.push(`<path d="${floorD}" fill="${INK}" stroke="${INK}" stroke-width="${f(U * 0.22)}" stroke-linejoin="round"/>`);
  o.push(`<path d="${floorD}" fill="${PAPER}" stroke="none"/>`);

  // Faint 10-ft grid on the floor only.
  o.push(`<clipPath id="${uid}floor"><path d="${floorD}"/></clipPath>`);
  const grid = [];
  for (let x = Math.ceil(b.x); x <= b.x + b.w; x++) grid.push(`M${f(X(x))} 0V${f(H)}`);
  for (let y = Math.ceil(b.y); y <= b.y + b.h; y++) grid.push(`M0 ${f(Y(y))}H${f(W)}`);
  o.push(`<path d="${grid.join('')}" stroke="${GRID}" stroke-width="${f(U * 0.035)}" clip-path="url(#${uid}floor)"/>`);

  // Doors and passage markings.
  for (const p of fp.passages) o.push(passageMarks(p, X, Y, U));

  // Stairs, ladders, shafts.
  for (const v of fp.verticals) o.push(verticalSvg(v, X, Y, U));

  // The way in from outside.
  if (fp.entrance) o.push(entranceSvg(fp.entrance, X, Y, U));

  // Room numbers.
  for (const r of fp.rooms) {
    const size = r.kind === 'corridor' || Math.min(r.rect.w, r.rect.h) < 2 ? U * 0.62 : U * 0.95;
    o.push(label(X(r.center[0]), Y(r.center[1]) + size * 0.36, r.number, { size, bold: true }));
  }

  if (title) o.push(`<text x="${f(W / 2)}" y="${f(U * 1.4)}" font-family="Georgia, serif" font-weight="bold" font-size="${f(U * 1.1)}" text-anchor="middle" fill="${INK}">${escapeXml(title)}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}">${o.join('')}</svg>`;
}

// ── Geometry helpers ──────────────────────────────────────────────

function rectPoly({ x, y, w, h }) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

// A polyline thickened into a polygon (mitered joins), with its ends pushed
// `extend` squares past the doors so they tuck under the room fill.
export function passagePolygon(points, width, extend) {
  const pts = points.map(p => [...p]);
  const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  const d0 = unit(pts[1], pts[0]); pts[0] = [pts[0][0] + d0[0] * extend, pts[0][1] + d0[1] * extend];
  const n = pts.length;
  const d1 = unit(pts[n - 2], pts[n - 1]); pts[n - 1] = [pts[n - 1][0] + d1[0] * extend, pts[n - 1][1] + d1[1] * extend];
  const half = width / 2;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const dIn = i > 0 ? unit(pts[i - 1], pts[i]) : unit(pts[0], pts[1]);
    const dOut = i < n - 1 ? unit(pts[i], pts[i + 1]) : dIn;
    const nIn = [-dIn[1], dIn[0]], nOut = [-dOut[1], dOut[0]];
    // Miter: the bisector of the two normals, lengthened to keep the width.
    const m = [nIn[0] + nOut[0], nIn[1] + nOut[1]];
    const ml = Math.hypot(m[0], m[1]) || 1;
    const mu = [m[0] / ml, m[1] / ml];
    const k = half / Math.max(0.35, mu[0] * nOut[0] + mu[1] * nOut[1]);
    left.push([pts[i][0] + mu[0] * k, pts[i][1] + mu[1] * k]);
    right.push([pts[i][0] - mu[0] * k, pts[i][1] - mu[1] * k]);
  }
  return [...left, ...right.reverse()];
}

// A closed polygon as an SVG path with each edge subdivided and nudged a
// little off true, like a pen line.
function wobblyPath(poly, closed, amp, rand, X, Y) {
  const out = [];
  const m = poly.length;
  for (let i = 0; i < (closed ? m : m - 1); i++) {
    const a = poly[i], c = poly[(i + 1) % m];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const steps = Math.max(1, Math.round(len / 0.6));
    const nx = -(c[1] - a[1]) / (len || 1), ny = (c[0] - a[0]) / (len || 1);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const j = s === 0 ? 0 : (rand() - 0.5) * 2 * amp;
      out.push([a[0] + (c[0] - a[0]) * t + nx * j, a[1] + (c[1] - a[1]) * t + ny * j]);
    }
  }
  if (!closed) out.push(poly[m - 1]);
  return 'M' + out.map(([x, y]) => `${f(X(x))} ${f(Y(y))}`).join('L') + (closed ? 'Z' : '');
}

function pointInPoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Floor raster at `res` samples per square, with each sample's distance
// (in squares, approximate) to the nearest floor sample.
function floorField(polys, b, res) {
  const cols = Math.ceil(b.w * res), rows = Math.ceil(b.h * res);
  const floor = new Uint8Array(cols * rows);
  const boxes = polys.map(p => {
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const pt = [b.x + (i + 0.5) / res, b.y + (j + 0.5) / res];
    for (let k = 0; k < polys.length; k++) {
      const bx = boxes[k];
      if (pt[0] < bx[0] || pt[0] > bx[2] || pt[1] < bx[1] || pt[1] > bx[3]) continue;
      if (pointInPoly(pt, polys[k])) { floor[j * cols + i] = 1; break; }
    }
  }
  // Two-pass chamfer distance transform.
  const INF = 1e9, d = new Float32Array(cols * rows).fill(INF);
  for (let i = 0; i < floor.length; i++) if (floor[i]) d[i] = 0;
  const D1 = 1, D2 = Math.SQRT2;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + D1);
    if (j > 0) v = Math.min(v, d[k - cols] + D1);
    if (i > 0 && j > 0) v = Math.min(v, d[k - cols - 1] + D2);
    if (i < cols - 1 && j > 0) v = Math.min(v, d[k - cols + 1] + D2);
    d[k] = v;
  }
  for (let j = rows - 1; j >= 0; j--) for (let i = cols - 1; i >= 0; i--) {
    const k = j * cols + i; let v = d[k];
    if (i < cols - 1) v = Math.min(v, d[k + 1] + D1);
    if (j < rows - 1) v = Math.min(v, d[k + cols] + D1);
    if (i < cols - 1 && j < rows - 1) v = Math.min(v, d[k + cols + 1] + D2);
    if (i > 0 && j < rows - 1) v = Math.min(v, d[k + cols - 1] + D2);
    d[k] = v;
  }
  return { cols, rows, res, dist: (x, y) => {
    const i = Math.floor((x - b.x) * res), j = Math.floor((y - b.y) * res);
    if (i < 0 || j < 0 || i >= cols || j >= rows) return INF;
    return d[j * cols + i] / res;
  } };
}

// Clusters of 3–4 short parallel strokes at random angles in the rock just
// outside the walls — denser and longer near the wall, thinning outward.
function hatching(field, b, rand, X, Y, U) {
  const band = 1.45, spacing = 0.44;
  const d = [];
  for (let y = b.y; y < b.y + b.h; y += spacing) {
    for (let x = b.x; x < b.x + b.w; x += spacing) {
      const cx = x + (rand() - 0.5) * spacing * 0.9, cy = y + (rand() - 0.5) * spacing * 0.9;
      const dist = field.dist(cx, cy);
      if (dist <= 0.12 || dist > band) continue;
      if (dist > band * 0.6 && rand() < (dist - band * 0.6) / (band * 0.4)) continue;
      const ang = rand() * Math.PI;
      const ux = Math.cos(ang), uy = Math.sin(ang), px = -uy, py = ux;
      const n = 3 + (rand() < 0.4 ? 1 : 0);
      const len = 0.42 + rand() * 0.18;
      for (let s = 0; s < n; s++) {
        const off = (s - (n - 1) / 2) * 0.11;
        const l = len * (0.8 + rand() * 0.25);
        const sx = cx + px * off, sy = cy + py * off;
        d.push(`M${f(X(sx - ux * l / 2))} ${f(Y(sy - uy * l / 2))}L${f(X(sx + ux * l / 2))} ${f(Y(sy + uy * l / 2))}`);
      }
    }
  }
  return d.join('');
}

// ── Symbols ───────────────────────────────────────────────────────

// Door symbols sit across the passage where it meets the first room's wall.
function passageMarks(p, X, Y, U) {
  const out = [];
  const door = p.doors[0];
  const [x, y] = door.at;
  const across = door.side === 'N' || door.side === 'S' ? 'h' : 'v';  // wall direction
  const sw = f(U * 0.07);
  const box = (w, h, fill = '#fff') => across === 'h'
    ? `<rect x="${f(X(x) - w * U / 2)}" y="${f(Y(y) - h * U / 2)}" width="${f(w * U)}" height="${f(h * U)}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`
    : `<rect x="${f(X(x) - h * U / 2)}" y="${f(Y(y) - w * U / 2)}" width="${f(h * U)}" height="${f(w * U)}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`;
  switch (p.kind) {
    case 'door': out.push(box(0.8, 0.3)); break;
    case 'locked': out.push(box(0.8, 0.3), dot(X(x), Y(y), U * 0.07)); break;
    case 'sealed': out.push(box(0.9, 0.38, INK), box(0.6, 0.12)); break;
    case 'barred': out.push(box(0.8, 0.3), crossLine(x, y, across, X, Y, U)); break;
    case 'portcullis': {
      for (let i = -2; i <= 2; i++) {
        const cx = across === 'h' ? X(x + i * 0.18) : X(x), cy = across === 'h' ? Y(y) : Y(y + i * 0.18);
        out.push(dot(cx, cy, U * 0.065));
      }
      break;
    }
    case 'secret': {
      // A secret door reads as solid wall with an S across it.
      const wall = across === 'h'
        ? `M${f(X(x - 0.55))} ${f(Y(y))}H${f(X(x + 0.55))}`
        : `M${f(X(x))} ${f(Y(y - 0.55))}V${f(Y(y + 0.55))}`;
      out.push(`<path d="${wall}" stroke="${INK}" stroke-width="${f(U * 0.22)}"/>`);
      out.push(label(X(x), Y(y) + U * 0.27, 'S', { size: U * 0.75, bold: true, halo: 0.16 }));
      break;
    }
    case 'oneway': {
      // Arrow in the middle of the passage, pointing the only way through.
      const pts = p.points;
      const i = Math.max(1, Math.floor(pts.length / 2));
      const a = pts[i - 1], c = pts[i];
      const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      const ux = (c[0] - a[0]) / l, uy = (c[1] - a[1]) / l;
      const tip = [mx + ux * 0.32, my + uy * 0.32], back = [mx - ux * 0.25, my - uy * 0.25];
      const l1 = [back[0] - uy * 0.28, back[1] + ux * 0.28], l2 = [back[0] + uy * 0.28, back[1] - ux * 0.28];
      out.push(`<path d="M${f(X(tip[0]))} ${f(Y(tip[1]))}L${f(X(l1[0]))} ${f(Y(l1[1]))}L${f(X(l2[0]))} ${f(Y(l2[1]))}Z" fill="${INK}"/>`);
      out.push(box(0.8, 0.3));
      break;
    }
  }
  return out.join('');
}

function dot(cx, cy, r) {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${INK}"/>`;
}

function crossLine(x, y, across, X, Y, U) {
  return across === 'h'
    ? `<path d="M${f(X(x - 0.4))} ${f(Y(y))}H${f(X(x + 0.4))}" stroke="${INK}" stroke-width="${f(U * 0.06)}"/>`
    : `<path d="M${f(X(x))} ${f(Y(y - 0.4))}V${f(Y(y + 0.4))}" stroke="${INK}" stroke-width="${f(U * 0.06)}"/>`;
}

function verticalSvg(v, X, Y, U) {
  const [x, y] = v.at;
  const s = 0.8;  // symbol size in squares
  const x0 = X(x - s / 2), y0 = Y(y - s / 2), w = s * U;
  const out = [];
  const sw = f(U * 0.06);
  switch (v.kind) {
    case 'stairs': {
      // Treads narrowing toward the bottom of the flight.
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, inset = (v.dir === 'down' ? t : 1 - t) * w * 0.18;
        out.push(`<path d="M${f(x0 + inset)} ${f(y0 + t * w)}H${f(x0 + w - inset)}" stroke="${INK}" stroke-width="${sw}"/>`);
      }
      out.push(`<path d="M${f(x0)} ${f(y0)}V${f(y0 + w)}M${f(x0 + w)} ${f(y0)}V${f(y0 + w)}" stroke="${INK}" stroke-width="${sw}"/>`);
      break;
    }
    case 'ladder': {
      out.push(`<path d="M${f(x0 + w * 0.25)} ${f(y0)}V${f(y0 + w)}M${f(x0 + w * 0.75)} ${f(y0)}V${f(y0 + w)}" stroke="${INK}" stroke-width="${sw}"/>`);
      for (let i = 1; i <= 4; i++) out.push(`<path d="M${f(x0 + w * 0.25)} ${f(y0 + (i / 5) * w)}H${f(x0 + w * 0.75)}" stroke="${INK}" stroke-width="${sw}"/>`);
      break;
    }
    case 'climb': {
      const z = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t, i) => `${f(x0 + (i % 2 ? w * 0.75 : w * 0.25))} ${f(y0 + t * w)}`);
      out.push(`<path d="M${z.join('L')}" fill="none" stroke="${INK}" stroke-width="${sw}"/>`);
      break;
    }
    default: {
      // Shaft or pit: a dark hole with a rim.
      out.push(`<circle cx="${f(X(x))}" cy="${f(Y(y))}" r="${f(w * 0.45)}" fill="#fff" stroke="${INK}" stroke-width="${sw}"/>`);
      out.push(`<circle cx="${f(X(x))}" cy="${f(Y(y))}" r="${f(w * 0.3)}" fill="${INK}"/>`);
    }
  }
  // Where it leads, in small type.
  out.push(label(X(x), y0 + w + U * 0.42, `${v.dir === 'down' ? '↓' : '↑'} ${v.to}`, { size: U * 0.38, halo: 0.25 }));
  return out.join('');
}

function entranceSvg(e, X, Y, U) {
  const [x, y] = e.at;
  const out = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[e.side];
  const tail = [x + out[0] * 1.6, y + out[1] * 1.6];
  const head = [x + out[0] * 0.35, y + out[1] * 0.35];
  const px = -out[1], py = out[0];
  const h1 = [head[0] + out[0] * 0.45 + px * 0.3, head[1] + out[1] * 0.45 + py * 0.3];
  const h2 = [head[0] + out[0] * 0.45 - px * 0.3, head[1] + out[1] * 0.45 - py * 0.3];
  return `<path d="M${f(X(tail[0]))} ${f(Y(tail[1]))}L${f(X(head[0]))} ${f(Y(head[1]))}" stroke="${INK}" stroke-width="${f(U * 0.12)}"/>`
    + `<path d="M${f(X(head[0]))} ${f(Y(head[1]))}L${f(X(h1[0]))} ${f(Y(h1[1]))}L${f(X(h2[0]))} ${f(Y(h2[1]))}Z" fill="${INK}"/>`;
}

// ── Terrain ──────────────────────────────────────────────────────

// Adjacent terrain blocks of the same kind form one region (a list of blocks).
function mergeTerrain(blocks) {
  const groups = [];
  const touches = (a, b) => a.kind === b.kind &&
    a.rect.x <= b.rect.x + b.rect.w && b.rect.x <= a.rect.x + a.rect.w &&
    a.rect.y <= b.rect.y + b.rect.h && b.rect.y <= a.rect.y + a.rect.h;
  for (const t of blocks) {
    const hit = groups.filter(g => g.some(m => touches(m, t)));
    const merged = [t, ...hit.flat()];
    for (const g of hit) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  return groups;
}

// One terrain region: each block drawn as a rough rectangle — inset on its
// open sides, overlapping its neighbours — stroked, then all filled on top,
// so the region reads as one shape with a single irregular shore.
function terrainSvg(group, rand, X, Y, U, id) {
  const kind = group[0].kind;
  const overlaps = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0;
  const shares = (a, b, side) => {
    const ra = a.rect, rb = b.rect;
    switch (side) {
      case 'N': return rb.y + rb.h === ra.y && overlaps(ra.x, ra.x + ra.w, rb.x, rb.x + rb.w);
      case 'S': return ra.y + ra.h === rb.y && overlaps(ra.x, ra.x + ra.w, rb.x, rb.x + rb.w);
      case 'W': return rb.x + rb.w === ra.x && overlaps(ra.y, ra.y + ra.h, rb.y, rb.y + rb.h);
      case 'E': return ra.x + ra.w === rb.x && overlaps(ra.y, ra.y + ra.h, rb.y, rb.y + rb.h);
    }
  };
  const INSET = 0.7, JOIN = -0.2, CHAMFER = 0.8;
  const paths = group.map(t => {
    const open = side => !group.some(o => o !== t && shares(t, o, side));
    const off = side => (open(side) ? INSET : JOIN);
    const { x, y, w, h } = t.rect;
    const x0 = x + off('W'), x1 = x + w - off('E'), y0 = y + off('N'), y1 = y + h - off('S');
    // Chamfered corners where both sides are open, for a less boxy shore.
    const poly = [];
    const corner = (isOpen, p, a, b) => (isOpen ? poly.push(a, b) : poly.push(p));
    corner(open('N') && open('W'), [x0, y0], [x0, y0 + CHAMFER], [x0 + CHAMFER, y0]);
    corner(open('N') && open('E'), [x1, y0], [x1 - CHAMFER, y0], [x1, y0 + CHAMFER]);
    corner(open('S') && open('E'), [x1, y1], [x1, y1 - CHAMFER], [x1 - CHAMFER, y1]);
    corner(open('S') && open('W'), [x0, y1], [x0 + CHAMFER, y1], [x0, y1 - CHAMFER]);
    return wobblyPath(poly, true, 0.12, rand, X, Y);
  });
  const d = paths.join(' ');
  const gx0 = Math.min(...group.map(t => t.rect.x)), gy0 = Math.min(...group.map(t => t.rect.y));
  const gx1 = Math.max(...group.map(t => t.rect.x + t.rect.w)), gy1 = Math.max(...group.map(t => t.rect.y + t.rect.h));
  const fill = [];
  const scatter = (spacing, draw) => {
    for (let yy = gy0; yy < gy1; yy += spacing) for (let xx = gx0; xx < gx1; xx += spacing) fill.push(draw(xx, yy));
  };
  const region = (fillColor, edge) => `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="${f(U * edge)}" stroke-linejoin="round"/><path d="${d}" fill="${fillColor}"/>`;
  const pattern = () => `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${fill.join('')}</g>`;
  switch (kind) {
    case 'water':
      scatter(0.55, (xx, yy) => rand() < 0.45 ? `<path d="M${f(X(xx))} ${f(Y(yy))}q${f(U * 0.12)} ${f(-U * 0.1)} ${f(U * 0.25)} 0t${f(U * 0.25)} 0" fill="none" stroke="#7d8a96" stroke-width="${f(U * 0.04)}"/>` : '');
      return region('#eef2f5', 0.14) + pattern();
    case 'chasm':
    case 'pit':
      return region(INK, 0.14);
    case 'magma':
      scatter(0.7, (xx, yy) => rand() < 0.5 ? `<path d="M${f(X(xx))} ${f(Y(yy))}l${f(U * (rand() * 0.5))} ${f(U * (rand() * 0.5))}" stroke="#fff" stroke-width="${f(U * 0.05)}"/>` : '');
      return region('#3b3b3b', 0.14) + pattern();
    case 'rubble':
      scatter(0.6, (xx, yy) => rand() < 0.6 ? `<circle cx="${f(X(xx + rand() * 0.4))}" cy="${f(Y(yy + rand() * 0.4))}" r="${f(U * (0.06 + rand() * 0.12))}" fill="#fff" stroke="${INK}" stroke-width="${f(U * 0.04)}"/>` : '');
      return region('#f3f1ec', 0.1) + pattern();
    default:  // courtyard, open ground
      scatter(0.9, (xx, yy) => rand() < 0.35 ? `<path d="M${f(X(xx))} ${f(Y(yy))}l${f(U * 0.06)} ${f(-U * 0.18)}M${f(X(xx + 0.08))} ${f(Y(yy))}l${f(U * 0.02)} ${f(-U * 0.22)}M${f(X(xx + 0.16))} ${f(Y(yy))}l${f(-U * 0.04)} ${f(-U * 0.17)}" stroke="#666" stroke-width="${f(U * 0.04)}"/>` : '');
      return region('#fbfbf8', 0.1) + pattern();
  }
}

function escapeXml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
