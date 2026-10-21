// Agent registry: one place that maps names to classes (used by tools/arena.mjs, tools/ga_tune.mjs and the game menu).
import { MinimaxAgent } from './minimax.js';
import { MctsAgent } from './mcts.js';
import { FuzzyAgent } from './fuzzy.js';
import { RandomAgent, ScriptedAgent } from './baselines.js';
import { levelOptions } from './difficulty.js';

export const AGENTS = {
  minimax: { cls: MinimaxAgent, label: 'Minimax (α-β)', topic: 'Lab 04 adversarial search' },
  mcts: { cls: MctsAgent, label: 'MCTS (DUCT)', topic: 'Lab 08 Monte Carlo tree search' },
  fuzzy: { cls: FuzzyAgent, label: 'Fuzzy (Mamdani)', topic: 'Lab 05 fuzzy logic' },
  scripted: { cls: ScriptedAgent, label: 'Scripted', topic: 'baseline' },
  random: { cls: RandomAgent, label: 'Random', topic: 'baseline' },
};

/** parse "nodes:4000" | "rollouts:200" | "ms:16" */
export function parseBudget(s) {
  if (!s) return null;
  if (typeof s === 'object') return s;
  const [k, v] = String(s).split(':');
  return { [k]: Number(v) };
}

/**
 * makeAgent('minimax', { side, seed, level, budget, mode, weights, ... })
 * A `level` sets reaction delay / mistakes / budget (time, or nodes in mode 'nodes'); an explicit `budget` overrides it.
 * The GA's tuned Minimax is 'minimax_ga' (weights passed in).
 */
export function makeAgent(name, o = {}) {
  const base = name === 'minimax_ga' ? 'minimax' : name;
  const spec = AGENTS[base];
  if (!spec) throw new Error(`unknown agent ${name} (have: ${Object.keys(AGENTS).join(', ')})`);
  const lv = o.level ? levelOptions(base, o.level, o.mode || 'time') : {};
  const budget = parseBudget(o.budget) || lv.budget || null;
  const a = new spec.cls({ ...lv, ...o, budget: budget || (base === 'minimax' ? { nodes: 120 } : base === 'mcts' ? { rollouts: 60 } : { ms: 16 }) });
  a.name = name;
  return a;
}
