// Personal names for NPCs. Name lists that live on this machine only
// (dungeon/tables/*.local.txt, gitignored — e.g. lists from books you own)
// are used when present: a header line names a list, indented lines are its
// names. Without them, callers fall back to the generator's own tables.

const files = import.meta.glob('../../tables/*.local.txt', { query: '?raw', import: 'default', eager: true });

const LISTS = {};
for (const text of Object.values(files)) {
  let current = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('//')) continue;
    if (/^\S/.test(line)) LISTS[current = line.trim()] ??= [];
    else if (current) LISTS[current].push(line.trim());
  }
}

export const hasNameLists = Object.values(LISTS).some(l => l.length);

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
const from = (key, rand) => (LISTS[key]?.length ? pick(LISTS[key], rand) : null);

// A person's name by ancestry and sex ({ kindred, sex } as basicDetails gives
// them), or null if no list fits.
export function personalName({ kindred = 'Human', sex = null } = {}, rand = Math.random) {
  const female = sex ? sex === 'Female' : rand() < 0.5;
  switch (kindred) {
    case 'Dwarf': {
      const name = from('dwarfName', rand);
      const clan = rand() < 0.5 ? from('dwarfClanName', rand) : null;
      return name && clan ? `${name} ${clan}` : name;
    }
    case 'Elf':      return from('elfName', rand);
    case 'Halfling': return from('halflingName', rand);
    case 'Goblin':   return from('goblinName', rand);
    case 'Half-Orc': return from('orcName', rand);
    default:         return from(female ? 'humanFemaleName' : 'humanMaleName', rand);
  }
}

// A faction leader's name when the faction is a kind with names of its own
// (goblins, orcs, kobolds, dwarves), or null.
export function creatureName(creature, rand = Math.random) {
  const c = (creature ?? '').toLowerCase();
  if (/kobold/.test(c)) return from('koboldName', rand);
  if (/orc|gnoll/.test(c)) return from('orcName', rand);
  if (/goblin/.test(c)) return from('goblinName', rand);
  if (/dwar/.test(c)) return personalName({ kindred: 'Dwarf' }, rand);
  return null;
}
