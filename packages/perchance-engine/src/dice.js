const DICE_RE = /^(\d+)d(\d+)([+-]\d+)?$/i;

export function rollDice(expr) {
  const m = String(expr).trim().match(DICE_RE);
  if (!m) throw new Error(`Invalid dice expression: ${expr}`);
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  let total = mod;
  for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
  return total;
}
