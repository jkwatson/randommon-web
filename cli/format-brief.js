// Converts generateModule() output into a structured text brief for the LLM.
// The brief contains all mechanical data (stat blocks, exits, content types)
// so Claude can write prose without having to invent mechanics.

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
    `SIZE: ${d.size} · ${d.rooms} rooms`,
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

  // ── Rumors ───────────────────────────────────────────────────────
  if (d.rumorRefs?.length) {
    const lines = ['## RUMORS', '(Weave these naturally into NPC dialogue, graffiti, or found documents.)'];
    for (const r of d.rumorRefs) {
      lines.push(`- "${r.text}"  →  Room ${r.roomRef}`);
    }
    sections.push(lines.join('\n'));
  }

  // ── Factions ─────────────────────────────────────────────────────
  const factionLines = ['## FACTIONS'];
  for (const f of d.factions) {
    const base = rooms.find(r => r._factionBase?.name === f.name);
    const typeStr = f.isInhabitant
      ? `Inhabitant${f.creature ? ` (creature type: ${f.creature})` : ''}`
      : 'Outsider';
    factionLines.push('');
    factionLines.push(`### ${f.name.toUpperCase()} — ${typeStr}${base ? `  |  Base: Room ${base._roomNumber}` : ''}`);
    factionLines.push(`Goal: ${f.goal}`);
    factionLines.push(`Key NPC: ${f.npcName} — ${f.npcTrait}`);
    factionLines.push(`Secret: ${f.secret}`);
    factionLines.push(`Toward PCs: ${f.dispositionTowardPCs}`);
    const disps = Object.entries(f.dispositions ?? {})
      .map(([name, disp]) => `${name}: ${disp}`).join('  ·  ');
    if (disps) factionLines.push(`Toward others: ${disps}`);
  }
  sections.push(factionLines.join('\n'));

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
    const lines = ['## RANDOM ENCOUNTERS (2d6, check every 2 turns)'];
    for (const row of d.wanderingTable) {
      lines.push(`${String(row.roll).padStart(2)}: ${row.entry}`);
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
    if (r._factionBase) {
      const f = r._factionBase;
      roomLines.push(`Faction base NPC: ${f.npcName} — ${f.npcTrait}. Goal: ${f.goal}`);
    }
    const body = fmtRoomBody(r);
    if (body) roomLines.push(body);
  }
  sections.push(roomLines.join('\n'));

  return sections.join('\n\n');
}
