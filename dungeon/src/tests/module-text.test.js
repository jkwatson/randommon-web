import { describe, it, expect } from 'vitest';
import { roomRequirements, enforceDangerLine, vagueSpots, enforceGmSection, enforceRoomData, plainTypeLine, jargonSpots, withHeading, overviewHeadings, sectionByZone, parseArtQueries, publishedRoom, inWorldNames, keyNpcRenames, placeTreasure, roomsByZone, stockBlocks } from '../../../cli/polish.js';
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
    expect(roomRequirements(BLUEPRINT, 4)[0]).toMatch(/NOTE TO YOU.*far end of the link.*stays in Room 1/);
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

describe('the overview', () => {
  it('gives each label its own heading and paragraph, and the subtitle title case', () => {
    const out = overviewHeadings('*crypt · luxurious · large (22 areas) · party level 3*\n\n**The Concept:** A crypt.\n**The Story:** Blades.\n**Danger Level:** Risky.');
    expect(out).toBe('*Crypt · Luxurious · Large (22 areas) · party level 3*\n\n#### The Concept\n\nA crypt.\n\n#### The Story\n\nBlades.\n\n#### Danger Level\n\nRisky.');
  });
});

describe('rooms by section', () => {
  const rooms = new Map([[1, '### Room 1 — A'], [2, '### Room 2 — B'], [3, '### Room 3 — C'], [4, '### Room 4 — D']]);
  it('puts each zone table with its rooms, in section order, and keeps the rule up front', () => {
    const enc = '## Random Encounters\n\n*Roll 2d4.*\n\n**Section 2 (Rooms 2, 4)**\n\n| 2d4 | Event |\n|---|---|\n| 5 | b |\n\n**Section 1 (Rooms 1, 3)**\n\n| 2d4 | Event |\n|---|---|\n| 5 | a |';
    const { encounters, rooms: out } = sectionByZone(enc, rooms);
    expect(encounters).toMatch(/^## Random Encounters\n\n\*Roll 2d4\.\*\n\nEach section's table/);
    expect(encounters).not.toMatch(/\| 5 \|/);
    expect(out.indexOf('## Section 1')).toBeLessThan(out.indexOf('## Section 2'));
    expect(out).toMatch(/## Section 1 \(Rooms 1, 3\)\n\n#### Random Encounters\n\n\| 2d4[\s\S]*\| 5 \| a \|\n\n### Room 1 — A\n\n### Room 3 — C/);
  });
  it('keeps one Rooms list in number order with a single table', () => {
    expect(sectionByZone('## Random Encounters\n\n| 2d4 | Event |', rooms).rooms).toBe('## Rooms\n\n### Room 1 — A\n\n### Room 2 — B\n\n### Room 3 — C\n\n### Room 4 — D');
  });
});

describe('illustrations', () => {
  it('keeps woodcut searches tied to real rooms or the whole dungeon', () => {
    expect(parseArtQueries('17|woodcut forge and anvil\n- any | Woodcut gothic crypt\n99|woodcut x\n3|photo of a crown', [3, 17]))
      .toEqual(['17|woodcut forge and anvil', 'any|woodcut gothic crypt']);
  });
});

describe('exits in print', () => {
  it('leaves a blank line before the exits list, so Markdown keeps it a list', () => {
    const sec = '--- Room 1 — Empty — Room, 20 × 20 ft\nExits: North → Room 2 [wooden door] — beyond: silence';
    expect(publishedRoom('### Room 1 — A\n\nText.', sec)).toMatch(/\*Exits:\*\n\n- \*\*North\*\*/);
  });
});

describe('names and stat blocks', () => {
  const brief = `PARTY LEVEL: 1\n\n## FACTIONS\n\n### BANDITS TURNED SQUATTERS — Inhabitant (creature type: bandits)  |  Base: Room 4\n\n## ENTRANCE\nCreature: BERSERKER\n  Stat block: AC 12, HP 10, LV 2\n\n## ROOMS\n\n--- Room 4 — Monster — Room\n  Monster: BANDIT ×2\n  Stat block: AC 13, HP 4, LV 1\n`;
  it('puts the concept\'s faction names in place of the generator\'s', () => {
    expect(inWorldNames('He guards the bandits turned squatters\' home. Bandits turned squatters roam.', brief, 'NAME: The Thornjacks'))
      .toBe('He guards the Thornjacks\' home. The Thornjacks roam.');
  });
  it('carries a Key NPC the concept renamed into the text, when the names share a word', () => {
    const b = 'Key NPC: Mistress Grayson (the occupant itself: a SHADOW) — is being blackmailed';
    expect(keyNpcRenames(b, 'Key NPC: Lieutenant Grayson. She speaks in a whisper.')).toEqual([['Mistress Grayson', 'Lieutenant Grayson']]);
    expect(inWorldNames('Mistress Grayson waits.', b, 'Key NPC: Lieutenant Grayson. She waits.')).toBe('Lieutenant Grayson waits.');
    // A different person in the role keeps both names.
    expect(keyNpcRenames('Key NPC: Grisel Vane — the captain', 'Key NPC: Pell — a quiet ex-farrier')).toEqual([]);
  });
  it('lists every stat block the dungeon carries, once per kind', () => {
    expect(stockBlocks(brief)).toEqual(['- BERSERKER: AC 12, HP 10, LV 2', '- BANDIT: AC 13, HP 4, LV 1']);
  });
});


describe('treasure placements', () => {
  it('adds a listed placement to a room that lacks it, and leaves one the room has', () => {
    const gm = '## Treasure\n\nRoom 1 — Coins in a dead soldier\'s pouch at the chimney foot, 25 gp.\nRoom 4 — 10 silver spikes, 40 gp.\n\n**Total: 65 gp across 2 rooms.**\n\n## Key NPCs\n';
    const rooms = new Map([
      [1, '### Room 1 — HALL\n\nA hall.\n\n- **Grit.** A trap.\n\n*Exits:*\n\n- **East** → Room 2'],
      [4, '### Room 4 — SPIKES\n\nA bag of silver spikes lies here.\n\n> GHAST ×1  AC 11\n\n*Exits:*\n\n- **North** → Room 2'],
    ]);
    const out = placeTreasure(gm, rooms);
    expect(out.get(1)).toMatch(/- \*\*Grit\.\*\* A trap\.\n- \*\*Treasure\.\*\* Coins in a dead soldier's pouch at the chimney foot, worth 25 gp\.\n\n\*Exits:\*/);
    expect(out.get(4)).toBe(rooms.get(4));
  });
});

describe('unnamed sounds', () => {
  it('flags a sound the GM would have to invent, not one that is named', () => {
    expect(vagueSpots('Cold air carries distant sounds from deeper levels.')).toHaveLength(1);
    expect(vagueSpots('A strange noise echoes.')).toHaveLength(1);
    expect(vagueSpots('You hear the sound of dripping water. A shrill buzz sounds like a wasp. Muffled sounds of chanting rise.')).toEqual([]);
  });
});

describe('bookkeeping jargon', () => {
  it('flags tallies and tables a GM would have to look up', () => {
    expect(jargonSpots('Prying it wakes the banner-man (+1 disturbance count).')).toHaveLength(1);
    expect(jargonSpots('Woken, it joins the wandering table.')).toHaveLength(1);
    expect(jargonSpots('It counts as a disturbance (see The Fort Lies Asleep).')).toEqual([]);
  });
});

describe('rooms by level', () => {
  it('prints the rooms zone by zone, each under its own heading', () => {
    const texts = new Map([1, 2, 3, 4].map(n => [n, `### Room ${n} — R${n}`]));
    const zones = new Map([[1, 'level 1 (upper)'], [2, 'level 1 (upper)'], [3, 'level 2'], [4, 'level 2']]);
    const md = roomsByZone(texts, zones);
    expect(md).toMatch(/^## Rooms 1–2: Level 1 \(Upper\)\n\n### Room 1[\s\S]*### Room 2[\s\S]*## Rooms 3–4: Level 2\n\n### Room 3/);
    expect(roomsByZone(texts, new Map())).toMatch(/^## Rooms\n\n### Room 1/);
  });
});
