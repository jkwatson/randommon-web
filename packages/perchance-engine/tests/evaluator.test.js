import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/index.js';

describe('Engine.evaluate', () => {
  it('picks from a simple list', () => {
    const e = createEngine('color\n  red\n  blue');
    expect(['red', 'blue']).toContain(e.evaluate('color'));
  });

  it('returns only item when weight makes others zero', () => {
    const e = createEngine('thing\n  always\n  never^0');
    expect(e.evaluate('thing')).toBe('always');
  });

  it('resolves [listReference] in item text', () => {
    const e = createEngine('size\n  big\nroom\n  a [size] room');
    expect(e.evaluate('room')).toBe('a big room');
  });

  it('resolves inline {a|b} lists', () => {
    const e = createEngine('pick\n  {yes|yes}');
    expect(e.evaluate('pick')).toBe('yes');
  });

  it('resolves dice expressions', () => {
    const e = createEngine('roll\n  [dice("1d1")]');
    expect(e.evaluate('roll')).toBe('1');
  });

  it('resolves conditional weight ^[expr]', () => {
    const e = createEngine('greet\n  hello^[1==1]\n  bye^[1==2]');
    expect(e.evaluate('greet')).toBe('hello');
  });

  it('handles unknown list gracefully', () => {
    const e = createEngine('');
    expect(e.evaluate('nope')).toBe('[unknown list: nope]');
  });
});
