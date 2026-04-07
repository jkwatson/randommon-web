import { calculateConnectionStrength } from './strength.js';

/**
 * @typedef {Object} Edge
 * @property {number} id
 * @property {import('./strength.js').Strength} strength
 */

export class MonsterGraph {
  constructor() {
    /** @type {Map<number, import('./monster.js').Monster>} */
    this.vertices = new Map();
    /** @type {Map<number, Edge[]>} */
    this.adjacency = new Map();
  }

  /**
   * @param {import('./monster.js').Monster[]} monsters
   */
  build(monsters) {
    this.vertices.clear();
    this.adjacency.clear();

    for (const m of monsters) {
      this.vertices.set(m.id, m);
    }

    for (const m1 of monsters) {
      const edges = [];
      for (const m2 of monsters) {
        if (m1.id === m2.id) continue;
        const strength = calculateConnectionStrength(m1, m2);
        if (strength.total > 0) {
          edges.push({ id: m2.id, strength });
        }
      }
      edges.sort((a, b) => b.strength.total - a.strength.total);
      this.adjacency.set(m1.id, edges);
    }
  }

  /**
   * Returns up to `limit` neighbors of `seedId` that are in `poolIds`.
   * @param {number} seedId
   * @param {Set<number>} poolIds
   * @param {number} limit
   * @returns {import('./monster.js').Monster[]}
   */
  getAdjacent(seedId, poolIds, limit) {
    const neighbors = this.adjacency.get(seedId) ?? [];
    const result = [];
    for (const { id } of neighbors) {
      if (result.length >= limit) break;
      if (poolIds.has(id)) result.push(this.vertices.get(id));
    }
    return result;
  }

  /**
   * Returns the neighbor at position `distance` in the adjacency list,
   * skipping monsters in `excludedIds`, restricted to `poolIds`.
   * @param {number} seedId
   * @param {Set<number>} excludedIds
   * @param {Set<number>} poolIds
   * @param {number} distance  1-based index into the filtered adjacency list
   * @returns {import('./monster.js').Monster}
   */
  getNeighborExcluding(seedId, excludedIds, poolIds, distance) {
    const neighbors = this.adjacency.get(seedId) ?? [];
    let count = 0;
    for (const { id } of neighbors) {
      if (!poolIds.has(id) || excludedIds.has(id)) continue;
      count++;
      if (count >= distance) return this.vertices.get(id);
    }
    // If distance overshoots, return the last valid neighbor
    for (const { id } of neighbors) {
      if (!poolIds.has(id) || excludedIds.has(id)) continue;
      return this.vertices.get(id);
    }
    throw new Error(`No valid neighbors found for monster id ${seedId}`);
  }

  /** @returns {import('./monster.js').Monster[]} */
  all() {
    return Array.from(this.vertices.values());
  }

  /** @returns {number} */
  get size() {
    return this.vertices.size;
  }
}
