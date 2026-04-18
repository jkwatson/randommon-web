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
const outputEncounter = document.getElementById('output-encounter');

selTime.addEventListener('change', () => {
  fireRow.hidden = selTime.value !== 'night';
});

document.getElementById('btn-encounter').addEventListener('click', () => {
  const enc = generateEncounter({
    terrain: selTerrain.value,
    time:    selTime.value,
    fire:    selFire.value === 'yes',
    region:  selRegion.value,
  });
  outputEncounter.innerHTML = renderEncounter(enc);
  outputEncounter.hidden = false;
});

function renderEncounter(enc) {
  const distFt = enc.distance;
  const distDesc = distFt <= 30 ? 'very close' : distFt <= 60 ? 'nearby' : distFt <= 120 ? 'in the distance' : 'far off';

  if (enc.isMortal) {
    const md = enc.mortalDetails;
    if (md) {
      const { basic: b } = md;
      const basicStr = `${b.sex}, ${b.age}, ${b.kindred} — ${b.dress} dress, ${b.feature}`;
      return `
        <div class="enc-distance">${distFt} ft — ${distDesc}</div>
        <div class="enc-who"><b>${md.label}</b></div>
        <div class="enc-description">${basicStr}</div>
        <div class="enc-statblock">${md.statblock}</div>
        ${md.detail ? `<div class="enc-activity">${md.detail}</div>` : ''}
        <div class="enc-activity">${enc.activity}</div>
      `.trim();
    }
    return `
      <div class="enc-distance">${distFt} ft — ${distDesc}</div>
      <div class="enc-who"><b>${enc.description}</b></div>
      <div class="enc-activity">${enc.activity}</div>
    `.trim();
  }

  const m = enc.monster;
  const countStr = enc.count === 1 ? '1' : `${enc.count}`;
  const nameStr = enc.count === 1 ? enc.creatureName : `${enc.creatureName} (×${countStr})`;

  let statblock = '';
  if (m) {
    statblock = `
      <div class="enc-statblock">${m.statblock}</div>
      ${m.description ? `<div class="enc-description"><i>${m.description}</i></div>` : ''}
      ${m.abilities?.length ? renderAbilities(m.abilities) : ''}
    `.trim();
  } else {
    statblock = `<div class="enc-unknown">[No stat block found for ${enc.creatureName}]</div>`;
  }

  return `
    <div class="enc-distance">${distFt} ft — ${distDesc}</div>
    <div class="enc-who"><b>${nameStr}</b></div>
    <div class="enc-activity">${enc.activity}</div>
    ${statblock}
  `.trim();
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
