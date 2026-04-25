const splitField = str => str ? str.split(',').map(s => s.trim()) : [];

export class MonsterDB {
  constructor(monsters) {
    this._all = monsters;
    this._byName = new Map(monsters.map(m => [m.name.toUpperCase(), m]));
  }

  get size() { return this._all.length; }

  get(name) {
    return this._byName.get(name.toUpperCase()) ?? null;
  }

  filter({ source, tags, biome, maxLevel } = {}) {
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

      if (maxLevel != null && parseInt(m.level) > maxLevel) return false;

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
