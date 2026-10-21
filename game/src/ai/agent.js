// Agent interface (prompt 05 §4.3) and the shared macro executor.
//
//   const a = new SomeAgent({ side, seed, level, budgetMs, budget, reactionFrames, mistakeRate });
//   a.reset(view)            new round
//   a.act(view, frame) -> BTN bitmask for this frame (called once per simulation frame)
//   a.thinking()             data for the on-screen overlay (cheap; never affects the sim)
//
// `view` is a read-only snapshot `age` frames old with the opponent's inputs wiped (view.js). The base class:
//  1. extrapolates the view to "now" by stepping a clone forward with the inputs THIS agent sent in the meantime (it knows
//     them) and a guess for the opponent made only from what is visible (a walking fighter keeps walking, a guarding one
//     keeps guarding). That is search on the snapshot, not peeking.
//  2. runs the macro executor: while a program is running it emits its bits; at a decision point it calls
//     `this.decide(now)` (implemented by each algorithm) and, with probability `mistakeRate`, replaces the choice with a
//     random legal macro (difficulty).
// Budgets: `budget = { nodes } | { rollouts } | { ms }`. Node / rollout budgets are deterministic (benchmark mode).
import { BTN, FREE_STATES } from '../sim.js';
import { Rng } from './rng.js';
import { macroSet, startProgram, emit, atDecision, legalMacros, programDone } from './macros.js';

const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
const INTERRUPTIBLE = new Set(['wait', 'move', 'guard']);

/** a visible-state guess of the opponent's held buttons (used only to extrapolate a delayed view) */
export function guessOpponentBits(sim, side) {
  const o = sim.f[1 - side];
  const fwd = o.facing > 0 ? BTN.R : BTN.L, back = o.facing > 0 ? BTN.L : BTN.R;
  switch (o.state) {
    case 'walk': return o.vx * o.facing > 0 ? fwd : back;
    case 'run': return fwd;
    case 'guard': case 'blockstun': return o.crouchGuard ? BTN.B | BTN.D : (o.state === 'guard' ? BTN.B : 0);
    case 'crouch': return BTN.D;
    default: return 0;
  }
}

export class Agent {
  constructor(opts = {}) {
    const { side = 0, seed = 1, level = null, budgetMs = 16, budget = null, reactionFrames = 0, mistakeRate = 0 } = opts;
    this.opts = opts;
    this.side = side; this.seed = seed; this.level = level;
    this.budget = budget || { ms: budgetMs };
    this.reactionFrames = reactionFrames; this.mistakeRate = mistakeRate;
    this.rng = new Rng(seed);
    this.prog = null; this.sent = []; // own inputs of the last frames (for extrapolation)
    this.stats = { decisions: 0, ms: [], work: [], mistakes: 0 };
    this._think = null; this.intent = null;
    this.name = 'agent';
  }
  reset(view) { this.prog = null; this.sent = []; this.intent = null; }

  /** extrapolate the delayed view to the current frame (see the header) */
  extrapolate(view, age) {
    if (!age) return view;
    const s = view.clone();
    const inp = [0, 0];
    const mine = this.sent.slice(-age);
    for (let i = 0; i < age; i++) {
      inp[this.side] = mine[i] ?? 0;
      inp[1 - this.side] = guessOpponentBits(s, this.side);
      s.step(inp);
    }
    return s;
  }

  act(view, frame, age = this.reactionFrames) {
    let bits;
    // reaction interrupt: a walk / wait / guard program is dropped when the (delayed) view shows the opponent STARTING an
    // attack, so the agent can answer it (guard, parry, kawarimi) instead of finishing an 8-frame step blind. The view is
    // still `age` frames old: this is reacting, not peeking.
    if (this.prog && !programDone(this.prog) && INTERRUPTIBLE.has(this.prog.m.kind) && !this.prog.m.air && this.prog.i >= 2) {
      const op = view.f[1 - this.side], me = view.f[this.side];
      const key = op.move + ':' + (view.frame - op.t); // one interrupt per attack (keyed by its start frame)
      if (op.state === 'attack' && op.t <= 2 && key !== this.lastSeenAttack && FREE_STATES.has(me.state) && me.h === 0) { this.lastSeenAttack = key; this.prog = null; }
    }
    if (this.prog && !programDone(this.prog)) bits = emit(this.prog);
    else {
      const cur = this.extrapolate(view, Math.min(age, this.sent.length));
      if (atDecision(cur, this.side, this.prog)) {
        const t0 = now();
        let m = this.decide(cur);
        const dt = now() - t0;
        if (m.kind !== 'think' && this.mistakeRate > 0 && this.rng.next() < this.mistakeRate) { m = this.rng.pick(legalMacros(cur, this.side)); this.stats.mistakes++; if (this._think) this._think.mistake = m.id; }
        this.prog = startProgram(m, cur.f[this.side].facing);
        if (m.kind !== 'think') { // a WorkerAgent's placeholder while the worker is still searching
          this.stats.decisions++; this.stats.ms.push(dt); this.stats.work.push(this.lastWork || 0);
          this.intent = { text: this.intentText(m, cur), frame, macro: m.id };
        }
        bits = emit(this.prog);
      } else bits = this.prog ? emit(this.prog) : 0; // committed: the program's stick bits (guard keeps holding B)
    }
    // wake-up guard: knocked down / getting up -> hold guard (the get-up then ends in guard, see sim 'wake')
    const st = view.f[this.side].state;
    if (st === 'down' || st === 'wake' || st === 'knock') bits |= BTN.B;
    if (this.emergency(view)) bits = (bits & ~BTN.P) | BTN.B | BTN.P; // repel / kawarimi escape out of a sticky situation (press: P edge)
    this.sent.push(bits);
    if (this.sent.length > 64) this.sent.splice(0, this.sent.length - 64);
    return bits;
  }

  /**
   * escape reflex (any algorithm, any state): a character with a repel uses it when cornered by pressure it cannot act out
   * of: getting up with the opponent on top of it, a guard gauge about to break, or a long combo. Visible state only.
   */
  emergency(view) {
    const me = view.f[this.side], op = view.f[1 - this.side], ch = view.C(me), M = ch.moves;
    // the character's escape: the Samurai's repel, or the Shinobi's kawarimi escape (same button, same 25 meter)
    const esc = M.repel ? { cost: M.repel.cost, cd: me.repelCd, range: M.repel.repel.range, busy: me.move === 'repel' }
      : M.kawa_escape ? { cost: M.kawarimi.cost, cd: me.kawaCd, range: 900, busy: me.move === 'kawa_escape' || me.move === 'kawarimi' } : null;
    if (!esc || esc.cd > 0 || me.meter < esc.cost || me.ko || (me.state === 'attack' && esc.busy)) { this.escArm = 0; return false; }
    const near = Math.abs(op.x - me.x) < esc.range - 150 && op.state !== 'down' && op.state !== 'knock';
    const sticky = near && ((me.state === 'wake' && me.t >= 8) || (me.state === 'blockstun' && me.guard > 65) || (me.state === 'hitstun' && me.combo >= 3));
    if (!sticky) { this.escArm = 0; return false; }
    if (this.escArm === 0) this.escArm = this.rng.next() < 0.6 ? 1 : -1; // decided once per situation (not every frame)
    if (this.escArm < 0) return false;
    this.escArm = 2; return (this.sent.at(-1) & BTN.P) === 0; // press edge
  }

  /** subclasses: return a macro object from macroSet(char).list */
  decide(sim) { return macroSet(sim.C(sim.f[this.side])).byId.wait; }
  thinking() { return this._think; }

  /** short label for the head-up intent bubble, e.g. "PUNISH: heavy" */
  intentText(m, sim) {
    const me = sim.f[this.side], op = sim.f[1 - this.side];
    const opPh = op.state === 'attack' ? 'att' : '';
    if (m.kind === 'ult') return 'ULTIMATE';
    if (m.kind === 'parry') return m.id.includes('thrust') ? 'PARRY → THRUST' : 'PARRY';
    if (m.kind === 'dodge') return 'DODGE: ' + m.id.replace('_', ' ');
    if (m.kind === 'counter') return 'KAWARIMI (read)';
    if (m.kind === 'escape') return 'REPEL';
    if (m.id === 'chain') return 'CHAIN: iai → thrust → cleave';
    if (m.kind === 'attack') {
      const om = op.state === 'attack' ? sim.C(op).moves[op.move] : null;
      if (om && om.active && op.t >= om.active[1]) return 'PUNISH: ' + m.id;
      if (op.state === 'hitstun' || op.state === 'blockstun') return 'PRESS: ' + m.id;
      return 'POKE: ' + m.id;
    }
    if (m.kind === 'guard') return opPh ? 'DEFEND: guard' : 'GUARD';
    if (m.id === 'walk_back' || m.id === 'dash_back') return 'SPACE: ' + m.id.replace('_', ' ');
    if (m.id === 'walk_fwd' || m.id === 'dash_fwd') return 'APPROACH: ' + m.id.replace('_', ' ');
    void me;
    return 'WAIT';
  }

  /** budget helpers for search loops */
  startBudget() { this._t0 = now(); this._work = 0; }
  spend(n = 1) { this._work += n; }
  outOfBudget() {
    const b = this.budget;
    if (b.nodes !== undefined) return this._work >= b.nodes;
    if (b.rollouts !== undefined) return this._work >= b.rollouts;
    return now() - this._t0 >= (b.ms ?? 16);
  }
}
