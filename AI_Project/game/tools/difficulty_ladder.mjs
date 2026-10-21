// Difficulty ladder (prompt 05 §4.5.5 / R3): each AI at each level against a fixed "proxy human".
//   node game/tools/difficulty_ladder.mjs [--matches 40] [--agents minimax,mcts,fuzzy]
// The proxy human is the scripted policy (walk in, light in range, guard when the opponent swings, heavy on a whiff)
// with a human-like 15-frame (250 ms) reaction delay and 10 % random mistakes. It is NOT a real person: it only shows
// that the levels are ordered (Easy < Normal < Hard < Master). Levels run in deterministic node / rollout mode
// (levelOptions(..., 'nodes')), so the table reproduces. Output: game/tools/out/difficulty_ladder.json
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, runJobs, summarise } from './arena.mjs';
import { LEVELS } from '../src/ai/difficulty.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const o = parseArgs(process.argv.slice(2));
const N = +(o.matches || 40), agents = String(o.agents || 'minimax,mcts,fuzzy').split(',');
// --resume keeps rows already in the output file; --budgetSec N stops cleanly between rows
const FILE = join(HERE, 'out', 'difficulty_ladder.json');
mkdirSync(join(HERE, 'out'), { recursive: true });
const out = o.resume && existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).rows : [];
const T0 = performance.now();
for (const a of agents) {
  for (const level of Object.keys(LEVELS)) {
    if (out.some((r) => r.agent === a && r.level === level)) continue;
    if (o.budgetSec && performance.now() - T0 > +o.budgetSec * 1000) { console.log('time budget reached; continue with --resume'); process.exit(0); }
    // agent A at `level` (its reaction / mistakes / node budget); agent B = proxy human (scripted, react 15, 10 % mistakes)
    const jobs = Array.from({ length: N }, (_, id) => ({ a, b: 'scripted', id, seed: 4242, chars: ['samurai', 'samurai'], budgets: [null, null], level: null, react: 0, weights: {},
      extra: [{ level, ...levelOpts(a, level) }, { reactionFrames: 15, mistakeRate: 0.1 }] }));
    const s = summarise(await runJobs(jobs, +(o.workers || cpus().length)));
    out.push({ agent: a, level, n: s.n, winRate: s.winRateA, ci: s.ciA, drawRate: s.drawRate, lossRate: s.winRateB, hpMargin: s.hpMarginA, msMean: s.A.msMean, work: s.A.work });
    writeFileSync(FILE, JSON.stringify({ proxyHuman: 'scripted, reaction 15 frames, 10% mistakes', matches: N, rows: out }, null, 1));
    console.log(`${a.padEnd(8)} ${level.padEnd(7)} vs proxy human: AI wins ${(100 * s.winRateA).toFixed(0)}% [${(100 * s.ciA[0]).toFixed(0)}-${(100 * s.ciA[1]).toFixed(0)}], human wins ${(100 * s.winRateB).toFixed(0)}%, draws ${(100 * s.drawRate).toFixed(0)}%, ${s.A.work.toFixed(0)} work/decision`);
  }
}

function levelOpts(agent, level) {
  const L = LEVELS[level], WPM = { minimax: 75, mcts: 30 };
  const o2 = { reactionFrames: L.reactionFrames, mistakeRate: L.mistakeRate };
  if (agent === 'minimax') o2.budget = { nodes: Math.round(L.budgetMs * WPM.minimax) };
  if (agent === 'mcts') o2.budget = { rollouts: Math.round(L.budgetMs * WPM.mcts) };
  return o2;
}
