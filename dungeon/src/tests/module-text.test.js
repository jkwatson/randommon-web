import { describe, it, expect } from 'vitest';
import { roomRequirements, enforceDangerLine, vagueSpots, enforceGmSection, enforceRoomData, plainTypeLine, jargonSpots, withHeading } from '../../../cli/polish.js';
import { rankAndFileStatblock } from '../encounters/mortals.js';

const BLUEPRINT = `TITLE: Test

ENTRANCE: A stair.

PRIZE: Room 8 — The saint's hoard.

CROSS-ROOM CONNECTIONS:
- Room 1 → Room 4: Dalt, dying here, saw the crown hidden in Room 4. He read the door in Room 8.

GESTALT IN ROOMS:
- Room 11 — Great Divide [sight line]: Through a grate the party sees Room 5's throne.
- Room 5 — Great Divide [overlook]: A throne on a dais.`;

describe('room requirements', () => {
  it('gives a sight line to the viewing room and tells the viewed room it is seen', () => {
    expect(roomRequirements(BLUEPRINT, 11)).toEqual([expect.stringMatching(/^Room 11 — Great Divide/)]);
    const five = roomRequirements(BLUEPRINT, 5);
    expect(five[0]).toMatch(/^SEEN FROM Room 11/);
    expect(five[1]).toMatch(/^Room 5 — Great Divide/);
  });

  it('keeps a link\'s NPC at its source end', () => {
    expect(roomRequirements(BLUEPRINT, 1)[0]).toMatch(/^Room 1 → Room 4: Dalt[^—]*$/);
    expect(roomRequirements(BLUEPRINT, 4)[0]).toMatch(/far end of the link.*Room 1 stays there/);
    expect(roomRequirements(BLUEPRINT, 8)[1]).toMatch(/only mentions Room 8/);
  });

  it('gives the prize to its room', () => {
    expect(roomRequirements(BLUEPRINT, 8)).toContain('PRIZE: Room 8 — The saint\'s hoard.');
    expect(roomRequirements(BLUEPRINT, 4).some(r => r.startsWith('PRIZE'))).toBe(false);
  });
});

describe('danger line', () => {
  const brief = 'DANGER LEVEL: Unsafe — check every 3 crawling rounds. Roll a d6: on a 1, roll a d6 on the table below. On a 6, X.\n';
  it('restores the full rule in the overview and under the encounters heading', () => {
    expect(enforceDangerLine('**The Weird:** w\n**Danger Level:** Unsafe — on a 6, X.', brief))
      .toMatch(/\*\*Danger Level:\*\* Unsafe — check every 3 crawling rounds\. Roll a d6: on a 1, roll a d6 on the Random Encounters table\. On a 6, X\.$/);
    expect(enforceDangerLine('## Random Encounters\n\n*Unsafe: short.*\n\n| d6 |', brief))
      .toBe(`## Random Encounters\n\n*${brief.slice(14).trim()}*\n\n| d6 |`);
  });
});

describe('rank and file', () => {
  it('is a level below the Key NPC, with one attack, the same weapon and alignment', () => {
    const sb = rankAndFileStatblock('AC 13, HP 14, ATK 2 shortsword +3 (1d6), MV near, S +1, D +0, C +2, I +1, W +0, Ch +2, AL L, LV 3');
    expect(sb).toMatch(/ATK 1 shortsword \+1 \(1d6\)/);
    expect(sb).toMatch(/AL L, LV 2$/);
    expect(rankAndFileStatblock('AC 12, HP 4, ATK 1 dagger +1 (1d4), MV near, AL C, LV 1')).toMatch(/LV 1$/);
  });
});

describe('specificity', () => {
  it('flags sentences that leave the GM to invent who or what, and curses with no effect', () => {
    const room = `### Room 12 — FOUNTAIN
*Special · Room*

Someone behind the **wine rack** giggles. A basin of violet water.

- **Fountain.** The reek draws something from within the dungeon. Whoever drinks it reeks for 1d6 days.
- **Skull.** Its curse falls on the taker.
- **Ring.** Cursed: DC 12 CON or lose 1d4 HP.

> SOMETHING  AC 12 HP 4
*Exits: none — something blocks the way*`;
    expect(vagueSpots(room)).toEqual([
      'Someone behind the **wine rack** giggles.',
      '**Fountain.** The reek draws something from within the dungeon.',
      '**Skull.** Its curse falls on the taker.',
    ]);
  });
});

describe('fixed parts of the GM section and rooms', () => {
  const brief = `## KEY NPC STAT BLOCKS
(Canonical.)
- Crewe (free company, base Room 10): AC 13, HP 14, ATK 2 shortsword +3 (1d6), MV near, AL L, LV 3
`;
  it('puts Key NPC stat lines back to canonical, drops invented talents, joins split lines and hides the treasure target', () => {
    const gm = `## Key NPCs

**Crewe** (Room 10) — A captain.
> Crewe
> AC 15, HP 20, ATK 2 shortsword +3 (1d6), MV near, AL L, LV 3
> *Ledger: he tracks every debt.*

**Dalt** (Room 1) — Dying.
> Dalt
> AC 12, HP 4, ATK 1 (1d6), LV 1

## Treasure

Target: 3 × 12 × 15 = 540 gp.
- Room 1 — a purse, 10 gp.`;
    const out = enforceGmSection(gm, brief);
    expect(out).toContain('> Crewe  AC 13 HP 14 ATK 2 shortsword +3 (1d6) MV near AL L LV 3');
    expect(out).not.toMatch(/Ledger|AC 15|Target/);
    expect(out).toContain('> Dalt  AC 12 HP 4 ATK 1 (1d6) LV 1');
  });

  it('drops an echoed italic design note from a room but keeps the type and exits lines', () => {
    const room = `### Room 10 — GATE
*Monster · Faction Base · 20 × 20 ft*

*Power Network [consumer]: A portcullis held up by water.*

- **Portcullis.** Cut the power and it slams down.

*Exits: N [door → Room 12]*`;
    const out = enforceRoomData(room, '--- Room 10\nExits: N');
    expect(out).not.toContain('Power Network');
    expect(out).toContain('*Monster · Faction Base · 20 × 20 ft*');
    expect(out).toContain('*Exits: N [door → Room 12]*');
  });
});

describe('published wording', () => {
  it('turns a room\'s type line into shape and size only', () => {
    const t = s => plainTypeLine(`### Room 8 — HALL\n\n${s}\n\n*Exits: N [door → Room 2]*`).split('\n')[2];
    expect(t('*Monster · Faction Base · 20 × 20 ft cavern*')).toBe('*Cavern, 20 × 20 ft*');
    expect(t('*Furnishing · Obstacle · 20 × 30 ft*')).toBe('*Room, 20 × 30 ft*');
    expect(t('*Weird — Corridor, 40 ft long, 5 ft wide*')).toBe('*Corridor, 40 ft long, 5 ft wide*');
    expect(plainTypeLine('### Room 1\n\n*Exits: N [door → Room 2]  ·  S [door → Room 3]*')).toContain('*Exits: N [door → Room 2]  ·  S [door → Room 3]*');
  });

  it('flags design vocabulary anywhere, but not stat blocks or ordinary words', () => {
    expect(jargonSpots('- **Vertical Spine:** A stair winds down.\n- Rumors 1 and 2 are the gestalt hints.')).toHaveLength(2);
    expect(jargonSpots('The foreshadowing loop ends here. A pattern of tiles covers the floor.')).toEqual(['The foreshadowing loop ends here.']);
    expect(jargonSpots('> HOBGOBLIN  AC 15 HP 10 · Hidden Shortcut\nA countdown of bells.')).toEqual([]);
  });

  it('puts back a heading the editor dropped', () => {
    expect(withHeading('As the party steps in…', /^## Entrance/m, '## Entrance')).toBe('## Entrance\n\nAs the party steps in…');
    expect(withHeading('## Entrance\n\nText', /^## Entrance/m, '## Entrance')).toBe('## Entrance\n\nText');
  });
});
