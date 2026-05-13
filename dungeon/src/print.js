// ── PDF / Print export ────────────────────────────────────────────

const PRINT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --border:    #aaaaaa;
  --bg-panel:  #ffffff;
  --text-muted:#666666;
}

body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11pt;
  line-height: 1.6;
  color: #1a1a1a;
  background: #fff;
  padding: 0;
}

/* ── Page structure ── */
.print-doc {
  max-width: 760px;
  margin: 0 auto;
  padding: 24pt 28pt;
}

h1.print-title {
  font-size: 18pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-bottom: 2px solid #1a1a1a;
  padding-bottom: 6pt;
  margin-bottom: 14pt;
}

h2.print-section {
  font-size: 10pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #555;
  margin: 18pt 0 6pt;
  border-bottom: 1px solid #ccc;
  padding-bottom: 3pt;
}

.print-subtitle {
  font-size: 10pt;
  color: #555;
  margin-bottom: 10pt;
  font-style: italic;
}

/* ── Map ── */
.print-map {
  margin: 10pt 0 16pt;
  page-break-inside: avoid;
  text-align: left;
}

.print-map svg {
  max-width: 100%;
  height: auto;
}

/* ── Info lines ── */
.info-line {
  font-size: 10.5pt;
  margin-bottom: 5pt;
  line-height: 1.55;
}

.info-label {
  font-weight: 700;
  font-size: 10pt;
}

.info-value {
  color: #1a1a1a;
}

/* ── Rumors / hooks ── */
.rumor-list {
  margin: 4pt 0 10pt;
  padding-left: 0;
  list-style: none;
}

.rumor-list li {
  font-size: 10.5pt;
  padding: 4pt 0 4pt 14pt;
  border-bottom: 1px dotted #ddd;
  position: relative;
  color: #333;
  font-style: italic;
}

.rumor-list li::before {
  content: '—';
  position: absolute;
  left: 0;
  color: #888;
}

/* ── Factions ── */
.faction-block {
  border-left: 3px solid #888;
  padding-left: 10pt;
  margin-bottom: 10pt;
  page-break-inside: avoid;
}

.faction-name {
  font-size: 10pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #444;
}

.faction-type {
  font-size: 9pt;
  color: #777;
  margin-left: 6pt;
}

/* ── Wandering table ── */
.wt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10pt;
  margin: 6pt 0 10pt;
  page-break-inside: avoid;
}

.wt-table tr + tr {
  border-top: 1px solid #e0e0e0;
}

.wt-table td {
  padding: 3pt 4pt;
  vertical-align: top;
}

.wt-roll {
  font-weight: 700;
  color: #555;
  width: 24pt;
  text-align: right;
  padding-right: 8pt;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* ── Room cards ── */
.room-card {
  margin-bottom: 12pt;
  page-break-inside: avoid;
  border-top: 1px solid #ccc;
  padding-top: 10pt;
}

.room-card + .room-card { border-top: 1px solid #ccc; }

.room-number {
  font-size: 9pt;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 2pt;
}

.room-type-label {
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 4pt;
}

.room-size {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0.02em;
  opacity: 0.85;
}

.content-tag {
  display: inline-block;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 1pt 5pt;
  border-radius: 2pt;
  color: #fff;
  margin-right: 6pt;
  vertical-align: middle;
}

.tag-empty    { background: #888; }
.tag-trap     { background: #b84040; }
.tag-hazard   { background: #b89030; }
.tag-obstacle { background: #6a7ab8; }
.tag-trick    { background: #3a8ab8; }
.tag-special  { background: #7a5ab8; }
.tag-weird    { background: #c040b0; }
.tag-npc      { background: #3a7a5a; }
.tag-monster  { background: #b84040; }
.tag-final    { background: #c9a227; color: #1a1209; }

.room-activity {
  font-size: 10pt;
  color: #555;
  font-style: italic;
  vertical-align: middle;
}

.room-detail {
  font-size: 10.5pt;
  margin-bottom: 4pt;
  line-height: 1.55;
}

.room-detail-label {
  font-weight: 700;
}

.room-description {
  font-size: 10.5pt;
  color: #444;
  font-style: italic;
  margin-bottom: 4pt;
  line-height: 1.55;
}

.statblock {
  font-size: 10pt;
  font-family: 'Courier New', monospace;
  background: #f5f5f5;
  border-radius: 2pt;
  padding: 4pt 8pt;
  margin: 4pt 0;
  line-height: 1.5;
}

.exits-line {
  font-size: 9.5pt;
  color: #555;
  margin-bottom: 3pt;
}

.exit-item {
  display: inline-block;
  margin-right: 8pt;
  margin-bottom: 2pt;
}

.exit-passage {
  font-style: italic;
}

.exit-meta {
  color: #888;
  font-size: 9pt;
}

.atmo-line {
  font-size: 9.5pt;
  color: #666;
  margin-bottom: 2pt;
}

.atmo-label { font-weight: 700; color: #555; }

.separator {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 10pt 0;
}

@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-doc { padding: 0; }
  .no-print { display: none !important; }
  h2.print-section { break-before: auto; }
  .room-card { break-inside: avoid; }
}

@page {
  margin: 18mm 15mm;
}
`;

// ── Helpers ───────────────────────────────────────────────────────

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtSB(sb) {
  if (!sb) return '';
  return escHtml(sb).replace(
    /(^|, )(AC|HP|ATK|MV|Ch|AL|LV|S|D|C|I|W)(\s)/g,
    (_, pre, label, post) => `${pre}<b>${label}</b>${post}`
  );
}

function abilities(list) {
  if (!list?.length) return '';
  return list.map(a =>
    `<div class="room-detail"><span class="room-detail-label">${escHtml(a.name)}.</span> ${escHtml(a.description)}</div>`
  ).join('');
}

function infoLine(label, value) {
  if (!value) return '';
  return `<div class="info-line"><span class="info-label">${escHtml(label)}.</span> ${escHtml(value)}</div>`;
}

// ── Dungeon overview ──────────────────────────────────────────────

function printDungeon(d) {
  if (!d) return '';

  const rumorsHtml = d.rumors?.length
    ? `<h2 class="print-section">Rumors</h2>
       <ul class="rumor-list">${d.rumors.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>`
    : '';

  const factionsHtml = d.factions?.length
    ? `<h2 class="print-section">Factions</h2>` +
      d.factions.map(f => {
        const typeLabel = f.isInhabitant
          ? `inhabitant${f.creature ? ` — ${f.creature}` : ''}`
          : 'outsider';
        const otherDisps = Object.entries(f.dispositions ?? {})
          .map(([name, disp]) => `${name}: ${disp}`).join(' · ');
        return `
          <div class="faction-block">
            <div><span class="faction-name">${escHtml(f.name)}</span><span class="faction-type">${escHtml(typeLabel)}</span></div>
            ${infoLine('Goal', f.goal)}
            ${infoLine('Key NPC', `${f.npcName} — ${f.npcTrait}`)}
            ${infoLine('Secret', f.secret)}
            ${infoLine('Toward PCs', f.dispositionTowardPCs)}
            ${otherDisps ? `<div class="info-line"><span class="info-label">Toward others.</span> ${escHtml(otherDisps)}</div>` : ''}
          </div>`.trim();
      }).join('')
    : '';

  const guardHtml = (() => {
    const m = d.entranceGuardMonster;
    if (!m) return '';
    return `
      <div class="info-line"><span class="info-label">${escHtml(m.name)}</span>${m.description ? ` — <em>${escHtml(m.description)}</em>` : ''}</div>
      <div class="statblock">${fmtSB(m.statblock)}</div>
      ${abilities(m.abilities)}
    `.trim();
  })();

  const wtHtml = d.wanderingTable?.length
    ? `<h2 class="print-section">Random Encounters — 2d6, every 2 turns</h2>
       <table class="wt-table">
         ${d.wanderingTable.map(row =>
           `<tr><td class="wt-roll">${row.roll}</td><td>${escHtml(row.entry)}</td></tr>`
         ).join('')}
       </table>`
    : '';

  return `
    <h1 class="print-title">${escHtml(d.type)}</h1>
    <div class="print-subtitle">${escHtml(d.size)} · ${d.rooms} rooms · ${escHtml(d.architecture)} architecture${d.aesthetic ? ` · ${escHtml(d.aesthetic)}` : ''}</div>
    <div class="room-description">${escHtml(d.flavor)}</div>
    ${d.concept ? `${infoLine('Theme', d.concept.theme)}${infoLine('Story', d.concept.story)}` : ''}
    ${rumorsHtml}
    ${factionsHtml}
    <h2 class="print-section">Entrance</h2>
    ${infoLine('Location', d.entrance)}
    ${infoLine('Guard', d.entranceGuard)}
    ${guardHtml}
    ${infoLine('Final Room', d.finalRoom)}
    ${wtHtml}
  `.trim();
}

// ── Wilderness region overview ────────────────────────────────────

function printRegion(r) {
  if (!r) return '';

  const hooksHtml = r.hooks?.length
    ? `<h2 class="print-section">Hooks</h2>
       <ul class="rumor-list">${r.hooks.map(h => `<li>${escHtml(h)}</li>`).join('')}</ul>`
    : '';

  const factionsHtml = r.factions?.length
    ? `<h2 class="print-section">Factions</h2>` +
      r.factions.map(f => {
        const typeLabel = f.isInhabitant
          ? `inhabitant${f.creature ? ` — ${f.creature}` : ''}`
          : 'outsider';
        const otherDisps = Object.entries(f.dispositions ?? {})
          .map(([name, disp]) => `${name}: ${disp}`).join(' · ');
        return `
          <div class="faction-block">
            <div><span class="faction-name">${escHtml(f.name)}</span><span class="faction-type">${escHtml(typeLabel)}</span></div>
            ${infoLine('Goal', f.goal)}
            ${infoLine('Key NPC', `${f.npcName} — ${f.npcTrait}`)}
            ${infoLine('Secret', f.secret)}
            ${infoLine('Toward PCs', f.dispositionTowardPCs)}
            ${otherDisps ? `<div class="info-line"><span class="info-label">Toward others.</span> ${escHtml(otherDisps)}</div>` : ''}
          </div>`.trim();
      }).join('')
    : '';

  const wtHtml = r.wanderingTable?.length
    ? `<h2 class="print-section">Wandering Encounters — 2d6, every 2 watches</h2>
       <table class="wt-table">
         ${r.wanderingTable.map(row =>
           `<tr><td class="wt-roll">${row.roll}</td><td>${escHtml(row.entry)}</td></tr>`
         ).join('')}
       </table>`
    : '';

  return `
    <h1 class="print-title">${escHtml(r.terrain)} — ${escHtml(r.concept?.theme ?? '')}</h1>
    <div class="print-subtitle">${escHtml(r.size?.label)} · ${r.size?.hexes} areas</div>
    ${infoLine('Story', r.concept?.story)}
    ${infoLine('Destination', r.destination)}
    ${hooksHtml}
    ${factionsHtml}
    ${wtHtml}
  `.trim();
}

// ── Room card ─────────────────────────────────────────────────────

function printRoom(r, levelLabel) {
  const tagClass = `tag-${r.contentType ?? 'empty'}`;
  const tagText = {
    empty: 'Empty', monster: 'Monster', trap: 'Trap', hazard: 'Hazard',
    obstacle: 'Obstacle', trick: 'Trick', special: 'Special', weird: 'Weird', npc: 'NPC',
  }[r.contentType] ?? r.contentType;

  const numLabel = r._roomNumber
    ? `<div class="room-number">${levelLabel ? `${levelLabel} · ` : ''}Room ${r._roomNumber}${r.finalRoomDesc ? ' ★' : ''}</div>`
    : '';

  const roomTypeLabel = r.roomType === 'corridor' ? 'Corridor' : r.roomType === 'cavern' ? 'Cavern' : 'Room';
  const sizeLabel = r.roomSize ? ` <span class="room-size">${escHtml(r.roomSize.label)}</span>` : '';
  const typeLabel = `<div class="room-type-label">${roomTypeLabel}${sizeLabel}</div>`;

  // Exits
  const exitLines = (r.exits ?? []).map(e =>
    `<span class="exit-item"><span class="exit-passage">${escHtml(e.label ?? e.direction)}</span> <span class="exit-meta">(${escHtml(e.direction)} — ${escHtml(e.type)})</span></span>`
  ).join('');
  const exitHtml = exitLines
    ? `<div class="exits-line"><span class="atmo-label">Exits.</span> ${exitLines}</div>`
    : `<div class="exits-line atmo-label">Dead end.</div>`;

  const atmoHtml = [
    r.smell      ? `<div class="atmo-line"><span class="atmo-label">Smell.</span> ${escHtml(r.smell)}</div>` : '',
    r.sound      ? `<div class="atmo-line"><span class="atmo-label">Sound.</span> ${escHtml(r.sound)}</div>` : '',
    r.furnishing ? `<div class="atmo-line"><span class="atmo-label">Furnishing.</span> ${escHtml(r.furnishing)}</div>` : '',
    r.hallway    ? `<div class="atmo-line"><span class="atmo-label">Corridor.</span> ${escHtml(r.hallway)}</div>` : '',
  ].filter(Boolean).join('');

  const finalHtml = r.finalRoomDesc
    ? `<div class="room-detail" style="border-left:3px solid #c9a227;padding-left:8pt;margin-bottom:6pt"><span class="room-detail-label">Final room.</span> ${escHtml(r.finalRoomDesc)}</div>`
    : '';

  // Content body
  let body = '';
  const ct = r.contentType;

  if (ct === 'empty') {
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><span class="room-activity">${escHtml(r.feature)}</span></div>
      ${r.treasure ? `<div class="room-detail"><span class="room-detail-label">Treasure.</span> ${escHtml(r.treasure.item)} — <em>${escHtml(r.treasure.hidden)}</em></div>` : ''}
    `.trim();

  } else if (ct === 'trap') {
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><span class="room-activity">${escHtml(r.trapType)}</span></div>
      <div class="room-description">${escHtml(r.trapDetail)}</div>
      ${r.treasure ? `<div class="room-detail"><span class="room-detail-label">Treasure.</span> ${escHtml(r.treasure.item)}</div>` : ''}
    `.trim();

  } else if (ct === 'hazard') {
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><span class="room-activity">${escHtml(r.hazard?.split(' — ')[0])}</span></div>
      <div class="room-description">${escHtml(r.hazard)}</div>
      <div class="room-description">${escHtml(r.hazardDetail)}</div>
    `.trim();

  } else if (ct === 'obstacle') {
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><span class="room-activity">${escHtml(r.obstacle?.split(' — ')[0]?.split(',')[0])}</span></div>
      <div class="room-description">${escHtml(r.obstacle)}</div>
      <div class="room-description">${escHtml(r.obstacleDetail)}</div>
    `.trim();

  } else if (ct === 'weird') {
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span></div>
      <div class="room-description">${escHtml(r.weird)}</div>
    `.trim();

  } else if (ct === 'trick') {
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><span class="room-activity">${escHtml(r.trick?.split(' — ')[0])}</span></div>
      <div class="room-description">${escHtml(r.trick)}</div>
      <div class="room-description">${escHtml(r.trickDetail)}</div>
    `.trim();

  } else if (ct === 'special') {
    const { special, specialDetail, valuableMonster, valuableMonsterReason, specialMonster, specialExtra } = r;
    let extraHtml = '';
    if (valuableMonster) {
      extraHtml = `
        <div class="room-detail"><b>${escHtml(valuableMonster.name)}</b>${valuableMonster.description ? ` — <em>${escHtml(valuableMonster.description)}</em>` : ''}</div>
        <div class="statblock">${fmtSB(valuableMonster.statblock)}</div>
        ${abilities(valuableMonster.abilities)}
        <div class="room-detail"><span class="room-detail-label">Why alive.</span> ${escHtml(valuableMonsterReason)}</div>
      `.trim();
    } else if (specialMonster) {
      extraHtml = `
        <div class="room-detail"><b>${escHtml(specialMonster.name)}</b>${specialMonster.description ? ` — <em>${escHtml(specialMonster.description)}</em>` : ''}</div>
        <div class="statblock">${fmtSB(specialMonster.statblock)}</div>
        ${abilities(specialMonster.abilities)}
      `.trim();
    } else if (specialExtra) {
      extraHtml = `<div class="room-description">${escHtml(specialExtra)}</div>`;
    }
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><span class="room-activity">${escHtml(special)}</span></div>
      <div class="room-description">${escHtml(specialDetail)}</div>
      ${extraHtml}
    `.trim();

  } else if (ct === 'monster') {
    const { monster, count, activity, faction, treasure } = r;
    if (monster) {
      const nameStr = count === 1 ? monster.name : `${monster.name} ×${count}`;
      body = `
        <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><b>${escHtml(nameStr)}</b><span class="room-activity" style="margin-left:8pt">${escHtml(activity)}</span></div>
        ${faction ? `<div class="atmo-line"><span class="atmo-label">Faction.</span> ${escHtml(faction.name)}</div>` : ''}
        ${monster.description ? `<div class="room-description">${escHtml(monster.description)}</div>` : ''}
        <div class="statblock">${fmtSB(monster.statblock)}</div>
        ${abilities(monster.abilities)}
        ${treasure ? `<div class="room-detail"><span class="room-detail-label">Treasure.</span> ${escHtml(treasure.item)}</div>` : ''}
      `.trim();
    } else {
      body = `<div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span> <em>No matching monster found.</em></div>`;
    }

  } else if (ct === 'npc') {
    const { npcRole, npcDesire, npcMood, faction } = r;
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><span class="room-activity">${escHtml(npcRole)}</span></div>
      ${faction ? `<div class="atmo-line"><span class="atmo-label">Faction.</span> ${escHtml(faction.name)}</div>` : ''}
      <div class="room-description">${escHtml(npcMood)}${npcDesire ? `; ${escHtml(npcDesire)}` : ''}</div>
    `.trim();
  }

  return `
    <div class="room-card">
      ${numLabel}${typeLabel}
      ${exitHtml}
      ${atmoHtml}
      ${finalHtml}
      ${body}
    </div>
  `.trim();
}

// ── Hex card ──────────────────────────────────────────────────────

function printHex(hex) {
  const tagClass = `tag-${hex.contentType ?? 'empty'}`;
  const tagText = {
    empty: 'Clear', monster: 'Monster', npc: 'Encounter', special: 'Landmark',
    hazard: 'Hazard', obstacle: 'Obstacle', weird: 'Weird',
  }[hex.contentType] ?? hex.contentType;

  const numLabel = hex._hexNumber
    ? `<div class="room-number">Area ${hex._hexNumber}${hex.finalHexDesc ? ' ★' : ''}</div>`
    : '';

  const exitLines = (hex.exits ?? []).map(e =>
    `<span class="exit-item"><span class="exit-passage">${escHtml(e.label ?? e.direction)}</span> <span class="exit-meta">(${escHtml(e.direction)})</span></span>`
  ).join('');
  const exitHtml = exitLines
    ? `<div class="exits-line"><span class="atmo-label">Paths.</span> ${exitLines}</div>`
    : '';

  const atmoHtml = [
    hex.terrain        ? `<div class="atmo-line"><span class="atmo-label">Terrain.</span> ${escHtml(hex.terrain)}${hex.weather ? ` — ${escHtml(hex.weather)}` : ''}</div>` : '',
    hex.terrainFeature ? `<div class="atmo-line"><span class="atmo-label">Feature.</span> ${escHtml(hex.terrainFeature)}</div>` : '',
    hex.sign           ? `<div class="atmo-line"><span class="atmo-label">Sign.</span> ${escHtml(hex.sign)}</div>` : '',
  ].filter(Boolean).join('');

  const finalHtml = hex.finalHexDesc
    ? `<div class="room-detail" style="border-left:3px solid #c9a227;padding-left:8pt;margin-bottom:6pt"><span class="room-detail-label">Destination.</span> ${escHtml(hex.finalHexDesc)}</div>`
    : '';

  let body = '';
  const ct = hex.contentType;

  if (ct === 'empty') {
    body = `<div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><span class="room-activity">uneventful travel</span></div>`;

  } else if (ct === 'monster') {
    const { monster, count, activity, faction, treasure } = hex;
    if (monster) {
      const nameStr = count === 1 ? monster.name : `${monster.name} ×${count}`;
      body = `
        <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><b>${escHtml(nameStr)}</b><span class="room-activity" style="margin-left:8pt">${escHtml(activity)}</span></div>
        ${faction ? `<div class="atmo-line"><span class="atmo-label">Faction.</span> ${escHtml(faction.name)}</div>` : ''}
        ${monster.description ? `<div class="room-description">${escHtml(monster.description)}</div>` : ''}
        <div class="statblock">${fmtSB(monster.statblock)}</div>
        ${abilities(monster.abilities)}
        ${treasure ? `<div class="room-detail"><span class="room-detail-label">Treasure.</span> ${escHtml(treasure.item)}</div>` : ''}
      `.trim();
    } else {
      body = `<div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span> <em>No matching creature found.</em></div>`;
    }

  } else if (ct === 'npc') {
    const { npcRole, npcDesire, npcMood, faction, isSettlement } = hex;
    const typeLabel = isSettlement ? 'Settlement' : 'Encounter';
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${typeLabel}</span><span class="room-activity">${escHtml(npcRole)}</span></div>
      ${faction ? `<div class="atmo-line"><span class="atmo-label">Faction.</span> ${escHtml(faction.name)}</div>` : ''}
      <div class="room-description">${escHtml(npcMood)}${npcDesire ? `; ${escHtml(npcDesire)}` : ''}</div>
    `.trim();

  } else if (ct === 'special') {
    const typeLabel = hex.isRuin ? 'Ruin' : 'Landmark';
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${typeLabel}</span><span class="room-activity">${escHtml(hex.special)}</span></div>
      <div class="room-description">${escHtml(hex.specialDetail)}</div>
      ${hex.treasure ? `<div class="room-detail"><span class="room-detail-label">Treasure.</span> ${escHtml(hex.treasure.item)}</div>` : ''}
    `.trim();

  } else if (ct === 'hazard') {
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><span class="room-activity">${escHtml(hex.hazard?.split(' — ')[0])}</span></div>
      <div class="room-description">${escHtml(hex.hazard)}</div>
      <div class="room-description">${escHtml(hex.hazardDetail)}</div>
    `.trim();

  } else if (ct === 'obstacle') {
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span><span class="room-activity">${escHtml(hex.obstacle?.split(' — ')[0]?.split(',')[0])}</span></div>
      <div class="room-description">${escHtml(hex.obstacle)}</div>
      <div class="room-description">${escHtml(hex.obstacleDetail)}</div>
    `.trim();

  } else if (ct === 'weird') {
    body = `
      <div class="room-detail"><span class="content-tag ${tagClass}">${tagText}</span></div>
      <div class="room-description">${escHtml(hex.weird)}</div>
    `.trim();
  }

  return `
    <div class="room-card">
      ${numLabel}
      ${exitHtml}
      ${atmoHtml}
      ${finalHtml}
      ${body}
    </div>
  `.trim();
}

// ── Map section ───────────────────────────────────────────────────

function printMapSection(svgHtml, title) {
  if (!svgHtml) return '';
  return `
    <h2 class="print-section">${escHtml(title)}</h2>
    <div class="print-map">${svgHtml}</div>
  `.trim();
}

// ── Entry points ──────────────────────────────────────────────────

export function printDungeonCrawl({ dungeon, levels, levelMaps }) {
  const overviewHtml = printDungeon(dungeon);
  const multiLevel = levels.filter(Boolean).length > 1;

  // Collect rooms per level, deduped by _mapId
  const allLevelRooms = [];
  for (let i = 0; i < levels.length; i++) {
    const lvl = levels[i];
    if (!lvl) continue;
    const seen = new Set();
    const uniqueRooms = lvl.history.filter(r => {
      if (r._mapId == null) return true;
      if (seen.has(r._mapId)) return false;
      seen.add(r._mapId);
      return true;
    });
    allLevelRooms.push({ depth: i + 1, rooms: uniqueRooms });
  }

  const roomsHtml = allLevelRooms.map(({ depth, rooms }) => {
    const levelLabel = multiLevel ? `Level ${depth}` : '';
    const mapEntry   = levelMaps?.find(lm => lm.depth === depth);
    const header     = multiLevel
      ? `<h2 class="print-section">Level ${depth}</h2>`
      : `<h2 class="print-section">Map &amp; Rooms</h2>`;
    const mapHtml    = mapEntry?.svg ? `<div class="print-map">${mapEntry.svg}</div>` : '';
    return header + mapHtml + rooms.map(r => printRoom(r, levelLabel)).join('');
  }).join('');

  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(dungeon?.type ?? 'Dungeon')}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
<div class="print-doc">
  ${overviewHtml}
  ${roomsHtml}
</div>
<script>window.onload = () => window.print();<\/script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(doc); w.document.close(); }
}

export function printWildCrawl({ region, history, mapSvg }) {
  const overviewHtml = printRegion(region);

  // Deduplicate by _mapId
  const seen = new Set();
  const uniqueHexes = history.filter(h => {
    if (h._mapId == null) return true;
    if (seen.has(h._mapId)) return false;
    seen.add(h._mapId);
    return true;
  });

  const hexesHtml = uniqueHexes.length
    ? `<h2 class="print-section">Areas</h2>` + uniqueHexes.map(printHex).join('')
    : '';

  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(region?.terrain ?? 'Wilderness')} — ${escHtml(region?.concept?.theme ?? '')}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
<div class="print-doc">
  ${overviewHtml}
  ${printMapSection(mapSvg, 'Map')}
  ${hexesHtml}
</div>
<script>window.onload = () => window.print();<\/script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(doc); w.document.close(); }
}
