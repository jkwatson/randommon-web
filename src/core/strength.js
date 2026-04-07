/**
 * @typedef {Object} Strength
 * @property {number} total
 * @property {number} level
 * @property {number} tag
 * @property {number} biome
 * @property {number} alignment
 * @property {number} source
 */

/**
 * @param {import('./monster.js').Monster} m1
 * @param {import('./monster.js').Monster} m2
 * @returns {Strength}
 */
export function calculateConnectionStrength(m1, m2) {
  const commonTags = m1.tags.filter(t => m2.tags.includes(t)).length;

  let commonBiomes;
  if (m1.biomes.includes('*'))      commonBiomes = m2.biomes.length;
  else if (m2.biomes.includes('*')) commonBiomes = m1.biomes.length;
  else commonBiomes = m1.biomes.filter(b => m2.biomes.includes(b)).length;

  const levelStrength  = 10 - 7 * Math.abs(m1.level - m2.level);
  const tagBonus       = 10 * commonTags;
  const biomeBonus     = 5 * Math.min(commonBiomes, 3);
  const alignmentBonus = m1.alignment === m2.alignment ? 15 : 0;
  const sourceBonus    = m1.source === m2.source ? 10 : 0;
  const total = levelStrength + tagBonus + biomeBonus + alignmentBonus + sourceBonus;

  return { total, level: levelStrength, tag: tagBonus, biome: biomeBonus,
           alignment: alignmentBonus, source: sourceBonus };
}
