/**
 * @typedef {Object} Choices
 * @property {number|null} level
 * @property {string|null} biome
 * @property {string|null} tag
 * @property {string[]} sources      empty array = all sources
 * @property {number} randomness     1–5, only affects cluster
 * @property {import('./monster.js').Monster|null} seedMonster
 */

/**
 * @param {import('./graph.js').MonsterGraph} graph
 * @param {Choices} choices
 * @returns {Set<number>}  Set of monster ids passing the current filters
 */
export function applyFilters(graph, choices) {
  const ids = new Set();
  for (const m of graph.all()) {
    if (choices.level !== null && m.level !== choices.level) continue;
    if (choices.biome !== null && !m.biomes.includes(choices.biome) && !m.biomes.includes('*')) continue;
    if (choices.tag !== null && !m.tags.includes(choices.tag)) continue;
    if (choices.sources?.length > 0 && !choices.sources.includes(m.source)) continue;
    ids.add(m.id);
  }
  return ids;
}

/**
 * @param {import('./graph.js').MonsterGraph} graph
 * @param {Choices} choices
 * @returns {number[]}
 */
export function availableLevels(graph, choices) {
  const relaxed = { ...choices, level: null };
  const ids = applyFilters(graph, relaxed);
  const levels = new Set();
  for (const id of ids) levels.add(graph.vertices.get(id).level);
  return Array.from(levels).sort((a, b) => a - b);
}

/**
 * @param {import('./graph.js').MonsterGraph} graph
 * @param {Choices} choices
 * @returns {string[]}
 */
export function availableBiomes(graph, choices) {
  const relaxed = { ...choices, biome: null };
  const ids = applyFilters(graph, relaxed);
  const biomes = new Set();
  for (const id of ids) {
    for (const b of graph.vertices.get(id).biomes) {
      if (b !== '*') biomes.add(b);
    }
  }
  return Array.from(biomes).sort();
}

/**
 * @param {import('./graph.js').MonsterGraph} graph
 * @param {Choices} choices
 * @returns {string[]}
 */
export function availableTags(graph, choices) {
  const relaxed = { ...choices, tag: null };
  const ids = applyFilters(graph, relaxed);
  const tags = new Set();
  for (const id of ids) {
    for (const t of graph.vertices.get(id).tags) tags.add(t);
  }
  return Array.from(tags).sort();
}

/**
 * @param {import('./graph.js').MonsterGraph} graph
 * @param {Choices} choices
 * @returns {import('./monster.js').Monster}
 */
export function rando(graph, choices) {
  const ids = Array.from(applyFilters(graph, choices));
  if (ids.length === 0) throw new Error('No monsters match current filters');
  const id = ids[Math.floor(Math.random() * ids.length)];
  return graph.vertices.get(id);
}

/**
 * Picks a seed, then gathers randomness*n adjacent monsters from the filtered
 * pool and returns n of them. Higher randomness = larger candidate pool =
 * more varied results.
 * @param {number} n
 * @param {import('./graph.js').MonsterGraph} graph
 * @param {Choices} choices
 * @returns {import('./monster.js').Monster[]}
 */
export function cluster(n, graph, choices) {
  const poolIds = applyFilters(graph, choices);
  const seed = choices.seedMonster ?? rando(graph, choices);

  // Exclude seed from candidate pool so it can't appear as its own neighbor
  const candidateIds = new Set(poolIds);
  candidateIds.delete(seed.id);

  const poolSize = choices.randomness * n;
  const adjacent = graph.getAdjacent(seed.id, candidateIds, poolSize);

  let candidates = [...adjacent];
  if (choices.randomness > 1) {
    candidates = candidates.sort(() => Math.random() - 0.5);
  }

  const result = [seed];
  for (let i = 0; result.length < n && i < candidates.length; i++) {
    result.push(candidates[i]);
  }
  return result;
}

/**
 * Walks the graph hop by hop. Each hop picks a step distance uniformly from
 * 1–9, giving natural per-step noise. The user randomness setting does not
 * affect walk — the unpredictability is baked in.
 * @param {number} n
 * @param {import('./graph.js').MonsterGraph} graph
 * @param {Choices} choices
 * @returns {import('./monster.js').Monster[]}
 */
export function walk(n, graph, choices) {
  const poolIds = applyFilters(graph, choices);
  const seed = choices.seedMonster ?? rando(graph, choices);

  // Pool for walk excludes already-visited monsters (starts with seed excluded)
  const poolIds2 = new Set(poolIds);
  poolIds2.delete(seed.id);

  let current = seed;
  const result = [seed];
  const excludedIds = new Set([seed.id]);

  for (let i = 0; i < n - 1; i++) {
    const distance = Math.floor(Math.random() * 9) + 1;
    try {
      current = graph.getNeighborExcluding(current.id, excludedIds, poolIds2, distance);
      result.push(current);
      excludedIds.add(current.id);
    } catch {
      break;
    }
  }
  return result;
}

/**
 * @param {string} term
 * @param {import('./graph.js').MonsterGraph} graph
 * @param {Choices} choices
 * @returns {import('./monster.js').Monster[]}
 */
export function search(term, graph, choices) {
  const lower = term.toLowerCase();
  const ids = applyFilters(graph, choices);
  const results = [];
  for (const id of ids) {
    const m = graph.vertices.get(id);
    if (
      m.name.toLowerCase().includes(lower) ||
      m.tags.some(t => t.toLowerCase().includes(lower)) ||
      m.biomes.some(b => b.toLowerCase().includes(lower))
    ) {
      results.push(m);
    }
  }
  return results;
}
