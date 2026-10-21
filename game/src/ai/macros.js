// Macro-actions (prompt 05 §4.4), shared by every agent and by the search code.
//
// A macro is a short committed input program: `first` bits on its first frame, then `hold` bits until `len` frames have
// been emitted. Bits are written relative to facing (FWD / BACK) and resolved with the facing at the moment the macro
// starts. Agents search and choose over macros, never over raw buttons (MOVESET §8).
//
// Decision points: a side may choose a new macro when its program has finished AND its fighter is free (idle / walk /
// guard; FREE_STATES). While committed (attack, dash, hitstun, blockstun, knockdown...) there is exactly one action,
// "continue": the program's `stick` bits (a guard keeps holding B through blockstun, everything else is neutral).
//
// `taps` = { frame: bits } extra presses at given frames of the program (chains, timed parries). Situational macros
// (`when: 'projectile'`) are only legal while an opponent projectile is on its way: the timed parries (tap guard now /
// in 3 / in 6 frames, optionally followed by the stepping thrust), crouch / neutral jump (dodge the high / low wave) and a
// 3-frame wait (fine timing for a dash through the tall wave). Keeping them situational keeps the branching factor low.
import { BTN, FREE_STATES } from '../sim.js';
import { WORLD } from '../characters/common.js';
import { moveReach, projEta, parryable, phase } from './features.js';

export const FWD = 1 << 20, BACK = 1 << 21;
const { U, D, P, K, S, T, B, DASH, ULT } = BTN;

/** resolve FWD / BACK into screen bits for a facing */
export function resolve(bits, facing) {
  let b = bits & ~(FWD | BACK);
  if (bits & FWD) b |= facing > 0 ? BTN.R : BTN.L;
  if (bits & BACK) b |= facing > 0 ? BTN.L : BTN.R;
  return b;
}

const mk = (id, kind, first, hold, len, extra = {}) => ({ id, kind, first, hold, len, stick: 0, ...extra });
/** timed parry: tap guard at frame k (the window is ~5 frames before impact); +thrust: K once the parry has landed */
const parryMacro = (k, thrust) => mk(`parry${thrust ? '_thrust' : ''}_${k}`, 'parry', k === 0 ? B : 0, 0, k + (thrust ? 12 : 6),
  { taps: { ...(k ? { [k]: B } : {}), ...(thrust ? { [k + 5]: K } : {}) }, when: 'projectile', move: thrust ? 'thrust' : null, tapAt: k });
const SITUATIONAL = (extra = []) => [mk('wait_short', 'wait', 0, 0, 3, { when: 'projectile' }), ...extra];

const cache = new Map();
/** the macro set of a character (cached per character id). Each macro gets a small integer `idx` (unique per set). */
export function macroSet(char) {
  if (cache.has(char.id)) return cache.get(char.id);
  const P_ = char.phys, M = char.moves;
  let list;
  if (char.id === 'samurai') {
    list = [
      mk('wait', 'wait', 0, 0, 8),
      mk('walk_fwd', 'move', FWD, FWD, 8),
      mk('walk_back', 'move', BACK, BACK, 8),
      mk('dash_fwd', 'move', DASH, 0, P_.dashTotal),
      mk('dash_back', 'move', DASH | BACK, 0, P_.backdashTotal),
      mk('guard', 'guard', B, B, 8, { stick: B }),
      mk('light', 'attack', P, 0, M.light.total, { move: 'light' }),
      mk('thrust', 'attack', K, 0, M.thrust.total, { move: 'thrust' }),       // stepping thrust: the gap closer
      mk('heavy', 'attack', S, 0, M.heavy.total, { move: 'heavy' }),
      // iai cut -> thrust -> cleave: the follow-ups only cancel on contact, so a whiffed chain is just the iai cut
      mk('chain', 'attack', P, 0, 30, { move: 'light', taps: { 9: K, 24: S } }),
      mk('ult', 'ult', ULT, 0, M.ult.total, { move: 'ult' }),
      mk('repel', 'escape', B | P, 0, M.repel.total, { move: 'repel' }), // shove the opponent away (25 meter)
      ...SITUATIONAL([parryMacro(0), parryMacro(3), parryMacro(6), parryMacro(0, true), parryMacro(3, true), parryMacro(6, true)]),
    ];
  } else {
    // Shinobi (used for mixed matches, optional extension §9): a compact set over his larger moveset
    list = [
      mk('wait', 'wait', 0, 0, 8),
      mk('walk_fwd', 'move', FWD, FWD, 8),
      mk('walk_back', 'move', BACK, BACK, 8),
      mk('dash_fwd', 'move', DASH, 0, P_.dashTotal ?? 25),
      mk('dash_back', 'move', DASH | BACK, 0, 30),
      mk('guard', 'guard', B, B, 8, { stick: B }),
      mk('crouch_guard', 'guard', B | D, B | D, 8, { stick: B | D }),
      mk('light', 'attack', P, 0, M.stab.total, { move: 'stab' }),
      mk('kick', 'attack', K, 0, M.kick.total, { move: 'kick' }),
      mk('heavy', 'attack', S, 0, M.slash.total, { move: 'slash' }),
      mk('throw', 'attack', T, 0, M.throw.total, { move: 'throw' }),
      mk('low_light', 'attack', D | P, D, M.crouch_stab.total, { move: 'crouch_stab' }),
      mk('sweep', 'attack', D | K, D, M.sweep.total, { move: 'sweep' }),
      mk('jump_in', 'move', U | FWD, U | FWD, 14, { air: true }),
      mk('ult', 'ult', ULT, 0, M.ult.total, { move: 'ult' }),
      // kawarimi stance (guard + light): a read on the opponent's next swing; legal only off cooldown and in his reach
      mk('kawarimi', 'counter', B | P, 0, M.kawarimi.total, { move: 'kawarimi' }),
      // dodges: duck under a high wave / a thrown kunai, neutral jump over a low wave (dash_fwd goes through the tall one)
      ...SITUATIONAL([mk('crouch', 'dodge', D, D, 4, { when: 'projectile', stick: D }), mk('jump_up', 'dodge', U, U, 14, { when: 'projectile', air: true })]),
    ];
  }
  list.forEach((m, i) => { m.idx = i; m.reach = m.move && M[m.move] && (M[m.move].box || M[m.move].projectile || M[m.move].fan || M[m.move].waves || M[m.move].clones) ? moveReach(M[m.move]) : 0; });
  const set = { list, byId: Object.fromEntries(list.map((m) => [m.id, m])) };
  cache.set(char.id, set);
  return set;
}

/** can this fighter start (or is it already in) an attack within the next few frames? */
const THREAT_STATES = new Set(['idle', 'walk', 'guard', 'crouch', 'run', 'runstop', 'dash', 'prejump', 'air', 'land']);
function canThreaten(sim, f) {
  if (THREAT_STATES.has(f.state)) return true;
  return f.state === 'attack' && (phase(sim, f) === 'startup' || phase(sim, f) === 'active');
}
/** the longest melee reach of a character (body centre to hitbox tip): how close counters / guards need to be */
const reachCache = new Map();
function maxReach(ch) {
  if (!reachCache.has(ch.id)) reachCache.set(ch.id, Math.max(...Object.values(ch.moves).filter((m) => m.box && !m.air).map((m) => moveReach(m))));
  return reachCache.get(ch.id);
}

// ------------------------------------------------------------------ programs
/** a running macro: { m, i (frames emitted), facing } — tiny, cheap to copy inside search */
export const startProgram = (m, facing) => ({ m, i: 0, facing });
export const copyProgram = (p) => (p ? { m: p.m, i: p.i, facing: p.facing } : null);
export const programDone = (p) => !p || p.i >= p.m.len;
/** bits for this frame (advances the program) */
export function emit(p) {
  if (!p) return 0;
  if (p.i >= p.m.len) return resolve(p.m.stick, p.facing);
  const b = (p.i === 0 ? p.m.first : p.m.hold) | (p.m.taps?.[p.i] || 0);
  p.i++;
  return resolve(b, p.facing);
}
/** may this side choose a new macro now? */
export function atDecision(sim, side, prog) {
  return programDone(prog) && FREE_STATES.has(sim.f[side].state) && sim.f[side].h === 0;
}

// ------------------------------------------------------------------ legality filter
/**
 * Legal macros for `side` in `sim`: prunes pointless ones (attacks far outside the move's measured reach plus one dash,
 * the ultimate without meter or out of its range, retreating into the wall).
 */
export function legalMacros(sim, side) {
  const me = sim.f[side], op = sim.f[1 - side], ch = sim.C(me), set = macroSet(ch);
  const dist = Math.abs(op.x - me.x);
  const O = sim.C(op);
  const gap = dist - O.hurt.stand.x1;
  const dashLen = (ch.phys.dashV || 20) * (ch.phys.dashFrames || 14);
  const lo = WORLD.stageMargin, hi = WORLD.stageW - WORLD.stageMargin;
  const behind = op.x >= me.x ? me.x - lo : hi - me.x;
  // incoming opponent projectiles: the situational macros are legal only then (parries only vs parryable ones)
  let incoming = false, parryIn = false;
  for (const p of sim.projectiles) {
    if (p.owner === side || projEta(sim, p, me) > 24) continue;
    incoming = true; if (parryable(p)) parryIn = true;
  }
  // between two waves of an ultimate the next one is certain: crouch / wait stay available (parries need a real projectile)
  const om = op.state === 'attack' && op.move === 'ult' ? O.moves.ult : null;
  if (om && om.waves && op.t <= om.waves.at(-1).at) incoming = true;
  if (om && om.clones && op.t <= om.cloneEnd + 4) incoming = true; // Kage Bunshin: more clone attacks are certain
  const out = [];
  for (const m of set.list) {
    if (m.when === 'projectile' && (!incoming || (m.kind === 'parry' && !(parryIn && ch.can.parry)))) continue;
    // repel from neutral only under real pressure (guard gauge half full, cornered, or her swing coming); the escape reflex in
    // agent.js covers the stuck states (getting up, guard about to break, long combo)
    if (m.kind === 'escape' && (me.repelCd > 0 || me.meter < ch.moves.repel.cost || dist > ch.moves.repel.repel.range - 100 || !canThreaten(sim, op) ||
      !(me.guard >= 50 || behind < 350 || (op.state === 'attack' && dist < 700)))) continue;
    if (m.kind === 'parry' && me.parryCd > m.tapAt) continue; // the anti-mash cooldown would swallow the tap (own state: visible)
    // kawarimi: off cooldown, paid for, in his reach, and only while he can actually swing at me soon. Lying down / waking /
    // stunned / recovering opponents are no threat: there the long stance was being (ab)used as a 38-frame wait to time a
    // meaty on his wake-up (a depth-limited search artifact), wasting 50 meter.
    if (m.kind === 'counter' && (me.kawaCd > 0 || me.meter < (ch.moves.kawarimi.cost || 0) || dist > maxReach(O) + 250 || !canThreaten(sim, op))) continue;
    if (m.kind === 'attack' && gap > m.reach + dashLen) continue;
    if (m.kind === 'ult' && (me.meter < ch.moves.ult.cost || gap > m.reach + 200)) continue;
    if ((m.id === 'walk_back' || m.id === 'dash_back') && behind < 40) continue;
    out.push(m);
  }
  return out.length ? out : [set.byId.wait];
}

// ------------------------------------------------------------------ search-side playout
/** program state of a side that is not at a decision point and has no program (e.g. root opponent mid-move): a guess */
export function stickBits(sim, side) {
  const f = sim.f[side];
  if (f.state === 'down' || f.state === 'wake' || f.state === 'knock') return B; // wake-up guard
  if (f.state === 'blockstun' || f.state === 'guard') return f.crouchGuard ? B | D : B;
  return 0;
}

/**
 * Play both programs forward on `sim` (mutated) until either side reaches a decision point (after at least one frame),
 * a KO happens, or `cap` frames pass. Returns the number of frames stepped.
 * `progs` are mutated (copy them first inside search).
 */
export function playUntilDecision(sim, progs, cap = 40) {
  let n = 0;
  const inp = [0, 0];
  do {
    for (let s = 0; s < 2; s++) inp[s] = progs[s] ? emit(progs[s]) : stickBits(sim, s);
    sim.step(inp);
    n++;
    if (sim.f[0].ko || sim.f[1].ko) break;
  } while (n < cap && !atDecision(sim, 0, progs[0]) && !atDecision(sim, 1, progs[1]));
  return n;
}

/** "settle" (quiescence): finish both running programs (neutral afterwards) so a committed attack is valued by its outcome */
export function settle(sim, progs, cap = 40) {
  let n = 0;
  const inp = [0, 0];
  while (n < cap && !(sim.f[0].ko || sim.f[1].ko)) {
    const busy0 = progs[0] && !programDone(progs[0]), busy1 = progs[1] && !programDone(progs[1]);
    const free0 = FREE_STATES.has(sim.f[0].state), free1 = FREE_STATES.has(sim.f[1].state);
    if (!busy0 && !busy1 && free0 && free1 && sim.projectiles.length === 0) break;
    for (let s = 0; s < 2; s++) inp[s] = progs[s] ? emit(progs[s]) : stickBits(sim, s);
    sim.step(inp);
    n++;
  }
  return n;
}
