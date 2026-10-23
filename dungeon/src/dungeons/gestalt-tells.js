// Makes each gestalt learnable through play (the source's "legibility").
//
// applyTells({ d, rooms, map })  — guarantees every gestalt shows itself
//   within two rooms of the entrance: if none of its existing room notes are
//   that close, an EARLY SIGN is placed there.
// gestaltRumors(d, rooms)        — player-facing rumors that hint at the
//   patterns, each pinned to that pattern's key room.
// changeEncounter(d)             — a wandering-table entry that advances or
//   shows a transformational system.

import { buildGraph, displayName, poss } from './gestalt-roles.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const cap = s => s[0].toUpperCase() + s.slice(1);

// What players can notice early on. (g, d) → sentence.
const SIGNS = {
  'hub-and-spokes':          () => 'Worn paths in the dust all bend toward one central hall; direction-marks on the walls name several different wings.',
  'vertical-spine':          (g, d) => d?.ascending
    ? 'A stair climbs out of sight up the middle of the tower; draughts and faint sounds come down it from far above.'
    : 'Air moves upward here from somewhere far below; a dropped coin takes a long time to land.',
  'artery-and-branches':     () => 'This is plainly the main way through — broader, more worn, and better lit than anything branching off it.',
  'concentric-layers':       () => 'A plan scratched into the wall shows rings within rings, and the masonry grows finer at every threshold.',
  'great-divide':            g => `A cold wind and a hollow echo from ${g.cast.barrier ?? 'a great barrier'} ahead — the far side can be heard before it can be seen.`,
  'separated-clusters':      g => `Through a gap, other sites are visible across ${g.cast.terrain ?? 'dangerous ground'}, each with its own lights.`,
  'hollow-center':           g => `Every passage curves the same way, as if circling ${g.cast.voidName ?? 'something vast'} at the dungeon's heart.`,
  'ratchet-and-return':      () => 'Scratch marks on the inside of a heavy gate — someone tried to come back this way and could not.',
  'locked-center':           g => `A carved relief shows a sealed door with ${g.cast.keyCount ?? 'several'} empty sockets, each shaped for a ${g.cast.keyForm ?? 'key'}.`,
  'landmark-and-loop':       g => `${cap(g.cast.landmark ?? 'the goal')} glimpsed through a crack — close, but no way through.`,
  'symmetry-and-repetition': () => 'A wall-plan shows the same wing drawn three times, identical down to the doors.',
  'parallel-paths':          () => 'Two sets of tracks — boots down the main hall, soft feet into a narrow side passage — heading the same way.',

  'countdown':               g => `The first faint sign, already: ${g.system?.signs?.[0] ?? 'something is building'} — barely noticeable yet.`,
  'two-states':              g => `Marks on the walls show this place is not always like this: it is ${(g.system?.current ?? 'one way').toLowerCase()} now, but traces show it ${g.system?.current === g.system?.a ? g.system?.b?.toLowerCase() : g.system?.a?.toLowerCase()} too.`,
  'cycle-of-states':         g => `${cap(g.system?.herald ?? 'a sound from deeper in')} — faintly, from deeper in — then a change in the air.`,
  'advancing-front':         g => `The ${g.system?.condition ?? 'corruption'} has reached even here, just barely: ${g.system?.edge ?? 'a faint trace'}.`,
  'delicate-balance':        g => `Remains of ${g.system?.forces?.[0] ?? 'one side'} and ${g.system?.forces?.[1] ?? 'the other'} lie together, each killed by the other.`,
  'sleeping-dungeon':        () => 'Everything is still and dust-sealed; a sound made here echoes far too long, as if something is listening.',
  'reclamation':             g => `Signs a previous expedition cleared this area — and that ${g.system?.who ?? 'something'} have already moved back in.`,
  'traveling-state':         g => `Residue of the ${g.system?.name ?? 'thing that travels'}: ${g.system?.sign ?? 'a strange trace'}, now fading — it passed through recently.`,
  'accumulation':            g => `A carved warning: every ${(g.system?.action ?? 'act').replace(/^every /, '')} feeds the ${g.system?.q ?? 'dungeon'}.`,
  'power-network':           g => `Conduits run along the ceiling here: ${g.system?.conduit ?? 'something carries power through the walls'}.`,
  'random-pulse':            g => `Scars of the ${g.system?.pulse ?? 'pulse'} everywhere, and a crude shelter dug into one wall.`,
  'linked-changes':          () => 'Paired symbols are carved around the doorways; matching marks appear elsewhere in the dungeon.',

  'warring-factions':        (g, d) => `Bodies of the ${d.factions[0]?.name} and the ${d.factions[1]?.name ?? 'enemy'} lie where they fought; fresh trophies of the war hang on the wall.`,
  'contested-territory':     g => `Rival marks of the ${g.cast.contenders?.[0]} and the ${g.cast.contenders?.[1]}, painted over each other again and again.`,
  'hunter-and-prey':         g => `Spoor of something big — and a dropped ${g.cast.prey?.[0] ?? 'creature'} trinket, abandoned in a hurry.`,
  'dominant-and-subordinate': g => `A tribute tally scratched into the wall: what the ${g.cast.subordinate} owe the ${g.cast.dominant}.`,
  'shared-resource':         g => `Traces of the ${g.cast.resource?.name}: ${g.cast.resource?.trace}.`,
  'symbiote-or-parasite':    g => `A dead member of the ${g.cast.bonded} bears the marks of the bond: ${g.cast.bond?.sign}.`,
  'containment':             g => `A ward-sigil scratched into the doorframe — the same sigil that binds the ${displayName(g.cast.contained?.name) || 'thing below'}.`,
  'attraction-or-repulsion': g => `A scrawled warning by the door: "${g.cast.rule?.trigger} ${g.cast.rule?.verb} them!"`,
  'threat-and-refuge':       g => `A refuge's mark (${g.cast.protection}) over a doorway — scratched at, from the outside.`,
  'host-and-intruder':       g => `Hasty barricades built by the ${g.cast.host}, already torn down by the ${g.cast.intruder}.`,
  'guarded-asset':           g => `A dead sentry — one of the ${g.cast.guard?.desc} — still at its post; it was guarding something.`,
  'producer-and-consumer':   g => `${cap(g.cast.product?.trace ?? 'Something')}, all moving the same way.`,
};

// Player-facing rumors (no room numbers). (g, d) → quoted sentence.
const RUMORS = {
  'hub-and-spokes':          () => 'Every passage down there leads back to one great hall. Learn the hall and you won\'t get lost.',
  'vertical-spine':          (g, d) => d?.ascending
    ? 'One stair runs up the middle of that tower. The higher you climb, the worse it gets.'
    : 'There\'s a shaft straight down through the middle of it. The deeper you go, the worse it gets.',
  'artery-and-branches':     () => 'Stick to the great hall and you\'ll get through fast — if whatever walks it lets you.',
  'concentric-layers':       () => 'It\'s built in rings, one inside the next. Each ring has only one or two ways in, and they\'re hidden.',
  'great-divide':            g => `Half the place is cut off by ${g.cast.barrier}. There are only a couple of ways across.`,
  'separated-clusters':      g => `It isn't one place, it's several — and getting between them means crossing ${g.cast.terrain}.`,
  'hollow-center':           g => `Something enormous sits at the heart of it — ${g.cast.voidName}. You have to go all the way around.`,
  'ratchet-and-return':      () => 'Doors in there only open one way. Keep going — the way out is at the far end, not behind you.',
  'locked-center':           g => `The vault's right by the entrance — but it needs ${g.cast.keyCount} ${g.cast.keyForms}, and they're hidden all over.`,
  'landmark-and-loop':       g => `You can see ${g.cast.landmark} from the door. Getting to it takes the whole day.`,
  'symmetry-and-repetition': () => 'The wings are all built the same. Know one and you know them all — mostly.',
  'parallel-paths':          () => 'There\'s the main hall, and there\'s the servants\' way. One\'s quick, one\'s quiet.',

  'countdown':               g => `Whatever's happening in there is getting worse by the hour. Folk say ${g.system?.event ?? 'something terrible'} — and soon.`,
  'two-states':              g => `There's ${g.system?.control ?? 'a mechanism'} in there that changes the whole place.`,
  'cycle-of-states':         g => `The place has a rhythm — ${g.system?.states?.slice(0, 2).join(', then ')}… Learn it and you live.`,
  'advancing-front':         g => `A ${g.system?.condition} is spreading through it, room by room.`,
  'delicate-balance':        g => `${cap(g.system?.forces?.[0] ?? 'two powers')} and ${g.system?.forces?.[1] ?? 'its rival'} keep each other in check down there. Upset that and you'll regret it.`,
  'sleeping-dungeon':        () => 'It\'s quiet in there. Keep it that way — every noise wakes something.',
  'reclamation':             g => `Clear a room and it doesn't stay clear. ${cap(g.system?.who ?? 'something')} move right back in.`,
  'traveling-state':         g => `Something drifts through those halls — a ${g.system?.name}. Hear it coming and get out of its way.`,
  'accumulation':            g => `Every ${(g.system?.action ?? 'act').replace(/^every /, '')} in there feeds the ${g.system?.q}. Too much, and things change.`,
  'power-network':           g => `The old ${g.system?.power} still runs part of it — but never all of it at once.`,
  'random-pulse':            g => `Every so often a ${g.system?.pulse} rolls through. The ones who live there know where to hide.`,
  'linked-changes':          () => 'Pull a lever in one room and something moves in another. Look for the matching symbols.',

  'warring-factions':        (g, d) => `The ${d.factions[0]?.name} and the ${d.factions[1]?.name} are at war in there. Help one and the other will hunt you.`,
  'contested-territory':     g => `The ${g.cast.contenders?.[0]} and the ${g.cast.contenders?.[1]} keep trading one chamber back and forth.`,
  'hunter-and-prey':         g => `Something hunts the ${g.cast.prey?.[0]} in there. Watch them — when they run, you run.`,
  'dominant-and-subordinate': g => `The ${g.cast.subordinate} take orders from the ${g.cast.dominant}. They hate every minute of it.`,
  'shared-resource':         g => `Everyone down there needs the ${g.cast.resource?.name}. Whoever holds it holds the rest.`,
  'symbiote-or-parasite':    g => `The ${g.cast.bonded} made some kind of bargain with a creature down there. It's eating them alive.`,
  'containment':             g => `Something's imprisoned in there — a ${displayName(g.cast.contained?.name) || 'horror'}. The wards are failing.`,
  'attraction-or-repulsion': g => `${g.cast.rule?.trigger} ${g.cast.rule?.verb} the ${g.cast.rule?.creature}. Remember that.`,
  'threat-and-refuge':       g => `Where the ${g.cast.refugees?.[0]} hide, the ${displayName(g.cast.hunter?.name) || 'thing'} can't go. Find their marks.`,
  'host-and-intruder':       g => `The ${g.cast.intruder} broke into the ${poss(g.cast.host ?? 'old masters')} halls. It's a war of barricades in there.`,
  'guarded-asset':           g => `Wherever you see ${g.cast.guard?.desc}, there's something worth stealing.`,
  'producer-and-consumer':   g => `Follow the ${g.cast.product?.product}. It all comes from one place.`,
};

export function applyTells({ d, rooms, map }) {
  const G = buildGraph(rooms, map);
  const entrance = rooms.find(r => r._isEntrance) ?? rooms[0];
  const dist = G.bfs(entrance._roomNumber);
  const near = rooms.filter(r => (dist.get(r._roomNumber) ?? 99) <= 2 && !r.finalRoomDesc);
  for (const g of d.gestalts ?? []) {
    const own = rooms.filter(r => r._gestalt?.some(x => x.pattern === g.name));
    if (own.some(r => (dist.get(r._roomNumber) ?? 99) <= 2)) continue;
    const sign = SIGNS[g.id]?.(g, d);
    if (!sign || /undefined/.test(sign)) continue;
    // Prefer one step in, and rooms not already crowded with notes.
    const room = near
      .filter(r => r !== entrance || near.length === 1)
      .map(r => ({ r, s: -Math.abs((dist.get(r._roomNumber) ?? 0) - 1) - (r._gestalt?.length ?? 0) * 0.75 + Math.random() * 0.5 }))
      .sort((a, b) => b.s - a.s)[0]?.r ?? entrance;
    (room._gestalt ??= []).push({ pattern: g.name, role: 'early sign', note: `EARLY SIGN — ${sign} (A first hint of how the dungeon works; players who notice it can anticipate what lies deeper.)` });
    (g.rooms ??= []).push({ room: room._roomNumber, role: 'early sign' });
  }
}

// Up to `max` rumors from the gestalts, each pinned to the pattern's most
// telling room (its first role room that isn't the entrance).
export function gestaltRumors(d, rooms, max = 2) {
  const out = [];
  const entrance = rooms?.find(r => r._isEntrance)?._roomNumber;
  for (const g of d.gestalts ?? []) {
    if (out.length >= max) break;
    const text = RUMORS[g.id]?.(g, d);
    if (!text || /undefined|null/.test(text)) continue;
    const roomRef = g.rooms?.find(x => x.room !== entrance && x.role !== 'early sign')?.room ?? null;
    out.push({ text, roomRef, gestalt: g.name });
  }
  return out;
}

// A wandering-table entry for the dungeon's transformational system, if any.
export function changeEncounter(d) {
  const g = (d.gestalts ?? []).find(x => x.category === 'transformational' && x.system);
  if (!g) return null;
  const s = g.system;
  switch (g.id) {
    case 'countdown':        return `The countdown advances: ${s.signs?.[0]} — or the current stage's sign (see How the Dungeon Changes)`;
    case 'two-states':       return `Someone works the ${s.control.replace(/^an? |^the /, '')}: the dungeon switches to ${s.current === s.a ? s.b : s.a}`;
    case 'cycle-of-states':  return `${cap(s.herald)} — the ${s.name} turns to its next phase now`;
    case 'advancing-front':  return `The ${s.condition} creeps forward a room ahead of schedule`;
    case 'delicate-balance': return `${cap(s.forces[0])} and ${s.forces[1]} clash nearby — the balance tips toward the winner`;
    case 'sleeping-dungeon': return 'A crash and a shout somewhere else in the dungeon: count it as a disturbance';
    case 'reclamation':      return `${cap(s.who)} seen moving into a room the party already cleared`;
    case 'traveling-state':  return `The ${s.name} is coming — ${s.sign}; it reaches the party's room next turn`;
    case 'accumulation':     return `The ${s.q} shifts by one on its own — the gauge flickers`;
    case 'power-network':    return `The ${s.power} surges and reroutes itself: one consumer switches on or off`;
    // The pulse itself rides on the check die's 6; the table shows its warning.
    case 'random-pulse': {
      const shelters = (g.rooms ?? []).filter(r => r.role === 'shelter').map(r => `Room ${r.room}`);
      const to = shelters.length ? `toward ${shelters.join(' or ')}` : 'for shelter';
      const run = s.fleers?.run ?? 'every creature nearby goes still, then hurries away';
      return `${cap(s.sign)} — then nothing. ${cap(run)} ${to}, paying it no heed; the ${s.pulse} is building`;
    }
    case 'linked-changes':   return 'A distant grinding of stone — someone has worked one of the linked controls';
    default:                 return null;
  }
}
