import { generateEncounter, loadMonsters } from './encounters/generator.js';
import { stockRoom, generateDungeon, getCurrentDungeon, setCurrentDungeon, generateWanderingTable } from './dungeons/generator.js';

// ── Encounter UI ──────────────────────────────────────────────────
const selRegion  = document.getElementById('sel-region');
const selTerrain = document.getElementById('sel-terrain');
const selTime    = document.getElementById('sel-time');
const selFire    = document.getElementById('sel-fire');
const fireRow    = document.getElementById('fire-row');
const terrainRow = document.getElementById('terrain-row');
const outputEncounter = document.getElementById('output-encounter');

// ── UI persistence ────────────────────────────────────────────────
const PERSIST_KEY = 'fald-ui';
const PERSISTED_SELECTS = ['sel-region', 'sel-terrain', 'sel-time', 'sel-fire', 'sel-party-level'];

function saveUI() {
  const state = {
    module: document.querySelector('.module-tab.active')?.dataset.module ?? 'dolmenwood',
    selects: Object.fromEntries(
      PERSISTED_SELECTS.map(id => [id, document.getElementById(id).value])
    ),
  };
  localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
}

function restoreUI() {
  let state;
  try { state = JSON.parse(localStorage.getItem(PERSIST_KEY)); } catch { return; }
  if (!state) return;
  for (const [id, value] of Object.entries(state.selects ?? {})) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
  const tab = document.querySelector(`.module-tab[data-module="${state.module}"]`);
  tab?.click();
}

PERSISTED_SELECTS.forEach(id => document.getElementById(id).addEventListener('change', saveUI));

function applyTimeControls() {
  const isNight = selTime.value === 'night';
  terrainRow.hidden = isNight;
  fireRow.hidden    = !isNight;
}

selTime.addEventListener('change', applyTimeControls);

document.getElementById('btn-encounter').addEventListener('click', () => {
  try {
    const enc = generateEncounter({
      terrain: selTerrain.value,
      time:    selTime.value,
      fire:    selFire.value === 'yes',
      region:  selRegion.value,
    });
    const html = renderEncounterChain(enc);
    outputEncounter.innerHTML = html;
    outputEncounter.hidden = false;
  } catch (err) {
    console.error('Encounter generation failed:', err);
    outputEncounter.innerHTML = `<div class="enc-unknown">Error: ${err.message}</div>`;
    outputEncounter.hidden = false;
  }
});

function renderEncounterChain(enc) {
  let html = renderEncounter(enc);
  let cur = enc.secondaryEncounter;
  while (cur) {
    html += '<hr class="enc-separator">' + renderEncounter(cur);
    cur = cur.secondaryEncounter;
  }
  return html;
}

function renderEncounter(enc) {
  const distFt = enc.distance;
  const distDesc = distFt <= 30 ? 'very close' : distFt <= 60 ? 'nearby' : distFt <= 120 ? 'in the distance' : 'far off';

  if (enc.isMortal) {
    // ‡ Everyday mortal
    const md = enc.mortalDetails;
    if (md) {
      const basicStr = md.basic
        ? `${md.basic.sex}, ${md.basic.age}, ${md.basic.kindred} — ${md.basic.dress} dress, ${md.basic.feature}`
        : null;
      return `
        <div class="enc-distance">${distFt} ft — ${distDesc}</div>
        <div class="enc-header">
          <span class="enc-who"><b>${md.label}</b></span>
          <span class="enc-activity">${enc.activity}</span>
        </div>
        ${basicStr ? `<div class="enc-description">${basicStr}</div>` : ''}
        ${md.statblock ? `<div class="enc-statblock">${fmtStatblock(md.statblock)}</div>` : ''}
        ${md.detail ? `<div class="enc-description">${md.detail}</div>` : ''}
      `.trim();
    }

    // † Adventuring party
    const ad = enc.adventurerDetails;
    if (ad?.party) {
      return renderParty(ad.party, distFt, distDesc, enc.activity);
    }

    // † Individual adventurer NPC
    if (ad?.npc) {
      return renderAdventurer(ad.npc, enc.count, distFt, distDesc, enc.activity);
    }

    // Fallback
    return `
      <div class="enc-distance">${distFt} ft — ${distDesc}</div>
      <div class="enc-header">
        <span class="enc-who"><b>${enc.description}</b></span>
        <span class="enc-activity">${enc.activity}</span>
      </div>
    `.trim();
  }

  const m = enc.monster;
  const countStr = enc.count === 1 ? '1' : `${enc.count}`;
  const nameStr = enc.count === 1 ? enc.creatureName : `${enc.creatureName} (×${countStr})`;

  let details = '';
  if (m) {
    details = `
      ${m.description ? `<div class="enc-description"><i>${m.description}</i></div>` : ''}
      <div class="enc-statblock">${fmtStatblock(m.statblock)}</div>
      ${m.abilities?.length ? renderAbilities(m.abilities) : ''}
    `.trim();
  } else {
    details = `<div class="enc-unknown">[No stat block found for ${enc.creatureName}]</div>`;
  }

  return `
    <div class="enc-distance">${distFt} ft — ${distDesc}</div>
    <div class="enc-header">
      <span class="enc-who"><b>${nameStr}</b></span>
      <span class="enc-activity">${enc.activity}</span>
    </div>
    ${details}
  `.trim();
}

function renderAdventurer(npc, count, distFt, distDesc, activity) {
  const countStr = (count && count > 1) ? ` ×${count}` : '';
  const lines = [
    `<div class="enc-distance">${distFt} ft — ${distDesc}</div>`,
    `<div class="enc-header"><span class="enc-who"><b>${npc.kindred} ${npc.label}${countStr}</b> — ${npc.title} (LV ${npc.level}, ${npc.alignment})</span><span class="enc-activity">${activity}</span></div>`,
    `<div class="enc-statblock">${fmtStatblock(npc.statblock)}</div>`,
    npc.note       ? `<div class="enc-description"><i>${npc.note}</i></div>` : '',
    npc.gear       ? `<div class="enc-ability"><b>Gear.</b> ${npc.gear}</div>` : '',
    npc.spells     ? `<div class="enc-ability"><b>Spells.</b> ${npc.spells}</div>` : '',
    npc.magic      ? `<div class="enc-ability"><b>Magic.</b> ${npc.magic}</div>` : '',
    npc.skills     ? `<div class="enc-ability"><b>Skills.</b> ${npc.skills}</div>` : '',
    npc.special    ? `<div class="enc-ability"><b>Special.</b> ${npc.special}</div>` : '',
    npc.companions ? `<div class="enc-ability"><b>Companions.</b> ${npc.companions}</div>` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function renderParty(party, distFt, distDesc, activity) {
  const memberList = party.members
    .map(m => `${m.kindred} ${m.cls} (${m.title}, LV ${m.level})`)
    .join(', ');
  const t = party.treasure;
  const treasureParts = [`${t.cp} cp`, `${t.sp} sp`, `${t.gp} gp`];
  if (t.gems) treasureParts.push(`${t.gems} gem${t.gems > 1 ? 's' : ''}`);
  if (t.art)  treasureParts.push(`${t.art} art object${t.art > 1 ? 's' : ''}`);

  const lines = [
    `<div class="enc-distance">${distFt} ft — ${distDesc}</div>`,
    `<div class="enc-header"><span class="enc-who"><b>Adventuring Party</b> — ${party.size} members (${party.alignment}${party.highLevel ? ', high-level' : ''})</span><span class="enc-activity">${activity}</span></div>`,
    `<div class="enc-ability"><b>Members.</b> ${memberList}</div>`,
    party.quest ? `<div class="enc-ability"><b>Quest.</b> ${party.quest}</div>` : '',
    `<div class="enc-ability"><b>Treasure.</b> ${treasureParts.join(', ')}</div>`,
  ];
  return lines.filter(Boolean).join('\n');
}

function fmtStatblock(sb) {
  if (!sb) return sb ?? '';
  return sb.replace(
    /(^|, )(AC|HP|ATK|MV|Ch|AL|LV|S|D|C|I|W)(\s)/g,
    (_, pre, label, post) => `${pre}<b>${label}</b>${post}`
  );
}

function renderAbilities(abilities) {
  return abilities.map(a =>
    `<div class="enc-ability"><b>${a.name}.</b> ${a.description}</div>`
  ).join('');
}

// ── Dungeon module UI ─────────────────────────────────────────────
const outputDungeon     = document.getElementById('output-dungeon');
const outputStockedRoom = document.getElementById('output-stocked-room');
const btnCrawlBack      = document.getElementById('btn-crawl-back');
const btnEnterDungeon   = document.getElementById('btn-enter-dungeon');
const dungeonMapEl      = document.getElementById('dungeon-map');
const encCheckPanel     = document.getElementById('enc-check-panel');
const encCheckResult    = document.getElementById('enc-check-result');

// ── Crawl state ───────────────────────────────────────────────────
function freshMap() {
  return { nodes: new Map(), edges: [], positions: new Set(), nextId: 0, currentId: null };
}
const crawl = { history: [], index: -1, map: freshMap(), depth: 1, levels: [], totalRooms: 0 };

// ── Map grid helpers ──────────────────────────────────────────────
const DIR_OFFSETS = {
  North: [0, -1], South: [0, 1], East: [1, 0], West: [-1, 0],
  up: [0, -1], down: [0, 1], 'up/down': [0, -1],
};

function findFreeCell(x, y, positions) {
  if (!positions.has(`${x},${y}`)) return [x, y];
  for (let r = 1; r < 20; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (!positions.has(`${x+dx},${y+dy}`)) return [x+dx, y+dy];
      }
    }
  }
  return [x + 20, y];
}

function nodeAtPos(m, x, y) {
  for (const n of m.nodes.values()) {
    if (n.x === x && n.y === y) return n;
  }
  return null;
}

function addEdge(m, fromId, toId, dir, exitType) {
  const dup = m.edges.some(
    e => (e.fromId === fromId && e.toId === toId) ||
         (e.fromId === toId   && e.toId === fromId)
  );
  if (!dup) m.edges.push({ fromId, toId, dir, exitType });
}

function addRoomToMap(room, fromExit) {
  const m = crawl.map;
  const id = m.nextId++;
  room._mapId = id;

  let x = 0, y = 0;
  if (m.currentId !== null) {
    const parent = m.nodes.get(m.currentId);
    const offset = fromExit ? DIR_OFFSETS[fromExit.dir] : null;
    if (offset) {
      x = parent.x + offset[0];
      y = parent.y + offset[1];
      // Caller already confirmed this cell is free
    } else {
      [x, y] = findFreeCell(parent.x + 1, parent.y, m.positions);
    }
    addEdge(m, m.currentId, id, fromExit?.dir, fromExit?.type);
  } else if (m.nodes.size > 0) {
    // Disconnected new entrance on an existing map — find free space
    [x, y] = findFreeCell(0, 0, m.positions);
  }

  crawl.totalRooms++;
  const roomNumber = crawl.totalRooms;
  room._roomNumber = roomNumber;
  m.positions.add(`${x},${y}`);
  m.nodes.set(id, {
    id, x, y,
    contentType:  room.contentType,
    roomType:     room.roomType,
    roomSize:     room.roomSize,
    entryDir:     fromExit?.dir ?? null,
    isFinalRoom:  !!room.finalRoomDesc,
    room, roomNumber,
  });
  m.currentId = id;
}

function hasUnexploredExits() {
  const m = crawl.map;
  const oppositeDir = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
  };

  for (const n of m.nodes.values()) {
    const exploredDirs = new Set();

    for (const e of m.edges) {
      if (e.fromId === n.id && e.dir) {
        exploredDirs.add(e.dir);
      } else if (e.toId === n.id && e.dir && oppositeDir[e.dir]) {
        exploredDirs.add(oppositeDir[e.dir]);
      }
    }
    const unexplored = (n.room?.exits ?? []).filter(e => !exploredDirs.has(e.direction));
    if (unexplored.length > 0) return true;
  }
  return false;
}

function addNewEntrance() {
  const partyLevel = parseInt(document.getElementById('sel-party-level').value);
  const d = getCurrentDungeon();
  const isFinalRoom = !!(d && crawl.totalRooms === d.rooms - 1);
  const r = stockRoom(partyLevel, {
    minExits: 1,
    isFinalRoom,
    finalRoomDesc: isFinalRoom ? d.finalRoom : null,
  });
  r._fromExit = { dir: 'new entrance', type: 'new entrance' };
  // Null currentId so addRoomToMap uses the disconnected branch
  crawl.map.currentId = null;
  crawl.history = crawl.history.slice(0, crawl.index + 1);
  crawl.history.push(r);
  crawl.index = crawl.history.length - 1;
  addRoomToMap(r, null);
  renderCrawl();
}

// ── Map SVG rendering ─────────────────────────────────────────────
const MAP_GAP = 16, MAP_PAD = 14;
const FT_SCALE = 1.4, FT_BASE = 26; // px = dim * FT_SCALE + FT_BASE
const MAP_MIN_W = 40, MAP_MIN_H = 28;

const MAP_CONTENT_COLORS = {
  empty:    '#888888',
  monster:  '#b84040',
  trap:     '#b87030',
  hazard:   '#b89030',
  obstacle: '#6a7ab8',
  trick:    '#3a8ab8',
  special:  '#7a5ab8',
  weird:    '#c040b0',
  npc:      '#3a7a5a',
};

const MAP_CONTENT_LABELS = {
  empty:    'E',
  monster:  'M',
  trap:     'T',
  hazard:   'H',
  obstacle: 'O',
  trick:    'K',
  special:  'S',
  weird:    'W',
  npc:      'N',
};

function ftToPx(ft) { return Math.round(ft * FT_SCALE + FT_BASE); }

function nodePixelSize(n) {
  const { width = 20, length = 20 } = n.roomSize ?? {};
  const dimA = ftToPx(width);
  const dimB = ftToPx(length);
  // Orient: N/S entry → length runs vertically; E/W → length runs horizontally
  const vertical = !n.entryDir || ['North', 'South', 'up', 'down', 'arrival'].includes(n.entryDir);
  return {
    w: Math.max(MAP_MIN_W, vertical ? dimA : dimB),
    h: Math.max(MAP_MIN_H, vertical ? dimB : dimA),
  };
}

const DOOR_W = 9, DOOR_H = 4;
const VERT_PAD = 6;

function vertMarkSVG(rx, ry, w, h, dir) {
  if (dir === 'down') {
    const x = rx + w - VERT_PAD, y = ry + h - VERT_PAD;
    return `<polygon points="${x-4},${y-4} ${x+4},${y-4} ${x},${y+3}" fill="var(--text-muted)" opacity="0.75"/>`;
  }
  if (dir === 'up') {
    const x = rx + VERT_PAD, y = ry + VERT_PAD;
    return `<polygon points="${x-4},${y+4} ${x+4},${y+4} ${x},${y-3}" fill="var(--text-muted)" opacity="0.75"/>`;
  }
  return '';
}

function doorMarkSVG(x, y, dir, type) {
  const isNS = dir === 'North' || dir === 'South';
  const w = isNS ? DOOR_W : DOOR_H;
  const h = isNS ? DOOR_H : DOOR_W;
  const sx = x - w / 2, sy = y - h / 2;

  if (type === 'open archway') {
    // Gap only — erase the wall line
    return `<rect x="${sx}" y="${sy}" width="${w}" height="${h}" fill="var(--bg-panel)" stroke="none"/>`;
  }
  if (type === 'secret door') {
    const pts = `${x},${sy} ${x+w/2},${y} ${x},${sy+h} ${x-w/2},${y}`;
    return `<polygon points="${pts}" fill="var(--bg-panel)" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="2,1"/>`;
  }
  // All other door types (wooden, stone, iron, locked, barred, portcullis)
  return `<rect x="${sx}" y="${sy}" width="${w}" height="${h}" fill="var(--bg-panel)" stroke="var(--text-muted)" stroke-width="1.5"/>`;
}

function renderMapSVG() {
  const m = crawl.map;
  if (m.nodes.size === 0) return '';

  // Attach pixel sizes to nodes
  const sizes = new Map();
  for (const n of m.nodes.values()) sizes.set(n.id, nodePixelSize(n));

  // Column widths and row heights (max of all nodes in that grid cell)
  const colW = new Map(), rowH = new Map();
  for (const n of m.nodes.values()) {
    const { w, h } = sizes.get(n.id);
    colW.set(n.x, Math.max(colW.get(n.x) ?? 0, w));
    rowH.set(n.y, Math.max(rowH.get(n.y) ?? 0, h));
  }

  // Sorted column/row indices
  const cols = [...colW.keys()].sort((a, b) => a - b);
  const rows = [...rowH.keys()].sort((a, b) => a - b);

  // Pixel offsets for each column/row
  const colOff = new Map(), rowOff = new Map();
  let cx = MAP_PAD;
  for (const c of cols) { colOff.set(c, cx); cx += colW.get(c) + MAP_GAP; }
  let cy = MAP_PAD;
  for (const r of rows) { rowOff.set(r, cy); cy += rowH.get(r) + MAP_GAP; }

  const svgW = cx - MAP_GAP + MAP_PAD;
  const svgH = cy - MAP_GAP + MAP_PAD;

  // Node centre pixel position
  const nodeCx = n => colOff.get(n.x) + colW.get(n.x) / 2;
  const nodeCy = n => rowOff.get(n.y) + rowH.get(n.y) / 2;

  const edges = m.edges.map(e => {
    const a = m.nodes.get(e.fromId), b = m.nodes.get(e.toId);
    return `<line x1="${nodeCx(a)}" y1="${nodeCy(a)}" x2="${nodeCx(b)}" y2="${nodeCy(b)}" stroke="var(--border)" stroke-width="1.5"/>`;
  }).join('');

  const nodes = [...m.nodes.values()].map(n => {
    const { w, h } = sizes.get(n.id);
    const rx = colOff.get(n.x) + (colW.get(n.x) - w) / 2;
    const ry = rowOff.get(n.y) + (rowH.get(n.y) - h) / 2;
    const cx = rx + w / 2, cy = ry + h / 2;
    const isCurrent = n.id === m.currentId;
    const color  = MAP_CONTENT_COLORS[n.contentType] ?? '#888';
    const stroke = n.isFinalRoom ? '#c9a227' : isCurrent ? color : 'var(--border)';
    const strokeW = (isCurrent || n.isFinalRoom) ? 2 : 1;
    const label  = n.isFinalRoom ? `${n.roomNumber}★` : n.roomNumber;

    // Vertical marks (stairs / pits / ladders)
    const vDirs = new Set();
    if (n.room?._isArrival) vDirs.add('up');
    const vExit = n.room?.verticalExit;
    if (vExit?.dir === 'down' || vExit?.dir === 'both') vDirs.add('down');
    if (vExit?.dir === 'up'   || vExit?.dir === 'both') vDirs.add('up');
    const vertMarks = [...vDirs].map(d => vertMarkSVG(rx, ry, w, h, d)).join('');

    // Door marks: exits that have not yet been traversed
    const exploredDirs = new Set(m.edges.filter(e => e.fromId === n.id).map(e => e.dir));
    const WALL_POS = { North: [cx, ry], South: [cx, ry+h], East: [rx+w, cy], West: [rx, cy] };
    const doorMarks = (n.room?.exits ?? [])
      .filter(e => !exploredDirs.has(e.direction))
      .map(({ direction, type }) => {
        const pos = WALL_POS[direction];
        return pos ? doorMarkSVG(pos[0], pos[1], direction, type) : '';
      }).join('');

    const typeLetter = MAP_CONTENT_LABELS[n.contentType] ?? '';
    return `
      <g data-map-id="${n.id}" style="cursor:pointer">
        <rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="4"
          fill="${color}" fill-opacity="${isCurrent ? 0.25 : 0.1}"
          stroke="${stroke}" stroke-width="${strokeW}"/>
        <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="12" font-weight="600"
          fill="${isCurrent ? color : n.isFinalRoom ? '#c9a227' : 'var(--text-muted)'}">${label}</text>
        ${typeLetter ? `<text x="${rx + 4}" y="${ry + 10}" text-anchor="start" font-size="9" font-weight="700" fill="${color}" opacity="0.85">${typeLetter}</text>` : ''}
        ${doorMarks}
        ${vertMarks}
      </g>
    `;
  }).join('');

  return `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="display:block">${edges}${nodes}</svg>`;
}

function saveCurrentLevel() {
  crawl.levels[crawl.depth - 1] = {
    history: crawl.history,
    index:   crawl.index,
    map:     crawl.map,
  };
}

function restoreLevel(depthIdx) {
  const saved = crawl.levels[depthIdx];
  crawl.history = saved.history;
  crawl.index   = saved.index;
  crawl.map     = saved.map;
  crawl.map.currentId = saved.history[saved.index]?._mapId ?? null;
  renderCrawl();
  updateDungeonStatus();
}

function descendLevel(exitType) {
  saveCurrentLevel();
  crawl.depth++;

  if (crawl.levels[crawl.depth - 1]) {
    restoreLevel(crawl.depth - 1);
  } else {
    crawl.history = [];
    crawl.index   = -1;
    crawl.map     = freshMap();
    updateDungeonStatus();
    try {
      crawlEnter({ dir: 'arrival', type: exitType });
    } catch (err) {
      console.error('Room stocking failed on descent:', err);
    }
  }
}

function ascendLevel() {
  if (crawl.depth <= 1) return;
  saveCurrentLevel();
  crawl.depth--;
  restoreLevel(crawl.depth - 1);
}

function crawlEnter(fromExit = null) {
  // Vertical level transitions
  if (fromExit?.dir === 'down') { descendLevel(fromExit.type); return; }
  if (fromExit?.dir === 'up')   { ascendLevel(); return; }

  const m = crawl.map;

  // Check if this exit leads to an already-mapped cell — if so, loop back
  if (fromExit && m.currentId !== null && fromExit.dir !== 'arrival') {
    const parent = m.nodes.get(m.currentId);
    const offset = DIR_OFFSETS[fromExit.dir];
    if (offset) {
      const existing = nodeAtPos(m, parent.x + offset[0], parent.y + offset[1]);
      if (existing) {
        const priorEdge = m.edges.find(
          e => (e.fromId === m.currentId && e.toId === existing.id) ||
               (e.fromId === existing.id && e.toId === m.currentId)
        );
        const exitType = priorEdge?.exitType ?? fromExit.type;
        addEdge(m, m.currentId, existing.id, fromExit.dir, exitType);
        m.currentId = existing.id;
        const revisit = { ...existing.room, _fromExit: { dir: fromExit.dir, type: exitType } };
        crawl.history = crawl.history.slice(0, crawl.index + 1);
        crawl.history.push(revisit);
        crawl.index = crawl.history.length - 1;
        renderCrawl();
        return;
      }
    }
  }

  const partyLevel = parseInt(document.getElementById('sel-party-level').value);
  const d = getCurrentDungeon();
  const isFirst     = crawl.map.nodes.size === 0;          // first room on this level
  const isFinalRoom = !!(d && crawl.totalRooms === d.rooms - 1);  // Nth room across all levels
  const r = stockRoom(partyLevel, {
    minExits:     isFirst ? 1 : 0,
    isFinalRoom,
    finalRoomDesc: isFinalRoom ? d.finalRoom : null,
  });
  r._fromExit = fromExit;
  if (fromExit?.dir === 'arrival') {
    r._isArrival = true;
    r._arrivalExitType = fromExit.type;
  }
  crawl.history = crawl.history.slice(0, crawl.index + 1);
  crawl.history.push(r);
  crawl.index = crawl.history.length - 1;
  addRoomToMap(r, fromExit);
  renderCrawl();
}

function crawlBack() {
  if (crawl.index <= 0) return;
  crawl.index--;
  crawl.map.currentId = crawl.history[crawl.index]._mapId;
  renderCrawl();
}

function renderCrawl() {
  const rooms = crawl.history.slice(0, crawl.index + 1);
  outputStockedRoom.innerHTML = rooms.map((r, i) => {
    const isCurrent = i === crawl.index;
    return `<div class="room-card${isCurrent ? ' room-card--current' : ' room-card--visited'}">${renderStockedRoom(r)}</div>`;
  }).reverse().join('');
  outputStockedRoom.hidden = false;
  btnCrawlBack.hidden = crawl.index <= 0;
  const d = getCurrentDungeon();
  const canNewEntrance = !!(d && crawl.totalRooms < d.rooms && !hasUnexploredExits());
  btnEnterDungeon.hidden = !canNewEntrance;
  btnEnterDungeon.textContent = 'New Entrance';
  dungeonMapEl.innerHTML = renderMapSVG();
  dungeonMapEl.hidden = false;
}

function resetCrawl() {
  crawl.history = [];
  crawl.index   = -1;
  crawl.map     = freshMap();
  crawl.depth      = 1;
  crawl.levels     = [];
  crawl.totalRooms = 0;
  outputStockedRoom.hidden = true;
  outputStockedRoom.innerHTML = '';
  btnCrawlBack.hidden = true;
  btnEnterDungeon.hidden = false;
  btnEnterDungeon.textContent = 'Enter Dungeon';
  dungeonMapEl.hidden = true;
  dungeonMapEl.innerHTML = '';
}

document.getElementById('btn-enter-dungeon').addEventListener('click', () => {
  if (crawl.map.nodes.size > 0) {
    try { addNewEntrance(); } catch (err) { console.error('New entrance failed:', err); }
    return;
  }
  resetCrawl();
  try {
    crawlEnter(null);
  } catch (err) {
    console.error('Room stocking failed:', err);
    outputStockedRoom.innerHTML = `<div class="enc-unknown">Error: ${err.message}</div>`;
    outputStockedRoom.hidden = false;
  }
});

btnCrawlBack.addEventListener('click', crawlBack);

// Map node click — jump to any visited room
dungeonMapEl.addEventListener('click', e => {
  const g = e.target.closest('[data-map-id]');
  if (!g) return;
  const nodeId = parseInt(g.dataset.mapId);
  const node = crawl.map.nodes.get(nodeId);
  if (!node || nodeId === crawl.map.currentId) return;
  crawl.map.currentId = nodeId;
  const revisit = { ...node.room, _fromExit: null };
  crawl.history = crawl.history.slice(0, crawl.index + 1);
  crawl.history.push(revisit);
  crawl.index = crawl.history.length - 1;
  renderCrawl();
});

// Exit click delegation
outputStockedRoom.addEventListener('click', e => {
  const btn = e.target.closest('.exit-btn');
  if (!btn) return;
  const dir = btn.dataset.dir;
  const type = btn.dataset.type;
  try {
    crawlEnter({ dir, type });
  } catch (err) {
    console.error('Room stocking failed:', err);
  }
});

const dungeonStatus = document.getElementById('dungeon-status');

function updateDungeonStatus() {
  const d = getCurrentDungeon();
  const depthStr = crawl.depth > 1 ? `Level ${crawl.depth} — ` : '';
  dungeonStatus.textContent = d
    ? `${depthStr}${d.type} · ${d.size} · ${d.factions.map(f => f.name).join(', ')}`
    : 'No dungeon generated yet.';
  dungeonStatus.classList.toggle('dungeon-status--active', !!d);
  btnEnterDungeon.disabled = !d;
}

document.getElementById('btn-dungeon').addEventListener('click', () => {
  const partyLevel = parseInt(document.getElementById('sel-party-level').value);
  const d = generateDungeon(partyLevel);
  try {
    d.wanderingTable = generateWanderingTable(partyLevel);
  } catch (err) {
    console.error('Encounter table generation failed:', err);
  }
  outputDungeon.innerHTML = renderDungeon(d);
  outputDungeon.hidden = false;
  encCheckPanel.hidden = false;
  encCheckResult.hidden = true;
  encCheckResult.innerHTML = '';
  resetCrawl();
  updateDungeonStatus();
});

document.getElementById('btn-check-encounter').addEventListener('click', () => {
  const d = getCurrentDungeon();
  if (!d?.wanderingTable) return;
  const d6 = Math.floor(Math.random() * 6) + 1;
  if (d6 > 1) {
    encCheckResult.innerHTML = `<div class="enc-check-miss">Rolled ${d6} — no encounter.</div>`;
    encCheckResult.hidden = false;
    return;
  }
  const roll = Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + 2;
  const entry = d.wanderingTable.find(r => r.roll === roll);
  encCheckResult.innerHTML = `<div class="enc-check-hit"><b>Encounter! (${roll})</b><br>${entry?.entry ?? '…'}</div>`;
  encCheckResult.hidden = false;
});

function renderDungeon(d) {
  const aestheticHtml = d.aesthetic
    ? `<div class="enc-ability"><b>Aesthetic.</b> ${d.aesthetic} — ${d.aestheticDesc}</div>`
    : '';

  const conceptHtml = d.concept ? `
    <hr class="enc-separator">
    <div class="enc-ability"><b>Theme.</b> ${d.concept.theme}</div>
    <div class="enc-ability"><b>The Story.</b> ${d.concept.story}</div>
  `.trim() : '';

  const factionsHtml = d.factions.map(f => {
    const typeLabel = f.isInhabitant
      ? `inhabitant${f.creature ? ` — ${f.creature}` : ''}`
      : 'outsider';
    return `
    <div class="faction-block">
      <div class="faction-block-header">
        <span class="faction-block-name">${f.name.toUpperCase()}</span>
        <span class="faction-block-type faction-block-type--${f.isInhabitant ? 'inhabitant' : 'outsider'}">${typeLabel}</span>
      </div>
      <div class="enc-ability"><b>Goal.</b> ${f.goal}</div>
      <div class="enc-ability"><b>Key NPC.</b> ${f.npcName} — ${f.npcTrait}</div>
      <div class="enc-ability"><b>Secret.</b> ${f.secret}</div>
      <div class="enc-ability"><b>Toward PCs.</b> ${f.dispositionTowardPCs}</div>
      <div class="enc-ability"><b>Toward others.</b> ${
        Object.entries(f.dispositions).map(([name, disp]) => `${name}: ${disp}`).join(' · ')
      }</div>
    </div>
  `.trim();
  }).join('');

  const wanderingHtml = d.wanderingTable ? `
    <hr class="enc-separator">
    <div class="enc-ability"><b>Random Encounters</b> — 2d6, check every 2 turns</div>
    <table class="wandering-table">
      ${d.wanderingTable.map(row =>
        `<tr><td class="wt-roll">${row.roll}</td><td>${row.entry}</td></tr>`
      ).join('')}
    </table>
  `.trim() : '';

  return `
    <div class="enc-header">
      <span class="enc-who"><b>${d.type.toUpperCase()}</b></span>
      <span class="enc-activity">${d.size} · ${d.rooms} rooms · ${d.architecture} architecture</span>
    </div>
    <div class="enc-description"><i>${d.flavor}</i></div>
    ${aestheticHtml}
    ${conceptHtml}
    <hr class="enc-separator">
    ${factionsHtml}
    <hr class="enc-separator">
    <div class="enc-ability"><b>Entrance.</b> ${d.entrance}</div>
    <div class="enc-ability"><b>Guard.</b> ${d.entranceGuard}</div>
    ${d.entranceGuardMonster ? `
      <div class="enc-ability"><b>${d.entranceGuardMonster.name}</b>${d.entranceGuardMonster.description ? ` — <i>${d.entranceGuardMonster.description}</i>` : ''}</div>
      <div class="enc-statblock">${fmtStatblock(d.entranceGuardMonster.statblock)}</div>
      ${d.entranceGuardMonster.abilities?.length ? renderAbilities(d.entranceGuardMonster.abilities) : ''}
    `.trim() : ''}
    <hr class="enc-separator">
    <div class="enc-ability"><b>Final Room.</b> ${d.finalRoom}</div>
    ${wanderingHtml}
  `.trim();
}

function renderStockedRoom(r) {
  const { contentType, roomType, roomSize, exits, verticalExit, smell, sound, furnishing, hallway, _fromExit } = r;

  const roomNumHtml = r._roomNumber
    ? `<div class="room-number">Room ${r._roomNumber}${r.finalRoomDesc ? ' <span class="room-tag room-tag--final">Final</span>' : ''}</div>`
    : '';

  const finalRoomHtml = r.finalRoomDesc
    ? `<div class="enc-ability final-room-desc"><b>This is the final room.</b> ${r.finalRoomDesc}</div>`
    : '';

  const entryHtml = _fromExit
    ? `<div class="enc-entry">&#8617; Entered from <b>${_fromExit.dir}</b> via ${_fromExit.type}</div>`
    : '';

  const exitBtns = exits.map(e =>
    `<button class="exit-btn" data-dir="${e.direction}" data-type="${e.type}">${e.direction} <span class="exit-type">${e.type}</span></button>`
  );
  if (r._isArrival && crawl.depth > 1) {
    exitBtns.push(`<button class="exit-btn exit-btn--vertical" data-dir="up" data-type="${r._arrivalExitType}">&#8593; ${r._arrivalExitType} <span class="exit-type">ascend</span></button>`);
  }
  if (verticalExit) {
    const { form, dir } = verticalExit;
    if (dir === 'down' || dir === 'both') {
      exitBtns.push(`<button class="exit-btn exit-btn--vertical" data-dir="down" data-type="${form}">&#8595; ${form} <span class="exit-type">descend</span></button>`);
    }
    if ((dir === 'up' || dir === 'both') && crawl.depth > 1 && !r._isArrival) {
      exitBtns.push(`<button class="exit-btn exit-btn--vertical" data-dir="up" data-type="${form}">&#8593; ${form} <span class="exit-type">ascend</span></button>`);
    }
  }
  const exitsHtml = exitBtns.length
    ? `<div class="exit-list">${exitBtns.join('')}</div>`
    : '<i>dead end</i>';

  const roomTypeLabel = roomType === 'corridor' ? 'Corridor' : roomType === 'cavern' ? 'Cavern' : 'Room';
  const atmo = `
    ${finalRoomHtml}
    <hr class="enc-separator">
    <div class="room-card-meta">${roomNumHtml}${entryHtml}</div>
    <div class="room-type-label">${roomTypeLabel}${roomSize ? ` <span class="room-size">${roomSize.label}</span>` : ''}</div>
    <div class="enc-ability"><b>Exits.</b> ${exitsHtml}</div>
    ${smell ? `<div class="enc-ability"><b>Smell.</b> ${smell}</div>` : ''}
    ${sound ? `<div class="enc-ability"><b>Sound.</b> ${sound}</div>` : ''}
    ${furnishing ? `<div class="enc-ability"><b>Furnishing.</b> ${furnishing}</div>` : ''}
    ${hallway    ? `<div class="enc-ability"><b>Corridor detail.</b> ${hallway}</div>` : ''}
  `.trim();

  let body = '';

  if (contentType === 'empty') {
    const { feature, treasure } = r;
    body = `
      <div class="enc-header">
        <span class="enc-who room-tag room-tag--empty">Empty</span>
        <span class="enc-activity">${feature}</span>
      </div>
      ${treasure ? `<div class="enc-ability"><b>Treasure.</b> ${treasure.item}<br><i>${treasure.hidden}</i></div>` : ''}
    `.trim();

  } else if (contentType === 'trap') {
    const { trapType, trapDetail, treasure } = r;
    body = `
      <div class="enc-header">
        <span class="enc-who room-tag room-tag--trap">Trap</span>
        <span class="enc-activity">${trapType}</span>
      </div>
      <div class="enc-description">${trapDetail}</div>
      ${treasure ? `<div class="enc-ability"><b>Treasure.</b> ${treasure.item}</div>` : ''}
    `.trim();

  } else if (contentType === 'hazard') {
    const { hazard, hazardDetail } = r;
    body = `
      <div class="enc-header">
        <span class="enc-who room-tag room-tag--hazard">Hazard</span>
        <span class="enc-activity">${hazard.split(' — ')[0]}</span>
      </div>
      <div class="enc-description">${hazard}</div>
      <div class="enc-description">${hazardDetail}</div>
    `.trim();

  } else if (contentType === 'obstacle') {
    const { obstacle, obstacleDetail } = r;
    body = `
      <div class="enc-header">
        <span class="enc-who room-tag room-tag--obstacle">Obstacle</span>
        <span class="enc-activity">${obstacle.split(' — ')[0].split(',')[0]}</span>
      </div>
      <div class="enc-description">${obstacle}</div>
      <div class="enc-description">${obstacleDetail}</div>
    `.trim();

  } else if (contentType === 'weird') {
    const { weird } = r;
    body = `
      <div class="enc-header">
        <span class="enc-who room-tag room-tag--weird">The Weird</span>
      </div>
      <div class="enc-description enc-description--weird"><i>${weird}</i></div>
    `.trim();

  } else if (contentType === 'trick') {
    const { trick, trickDetail } = r;
    body = `
      <div class="enc-header">
        <span class="enc-who room-tag room-tag--trick">Trick</span>
        <span class="enc-activity">${trick.split(' — ')[0]}</span>
      </div>
      <div class="enc-description">${trick}</div>
      <div class="enc-description">${trickDetail}</div>
    `.trim();

  } else if (contentType === 'special') {
    const { special, specialDetail } = r;
    body = `
      <div class="enc-header">
        <span class="enc-who room-tag room-tag--special">Special</span>
        <span class="enc-activity">${special}</span>
      </div>
      <div class="enc-description">${specialDetail}</div>
    `.trim();

  } else if (contentType === 'monster') {
    const { monster, count, activity, faction, treasure } = r;
    if (monster) {
      const nameStr = count === 1 ? monster.name : `${monster.name} ×${count}`;
      body = `
        <div class="enc-header">
          <span class="enc-who"><b>${nameStr}</b></span>
          <span class="enc-activity">${activity}</span>
        </div>
        ${faction ? `<div class="faction-badge">${faction.name}</div>` : ''}
        ${monster.description ? `<div class="enc-description"><i>${monster.description}</i></div>` : ''}
        <div class="enc-statblock">${fmtStatblock(monster.statblock)}</div>
        ${monster.abilities?.length ? renderAbilities(monster.abilities) : ''}
        ${treasure ? `<div class="enc-ability"><b>Treasure.</b> ${treasure.item}</div>` : ''}
      `.trim();
    } else {
      body = `<div class="enc-unknown">No matching monster found for this party level.</div>`;
    }

  } else if (contentType === 'npc') {
    const { npcRole, npcDesire, npcMood, faction } = r;
    body = `
      <div class="enc-header">
        <span class="enc-who room-tag room-tag--npc">NPC</span>
        <span class="enc-activity">${npcRole}</span>
      </div>
      ${faction ? `<div class="faction-badge">${faction.name}</div>` : ''}
      <div class="enc-description">${npcMood}; ${npcDesire}</div>
    `.trim();
  }

  return atmo + '\n' + body;
}

// ── Module tabs ───────────────────────────────────────────────────
document.querySelectorAll('.module-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.module;
    document.querySelectorAll('.module-tab').forEach(t => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
    });
    document.querySelectorAll('.module-panel').forEach(panel => {
      panel.hidden = panel.id !== `module-${target}`;
    });
    // Clear shared output when switching modules
    ['output-encounter', 'output-dungeon', 'output-stocked-room'].forEach(id => {
      const el = document.getElementById(id);
      el.hidden = true;
      el.innerHTML = '';
    });
    saveUI();
  });
});

// ── Theme ─────────────────────────────────────────────────────────
const btnTheme = document.getElementById('btn-theme');
const applyTheme = (light) => {
  document.body.classList.toggle('light', light);
  btnTheme.textContent = light ? '☽' : '☀';
  btnTheme.title = light ? 'Switch to dark mode' : 'Switch to light mode';
};
applyTheme(localStorage.getItem('theme') === 'light');
btnTheme.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
});

function getMonsterDependentControls() {
  return Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
    .filter(el => {
      const label = (el.textContent || el.value || '').trim();
      return label === 'Roll Encounter' || label === 'New Dungeon';
    });
}

function setMonsterDependentControlsDisabled(disabled) {
  getMonsterDependentControls().forEach(control => {
    control.disabled = disabled;
    control.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  });
}

// ── Init ──────────────────────────────────────────────────────────
restoreUI();
applyTimeControls();
updateDungeonStatus();
setMonsterDependentControlsDisabled(true);
loadMonsters()
  .finally(() => {
    setMonsterDependentControlsDisabled(false);
  });
