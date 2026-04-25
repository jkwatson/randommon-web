import { parse } from './parser.js';
import { Engine } from './evaluator.js';

export { parse };
export { Engine };
export { rollDice } from './dice.js';

/**
 * Convenience: parse table text and return a ready Engine.
 * @param {string} text
 * @returns {Engine}
 */
export function createEngine(text) {
  return new Engine(parse(text));
}
