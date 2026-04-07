/**
 * Manages the left filter panel.
 */
export class FilterPanel {
  /**
   * @param {HTMLElement} container
   * @param {import('./app.js').AppState} state
   * @param {import('../worker-client.js').WorkerClient} client
   */
  constructor(container, state, client) {
    this._container = container;
    this._state = state;
    this._client = client;
    this._render();
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

      <div class="seed-section">
        <div class="seed-label">Seed monster</div>
        <div id="seed-display" class="seed-display empty">none</div>
        <button id="clear-seed" class="btn-secondary" style="display:none">✕ clear</button>
      </div>

      <hr class="panel-divider" />

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
        <input type="range" id="filter-randomness" min="1" max="5" value="3" />
        <span id="randomness-value">3</span>
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

    // Randomness group visibility
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
