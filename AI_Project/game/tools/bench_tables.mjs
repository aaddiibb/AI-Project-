// Markdown tables for docs/ai_benchmark.md, generated from the measured files in game/tools/out/ (no hand-copied numbers).
//   node game/tools/bench_tables.mjs [summary.json ...]   (default: rr_main_summary.json) > tables.md
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
const L = { minimax: 'Minimax', mcts: 'MCTS', fuzzy: 'Fuzzy', scripted: 'Scripted', random: 'Random', minimax_ga: 'GA-Minimax' };
const p = (x) => (100 * x).toFixed(1) + '%';
const ci = (c) => `${(100 * c[0]).toFixed(1)}–${(100 * c[1]).toFixed(1)}`;
const f1 = (x) => x.toFixed(1), f0 = (x) => x.toFixed(0), f2 = (x) => x.toFixed(2);

function tables(file) {
  const { args, summaries: S } = JSON.parse(readFileSync(join(OUT, file), 'utf8'));
  const lines = [];
  lines.push(`Source: \`game/tools/out/${file}\` (${S.reduce((s, x) => s + x.n, 0)} matches; seed ${args.seed}; ${args.level ? 'level ' + args.level + ' (its reaction delay, mistakes and node budget)' : 'reaction ' + args.react + ' frames; budgets ' + (args.budget || 'default')}).`, '');
  lines.push('| A vs B | n | A wins | 95% CI | B wins | 95% CI | draws | A HP margin / round | time-outs | A as P1 | A as P2 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of S) lines.push(`| ${L[s.a]} vs ${L[s.b]} | ${s.n} | ${p(s.winRateA)} | ${ci(s.ciA)} | ${p(s.winRateB)} | ${ci(s.ciB)} | ${p(s.drawRate)} | ${(100 * s.hpMarginA).toFixed(1)}% | ${p(s.timeoutRate)} | ${p(s.asP1.rate)} | ${p(s.asP2.rate)} |`);
  lines.push('', '| A vs B | side | damage / match | hits | blocked | hit ratio | chip dealt | ultimates used / landed | heavy whiffs | decisions | ms mean | ms p95 | nodes or rollouts / decision |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of S) for (const [k, n] of [['A', s.a], ['B', s.b]]) {
    const x = s[k];
    lines.push(`| ${L[s.a]} vs ${L[s.b]} | ${k}: ${L[n]} | ${f0(x.dmg)} | ${f1(x.hits)} | ${f1(x.blocked)} | ${p(x.hitRatio)} | ${f0(x.chip)} | ${f2(x.ults)} / ${f2(x.ultHits)} | ${f2(x.heavyWhiffs)} | ${f0(x.decisions)} | ${f2(x.msMean)} | ${f2(x.msP95)} | ${x.work ? f0(x.work) : '–'} |`);
  }
  return lines.join('\n');
}
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['rr_main_summary.json'];
for (const f of files) if (existsSync(join(OUT, f))) console.log(tables(f) + '\n');
for (const f of ['scale_minimax.json', 'scale_mcts.json']) {
  if (!existsSync(join(OUT, f))) continue;
  const s = JSON.parse(readFileSync(join(OUT, f), 'utf8'));
  console.log(`Scaling: ${L[s.agent]} vs ${L[s.vs] || s.vs} (${s.vsBudget}) — \`game/tools/out/${f}\`\n\n| ${s.unit} | n | win | 95% CI | draws | HP margin | ms / decision |\n|---|---|---|---|---|---|---|`);
  for (const r of s.rows) console.log(`| ${r.budget} | ${r.n} | ${p(r.winRate)} | ${ci(r.ci)} | ${p(r.drawRate)} | ${(100 * r.hpMargin).toFixed(1)}% | ${f2(r.msMean)} |`);
  console.log('');
}
if (existsSync(join(OUT, 'difficulty_ladder.json'))) {
  const d = JSON.parse(readFileSync(join(OUT, 'difficulty_ladder.json'), 'utf8'));
  console.log(`Difficulty ladder vs the proxy human (${d.proxyHuman}), ${d.matches} matches per cell — \`game/tools/out/difficulty_ladder.json\`\n\n| agent | level | AI wins | 95% CI | proxy-human wins | draws | work / decision |\n|---|---|---|---|---|---|---|`);
  for (const r of d.rows) console.log(`| ${L[r.agent]} | ${r.level} | ${p(r.winRate)} | ${ci(r.ci)} | ${p(r.lossRate)} | ${p(r.drawRate)} | ${r.work ? f0(r.work) : '–'} |`);
}
