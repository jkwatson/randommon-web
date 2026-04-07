const SOURCE_LABELS = {
  core:             'Core',
  cs1:              'Cursed Scroll 1',
  cs2:              'Cursed Scroll 2',
  cs3:              'Cursed Scroll 3',
  cs4:              'Cursed Scroll 4',
  cs5:              'Cursed Scroll 5',
  custom:           'Custom',
  us:               'Unnatural Selection',
  DTS:              'Dragontown',
  SB1:              'Shadow Beasties 1',
  SB2:              'Shadow Beasties 2',
  monday:           'Monster Monday',
  AA:               'Adventure Anthology',
  GMC:              'Gamemaster Companion',
  'stygian library':'Stygian Library',
};

export function sourceLabel(s) {
  return SOURCE_LABELS[s] ?? s;
}

/**
 * Manages the left filter panel.
 */
export class FilterPanel {
  /**
   * @param {HTMLElement} container
   * @param {import('./app.js').AppState} state
   * @param {import('../worker-client.js').WorkerClient} client
   * @param {string[]} allSources
   */
  constructor(container, state, client, allSources, sourcesContainer) {
    this._container        = container;
    this._state            = state;
    this._client           = client;
    this._allSources       = allSources;
    this._sourcesContainer = sourcesContainer ?? container;
    this._render();
    this._renderSources();
    this._syncControls();
    this._refreshDropdowns();

    state.addEventListener('change', () => {
      this._syncControls();
      this._refreshDropdowns();
    });
  }

  _render() {
    this._container.innerHTML = `
      <div class="filter-group">
        <label for="filter-level">Level</label>
        <select id="filter-level"><option value="">Any</option></select>
      </div>
      <div class="filter-group">
        <label for="filter-biome">Biome</label>
        <select id="filter-biome"><option value="">Any</option></select>
      </div>
      <div class="filter-group">
        <label for="filter-tag">Tag</label>
        <select id="filter-tag"><option value="">Any</option></select>
      </div>

      <hr class="panel-divider" />

      <div class="encounter-box" id="encounter-section">
        <div class="encounter-box-label">Encounter</div>

        <div class="seed-section">
          <div class="seed-label">Seed monster</div>
          <div id="seed-display" class="seed-display empty">none</div>
          <button id="clear-seed" class="btn-secondary" style="display:none">✕ clear</button>
        </div>

        <div class="filter-group">
          <div class="filter-label">Mode</div>
          <label class="radio-label">
            <input type="radio" name="mode" value="cluster" checked /> Cluster
          </label>
          <label class="radio-label">
            <input type="radio" name="mode" value="walk" /> Walk
          </label>
        </div>

        <div class="filter-group">
          <label for="filter-size">Encounter size</label>
          <select id="filter-size">
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${n===5?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>

        <div class="filter-group" id="randomness-group">
          <label for="filter-randomness">Randomness <span class="hint">(cluster only)</span></label>
          <input type="range" id="filter-randomness" min="1" max="5" value="1" />
          <span id="randomness-value">1</span>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const c = this._container;

    c.querySelector('#filter-level').addEventListener('change', e => {
      this._state.setLevel(e.target.value ? parseInt(e.target.value, 10) : null);
    });
    c.querySelector('#filter-biome').addEventListener('change', e => {
      this._state.setBiome(e.target.value || null);
    });
    c.querySelector('#filter-tag').addEventListener('change', e => {
      this._state.setTag(e.target.value || null);
    });
    c.querySelector('#clear-seed').addEventListener('click', () => {
      this._state.clearSeed();
    });
    c.querySelectorAll('input[name="mode"]').forEach(radio => {
      radio.addEventListener('change', e => {
        this._state.setMode(e.target.value);
      });
    });
    c.querySelector('#filter-size').addEventListener('change', e => {
      this._state.setSize(parseInt(e.target.value, 10));
    });
    const randSlider = c.querySelector('#filter-randomness');
    const randValue  = c.querySelector('#randomness-value');
    randSlider.addEventListener('input', e => {
      randValue.textContent = e.target.value;
      this._state.setRandomness(parseInt(e.target.value, 10));
    });
  }

  _renderSources() {
    const sc = this._sourcesContainer;
    sc.innerHTML = `
      <div class="sources-bar-inner">
        <button id="sources-toggle" class="btn-sources-toggle">
          <span id="sources-toggle-icon">▶</span> Sources
        </button>
        <div class="source-list source-list-bar" id="source-list" style="display:none">
          ${this._allSources.map(s => `
            <label class="source-item">
              <input type="checkbox" name="source" value="${s}" ${this._state.sources.has(s) ? 'checked' : ''} />
              ${sourceLabel(s)}
            </label>
          `).join('')}
        </div>
        <button id="clear-sources" class="btn-link" style="display:none">reset</button>
      </div>
    `;

    sc.querySelector('#sources-toggle').addEventListener('click', () => {
      const list = sc.querySelector('#source-list');
      const icon = sc.querySelector('#sources-toggle-icon');
      const open = list.style.display !== 'none';
      list.style.display = open ? 'none' : '';
      icon.textContent = open ? '▶' : '▼';
    });
    sc.querySelector('.source-list').addEventListener('change', e => {
      if (e.target.name === 'source') this._state.toggleSource(e.target.value);
    });
    sc.querySelector('#clear-sources').addEventListener('click', () => {
      this._state.resetSources();
    });
  }

  _syncControls() {
    const c = this._container;
    const s = this._state;

    // Seed display
    const seedDisplay = c.querySelector('#seed-display');
    const clearBtn    = c.querySelector('#clear-seed');
    if (s.seedMonster) {
      seedDisplay.textContent = s.seedMonster.name;
      seedDisplay.classList.remove('empty');
      clearBtn.style.display = '';
    } else {
      seedDisplay.textContent = 'none';
      seedDisplay.classList.add('empty');
      clearBtn.style.display = 'none';
    }

    // Source checkboxes
    const sc = this._sourcesContainer;
    sc.querySelectorAll('input[name="source"]').forEach(cb => {
      cb.checked = s.sources.has(cb.value);
    });
    const isDefault = s.sources.size === 1 && s.sources.has('core');
    sc.querySelector('#clear-sources').style.display = isDefault ? 'none' : '';

    // Randomness group
    c.querySelector('#randomness-group').style.opacity = s.mode === 'walk' ? '0.4' : '1';
    c.querySelector('#filter-randomness').disabled = s.mode === 'walk';
  }

  async _refreshDropdowns() {
    const choices = this._state.toChoices();
    const [levels, biomes, tags] = await Promise.all([
      this._client.availableLevels(choices),
      this._client.availableBiomes(choices),
      this._client.availableTags(choices),
    ]);

    this._populateSelect('filter-level', levels.map(l => ({ value: l, label: `LV ${l}` })), this._state.level);
    this._populateSelect('filter-biome', biomes.map(b => ({ value: b, label: b })), this._state.biome);
    this._populateSelect('filter-tag',   tags.map(t => ({ value: t, label: t })), this._state.tag);
  }

  _populateSelect(id, options, currentValue) {
    const select = this._container.querySelector(`#${id}`);
    if (!select) return;
    const prev = currentValue ?? '';
    select.innerHTML = '<option value="">Any</option>' +
      options.map(o => `<option value="${o.value}" ${String(o.value) === String(prev) ? 'selected' : ''}>${o.label}</option>`).join('');
  }
}
