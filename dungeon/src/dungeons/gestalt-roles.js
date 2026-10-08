// Turns a dungeon's relational gestalts into concrete structure.
//
// castGestalts()      — before the map exists: faction dispositions, roles and
//                       goals, plus cast monsters (hunter, threat, prisoner).
//                       Runs for both crawl dungeons and modules.
// applyGestaltRoles() — after the module map is built: spread-out faction
//                       bases, territories, faction-owned rooms, and per-pattern
//                       room roles (contested chamber, breach, wards, refuges…).
//
// Room annotations live on `room._gestalt` as { pattern, role, note } and each
// gestalt records its key rooms in `g.rooms` as { room, role }.

import { getDB } from '../monsterStore.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

// "court of wights" → "court of wights'", "goblin warband" → "goblin warband's"
export const poss = name => (name.endsWith('s') ? `${name}'` : `${name}'s`);

// "ORC, CHIEFTAIN" → "orc chieftain"
export function displayName(name) {
  return (name ?? '').toLowerCase().replace(/,\s*/g, ' ').trim();
}

export function lookupFactionCreature(faction) {
  const name = faction?.creature;
  if (!name) return null;
  const db = getDB();
  return db?.get(name) || db?.get(name.replace(/s$/i, '')) || db?.get(name.replace(/ies$/i, 'y')) || null;
}

function setDisposition(from, to, text) {
  if (from && to && from !== to) from.dispositions[to.name] = text;
}

function levelOf(statblock) {
  return parseInt(statblock?.match(/LV\s*(\d+)/)?.[1] ?? '1');
}

// A real monster above party level, from the dungeon type's tags, never one
// of the factions' own creatures (it preys on them).
function pickApexMonster(d, partyLevel, pickMonster, boost = 1) {
  const db = getDB();
  const pl = parseInt(partyLevel) || 1;
  const factionCreatures = new Set(d.factions.map(f => f.creature?.toUpperCase()).filter(Boolean));
  const notFaction = m => !factionCreatures.has(m.name.toUpperCase()) &&
    !factionCreatures.has(`${m.name.toUpperCase()}S`);
  const pool = (db?.filter({ source: d.monsterSource, tags: d.tags, minLevel: pl + boost, maxLevel: pl + boost + 3 }) ?? [])
    .filter(notFaction);
  return pool.length ? pick(pool) : pickMonster(partyLevel, boost + 1, { uncapped: true });
}

function castMonster(m) {
  if (!m) return null;
  return { name: m.name, statblock: m.statblock, note: m.description ?? null, abilities: m.abilities ?? [], level: m.level };
}

// ── Flavor tables ─────────────────────────────────────────────────

const RESOURCES = [
  { name: 'clean spring',       desc: 'a cold, clean spring welling up through a cracked basin — the only drinkable water for a mile of tunnels', trace: 'wet footprints and slopped water' },
  { name: 'fungus garden',      desc: 'a carefully tended bed of edible fungi under a dripping ceiling', trace: 'spore-dust and trampled caps' },
  { name: 'everburning flame',  desc: 'a flame that has burned in a stone bowl for centuries, needing no fuel — light and warmth for whoever holds it', trace: 'soot marks and carried embers' },
  { name: 'magical seep',       desc: 'a glittering, faintly warm ooze weeping from a seam in the wall — potent in rituals, fatal in excess', trace: 'glittering smears on hands and doorframes' },
  { name: 'food cache',         desc: 'a sealed storeroom of preserved food, far more than anyone here could eat in a year', trace: 'crumbs, wrappings, and gnawed rinds' },
  { name: 'healing pool',       desc: 'a shallow pool whose water closes wounds (drinking heals 1d4, once per day per creature)', trace: 'bloodied bandages discarded near the water' },
];

const BONDS = [
  { kind: 'parasite', text: f => `It feeds on the ${f} — they are visibly wasting — but grants them ${pick(['strength beyond their size', 'sight in total darkness', 'resistance to poison', 'unnatural healing'])}. Kill it and the gift fails; the ${f} are freed but weakened.`, sign: 'pallid skin, puncture scars, and an unnatural vigor' },
  { kind: 'guardian', text: f => `It guards the ${poss(f)} home in exchange for food — they feed it captives. Kill it and the ${f} lose their strongest defender; starve it and it roams.`, sign: 'cages of captives kept as feed, and offerings left at its door' },
  { kind: 'growth',   text: f => `Its growth has spread over the ${f}: it hides them from their enemies but is slowly taking them over. Destroying it cures them — and leaves them exposed.`, sign: 'patches of its growth on their skin and gear' },
];

const WARD_FORMS = [
  'a chalk-and-salt circle across the threshold, freshly renewed',
  'a bronze seal nailed over a door, its inscription half-worn',
  'a chained statue whose eyes glow while the ward holds',
  'a votive flame in an iron cage that must never go out',
  'an iron spike driven through a carved sigil in the floor',
  'a knotted cord of hair and wire strung across the passage',
];

const ATTRACTION_RULES = [
  { trigger: 'Open flame',      verb: 'repels',   item: '3 blessed torches that burn twice as long and drive them back twice as far' },
  { trigger: 'Loud noise',      verb: 'attracts', item: 'a clockwork noisemaker that can be wound and thrown as a lure' },
  { trigger: 'Spellcasting',    verb: 'attracts', item: 'a lead-lined box that hides one magic item or scroll from them' },
  { trigger: 'Fresh blood',     verb: 'attracts', item: '3 stoppered vials of preserved blood that can be thrown as a lure' },
  { trigger: 'Salt',            verb: 'repels',   item: 'a sack of grave-salt (5 handfuls); a line of it cannot be crossed by them for 1 turn' },
  { trigger: 'Cold iron',       verb: 'repels',   item: 'a ring of 6 cold-iron spikes; a spike in a doorway bars them for 1 hour' },
];

const REFUGE_PROTECTIONS = [
  'holy symbols carved over every doorway',
  'a channel of running water across the threshold',
  'oil lamps kept burning day and night',
  'unbroken lines of salt at every entrance',
  'a ring of rusted iron set into the floor',
];

const BREACH_FORMS = [
  { form: 'a freshly dug tunnel through the wall', seal: 'collapse the tunnel mouth (DC 12 STR with tools, 1 turn)' },
  { form: 'a collapsed section of ceiling, now a ramp of rubble', seal: 'bring down the rest of the ceiling (DC 15 STR, or a well-placed lever)' },
  { form: 'a forced and splintered door', seal: 'barricade and spike the doorway (1 turn, needs timber or iron)' },
  { form: 'a crack widened by tools and claws', seal: 'wedge it with stone and mortar (2 turns)' },
];

const OVERRUN_SIGNS = [
  'its old furnishings smashed and burned for fuel',
  'its carvings defaced and replaced with crude new marks',
  'the original occupants\' dead heaped in a corner',
  'converted into a crude barracks, bedding and gear everywhere',
];

const GUARD_MARKS = ['black-armored', 'masked', 'brass-collared', 'red-sashed', 'silent, tongue-cut'];

const PRODUCTS = [
  { product: 'animated dead',  source: 'a necromantic font that raises whatever corpses are thrown into it', trace: 'shambling dead filing past, all heading the same way' },
  { product: 'enchanted silk', source: 'a vast spinner\'s web-loom producing silk stronger than steel',       trace: 'silk bundles carried on poles; strands snagged on doorframes' },
  { product: 'thrall spores',  source: 'a pulsing fungal heart that releases mind-binding spores',            trace: 'drifting spores and dazed creatures walking toward it' },
  { product: 'poison',         source: 'a dripping venom-vat fed by milked creatures',                         trace: 'stained jars and the sharp smell of venom' },
  { product: 'forged weapons', source: 'an ancient forge whose fire never cools',                              trace: 'racks of fresh-forged blades carried on handcarts' },
  { product: 'brewed draughts', source: 'a bubbling copper still producing strength-giving draughts',          trace: 'sticky spilled draughts and empty flasks' },
];

const HUNTER_SIGNS = [
  p => `${p} remains, freshly killed and partly eaten`,
  p => `claw marks gouged at a telling height, and a smashed ${p} totem`,
  p => `an abandoned ${p} post — weapons dropped, food still warm`,
  () => 'a sudden silence: everything nearby has gone into hiding',
  p => `drag marks and a ${p} boot, still laced`,
];

// ── Before the map: faction relations, roles, goals, cast monsters ─

export function castGestalts(d, partyLevel, { pickMonster }) {
  const factions    = d.factions;
  const inhabitants = factions.filter(f => f.isInhabitant);
  const outsiders   = factions.filter(f => !f.isInhabitant);

  for (const g of d.gestalts) {
    g.cast ??= {};
    switch (g.id) {
      case 'warring-factions':
        for (const a of factions) {
          for (const b of factions) setDisposition(a, b, 'at open war — they attack on sight; anyone who aids them is an enemy');
          const enemy = factions.find(f => f !== a);
          if (enemy && Math.random() < 0.6) a.goal = `crush the ${enemy.name} and take their territory`;
        }
        break;

      case 'contested-territory': {
        if (factions.length < 2) break;
        const [a, b] = factions;
        a.gestaltRole = b.gestaltRole = 'contender';
        setDisposition(a, b, 'contesting the same ground — skirmishes over who holds the key chamber');
        setDisposition(b, a, 'contesting the same ground — skirmishes over who holds the key chamber');
        a.goal = b.goal = 'take and hold the contested chamber at the heart of their rivalry';
        g.cast.contenders = [a.name, b.name];
        break;
      }

      case 'dominant-and-subordinate': {
        if (factions.length < 2) break;
        const dom = inhabitants[0] ?? factions[0];
        const sub = factions.find(f => f !== dom);
        dom.gestaltRole = 'dominant';
        sub.gestaltRole = 'subordinate';
        setDisposition(dom, sub, 'master — commands them and treats them as expendable');
        setDisposition(sub, dom, 'subordinate — obeys out of fear; some would bargain to be free');
        dom.goal = `keep the ${sub.name} in line and wring ever more tribute from them`;
        sub.goal = `throw off the ${dom.name} without being destroyed for trying`;
        g.cast.dominant = dom.name;
        g.cast.subordinate = sub.name;
        break;
      }

      case 'host-and-intruder': {
        if (factions.length < 2) break;
        const host     = inhabitants[0] ?? factions[0];
        const intruder = outsiders.find(f => f !== host) ?? factions.find(f => f !== host);
        host.gestaltRole = 'host';
        intruder.gestaltRole = 'intruder';
        setDisposition(host, intruder, 'besieged — barricading against the intruders and losing ground');
        setDisposition(intruder, host, 'invading — pushing deeper, adapting the conquered rooms to their own use');
        host.goal = `drive the ${intruder.name} back out and seal the breach they came through`;
        intruder.goal = `push deeper and take the ${poss(host.name)} halls for themselves`;
        g.cast.host = host.name;
        g.cast.intruder = intruder.name;
        break;
      }

      case 'shared-resource': {
        const res = pick(RESOURCES);
        g.cast.resource = res;
        for (const a of factions) {
          for (const b of factions) setDisposition(a, b, `rivals for the ${res.name} — whoever holds it can squeeze the other`);
          a.goal = `secure sole control of the ${res.name}`;
        }
        break;
      }

      case 'hunter-and-prey': {
        g.cast.hunter = d.beast
          ? { name: d.beast.epithet, statblock: d.beast.baseStatblock, note: d.beast.specimen, isBeast: true }
          : castMonster(pickApexMonster(d, partyLevel, pickMonster));
        const prey = inhabitants.length ? inhabitants : factions;
        for (const f of prey) {
          f.gestaltRole ??= 'prey';
          if (g.cast.hunter) f.goal = `survive the ${displayName(g.cast.hunter.name)} that hunts them — they are abandoning their outer rooms and would pay dearly to see it dead`;
        }
        g.cast.prey = prey.map(f => f.name);
        break;
      }

      case 'threat-and-refuge': {
        g.cast.hunter = castMonster(pickApexMonster(d, partyLevel, pickMonster));
        g.cast.protection = pick(REFUGE_PROTECTIONS);
        const refugees = inhabitants.length ? inhabitants : factions;
        for (const f of refugees) {
          f.gestaltRole ??= 'refugee';
          if (g.cast.hunter) f.goal = `hold the warded rooms and outlast the ${displayName(g.cast.hunter.name)}`;
        }
        g.cast.refugees = refugees.map(f => f.name);
        break;
      }

      case 'containment': {
        g.cast.contained = castMonster(pickApexMonster(d, partyLevel, pickMonster, 3));
        const warden  = inhabitants[0] ?? factions[0];
        const breaker = factions.find(f => f !== warden && !f.isInhabitant) ?? null;
        const what = g.cast.contained ? displayName(g.cast.contained.name) : 'what is imprisoned here';
        if (warden) {
          warden.gestaltRole = 'warden';
          warden.goal = `keep the ${what} imprisoned — maintain the wards at any cost`;
          g.cast.warden = warden.name;
        }
        if (breaker) {
          breaker.gestaltRole = 'breaker';
          breaker.goal = `break the wards and free — or harness — the ${what}`;
          g.cast.breaker = breaker.name;
        }
        break;
      }

      case 'symbiote-or-parasite': {
        const host = inhabitants[0] ?? factions[0];
        if (!host) break;
        const bond = pick(BONDS);
        const partner = castMonster(pickMonster(partyLevel, 1));
        host.gestaltRole ??= 'bonded';
        g.cast.bonded = host.name;
        g.cast.partner = partner;
        g.cast.bond = { kind: bond.kind, text: bond.text(host.name), sign: bond.sign };
        break;
      }

      case 'attraction-or-repulsion': {
        const rule = pick(ATTRACTION_RULES);
        const creature = inhabitants.length && Math.random() < 0.6
          ? inhabitants[0].creature
          : displayName(pickMonster(partyLevel)?.name) || 'the dungeon\'s dead';
        g.cast.rule = { ...rule, creature, text: `${rule.trigger} ${rule.verb} the ${creature}` };
        break;
      }

      case 'guarded-asset': {
        const owner = inhabitants[0] ?? factions[0];
        const mark = pick(GUARD_MARKS);
        g.cast.guard = {
          faction: owner?.name ?? null,
          desc: owner?.creature ? `${mark} ${owner.creature}` : `${mark} guards of the ${owner?.name ?? 'old masters'}`,
        };
        break;
      }

      case 'producer-and-consumer': {
        const p = pick(PRODUCTS);
        const consumer = inhabitants[0] ?? factions[0];
        g.cast.product = p;
        if (consumer) {
          consumer.gestaltRole ??= 'consumer';
          consumer.goal = `keep the ${p.product} flowing — their strength depends on it`;
          g.cast.consumer = consumer.name;
        }
        break;
      }
    }
  }
}

// ── After the map: bases, territories, room roles ──────────────────

// Keys that describe a room's place and atmosphere — kept when restocking.
const ATMO_KEYS = new Set(['roomType', 'roomSize', 'exits', 'verticalExit', 'smell', 'sound', 'furnishing', 'hallway', 'finalRoomDesc']);

export function buildGraph(rooms, map) {
  const numById = new Map();
  for (const n of map.nodes.values()) numById.set(n.id, n.roomNumber);
  const adj = new Map(rooms.map(r => [r._roomNumber, new Set()]));
  for (const e of map.edges) {
    const a = numById.get(e.fromId), b = numById.get(e.toId);
    if (a == null || b == null || a === b) continue;
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  }
  const byNum = new Map(rooms.map(r => [r._roomNumber, r]));

  function bfs(start) {
    const dist = new Map([[start, 0]]);
    const q = [start];
    while (q.length) {
      const cur = q.shift();
      for (const nb of adj.get(cur) ?? []) {
        if (!dist.has(nb)) { dist.set(nb, dist.get(cur) + 1); q.push(nb); }
      }
    }
    return dist;
  }

  function path(a, b) {
    const prev = new Map([[a, null]]);
    const q = [a];
    while (q.length) {
      const cur = q.shift();
      if (cur === b) break;
      for (const nb of adj.get(cur) ?? []) {
        if (!prev.has(nb)) { prev.set(nb, cur); q.push(nb); }
      }
    }
    if (!prev.has(b)) return [];
    const out = [];
    for (let n = b; n != null; n = prev.get(n)) out.unshift(n);
    return out;
  }

  return { adj, byNum, bfs, path, degree: n => adj.get(n)?.size ?? 0 };
}

export function applyGestaltRoles({ d, rooms, map, partyLevel, stockContent, pickMonster, rollCount, treasureForLevel }) {
  const G = buildGraph(rooms, map);
  const entrance = rooms.find(r => r._isEntrance) ?? rooms[0];
  const finalRoom = rooms.find(r => r.finalRoomDesc) ?? null;
  const fromEntrance = G.bfs(entrance._roomNumber);
  const distE = n => fromEntrance.get(n) ?? 99;

  // Rooms whose content has been rewritten by a role — later roles skip them.
  const restocked = new Set();
  const isProtected = r => r === entrance || r === finalRoom || !!r._factionBase;
  const free = r => !isProtected(r) && !restocked.has(r._roomNumber);

  function mark(room, g, role, note) {
    if (!room) return;
    (room._gestalt ??= []).push({ pattern: g.name, role, note });
    (g.rooms ??= []).push({ room: room._roomNumber, role });
  }

  function restock(room, contentType, opts = {}) {
    for (const k of Object.keys(room)) {
      if (!k.startsWith('_') && !ATMO_KEYS.has(k)) delete room[k];
    }
    Object.assign(room, { contentType }, stockContent(partyLevel, contentType, { faction: null, ...opts }));
    const node = map.nodes.get(room._mapId);
    if (node) node.contentType = contentType;
    restocked.add(room._roomNumber);
    return room;
  }

  // A room held by a faction's own members: its real creature for
  // inhabitants, its Key NPC's stat block for outsiders.
  function garrison(room, faction, activity = null) {
    restock(room, 'monster');
    const creature = lookupFactionCreature(faction);
    room.monster = creature ?? {
      name: `${faction.name} members`,
      statblock: faction.npcStatblock,
      level: String(levelOf(faction.npcStatblock)),
    };
    room.count = rollCount(room.monster.level, partyLevel);
    room.faction = faction;
    if (activity) room.activity = activity;
    return room;
  }

  const roomsOf = pred => rooms.filter(pred);
  const best = (cands, score) => cands
    .map(r => ({ r, s: score(r) + Math.random() * 0.5 }))
    .sort((a, b) => b.s - a.s)[0]?.r ?? null;

  // ── 1. Faction bases, spread apart ─────────────────────────────
  for (const r of rooms) delete r._factionBase;
  const bases = [];
  for (const faction of d.factions) {
    const cands = roomsOf(r => r !== entrance && r !== finalRoom && !r._factionBase);
    const distsToBases = bases.map(b => G.bfs(b._roomNumber));
    const r = best(cands, r => {
      let s = 0;
      if (r.contentType === 'monster' && r.faction?.name === faction.name) s += 3;
      else if (r.contentType === 'monster' || r.contentType === 'npc') s += 2;
      if (distE(r._roomNumber) >= 2) s += 1;
      if (distsToBases.length) s += 1.5 * Math.min(...distsToBases.map(m => m.get(r._roomNumber) ?? 6));
      // Factions claim different parts of a planned layout (wings, rings, sides).
      if (r._zone && !bases.some(b => b._zone === r._zone)) s += 2;
      return s;
    });
    if (r) { r._factionBase = faction; bases.push(r); }
  }

  // ── 2. Territories (multi-source BFS from the bases) ───────────
  const claimable = rooms.filter(r => r !== entrance && r !== finalRoom).length;
  const cap = Math.max(2, Math.ceil(claimable * 0.75 / Math.max(1, bases.length)));
  const owner = new Map();
  const counts = new Map();
  {
    const q = bases.map(b => ({ n: b._roomNumber, f: b._factionBase }));
    const seen = new Set(q.map(x => x.n));
    for (const { n, f } of q) { owner.set(n, f); counts.set(f, 1); }
    while (q.length) {
      const { n, f } = q.shift();
      for (const nb of G.adj.get(n) ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        const r = G.byNum.get(nb);
        if (r !== entrance && r !== finalRoom && (counts.get(f) ?? 0) < cap) {
          owner.set(nb, f);
          counts.set(f, (counts.get(f) ?? 0) + 1);
        }
        q.push({ n: nb, f });
      }
    }
  }
  for (const f of d.factions) f.territory = [];
  for (const r of rooms) {
    const f = owner.get(r._roomNumber) ?? null;
    r._territory = f?.name ?? null;
    if (f) f.territory.push(r._roomNumber);
  }
  for (const f of d.factions) f.territory.sort((a, b) => a - b);

  // ── 3. Faction-owned rooms ──────────────────────────────────────
  for (const r of rooms) {
    const f = owner.get(r._roomNumber) ?? null;
    if (r._factionBase) {
      // A base holds its own faction — never a stray monster wearing its name.
      const bf = r._factionBase;
      if (!bf.isInhabitant && r.contentType === 'npc') r.faction = bf;
      else garrison(r, bf, 'at home, on guard');
      restocked.delete(r._roomNumber);  // bases are protected anyway
      continue;
    }
    if (r === finalRoom || r === entrance) continue;
    if (r.contentType === 'monster') {
      // Most monster rooms in a territory hold the faction's own members;
      // the rest are unaffiliated creatures the faction lives alongside.
      if (f && Math.random() < (f.isInhabitant && lookupFactionCreature(f) ? 0.6 : 0.4)) {
        garrison(r, f, r.activity);
        restocked.delete(r._roomNumber);  // ordinary territory room; roles may still claim it
      } else {
        r.faction = null;
      }
    } else if (r.contentType === 'npc') {
      r.faction = f;
    }
  }

  const borderRooms = f => roomsOf(r => owner.get(r._roomNumber) === f &&
    [...(G.adj.get(r._roomNumber) ?? [])].some(nb => owner.has(nb) && owner.get(nb) !== f));
  const baseOf = f => bases.find(b => b._factionBase === f) ?? null;
  const facByName = name => d.factions.find(f => f.name === name) ?? null;
  const interior = p => p.slice(1, -1).map(n => G.byNum.get(n));

  // ── 4. Per-pattern room roles ───────────────────────────────────
  for (const g of d.gestalts ?? []) {
    const c = g.cast ?? {};
    switch (g.id) {
      case 'warring-factions': {
        for (const f of d.factions) {
          const enemy = d.factions.find(x => x !== f);
          if (!enemy) continue;
          const post = shuffle(borderRooms(f)).find(free);
          if (post) {
            garrison(post, f, `manning a border post facing the ${enemy.name}`);
            mark(post, g, 'border post', `Border post of the ${f.name} facing the ${enemy.name}: barricades, a lookout, trophies taken from the ${enemy.name}.`);
          }
          mark(baseOf(f), g, 'war camp', `The ${f.name} will reward the party (safe passage through their territory, information, or loot) for striking at the ${enemy.name}. Helping them makes the ${enemy.name} hostile.`);
        }
        if (!d.factions.some(f => borderRooms(f).length)) {
          const [a, b] = bases;
          const field = a && b ? interior(G.path(a._roomNumber, b._roomNumber)).find(free) : null;
          if (field) mark(field, g, 'battleground', `Site of the last clash between the ${d.factions.map(f => f.name).join(' and the ')}: bodies of both sides, broken weapons, and blood still tacky.`);
        }
        break;
      }

      case 'contested-territory': {
        const [a, b] = (c.contenders ?? []).map(facByName);
        if (!a || !b) break;
        const ba = baseOf(a), bb = baseOf(b);
        const between = ba && bb ? interior(G.path(ba._roomNumber, bb._roomNumber)).filter(free) : [];
        const room = best(between.length ? between : roomsOf(free), r => G.degree(r._roomNumber));
        if (!room) break;
        const holder = pick([a, b]), other = holder === a ? b : a;
        const prize = between.includes(room)
          ? `controls the only direct route between the ${a.name} and the ${b.name}`
          : pick(['commands the high ground', 'holds the supplies stored here', 'controls the water', 'holds the shrine both sides revere']);
        garrison(room, holder, 'fortifying the chamber against counterattack');
        room._territory = holder.name;
        mark(room, g, 'contested chamber', `CONTESTED — currently held by the ${holder.name}; the ${other.name} want it back. Whoever holds it ${prize}. Control flips if the holders lose half their number, or if the party helps the ${other.name} attack. Layered signs of both sides: rival marks, barricades rebuilt facing different ways.`);
        a.goal = b.goal = `take and hold the contested chamber (Room ${room._roomNumber})`;
        c.contested = room._roomNumber;
        break;
      }

      case 'hunter-and-prey': {
        if (!c.hunter) break;
        const hunterName = displayName(c.hunter.name);
        const prey = (c.prey ?? []).map(facByName).filter(Boolean);
        const preyBases = prey.map(baseOf).filter(Boolean);
        const preyDists = preyBases.map(b => G.bfs(b._roomNumber));
        const lair = best(roomsOf(free), r =>
          (preyDists.length ? Math.min(...preyDists.map(m => m.get(r._roomNumber) ?? 0)) : distE(r._roomNumber)) +
          (G.degree(r._roomNumber) === 1 ? 2 : 0));
        if (lair) {
          restock(lair, 'empty');
          lair.treasure = { item: treasureForLevel(partyLevel) };
          mark(lair, g, 'hunter\'s lair', `The ${poss(hunterName)} lair: gnawed bones of the ${prey[0]?.name ?? 'other inhabitants'}, and the possessions of its victims. The hunter is here sleeping on a 1-in-3; otherwise it is out hunting.`);
          c.lair = lair._roomNumber;
        }
        const preyName = prey[0]?.name ?? 'other inhabitants';
        const target = preyBases.length && lair
          ? preyBases.sort((x, y) => (G.bfs(lair._roomNumber).get(x._roomNumber) ?? 99) - (G.bfs(lair._roomNumber).get(y._roomNumber) ?? 99))[0]
          : null;
        const trail = lair && target ? interior(G.path(lair._roomNumber, target._roomNumber)) : [];
        const signs = shuffle(HUNTER_SIGNS);
        for (const r of trail.filter(r => r !== entrance).slice(0, 3)) {
          mark(r, g, 'hunter sign', `Sign of the ${hunterName}: ${signs.pop()(preyName)}.`);
        }
        const abandoned = trail.find(r => free(r) && prey.includes(owner.get(r._roomNumber)))
          ?? roomsOf(r => free(r) && prey.includes(owner.get(r._roomNumber))).sort((x, y) => distE(y._roomNumber) - distE(x._roomNumber))[0];
        if (abandoned) {
          restock(abandoned, 'empty');
          mark(abandoned, g, 'abandoned', `Abandoned by the ${preyName}: barricaded from inside in haste, now torn open from without. Their gear lies where it fell.`);
        }
        for (const b of preyBases) mark(b, g, 'prey', `The ${b._factionBase.name} are terrified of the ${hunterName}. They will trade passage, information, or treasure for its death, and can describe what it does (its abilities) to anyone who asks.`);
        break;
      }

      case 'dominant-and-subordinate': {
        const dom = facByName(c.dominant), sub = facByName(c.subordinate);
        if (!dom || !sub) break;
        const enforcer = shuffle(roomsOf(r => free(r) && owner.get(r._roomNumber) === sub))[0]
          ?? best(roomsOf(free), r => -Math.abs((G.bfs(baseOf(sub)?._roomNumber ?? 1).get(r._roomNumber) ?? 9) - 1));
        if (enforcer) {
          garrison(enforcer, dom, `overseeing the ${sub.name}`);
          mark(enforcer, g, 'overseer', `An overseer post of the ${dom.name} inside ${poss(sub.name)} ground: tribute is collected and punishments are given here. The ${sub.name} nearby are sullen and watchful.`);
        }
        mark(baseOf(dom), g, 'master', `Tribute from the ${sub.name} is heaped here. The ${dom.name} treat the ${sub.name} as expendable and will throw them at intruders first.`);
        const domBase = baseOf(dom);
        if (domBase && !domBase.treasure) domBase.treasure = { item: treasureForLevel(partyLevel) };
        mark(baseOf(sub), g, 'subordinate', `The ${sub.name} resent the ${dom.name}. If ${dom.npcName} is killed or humiliated, half of the ${sub.name} flee and the rest will bargain with the party.`);
        break;
      }

      case 'shared-resource': {
        const res = c.resource;
        if (!res) break;
        const baseDists = bases.map(b => G.bfs(b._roomNumber));
        const room = best(roomsOf(free), r =>
          -(baseDists.length ? Math.max(...baseDists.map(m => m.get(r._roomNumber) ?? 9)) : distE(r._roomNumber)));
        if (!room) break;
        restock(room, 'empty');
        room.feature = res.desc;
        const holder = Math.random() < 0.5 ? pick(d.factions) : null;
        if (holder) {
          garrison(room, holder, `guarding the ${res.name}`);
          room.feature = res.desc;
          room._territory = holder.name;
        }
        mark(room, g, 'resource', `THE ${res.name.toUpperCase()}: ${res.desc}. Every faction depends on it. ${holder ? `The ${holder.name} hold it now and ration it to squeeze the others.` : 'No one holds it — an uneasy truce of turns, broken at the first excuse.'} Seizing, sharing, or spoiling it changes every faction's position.`);
        c.room = room._roomNumber;
        for (const b of bases) {
          for (const r of interior(G.path(b._roomNumber, room._roomNumber)).slice(0, 2)) {
            if (r === entrance) continue;
            mark(r, g, 'resource trail', `A well-worn path toward the ${res.name} (Room ${room._roomNumber}): ${res.trace}.`);
          }
        }
        break;
      }

      case 'symbiote-or-parasite': {
        const f = facByName(c.bonded);
        const base = baseOf(f);
        if (!f || !c.bond) break;
        const near = base ? [...(G.adj.get(base._roomNumber) ?? [])].map(n => G.byNum.get(n)).find(free) : null;
        const room = near ?? roomsOf(free)[0];
        if (room) {
          restock(room, 'monster');
          const partner = pickMonster(partyLevel, 1);
          if (partner) {
            room.monster = partner;
            room.count = 1;
            c.partner = castMonster(partner);
          }
          room.activity = `bound to the ${f.name}`;
          mark(room, g, 'symbiote', `Bound to the ${f.name}: ${c.bond.text}`);
          c.room = room._roomNumber;
        }
        mark(base, g, 'bonded', `The ${f.name} show the bond: ${c.bond.sign}.`);
        break;
      }

      case 'containment': {
        const what = c.contained ? displayName(c.contained.name) : 'thing imprisoned here';
        const prison = finalRoom && !finalRoom._factionBase
          ? finalRoom
          : best(roomsOf(free), r => distE(r._roomNumber));
        if (!prison) break;
        const wardCount = rooms.length >= 16 ? 3 : 2;
        const pathRooms = interior(G.path(entrance._roomNumber, prison._roomNumber)).filter(r => r !== entrance);
        const others = shuffle(roomsOf(r => r !== entrance && r !== prison && !pathRooms.includes(r)));
        const wards = [...shuffle(pathRooms).slice(0, 1), ...others].slice(0, wardCount);
        const forms = shuffle(WARD_FORMS);
        const occupant = prison === finalRoom ? ` This is the final room: the imprisoned ${what} is its master, and the final-room description should be read through it.` : '';
        mark(prison, g, 'prison', `PRISON — the ${what} is bound here by ${wards.length} wards (Rooms ${wards.map(w => w._roomNumber).join(', ')}). While any ward holds it cannot leave this room. Each ward broken lets its influence spread further (whispers, cold, creatures turning strange); with all broken, it is free and hunts.${occupant}`);
        wards.forEach((w, i) => mark(w, g, 'ward', `WARD ${i + 1} of ${wards.length}: ${forms[i]}. It holds the ${what} in Room ${prison._roomNumber}. Breaking it takes a turn and is felt throughout the dungeon; restoring a broken ward requires the ${poss(c.warden ?? 'original makers')} rite.`));
        const wardenBase = baseOf(facByName(c.warden));
        mark(wardenBase, g, 'warden', `The ${c.warden} know the rite that renews the wards, and that the wards are failing.`);
        c.prison = prison._roomNumber;
        // The prisoner is physically here, so its stat block belongs in the room.
        if (c.contained) prison._prisoner = c.contained;
        c.wards = wards.map(w => w._roomNumber);
        break;
      }

      case 'attraction-or-repulsion': {
        const rule = c.rule;
        if (!rule) break;
        const demo = best(roomsOf(free), r => -Math.abs(distE(r._roomNumber) - 1.5));
        if (demo) {
          mark(demo, g, 'demonstration', rule.verb === 'attracts'
            ? `Shows the rule early: something that made ${rule.trigger.toLowerCase()} here was found by the ${rule.creature} — tracks converge on its remains from every exit.`
            : `Shows the rule early: a ring of ${rule.trigger.toLowerCase()} still keeps the ${rule.creature} out of one corner; a survivor's bones sit untouched inside it.`);
        }
        const cache = best(roomsOf(r => free(r) && r !== demo), r => (G.degree(r._roomNumber) === 1 ? 2 : 0) + distE(r._roomNumber) / 3);
        if (cache) mark(cache, g, 'cache', `CACHE — ${rule.item}. (${rule.trigger} ${rule.verb} the ${rule.creature}.)`);
        break;
      }

      case 'threat-and-refuge': {
        if (!c.hunter) break;
        const threat = displayName(c.hunter.name);
        const refugees = (c.refugees ?? []).map(facByName).filter(Boolean);
        const refugeCands = roomsOf(r => r !== entrance && r !== finalRoom && refugees.includes(owner.get(r._roomNumber)));
        const refuges = [
          ...refugees.map(baseOf).filter(Boolean),
          ...shuffle(refugeCands.filter(free)),
        ].filter((r, i, a) => a.indexOf(r) === i).slice(0, 2);
        for (const r of refuges) {
          if (free(r) && refugees[0]) garrison(r, refugees[0], 'sheltering');
          mark(r, g, 'refuge', `REFUGE — ${c.protection}; the ${threat} cannot enter. The ${refugees[0]?.name ?? 'weaker inhabitants'} crowd in here and will not leave willingly.`);
        }
        const refugeDists = refuges.map(r => G.bfs(r._roomNumber));
        const grounds = roomsOf(free)
          .sort((x, y) => Math.min(...refugeDists.map(m => m.get(y._roomNumber) ?? 9)) - Math.min(...refugeDists.map(m => m.get(x._roomNumber) ?? 9)))
          .slice(0, 2);
        for (const r of grounds) {
          restock(r, 'empty');
          mark(r, g, 'hunting ground', `Eerily empty — nothing shelters here. The ${poss(threat)} hunting ground: scattered remains and no protective marks anywhere.`);
        }
        c.refuges = refuges.map(r => r._roomNumber);
        break;
      }

      case 'host-and-intruder': {
        const host = facByName(c.host), intruder = facByName(c.intruder);
        if (!host || !intruder) break;
        const hostDist = baseOf(host) ? G.bfs(baseOf(host)._roomNumber) : fromEntrance;
        const intruderRooms = roomsOf(r => owner.get(r._roomNumber) === intruder);
        const breach = best(intruderRooms.filter(free), r => hostDist.get(r._roomNumber) ?? 0)
          ?? best(roomsOf(free), r => hostDist.get(r._roomNumber) ?? 0);
        if (breach) {
          const bf = pick(BREACH_FORMS);
          mark(breach, g, 'breach', `BREACH — the ${intruder.name} broke in here through ${bf.form}. Reinforcements still trickle through. Sealing it — ${bf.seal} — cuts them off.`);
          c.breach = breach._roomNumber;
        }
        for (const r of shuffle(borderRooms(host)).filter(r => !r._factionBase).slice(0, 2)) {
          mark(r, g, 'barricade', `The ${poss(host.name)} barricade line facing the ${intruder.name}: furniture, rubble, and sharpened stakes; defenders fall back here when pressed.`);
        }
        const signs = shuffle(OVERRUN_SIGNS);
        for (const r of intruderRooms.filter(r => !r._factionBase && r !== breach).slice(0, 2)) {
          mark(r, g, 'overrun', `Overrun — once ${poss(host.name)}, now held by the ${intruder.name}: ${signs.pop()}.`);
        }
        break;
      }

      case 'guarded-asset': {
        const guard = c.guard;
        if (!guard) break;
        const guardFaction = facByName(guard.faction);
        const secretRoom = roomsOf(r => free(r) && (r.exits ?? []).some(e => e.type === 'secret door'))[0];
        const deadEnd = best(roomsOf(r => free(r) && r !== secretRoom), r => (G.degree(r._roomNumber) === 1 ? 3 : 0) + distE(r._roomNumber) / 2);
        const assets = [finalRoom, secretRoom ?? deadEnd].filter(Boolean);
        const decoy = best(roomsOf(r => free(r) && !assets.includes(r)), r => -Math.abs(distE(r._roomNumber) - 2));
        for (const a of assets) {
          if (a !== finalRoom && !a.treasure) a.treasure = { item: treasureForLevel(partyLevel) };
          mark(a, g, 'asset', a === finalRoom
            ? `GUARDED ASSET — the prize the ${guard.desc} exist to protect.`
            : `GUARDED ASSET — a hidden cache the ${guard.desc} protect${(a.exits ?? []).some(e => e.type === 'secret door') ? '; their presence betrays the secret door' : ''}.`);
          const approach = interior(G.path(entrance._roomNumber, a._roomNumber)).filter(free).at(-1);
          if (approach && guardFaction) {
            garrison(approach, guardFaction, `standing guard over Room ${a._roomNumber}`);
            mark(approach, g, 'guard post', `${guard.desc[0].toUpperCase()}${guard.desc.slice(1)} stand watch here. Wherever they stand, something valuable is near: they guard Room ${a._roomNumber}.`);
          }
        }
        if (decoy) {
          if (guardFaction) garrison(decoy, guardFaction, 'standing guard over an empty vault');
          mark(decoy, g, 'decoy', `${guard.desc[0].toUpperCase()}${guard.desc.slice(1)} guard this room too — but it is a decoy: an empty strongbox and a trap-door. Clever players notice these guards are fewer and less alert.`);
        }
        c.assets = assets.map(a => a._roomNumber);
        break;
      }

      case 'producer-and-consumer': {
        const p = c.product;
        if (!p) break;
        const consumer = facByName(c.consumer);
        const cBase = baseOf(consumer);
        const cDist = cBase ? G.bfs(cBase._roomNumber) : fromEntrance;
        const source = best(roomsOf(free), r => cDist.get(r._roomNumber) ?? 0);
        if (!source) break;
        mark(source, g, 'producer', `SOURCE of the ${p.product}: ${p.source}. Destroying or seizing it cuts off the ${consumer?.name ?? 'inhabitants'}.`);
        c.source = source._roomNumber;
        if (cBase) {
          for (const r of interior(G.path(source._roomNumber, cBase._roomNumber)).filter(r => r !== entrance).slice(0, 3)) {
            mark(r, g, 'flow', `The flow of ${p.product}: ${p.trace} — always moving toward Room ${cBase._roomNumber}, always coming from Room ${source._roomNumber}.`);
          }
          mark(cBase, g, 'consumer', `The ${consumer.name} depend on the ${p.product} from Room ${source._roomNumber}. Cut the flow and within a day they grow desperate — and willing to deal.`);
          consumer.goal = `keep the ${p.product} flowing from Room ${source._roomNumber}`;
        }
        break;
      }
    }
  }
}
