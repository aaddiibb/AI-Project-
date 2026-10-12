// Difficulty levels (prompt 05 §4.5.5), applicable to ANY agent. Three knobs:
//   budget          thinking time per decision (search depth / rollouts follow from it)
//   reactionFrames  how old the view the agent decides on is (human-like reaction delay)
//   mistakeRate     probability that the chosen macro is replaced by a random legal one
// Master runs in a Web Worker in the browser (50 ms per decision would otherwise stall 60 fps rendering).
// Benchmark ("deterministic") mode converts the time budget into a node / rollout budget using the measured
// throughput (docs/ai_benchmark.md), so results replay bit-identically on any machine.
export const LEVELS = {
  easy: { label: 'Easy', budgetMs: 2, reactionFrames: 22, mistakeRate: 0.2 },
  normal: { label: 'Normal', budgetMs: 8, reactionFrames: 14, mistakeRate: 0.08 },
  hard: { label: 'Hard', budgetMs: 16, reactionFrames: 9, mistakeRate: 0.02 },
  master: { label: 'Master', budgetMs: 50, reactionFrames: 6, mistakeRate: 0, worker: true },
};
// measured work per millisecond in real matches (warm JIT, Node 22, this machine): Minimax nodes, MCTS rollouts (docs/ai_benchmark.md)
export const WORK_PER_MS = { minimax: 75, mcts: 30 };

/** options for an agent at a level; mode 'time' (game) or 'nodes' (deterministic benchmark) */
export function levelOptions(agent, level, mode = 'time') {
  const L = LEVELS[level];
  if (!L) throw new Error(`unknown level ${level}`);
  const o = { level, reactionFrames: L.reactionFrames, mistakeRate: L.mistakeRate, budgetMs: L.budgetMs };
  if (mode === 'nodes') {
    if (agent === 'minimax') o.budget = { nodes: Math.max(10, Math.round(L.budgetMs * WORK_PER_MS.minimax)) };
    else if (agent === 'mcts') o.budget = { rollouts: Math.max(6, Math.round(L.budgetMs * WORK_PER_MS.mcts)) };
  } else o.budget = { ms: L.budgetMs };
  return o;
}
