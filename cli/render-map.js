// SVG dungeon map renderer — no dependencies, pure JS.
// Outputs SVG strings embeddable in markdown as base64 data URIs.
//
// renderSvgMap(map, rooms)     → overall dungeon map SVG string
// renderMiniMap(n, map, rooms) → per-room connection mini-map SVG string
// svgToEmbed(svg, alt)         → <img src="data:..."> markdown string

// ── Direction tables ──────────────────────────────────────────────

const DIR = {
  North:     [0,-1], South:     [0, 1],
  East:      [1, 0], West:      [-1,0],
  Northeast: [1,-1], Northwest: [-1,-1],
  Southeast: [1, 1], Southwest: [-1, 1],
};

const OPP = {
  North:'South', South:'North', East:'West', West:'East',
  Northeast:'Southwest', Southwest:'Northeast',
  Northwest:'Southeast', Southeast:'Northwest',
};

const CARDINAL = new Set(['North','South','East','West']);

// ── Color palette — ink on parchment ─────────────────────────────

const C = {
  bg:    '#f0ead6',  // aged parchment
  floor: '#faf8f0',  // stone floor (near-white)
  wall:  '#1a1208',  // warm near-black ink
  grid:  '#d4c5a0',  // subtle warm grid lines
};

// Barely-there type tints — just enough to distinguish at a glance
const TINT = {
  monster:  '#fdf0f0', trap:     '#fdf6e8', hazard:   '#fdfae6',
  special:  '#f4edfd', npc:      '#eaf2fd', empty:    '#faf8f0',
  trick:    '#eafcf3', obstacle: '#fdf0e8', weird:    '#fbeafc',
};

// Accent colors used for type labels in the legend
const BADGE = {
  monster:'#b03030', trap:'#c07000', hazard:'#808000',
  special:'#7030a0', npc:'#2060a0', empty:'#606060',
  trick:'#307060', obstacle:'#805040', weird:'#8030a0',
};

// ── Room sizing ───────────────────────────────────────────────────
// Larger rooms for special/boss encounters; smaller for empty.
// Small deterministic jitter per room number avoids visual monotony.

const TYPE_DIMS = {
  monster:  [82, 58], special:  [94, 68], trap:     [70, 50],
  hazard:   [70, 50], trick:    [76, 54], npc:      [80, 56],
  empty:    [66, 46], obstacle: [74, 52], weird:    [86, 62],
};

const DIAGONAL_DIRS = new Set(['Northeast','Northwest','Southeast','Southwest']);

function roomDims(type, num, node) {
  if (node?.roomType === 'corridor') {
    const dir = node.entryDir;
    if (DIAGONAL_DIRS.has(dir)) return [28, 28]; // diagonal junction — small square
    const isEW = dir === 'East' || dir === 'West';
    return isEW ? [54, 18] : [18, 54]; // wide+short for E-W, narrow+tall for N-S
  }
  const [bw, bh] = TYPE_DIMS[type] ?? [78, 56];
  const jx = (((num * 1234567) >>> 0) % 10) - 5; // ±5 px
  return [bw + jx, bh + Math.round(jx * 0.65)];
}

// ── Layout constants ──────────────────────────────────────────────

const RW_BASE = 78, RH_BASE = 56; // used for canvas sizing / center offsets
const XS = 134, YS = 104;         // center-to-center stride
const PAD = 72;                    // canvas padding
const CWIDTH = 10;                 // corridor width in px

// ── Helpers ───────────────────────────────────────────────────────

function edgePt(cx, cy, dir, hw, hh) {
  const E = {
    North:     [cx,      cy-hh],
    South:     [cx,      cy+hh],
    East:      [cx+hw,   cy],
    West:      [cx-hw,   cy],
    Northeast: [cx+hw,   cy-hh],
    Northwest: [cx-hw,   cy-hh],
    Southeast: [cx+hw,   cy+hh],
    Southwest: [cx-hw,   cy+hh],
  };
  return E[dir] ?? [cx, cy];
}

function f(n) { return n.toFixed(1); }

export function svgToEmbed(svg, alt = 'Map') {
  const b64 = Buffer.from(svg, 'utf8').toString('base64');
  return `<img src="data:image/svg+xml;base64,${b64}" alt="${alt}" style="max-width:100%;display:block;margin:0.75em 0">`;
}

// ── Overall dungeon map ───────────────────────────────────────────

export function renderSvgMap(map, rooms) {
  if (!map?.nodes?.size) return null;

  const nodes  = [...map.nodes.values()];
  const byPos  = new Map(nodes.map(n => [`${n.x},${n.y}`, n]));
  const byNum  = new Map(rooms.map(r => [r._roomNumber, r]));

  let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity;
  for (const n of nodes) {
    x0=Math.min(x0,n.x); x1=Math.max(x1,n.x);
    y0=Math.min(y0,n.y); y1=Math.max(y1,n.y);
  }

  const W = PAD*2 + (x1-x0)*XS + RW_BASE;
  const H = PAD*2 + (y1-y0)*YS + RH_BASE + 56; // +56 for legend strip
  const nc = n => [PAD + (n.x-x0)*XS + RW_BASE/2, PAD + (n.y-y0)*YS + RH_BASE/2];

  const o = [];

  // SVG defs — grid pattern
  o.push(`<defs>
  <pattern id="g" width="${XS}" height="${YS}" patternUnits="userSpaceOnUse" x="${PAD + RW_BASE/2}" y="${PAD + RH_BASE/2}">
    <line x1="0" y1="0" x2="${XS}" y2="0" stroke="${C.grid}" stroke-width="0.4"/>
    <line x1="0" y1="0" x2="0" y2="${YS}" stroke="${C.grid}" stroke-width="0.4"/>
  </pattern>
</defs>`);

  // Background + grid + double-line border
  o.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
  o.push(`<rect width="${W}" height="${H}" fill="url(#g)"/>`);
  o.push(`<rect x="6" y="6" width="${W-12}" height="${H-12}" fill="none" stroke="${C.wall}" stroke-width="2"/>`);
  o.push(`<rect x="10" y="10" width="${W-20}" height="${H-20}" fill="none" stroke="${C.wall}" stroke-width="0.7"/>`);

  // ── Corridors (rendered before rooms so rooms paint over the ends) ──
  const seenEdge = new Set();
  const seenVert = new Set();

  for (const n of nodes) {
    const [cx, cy] = nc(n);
    const room = byNum.get(n.roomNumber);
    const [rw_a, rh_a] = roomDims(room?.contentType, n.roomNumber, n);

    for (const ex of room?.exits ?? []) {
      const off = DIR[ex.direction]; if (!off) continue;
      const nb = byPos.get(`${n.x+off[0]},${n.y+off[1]}`); if (!nb) continue;
      const key = [n.roomNumber, nb.roomNumber].sort((a,b)=>a-b).join('-');
      if (seenEdge.has(key)) continue; seenEdge.add(key);

      const [nx, ny] = nc(nb);
      const nbRoom = byNum.get(nb.roomNumber);
      const [rw_b, rh_b] = roomDims(nbRoom?.contentType, nb.roomNumber, nb);

      const [ax, ay] = edgePt(cx, cy, ex.direction, rw_a/2, rh_a/2);
      const [bx, by] = edgePt(nx, ny, OPP[ex.direction], rw_b/2, rh_b/2);

      const t = (ex.type ?? '').toLowerCase();
      const isSecret  = t.includes('secret');
      const isPassage = t.includes('passage') || t.includes('arch') || t.includes('open');

      if (isSecret) {
        // Secret door: dashed line + S-circle at midpoint
        o.push(`<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}" stroke="${C.wall}" stroke-width="1.5" stroke-dasharray="4,4"/>`);
        const mx=(ax+bx)/2, my=(ay+by)/2;
        o.push(`<circle cx="${f(mx)}" cy="${f(my)}" r="7" fill="${C.bg}" stroke="${C.wall}" stroke-width="1.5"/>`);
        o.push(`<text x="${f(mx)}" y="${f(my+3.5)}" text-anchor="middle" font-family="Georgia,serif" font-size="9" font-weight="bold" fill="${C.wall}">S</text>`);

      } else {
        // Cardinal and diagonal: double-line corridor with floor fill
        const dx = bx-ax, dy = by-ay;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len < 2) continue;
        const half = CARDINAL.has(ex.direction) ? CWIDTH/2 : CWIDTH*0.6/2;
        const px = -(dy/len) * half;
        const py =  (dx/len) * half;
        const isDiag = !CARDINAL.has(ex.direction);

        // Floor fill
        o.push(`<polygon points="${f(ax+px)},${f(ay+py)} ${f(bx+px)},${f(by+py)} ${f(bx-px)},${f(by-py)} ${f(ax-px)},${f(ay-py)}" fill="${C.floor}"/>`);
        // Side walls
        const sw = isDiag ? 1.2 : 1.5;
        const dash = isDiag ? ' stroke-dasharray="5,3"' : '';
        o.push(`<line x1="${f(ax+px)}" y1="${f(ay+py)}" x2="${f(bx+px)}" y2="${f(by+py)}" stroke="${C.wall}" stroke-width="${sw}"${dash}/>`);
        o.push(`<line x1="${f(ax-px)}" y1="${f(ay-py)}" x2="${f(bx-px)}" y2="${f(by-py)}" stroke="${C.wall}" stroke-width="${sw}"${dash}/>`);

        // Door symbol: perpendicular tick at midpoint (omit for open passages)
        if (!isPassage && !isDiag) {
          const mx=(ax+bx)/2, my=(ay+by)/2;
          const scale = 1.45; // tick extends slightly beyond corridor walls
          o.push(`<line x1="${f(mx+px*scale)}" y1="${f(my+py*scale)}" x2="${f(mx-px*scale)}" y2="${f(my-py*scale)}" stroke="${C.wall}" stroke-width="2.5"/>`);
        }
      }
    }
  }

  // ── Vertical connections ──
  for (const e of map.edges ?? []) {
    if (!e.exitType?.startsWith('vertical:')) continue;
    const key = [e.fromId, e.toId].sort().join('-');
    if (seenVert.has(key)) continue; seenVert.add(key);
    const na = map.nodes.get(e.fromId), nb = map.nodes.get(e.toId);
    if (!na || !nb) continue;
    const [ax, ay] = nc(na), [bx, by] = nc(nb);
    const mx=(ax+bx)/2, my=(ay+by)/2;
    const sym = e.exitType==='vertical:down' ? '▼' : e.exitType==='vertical:up' ? '▲' : '↕';
    o.push(`<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}" stroke="${C.wall}" stroke-width="1.5" stroke-dasharray="6,4"/>`);
    o.push(`<rect x="${f(mx-11)}" y="${f(my-9)}" width="22" height="18" rx="2" fill="${C.bg}" stroke="${C.wall}" stroke-width="1.2"/>`);
    o.push(`<text x="${f(mx)}" y="${f(my+5)}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${C.wall}">${sym}</text>`);
  }

  // ── Room boxes ──
  for (const n of nodes) {
    const [cx, cy] = nc(n);
    const room = byNum.get(n.roomNumber);
    const type = room?.contentType ?? 'empty';
    const [rw, rh] = roomDims(type, n.roomNumber, n);
    const x = cx-rw/2, y = cy-rh/2;
    const isCorridor = n.roomType === 'corridor';

    if (isCorridor) {
      // Corridors: thin outline only, no fill chrome, small number
      o.push(`<rect x="${f(x)}" y="${f(y)}" width="${rw}" height="${rh}" fill="${C.floor}" stroke="${C.wall}" stroke-width="1.5"/>`);
      // Number — smaller to fit the narrow shape
      const fs = Math.min(rw, rh) < 26 ? 9 : 11;
      o.push(`<text x="${f(cx)}" y="${f(cy+1)}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="${fs}" font-weight="bold" fill="${C.wall}" opacity="0.7">${n.roomNumber}</text>`);
    } else {
      const ent  = room?._isEntrance;
      const base = room?._factionBase;

      // Entrance: outer dashed ring (drawn before room fill)
      if (ent) {
        o.push(`<rect x="${f(x-5)}" y="${f(y-5)}" width="${rw+10}" height="${rh+10}" fill="none" stroke="${C.wall}" stroke-width="1.5" stroke-dasharray="5,3"/>`);
      }

      // Room fill + thick wall border (no rounded corners)
      o.push(`<rect x="${f(x)}" y="${f(y)}" width="${rw}" height="${rh}" fill="${TINT[type]??C.floor}" stroke="${C.wall}" stroke-width="2"/>`);
      // Thin inner inset line — suggests chiseled stonework
      o.push(`<rect x="${f(x+3)}" y="${f(y+3)}" width="${rw-6}" height="${rh-6}" fill="none" stroke="${C.wall}" stroke-width="0.5" opacity="0.35"/>`);

      // Room number — large, bold, centered
      o.push(`<text x="${f(cx)}" y="${f(cy+2)}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="17" font-weight="bold" fill="${C.wall}">${n.roomNumber}</text>`);

      // Type initial — bottom-right corner, colored accent
      if (type !== 'empty') {
        const abbr = type[0].toUpperCase();
        o.push(`<text x="${f(x+rw-4)}" y="${f(y+rh-3)}" text-anchor="end" dominant-baseline="auto" font-family="sans-serif" font-size="8" font-weight="bold" fill="${BADGE[type]??'#606060'}" opacity="0.8">${abbr}</text>`);
      }

      // Faction base — diamond in top-right corner
      if (base) {
        o.push(`<text x="${f(x+rw-2)}" y="${f(y+13)}" text-anchor="end" font-family="sans-serif" font-size="12" fill="#7030a0">◆</text>`);
      }
    }
  }

  // ── Legend strip ──
  const ly = H - 38;
  let lx = PAD;

  const legendTypes = [...new Set(rooms.map(r=>r.contentType).filter(t => t && t !== 'empty' && TINT[t]))];
  for (const t of legendTypes) {
    if (lx > W - 240) break;
    const label = t[0].toUpperCase() + t.slice(1);
    o.push(`<rect x="${lx}" y="${ly}" width="12" height="12" fill="${TINT[t]}" stroke="${BADGE[t]}" stroke-width="1.5"/>`);
    o.push(`<text x="${lx+16}" y="${ly+9.5}" font-family="sans-serif" font-size="9" fill="${C.wall}">${label}</text>`);
    lx += label.length * 5.5 + 26;
  }

  // Separator dot
  if (legendTypes.length > 0 && lx < W - 200) {
    o.push(`<text x="${lx}" y="${ly+9.5}" font-family="sans-serif" font-size="9" fill="${C.wall}" opacity="0.5">·</text>`);
    lx += 10;
  }

  // Connection key items
  const connKeys = [
    { label:'Door', w:50, els: mx => [
        `<line x1="${mx}" y1="${ly+6}" x2="${mx+18}" y2="${ly+6}" stroke="${C.wall}" stroke-width="1.5"/>`,
        `<line x1="${mx+9}" y1="${ly+1}" x2="${mx+9}" y2="${ly+11}" stroke="${C.wall}" stroke-width="2.5"/>`,
    ]},
    { label:'Passage', w:66, els: mx => [
        `<line x1="${mx}" y1="${ly+6}" x2="${mx+18}" y2="${ly+6}" stroke="${C.wall}" stroke-width="1.5"/>`,
    ]},
    { label:'Secret', w:58, els: mx => [
        `<line x1="${mx}" y1="${ly+6}" x2="${mx+18}" y2="${ly+6}" stroke="${C.wall}" stroke-width="1.2" stroke-dasharray="4,4"/>`,
        `<circle cx="${mx+9}" cy="${ly+6}" r="5" fill="${C.bg}" stroke="${C.wall}" stroke-width="1"/>`,
        `<text x="${mx+9}" y="${ly+9}" text-anchor="middle" font-family="Georgia,serif" font-size="7" font-weight="bold" fill="${C.wall}">S</text>`,
    ]},
  ];
  if (seenVert.size > 0) connKeys.push({ label:'Stairs', w:56, els: mx => [
    `<line x1="${mx}" y1="${ly+6}" x2="${mx+18}" y2="${ly+6}" stroke="${C.wall}" stroke-width="1.2" stroke-dasharray="5,4"/>`,
    `<text x="${mx+9}" y="${ly+10}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="${C.wall}">▼</text>`,
  ]});
  if (rooms.some(r=>r._isEntrance)) connKeys.push({ label:'Entrance', w:66, els: mx => [
    `<rect x="${mx}" y="${ly+1}" width="12" height="10" fill="none" stroke="${C.wall}" stroke-width="1.2" stroke-dasharray="4,2"/>`,
  ]});
  if (rooms.some(r=>r._factionBase)) connKeys.push({ label:'Faction', w:60, els: mx => [
    `<text x="${mx+6}" y="${ly+11}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#7030a0">◆</text>`,
  ]});

  for (const { label, w, els } of connKeys) {
    if (lx + w > W - PAD + 24) break;
    for (const el of els(lx)) o.push(el);
    o.push(`<text x="${lx+22}" y="${ly+9.5}" font-family="sans-serif" font-size="9" fill="${C.wall}">${label}</text>`);
    lx += w;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="font-size:0">\n${o.join('\n')}\n</svg>`;
}

// ── Per-room mini-map ─────────────────────────────────────────────

const MSX = 58, MSY = 46;   // stride from center to neighbor center
const MW  = 192, MH = 156;
const MCX = MW/2, MCY = MH/2;

// Minimap box dims for a given node (corridor-aware, scaled down from main map)
function miniDims(node, base = false) {
  if (node?.roomType === 'corridor') {
    const dir = node.entryDir;
    if (DIAGONAL_DIRS.has(dir)) return [18, 18];
    const isEW = dir === 'East' || dir === 'West';
    return isEW ? [46, 12] : [12, 46];
  }
  return base ? [40, 30] : [32, 24]; // center room is slightly larger
}

export function renderMiniMap(roomNumber, map, rooms) {
  if (!map?.nodes?.size) return null;

  const nodes  = [...map.nodes.values()];
  const byPos  = new Map(nodes.map(n => [`${n.x},${n.y}`, n]));
  const byNum  = new Map(rooms.map(r => [r._roomNumber, r]));
  const nByNum = new Map(nodes.map(n => [n.roomNumber, n]));

  const cn   = nByNum.get(roomNumber); if (!cn) return null;
  const room = byNum.get(roomNumber);
  const exits = room?.exits ?? [];

  const [CRW, CRH] = miniDims(cn, true);

  const o = [];
  o.push(`<rect width="${MW}" height="${MH}" fill="${C.bg}" rx="4"/>`);
  o.push(`<rect x="0.5" y="0.5" width="${MW-1}" height="${MH-1}" fill="none" stroke="${C.wall}" stroke-width="1.5" rx="4"/>`);

  // ── Neighbors (drawn first so center room paints on top) ──
  for (const ex of exits) {
    const off = DIR[ex.direction]; if (!off) continue;
    const nb  = byPos.get(`${cn.x+off[0]},${cn.y+off[1]}`); if (!nb) continue;

    const nx = MCX + off[0]*MSX;
    const ny = MCY + off[1]*MSY;
    const [NRW, NRH] = miniDims(nb);

    // Connection line — endpoints use actual box sizes so lines meet the edges precisely
    const ax = MCX + off[0]*(CRW/2), ay = MCY + off[1]*(CRH/2);
    const bx = nx  - off[0]*(NRW/2), by = ny  - off[1]*(NRH/2);
    const t = (ex.type ?? '').toLowerCase();
    const dash = t.includes('secret') ? ' stroke-dasharray="3,3"' : '';
    o.push(`<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}" stroke="${C.wall}" stroke-width="1.2"${dash}/>`);

    // Direction label at midpoint
    const lx=(ax+bx)/2, ly=(ay+by)/2;
    const dl = ex.direction.match(/[A-Z]/g).join('');
    o.push(`<text x="${f(lx)}" y="${f(ly-2)}" text-anchor="middle" font-family="sans-serif" font-size="7" fill="${C.wall}" opacity="0.55">${dl}</text>`);

    // Neighbor box — corridor-aware
    const nbCorridor = nb.roomType === 'corridor';
    const nbRoom = byNum.get(nb.roomNumber);
    const nt = nbRoom?.contentType ?? 'empty';
    if (nbCorridor) {
      o.push(`<rect x="${f(nx-NRW/2)}" y="${f(ny-NRH/2)}" width="${NRW}" height="${NRH}" fill="${C.floor}" stroke="${C.wall}" stroke-width="0.8"/>`);
    } else {
      o.push(`<rect x="${f(nx-NRW/2)}" y="${f(ny-NRH/2)}" width="${NRW}" height="${NRH}" fill="${TINT[nt]??C.floor}" stroke="${C.wall}" stroke-width="1.2"/>`);
    }
    const numFs = Math.min(NRW, NRH) < 18 ? 8 : 11;
    o.push(`<text x="${f(nx)}" y="${f(ny+3)}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="${numFs}" font-weight="bold" fill="${C.wall}"${nbCorridor?' opacity="0.7"':''}>${nb.roomNumber}</text>`);
  }

  // ── Vertical edge connections (stairs/pits not in room.exits) ──
  for (const e of map.edges ?? []) {
    if (!e.exitType?.startsWith('vertical:')) continue;
    const isFrom = e.fromId === cn.id, isTo = e.toId === cn.id;
    if (!isFrom && !isTo) continue;

    // fromId is always the upper-level room; toId is the lower-level room.
    let sym;
    if (e.exitType === 'vertical:up') sym = isFrom ? '▲' : '▼';
    else                              sym = isFrom ? '▼' : '▲'; // down or both

    const goDown = sym === '▼';
    const neighborId   = isFrom ? e.toId : e.fromId;
    const neighborNode = map.nodes.get(neighborId);
    const neighborNum  = neighborNode?.roomNumber;

    // Dashed line from center room edge to a neighbor box above/below.
    const NBW = 18, NBH = 18;
    const lineY1 = MCY + (goDown ?  CRH/2 : -CRH/2);
    const boxCY  = MCY + (goDown ?  CRH/2 + 14 + NBH/2 : -CRH/2 - 14 - NBH/2);
    const lineY2 = boxCY + (goDown ? -NBH/2 : NBH/2);

    o.push(`<line x1="${f(MCX)}" y1="${f(lineY1)}" x2="${f(MCX)}" y2="${f(lineY2)}" stroke="${C.wall}" stroke-width="1" stroke-dasharray="3,3"/>`);

    // Arrow symbol on the line
    const symY = (lineY1 + lineY2) / 2 + 3;
    o.push(`<text x="${f(MCX)}" y="${f(symY)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="${C.wall}">${sym}</text>`);

    // Neighbor box with room number
    if (neighborNum != null) {
      const nbRoom = byNum.get(neighborNum);
      const nt = nbRoom?.contentType ?? 'empty';
      o.push(`<rect x="${f(MCX - NBW/2)}" y="${f(boxCY - NBH/2)}" width="${NBW}" height="${NBH}" fill="${TINT[nt]??C.floor}" stroke="${C.wall}" stroke-width="0.8"/>`);
      o.push(`<text x="${f(MCX)}" y="${f(boxCY)}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="11" font-weight="bold" fill="${C.wall}" opacity="0.7">${neighborNum}</text>`);
    }
  }

  // ── Center room (on top) ──
  const type = room?.contentType ?? 'empty';
  if (cn.roomType === 'corridor') {
    o.push(`<rect x="${f(MCX-CRW/2)}" y="${f(MCY-CRH/2)}" width="${CRW}" height="${CRH}" fill="${C.floor}" stroke="${C.wall}" stroke-width="1.5"/>`);
    const numFs = Math.min(CRW, CRH) < 18 ? 9 : 11;
    o.push(`<text x="${f(MCX)}" y="${f(MCY+1)}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="${numFs}" font-weight="bold" fill="${C.wall}" opacity="0.7">${roomNumber}</text>`);
  } else {
    o.push(`<rect x="${f(MCX-CRW/2)}" y="${f(MCY-CRH/2)}" width="${CRW}" height="${CRH}" fill="${TINT[type]??C.floor}" stroke="${C.wall}" stroke-width="2"/>`);
    o.push(`<text x="${f(MCX)}" y="${f(MCY+4)}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="13" font-weight="bold" fill="${C.wall}">${roomNumber}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MW} ${MH}" width="${MW}" height="${MH}">\n${o.join('\n')}\n</svg>`;
}
