// MinimaxAgent: the "Minimax Samurai" (Lab 04: adversarial search, minimax, alpha-beta pruning).
//
// The game is simultaneous: at a decision point both fighters pick a macro at the same instant. We turn each
// simultaneous node into a two-stage max-min:
//
//     V(node) = max over my macros a ( min over their macros b ( V(child(a, b)) ) )
//
// This is MAXIMIN: it assumes the opponent picks the best reply AFTER seeing my commitment. That is pessimistic: the
// real opponent cannot see my choice, so the true (mixed-strategy) value of the node is >= this. The pessimism is the
// point for this character: the disciplined duelist only takes an action whose WORST outcome is acceptable, so he never
// gambles on a read. (MCTS / DUCT, mcts.js, is the contrasting optimistic-by-sampling approach.)
//
// Search:
//  - children are produced by playing both macros forward with clone() + step() until the next decision point of EITHER
//    side (cap 40 frames). A side whose macro is still running has the single action "continue" at that node, so the
//    tree alternates naturally between joint (both choose), max-only and min-only nodes.
//  - alpha-beta: inside a row (fixed a) the min loop stops as soon as the row cannot beat the best row so far
//    (row <= max(alpha, best)); across rows the max loop stops when best >= beta. Windows are passed down to children.
//  - move ordering: previous iteration's / table's best first, then attacks in range, ultimate, guard, movement, wait.
//  - iterative deepening under a node or time budget (depth 1 always completes), transposition table keyed by
//    sim.hash() + the running programs + depth.
//  - leaves are "settled" (both running macros played to their end, cap 40 frames) and scored by eval.js, so a committed
//    attack is valued by its outcome rather than mid-swing (a quiescence-style extension).
import { Agent } from './agent.js';
import { legalMacros, startProgram, copyProgram, playUntilDecision, settle, atDecision } from './macros.js';
import { evaluate, WEIGHTS } from './eval.js';
import { features } from './features.js';

const ABORT = Symbol('budget');
const EXACT = 0, LOWER = 1, UPPER = 2;

export class MinimaxAgent extends Agent {
  constructor(o = {}) {
    super(o);
    this.name = 'minimax';
    this.maxDepth = o.maxDepth ?? 8;
    this.alphaBeta = o.alphaBeta ?? true;
    this.useTT = o.tt ?? true;
    this.weights = o.weights || null;
    this.cap = o.cap ?? 40;
    this.prevBest = null;
  }

  // ---------------------------------------------------------------- tree helpers
  child(node, a, b) {
    if (this.depthIter > 1 && this.outOfBudget()) throw ABORT;
    this.spend(1); this.nodes++;
    const sim = node.sim.clone();
    const me = this.side, op = 1 - me;
    const progs = [null, null];
    progs[me] = a ? startProgram(a, sim.f[me].facing) : copyProgram(node.progs[me]);
    progs[op] = b ? startProgram(b, sim.f[op].facing) : copyProgram(node.progs[op]);
    playUntilDecision(sim, progs, this.cap);
    return { sim, progs };
  }
  leaf(node) {
    const sim = node.sim.clone(), progs = [copyProgram(node.progs[0]), copyProgram(node.progs[1])];
    settle(sim, progs, this.cap);
    this.leaves++;
    return evaluate(sim, this.side, this.weights || WEIGHTS);
  }
  key(node, depth) {
    const p = node.progs, k = (q) => (q ? q.m.idx * 64 + Math.min(63, q.i) : -1);
    return node.sim.hash() + ':' + k(p[0]) + ':' + k(p[1]) + ':' + depth;
  }
  /** move ordering: hint first, then attacks in range, ultimate, guard, movement, wait */
  order(sim, side, list, hint, jitter = false) {
    const F = features(sim, side);
    // at the root, equal-priority macros are shuffled with the seeded RNG: among equally valued choices the first one found
    // wins, so this is the tie-break. Without it two deterministic searchers in a mirror play identical moves forever.
    const j = jitter ? list.map(() => this.rng.next() * 50) : null;
    const score = (m) => {
      if (hint && m.id === hint) return 1e4;
      if (m.kind === 'attack') return F.gap < m.reach ? 900 + m.reach / 100 : 150;
      if (m.kind === 'ult') return 800;
      if (m.kind === 'guard') return 600;
      if (m.kind === 'move') return 300;
      return 100;
    };
    return list.map((m, i) => [m, score(m) + (j ? j[i] : 0)]).sort((x, y) => y[1] - x[1]).map((x) => x[0]);
  }

  // ---------------------------------------------------------------- the search
  search(node, depth, alpha, beta, ply) {
    const sim = node.sim, me = this.side, op = 1 - me;
    if (sim.f[0].ko || sim.f[1].ko || depth <= 0) return this.leaf(node);
    const chMe = ply === 0 ? true : atDecision(sim, me, node.progs[me]);
    const chOp = atDecision(sim, op, node.progs[op]);
    if (!chMe && !chOp) return this.search(this.child(node, null, null), depth - 1, alpha, beta, ply + 1); // forced (both committed)

    let key = null, hintA = null, hintB = null;
    if (this.useTT) {
      key = this.key(node, depth);
      const e = this.tt.get(key);
      if (e) {
        this.ttHits++;
        if (e.flag === EXACT || (e.flag === LOWER && e.v >= beta) || (e.flag === UPPER && e.v <= alpha)) { if (ply > 0) return e.v; }
        hintA = e.a; hintB = e.b;
      }
    }
    if (ply === 0) hintA = this.prevBest;
    const A = chMe ? this.order(sim, me, legalMacros(sim, me), hintA, ply === 0 && this.depthIter <= 1) : [null];
    const B = chOp ? this.order(sim, op, legalMacros(sim, op), hintB) : [null];
    const alpha0 = alpha;
    let best = -Infinity, bestA = null, bestB = null;
    for (const a of A) {
      let row = Infinity, rowB = null, cut = false;
      for (const b of B) {
        const lo = this.alphaBeta ? Math.max(alpha, best) : -Infinity, hi = this.alphaBeta ? Math.min(beta, row) : Infinity;
        const v = this.search(this.child(node, a, b), depth - 1, lo, hi, ply + 1);
        if (v < row) { row = v; rowB = b; }
        if (this.alphaBeta && row <= Math.max(alpha, best)) { cut = B.length > 1 && b !== B[B.length - 1]; if (cut) this.cutoffs++; break; }
      }
      if (ply === 0) this.rootRows.push({ id: a.id, v: row, bound: cut || (this.alphaBeta && row <= best), reply: rowB?.id ?? null });
      if (row > best) { best = row; bestA = a; bestB = rowB; }
      if (this.alphaBeta && best >= beta) { this.cutoffs++; break; }
    }
    if (ply === 0) { this.rootBest = bestA; this.rootReply = bestB; }
    if (this.useTT) {
      const flag = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
      this.tt.set(key, { v: best, flag, a: bestA?.id ?? null, b: bestB?.id ?? null });
    }
    return best;
  }

  /** run the search at a fixed depth on `sim` (also used by the unit tests) */
  searchFixed(sim, depth) {
    this.tt = new Map(); this.nodes = 0; this.leaves = 0; this.cutoffs = 0; this.ttHits = 0; this.rootRows = [];
    this.depthIter = 1; this._t0 = 0; this._work = 0;
    const v = this.search({ sim, progs: [null, null] }, depth, -Infinity, Infinity, 0);
    return { v, best: this.rootBest, reply: this.rootReply, rows: this.rootRows, nodes: this.nodes };
  }

  decide(sim) {
    this.startBudget();
    this.tt = new Map(); this.nodes = 0; this.leaves = 0; this.cutoffs = 0; this.ttHits = 0;
    const root = { sim, progs: [null, null] };
    let result = null, depthDone = 0;
    for (let d = 1; d <= this.maxDepth; d++) {
      this.depthIter = d; this.rootRows = [];
      try {
        const v = this.search(root, d, -Infinity, Infinity, 0);
        result = { v, best: this.rootBest, reply: this.rootReply, rows: this.rootRows.slice() };
        depthDone = d; this.prevBest = this.rootBest.id;
      } catch (e) { if (e !== ABORT) throw e; break; }
      if (this.outOfBudget()) break;
    }
    this.lastWork = this.nodes;
    // principal variation: my best, their worst-case reply, then each child's table entry
    const pv = [[result.best.id, result.reply?.id ?? '…']];
    try {
      let node = { sim, progs: [null, null] }, a = result.best, b = result.reply;
      this.depthIter = 0;
      for (let k = 1; k < depthDone && a; k++) {
        node = this.child(node, a, b);
        const e = this.tt.get(this.key(node, depthDone - k));
        if (!e || (!e.a && !e.b)) break;
        pv.push([e.a || '·', e.b || '·']);
        const me = this.side, op = 1 - me;
        a = e.a ? legalMacros(node.sim, me).find((m) => m.id === e.a) : null;
        b = e.b ? legalMacros(node.sim, op).find((m) => m.id === e.b) : null;
        if (!a && !b) break;
      }
    } catch { /* PV is cosmetic */ }
    this.nodes -= 0;
    this._think = { algo: 'minimax', depth: depthDone, nodes: this.lastWork, leaves: this.leaves, cutoffs: this.cutoffs, ttHits: this.ttHits,
      chosen: result.best.id, value: result.v, rows: result.rows.sort((x, y) => y.v - x.v), pv };
    return result.best;
  }
}
