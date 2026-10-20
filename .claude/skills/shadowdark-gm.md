# Shadowdark GM — running a playtest of a generated module

Use when running a playtest of a generated module as the Game Master, with players as separate
agents (or a human). The rules below come from the Shadowdark Player and GM Quickstarts
(text in `temp/Shadowdark * Quickstart - Digital.txt`; search them, don't reread them whole).
**Lessons from coaching** at the end override anything above them.

## The GM's role: be the world

Present the world and let the players live in it. You are a neutral arbiter, not an author:
- Describe what is there, play the creatures and NPCs as they would act, and rule fairly on what
  the players try. The players decide where to go and what to do.
- Never direct the action or railroad: no nudging toward the "right" room, no saving a plan the
  players didn't make, no softening a consequence they walked into, no punishing a choice for
  being unexpected.
- Hooks, rumors and clues are offers, not paths. Put them in front of the players and see what
  they do with them; skipping a hook is a choice too.
- When the players go somewhere the module didn't plan for, the world still answers: rule from
  what the module establishes, and note the gap in the GM note.
- Neutral means neutral both ways: the dungeon is as dangerous as written, and the dice fall
  where they fall.

## Setup

- Read the module from its `.md`, never the PDF, and skip the embedded map images:
  `grep -v '^<img' <module>.md`. The human reads the web page: `npm run module-pdf -- <module>.md <module>.html`.
- Playtest files live in `playtest/<module>/` (never committed): `party.md` (character sheets),
  `rolls.log`, `transcript.md`, `state.md` (the GM's running notes: light timer, encounter-check
  count, disturbances, HP, spent spells, what has changed in the dungeon).
- Every roll goes through `node cli/roll.mjs --log=playtest/<module>/rolls.log --why="who: what" <dice>`.
  Never invent a result. Put the roll line in the transcript.

## Players

- Each player is its own agent and sees only: their character sheet, what the GM has described,
  and what the party has found. Never the module text, room numbers, or the GM's notes.
- Ask the players what they do; don't decide for them. A player may ask questions — answer as the
  world would, freely (see Information).

## The loop (one post per room or scene)

1. **Describe** the boxed opening of the room as written (what the party perceives), plus what
   the party's light shows. Not the bullets: they're the GM's.
2. **Ask** what each character does.
3. **Resolve** each action. Roll only when failure matters and there's time pressure; a character
   trained in the task, or searching the right spot, simply succeeds.
4. **GM turn**: count down timers, check for an encounter if due, move creatures and effects,
   then describe what the party notices.
5. **Post** the transcript for the scene, the rolls, and a short GM note: what the module said,
   what you ruled where it was silent, and anything in the module that made the scene hard to run.
6. **Wait** for feedback before the next scene.

## Rules in brief (Quickstart)

- **Checks:** d20 + stat mod vs DC 9 (easy) / 12 (normal) / 15 (hard) / 18 (extreme). Advantage
  and disadvantage: roll twice, keep the better or worse; they cancel. Natural 20 succeeds at
  maximum (a crit on attacks and spells); natural 1 fails at maximum.
- **d6 decider:** for a random chance (does the dropped torch go out?), 1–3 is the worse outcome.
- **Contested:** both roll the relevant stat; highest wins, reroll ties.
- **Information:** dispense it freely. Testing the floor where a trap is finds the trap.
  Social scenes run on what the players say, not on CHA checks.
- **Distances:** close 5 ft, near up to 30 ft, far within sight. A turn is one action and a move
  of near (or two moves and no action).
- **Light:** a torch or lantern lasts one hour of real time; in play-by-post, one hour is 10
  rounds. One light timer at a time; a new light rides on the current timer. Outside the light is
  total darkness: disadvantage on most tasks, and an encounter check every crawling round.
- **Encounter checks:** during crawling rounds by danger level — Unsafe every 3 rounds, Risky
  every 2, Deadly every round — a 1 on a d6 is an encounter; also after a loud disturbance. The
  module's own table and omen rule apply (doubles on an omen row bring the omen first).
  Starting distance 1d6: 1 close, 2–4 near, 5–6 far. Activity 2d6: 2–4 hunting, 5–6 eating,
  7–8 building/nesting, 9–10 socializing, 11 guarding, 12 sleeping.
- **Reaction** (when not obvious): 2d6 + the speaker's CHA mod: 0–6 hostile, 7–8 suspicious,
  9 neutral, 10–11 curious, 12+ friendly. Undead are always hostile.
- **Surprise:** an undetected creature gets one turn before initiative and advantage against
  surprised targets. Hiding and sneaking: DEX checks; spotting: WIS, or automatic when looking in
  the right place.
- **Initiative:** each PC rolls d20 + DEX; the GM rolls once with the monsters' best DEX mod.
- **Attacks:** melee d20 + STR + bonuses, ranged d20 + DEX + bonuses, vs AC. Crit doubles the
  weapon dice. Morale: a group at half its numbers (a solo creature at half HP) flees on a
  failed DC 15 WIS check.
- **Spells:** d20 + INT (wizard) or WIS (priest) vs 10 + tier. A failed spell can't be cast again
  until a rest. A natural 20 doubles one numeric effect.
- **Dying:** at 0 HP, unconscious; roll 1d4 + CON mod (min 1) for rounds until death. Each later
  turn, a natural 20 on d20 rises with 1 HP. Stabilize: DC 15 INT at close range.
- **Climbing** STR or DEX for half speed, fall on a miss by 5+. **Falling** 1d6 per 10 ft.
  **Swimming** STR for half speed, CON to hold breath; failing, 1d6 a round.
- **Resting:** a ration and 8 hours restores all HP and non-permanent stat damage. In a dangerous
  place, check for encounters by hours (Unsafe every 3, Risky 2, Deadly 1); each stressful
  interruption needs DC 12 CON or the rest is lost. Three torches make an 8-hour campfire.
- **XP:** treasure by quality — poor 0, normal 1, fabulous 3, legendary 10 — each PC gets the full
  value; +1 for ingenious actions. Level up at level × 10 XP.
- **Luck tokens:** one per player at most; spend to reroll. Grim sessions give about one each.

## Transcript format

```
### Scene N — <where> (crawling round R, torch T/10, checks C)

**GM:** <description>

**Drago:** <action> · **Mirena:** <action> · ...

`roll: Mirena: DC 12 DEX, the tripwire — d20adv: [7, 17] keeps 17 = 17 +4 = 21`

**GM:** <outcome>

> GM note: <what the module said / what I ruled / what was hard to run>
```

## Lessons from coaching

(Add each correction from the human GM coach here, newest last, with the scene it came from.)
- **Light timing (setup, Cinderstacks):** the coach has no fixed rule ("pick one and adjust if
  it feels too tight"). Use the Quickstart's: a torch or lantern flask lasts 10 crawling rounds.
  If light starts deciding everything, loosen it and say so in a GM note.
