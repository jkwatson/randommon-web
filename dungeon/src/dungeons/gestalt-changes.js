// Turns a dungeon's transformational gestalts into concrete, runnable systems.
//
// castChanges(d)       — before the map: each transformational gestalt gets a
//                        `g.system` (clock, states, cycle, front…) with GM-ready
//                        `summary` lines. Runs for crawl dungeons and modules.
// applyChanges({...})  — after the module map exists: places the system on the
//                        room graph (epicenter, control rooms, front bands by BFS
//                        distance, a circuit around a real loop, linked pairs…),
//                        annotating `room._gestalt` and extending the summary
//                        with room references.

import { buildGraph, displayName } from './gestalt-roles.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
const cap = s => s[0].toUpperCase() + s.slice(1);
const roomList = rs => rs.map(r => r._roomNumber).join(', ');

const DIR_OFFSETS = {
  North: [0, -1], South: [0, 1], East: [1, 0], West: [-1, 0],
  Northeast: [1, -1], Northwest: [-1, -1], Southeast: [1, 1], Southwest: [-1, 1],
};

// ── System tables ─────────────────────────────────────────────────

const COUNTDOWN_EVENTS = [
  { id: 'breakout', event: 'the sealed thing breaks free',
    signs: ['a ward-light gutters out somewhere deep and the air turns cold', 'hairline cracks spread across every seal and carving; lesser creatures flee upward', 'a slow, rhythmic pounding shakes dust from every ceiling'],
    atZero: 'the seal shatters — what was imprisoned is free and hunting', intervention: 'perform the renewing rite' },
  { id: 'flood', event: 'the lower halls flood completely',
    signs: ['water seeps under doors and pools in the lowest rooms', 'ankle-deep water in the lower rooms; the roar of rushing water', 'waist-deep and rising; the lowest exits are underwater'],
    atZero: 'everything but the rooms nearest the entrance is underwater', intervention: 'close the old floodgate' },
  { id: 'ritual', event: 'the ritual completes',
    signs: ['a low chant can be heard faintly from every room', 'the chant is clearly audible; flames lean toward its source', 'the chant reaches a crescendo; shadows move against the light'],
    atZero: 'the ritual completes — whatever it summons, binds, or transforms is done', intervention: 'disrupt the ritual focus' },
  { id: 'collapse', event: 'the dungeon collapses',
    signs: ['fine dust sifts from the ceiling; stone groans in the distance', 'cracks open in the walls; small falls of stone block minor passages', 'whole sections shake; a passage near the entrance caves in'],
    atZero: 'the central halls collapse — anyone inside must find another way out', intervention: 'shore up the failing keystone' },
  { id: 'arrival', event: 'reinforcements arrive',
    signs: ['scouts and messengers hurry through the halls', 'horns sound from the entrance; sentries are doubled', 'the main force is heard marching in; every faction reacts'],
    atZero: 'a large force arrives and sweeps the dungeon room by room', intervention: 'block the approach they must use' },
];

const STATE_PAIRS = [
  { a: 'Flooded', b: 'Drained', control: 'a great sluice wheel',
    effects: [
      ['waist-deep water; movement halved and dropped items lost', 'slick mud floor; a drowned body and its gear lie exposed'],
      ['fully submerged — crossing means holding your breath (DC 12 CON per round after 3)', 'the drained floor reveals a grate leading to a hidden cache'],
      ['eels and worse swim through the flooded room', 'stranded fish and stranded creatures, angry and desperate'],
      ['floating debris can be ridden across to a high ledge', 'the high ledge is out of reach (DC 15 DEX climb)'],
    ],
    exitA: 'underwater — impassable without swimming (DC 12 STR)', exitB: 'open' },
  { a: 'Lit', b: 'Dark', control: 'the great central brazier',
    effects: [
      ['the light reveals faded murals that hint at a hidden door', 'the murals vanish; the hidden door is only a seam'],
      ['guardian statues stand inert while the light holds', 'guardian statues wake and attack anything carrying light'],
      ['plain walls', 'a luminous script appears on the walls, readable only in darkness'],
      ['shadow-things cower in the corners, harmless', 'shadow-things detach from the walls and hunt'],
    ],
    exitA: 'sealed by a door that only opens in darkness', exitB: 'open' },
  { a: 'Waking', b: 'Dreaming', control: 'a silver bell hung from a root',
    effects: [
      ['solid stone walls and ordinary, dusty furniture', 'the walls soften and a doorway appears that was not there'],
      ['the sleepers here lie still and cold', 'the sleepers rise and answer one question each, in riddles'],
      ['a dry, dead fountain', 'the fountain runs with silver water (drinking it heals 1d6, once)'],
      ['a mundane painted door', 'the painted door opens onto a moonlit glade that is not there when waking'],
    ],
    exitA: 'a blank wall', exitB: 'a shimmering doorway' },
  { a: 'Sealed', b: 'Open', control: 'a bank of master levers',
    effects: [
      ['a portcullis drops across the archway', 'the portcullis rises — and whatever was kept behind it is loose'],
      ['the vault mechanism is locked fast', 'the vault mechanism can be worked'],
      ['the cells are shut, their occupants pacing', 'the cell doors swing open'],
      ['a floor grate is locked down', 'the floor grate unlocks onto a crawlspace below'],
    ],
    exitA: 'barred by a portcullis', exitB: 'open' },
];

const CYCLES = [
  { name: 'tide', states: ['low water', 'rising water', 'high water', 'falling water'], herald: 'a rushing roar from below as the water turns', unit: '2 turns' },
  { name: 'elemental wheel', states: ['fire', 'water', 'earth', 'air'], herald: 'a deep gong and a sudden change in the air\'s temperature', unit: '3 turns' },
  { name: 'tolling bell', states: ['the bell-hour', 'the hush', 'the hound-hour', 'the long dark'], herald: 'a single bell tolling from nowhere', unit: '2 turns' },
  { name: 'dungeon\'s breath', states: ['inhale — winds pull inward', 'hold — dead still, doors seal', 'exhale — winds push outward'], herald: 'every wall creaks as the dungeon draws breath', unit: '2 turns' },
];
const CYCLE_BLOCKS = ['the way is sealed by stone', 'the passage is flooded to the ceiling', 'a howling wind makes it impassable (DC 15 STR)', 'the floor drops away into darkness'];
const CYCLE_DANGERS = ['scalding steam vents (2d6, DC 12 DEX half)', 'the room fills with choking dust (DC 12 CON or blinded 1 turn)', 'everything loose is hurled about (1d6 per round)', 'the dead here stir and attack'];

const FRONTS = [
  { condition: 'fungal blight', consumed: 'thick fungal mats and choking spores (DC 12 CON or poisoned for 1 hour)', edge: 'pale threads creeping across the floor; the smell of rot', origin: 'a pulsing fungal heart', reversal: 'burning the heart' },
  { condition: 'creeping frost', consumed: 'everything rimed in ice; exposed flesh takes 1 damage per turn', edge: 'frost ferns on the walls; breath fogs', origin: 'a cracked stone weeping cold', reversal: 'shattering or thawing the stone' },
  { condition: 'living darkness', consumed: 'all light shrinks to close range', edge: 'torchlight gutters and shadows lag behind their owners', origin: 'a black idol', reversal: 'destroying the idol' },
  { condition: 'rising floodwater', consumed: 'flooded to the ceiling', edge: 'knee-deep and rising', origin: 'a broken cistern wall', reversal: 'sealing the breach' },
  { condition: 'grave-rot', consumed: 'everything decays; the dead here rise at night', edge: 'flowers wilt and food spoils within the hour', origin: 'a desecrated grave', reversal: 'reconsecrating the grave' },
];

const FORCE_PAIRS = [
  ['carnivorous vines', 'giant fire beetles'],
  ['the spirits of the drowned', 'the spirits of the burned'],
  ['a colony of glow-moths', 'a swarm of shadow-bats'],
  ['a creeping frost', 'a smouldering heat from below'],
];

const DISTURBANCES = [
  'opening the sealed sarcophagus', 'ringing the cracked bell', 'breaking the wax seal on the door',
  'lighting the old lamps', 'prying a gem from the idol', 'any loud noise — combat or shouting',
];

const RECLAIMERS = [
  { who: 'scavenger vermin', signs: 'droppings, gnawed bones, and new nests', time: '1 day' },
  { who: 'creeping roots and fungus', signs: 'roots split the floor and fungus furs every surface', time: '2 days' },
  { who: 'shifting sand and silt', signs: 'drifts of sand bury the floor and half-fill the doorways', time: '1 day' },
];

const TRAVELERS = [
  { name: 'poisonous cloud', effect: 'DC 12 CON each turn or take 1d6 damage', sign: 'a sweet chemical smell and a yellow tinge to the air' },
  { name: 'sphere of magical darkness', effect: 'all light fails and magic items go inert', sign: 'torches gutter and lean toward it' },
  { name: 'procession of the dead', effect: 'ghosts file silently through; anyone in the way makes DC 12 WIS or is swept along to the next room', sign: 'the temperature drops and footsteps sound with no feet' },
  { name: 'storm of whispers', effect: 'spellcasting is impossible; DC 12 WIS or frightened for 1 turn', sign: 'murmuring voices from inside the walls' },
];

const QUANTITIES = [
  { q: 'water level', action: 'opening a sluice', start: 'full', gauge: 'a stone gauge carved with depth marks',
    thresholds: ['first sluice open: the lowest rooms drain and reveal what was drowned there', 'half drained: aquatic creatures crowd the remaining pools (double encounters near water)', 'fully drained: the deepest sealed passage is exposed'] },
  { q: 'magical charge', action: 'casting a spell or using a magic item', start: 'empty', gauge: 'a crystal pillar that brightens with every spell',
    thresholds: ['3 charges: wards flicker on and one door seals', '6 charges: dormant guardians activate', '9 charges: the charge discharges — every creature inside takes 1d6'] },
  { q: 'blood in the basin', action: 'killing anything inside the dungeon', start: 'empty', gauge: 'a stone basin that fills itself',
    thresholds: ['3 deaths: the basin glows; the dead here begin to twitch', '6 deaths: the slain rise as zombies where they fell', '10 deaths: something answers from the basin'] },
  { q: 'oil in the great lamps', action: 'every 2 turns that pass (the lamps burn down)', start: 'full', gauge: 'a row of great lamps, slowly guttering',
    thresholds: ['half burned: the outer halls fall dark', 'nearly out: the lamp-wards fail and shadows move freely', 'out: total darkness — what the lamps held back is loose'] },
];

const POWERS = [
  { power: 'water pressure', source: 'a great cistern and groaning pump', conduit: 'pipes in the walls that knock and hiss' },
  { power: 'a sun-crystal\'s light', source: 'a crystal cradle under a lightwell', conduit: 'veins of light pulsing through the stone' },
  { power: 'a sacred flame', source: 'an eternal hearth', conduit: 'warm channels in the floor' },
];
const POWER_CONSUMERS = [
  { what: 'a lift between levels', on: 'the lift runs', off: 'the lift hangs dead; climbing the shaft is DC 12 STR' },
  { what: 'a portcullis gate', on: 'the gate rises', off: 'the gate is down and locked' },
  { what: 'a guardian construct', on: 'the guardian is active and attacks intruders', off: 'the guardian stands inert' },
  { what: 'a ward', on: 'the ward keeps out what lives beyond it', off: 'the ward fails and they come through' },
  { what: 'the lamps of a hall', on: 'the hall is brightly lit and safe from shadow-things', off: 'darkness — and what hides in it' },
];

const PULSES = [
  { pulse: 'geyser eruption', effect: 'the lower rooms flood with scalding water: 2d6 damage, DC 12 DEX half', duration: '1 turn', sign: 'a deep rumble and hissing vents' },
  { pulse: 'booming voice', effect: 'every statue in the dungeon animates and attacks', duration: '3 rounds', sign: 'a vast intake of breath from nowhere' },
  { pulse: 'wave of grave-cold', effect: 'all fires go out; DC 12 CON or take 1d4 damage', duration: '1 turn', sign: 'frost races across every surface' },
  { pulse: 'glamour-wave', effect: 'everyone sees the dungeon as it was centuries ago; exits appear in the wrong walls', duration: '2 turns', sign: 'a high, sweet ringing' },
];

const LINKS = [
  { control: 'a great stone wheel', effect: 'a portcullis rises (turning it back lowers it)' },
  { control: 'a lever set into an idol', effect: 'a section of floor tilts open onto a hidden stair' },
  { control: 'a carved rock formation', effect: 'diverted water drains the room — or floods it, if it was dry' },
  { control: 'a mirror on a swivel', effect: 'a beam of light strikes a sealed door, which grinds open' },
  { control: 'a chain in the wall', effect: 'a bell rings and the room\'s guardian wakes' },
];
const LINK_SYMBOLS = ['a spiral', 'an open eye', 'a crescent moon', 'a broken ring', 'three nested triangles'];

// ── Before the map ────────────────────────────────────────────────

export function castChanges(d) {
  const roomCount = d.rooms ?? 12;
  for (const g of d.gestalts ?? []) {
    if (g.category !== 'transformational') continue;
    const has = id => d.gestalts.some(x => x.id === id);
    let sys = null;
    switch (g.id) {
      case 'countdown': {
        const containment = d.gestalts.find(x => x.id === 'containment');
        const outsider = d.factions.find(f => !f.isInhabitant);
        const ev = containment ? COUNTDOWN_EVENTS[0]
          : outsider && Math.random() < 0.25 ? COUNTDOWN_EVENTS.find(e => e.id === 'arrival')
          : pick(COUNTDOWN_EVENTS.slice(1));
        const event = ev.id === 'breakout' && containment?.cast.contained
          ? `the ${displayName(containment.cast.contained.name)} breaks free`
          : ev.id === 'arrival' && outsider ? `the ${outsider.name}'s main force arrives` : ev.event;
        const turns = roomCount * 3;
        sys = { ...ev, event, turns, stages: [Math.round(turns / 2), Math.round(turns * 3 / 4), Math.round(turns * 0.9)] };
        sys.summary = [
          `Clock: ${turns} exploration turns (about ${Math.round(turns / 6)} hours) from when the party enters, then ${event}.`,
          `Turn ${sys.stages[0]}: ${ev.signs[0]}.`,
          `Turn ${sys.stages[1]}: ${ev.signs[1]}.`,
          `Turn ${sys.stages[2]}: ${ev.signs[2]}.`,
          `At zero: ${ev.atZero}.`,
        ];
        break;
      }
      case 'two-states': {
        const flooded = ['Flooded', 'Flood-Gnawed'].includes(d.aesthetic);
        const fey = (d.tags ?? []).some(t => ['fey', 'fairy', 'demi-fey'].includes(t));
        const pair = flooded ? STATE_PAIRS[0] : fey && Math.random() < 0.5 ? STATE_PAIRS[2] : pick(STATE_PAIRS);
        sys = { ...pair, current: pick([pair.a, pair.b]) };
        sys.summary = [
          `Two states: ${pair.a} / ${pair.b}. Currently: ${sys.current}.`,
          `${cap(pair.control)} switches the whole dungeon between them; it takes 1 turn and is heard everywhere.`,
        ];
        break;
      }
      case 'cycle-of-states': {
        const c = pick(CYCLES);
        sys = { ...c };
        sys.summary = [
          `Cycle (${c.name}): ${c.states.join(' → ')} → repeat. Each phase lasts ${c.unit}.`,
          `Herald: ${c.herald} — one round before each change. Roll 1d${c.states.length} for the phase when the party enters.`,
        ];
        break;
      }
      case 'advancing-front': {
        const f = pick(FRONTS);
        const retreating = Math.random() < 0.3;
        sys = { ...f, retreating, rate: '1 room every 6 turns (1 hour)' };
        sys.summary = retreating
          ? [`Retreating front (${f.condition}): it already holds part of the dungeon but withdraws room by room toward its origin once ${f.reversal} begins.`]
          : [`Advancing front (${f.condition}): spreads ${sys.rate} from its origin. ${cap(f.reversal)} stops it.`];
        sys.summary.push(`Consumed rooms: ${f.consumed}. Edge of the front: ${f.edge}.`);
        break;
      }
      case 'delicate-balance': {
        const pair = d.factions.length >= 2 ? [d.factions[0].name, d.factions[1].name] : pick(FORCE_PAIRS);
        sys = { forces: pair, factionForces: d.factions.length >= 2 };
        sys.summary = [`Balance: ${pair[0]} and ${pair[1]} hold each other in check. Weaken either and the other spreads.`];
        break;
      }
      case 'sleeping-dungeon':
        sys = { summary: [
          'Most of the dungeon starts dormant. Each disturbance adds 1 to the disturbance count.',
          'Count 2+: the danger level rises one step (Unsafe → Risky → Deadly). Count 4+: everything still sleeping wakes and starts moving.',
        ] };
        break;
      case 'reclamation': {
        const inhabitant = d.factions.find(f => f.isInhabitant);
        const r = inhabitant && Math.random() < 0.5
          ? { who: `the ${inhabitant.name}`, signs: `fresh ${inhabitant.name} marks, barricades, and sentries`, time: '1 day', faction: inhabitant.name }
          : pick(RECLAIMERS);
        sys = { ...r };
        sys.summary = [
          `Reclamation: rooms the party clears and leaves are reclaimed by ${r.who} after ${r.time}.`,
          `When the party returns to a cleared room, roll 1d6: 1–3 reoccupied (half the original threat, or a new hazard); 4–5 signs only (${r.signs}); 6 still empty.`,
        ];
        break;
      }
      case 'traveling-state': {
        const t = pick(TRAVELERS);
        sys = { ...t, summary: [`Traveling state (${t.name}): while it occupies a room — ${t.effect}. One turn before it arrives: ${t.sign}.`] };
        break;
      }
      case 'accumulation': {
        const q = has('two-states') ? QUANTITIES[1] : pick(QUANTITIES);
        sys = { ...q, summary: [
          `Shared quantity (${q.q}, starts ${q.start}): changes by 1 with each ${q.action}.`,
          ...q.thresholds.map(t => `Threshold — ${t}.`),
        ] };
        break;
      }
      case 'power-network': {
        const p = pick(POWERS);
        const consumers = shuffle(POWER_CONSUMERS).slice(0, 3);
        sys = { ...p, consumers, capacity: 2, summary: [
          `Power network (${p.power}): enough to run 2 of its 3 consumers at once. Rerouting at the source takes 1 turn.`,
          ...consumers.map(c => `${cap(c.what)} — powered: ${c.on}; unpowered: ${c.off}.`),
        ] };
        break;
      }
      case 'random-pulse': {
        const p = pick(PULSES);
        sys = { ...p, summary: [
          `Random pulse (${p.pulse}): whenever the encounter check die shows a 6, it pulses. Lasts ${p.duration}.`,
          `Effect: ${p.effect}. Warning, 1 round before: ${p.sign}. Inhabitants know the signs and take shelter — watching them warns the party.`,
        ] };
        break;
      }
      case 'linked-changes':
        sys = { summary: ['Linked changes: working certain controls changes rooms elsewhere. Linked rooms bear the same carved symbol.'] };
        break;
    }
    if (sys) g.system = sys;
  }
}

// ── After the map ─────────────────────────────────────────────────

export function applyChanges({ d, rooms, map }) {
  const G = buildGraph(rooms, map);
  const entrance = rooms.find(r => r._isEntrance) ?? rooms[0];
  const finalRoom = rooms.find(r => r.finalRoomDesc) ?? null;
  const fromEntrance = G.bfs(entrance._roomNumber);
  const distE = n => fromEntrance.get(n) ?? 99;
  const byNum = G.byNum;

  const notes = r => r._gestalt?.length ?? 0;
  const usable = r => r !== entrance;
  // Highest score wins; rooms already carrying many notes are penalized so
  // the patterns spread across the dungeon instead of stacking.
  const best = (cands, score) => cands
    .map(r => ({ r, s: score(r) - notes(r) * 0.75 + Math.random() * 0.5 }))
    .sort((a, b) => b.s - a.s)[0]?.r ?? null;
  const spread = (cands, n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const dists = out.map(r => G.bfs(r._roomNumber));
      const r = best(cands.filter(c => !out.includes(c)), c =>
        dists.length ? Math.min(...dists.map(m => m.get(c._roomNumber) ?? 6)) : Math.random() * 3);
      if (!r) break;
      out.push(r);
    }
    return out;
  };
  const central = cands => {
    const all = rooms.map(r => G.bfs(r._roomNumber));
    return best(cands, r => -Math.max(...all.map(m => m.get(r._roomNumber) ?? 9)));
  };
  const interior = p => p.slice(1, -1).map(n => byNum.get(n));

  function mark(room, g, role, note) {
    if (!room) return;
    (room._gestalt ??= []).push({ pattern: g.name, role, note });
    (g.rooms ??= []).push({ room: room._roomNumber, role });
  }

  // Real exits of a room, with the room each leads to.
  function exitsOf(room) {
    const node = map.nodes.get(room._mapId);
    if (!node) return [];
    return (room.exits ?? []).map(e => {
      const off = DIR_OFFSETS[e.direction];
      const target = off && [...map.nodes.values()].find(n => n.x === node.x + off[0] && n.y === node.y + off[1]);
      return target ? { ...e, to: target.roomNumber } : null;
    }).filter(Boolean);
  }

  for (const g of d.gestalts ?? []) {
    const sys = g.system;
    if (!sys || g.category !== 'transformational') continue;
    const cands = rooms.filter(usable);

    switch (g.id) {
      case 'countdown': {
        const prisonNum = d.gestalts.find(x => x.id === 'containment')?.cast.prison;
        const epicenter = byNum.get(prisonNum) ?? finalRoom ?? best(cands, r => distE(r._roomNumber));
        const path = G.path(entrance._roomNumber, epicenter._roomNumber);
        const mid = interior(path);
        const wardNums = d.gestalts.find(x => x.id === 'containment')?.cast.wards ?? [];
        const intervention = (sys.id === 'breakout' && wardNums.length ? byNum.get(pick(wardNums)) : null)
          ?? best(mid.length ? mid : cands.filter(r => r !== epicenter), r => -Math.abs(distE(r._roomNumber) - distE(epicenter._roomNumber) / 2));
        mark(epicenter, g, 'epicenter', `EPICENTER — every countdown sign shows here first and strongest. At zero: ${sys.atZero}.`);
        if (intervention && intervention !== epicenter) {
          // One rule, stated identically in the room and in the GM mechanics.
          const rule = `2 turns and a DC 15 check (INT or WIS) adds ${Math.round(sys.turns / 3)} turns to the countdown; a second success stops it entirely. It can be attempted at any time before zero.`;
          mark(intervention, g, 'intervention', `INTERVENTION — ${sys.intervention} here: ${rule}`);
          sys.summary.push(`Intervention: ${sys.intervention} in Room ${intervention._roomNumber} — ${rule} Epicenter: Room ${epicenter._roomNumber}.`);
        }
        for (const r of [...(G.adj.get(epicenter._roomNumber) ?? [])].map(n => byNum.get(n)).filter(r => r !== intervention && usable(r)).slice(0, 2)) {
          mark(r, g, 'near epicenter', `Close to the epicenter (Room ${epicenter._roomNumber}): every countdown sign shows here one stage early.`);
        }
        break;
      }

      case 'two-states': {
        const control = central(cands);
        mark(control, g, 'control', `CONTROL — ${sys.control}: switches the whole dungeon between ${sys.a} and ${sys.b} (currently ${sys.current}). Takes 1 turn; heard everywhere.`);
        const affected = spread(cands.filter(r => r !== control), rooms.length >= 16 ? 4 : 3);
        const effects = shuffle(sys.effects);
        affected.forEach((r, i) => {
          const ex = i < 2 ? pick(exitsOf(r)) : null;
          const exitNote = ex ? ` ${ex.direction} exit (→ Room ${ex.to}): ${sys.a} — ${sys.exitA}; ${sys.b} — ${sys.exitB}.` : '';
          const [inA, inB] = effects[i % effects.length];
          mark(r, g, 'two states', `${sys.a}: ${inA}. ${sys.b}: ${inB}.${exitNote}`);
        });
        sys.summary.push(`Control in Room ${control._roomNumber}; most changed: Rooms ${roomList(affected)}.`);
        break;
      }

      case 'cycle-of-states': {
        const source = best(cands, r => distE(r._roomNumber));
        mark(source, g, 'herald', `The ${sys.name} is loudest here: ${sys.herald}. The phase can be read from this room (a mark, a level, a light).`);
        const affected = spread(cands.filter(r => r !== source), Math.min(sys.states.length, 4));
        const blocks = shuffle(CYCLE_BLOCKS), dangers = shuffle(CYCLE_DANGERS);
        affected.forEach((r, i) => {
          const state = sys.states[i % sys.states.length];
          mark(r, g, 'cycle', i % 2 === 0
            ? `Passable only during ${state}; in every other phase ${blocks.pop()}.`
            : `Dangerous during ${state}: ${dangers.pop()}. Safe in other phases.`);
        });
        sys.summary.push(`Herald loudest in Room ${source._roomNumber}; phase-dependent rooms: ${roomList(affected)}.`);
        break;
      }

      case 'advancing-front': {
        const origin = finalRoom && Math.random() < 0.4 ? finalRoom : best(cands, r => distE(r._roomNumber));
        const dist = G.bfs(origin._roomNumber);
        let consumedR = 1;
        const atMost = k => rooms.filter(r => usable(r) && (dist.get(r._roomNumber) ?? 99) <= k);
        if (atMost(1).length > rooms.length * 0.35) consumedR = 0;
        const consumed = atMost(consumedR);
        const edge = rooms.filter(r => usable(r) && dist.get(r._roomNumber) === consumedR + 1);
        mark(origin, g, 'origin', `ORIGIN of the ${sys.condition}: ${sys.origin}. ${cap(sys.reversal)} ${sys.retreating ? 'makes it withdraw one room per hour' : 'stops it spreading'}.`);
        for (const r of consumed.filter(r => r !== origin)) mark(r, g, 'consumed', `CONSUMED by the ${sys.condition}: ${sys.consumed}.`);
        for (const r of edge) mark(r, g, 'front', `THE FRONT: ${sys.edge}. ${sys.retreating ? 'Recently freed — or next to be lost again.' : 'This room will be consumed within the hour.'}`);
        const displaced = d.factions.filter(f => f.territory?.some(n => consumed.some(r => r._roomNumber === n)));
        sys.summary.push(`Origin: Room ${origin._roomNumber}. Consumed: Rooms ${roomList(consumed)}. Front: Rooms ${roomList(edge) || 'none yet'}.`);
        if (displaced.length) sys.summary.push(`Displaced: the ${displaced.map(f => f.name).join(' and the ')} are being driven from their rooms — they press into their neighbors' ground.`);
        break;
      }

      case 'delicate-balance': {
        const [A, B] = sys.forces;
        let balance;
        if (sys.factionForces) {
          balance = rooms.filter(r => usable(r) && r._territory &&
            [...(G.adj.get(r._roomNumber) ?? [])].some(n => byNum.get(n)._territory && byNum.get(n)._territory !== r._territory));
          balance = spread(balance.length ? balance : cands, 2);
        } else {
          balance = spread(cands, 3);
        }
        for (const r of balance) {
          const nbrs = [...(G.adj.get(r._roomNumber) ?? [])].map(n => byNum.get(n)).filter(usable).slice(0, 2);
          mark(r, g, 'stalemate', `STALEMATE — ${A} and ${B} hold each other in check here (remains of both, a no-man's-land). Weaken either and the other spreads into Rooms ${roomList(nbrs) || r._roomNumber} within a day.`);
        }
        sys.summary.push(`Balance points: Rooms ${roomList(balance)}. Kill or weaken too many of one side and the other overruns those rooms first.`);
        break;
      }

      case 'sleeping-dungeon': {
        let sleepers = rooms.filter(r => usable(r) && r.contentType === 'monster' && !r._factionBase && !r.faction);
        if (sleepers.length < 2) sleepers = sleepers.concat(rooms.filter(r => usable(r) && ['special', 'trap', 'trick'].includes(r.contentType)));
        sleepers = spread(sleepers, 3);
        const triggers = shuffle(DISTURBANCES);
        for (const s of sleepers) {
          const near = G.bfs(s._roomNumber);
          const trig = best(cands.filter(r => r !== s && !sleepers.includes(r)), r => {
            const k = near.get(r._roomNumber) ?? 9;
            return k >= 1 && k <= 3 ? 3 - Math.abs(k - 2) : -5;
          }) ?? s;
          const what = triggers.pop();
          mark(s, g, 'dormant', `DORMANT — everything here is asleep until ${what}${trig !== s ? ` in Room ${trig._roomNumber}` : ' here'}. Woken, it hunts toward the noise and then joins the wandering table.`);
          if (trig !== s) mark(trig, g, 'disturbance', `DISTURBANCE — ${what} here wakes what sleeps in Room ${s._roomNumber} (+1 disturbance count).`);
        }
        sys.summary.push(`Sleepers: Rooms ${roomList(sleepers)}.`);
        break;
      }

      case 'reclamation': {
        const source = sys.faction
          ? rooms.find(r => r._factionBase?.name === sys.faction)
          : best(cands, r => distE(r._roomNumber));
        if (source) mark(source, g, 'reclaimer source', `Source of the reclamation: ${sys.who} spread from here into any room left empty.`);
        const already = spread(cands.filter(r => r !== source && !r._factionBase), 2);
        for (const r of already) mark(r, g, 'reclaimed', `Cleared by the last expedition — already reclaimed by ${sys.who}: ${sys.signs}. Proof of what happens to rooms the party clears.`);
        sys.summary.push(`${source ? `Source: Room ${source._roomNumber}. ` : ''}Already reclaimed: Rooms ${roomList(already)}.`);
        break;
      }

      case 'traveling-state': {
        const circuit = findLoop(G, rooms.filter(usable)) ?? null;
        let route, loop = true;
        if (circuit && circuit.length >= 3 && circuit.length <= 8) {
          route = circuit.map(n => byNum.get(n));
        } else {
          loop = false;
          const far = best(cands, r => distE(r._roomNumber));
          const far2 = best(cands, r => G.bfs(far._roomNumber).get(r._roomNumber) ?? 0);
          // Longest stretch of the path that avoids the entrance, so the route stays contiguous.
          const segments = [[]];
          for (const n of G.path(far._roomNumber, far2._roomNumber)) {
            const r = byNum.get(n);
            if (usable(r)) segments.at(-1).push(r); else segments.push([]);
          }
          route = segments.sort((a, b) => b.length - a.length)[0].slice(0, 6);
        }
        const period = loop ? route.length * 2 : Math.max(2, (route.length - 1) * 4);
        route.forEach((r, i) => mark(r, g, 'circuit', `On the ${sys.name}'s circuit (stop ${i + 1} of ${route.length}; it returns every ${period} turns): while it is here, ${sys.effect}. One turn before it arrives: ${sys.sign}.`));
        // State the full period so room writers don't each work out their own.
        sys.period = period;
        sys.summary.push(`Route: Rooms ${roomList(route)}${loop ? ' and around again' : ', then back the same way'} — one room every 2 turns; a full ${loop ? 'circuit' : 'round trip'} takes ${period} turns. Roll 1d${route.length} for its stop when the party enters.`);
        break;
      }

      case 'accumulation': {
        const gauge = central(cands);
        mark(gauge, g, 'gauge', `GAUGE — ${sys.gauge} shows the ${sys.q} at a glance. Players who watch it can learn what each ${sys.action.replace(/^every /, '')} costs.`);
        const sources = spread(cands.filter(r => r !== gauge), 2);
        for (const r of sources) {
          mark(r, g, 'source', sys.q === 'water level'
            ? `A sluice gate: opening it (1 turn, DC 12 STR) lowers the water level by one step.`
            : `A strong temptation to ${sys.action.replace(/^every .*/, 'linger')} here — and a carved warning about the ${sys.q}.`);
        }
        sys.summary.push(`Gauge in Room ${gauge._roomNumber}.${sources.length ? ` Notable sources: Rooms ${roomList(sources)}.` : ''}`);
        break;
      }

      case 'power-network': {
        const source = central(cands);
        mark(source, g, 'source', `SOURCE — ${sys.source}: ${sys.power} for the whole network. Rerouting takes 1 turn; only 2 of the 3 consumers can run at once.`);
        const consumers = spread(cands.filter(r => r !== source), 3);
        const powered = shuffle(consumers).slice(0, 2);
        consumers.forEach((r, i) => {
          const c = sys.consumers[i];
          mark(r, g, 'consumer', `${cap(c.what)} on the network — powered: ${c.on}; unpowered: ${c.off}. Currently ${powered.includes(r) ? 'POWERED' : 'UNPOWERED'}.`);
          for (const p of interior(G.path(source._roomNumber, r._roomNumber)).filter(usable).slice(0, 1)) {
            if (!p._gestalt?.some(x => x.role === 'conduit')) mark(p, g, 'conduit', `Conduits pass through here: ${sys.conduit}.`);
          }
        });
        sys.summary.push(`Source: Room ${source._roomNumber}. Consumers: Rooms ${roomList(consumers)} (powered now: ${roomList(powered)}).`);
        break;
      }

      case 'random-pulse': {
        const source = best(cands, r => distE(r._roomNumber));
        mark(source, g, 'pulse source', `SOURCE of the ${sys.pulse}: the effect here is doubled.`);
        const near = [...(G.adj.get(source._roomNumber) ?? [])].map(n => byNum.get(n)).filter(usable).slice(0, 2);
        for (const r of near) mark(r, g, 'pulse zone', `Hit hard by the ${sys.pulse}: scars of past pulses everywhere; the inhabitants never linger here.`);
        const sDist = G.bfs(source._roomNumber);
        const shelters = spread(cands.filter(r => r !== source && !near.includes(r) && (sDist.get(r._roomNumber) ?? 9) >= 2), 2);
        for (const r of shelters) mark(r, g, 'shelter', `SHELTER from the ${sys.pulse}: unaffected. Inhabitants run here when the warning comes.`);
        sys.summary.push(`Source: Room ${source._roomNumber}. Shelters: Rooms ${roomList(shelters)}.`);
        break;
      }

      case 'linked-changes': {
        const pairs = [];
        const links = shuffle(LINKS), symbols = shuffle(LINK_SYMBOLS);
        const pool = cands.filter(r => r !== finalRoom);
        for (let i = 0; i < (rooms.length >= 16 ? 3 : 2); i++) {
          const used = pairs.flat();
          const control = best(pool.filter(r => !used.includes(r)), r => -notes(r));
          if (!control) break;
          const cd = G.bfs(control._roomNumber);
          const effect = best(pool.filter(r => r !== control && !used.includes(r)), r => Math.min(cd.get(r._roomNumber) ?? 0, 4));
          if (!effect) break;
          const link = links.pop(), symbol = symbols.pop();
          mark(control, g, 'control', `CONTROL (marked with ${symbol}): ${link.control}. Working it changes Room ${effect._roomNumber}: ${link.effect}. A distant sound tells players something happened.`);
          mark(effect, g, 'linked', `LINKED (marked with ${symbol}): when the ${link.control.replace(/^an? /, '')} in Room ${control._roomNumber} is worked, ${link.effect}.`);
          pairs.push([control, effect]);
          sys.summary.push(`${cap(symbol)}: ${link.control} in Room ${control._roomNumber} → in Room ${effect._roomNumber}, ${link.effect}.`);
        }
        break;
      }
    }
  }
}

// A simple cycle through the room graph (for a traveling circuit), or null.
function findLoop(G, rooms) {
  const allowed = new Set(rooms.map(r => r._roomNumber));
  for (const start of shuffle([...allowed])) {
    const parent = new Map([[start, null]]);
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      for (const nb of G.adj.get(cur) ?? []) {
        if (!allowed.has(nb) || nb === parent.get(cur)) continue;
        if (parent.has(nb)) {
          // Back edge: stitch the two tree paths into a cycle.
          const up = n => { const out = []; for (let x = n; x != null; x = parent.get(x)) out.push(x); return out; };
          const a = up(cur), b = up(nb);
          const common = a.find(x => b.includes(x));
          const loop = [...a.slice(0, a.indexOf(common) + 1), ...b.slice(0, b.indexOf(common)).reverse()];
          if (loop.length >= 3) return loop;
          continue;
        }
        parent.set(nb, cur);
        stack.push(nb);
      }
    }
  }
  return null;
}
