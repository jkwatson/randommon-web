/**
 * Promise-based wrapper around the monster graph Web Worker.
 * All methods return Promises that resolve when the Worker responds.
 */
export class WorkerClient {
  constructor() {
    this._worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this._pending = new Map();
    this._nextId = 1;
    this._readyPromise = new Promise((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });

    this._worker.addEventListener('message', ({ data }) => {
      if (data.type === 'READY') {
        this._meta = data.meta;
        this._resolveReady(data.meta);
        return;
      }
      if (data.type === 'ERROR' && data.requestId === null) {
        this._rejectReady(new Error(data.error));
        return;
      }
      const pending = this._pending.get(data.requestId);
      if (!pending) return;
      this._pending.delete(data.requestId);
      if (data.type === 'RESULT') pending.resolve(data.data);
      else pending.reject(new Error(data.error));
    });
  }

  /** @returns {Promise<Object>} meta: { monsterCount, sources, biomes, tags, levels } */
  ready() {
    return this._readyPromise;
  }

  _query(op, params = {}) {
    const requestId = this._nextId++;
    return new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject });
      this._worker.postMessage({ type: 'QUERY', requestId, op, params });
    });
  }

  /** @param {number} n  @param {Object} choices  @returns {Promise<Monster[]>} */
  cluster(n, choices = {}) {
    return this._query('cluster', { n, choices });
  }

  /** @param {number} n  @param {Object} choices  @returns {Promise<Monster[]>} */
  walk(n, choices = {}) {
    return this._query('walk', { n, choices });
  }

  /** @param {Object} choices  @returns {Promise<Monster>} */
  rando(choices = {}) {
    return this._query('rando', { choices });
  }

  /** @param {string} term  @param {Object} choices  @returns {Promise<Monster[]>} */
  search(term, choices = {}) {
    return this._query('search', { term, choices });
  }

  /** @param {Object} choices  @returns {Promise<Monster[]>} */
  filter(choices = {}) {
    return this._query('filter', { choices });
  }

  /** @param {Object} choices  @returns {Promise<number[]>} */
  availableLevels(choices = {}) {
    return this._query('availableLevels', { choices });
  }

  /** @param {Object} choices  @returns {Promise<string[]>} */
  availableBiomes(choices = {}) {
    return this._query('availableBiomes', { choices });
  }

  /** @param {Object} choices  @returns {Promise<string[]>} */
  availableTags(choices = {}) {
    return this._query('availableTags', { choices });
  }
}
