// MctsAgent: Monte Carlo Tree Search for simultaneous moves (Lab 08), the Decoupled UCT variant (DUCT).
//
// Each tree node keeps SEPARATE statistics for the two players: N_i(a), W_i(a) for every macro a of player i. In
// selection both players pick independently with UCB1 over their own statistics,
//     a_i = argmax_a  W_i(a) / N_i(a) + c * sqrt( ln n / N_i(a) ),
// and the joint pair (a_0, a_1) indexes the child. Neither side "sees" the other's choice: that is what makes DUCT
// fit a simultaneous game (contrast with Minimax's pessimistic maximin, which lets the opponent reply to our move).
//
// The 4 phases:
//   1. Selection   descend with decoupled UCB1 while the joint child exists
//   2. Expansion   create the missing joint child (clone + both macros played to the next decision point)
//   3. Simulation  a rollout of `rolloutFrames` (60-120) frames with a light, random-but-legal macro policy for both
//                  sides (guard-biased when the opponent is in an attack's startup), then eval.js squashed to [0, 1]
//   4. Backprop    every node on the path: n += 1; N_me(a) += 1, W_me(a) += r; N_op(b) += 1, W_op(b) += 1 - r
// The final choice is the root macro with the most visits. Budget: wall-clock ms or a fixed rollout count.
import { Agent } from './agent.js';
import { legalMacros, startProgram, copyProgram, playUntilDecision, atDecision, emit, programDone, macroSet } from './macros.js';
import { evaluate, squash, WEIGHTS } from './eval.js';
import { phase } from './features.js';

export class MctsAgent extends Agent {
  constructor(o = {}) {
    super(o);
    this.name = 'mcts';
    // exploration constant. Rewards are eval squashed to [0, 1]; between sensible macros they differ by only ~0.02-0.1,
    // so the textbook sqrt(2) explores almost uniformly. Tuned on the mirror vs the scripted baseline (docs/ai_benchmark.md).
    this.c = o.c ?? 0.1;
    this.rolloutFrames = o.rolloutFrames ?? 60;
    this.guardBias = o.guardBias ?? 0.55;
    this.punishBias = o.punishBias ?? 0.7;
    this.projBias = o.projBias ?? 0.6;
    this.cap = o.cap ?? 40;
    this.weights = o.weights || null;
  }

  makeNode(sim, progs) {
    const me = this.side, op = 1 - me;
    const term = sim.f[0].ko || sim.f[1].ko;
    const ch = [atDecision(sim, me, progs[me]), atDecision(sim, op, progs[op])];
    const acts = [ch[0] ? legalMacros(sim, me) : [null], ch[1] ? legalMacros(sim, op) : [null]];
    return { sim, progs, term, ch, acts, n: 0, N: [new Float64Array(acts[0].length), new Float64Array(acts[1].length)], W: [new Float64Array(acts[0].length), new Float64Array(acts[1].length)], kids: new Map() };
  }

  select(node, k) {
    const N = node.N[k], W = node.W[k], L = N.length;
    if (L === 1) return 0;
    // unvisited first (random tie-break among them)
    let un = 0;
    for (let i = 0; i < L; i++) if (N[i] === 0) un++;
    if (un) { let r = this.rng.int(un); for (let i = 0; i < L; i++) if (N[i] === 0 && r-- === 0) return i; }
    const ln = Math.log(node.n);
    let best = 0, bv = -Infinity;
    for (let i = 0; i < L; i++) { const v = W[i] / N[i] + this.c * Math.sqrt(ln / N[i]); if (v > bv) { bv = v; best = i; } }
    return best;
  }

  expand(node, ai, bi) {
    const sim = node.sim.clone(), me = this.side, op = 1 - me;
    const a = node.acts[0][ai], b = node.acts[1][bi];
    const progs = [null, null];
    progs[me] = a ? startProgram(a, sim.f[me].facing) : copyProgram(node.progs[me]);
    progs[op] = b ? startProgram(b, sim.f[op].facing) : copyProgram(node.progs[op]);
    // forced nodes (neither side can choose) are skipped through
    let guard = 0;
    do { playUntilDecision(sim, progs, this.cap); } while (!(sim.f[0].ko || sim.f[1].ko) && !atDecision(sim, me, progs[me]) && !atDecision(sim, op, progs[op]) && ++guard < 4);
    return this.makeNode(sim, progs);
  }

  /**
   * light rollout policy: a random legal macro, with two biases that any fighter has by instinct (so rollouts do not
   * reward blatant whiffs): guard when the opponent is in an attack's startup, punish when it is recovering in range.
   */
  policy(sim, side) {
    const legal = legalMacros(sim, side);
    const op = sim.f[1 - side];
    // a projectile on its way: rollouts defend against it (parry / dodge / guard) most of the time, as any fighter would
    if (this.rng.next() < this.projBias) { const d = legal.filter((m) => m.kind === 'parry' || m.kind === 'dodge'); if (d.length) return d[this.rng.int(d.length)]; }
    if (op.state === 'attack') {
      const ph = phase(sim, op);
      if (ph === 'startup' && this.rng.next() < this.guardBias) { const g = legal.find((m) => m.kind === 'guard'); if (g) return g; }
      if (ph === 'recovery' && this.rng.next() < this.punishBias) {
        const gap = Math.abs(op.x - sim.f[side].x) - sim.C(op).hurt.stand.x1;
        const hit = legal.find((m) => m.kind === 'attack' && gap < m.reach - 20); if (hit) return hit;
      }
    }
    return legal[this.rng.int(legal.length)];
  }

  rollout(node) {
    if (node.term) return squash(evaluate(node.sim, this.side, this.weights || WEIGHTS));
    const sim = node.sim.clone(), progs = [copyProgram(node.progs[0]), copyProgram(node.progs[1])];
    const inp = [0, 0];
    for (let t = 0; t < this.rolloutFrames; t++) {
      for (let s = 0; s < 2; s++) {
        if (atDecision(sim, s, progs[s])) progs[s] = startProgram(this.policy(sim, s), sim.f[s].facing);
        inp[s] = progs[s] ? emit(progs[s]) : 0;
      }
      sim.step(inp);
      if (sim.f[0].ko || sim.f[1].ko) break;
    }
    this.frames += this.rolloutFrames;
    return squash(evaluate(sim, this.side, this.weights || WEIGHTS));
  }

  iterate(root) {
    const path = [];
    let node = root, r;
    for (;;) {
      if (node.term) { r = this.rollout(node); break; }
      const ai = this.select(node, 0), bi = this.select(node, 1);
      path.push([node, ai, bi]);
      const key = ai * 64 + bi;
      let kid = node.kids.get(key);
      if (!kid) { kid = this.expand(node, ai, bi); node.kids.set(key, kid); r = this.rollout(kid); break; }
      node = kid;
    }
    for (const [n, ai, bi] of path) { n.n++; n.N[0][ai]++; n.W[0][ai] += r; n.N[1][bi]++; n.W[1][bi] += 1 - r; }
  }

  decide(sim) {
    this.startBudget(); this.frames = 0;
    const root = this.makeNode(sim, [null, null]);
    root.ch[0] = true;
    let it = 0;
    do { this.iterate(root); it++; this.spend(1); } while (!this.outOfBudget() || it < 2);
    const N = root.N[0], W = root.W[0];
    let best = 0;
    for (let i = 1; i < N.length; i++) if (N[i] > N[best] || (N[i] === N[best] && W[i] > W[best])) best = i;
    this.lastWork = it;
    const rows = root.acts[0].map((m, i) => ({ id: m.id, visits: N[i], mean: N[i] ? W[i] / N[i] : 0 })).sort((x, y) => y.visits - x.visits);
    const opRows = root.ch[1] ? root.acts[1].map((m, i) => ({ id: m.id, visits: root.N[1][i] })).sort((x, y) => y.visits - x.visits).slice(0, 3) : [];
    this._think = { algo: 'mcts', rollouts: it, chosen: root.acts[0][best].id, winProb: N[best] ? W[best] / N[best] : 0.5, rows, opRows, frames: this.frames };
    return root.acts[0][best];
  }
}
void macroSet; void programDone;
