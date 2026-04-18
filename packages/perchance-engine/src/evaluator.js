import { rollDice } from './dice.js';

// Matches [expression] — list reference, variable use, or JS expression
const REF_RE = /\[([^\[\]]+)\]/g;
// Matches {a|b|c} inline list
const INLINE_RE = /\{([^{}]+)\}/g;
// Weight suffix: text^weight or text^[expr]
const WEIGHT_SUFFIX_RE = /\^(\[.+?\]|\S+)$/;

export class Engine {
  /**
   * @param {Map<string, string[]>} lists - from parser.parse()
   */
  constructor(lists) {
    this.lists = lists;
    this.vars = Object.create(null);
  }

  evaluate(listName) {
    if (!this.lists.has(listName)) return `[unknown list: ${listName}]`;
    const item = this._selectOne(listName);
    return this._resolve(item);
  }

  _selectOne(listName) {
    const items = this.lists.get(listName) ?? [];
    const weighted = [];

    for (const raw of items) {
      const { text, weight } = this._parseWeight(raw);
      const w = this._evalWeight(weight);
      if (w > 0) weighted.push({ text, w });
    }

    if (weighted.length === 0) return '';
    const total = weighted.reduce((s, i) => s + i.w, 0);
    let roll = Math.random() * total;
    for (const { text, w } of weighted) {
      roll -= w;
      if (roll <= 0) return text;
    }
    return weighted[weighted.length - 1].text;
  }

  _parseWeight(raw) {
    const m = raw.match(WEIGHT_SUFFIX_RE);
    if (!m) return { text: raw, weight: '1' };
    return { text: raw.slice(0, raw.length - m[0].length), weight: m[1] };
  }

  _evalWeight(weight) {
    if (weight.startsWith('[') && weight.endsWith(']')) {
      const expr = weight.slice(1, -1);
      try {
        const result = this._evalExpr(expr);
        if (result === false || result === null || result === undefined) return 0;
        const n = Number(result);
        return isNaN(n) ? (result ? 1 : 0) : n;
      } catch { return 0; }
    }
    const n = parseFloat(weight);
    return isNaN(n) ? 1 : n;
  }

  _resolve(text) {
    if (!text) return '';
    // Resolve inline lists first: {a|b|c}
    let result = text.replace(INLINE_RE, (_, inner) => {
      const parts = inner.split('|').map(p => {
        const m = p.match(/\^(\d+)$/);
        return m ? { text: p.slice(0, -m[0].length), w: parseInt(m[1]) } : { text: p, w: 1 };
      });
      const total = parts.reduce((s, p) => s + p.w, 0);
      let roll = Math.random() * total;
      for (const { text: t, w } of parts) { roll -= w; if (roll <= 0) return t; }
      return parts[parts.length - 1].text;
    });

    // Resolve [references] iteratively (handles nested output that itself contains refs)
    let prev;
    let iterations = 0;
    do {
      prev = result;
      result = result.replace(REF_RE, (_, expr) => this._evalRef(expr));
      iterations++;
    } while (result !== prev && iterations < 10);

    return result;
  }

  _evalRef(expr) {
    const trimmed = expr.trim();

    // Assignment: [varName = listName, ""]
    const assignMatch = trimmed.match(/^(\w+)\s*=\s*(\w+)\.selectOne\s*,\s*["']["']$/);
    if (assignMatch) {
      const [, varName, listName] = assignMatch;
      this.vars[varName] = this._selectOne(listName);
      return '';
    }

    // dice("expr") call
    const diceMatch = trimmed.match(/^dice\(["'](.+?)["']\)(\*\d+)?$/);
    if (diceMatch) {
      const result = rollDice(diceMatch[1]);
      return diceMatch[2] ? String(result * parseInt(diceMatch[2].slice(1))) : String(result);
    }

    // list.selectMany(n).joinItems("sep")
    const manyMatch = trimmed.match(/^(\w+)\.selectMany\((\d+)\)\.joinItems\(["'](.+?)["']\)$/);
    if (manyMatch) {
      const [, listName, countStr, sep] = manyMatch;
      const count = parseInt(countStr, 10);
      return Array.from({ length: count }, () => this._resolve(this._selectOne(listName)))
        .join(sep.replace(/\\n/g, '\n'));
    }

    // Known variable
    if (trimmed in this.vars) return String(this.vars[trimmed]);

    // Known list name
    if (this.lists.has(trimmed)) return this._resolve(this._selectOne(trimmed));

    // JS expression (ternary, arithmetic, comparisons)
    try {
      return String(this._evalExpr(trimmed));
    } catch {
      return `[${expr}]`;
    }
  }

  _evalExpr(expr) {
    // Safe-ish eval with vars and a dice helper in scope
    const vars = this.vars;
    const dice = (e) => rollDice(e);
    // eslint-disable-next-line no-new-func
    return new Function(...Object.keys(vars), 'dice', `return (${expr})`)(...Object.values(vars), dice);
  }
}
