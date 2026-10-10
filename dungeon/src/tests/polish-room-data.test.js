import { describe, it, expect } from 'vitest';
import { roomSections, enforceRoomData, gestaltLines } from '../../../cli/polish.js';

const brief = `## ROOMS

--- Room 1 [ENTRANCE] — Monster — Room, 20 × 20 ft
Exits: North → Room 2 [wooden door]
Zone: the antechamber
Territory: goblin warband
GESTALT — Countdown [intervention]: INTERVENTION — do the rite here: 2 turns and a DC 15 check (INT or WIS) adds 8 turns to the countdown; a second success stops it entirely.
  Monster: ZOMBIE ×3
  Stat block: AC 11, HP 11, ATK 1 slam +1 (1d6), MV near, S +1, D -1, C +2, I -3, W -2, Ch -3, AL C, LV 2

--- Room 2 [FINAL] — Trap — Room, 30 × 30 ft
Exits: South → Room 1 [wooden door]
GESTALT — Containment [prison]: PRISON — the reaver is bound here.
  Imprisoned creature: REAVER — bound here; include its stat block in this room
  Imprisoned creature stat block: AC 17, HP 28, ATK 3 bastard sword +4 (1d8 + 2), MV near, AL C, LV 6`;

describe('roomSections', () => {
  it('keeps whole sections — capital Z ("Zone:", "ZOMBIE") does not end them', () => {
    const s = roomSections(brief);
    expect([...s.keys()]).toEqual([1, 2]);
    expect(s.get(1)).toContain('Territory: goblin warband');
    expect(s.get(1)).toContain('Stat block: AC 11, HP 11');
    expect(s.get(2)).toContain('Imprisoned creature stat block');
  });
});

describe('enforceRoomData', () => {
  const s = roomSections(brief);
  const room = (body) => `### Room 1 — HALL\n\n${body}\n\n*Exits: N [wooden door → Room 2]*`;

  it('reads the gestalt lines', () => {
    expect(gestaltLines(s.get(1))).toEqual([{ pattern: 'Countdown', role: 'intervention', note: expect.stringContaining('DC 15') }]);
  });

  it('leaves a faithful room untouched', () => {
    const ok = room('Zombies.\n\n- **Rite.** 2 turns and a DC 15 check adds 8 turns; a second success stops it.\n\n> ZOMBIE ×3  AC 11 HP 11 ATK 1 slam +1 (1d6)');
    expect(enforceRoomData(ok, s.get(1))).toBe(ok);
  });

  it('restores a dropped stat block and drifted mechanics before the exits', () => {
    const drifted = room('Zombies.\n\n- **Rite.** A DC 15 WIS check extends it by one scene.');
    const out = enforceRoomData(drifted, s.get(1));
    expect(out).toContain('> ZOMBIE  AC 11, HP 11');
    expect(out).toContain('*From the module design (intervention):* INTERVENTION');
    expect(out.trimEnd().endsWith('*Exits: N [wooden door → Room 2]*')).toBe(true);
  });

  it('adds a bound prisoner the writer left out', () => {
    const out = enforceRoomData('### Room 2 — VAULT\n\nThe reaver strains in chains.\n\n*Exits: S [wooden door → Room 1]*', s.get(2));
    expect(out).toContain('> REAVER  AC 17, HP 28');
  });
});
