const splitField = str => str ? str.split(',').map(s => s.trim()) : [];

// A monster's level as a number. "*" (beyond the scale, e.g. the hydra) counts
// as 10, as in the main app (src/core/monster.js).
export function monsterLevel(level) {
  return level === '*' ? 10 : parseInt(level, 10);
}

export class MonsterDB {
  constructor(monsters) {
    this._all = monsters;
    // Some names are in more than one book (core and Dolmenwood both have a
    // SHADOW, a GHOUL, a WIGHT...). Keep every version; get() returns the one
    // from the source the current dungeon draws on.
    this._byName = new Map();
    for (const m of monsters) {
      const key = m.name.toUpperCase();
      if (!this._byName.has(key)) this._byName.set(key, []);
      this._byName.get(key).push(m);
    }
    this.preferSource = 'core';
  }

  get size() { return this._all.length; }

  get(name, source = this.preferSource) {
    const all = this._byName.get(name.toUpperCase());
    if (!all) return null;
    return all.find(m => m.source === source) ?? all[0];
  }

  filter({ source, tags, biome, maxLevel, minLevel } = {}) {
    const sources  = source ? [].concat(source) : null;
    const tagList  = tags   ? [].concat(tags)   : null;
    const biomes   = biome  ? [].concat(biome)  : null;

    return this._all.filter(m => {
      if (sources && !sources.includes(m.source)) return false;

      if (tagList) {
        const mTags = splitField(m.tags);
        if (!tagList.some(t => mTags.includes(t))) return false;
      }

      if (biomes) {
        const mBiomes = splitField(m.biome);
        // '*' means the monster appears in all biomes
        if (!mBiomes.includes('*') && !biomes.some(b => mBiomes.includes(b))) return false;
      }

      if (maxLevel != null && monsterLevel(m.level) > maxLevel) return false;
      if (minLevel != null && monsterLevel(m.level) < minLevel) return false;

      return true;
    });
  }

  random(criteria = {}) {
    const pool = this.filter(criteria);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

export async function loadMonsterDB() {
  const files = [
    '/data/core.json',
    '/data/dolmenwood.json',
    '/data/dolmenwood-animals.json',
  ];
  const arrays = await Promise.all(files.map(url => fetch(url).then(r => r.json())));
  return new MonsterDB(arrays.flat());
}
