import { monsterCard } from './monsterCard.js';

export class ResultsPanel {
  /**
   * @param {HTMLElement} container
   * @param {function} onSetSeed
   */
  constructor(container, onSetSeed) {
    this._container = container;
    this._onSetSeed = onSetSeed;
  }

  /** @param {import('../core/monster.js').Monster[]} monsters */
  render(monsters) {
    this._container.innerHTML = '';
    if (!monsters.length) {
      this._container.innerHTML = '<p class="empty-state">No monsters found.</p>';
      return;
    }
    for (const monster of monsters) {
      this._container.appendChild(monsterCard(monster, this._onSetSeed));
    }
  }

  setLoading() {
    this._container.innerHTML = '<p class="loading-state">Generating encounter...</p>';
  }

  clear() {
    this._container.innerHTML = '';
  }
}
