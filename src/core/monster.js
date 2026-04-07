/**
 * @typedef {Object} Ability
 * @property {string} name
 * @property {string} description
 */

/**
 * @typedef {Object} StatBlock
 * @property {string} ac
 * @property {string} hp
 * @property {string} attack
 * @property {string} move
 * @property {string} stats
 */

/**
 * @typedef {Object} Monster
 * @property {number} id
 * @property {string} name
 * @property {string[]} tags
 * @property {number} level
 * @property {string[]} biomes
 * @property {string} alignment
 * @property {string} attack
 * @property {string} page
 * @property {string} rawStatBlock
 * @property {string} source
 * @property {StatBlock} statBlock
 * @property {string|null} description
 * @property {Ability[]|null} abilities
 */

/**
 * @param {string} full
 * @returns {StatBlock}
 */
export function parseStatBlock(full) {
  const pieces = full.split(',');
  return {
    ac: pieces[0].trim(),
    hp: pieces[1].trim(),
    attack: pieces[2].trim(),
    move: pieces[3].trim(),
    stats: pieces.slice(4, 10).join(',').trim(),
  };
}

/**
 * @param {Object} raw  Raw monster object from JSON
 * @param {number} id
 * @returns {Monster}
 */
export function parseMonster(raw, id) {
  return {
    id,
    name: raw.name,
    tags: raw.tags.split(',').map(s => s.trim()).filter(Boolean),
    level: raw.level === '*' ? 10 : parseInt(raw.level, 10),
    biomes: raw.biome.split(',').map(s => s.trim()).filter(Boolean),
    alignment: raw.alignment,
    attack: raw.attack,
    page: raw.page,
    rawStatBlock: raw.statblock,
    source: raw.source,
    statBlock: parseStatBlock(raw.statblock),
    description: raw.description ?? null,
    abilities: raw.abilities
      ? raw.abilities.map(a => ({ name: a.name, description: a.description }))
      : null,
  };
}
