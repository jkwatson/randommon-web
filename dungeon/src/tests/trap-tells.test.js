import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { trapTellKind, trapTellFor } from '../dungeons/generator.js';

const tables = readFileSync(resolve(__dirname, '../../tables/dungeon-stocking.txt'), 'utf8');
const listLines = (name) => {
  const m = tables.match(new RegExp(`^${name}\\r?\\n((?:  .+\\r?\\n)+)`, 'm'));
  return m ? m[1].split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];
};

describe('trap tells', () => {
  it('gives every trap type a tell kind that fits it', () => {
    const kinds = Object.fromEntries(listLines('dungeonTrapType').map(t => [t, trapTellKind(t)]));
    expect(kinds['Crossbow bolt tripwire']).toBe('Wire');
    expect(kinds['Collapsing ceiling']).toBe('Overhead');
    expect(kinds['Sleep gas']).toBe('Chemical');
    expect(kinds['Poison needle (lock/latch)']).toBe('Lock');
    expect(kinds['Magic rune']).toBe('Magic');
    expect(kinds['Pitfall']).toBe('Floor');
    for (const [type, kind] of Object.entries(kinds)) {
      expect(listLines(`dungeonTrapTell${kind}`).length, type).toBeGreaterThan(0);
    }
  });

  it('never gives a tripwire a tell from overhead', () => {
    const fitting = new Set([...listLines('dungeonTrapTellWire'), ...listLines('dungeonTrapTellAny')]);
    for (let i = 0; i < 40; i++) expect(fitting.has(trapTellFor('Crossbow bolt tripwire'))).toBe(true);
  });
});
