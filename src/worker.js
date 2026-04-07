import { parseMonster } from './core/monster.js';
import { MonsterGraph } from './core/graph.js';
import { applyFilters, availableLevels, availableBiomes, availableTags,
         cluster, walk, rando, search } from './core/wrangler.js';

const graph = new MonsterGraph();

const DATA_FILES = [
  'core.json',
  'cs1.json',
  'cs2.json',
  'cs3.json',
  'cs4.json',
  'cs5.json',
  'custom.json',
  'unnatural_selection.json',
  'dragontown.json',
  'shadow_beasties.json',
  'monster_monday.json',
  'adventure_anthology.json',
  'gamemaster_companion.json',
];

async function init() {
  const allRaw = [];
  await Promise.all(
    DATA_FILES.map(async file => {
      const res = await fetch(`/data/${file}`);
      const monsters = await res.json();
      allRaw.push(...monsters);
    })
  );

  let id = 0;
  const monsters = allRaw.map(raw => parseMonster(raw, id++));
  graph.build(monsters);

  const sources = [...new Set(monsters.map(m => m.source))].sort();
  const biomes = [...new Set(monsters.flatMap(m => m.biomes).filter(b => b !== '*'))].sort();
  const tags = [...new Set(monsters.flatMap(m => m.tags))].sort();
  const levels = [...new Set(monsters.map(m => m.level))].sort((a, b) => a - b);

  self.postMessage({
    type: 'READY',
    meta: { monsterCount: monsters.length, sources, biomes, tags, levels },
  });
}

const defaultChoices = { level: null, biome: null, tag: null, sources: [], randomness: 1, seedMonster: null };

self.addEventListener('message', ({ data }) => {
  const { type, requestId, op, params } = data;

  if (type !== 'QUERY') return;

  try {
    const choices = { ...defaultChoices, ...params?.choices };
    let result;

    switch (op) {
      case 'cluster':
        result = cluster(params.n, graph, choices);
        break;
      case 'walk':
        result = walk(params.n, graph, choices);
        break;
      case 'rando':
        result = rando(graph, choices);
        break;
      case 'search':
        result = search(params.term, graph, choices);
        break;
      case 'filter':
        result = Array.from(applyFilters(graph, choices)).map(id => graph.vertices.get(id));
        break;
      case 'availableLevels':
        result = availableLevels(graph, choices);
        break;
      case 'availableBiomes':
        result = availableBiomes(graph, choices);
        break;
      case 'availableTags':
        result = availableTags(graph, choices);
        break;
      default:
        throw new Error(`Unknown op: ${op}`);
    }

    self.postMessage({ type: 'RESULT', requestId, data: result });
  } catch (err) {
    self.postMessage({ type: 'ERROR', requestId, error: err.message });
  }
});

// Init on load
init().catch(err => self.postMessage({ type: 'ERROR', requestId: null, error: err.message }));
