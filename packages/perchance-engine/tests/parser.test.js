import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';

describe('parse', () => {
  it('parses a simple list', () => {
    const lists = parse('colors\n  red\n  blue\n  green');
    expect(lists.get('colors')).toEqual(['red', 'blue', 'green']);
  });

  it('parses multiple lists', () => {
    const lists = parse('fruits\n  apple\n  banana\nveggies\n  carrot');
    expect(lists.get('fruits')).toEqual(['apple', 'banana']);
    expect(lists.get('veggies')).toEqual(['carrot']);
  });

  it('preserves weight suffixes', () => {
    const lists = parse('things\n  rare^1\n  common^5');
    expect(lists.get('things')).toEqual(['rare^1', 'common^5']);
  });

  it('ignores comment lines', () => {
    const lists = parse('stuff\n  // a comment\n  real item');
    expect(lists.get('stuff')).toEqual(['real item']);
  });

  it('ignores blank lines', () => {
    const lists = parse('stuff\n  item1\n\n  item2');
    expect(lists.get('stuff')).toEqual(['item1', 'item2']);
  });
});
