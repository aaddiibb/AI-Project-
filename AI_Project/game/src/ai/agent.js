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
import { BTN } from '../sim.js';
import { Rng } from './rng.js';
import { macroSet, startProgram, emit, atDecision, legalMacros, programDone } from './macros.js';

const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

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
    this.sent.push(bits);
    if (this.sent.length > 64) this.sent.splice(0, this.sent.length - 64);
    return bits;
  }

  /** subclasses: return a macro object from macroSet(char).list */
  decide(sim) { return macroSet(sim.C(sim.f[this.side])).byId.wait; }
  thinking() { return this._think; }

  /** short label for the head-up intent bubble, e.g. "PUNISH: heavy" */
  intentText(m, sim) {
    const me = sim.f[this.side], op = sim.f[1 - this.side];
    const opPh = op.state === 'attack' ? 'att' : '';
    if (m.kind === 'ult') return 'ULTIMATE';
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
