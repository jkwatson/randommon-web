import { sourceLabel } from './filterPanel.js';

/**
 * Renders a single monster as an HTML element.
 * @param {import('../core/monster.js').Monster} monster
 * @param {function} onSetSeed  Called with the monster when clicked
 * @returns {HTMLElement}
 */
export function monsterCard(monster, onSetSeed) {
  const card = document.createElement('div');
  card.className = 'monster-card';
  card.title = 'Click to use as seed';

  const sb = monster.statBlock;

  let html = `
    <div class="card-header">
      <span class="card-name">${monster.name}</span>
      <span class="card-badges">
        <span class="badge badge-lv">LV ${monster.level}</span>
        <span class="badge badge-al-${monster.alignment}">${monster.alignment}</span>
        <span class="badge badge-src" title="p. ${monster.page}">${sourceLabel(monster.source)}</span>
      </span>
    </div>
    ${monster.description ? `<div class="card-description">${monster.description}</div>` : ''}
    <div class="card-statline">
      <span>${sb.ac}</span>
      <span>${sb.hp}</span>
      <span>${sb.attack}</span>
      <span>${sb.move}</span>
    </div>
    <div class="card-stats">${sb.stats}</div>
  `;

  if (monster.abilities?.length) {
    html += '<div class="card-abilities">';
    for (const ability of monster.abilities) {
      html += `<div class="ability"><span class="ability-name">${ability.name}.</span> ${ability.description}</div>`;
    }
    html += '</div>';
  }

  card.innerHTML = html;
  card.addEventListener('click', () => onSetSeed(monster));
  return card;
}
