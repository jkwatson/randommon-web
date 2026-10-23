// A dungeon's premise: the shape of what is going on in it, rolled before
// anything else. It sets how many factions there are (none, one, or two),
// which kinds of gestalt fit, and how much story the concept may carry — so
// not every dungeon is a political standoff.

export const PREMISES = [
  {
    id: 'lost-place', label: 'Lost place', weight: 25, factions: 0,
    relational: false,
    pitch: 'Pure exploration. Nobody holds this place: the dungeon itself is the challenge — its traps, hazards, puzzles and scattered creatures — and the mystery of what happened here.',
    guidance: 'There are no factions, no politics and no secrets to unmask. The STORY is what happened here and what is left: told through the rooms, readable by players who look. Creatures are wildlife, vermin, guardians and things that moved in, not organized groups. Write "FACTIONS: none".',
  },
  {
    id: 'lair', label: 'Lair', weight: 20, factions: 1, inhabitant: true,
    relational: ['hunter-and-prey', 'threat-and-refuge', 'guarded-asset', 'containment', 'attraction-or-repulsion', 'symbiote-or-parasite', 'producer-and-consumer'],
    pitch: 'One occupant rules this place — a dominant creature and its brood or servants. Its sign is everywhere; the party hunts it, avoids it, or steals from under it.',
    guidance: 'The one faction is the occupant and its brood or servants, led by the occupant itself. Everything in the dungeon answers to it, flees it, or feeds it. No rival group.',
  },
  {
    id: 'holdout', label: 'Holdout', weight: 20, factions: 1,
    relational: ['guarded-asset', 'threat-and-refuge', 'containment', 'producer-and-consumer', 'attraction-or-repulsion', 'symbiote-or-parasite'],
    pitch: 'One group has made this place its base or hideout. The party infiltrates, negotiates, or raids it.',
    guidance: 'The one faction holds the place: its sentries, routines, stores and weak points are the adventure. Other creatures are incidental. No rival group.',
  },
  {
    id: 'contested', label: 'Contested', weight: 25, factions: 2,
    relational: true,
    pitch: 'Two sides want the same place, and the party walks into the middle of it.',
    guidance: 'Two factions, at odds over this place; the party can play them against each other.',
  },
  {
    id: 'race', label: 'Race', weight: 10, factions: 1, outsider: 'rival adventuring party',
    relational: false, transformational: 'countdown',
    pitch: 'A rival adventuring party is in here too, after the same prize, and the clock is running.',
    guidance: 'The one faction is a rival adventuring party: named members, a plan, and a lead. The countdown is their progress toward the prize. They can be raced, followed, bargained with, or ambushed. No other group.',
  },
];

export const getPremise = id => PREMISES.find(p => p.id === id) ?? null;

// A premise that can hold the requested gestalts (a relational gestalt needs
// factions, and one the premise allows); `gestalts` are gestalt definitions.
export function premiseFits(p, gestalts = []) {
  return gestalts.every(g => g.category !== 'relational'
    || ((g.minFactions ?? 1) <= p.factions
      && (p.relational === true || (Array.isArray(p.relational) && p.relational.includes(g.id)))));
}

export function rollPremise(rand = Math.random, gestalts = []) {
  const fits = PREMISES.filter(p => premiseFits(p, gestalts));
  const pool = fits.length ? fits : [getPremise('contested')];
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = rand() * total;
  return pool.find(p => (r -= p.weight) < 0) ?? pool[0];
}
