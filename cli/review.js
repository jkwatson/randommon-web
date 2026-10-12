// Human-in-the-loop review for the module pipeline: before any of the
// expensive LLM passes, the GM looks at the dungeon's structure (map + what is
// in each room), then at the concept (the Pass 1 blueprint), and accepts,
// rerolls, or stops. Everything shown here comes from the checkpoint, so a
// stopped review resumes exactly where it was.

import { writeFileSync, existsSync } from 'fs';
import { spawn, spawnSync } from 'child_process';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { moduleMaps } from '../dungeon/src/maps/module-maps.js';
import { playability, playabilityLine } from '../dungeon/src/maps/playability.js';
import { checkRule } from '../dungeon/src/dungeons/danger.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// What the room holds, in a few words.
export function roomContents(r) {
  const who = r.monster?.name ?? r.beast?.name;
  switch (r.contentType) {
    case 'monster':  return `${r.count > 1 ? `${r.count}× ` : ''}${who ? who.toLowerCase() : 'monster'}${r.activity ? ` (${r.activity})` : ''}`;
    case 'npc':      return `NPC ${r.npcName ?? ''}${r.npcRole ? ` — ${r.npcRole.toLowerCase()}` : ''}`;
    case 'trap':     return `trap: ${r.trapType ?? '?'}`;
    case 'hazard':   return `hazard: ${(r.hazard ?? '?').split(/ — |\.|,/)[0]}`;
    case 'obstacle': return `obstacle: ${(r.obstacle ?? '?').split(/ — |\.|,/)[0]}`;
    case 'special':  return `special: ${r.special ?? '?'}`;
    default:         return r.contentType ?? 'empty';
  }
}

const roles = r => [
  ...(r._isEntrance ? ['entrance'] : []),
  ...(r.finalRoomDesc ? ['final room'] : []),
  ...new Set((r._gestalt ?? []).map(g => g.role).filter(Boolean)),
];

// The playability summary: one line of measures, then any warnings.
export function playabilityText(m) {
  return [`Playability: ${m.verdict.toUpperCase()} — ${playabilityLine(m)}`, ...m.warnings.map(w => `  ! ${w.text}`)].join('\n');
}

const header = ({ dungeon: d }) => {
  const flows = d.cycleFlows ?? [];
  return [
    `${d.type} — ${d.size} · party level ${d.partyLevel}`,
    `Gestalts: ${(d.gestalts ?? []).map(g => g.name).join(' + ') || 'none'}`,
    `Cycles:   ${flows.length ? flows.map(f => `${f.flow.cycles[0].name}${f.zone ? ` (${f.zone})` : ''}`).join(', ') : 'none'}`,
    `Factions: ${(d.factions ?? []).map(f => f.name).join(', ') || 'none'}`,
    ...(d.danger ? [`Danger:   ${checkRule(d)}`] : []),
  ];
};

// The terminal version of Gate 1.
export function structureText(mod, play = playability(mod)) {
  const flag = n => (play.cramped.includes(n) || play.jammed.some(p => p.includes(n)) ? '!' : ' ');
  const rows = [...mod.rooms].sort((a, b) => a._roomNumber - b._roomNumber).map(r =>
    `${flag(r._roomNumber)} ${String(r._roomNumber).padStart(2)}  ${(r.roomType ?? '').padEnd(8)} ${roomContents(r).slice(0, 48).padEnd(48)} ` +
    `${r.faction?.name ? `[${r.faction.name}] ` : ''}${roles(r).length ? `{${roles(r).join(', ')}}` : ''}`.trimEnd());
  return [...header(mod), playabilityText(play), '', ...rows].join('\n');
}

// A self-contained page with the hand-drawn map, the room list, and the
// blueprint once there is one.
export function reviewHtml(mod, { blueprint = null, stage = 'structure' } = {}) {
  const maps = moduleMaps(mod, { unit: 22 });
  const map = maps.overview();
  const play = playability(mod, maps.floorPlan);
  const flagged = n => play.cramped.includes(n) || play.jammed.some(p => p.includes(n));
  const rows = [...mod.rooms].sort((a, b) => a._roomNumber - b._roomNumber).map(r => `
    <tr class="${r.roomType}${flagged(r._roomNumber) ? ' warn' : ''}">
      <td>${r._roomNumber}</td><td>${esc(r.roomType)}</td><td>${esc(r.roomSize?.label)}</td>
      <td>${esc(roomContents(r))}</td><td>${esc(r.faction?.name)}</td><td>${esc(r._zone)}</td><td>${esc(roles(r).join(', '))}</td>
    </tr>`).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Module review</title>
<style>
  body { font: 15px/1.45 Georgia, serif; margin: 24px auto; max-width: 1100px; padding: 0 16px; background: #fff; color: #111; }
  h1 { font-size: 22px; margin: 0 0 4px; } .meta { color: #444; margin: 2px 0; }
  .stage { display: inline-block; background: #111; color: #fff; padding: 2px 10px; font: 13px sans-serif; text-transform: uppercase; letter-spacing: .05em; }
  .stats { margin: 10px 0; padding: 8px 12px; background: #eef3e8; } .stats.fair { background: #f6f0dc; } .stats.poor { background: #fde8e4; }
  .stats ul { margin: 4px 0 0; padding-left: 20px; }
  .map svg { width: 100%; height: auto; border: 1px solid #ccc; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; margin-top: 16px; }
  td, th { border-bottom: 1px solid #ddd; padding: 4px 8px; text-align: left; vertical-align: top; }
  tr.corridor td { color: #555; } tr.warn td { background: #fde8e4; color: #000; }
  pre { white-space: pre-wrap; background: #f7f7f7; padding: 12px; font: 13px/1.5 ui-monospace, monospace; }
</style></head><body>
<span class="stage">Review: ${esc(stage)}</span>
<h1>${esc(blueprint?.match(/^TITLE:\s*(.+)$/m)?.[1] ?? mod.dungeon.type)}</h1>
${header(mod).map(l => `<p class="meta">${esc(l)}</p>`).join('')}
<div class="stats ${play.verdict}"><b>Playability: ${play.verdict}</b> — ${esc(playabilityLine(play))}
${play.warnings.length ? `<ul>${play.warnings.map(w => `<li>${esc(w.text)}</li>`).join('')}</ul>` : ''}</div>
<div class="map">${map}</div>
${mod.dungeon.wanderingTable?.length ? `<h2>Random encounters (d${mod.dungeon.wanderingDie ?? 6})</h2><table>${mod.dungeon.wanderingTable.map(r => `<tr><td>${r.roll}</td><td>${esc(r.entry)}</td></tr>`).join('')}</table>` : ''}
<h2>Rooms</h2>
<table><tr><th>#</th><th>Kind</th><th>Size</th><th>Contents</th><th>Faction</th><th>Zone</th><th>Roles</th></tr>${rows}</table>
${blueprint ? `<h2>Concept (Pass 1 blueprint)</h2><pre>${esc(blueprint)}</pre>` : ''}
</body></html>`;
}

export function writeReview(file, mod, opts) {
  writeFileSync(file, reviewHtml(mod, opts), 'utf8');
  return resolve(file);
}

// Best effort: show the page in the default browser (Windows' from WSL).
export function openInBrowser(file) {
  try {
    if (existsSync('/mnt/c/Windows/explorer.exe')) {
      const win = spawnSync('wslpath', ['-w', file], { encoding: 'utf8' }).stdout?.trim();
      if (win) { spawn('/mnt/c/Windows/explorer.exe', [win], { detached: true, stdio: 'ignore' }).unref(); return; }
    }
    spawn('xdg-open', [file], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch {}
}

// One question on the terminal. Resolves null when there is no one to ask
// (not a TTY, or stdin closes), which the caller treats as "stop here".
export function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve(null);
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(done => {
    let answered = false;
    rl.on('close', () => { if (!answered) done(null); });
    rl.question(question, a => { answered = true; rl.close(); done(a.trim()); });
  });
}
