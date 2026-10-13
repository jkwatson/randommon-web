// What a GM is asked about every room: how high the ceiling is, what the
// floor and walls are made of, what the air is like — and, at each exit,
// what can be heard, smelled or seen of the room beyond. All of it comes from
// the stocked data, so a clue at a door always matches what is behind it.

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

// Floor and wall materials by architecture (generic and Dolmenwood).
const FABRIC = {
  'Human':            { floor: ['worn flagstones', 'fitted flagstones', 'brick laid herringbone'], walls: ['dressed stone blocks', 'plastered brick, cracked and stained', 'rough-cut stone'] },
  'Luxurious':        { floor: ['polished marble', 'veined marble, scuffed dull', 'mosaic tile, half its tesserae gone'], walls: ['gilt plaster over brick', 'carved marble panels', 'faded frescoes on plaster'] },
  'Dwarven':          { floor: ['fitted granite slabs', 'rune-cut basalt'], walls: ['smooth-dressed granite', 'basalt block, joints hairline-tight'] },
  'Elven':            { floor: ['pale limestone worn smooth', 'tiles of grey-green stone'], walls: ['carved living rock', 'pale limestone carved with leaves'] },
  'Foreign':          { floor: ['glazed tile in faded colours', 'red sandstone slabs'], walls: ['lacquered stone', 'carved sandstone'] },
  'Elder/Alien':      { floor: ['glassy black stone', 'ribbed stone, faintly warm'], walls: ['seamless black stone', 'ribbed stone that looks grown, not cut'] },
  'Rough-Hewn Stone': { floor: ['rough-hewn rock', 'chisel-marked stone'], walls: ['rough-hewn rock', 'chisel-scarred stone'] },
  'Mossy Masonry':    { floor: ['mossy flagstones', 'slick, moss-grown cobbles'], walls: ['moss-furred masonry', 'old stone blocks green with moss'] },
  'Root-Cracked':     { floor: ['flagstones heaved by roots', 'packed earth and broken slabs'], walls: ['stone split by thick roots', 'masonry threaded with pale roots'] },
  'Fey-Wrought':      { floor: ['seamless pearl-grey stone', 'stone patterned like ripples'], walls: ['stone that shimmers faintly', 'walls carved in impossible knotwork'] },
  'Earthen and Turf': { floor: ['packed earth', 'beaten earth strewn with rushes'], walls: ['turf over timber', 'packed earth shored with posts'] },
  'Bog-Timber':       { floor: ['black bog-oak planks', 'warped timber boards over mud'], walls: ['black bog-oak', 'tarred timber, sweating damp'] },
  'Fomorian-Cut':     { floor: ['huge rough slabs', 'oversized steps and slabs'], walls: ['giant-cut blocks', 'massive crude masonry'] },
  'Wyrd-Inscribed':   { floor: ['stone cut with spiralling script', 'slabs carved with runes'], walls: ['stone covered in wyrd-script', 'rune-cut stone'] },
};
const CAVE = { floor: ['uneven rock', 'rock slick with damp', 'loose scree over rock'], walls: ['bare rock, wet in places', 'raw rock, glittering with mica', 'rock streaked with old mineral'] };

// { ceiling, floor, walls } for a room: the architecture's materials, a
// ceiling fitted to the room's shape and size.
export function fabricFor(room, d, rand = Math.random) {
  const m = room.roomType === 'cavern' ? CAVE : FABRIC[d?.architecture] ?? FABRIC.Human;
  const w = room.roomSize?.width ?? 20, l = room.roomSize?.length ?? 20, area = w * l;
  const ceiling = room.roomType === 'corridor' ? `${pick([8, 10, 10, 12], rand)} ft, ${pick(['flat', 'arched', 'barrel-vaulted'], rand)}`
    // A cave's roof rises with its size: a pocket is low, a great cavern soars.
    : room.roomType === 'cavern' ? (() => {
        const lo = pick(area >= 1200 ? [12, 15, 20] : [6, 8, 10], rand);
        return `${lo}–${lo + pick(area >= 1200 ? [15, 20, 30] : area >= 500 ? [6, 10, 15] : [4, 6, 8], rand)} ft, uneven`;
      })()
    : area >= 1200 ? `${pick([20, 25, 30], rand)} ft, ${pick(['vaulted', 'domed', 'ribbed and vaulted'], rand)}`
    : area >= 500 ? `${pick([12, 15, 15, 20], rand)} ft, ${pick(['vaulted', 'flat, beamed', 'arched'], rand)}`
    : `${pick([10, 10, 12], rand)} ft, ${pick(['flat', 'low-arched', 'beamed'], rand)}`;
  return { ceiling, floor: pick(m.floor, rand), walls: pick(m.walls, rand) };
}

const HAZARD_AIR = [
  [/bad air|gas|fume|spore|choking|vapou?r/i, 'stale and foul; flames burn low'],
  [/heat|fire|flame|lava|magma|steam|scald/i, 'hot and dry'],
  [/cold|frost|ice|freez/i, 'bitterly cold'],
  [/water|flood|drown|damp|acid|seep|brine/i, 'damp, with standing water'],
];

// The air in a room: temperature, damp, draught, from what is in it.
export function airFor(room, d, rand = Math.random) {
  const haz = `${room.hazard ?? ''} ${room.obstacle ?? ''}`;
  const hazardAir = HAZARD_AIR.find(([re]) => re.test(haz))?.[1];
  if (hazardAir) return hazardAir;
  const parts = [];
  if (room._isEntrance) parts.push('fresh air drifting in from outside');
  else if (room.verticalExit) parts.push(`a draught ${room.verticalExit.dir === 'up' ? 'falling from above' : 'rising from below'}`);
  if (room.roomType === 'cavern') parts.push(pick(['cool and damp', 'clammy, with dripping water', 'cold and mineral-smelling'], rand));
  else if (/undead/.test(room.monster?.tags ?? '')) parts.push(pick(['cold and still', 'stale and cold'], rand));
  else if (/animal|beast|monstrosity/.test(room.monster?.tags ?? '')) parts.push('warm and musky');
  else if (!parts.length) parts.push(pick(['cool and still', 'dry and dusty', 'close and stale', 'cool, with a faint draught'], rand));
  return parts.join(', ');
}

// What lies beyond an exit, as the party would sense it from this side: a
// sound, a smell, light or air. Traps are never given away.
const SOUND_BY_TAG = [
  [/undead/, m => /skeleton/i.test(m.name) ? 'the dry rattle of bones' : 'slow shuffling, and a cold, rotten smell'],
  [/ooze/, () => 'a wet, sliding sound and an acrid smell'],
  [/insect/, () => 'clicking and chittering'],
  [/construct/, () => 'a slow grinding, like stone on stone'],
  [/fiend/, () => 'a whiff of sulphur'],
  [/aberration/, () => 'a wet whispering that never quite forms words'],
  [/plant|fungus/, () => 'a sweet, rotten smell'],
  [/animal|beast|monstrosity/, () => 'low growling and a musky smell'],
  [/humanoid|giant/, (m, n) => n > 1 ? 'voices, and the scrape of boots' : 'someone moving about'],
];

// A trap room reads like any quiet room — a door with no clue at all would
// itself be the tell. A secret door, once found, is listened at like any other.
export function exitClue(target) {
  if (!target) return null;
  const m = target.contentType === 'trap' ? null : target.monster;
  if (m?.name) {
    if (/sleep|dormant|lurking/i.test(target.activity ?? '') || (target._gestalt ?? []).some(g => /dormant/.test(g.role))) return 'slow breathing, and nothing else';
    const tag = SOUND_BY_TAG.find(([re]) => re.test(m.tags ?? ''));
    return tag ? tag[1](m, target.count ?? 1) : 'movement';
  }
  if (target.contentType === 'npc') return 'someone moving about; a voice now and then';
  const haz = `${target.hazard ?? ''} ${target.obstacle ?? ''}`;
  const air = HAZARD_AIR.find(([re]) => re.test(haz));
  if (air) return { 'stale and foul; flames burn low': 'foul air seeping under the door', 'hot and dry': 'heat on your face', 'bitterly cold': 'a bitter draught', 'damp, with standing water': 'dripping water and a damp smell' }[air[1]];
  if (target.contentType === 'special') return 'a faint glow';
  if (target.contentType === 'weird') return 'a sound you can\'t place';
  if (target.verticalExit) return 'a draught';
  if (target._isEntrance) return 'fresh air from outside';
  // A quiet room still has air: damp, a chill, a draught, dust.
  const quiet = [[/drip|damp|standing water|wet/, 'quiet, and the sound of dripping water'], [/cold|chill/, 'quiet, and a chill under the door'],
    [/draught|draft/, 'a faint draught'], [/dust|dry/, 'silence, and a smell of dust'], [/stale|close/, 'silence, and stale air']];
  return quiet.find(([re]) => re.test(target.air ?? ''))?.[1] ?? 'silence';
}
