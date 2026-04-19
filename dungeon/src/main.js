import { createEngine } from '@wandering-monstrum/perchance-engine';
import { generateEncounter, loadMonsters } from './encounters/generator.js';
import starterTables from '../tables/starter.txt?raw';

const engine = createEngine(starterTables);

// ── Encounter UI ──────────────────────────────────────────────────
const selRegion  = document.getElementById('sel-region');
const selTerrain = document.getElementById('sel-terrain');
const selTime    = document.getElementById('sel-time');
const selFire    = document.getElementById('sel-fire');
const fireRow    = document.getElementById('fire-row');
const terrainRow = document.getElementById('terrain-row');
const outputEncounter = document.getElementById('output-encounter');

function applyTimeControls() {
  const isNight = selTime.value === 'night';
  terrainRow.hidden = isNight;
  fireRow.hidden    = !isNight;
}

selTime.addEventListener('change', applyTimeControls);
applyTimeControls();

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
    `<div class="enc-header"><span class="enc-who"><b>${npc.label}${countStr}</b> — ${npc.title} (LV ${npc.level}, ${npc.alignment})</span><span class="enc-activity">${activity}</span></div>`,
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

// ── Atmosphere UI ─────────────────────────────────────────────────
const outputDungeon = document.getElementById('output-dungeon');
const outputRoom    = document.getElementById('output-room');

document.getElementById('btn-dungeon').addEventListener('click', () => {
  outputDungeon.innerHTML = engine.evaluate('dungeonOverview');
  outputDungeon.hidden = false;
});

document.getElementById('btn-room').addEventListener('click', () => {
  outputRoom.innerHTML = engine.evaluate('roomAtmosphere');
  outputRoom.hidden = false;
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

// ── Init ──────────────────────────────────────────────────────────
loadMonsters();
