import { WorkerClient } from './worker-client.js';
import { AppState } from './ui/app.js';
import { FilterPanel } from './ui/filterPanel.js';
import { ResultsPanel } from './ui/resultsPanel.js';
import { SearchModal } from './ui/searchModal.js';
import { HelpModal } from './ui/helpModal.js';
import { loadFromUrl, saveToUrl } from './ui/urlState.js';

const client    = new WorkerClient();
const state     = new AppState();
const helpModal = new HelpModal();

// Restore state from URL before anything renders
loadFromUrl(state);

// Persist state to URL on every change
state.addEventListener('change', () => saveToUrl(state));

const statusBar   = document.getElementById('app-status');
const filterEl    = document.getElementById('filter-panel');
const resultsEl   = document.getElementById('results-grid');
const sourcesEl   = document.getElementById('sources-bar');

const copyBtn = document.getElementById('btn-copy');

const results = new ResultsPanel(resultsEl, monster => {
  state.setSeedMonster(monster);
});

// Show copy button only when there are results
const _origRender   = results.render.bind(results);
const _origShowError = results.showError.bind(results);
results.render = function(monsters) {
  _origRender(monsters);
  copyBtn.style.display = monsters.length ? '' : 'none';
};
results.showError = function(message) {
  _origShowError(message);
  copyBtn.style.display = 'none';
};

// Append generate controls to filter panel after FilterPanel renders
const searchModal = new SearchModal(client, state, monster => results.render([monster]));

client.ready().then(meta => {
  statusBar.textContent = `${meta.monsterCount} monsters loaded`;

  new FilterPanel(filterEl, state, client, meta.sources, sourcesEl);

  // Generate Encounter button — inside the encounter box
  const encounterSection = document.getElementById('encounter-section');
  const generateBtn = document.createElement('button');
  generateBtn.className = 'btn-primary';
  generateBtn.id = 'btn-generate';
  generateBtn.textContent = 'Generate Encounter';
  encounterSection.appendChild(generateBtn);

  // Single Random button — separate, below the encounter box
  const singleSection = document.createElement('div');
  singleSection.className = 'single-section';
  singleSection.innerHTML = `<button class="btn-secondary" id="btn-single">Single Random</button>`;
  filterEl.appendChild(singleSection);

  document.getElementById('btn-generate').addEventListener('click', generate);
  document.getElementById('btn-single').addEventListener('click', async () => {
    results.setLoading();
    try {
      const monster = await client.rando(state.toChoices());
      results.render([monster]);
    } catch (err) {
      results.showError(buildEmptyMessage(state));
    }
  });

  // Expose for console experiments
  window.randommon = client;
  window.state = state;
}).catch(err => {
  statusBar.textContent = `Error: ${err.message}`;
});

async function generate() {
  results.setLoading();
  try {
    const choices = state.toChoices();
    const monsters = state.mode === 'walk'
      ? await client.walk(state.size, choices)
      : await client.cluster(state.size, choices);
    results.render(monsters);
  } catch (err) {
    results.showError(buildEmptyMessage(state));
  }
}

function buildEmptyMessage(state) {
  const active = [];
  if (state.level !== null) active.push(`level ${state.level}`);
  if (state.biome !== null) active.push(`biome "${state.biome}"`);
  if (state.tag !== null)   active.push(`tag "${state.tag}"`);
  if (state.sources.size > 0) active.push(`sources: ${[...state.sources].join(', ')}`);

  if (active.length) {
    return `No monsters match your current filters (${active.join(', ')}). Try relaxing or clearing some filters.`;
  }
  return 'No monsters found. Try selecting at least one source.';
}

document.getElementById('btn-search').addEventListener('click', () => searchModal.open());
copyBtn.addEventListener('click', () => results.copyAsText());

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  switch (e.key) {
    case '/':
      e.preventDefault();
      searchModal.open();
      break;
    case '?':
      e.preventDefault();
      helpModal.open();
      break;
    case 'g':
      if (!searchModal.isOpen() && !helpModal.isOpen()) {
        e.preventDefault();
        generate();
      }
      break;
    case 'r':
      if (!searchModal.isOpen() && !helpModal.isOpen()) {
        e.preventDefault();
        document.getElementById('btn-single').click();
      }
      break;
    case 's':
      if (!searchModal.isOpen() && !helpModal.isOpen()) {
        e.preventDefault();
        document.getElementById('sources-toggle')?.click();
      }
      break;
    case 'c':
      if (!searchModal.isOpen() && !helpModal.isOpen()) {
        e.preventDefault();
        results.copyAsText();
      }
      break;
    case 'Escape':
      searchModal.close();
      helpModal.close();
      break;
    default:
      if (!searchModal.isOpen() && !helpModal.isOpen() && e.key >= '1' && e.key <= '9') {
        state.setSize(parseInt(e.key, 10));
        document.getElementById('filter-size').value = e.key;
      } else if (!searchModal.isOpen() && !helpModal.isOpen() && e.key === '0') {
        state.setSize(10);
        document.getElementById('filter-size').value = '10';
      }
  }
});
