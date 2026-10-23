// One-way passages, hard and soft. A hard one admits no way back (a block
// slides shut, a gate seals); a soft one can be gone back through, slowly and
// at a risk (climbing back up a drop) — a commitment, not a wall. Exit types
// read "one-way: <form>"; this table gives each form its map label and, for a
// soft one, what going back costs.

export const ONE_WAYS = [
  // `far`: the same passage as it looks from the other end.
  { form: 'a stone block that slides shut behind', label: 'sliding block', far: 'a stone block, slid shut from the far side' },
  { form: 'a stone block that drops behind',       label: 'falling block', far: 'a stone block, dropped shut from the far side' },
  { form: 'a gate that seals once passed',         label: 'sealing gate', far: 'a gate sealed from the far side' },
  { form: 'a portal that works one way',           label: 'portal', far: 'a portal that does not answer from this side' },
  { form: 'a door that opens only from the far side', label: 'one-way door', far: 'a door with no handle on this side' },
  { form: 'a sheer 20 ft drop', label: 'drop', soft: true, far: 'the foot of a sheer 20 ft drop, a climb up',
    back: 'climbing back up takes 1 turn: DC 15 STR, or DC 9 with a rope left hanging' },
  { form: 'a water chute', label: 'chute', soft: true, far: 'the foot of a slick water chute, a climb up against the current',
    back: 'climbing the slick chute against the current takes 1 turn: DC 15 STR, and a failure slides the climber back down' },
  { form: 'a steep chute', label: 'chute', soft: true, far: 'the foot of a steep chute, a climb up',
    back: 'climbing back up the chute takes 1 turn: DC 15 STR, and a failure slides the climber back down' },
  { form: 'a way back that something deadly now guards', label: 'guarded', soft: true,
    back: 'going back means getting past what now guards it (see the room)' },
];

// { form, label, soft, back } for an exit type, or null if it is not one-way.
export function oneWayInfo(type = '') {
  if (!/one-way/.test(type)) return null;
  return ONE_WAYS.find(o => type.includes(o.form) || (o.far && type.includes(o.far))) ?? { form: type.replace(/^one-way:\s*/, ''), label: 'one-way' };
}

// The exit type for a one-way passage's far end: what it looks like from
// there, and what going back through it takes.
export function farSideType(type) {
  const o = oneWayInfo(type);
  return `one-way: ${o?.far ?? o?.form ?? type.replace(/^one-way:\s*/, '')} (${backThrough(type)})`;
}

// What the far side of a one-way passage says about going back through it.
export function backThrough(type) {
  const o = oneWayInfo(type);
  return o?.soft ? `the hard way back: ${o.back}` : 'cannot be passed from this side';
}
