#!/usr/bin/env node
// Dice for playtests: every roll is real and logged, so a transcript can be
// audited. Usage:
//   node cli/roll.mjs [--log=<file>] [--why="Vex: DC 12 DEX, the tripwire"] <expr> [<expr> ...]
// Expressions: 3d6, d20+2, 2d6-1, 2d4, d100, d20adv / d20dis (advantage / disadvantage).
import { randomInt } from 'crypto';
import { appendFileSync } from 'fs';

const args = process.argv.slice(2);
const opt = k => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const exprs = args.filter(a => !a.startsWith('--'));
if (!exprs.length) {
  console.error('usage: node cli/roll.mjs [--log=file] [--why="reason"] 3d6 d20+2 d20adv ...');
  process.exit(1);
}

const die = n => randomInt(1, n + 1);

function roll(expr) {
  const m = expr.trim().toLowerCase().match(/^(\d*)d(\d+)(adv|dis)?([+-]\d+)?$/);
  if (!m) throw new Error(`can't read "${expr}"`);
  const [, count, sides, mode, mod] = m;
  const n = Math.max(1, parseInt(count || '1')), s = parseInt(sides), plus = parseInt(mod || '0');
  if (mode) {
    const pair = [die(s), die(s)];
    const kept = mode === 'adv' ? Math.max(...pair) : Math.min(...pair);
    return { expr, dice: pair, kept, total: kept + plus };
  }
  const dice = Array.from({ length: n }, () => die(s));
  return { expr, dice, total: dice.reduce((a, b) => a + b, 0) + plus };
}

const why = opt('why');
const lines = exprs.map(e => {
  const r = roll(e);
  const shown = r.kept !== undefined ? `[${r.dice.join(', ')}] keeps ${r.kept}` : `[${r.dice.join(', ')}]`;
  return `${r.expr}: ${shown} = ${r.total}`;
});
const out = `${why ? `${why} — ` : ''}${lines.join(' · ')}`;
console.log(out);
const log = opt('log');
if (log) appendFileSync(log, `${new Date().toISOString()}  ${out}\n`);
