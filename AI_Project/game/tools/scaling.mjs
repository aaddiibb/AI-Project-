// Scaling curves (prompt 05 §5.3): win rate of one agent against a FIXED opponent as its search budget grows.
//   node game/tools/scaling.mjs --agent minimax --unit nodes --values 40,80,150,300,600,1200 --vs mcts --vsBudget rollouts:250 --matches 100 --tag scale_minimax
//   node game/tools/scaling.mjs --agent mcts --unit rollouts --values 30,60,125,250,500,1000 --vs minimax --vsBudget nodes:80 --matches 100 --tag scale_mcts
// Samurai mirror, 9-frame reaction for both, sides swapped every other match, deterministic budgets.
// Output: game/tools/out/<tag>.json with win rate + Wilson CI, draws, HP margin and decision time per budget.
// --resume keeps the budgets already in the output file; --budgetSec N stops (cleanly, between budgets) after N seconds.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, makeJobs, runJobs, summarise } from './arena.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const o = parseArgs(process.argv.slice(2));
const values = String(o.values).split(',').map(Number);
const out = join(HERE, 'out'); mkdirSync(out, { recursive: true });
const nW = +(o.workers || cpus().length);
const file = join(out, `${o.tag || 'scale'}.json`);
const rows = o.resume && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).rows : [];
const T0 = performance.now();
for (const v of values) {
  if (rows.some((r) => r.budget === v)) continue;
  if (o.budgetSec && performance.now() - T0 > +o.budgetSec * 1000) { console.log('time budget reached; continue with --resume'); break; }
  const t = performance.now();
  const opts = { ...o, matches: +(o.matches || 100), seed: +(o.seed || 77), react: +(o.react ?? 9), b1: `${o.unit}:${v}`, b2: o.vsBudget, pairSeed: +(o.seed || 77) };
  const res = await runJobs(makeJobs(o.agent, o.vs, opts, {}), nW);
  const s = summarise(res);
  const row = { budget: v, unit: o.unit, n: s.n, winRate: s.winRateA, ci: s.ciA, drawRate: s.drawRate, lossRate: s.winRateB, hpMargin: s.hpMarginA, msMean: s.A.msMean, msP95: s.A.msP95, work: s.A.work, oppMs: s.B.msMean, sec: (performance.now() - t) / 1000 };
  rows.push(row); rows.sort((x, y) => x.budget - y.budget);
  console.log(`${o.agent} ${o.unit}:${String(v).padStart(5)} vs ${o.vs} ${o.vsBudget || ''}: win ${(100 * row.winRate).toFixed(1)}% [${(100 * row.ci[0]).toFixed(0)}-${(100 * row.ci[1]).toFixed(0)}], draw ${(100 * row.drawRate).toFixed(1)}%, HP margin ${(100 * row.hpMargin).toFixed(1)}%, ${row.msMean.toFixed(2)} ms/decision (${row.sec.toFixed(0)} s)`);
  writeFileSync(file, JSON.stringify({ agent: o.agent, unit: o.unit, vs: o.vs, vsBudget: o.vsBudget, rows }, null, 1));
}
