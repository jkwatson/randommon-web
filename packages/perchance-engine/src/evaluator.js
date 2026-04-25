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

  /**
   * Safe restricted expression evaluator.
   * Supports: numeric/boolean/string literals, arithmetic (+,-,*,/,%),
   * comparisons (==,!=,<,>,<=,>=), logical (&&,||,!), ternary (?:),
   * parentheses, known variables, and dice("expr") calls.
   * Does NOT use eval or new Function.
   */
  _evalExpr(expr) {
    const src = expr.trim();
    let pos = 0;
    const vars = this.vars;

    const skipWs = () => { while (pos < src.length && /\s/.test(src[pos])) pos++; };
    const expect = (ch) => {
      skipWs();
      if (src[pos] !== ch) throw new Error(`Expected '${ch}' at pos ${pos}`);
      pos++;
    };

    const parseTernary = () => {
      const cond = parseOr();
      skipWs();
      if (src[pos] === '?') {
        pos++;
        const then = parseTernary();
        expect(':');
        const els = parseTernary();
        return cond ? then : els;
      }
      return cond;
    };

    const parseOr = () => {
      let left = parseAnd();
      skipWs();
      while (src.slice(pos, pos + 2) === '||') {
        pos += 2;
        const right = parseAnd();
        left = left || right;
        skipWs();
      }
      return left;
    };

    const parseAnd = () => {
      let left = parseNot();
      skipWs();
      while (src.slice(pos, pos + 2) === '&&') {
        pos += 2;
        const right = parseNot();
        left = left && right;
        skipWs();
      }
      return left;
    };

    const parseNot = () => {
      skipWs();
      if (src[pos] === '!' && src[pos + 1] !== '=') { pos++; return !parseNot(); }
      return parseCompare();
    };

    const parseCompare = () => {
      let left = parseAdd();
      skipWs();
      while (pos < src.length) {
        let op;
        const two = src.slice(pos, pos + 2);
        if (two === '==' || two === '!=' || two === '<=' || two === '>=') { op = two; pos += 2; }
        else if (src[pos] === '<') { op = '<'; pos++; }
        else if (src[pos] === '>') { op = '>'; pos++; }
        else break;
        const right = parseAdd();
        // eslint-disable-next-line eqeqeq
        if (op === '==') left = left == right;
        else if (op === '!=') left = left != right; // eslint-disable-line eqeqeq
        else if (op === '<=') left = left <= right;
        else if (op === '>=') left = left >= right;
        else if (op === '<') left = left < right;
        else left = left > right;
        skipWs();
      }
      return left;
    };

    const parseAdd = () => {
      let left = parseMul();
      skipWs();
      while (pos < src.length && (src[pos] === '+' || src[pos] === '-')) {
        const op = src[pos++];
        const right = parseMul();
        left = op === '+' ? left + right : left - right;
        skipWs();
      }
      return left;
    };

    const parseMul = () => {
      let left = parseUnary();
      skipWs();
      while (pos < src.length && (src[pos] === '*' || src[pos] === '/' || src[pos] === '%')) {
        const op = src[pos++];
        const right = parseUnary();
        if (op === '*') left = left * right;
        else if (op === '/') left = left / right;
        else left = left % right;
        skipWs();
      }
      return left;
    };

    const parseUnary = () => {
      skipWs();
      if (src[pos] === '-') { pos++; return -parseUnary(); }
      return parsePrimary();
    };

    const parseString = () => {
      const q = src[pos++];
      let str = '';
      while (pos < src.length && src[pos] !== q) {
        if (src[pos] === '\\') { pos++; }
        str += src[pos++];
      }
      if (src[pos] !== q) throw new Error('Unterminated string literal');
      pos++;
      return str;
    };

    const parsePrimary = () => {
      skipWs();
      if (src[pos] === '(') {
        pos++;
        const val = parseTernary();
        expect(')');
        return val;
      }
      if (src[pos] === '"' || src[pos] === "'") return parseString();
      if (/[\d.]/.test(src[pos])) {
        let num = '';
        let hasDot = false;
        while (pos < src.length && /[\d.]/.test(src[pos])) {
          if (src[pos] === '.') {
            if (hasDot) break;
            hasDot = true;
          }
          num += src[pos++];
        }
        return parseFloat(num);
      }
      if (/[a-zA-Z_]/.test(src[pos])) {
        let name = '';
        while (pos < src.length && /[\w]/.test(src[pos])) name += src[pos++];
        if (name === 'true') return true;
        if (name === 'false') return false;
        if (name === 'dice') {
          skipWs();
          expect('(');
          const arg = parseTernary();
          skipWs();
          expect(')');
          return rollDice(String(arg));
        }
        if (name in vars) return vars[name];
        throw new Error(`Unknown identifier: ${name}`);
      }
      throw new Error(`Unexpected character '${src[pos]}' at pos ${pos}`);
    };

    const result = parseTernary();
    skipWs();
    if (pos !== src.length) throw new Error(`Unexpected input at pos ${pos}: "${src.slice(pos)}"`);
    return result;
  }
}
