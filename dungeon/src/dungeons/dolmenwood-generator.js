import { generateDungeon } from './generator.js';

const DW_DUNGEON_TYPES = [
  {
    name: 'Barrow', weight: 8,
    tags: ['undead', 'fey'],
    flavor: 'A Neolithic burial mound, its passages delved deep into the earth. The dead interred here do not rest easily.',
    finalRoom: 'The central burial chamber — an ancient chieftain or cursed noble, entombed with their hoard and their grudges.',
  },
  {
    name: 'Fairy Mound', weight: 6,
    tags: ['fey', 'fairy', 'demi-fey'],
    flavor: 'A grassy hill concealing a glittering, dreamlike realm beneath. Time moves strangely here, and bargains are binding.',
    finalRoom: 'The Fairy Court — a minor lord of the fey holds court, and every deal offered has a hidden cost.',
  },
  {
    name: 'Drune Sanctum', weight: 4,
    tags: ['humanoid'],
    flavor: 'A hidden underground complex maintained by the Drune — pale, raven-haired sorcerers who guard the standing stones and remember things best forgotten.',
    finalRoom: 'The inner circle — forbidden knowledge of the Ring of Chell, the Triple Compact, and what lies beneath the stones.',
  },
  {
    name: 'Bog Warren', weight: 4,
    tags: ['undead', 'plant', 'fungus'],
    flavor: 'Tunnels carved through black waterlogged peat, reeking of rot and ancient preservatives. The bog remembers everything it has killed.',
    finalRoom: 'The drowned heart — something ancient and perfectly preserved in the peat, and very much aware of intruders.',
  },
  {
    name: 'Witch-Mound', weight: 3,
    tags: ['humanoid', 'fey', 'plant'],
    flavor: "The underground sanctum of a witch coven, hidden beneath an ancient sacred site. The Wood Gods are worshipped here in the old ways.",
    finalRoom: "The ritual circle — evidence of the coven's next Working, and perhaps an avatar of their patron Wood God.",
  },
  {
    name: "Nag-Lord's Outpost", weight: 3,
    tags: ['humanoid', 'monstrosity'],
    flavor: "A carved stronghold belonging to Atanuwë's servants. Absurdist cruelty and petty police-state terror permeate every corridor.",
    finalRoom: "The shrine of the Sargstone — a chaos altar dripping with the Nag-Lord's blessing, and those who tend it.",
  },
  {
    name: 'Ancient Ruin', weight: 3,
    tags: ['fey', 'humanoid', 'construct'],
    flavor: 'The remnant of a civilization older than memory — elvish, Fomorian, or something stranger still. Its original purpose is no longer legible.',
    finalRoom: 'The preserved chamber — a relic, a sleeping guardian, or a memory sealed in stone awaiting the right question.',
  },
  {
    name: 'Collapsed Temple', weight: 3,
    tags: ['humanoid', 'undead', 'plant'],
    flavor: "A ruined temple to one of the Wood Gods, swallowed by roots and earth. The god's attention lingers even in ruin.",
    finalRoom: "The inner sanctum — a manifestation of the temple's patron, hungry for recognition, worship, or sacrifice.",
  },
  {
    name: 'Fomorian Fastness', weight: 2,
    tags: ['giant', 'humanoid'],
    flavor: 'A vast underground hall carved by or for the Fomorians — ancient giants whose blood still runs in corners of Dolmenwood.',
    finalRoom: 'The throne hall — a Fomorian chieftain holds court, ancient and terrible, surrounded by tribute and bones.',
  },
];

const DW_ARCHITECTURES = [
  { name: 'Rough-Hewn Stone',  weight: 5 },
  { name: 'Mossy Masonry',     weight: 5 },
  { name: 'Root-Cracked',      weight: 4 },
  { name: 'Fey-Wrought',       weight: 3 },
  { name: 'Earthen and Turf',  weight: 4 },
  { name: 'Bog-Timber',        weight: 2 },
  { name: 'Fomorian-Cut',      weight: 2 },
  { name: 'Wyrd-Inscribed',    weight: 2 },
];

const DW_AESTHETICS = [
  { name: null, description: null, weight: 8 },
  { name: 'Foxfire',      description: 'Pale blue-green foxfire clings to the walls; no torch is needed, but everything looks wrong in this light.',                      weight: 1 },
  { name: 'Root-Choked',  description: 'Ancient roots have cracked every surface and hang from the ceiling; the wood is alive and slowly shifting.',                       weight: 1 },
  { name: 'Petrified',    description: 'Everything is crusted with mineral deposits; the walls weep cold grey water that smells of deep earth.',                           weight: 1 },
  { name: 'Rime-Frosted', description: 'Hoarfrost coats every surface — Cold Prince influence. Breath fogs; iron is painfully cold to the touch.',                        weight: 1 },
  { name: 'Fungal',       description: 'Great shelf-fungi and bulbous growths smother the walls; drifting spores give everything a slightly unreal quality.',              weight: 1 },
  { name: 'Flood-Gnawed', description: 'Passages partially flooded with black bog water; the smell is overwhelming and footing is treacherous.',                          weight: 1 },
  { name: 'Wyrd-Marked',  description: 'Ogham inscriptions cover every surface, glowing faintly. Those who spend time here feel persistently observed.',                  weight: 1 },
];

const DW_SIZES = [
  { label: 'Small',  rooms: 8,  factions: 2, weight: 4 },
  { label: 'Medium', rooms: 12, factions: 2, weight: 7 },
  { label: 'Large',  rooms: 20, factions: 3, weight: 5 },
];

// Inhabitants native to Dolmenwood dungeons, mapped to monster DB names and tags.
const DW_INHABITANT_FACTIONS = [
  // Drune
  { name: 'Drune circle',                     creature: 'drune',          tags: ['humanoid'] },
  // Fey folk
  { name: 'goblin war-camp',                  creature: 'goblins',        tags: ['fey', 'humanoid'] },
  { name: 'redcap warband',                   creature: 'redcaps',        tags: ['fairy', 'humanoid'] },
  { name: 'elf court fragment',               creature: 'elves',          tags: ['fey', 'humanoid'] },
  { name: 'merfaun colony',                   creature: 'merfauns',       tags: ['fey'] },
  { name: 'nutcap swarm',                     creature: 'nutcaps',        tags: ['demi-fey'] },
  { name: 'scrabey nest',                     creature: 'scrabeys',       tags: ['demi-fey', 'humanoid'] },
  // Forest and hill folk
  { name: 'mossling colony',                  creature: 'mosslings',      tags: ['humanoid', 'plant'] },
  { name: 'cobbin clan',                      creature: 'cobbins',        tags: ['humanoid'] },
  { name: 'breggle lord and retinue',         creature: 'breggles',       tags: ['humanoid'] },
  { name: 'crookhorn band',                   creature: 'crookhorns',     tags: ['humanoid'] },
  { name: 'deorling hunting party',           creature: 'deorlings',      tags: ['humanoid'] },
  // Undead
  { name: 'wight barrow-court',               creature: 'wights',         tags: ['undead'] },
  { name: 'bog corpse congregation',          creature: 'bog corpses',    tags: ['undead'] },
  { name: 'antler wraith host',               creature: 'antler wraiths', tags: ['undead', 'fey'] },
  // Human cultists and witches
  { name: 'witch coven',                      creature: 'witches',        tags: ['humanoid'] },
  { name: "Nag-Lord's crookhorn cult",        creature: 'crookhorns',     tags: ['humanoid', 'monstrosity'] },
  // Monstrous
  { name: 'devil goat herd',                  creature: 'devil goats',    tags: ['monstrosity'] },
  { name: 'root thing grove-mind',            creature: 'root things',    tags: ['plant'] },
  { name: 'mould oracle sect',                creature: 'mould oracles',  tags: ['humanoid', 'plant'] },
  { name: 'gargoyle flock on standing orders', creature: 'gargoyles',     tags: ['construct'] },
];

// Outsider factions who have entered this place with a specific purpose.
const DW_OUTSIDER_FACTIONS = [
  'Pluritine Church inquisitors',
  "Duke's men-at-arms",
  'witch-hunters',
  'Drune seekers',
  'breggle noble expedition',
  'relic hunters',
  'bandit company sheltering in place',
  'Longhorn House scouts',
  'adventuring company',
  'Cold Prince herald and escort',
  'Ygraine Mordlin agents',
  'local woodcutters turned treasure hunters',
];

export function generateDolmenwoodDungeon(partyLevel = 1) {
  return generateDungeon(partyLevel, {
    types:               DW_DUNGEON_TYPES,
    architectures:       DW_ARCHITECTURES,
    aesthetics:          DW_AESTHETICS,
    sizes:               DW_SIZES,
    inhabitantFactions:  DW_INHABITANT_FACTIONS,
    outsiderFactions:    DW_OUTSIDER_FACTIONS,
    monsterSource:       'dolmenwood',
  });
}
