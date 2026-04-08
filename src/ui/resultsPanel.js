import { monsterCard } from './monsterCard.js';
import { toast } from './toast.js';

export class ResultsPanel {
  /**
   * @param {HTMLElement} container
   * @param {function} onSetSeed
   */
  constructor(container, onSetSeed) {
    this._container = container;
    this._onSetSeed = onSetSeed;
    this._monsters  = [];
  }

  /** @param {import('../core/monster.js').Monster[]} monsters */
  render(monsters) {
    this._monsters = monsters;
    this._container.innerHTML = '';
    if (!monsters.length) {
      this._container.innerHTML = '<p class="empty-state">No monsters found.</p>';
      return;
    }
    for (const monster of monsters) {
      const card = monsterCard(monster, this._onSetSeed);
      card.classList.add('card-enter');
      // Trigger animation on next frame so the class is applied after mount
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('card-enter-active')));
      this._container.appendChild(card);
    }
  }

  setLoading() {
    this._monsters = [];
    this._container.innerHTML = '<p class="loading-state">Generating encounter...</p>';
  }

  clear() {
    this._monsters = [];
    this._container.innerHTML = '';
  }

  copyAsText() {
    if (!this._monsters.length) return;
    const lines = this._monsters.map(m => {
      let out = m.name;
      if (m.description) out += `\n${m.description}`;
      out += `\n${m.rawStatBlock}`;
      if (m.abilities?.length) {
        for (const a of m.abilities) out += `\n${a.name}. ${a.description}`;
      }
      return out;
    });
    const text = lines.join('\n\n');
    navigator.clipboard.writeText(text).then(() => toast('Copied!'));
  }
}
