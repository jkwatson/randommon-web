// Dungeon gestalts — abstract organizing patterns (from "Dungeon Gestalts",
// Trident Gamebooks; see temp/dungeon-gestalts.md). A gestalt describes *how*
// a dungeon's parts are arranged and related, independent of its theme.
//
// Rolled before anything else in generateDungeon() so later random results
// (story, faction dispositions, room contents) can be read through it.
//
// Fields:
//   id, name, category  — category is 'spatial' | 'transformational' | 'relational'
//   summary             — one-line definition
//   guidance            — how to realize it in this dungeon's rooms (for the brief / LLM)
//   tells               — what players observe that lets them learn the pattern
//   affinity            — weight bonuses by dungeon type name, monster tag, and aesthetic
//   stories             — (non-spatial only) story seeds that embody the pattern;
//                         preferred over the generic dungeonStoryHook table

export const SPATIAL_GESTALTS = [
  {
    id: 'hub-and-spokes', name: 'Hub and Spokes', category: 'spatial',
    summary: 'A central area connects several otherwise separate branches; moving between branches means passing back through the hub.',
    guidance: 'The map is built this way: the hub room and each wing are marked (Zone lines and GESTALT notes). Make the hub a grand hall, cavern, or crossroads, and give every wing a distinct identity, visible from its doorway off the hub.',
    tells: 'The hub shows signs of every wing (different tracks, symbols, smells at each doorway); each wing is visibly distinct from the others.',
    affinity: { types: { 'Crypt': 2, 'Temple/Monastery': 2, 'Catacombs': 2, 'Museum': 3, 'Menagerie': 3, 'Library': 2, 'Barrow': 2, 'Fairy Mound': 2, 'Fomorian Fastness': 2 } },
  },
  {
    id: 'vertical-spine', name: 'Vertical Spine', category: 'spatial',
    summary: 'A major vertical route connects multiple depths, letting players choose how deep to go from the start.',
    guidance: 'The map is built this way: each level is a zone, and the landings are joined by the spine (vertical links). Make the spine a shaft, stair, or fissure, and make each level deeper and more dangerous than the last.',
    tells: 'Depth is legible: landings are numbered, marked, or visibly older/stranger the deeper they go; sounds and air drift up the spine.',
    affinity: { types: { 'Mine': 4, 'Wizard Tower': 4, 'Cave': 2, 'Sewer': 1, 'Bog Warren': 1, 'Fomorian Fastness': 1 } },
  },
  {
    id: 'artery-and-branches', name: 'Artery and Branches', category: 'spatial',
    summary: 'One large route spans the dungeon with smaller areas branching from it; the artery orients players and is a fast but risky route.',
    guidance: 'The map is built this way: the artery rooms run from the entrance to the final room, and branches hang off them. Make the artery a processional, river, rail, or great hall — fast, oriented, and watched.',
    tells: 'The artery is unmistakable (wider, lit, flowing water, rails) and everything else is clearly "off" it; danger concentrates along it.',
    affinity: { types: { 'Temple/Monastery': 2, 'Sewer': 4, 'Mine': 2, 'Castle/Palace': 2, 'Bastion': 2, 'Collapsed Temple': 2, "Nag-Lord's Outpost": 2 } },
  },
  {
    id: 'concentric-layers', name: 'Concentric Layers', category: 'spatial',
    summary: 'Successive regions surround an inner area; exploring means circling each layer to find the few ways inward.',
    guidance: 'The map is built this way: outer ring, middle ring, and inner sanctum are zones, joined only by the marked ways inward. Give each layer its own material, ornament, and guardians; make the ways inward rare, hidden, and well made.',
    tells: 'Each layer is marked by a change in material, ornament, or guardian; doors inward are rarer, better made, and better guarded.',
    affinity: { types: { 'Crypt': 2, 'Vault/Archive': 3, 'Prison': 3, 'Castle/Palace': 2, 'Barrow': 3, 'Drune Sanctum': 2, 'Fairy Mound': 2 } },
  },
  {
    id: 'great-divide', name: 'Great Divide', category: 'spatial',
    summary: 'A major barrier splits the dungeon into regions connected by only a few crossings.',
    guidance: 'The map is built this way: two sides joined only by the marked crossing rooms. Make the barrier concrete (chasm, collapse, flood) and each crossing an obstacle or hazard in its own right.',
    tells: 'Players can see or hear the far side long before they can reach it; the crossing points show wear, ropes, or bodies.',
    affinity: { types: { 'Mine': 2, 'Cave': 3, 'Bastion': 2, 'Castle/Palace': 1, 'Ancient Ruin': 2, 'Bog Warren': 2 }, aesthetics: { 'Flooded': 2, 'Flood-Gnawed': 2 } },
  },
  {
    id: 'separated-clusters', name: 'Separated Clusters', category: 'spatial',
    summary: 'Explorable areas form discrete clusters separated by open space or hazardous terrain.',
    guidance: 'The map is built this way: each cluster is a zone, joined only by the marked crossing rooms over dangerous ground. Make each cluster a self-contained site with its own inhabitants.',
    tells: 'Each cluster is a self-contained site with its own inhabitants; the gaps between them are exposed and dangerous.',
    affinity: { types: { 'Cave': 3, 'Ancient Ruin': 3, 'Bog Warren': 2, 'Menagerie': 1, 'Fairy Mound': 1 }, aesthetics: { 'Flooded': 1, 'Flood-Gnawed': 1 } },
  },
  {
    id: 'hollow-center', name: 'Hollow Center', category: 'spatial',
    summary: 'A large inaccessible space occupies the center, forcing players around its periphery.',
    guidance: 'The map is built this way: the rooms ring an impassable void at the center. Make the void concrete, and use the marked overlooks to show what lies across it.',
    tells: 'Windows, balconies, and ledges look onto the center from many rooms; things across it are visible but out of reach.',
    affinity: { types: { 'Castle/Palace': 3, 'Cave': 2, 'Temple/Monastery': 1, 'Fomorian Fastness': 2, 'Collapsed Temple': 2 } },
  },
  {
    id: 'ratchet-and-return', name: 'Ratchet and Return', category: 'spatial',
    summary: 'Transitions permit progress forward but prevent retreat; continued exploration eventually loops back to the entrance.',
    guidance: 'The map is built this way: sections joined by marked one-way passages, the last of which returns near the entrance. Telegraph every one-way passage from both sides — never a surprise trap.',
    tells: 'One-way transitions are visible from both sides (scratch marks on the far side of a sealed gate); the return route is hinted at early (a draft, light from above).',
    affinity: { types: { 'Crypt': 2, 'Prison': 2, 'Sewer': 2, 'Cave': 2, 'Barrow': 2, 'Bog Warren': 2 } },
  },
  {
    id: 'locked-center', name: 'Locked Center', category: 'spatial',
    summary: 'A major location can be reached early but not entered; the surrounding dungeon holds the means of access.',
    guidance: 'The map is built this way: the sealed vault is reached almost at once, and its keys lie in the marked rooms of the surrounding wings. Make every key visibly match the vault door.',
    tells: 'The sealed door shows exactly how many keys it needs (empty sockets, missing glyphs); each key, when found, visibly matches it.',
    affinity: { types: { 'Vault/Archive': 4, 'Crypt': 2, 'Temple/Monastery': 2, 'Prison': 2, 'Library': 2, 'Museum': 2, 'Drune Sanctum': 3, 'Barrow': 2, 'Witch-Mound': 1 } },
  },
  {
    id: 'landmark-and-loop', name: 'Landmark and Loop', category: 'spatial',
    summary: 'A major destination is perceived early but must be reached by an indirect, circuitous route.',
    guidance: 'The map is built this way: the landmark is visible from the entrance but reachable only by the long loop round. Make it distinctive enough to recognize at every glimpse.',
    tells: 'The landmark is distinctive — light, sound, or color that can be glimpsed again from other rooms, letting players triangulate.',
    affinity: { types: { 'Temple/Monastery': 2, 'Cave': 2, 'Wizard Tower': 1, 'Collapsed Temple': 3, 'Fairy Mound': 2, 'Ancient Ruin': 2 }, aesthetics: { 'Crystalline': 2, 'Foxfire': 2 } },
  },
  {
    id: 'symmetry-and-repetition', name: 'Symmetry and Repetition', category: 'spatial',
    summary: 'Parts of the dungeon repeat a recognizable arrangement, so learning one part predicts others — and deviations stand out.',
    guidance: 'The map is built this way: the wings are identical in layout, room shape, and furnishing, except for one marked deviation. Describe the repeated rooms the same way so players can predict — and spot the difference.',
    tells: 'Identical rooms are obviously identical (same murals, same numbering); the deviation is the clue.',
    affinity: { types: { 'Crypt': 2, 'Catacombs': 3, 'Bastion': 2, 'Prison': 2, 'Library': 2, 'Laboratory': 1, 'Barrow': 1 } },
  },
  {
    id: 'parallel-paths', name: 'Parallel Paths', category: 'spatial',
    summary: 'Two or more major routes run in parallel with occasional connections; each has different risks and rewards.',
    guidance: 'The map is built this way: an exposed main route and a concealed route run side by side, joined by marked connecting doors. Make the trade-off explicit: fast and watched versus slow and hidden.',
    tells: 'Connecting doors let players glimpse the other route; one route is fast and exposed, the other slow and concealed.',
    affinity: { types: { 'Castle/Palace': 3, 'Bastion': 3, 'Sewer': 2, 'Mine': 1, "Nag-Lord's Outpost": 2, 'Fomorian Fastness': 2 } },
  },
];

export const TRANSFORMATIONAL_GESTALTS = [
  {
    id: 'countdown', name: 'Countdown', category: 'transformational',
    summary: 'The dungeon is progressing toward a major, irreversible change; players see it approaching.',
    guidance: 'Define the event, its deadline in exploration turns or hours, and 3 escalating observable signs. Spread the signs across rooms so the party feels the clock.',
    tells: 'Escalating signs (tremors, failing wards, rising heat, a chant growing louder) that every room can reflect.',
    affinity: { types: { 'Prison': 2, 'Temple/Monastery': 2, 'Wizard Tower': 2, 'Laboratory': 2, 'Witch-Mound': 2, 'Drune Sanctum': 2 } },
    stories: [
      'Something here is hours from an irreversible change, and the warning signs are already impossible to ignore',
      'A ritual deeper in will complete soon; each passing hour another safeguard fails',
      'Something sealed here for centuries is close to breaking free — the seals are failing one by one',
    ],
  },
  {
    id: 'two-states', name: 'Two States', category: 'transformational',
    summary: 'The dungeon can switch between two global states (flooded/drained, lit/dark), often by player action.',
    guidance: 'Define the two states and the control that switches them (a wheel, a brazier, a sluice). For several rooms, note what differs between states — which exits open, which hazards apply.',
    tells: 'Tide marks, scorch lines, or dormant mechanisms show rooms have another state; the control is findable and its effect is audible.',
    affinity: { types: { 'Sewer': 3, 'Mine': 2, 'Temple/Monastery': 2, 'Laboratory': 2, 'Bog Warren': 2 }, aesthetics: { 'Flooded': 3, 'Flood-Gnawed': 3 } },
    stories: [
      'The dungeon was built to operate in two states, and someone has just thrown the switch',
      'Whoever controls the great mechanism controls which half of this place is passable',
    ],
  },
  {
    id: 'cycle-of-states', name: 'Cycle of States', category: 'transformational',
    summary: 'The dungeon cycles through states in a repeating sequence; learning the cycle lets players plan.',
    guidance: 'Define 3–4 states in a fixed cycle with a period in exploration turns (tides, elemental phases, the hours of a bell). Note which routes or hazards each state enables.',
    tells: 'The cycle has a herald — a bell, a rising hum, a draft — and rooms bear marks of each phase.',
    affinity: { types: { 'Cave': 2, 'Wizard Tower': 2, 'Temple/Monastery': 1, 'Fairy Mound': 3, 'Ancient Ruin': 2 }, aesthetics: { 'Flooded': 2, 'Crystalline': 1 } },
    stories: [
      'The dungeon turns through its phases like clockwork, and the inhabitants have built their lives around the cycle',
      'Every inhabitant here lives by the cycle; outsiders who do not learn it do not leave',
    ],
  },
  {
    id: 'advancing-front', name: 'Advancing or Retreating Front', category: 'transformational',
    summary: 'A condition spreads or withdraws through the dungeon, so different areas are in different states at once.',
    guidance: 'Pick the condition (blight, flood, darkness, ice) and its origin room. Rooms nearest the origin are consumed, a band is contested, the far rooms untouched. Inhabitants flee ahead of the front.',
    tells: 'A visible gradient — the farther toward the origin, the worse it gets; displaced creatures crowd the safe side.',
    affinity: { types: { 'Cave': 2, 'Mine': 2, 'Bog Warren': 3, 'Collapsed Temple': 2, 'Crypt': 1 }, aesthetics: { 'Fungal': 3, 'Vegetal': 2, 'Root-Choked': 2, 'Rime-Frosted': 2, 'Flooded': 1 } },
    stories: [
      'Something is spreading through this place from below, and everything that lives here is being driven before it',
      'A creeping corruption has claimed the lower rooms and advances a little more each day',
    ],
  },
  {
    id: 'delicate-balance', name: 'Delicate Balance', category: 'transformational',
    summary: 'The dungeon sits in a fragile equilibrium between opposing forces; player actions tip it.',
    guidance: 'Name the two opposed forces and what each does when unchecked. Show both forces holding each other back in specific rooms; note what happens to those rooms if either side is weakened.',
    tells: 'Battle lines, mutual remains, and stalemates show the forces in tension; harming one visibly strengthens the other.',
    affinity: { types: { 'Cave': 2, 'Catacombs': 2, 'Laboratory': 2, 'Fairy Mound': 2, 'Witch-Mound': 2 } },
    stories: [
      'Two forces here keep each other in check — upset either and the other floods in',
      'An ancient equilibrium holds this place together, and it is one careless act from collapse',
    ],
  },
  {
    id: 'sleeping-dungeon', name: 'Sleeping Dungeon', category: 'transformational',
    summary: 'The dungeon begins dormant; disturbing areas wakes inhabitants and defenses, so it grows more active as explored.',
    guidance: 'Most rooms start quiet. Mark which disturbances wake what (opening a crypt wakes its dead, noise wakes the guardians), and have woken things begin wandering into other rooms.',
    tells: 'Everything is still, dusty, sealed; each disturbance has an audible echo elsewhere in the dungeon.',
    affinity: { types: { 'Crypt': 3, 'Catacombs': 2, 'Vault/Archive': 2, 'Museum': 3, 'Ancient Ruin': 3, 'Barrow': 3, 'Menagerie': 1 } },
    stories: [
      'This place has slept undisturbed for an age, and it does not like being woken',
      'Every seal broken here wakes something that was meant to stay asleep',
    ],
  },
  {
    id: 'reclamation', name: 'Reclamation', category: 'transformational',
    summary: 'Areas the party clears or alters gradually develop new conditions — inhabitants move in, hazards return.',
    guidance: 'Decide what reclaims cleared rooms (scavengers, a rival faction, growth, sand, water) and how fast. Note in key rooms what they look like when the party returns.',
    tells: 'Fresh signs of reoccupation in rooms the party already cleared; rivals visibly waiting for openings.',
    affinity: { types: { 'Cave': 2, 'Sewer': 2, 'Bastion': 1, 'Bog Warren': 2, 'Collapsed Temple': 2 }, aesthetics: { 'Fungal': 2, 'Vegetal': 2, 'Root-Choked': 3 } },
    stories: [
      'Nothing stays cleared here for long; something always moves into the empty spaces',
      'The previous expedition cleared half this place — it has already been reclaimed',
    ],
  },
  {
    id: 'traveling-state', name: 'Traveling State', category: 'transformational',
    summary: 'A temporary condition moves through the dungeon on a route, affecting each area only while it passes.',
    guidance: 'Define the moving condition (a cloud, a procession, a darkness, a wandering guardian) and its circuit through specific rooms. Players who learn the route can time their movement.',
    tells: 'Rooms on the circuit share the same residue (soot, frost, silence); the condition announces itself before it arrives.',
    affinity: { types: { 'Catacombs': 2, 'Sewer': 2, 'Cave': 1, 'Fairy Mound': 2, 'Temple/Monastery': 1 }, aesthetics: { 'Haunted': 2 } },
    stories: [
      'Something moves through these halls on a fixed circuit, and everything here lives around its passing',
    ],
  },
  {
    id: 'accumulation', name: 'Accumulation or Depletion', category: 'transformational',
    summary: 'Actions throughout the dungeon add to or drain a shared quantity; crossing thresholds changes the dungeon.',
    guidance: 'Name the quantity (water level, magical charge, oil, souls) and what adds or drains it. Define 2–3 thresholds and what changes at each.',
    tells: 'A visible gauge — a water line, a glowing pillar, a filling basin — that players can watch change.',
    affinity: { types: { 'Wizard Tower': 3, 'Laboratory': 3, 'Sewer': 2, 'Mine': 1, 'Drune Sanctum': 2 }, aesthetics: { 'Flooded': 2 } },
    stories: [
      'Every action taken here feeds — or drains — something, and it is close to a threshold',
    ],
  },
  {
    id: 'power-network', name: 'Power Network', category: 'transformational',
    summary: 'Areas are activated or deactivated through a shared network; changing where power flows alters clusters of rooms.',
    guidance: 'Define the power (water pressure, a crystal, a sacred flame) and its source room, plus 2–3 consumer rooms (doors, lifts, guardians). Not everything can be powered at once.',
    tells: 'Conduits, pipes, or veins visibly run between rooms; powered and unpowered features look different.',
    affinity: { types: { 'Wizard Tower': 3, 'Laboratory': 3, 'Mine': 2, 'Vault/Archive': 2, 'Ancient Ruin': 2, 'Drune Sanctum': 1 } },
    stories: [
      'The old machinery still runs on a single source, and every faction wants to control where it flows',
    ],
  },
  {
    id: 'random-pulse', name: 'Random Pulse', category: 'transformational',
    summary: 'At unpredictable intervals a recurring event changes conditions across the dungeon.',
    guidance: 'Define the pulse (a geyser, a booming voice, a wave of cold), its effect, its duration, and how to roll for it (e.g. on a 1 on the encounter die). Make some rooms more affected than others.',
    tells: 'Everything bears the marks of past pulses; inhabitants have shelters and habits built around it.',
    affinity: { types: { 'Cave': 2, 'Wizard Tower': 2, 'Laboratory': 2, 'Fairy Mound': 2, 'Witch-Mound': 1 }, aesthetics: { 'Haunted': 2, 'Demonic': 2 } },
    stories: [
      'At unpredictable moments, something surges through this place, and nothing here is quite the same afterward',
    ],
  },
  {
    id: 'linked-changes', name: 'Linked Changes', category: 'transformational',
    summary: 'Changing a feature in one area causes a noticeable change somewhere else.',
    guidance: 'Create 2–3 pairs of linked rooms: a control (lever, wheel, idol, formation) and a distant effect (a portcullis rises, a room floods, a guardian wakes). Players should be able to notice the link.',
    tells: 'Manipulating a control produces an audible or visible effect at a distance; matching symbols mark linked pairs.',
    affinity: { types: { 'Bastion': 2, 'Castle/Palace': 2, 'Wizard Tower': 2, 'Vault/Archive': 2, 'Ancient Ruin': 2, 'Fomorian Fastness': 2 } },
    stories: [
      'This place was built as a single mechanism; touching one part of it moves another',
    ],
  },
];

export const RELATIONAL_GESTALTS = [
  {
    id: 'warring-factions', name: 'Warring Factions', category: 'relational',
    summary: 'Factions in the dungeon are hostile to each other; helping one turns the others against the party.',
    guidance: 'Give each faction a clear territory. Make it obvious where one territory ends and another begins. Each faction offers the party something real for working against the other.',
    tells: 'Battle sites, fortified borders, trophies taken from the enemy; each side tells a different story about the other.',
    affinity: { types: { 'Bastion': 2, 'Castle/Palace': 2, 'Cave': 1, "Nag-Lord's Outpost": 2 } },
    stories: [
      'Two factions are at open war over this place, and anyone caught between them must choose a side',
      'A long feud between the inhabitants has finally boiled over into open war',
    ],
    minFactions: 2,
  },
  {
    id: 'contested-territory', name: 'Contested Territory', category: 'relational',
    summary: 'Factions compete for control of an important area; control can shift during play.',
    guidance: 'Choose one important room (a hall, a well, a crossing) on the border between faction territories. Note who holds it now, what it gives them, and what it would take to flip it.',
    tells: 'The contested area shows layered signs of both sides — rival graffiti, barricades rebuilt facing different ways.',
    affinity: { types: { 'Bastion': 2, 'Mine': 2, 'Castle/Palace': 1, 'Fomorian Fastness': 1 } },
    stories: [
      'Two factions are locked in a standoff over a single chamber, each waiting for the other to make a mistake',
      'Control of the heart of this place has changed hands three times this month',
    ],
    minFactions: 2,
  },
  {
    id: 'hunter-and-prey', name: 'Hunter and Prey', category: 'relational',
    summary: 'A powerful element hunts weaker ones; the prey\'s behavior and remains reveal the hunter.',
    guidance: 'The hunter roams; it has no fixed room. Place its signs — remains, fleeing prey, abandoned lairs — in several rooms so players can judge where it is and what it can do before they meet it.',
    tells: 'Fresh remains, panicked prey, abandoned rooms, claw marks at a telling height.',
    affinity: { types: { 'Menagerie': 40, 'Cave': 2, 'Sewer': 1, 'Bog Warren': 1, 'Mine': 1 } },
    stories: [
      'Something stalks the inhabitants of this place, and they are dying one by one',
      'A predator has moved in, and every other creature here lives in terror of it',
    ],
  },
  {
    id: 'dominant-and-subordinate', name: 'Dominant and Subordinate', category: 'relational',
    summary: 'One powerful element commands lesser ones; changing that relationship changes the subordinates\' behavior.',
    guidance: 'One faction (or a single entity) rules the other. Show how the subordinates are kept in line, and what they do if the master is removed or undermined — some flee, some bargain.',
    tells: 'Tribute, fearful obedience, idols of the master, subordinates who speak of the master in whispers.',
    affinity: { types: { 'Temple/Monastery': 2, 'Castle/Palace': 2, 'Cave': 1, "Nag-Lord's Outpost": 3, 'Fomorian Fastness': 2, 'Witch-Mound': 1 } },
    stories: [
      'A tyrant rules everything here through fear — and the cracks in that fear are beginning to show',
      'The inhabitants serve a master they hate but dare not defy',
    ],
    minFactions: 2,
  },
  {
    id: 'shared-resource', name: 'Shared Resource', category: 'relational',
    summary: 'Multiple elements depend on or compete for the same limited resource.',
    guidance: 'Define the resource (water, light, food, a magical seep) and the room where it is found. Every faction needs it; whoever controls it can pressure the others. Players can seize, share, or destroy it.',
    tells: 'Everyone carries the resource or its traces; the paths to its source are the most traveled in the dungeon.',
    affinity: { types: { 'Cave': 2, 'Mine': 2, 'Sewer': 1, 'Bog Warren': 2 } },
    stories: [
      'Everyone here depends on the same dwindling source, and it is running out',
    ],
    minFactions: 2,
  },
  {
    id: 'symbiote-or-parasite', name: 'Symbiote or Parasite', category: 'relational',
    summary: 'One element lives in close association with another; affecting either has consequences for the other.',
    guidance: 'Pair two elements (a faction and a monster, a mold and its hosts, a patron and its servants). Show the benefit and the cost of the bond, and what is unleashed if it is broken.',
    tells: 'Visible signs of the bond — growths, marks, gifts, wasting — on the dependent party.',
    affinity: { types: { 'Laboratory': 2, 'Cave': 1, 'Fairy Mound': 2, 'Witch-Mound': 2, 'Bog Warren': 2 }, aesthetics: { 'Fungal': 2 } },
    stories: [
      'The inhabitants have made a bargain with something here that is slowly consuming them',
    ],
  },
  {
    id: 'containment', name: 'Containment', category: 'relational',
    summary: 'One element imprisons or suppresses another; weakening the container frees what it holds.',
    guidance: 'Define what is contained, what contains it (wards, wardens, a fungus, a seal), and where. Show the container weakening, and make clear what each act against the container costs.',
    tells: 'Wards, chains, and seals throughout; things that should not be weakening are; the contained thing\'s influence leaks near the prison.',
    affinity: { types: { 'Prison': 4, 'Temple/Monastery': 2, 'Crypt': 1, 'Vault/Archive': 1, 'Barrow': 2, 'Drune Sanctum': 2 } },
    stories: [
      'Something imprisoned here is held back only by wardens who are dying out',
      'Something sealed here for centuries is close to breaking free',
    ],
  },
  {
    id: 'attraction-or-repulsion', name: 'Attraction or Repulsion', category: 'relational',
    summary: 'The presence or use of one element predictably attracts or repels another.',
    guidance: 'Define the trigger (light, noise, magic, blood, a scent) and what it draws or drives off. Give the party a limited resource that exploits the rule, and make the rule learnable early.',
    tells: 'Early, safe demonstrations of the rule — a creature recoiling from a torch, something drawn to a spell.',
    affinity: { types: { 'Crypt': 1, 'Wizard Tower': 2, 'Catacombs': 2, 'Cave': 1, 'Fairy Mound': 2 }, aesthetics: { 'Haunted': 1 } },
    stories: [
      'Something here is drawn — irresistibly — to a single thing the party is carrying',
    ],
  },
  {
    id: 'threat-and-refuge', name: 'Threat and Refuge', category: 'relational',
    summary: 'Elements cluster in places that protect them from something they fear; their distribution reveals danger and safety.',
    guidance: 'Name the threat and what keeps it out (holy symbols, light, running water). The weaker inhabitants crowd into refuge rooms; empty rooms mark the threat\'s territory.',
    tells: 'Crowded refuges with protective markings; eerily empty rooms nearby.',
    affinity: { types: { 'Catacombs': 2, 'Crypt': 2, 'Temple/Monastery': 2, 'Collapsed Temple': 2, 'Barrow': 1 } },
    stories: [
      'The inhabitants huddle in the few rooms that keep them safe from what roams the rest',
    ],
  },
  {
    id: 'host-and-intruder', name: 'Host and Intruder', category: 'relational',
    summary: 'An established system is being disrupted from outside; the host reacts while the intruder adapts.',
    guidance: 'The host holds the dungeon\'s original territory; the intruder has broken in from a specific point and is spreading from it. Show barricades, abandoned rooms, and the line between overrun and intact.',
    tells: 'Barricades and abandoned rooms mark the edge of the intrusion; overrun rooms are stripped and changed.',
    affinity: { types: { 'Crypt': 2, 'Temple/Monastery': 1, 'Mine': 2, 'Bastion': 1, 'Barrow': 2, 'Fairy Mound': 2, 'Ancient Ruin': 2 } },
    stories: [
      'An unexpected group arrived recently and threw the old order into chaos',
      'Outsiders have broken in, and the original inhabitants are losing ground room by room',
    ],
    minFactions: 2,
  },
  {
    id: 'guarded-asset', name: 'Guarded Asset', category: 'relational',
    summary: 'One element consistently protects another; where the guards stand reveals what matters.',
    guidance: 'Pick the asset (a vault, a person, a secret door) and a recognizable kind of guard. Wherever that guard appears, something important is nearby — including at least one decoy or hidden asset.',
    tells: 'A distinctive guard type (black-armored, a particular statue) whose presence becomes a clue players can learn.',
    affinity: { types: { 'Vault/Archive': 3, 'Castle/Palace': 2, 'Museum': 2, 'Bastion': 1, 'Drune Sanctum': 1, 'Fomorian Fastness': 1 } },
    stories: [
      'Something here is guarded with a devotion that has outlasted its masters',
    ],
  },
  {
    id: 'producer-and-consumer', name: 'Producer and Consumer', category: 'relational',
    summary: 'One element produces something another depends on; players can follow, intercept, or disrupt the flow.',
    guidance: 'Define the producer, the product (undead, silk, spores, poison, potions), and the consumers. Trace the flow through specific rooms so players can follow it back to its source.',
    tells: 'The product is visible in transit — carts, trails, conduits — always flowing from one direction.',
    affinity: { types: { 'Laboratory': 3, 'Mine': 2, 'Crypt': 1, 'Catacombs': 1, 'Wizard Tower': 1, 'Witch-Mound': 2, 'Bog Warren': 1 } },
    stories: [
      'Something deep inside is producing a steady supply of horrors, and the inhabitants depend on it',
    ],
  },
];

export const ALL_GESTALTS = [...SPATIAL_GESTALTS, ...TRANSFORMATIONAL_GESTALTS, ...RELATIONAL_GESTALTS];

const BY_ID = new Map(ALL_GESTALTS.map(g => [g.id, g]));

export function getGestalt(id) { return BY_ID.get(id) ?? null; }

function affinityWeight(g, { type, tags = [], aesthetic }) {
  const a = g.affinity ?? {};
  let w = 1;
  w += a.types?.[type] ?? 0;
  for (const t of tags) w += a.tags?.[t] ?? 0;
  if (aesthetic) w += a.aesthetics?.[aesthetic] ?? 0;
  return w;
}

function pickWeighted(items, weightFn, rand) {
  const weighted = items.map(i => ({ i, w: weightFn(i) })).filter(x => x.w > 0);
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = rand() * total;
  for (const x of weighted) { r -= x.w; if (r <= 0) return x.i; }
  return weighted.at(-1)?.i ?? null;
}

// Choose the dungeon's gestalts: one spatial, plus one transformational or
// relational (the source's recommended starting point). Large dungeons get
// both. `overrides` is a list of gestalt ids that are used as-is; missing
// categories are rolled.
export function rollGestalts({ type, tags = [], aesthetic = null, size = 'Medium', factionCount = 2, overrides = [], rand = Math.random } = {}) {
  const ctx = { type, tags, aesthetic };
  const chosen = [];
  for (const id of overrides) {
    const g = getGestalt(id);
    if (!g) throw new Error(`Unknown gestalt "${id}". Valid ids: ${ALL_GESTALTS.map(x => x.id).join(', ')}`);
    if (!chosen.includes(g)) chosen.push(g);
  }
  const has = cat => chosen.some(g => g.category === cat);
  const eligible = g => (g.minFactions ?? 0) <= factionCount;
  const roll = list => pickWeighted(list.filter(eligible), g => affinityWeight(g, ctx), rand);

  if (!has('spatial')) chosen.unshift(roll(SPATIAL_GESTALTS));

  if (size === 'Large') {
    if (!has('transformational')) chosen.push(roll(TRANSFORMATIONAL_GESTALTS));
    if (!has('relational'))       chosen.push(roll(RELATIONAL_GESTALTS));
  } else if (!has('transformational') && !has('relational')) {
    // Pick the category via the best-fitting candidates so strong affinities
    // (Menagerie → Hunter and Prey) aren't diluted by a coin flip.
    chosen.push(roll([...TRANSFORMATIONAL_GESTALTS, ...RELATIONAL_GESTALTS]));
  }

  const order = { spatial: 0, transformational: 1, relational: 2 };
  return chosen.filter(Boolean).sort((a, b) => order[a.category] - order[b.category]);
}
