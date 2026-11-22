// Speculative ("pipelined") thinking for the Master level.
//
// Master searches 3x longer than Hard, which in the browser has to happen in a Web Worker (a 50 ms search on the main
// thread would drop frames). The naive way, asking the worker at the decision point and standing still until it answers,
// costs ~3 frames of dead time on EVERY decision, and against a Hard opponent that lag loses every match (measured:
// 0 / 4 vs Hard; 8 / 8 without the lag). So Master thinks one move ahead instead:
//
//   1. the moment a macro is chosen, predict the position at the NEXT decision point: play my program to its end with the
//      same opponent model the extrapolation uses (whatever the opponent visibly does, it keeps doing)
//   2. search that predicted position in the worker while the current macro plays out (most macros last 8-40 frames,
//      far longer than the 50 ms search)
//   3. at the decision point, if the real position matches the prediction (same states, no hit landed, positions within a
//      few units) the answer is used at once: a Master-quality move with zero delay
//   4. otherwise (the opponent did something new, an interrupt, a hit) decide immediately on the main thread with a
//      Hard-sized budget, so Master is never slower and never worse than Hard
//
// Pure functions; used by remote.js (browser, real worker) and tools/arena.mjs (Node, emulated latency).
import { guessOpponentBits } from './agent.js';
import { copyProgram, emit, atDecision } from './macros.js';
import { BTN } from '../sim.js';

// What the opponent might do while my macro plays out, most likely first. The worker searches them in this order for as
// long as the macro lasts (each with the full Master budget); at the decision point the one that came true is used.
// (A single "keeps doing what it does" guess held for ~85 % of decisions against Minimax but ~20 % against MCTS, whose
// choices are far less predictable.)
const toward = (s, side) => (s.f[1 - side].facing > 0 ? BTN.R : BTN.L);
export const OPPONENT_GUESSES = [
  (s, side) => guessOpponentBits(s, side),          // carries on
  () => 0,                                           // stops
  () => BTN.B,                                       // guards
  (s, side) => toward(s, side),                      // walks in
  (s, side) => (toward(s, side) === BTN.R ? BTN.L : BTN.R), // backs off
  () => BTN.D,                                       // crouches (masked for a fighter who cannot)
];

/** the position at my next decision point if my program `prog` (just started, i = 0) plays out from `sim` while the
 *  opponent follows `guess` */
export function predictNext(sim, side, prog, guess = OPPONENT_GUESSES[0], cap = 90) {
  const s = sim.clone(), p = copyProgram(prog), inp = [0, 0];
  let n = 0;
  do {
    inp[side] = emit(p);
    inp[1 - side] = guess(s, side);
    s.step(inp); n++;
    if (s.f[0].ko || s.f[1].ko) return null;
  } while (n < cap && !atDecision(s, side, p));
  return n < cap ? { sim: s, frames: n } : null;
}

/** all distinct predicted next decision positions, most likely first (duplicates by snapshot dropped) */
export function predictAll(sim, side, prog, max = OPPONENT_GUESSES.length) {
  const out = [], seen = new Set();
  for (const g of OPPONENT_GUESSES.slice(0, max)) {
    const p = predictNext(sim, side, prog, g); if (!p) continue;
    const snap = snapshot(p.sim, side), key = JSON.stringify(snap);
    if (seen.has(key)) continue;
    seen.add(key); out.push({ sim: p.sim, snap, frames: p.frames });
  }
  return out;
}

/** what has to agree between the predicted and the real decision position for a speculative answer to stand */
// (free states compare equal: an idle and a walking opponent at the same spot call for the same answer; the move name only
// matters while the opponent is attacking, otherwise it is a leftover of an earlier attack)
const FREE = new Set(['idle', 'walk']);
const st = (f) => (FREE.has(f.state) ? 'free' : f.state);
export function snapshot(sim, side) {
  const me = sim.f[side], op = sim.f[1 - side], atk = op.state === 'attack';
  return { me: [st(me), me.x, me.h, me.hp, me.meter >= 100], op: [st(op), atk ? op.move : '', op.x, op.h, op.hp, atk ? op.t : 0], proj: sim.projectiles.length };
}
/** diagnostics: the first field that makes a prediction stale (null = still valid) */
export function whyStale(a, b, tolX = 60) {
  if (!a || !b) return 'none';
  const n = ['me.state', 'me.x', 'me.h', 'me.hp', 'me.full'], o = ['op.state', 'op.move', 'op.x', 'op.h', 'op.hp', 'op.t'];
  const tol = [0, tolX, 30, 0, 0], tolO = [0, 0, tolX, 40, 0, 3];
  for (let i = 0; i < 5; i++) if (typeof a.me[i] === 'number' ? Math.abs(a.me[i] - b.me[i]) > tol[i] : a.me[i] !== b.me[i]) return n[i];
  for (let i = 0; i < 6; i++) if (typeof a.op[i] === 'number' ? Math.abs(a.op[i] - b.op[i]) > tolO[i] : a.op[i] !== b.op[i]) return o[i];
  return a.proj === b.proj ? null : 'proj';
}
export function stillValid(a, b, tolX = 60) {
  if (!a || !b) return false;
  return a.me[0] === b.me[0] && Math.abs(a.me[1] - b.me[1]) <= tolX && Math.abs(a.me[2] - b.me[2]) <= 30 && a.me[3] === b.me[3] && a.me[4] === b.me[4]
    && a.op[0] === b.op[0] && a.op[1] === b.op[1] && Math.abs(a.op[2] - b.op[2]) <= tolX && Math.abs(a.op[3] - b.op[3]) <= 40 && a.op[4] === b.op[4]
    && Math.abs(a.op[5] - b.op[5]) <= 3 && a.proj === b.proj;
}
