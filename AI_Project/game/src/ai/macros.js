// Macro-actions (prompt 05 §4.4), shared by every agent and by the search code.
//
// A macro is a short committed input program: `first` bits on its first frame, then `hold` bits until `len` frames have
// been emitted. Bits are written relative to facing (FWD / BACK) and resolved with the facing at the moment the macro
// starts. Agents search and choose over macros, never over raw buttons (MOVESET §8).
//
// Decision points: a side may choose a new macro when its program has finished AND its fighter is free (idle / walk /
// guard; FREE_STATES). While committed (attack, dash, hitstun, blockstun, knockdown...) there is exactly one action,
// "continue": the program's `stick` bits (a guard keeps holding B through blockstun, everything else is neutral).
import { BTN, FREE_STATES } from '../sim.js';
import { WORLD } from '../characters/common.js';
import { moveReach } from './features.js';

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
      mk('heavy', 'attack', S, 0, M.heavy.total, { move: 'heavy' }),
      mk('ult', 'ult', ULT, 0, M.ult.total, { move: 'ult' }),
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
    ];
  }
  list.forEach((m, i) => { m.idx = i; m.reach = m.move ? moveReach(M[m.move]) : 0; });
  const set = { list, byId: Object.fromEntries(list.map((m) => [m.id, m])) };
  cache.set(char.id, set);
  return set;
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
  const b = p.i === 0 ? p.m.first : p.m.hold;
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
  const out = [];
  for (const m of set.list) {
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
