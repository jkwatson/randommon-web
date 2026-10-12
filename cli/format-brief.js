// Converts generateModule() output into a structured text brief for the LLM.
// The brief contains all mechanical data (stat blocks, exits, content types)
// so Claude can write prose without having to invent mechanics.

import { checkRule, encounterTables, TABLE_DICE } from '../dungeon/src/dungeons/danger.js';

// How much story a dungeon of this many areas can hold. A party learns a
// 12-room dungeon in one session; every extra secret, twist, and cross-link is
// something the GM tracks and the players must find.
export function budgetFor(areas) {
  if (areas <= 9)  return { areas, secrets: 1, links: '2', gestaltSentences: '2', extraRooms: false, words: 600 };
  if (areas <= 15) return { areas, secrets: 1, links: '2-3', gestaltSentences: '2-3', extraRooms: false, words: 800 };
  return { areas, secrets: 2, links: '3-5', gestaltSentences: '3-4', extraRooms: true, words: 1200 };
}

const DIR_OFFSETS = {
  North: [0,-1], South: [0,1], East: [1,0], West: [-1,0],
  Northeast: [1,-1], Northwest: [-1,-1], Southeast: [1,1], Southwest: [-1,1],
};

function nodeAtPos(map, x, y) {
  for (const n of map.nodes.values()) {
    if (n.x === x && n.y === y) return n;
  }
  return null;
}

function exitTarget(exit, room, map) {
  const fromNode = map.nodes.get(room._mapId);
  if (!fromNode) return null;
  const off = DIR_OFFSETS[exit.direction];
  if (!off) return null;
  return nodeAtPos(map, fromNode.x + off[0], fromNode.y + off[1])?.roomNumber ?? null;
}

function fmtExits(room, map) {
  const parts = (room.exits ?? []).map(e => {
    const t = exitTarget(e, room, map);
    return `${e.direction}${t != null ? ` → Room ${t}` : ''} [${e.type}]`;
  });
  return parts.length ? parts.join('  ·  ') : '(dead end)';
}

function fmtMonsterBlock(m) {
  if (!m) return null;
  const lines = [];
  if (m.statblock) lines.push(`  Stat block: ${m.statblock}`);
  if (m.description) lines.push(`  Note: ${m.description}`);
  for (const a of m.abilities ?? []) lines.push(`  ${a.name}: ${a.description}`);
  return lines.join('\n');
}

function castMonster(lines, label, m, where) {
  if (!m) return;
  lines.push(`  ${label}: ${m.name}${where ? ` — ${where}` : ''}`);
  if (m.statblock) lines.push(`  ${label} stat block: ${m.statblock}`);
  if (m.note)      lines.push(`  ${label} note: ${m.note}`);
  for (const a of m.abilities ?? []) lines.push(`  ${a.name}: ${a.description}`);
}

function fmtRoomBody(r) {
  const lines = [];

  switch (r.contentType) {
    case 'monster': {
      const { monster: m, count, activity, faction, treasure } = r;
      if (m) {
        lines.push(`  Monster: ${m.name}${count > 1 ? ` ×${count}` : ''}`);
        const block = fmtMonsterBlock(m);
        if (block) lines.push(block);
        lines.push(`  Activity: ${activity}`);
        if (faction) lines.push(`  Faction affiliation: ${faction.name}`);
      } else {
        lines.push('  Monster: (none found for this level)');
      }
      if (treasure) lines.push(`  Treasure: ${treasure.item}`);
      break;
    }
    case 'trap':
      lines.push(`  Trap: ${r.trapType}`);
      if (r.trapTell) lines.push(`  Tell: ${r.trapTell}`);
      lines.push(`  Detail: ${r.trapDetail}`);
      if (r.treasure) lines.push(`  Treasure: ${r.treasure.item}`);
      break;
    case 'hazard':
      lines.push(`  Hazard: ${r.hazard}`);
      lines.push(`  Detail: ${r.hazardDetail}`);
      break;
    case 'obstacle':
      lines.push(`  Obstacle: ${r.obstacle}`);
      lines.push(`  Detail: ${r.obstacleDetail}`);
      break;
    case 'trick':
      lines.push(`  Trick: ${r.trick}`);
      lines.push(`  Detail: ${r.trickDetail}`);
      break;
    case 'weird':
      lines.push(`  The Weird: ${r.weird}`);
      break;
    case 'special': {
      lines.push(`  Special: ${r.special}`);
      lines.push(`  Detail: ${r.specialDetail}`);
      const specialM = r.valuableMonster ?? r.specialMonster;
      if (specialM) {
        lines.push(`  Creature: ${specialM.name}`);
        const block = fmtMonsterBlock(specialM);
        if (block) lines.push(block);
        if (r.valuableMonsterReason) lines.push(`  Why alive: ${r.valuableMonsterReason}`);
      } else if (r.specialExtra) {
        lines.push(`  Extra: ${r.specialExtra}`);
      }
      break;
    }
    case 'empty': {
      lines.push(`  Feature: ${r.feature}`);
      if (r.treasure) {
        lines.push(`  Treasure: ${r.treasure.item}`);
        if (r.treasure.hidden) lines.push(`  Hidden: ${r.treasure.hidden}`);
      }
      break;
    }
    case 'npc': {
      const phys = r.npcPhysical
        ? `${r.npcPhysical.feature} ${r.npcPhysical.age.toLowerCase()} ${r.npcPhysical.kindred}, ${r.npcPhysical.dress.toLowerCase()} dress`
        : '';
      if (r.npcName) lines.push(`  NPC: ${r.npcName}`);
      if (phys) lines.push(`  Appearance: ${phys}`);
      lines.push(`  Role: ${r.npcRole}`);
      lines.push(`  Mood: ${r.npcMood}`);
      lines.push(`  Desire: ${r.npcDesire}`);
      if (r.npcHook) lines.push(`  Hook: ${r.npcHook}`);
      if (r.faction) lines.push(`  Faction: ${r.faction.name}`);
      break;
    }
  }

  return lines.join('\n');
}

const CONTENT_LABELS = {
  monster: 'Monster', trap: 'Trap', hazard: 'Hazard', obstacle: 'Obstacle',
  trick: 'Trick', weird: 'Weird', special: 'Special', empty: 'Empty', npc: 'NPC',
};

export function formatBrief({ dungeon: d, rooms, map }) {
  const sections = [];

  // ── Dungeon header ───────────────────────────────────────────────
  sections.push([
    `DUNGEON TYPE: ${d.type}`,
    `ARCHITECTURE: ${d.architecture}`,
    d.aesthetic ? `AESTHETIC: ${d.aesthetic} — ${d.aestheticDesc}` : null,
    `SIZE: ${d.size} · ${rooms.length} areas — a party crosses it in an afternoon; outsiders bring days of supplies, not weeks`,
    d.danger ? `DANGER LEVEL: ${checkRule(d)}` : null,
    d.partyLevel ? `PARTY LEVEL: ${d.partyLevel}` : null,
    `FLAVOR: ${d.flavor}`,
  ].filter(Boolean).join('\n'));

  // ── Concept ──────────────────────────────────────────────────────
  if (d.concept) {
    sections.push([
      '## CONCEPT',
      `Theme: ${d.concept.theme}`,
      `Story: ${d.concept.story}`,
    ].join('\n'));
  }

  // ── Gestalt ──────────────────────────────────────────────────────
  if (d.gestalts?.length) {
    const lines = [
      '## GESTALT',
      '(The abstract patterns that organize this dungeon. Layout, factions, room contents, and the Weird',
      'must all reinforce them, and players must be able to learn each pattern through play.)',
    ];
    for (const g of d.gestalts) {
      lines.push('');
      lines.push(`${g.category.toUpperCase()} — ${g.name}: ${g.summary}`);
      lines.push(`  Realize it: ${g.guidance}`);
      for (const z of g.zones ?? []) lines.push(`  Zone — ${z.name} (Room${z.rooms.length > 1 ? 's' : ''} ${z.rooms.join(', ')}): ${z.desc}`);
      lines.push(`  Tells: ${g.tells}`);
      const c = g.cast ?? {};
      if (c.host)        lines.push(`  Host: ${c.host} · Intruder: ${c.intruder}`);
      if (c.dominant)    lines.push(`  Dominant: ${c.dominant} · Subordinate: ${c.subordinate}`);
      if (c.contenders)  lines.push(`  Contenders: ${c.contenders.join(' vs. ')}`);
      if (c.prey)        lines.push(`  Prey: ${c.prey.join(', ')}`);
      const label = g.id === 'threat-and-refuge' ? 'Threat' : 'Hunter';
      castMonster(lines, label, c.hunter, 'roams; no fixed room');
      if (c.refugees)    lines.push(`  Refugees: ${c.refugees.join(', ')} · Protection: ${c.protection}`);
      if (c.warden)      lines.push(`  Warden: ${c.warden}${c.breaker ? ` · Would-be breaker: ${c.breaker}` : ''}`);
      castMonster(lines, 'Imprisoned', c.contained, c.prison ? `bound in Room ${c.prison}` : null);
      if (c.resource)    lines.push(`  Resource: ${c.resource.name} — ${c.resource.desc}`);
      if (c.bond)        lines.push(`  Bond (${c.bond.kind}): ${c.bonded} ↔ ${c.partner?.name ?? 'partner'} — ${c.bond.text}`);
      if (c.rule)        lines.push(`  Rule: ${c.rule.text} · Exploit: ${c.rule.item}`);
      if (c.guard)       lines.push(`  Distinctive guards: ${c.guard.desc}`);
      if (c.product)     lines.push(`  Product: ${c.product.product} — ${c.product.source}${c.consumer ? ` · Consumer: ${c.consumer}` : ''}`);
      if (g.rooms?.length) {
        const byRole = new Map();
        for (const { room, role } of g.rooms) {
          if (!byRole.has(role)) byRole.set(role, []);
          if (!byRole.get(role).includes(room)) byRole.get(role).push(room);
        }
        lines.push(`  Key rooms: ${[...byRole].map(([role, ns]) => `${role} → Room${ns.length > 1 ? 's' : ''} ${ns.join(', ')}`).join(' · ')}`);
      }
    }
    sections.push(lines.join('\n'));
  }

  // ── Cyclic flow (cyclic dungeons) ────────────────────────────────
  if (d.cycleFlowText?.length) {
    const lines = [
      '## HOW THE DUNGEON FLOWS',
      '(This dungeon is built from nested cycles: loops of rooms between a start and a goal. Locks, keys,',
      'barriers, and shortcuts are structural — every one must appear in its room exactly as given.)',
      '',
      ...d.cycleFlowText,
    ];
    if (d.cycleLocks?.length) {
      lines.push('', 'LOCKS AND KEYS');
      for (const l of d.cycleLocks) lines.push(`- Room ${l.room}: ${l.lock} (${l.hard ? 'hard lock' : 'soft lock'}) — ${l.keys.map(k => `${k.item} in Room ${k.room}`).join('; ')}`);
    }
    for (const p of d.cyclePatrols ?? []) lines.push('', `PATROL — ${p.name}: loops through Rooms ${p.rooms.join(', ')}, one room every 2 turns (a full loop takes ${p.period} turns). Stat block: ${p.statblock}`);
    sections.push(lines.join('\n'));
  }

  // ── Transformational systems ─────────────────────────────────────
  const systems = (d.gestalts ?? []).filter(g => g.system?.summary?.length);
  if (systems.length) {
    const lines = [
      '## HOW THE DUNGEON CHANGES',
      '(Exact mechanics — copy numbers, room references, and thresholds as given.)',
    ];
    for (const g of systems) {
      lines.push('');
      lines.push(`${g.name.toUpperCase()}`);
      for (const l of g.system.summary) lines.push(`- ${l}`);
    }
    sections.push(lines.join('\n'));
  }

  // ── Rumors ───────────────────────────────────────────────────────
  if (d.rumorRefs?.length) {
    const lines = ['## RUMORS', '(Weave these naturally into NPC dialogue, graffiti, or found documents.)'];
    for (const r of d.rumorRefs) {
      lines.push(`- "${r.text}"  →  Room ${r.roomRef}`);
    }
    sections.push(lines.join('\n'));
  }

  // ── Factions ─────────────────────────────────────────────────────
  // Only as many secrets as the dungeon can hold; the first factions keep theirs.
  const { secrets } = budgetFor(rooms.length);
  const factionLines = ['## FACTIONS'];
  for (const [i, f] of d.factions.entries()) {
    const base = rooms.find(r => r._factionBase?.name === f.name);
    const typeStr = f.isInhabitant
      ? `Inhabitant${f.creature ? ` (creature type: ${f.creature})` : ''}`
      : 'Outsider';
    factionLines.push('');
    factionLines.push(`### ${f.name.toUpperCase()} — ${typeStr}${base ? `  |  Base: Room ${base._roomNumber}` : ''}`);
    if (f.gestaltRole) factionLines.push(`Gestalt role: ${f.gestaltRole}`);
    if (f.territory?.length) factionLines.push(`Territory: Rooms ${f.territory.join(', ')}`);
    factionLines.push(`Goal: ${f.goal}`);
    factionLines.push(`Key NPC: ${f.npcName} — ${f.npcTrait}`);
    if (f.npcStatblock) factionLines.push(`Key NPC stat block: ${f.npcStatblock}`);
    factionLines.push(`Secret: ${i < secrets ? f.secret : 'none'}`);
    factionLines.push(`Toward PCs: ${f.dispositionTowardPCs}`);
    const disps = Object.entries(f.dispositions ?? {})
      .map(([name, disp]) => `${name}: ${disp}`).join('  ·  ');
    if (disps) factionLines.push(`Toward others: ${disps}`);
  }
  sections.push(factionLines.join('\n'));

  // ── Key NPC stat blocks (canonical — every room and the GM section copy these) ──
  const npcLines = d.factions.filter(f => f.npcStatblock).map(f => {
    const base = rooms.find(r => r._factionBase?.name === f.name);
    return `- ${f.npcName} (${f.name}${base ? `, base Room ${base._roomNumber}` : ''}): ${f.npcStatblock}`;
  });
  if (npcLines.length) {
    sections.push([
      '## KEY NPC STAT BLOCKS',
      '(Canonical. Wherever one of these NPCs appears, use exactly these numbers — never a new stat block.)',
      ...npcLines,
    ].join('\n'));
  }

  // ── Entrance ─────────────────────────────────────────────────────
  const entranceLines = ['## ENTRANCE'];
  entranceLines.push(`Location: ${d.entrance}`);
  entranceLines.push(`Guard: ${d.entranceGuard}`);
  if (d.entranceGuardMonster) {
    const m = d.entranceGuardMonster;
    entranceLines.push(`Creature: ${m.name}`);
    const block = fmtMonsterBlock(m);
    if (block) entranceLines.push(block);
  }
  sections.push(entranceLines.join('\n'));

  // ── Final room ───────────────────────────────────────────────────
  sections.push(`## FINAL ROOM NOTE\n${d.finalRoom}`);

  // ── Wandering encounters ─────────────────────────────────────────
  if (d.wanderingTable?.length) {
    const tables = encounterTables(d);
    const row = r => `${r.roll}: ${r.entry}${r.omen ? ` | Omen: ${r.omen}` : ''}${r.aftermath ? ` | After: ${r.aftermath}` : ''}`;
    const lines = [`## RANDOM ENCOUNTERS (${TABLE_DICE} — ${checkRule(d)})`,
      'Dungeon-wide escalations, once each (rolled only as doubles, so always foreshadowed):',
      ...tables[0].rows.filter(r => r.once).map(row)];
    for (const t of tables) {
      lines.push(t.zone ? `Zone — ${t.zone} (Rooms ${t.rooms.join(', ')}):` : 'Everyday encounters:');
      lines.push(...t.rows.filter(r => !r.once).map(row));
    }
    sections.push(lines.join('\n'));
  }

  // ── Rooms ────────────────────────────────────────────────────────
  const roomLines = ['## ROOMS'];
  for (const r of rooms) {
    const flags = [
      r._isEntrance && 'ENTRANCE',
      r.finalRoomDesc && 'FINAL',
      r._factionBase && `FACTION BASE — ${r._factionBase.name.toUpperCase()}`,
    ].filter(Boolean);

    const typeLabel = { corridor: 'Corridor', cavern: 'Cavern' }[r.roomType] ?? 'Room';
    const contentLabel = CONTENT_LABELS[r.contentType] ?? r.contentType;

    roomLines.push('');
    roomLines.push(
      `--- Room ${r._roomNumber}${flags.length ? ` [${flags.join(' · ')}]` : ''} — ${contentLabel} — ${typeLabel}${r.roomSize ? `, ${r.roomSize.label}` : ''}`
    );
    roomLines.push(`Exits: ${fmtExits(r, map)}`);
    if (r._verticalTarget != null) {
      const ve = r.verticalExit;
      roomLines.push(`Vertical (${ve?.dir === 'both' ? 'up/down' : 'down'}): ${ve?.form ?? 'passage'} → Room ${r._verticalTarget}`);
    }
    if (r._verticalSource != null) {
      const ve = r.verticalExit;
      roomLines.push(`Vertical (up): ${ve?.form ?? 'passage'} → Room ${r._verticalSource}`);
    }
    if (r.smell)      roomLines.push(`Smell: ${r.smell}`);
    if (r.sound)      roomLines.push(`Sound: ${r.sound}`);
    if (r.furnishing) roomLines.push(`Furnishing: ${r.furnishing}`);
    if (r.finalRoomDesc) roomLines.push(`Final room note: ${r.finalRoomDesc}`);
    if (r._zone)         roomLines.push(`Zone: ${r._zone}`);
    if (r._territory)    roomLines.push(`Territory: ${r._territory}`);
    for (const x of r._gestalt ?? []) roomLines.push(`GESTALT — ${x.pattern} [${x.role}]: ${x.note}`);
    if (r._prisoner) castMonster(roomLines, 'Imprisoned creature', r._prisoner, 'bound here; include its stat block in this room');
    if (r._factionBase) {
      const f = r._factionBase;
      roomLines.push(`Faction base NPC: ${f.npcName} — ${f.npcTrait}. Goal: ${f.goal}`);
      if (f.npcStatblock) roomLines.push(`Key NPC stat block (copy exactly): ${f.npcName} — ${f.npcStatblock}`);
    }
    const body = fmtRoomBody(r);
    if (body) roomLines.push(body);
  }
  sections.push(roomLines.join('\n'));

  return sections.join('\n\n');
}
