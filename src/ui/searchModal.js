/**
 * Search modal with live results and keyboard navigation.
 * @param {import('../worker-client.js').WorkerClient} client
 * @param {import('./app.js').AppState} state
 */
export class SearchModal {
  constructor(client, state, onSelect) {
    this._client   = client;
    this._state    = state;
    this._onSelect = onSelect;
    this._debounceTimer = null;
    this._activeIndex = -1;
    this._results = [];

    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    // Backdrop
    this._backdrop = document.createElement('div');
    this._backdrop.className = 'search-backdrop';

    // Modal
    this._modal = document.createElement('div');
    this._modal.className = 'search-modal';
    this._modal.innerHTML = `
      <div class="search-input-wrap">
        <input type="text" id="search-input" placeholder="Search monsters, tags, biomes…" autocomplete="off" />
      </div>
      <div class="search-hint">↑↓ navigate · Enter set as seed · Esc close</div>
      <ul class="search-results" id="search-results"></ul>
    `;

    this._backdrop.appendChild(this._modal);
    document.body.appendChild(this._backdrop);

    this._input   = this._modal.querySelector('#search-input');
    this._list    = this._modal.querySelector('#search-results');
  }

  _bindEvents() {
    // Close on backdrop click
    this._backdrop.addEventListener('click', e => {
      if (e.target === this._backdrop) this.close();
    });

    // Live search with debounce
    this._input.addEventListener('input', () => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._runSearch(), 150);
    });

    // Keyboard navigation
    this._input.addEventListener('keydown', e => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this._moveActive(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this._moveActive(-1);
          break;
        case 'Enter':
          e.preventDefault();
          if (this._activeIndex >= 0 && this._results[this._activeIndex]) {
            this._select(this._results[this._activeIndex]);
          }
          break;
        case 'Escape':
          this.close();
          break;
      }
    });

    this._bindListEvents();

    // Global keyboard shortcut
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !this._isOpen() && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        this.open();
      }
      if (e.key === 'Escape' && this._isOpen()) {
        this.close();
      }
    });
  }

  async _runSearch() {
    const term = this._input.value.trim();
    if (!term) {
      this._setResults([]);
      return;
    }
    // Search ignores active filters — search all monsters
    const allChoices = { level: null, biome: null, tag: null, randomness: 1, seedMonster: null };
    const results = await this._client.search(term, allChoices);
    this._setResults(results.slice(0, 50));
  }

  _setResults(results) {
    this._results = results;
    this._activeIndex = results.length > 0 ? 0 : -1;
    this._renderList();
  }

  _renderList() {
    this._list.innerHTML = '';
    if (this._results.length === 0 && this._input.value.trim()) {
      this._list.innerHTML = '<li class="search-empty">No monsters found</li>';
      return;
    }
    this._results.forEach((m, i) => {
      const li = document.createElement('li');
      li.className = 'search-result' + (i === this._activeIndex ? ' active' : '');
      li.dataset.index = i;
      li.innerHTML = `
        <span class="sr-name">${m.name}</span>
        <span class="sr-meta">LV ${m.level} · ${m.alignment} · ${m.source}</span>
      `;
      this._list.appendChild(li);
    });
  }

  _bindListEvents() {
    this._list.addEventListener('click', e => {
      const li = e.target.closest('.search-result');
      if (!li) return;
      this._select(this._results[parseInt(li.dataset.index, 10)]);
    });

    this._list.addEventListener('mousemove', e => {
      const li = e.target.closest('.search-result');
      if (!li) return;
      const i = parseInt(li.dataset.index, 10);
      if (i === this._activeIndex) return;
      this._activeIndex = i;
      this._list.querySelectorAll('.search-result').forEach((el, idx) => {
        el.classList.toggle('active', idx === i);
      });
    });
  }

  _moveActive(dir) {
    if (!this._results.length) return;
    this._activeIndex = Math.max(0, Math.min(this._results.length - 1, this._activeIndex + dir));
    this._list.querySelectorAll('.search-result').forEach((el, i) => {
      el.classList.toggle('active', i === this._activeIndex);
    });
    // Scroll active item into view
    this._list.querySelectorAll('.search-result')[this._activeIndex]?.scrollIntoView({ block: 'nearest' });
  }

  _select(monster) {
    this._state.setSeedMonster(monster);
    this._onSelect?.(monster);
    this.close();
  }

  open() {
    this._backdrop.classList.add('open');
    this._input.value = '';
    this._setResults([]);
    requestAnimationFrame(() => this._input.focus());
  }

  close() {
    this._backdrop.classList.remove('open');
  }

  _isOpen() {
    return this._backdrop.classList.contains('open');
  }
}
