// Genetic-algorithm tuning of the Minimax evaluation weights (prompt 05 §4.6; lab topic: genetic algorithms).
//   node game/tools/ga_tune.mjs [--pop 16] [--gens 15] [--matches 4] [--seed 7] [--nodes 300] [--workers 2]
//   node game/tools/ga_tune.mjs --resume [--budgetSec 60]   continue from game/tools/out/ga_state.json (saved after every
//                                                            generation); with --budgetSec, stop cleanly once that much time has passed
//
// Genome     the numeric weights of eval.js (DEFAULT_WEIGHTS except the terminal `ko`), each within [0, 3 x default]
// Fitness    mean of (win = 1, draw = 0.5, loss = 0) + 0.25 x HP margin (my HP - theirs, as a fraction of 1000) of a
//            Minimax using the genome, in the Samurai mirror, against a FIXED panel:
//            Minimax with the hand-tuned default weights, MCTS at a small budget, and Fuzzy; `--matches` per panel member,
//            sides swapped, deterministic node / rollout budgets and fixed seeds, so every evaluation reproduces.
//            To keep 15 generations affordable, fitness matches are ONE round of 30 s (1,800 frames) at a reduced budget
//            (Minimax nodes:300, MCTS rollouts:60) with the benchmark's 9-frame reaction delay. The HP-margin term grades
//            draws and wins: without it the landscape is flat (a pessimistic mirror often ends in equal-HP time-outs).
// Operators  tournament selection (k = 3), blend crossover BLX-0.3, Gaussian mutation (p = 0.3 per gene, sigma = 15 % of
//            the gene's range), elitism 2.
// Output     game/tools/out/ga_log.csv (generation, best, mean, worst, best genome), game/tools/out/ga_best.json.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Match, AgentController } from '../src/ai/match.js';
import { makeAgent } from '../src/ai/registry.js';
import { DEFAULT_WEIGHTS } from '../src/ai/eval.js';
import { Rng, subSeed } from '../src/ai/rng.js';
import { parseArgs } from './arena.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GENES = Object.keys(DEFAULT_WEIGHTS).filter((k) => k !== 'ko');
const LO = GENES.map(() => 0), HI = GENES.map((g) => DEFAULT_WEIGHTS[g] * 3);
const toWeights = (v) => ({ ...DEFAULT_WEIGHTS, ...Object.fromEntries(GENES.map((g, i) => [g, v[i]])) });
const PANEL = ['minimax', 'mcts', 'fuzzy'];

/** one fitness match: genome-Minimax vs a panel agent, single 30 s round */
export function fitnessMatch({ genome, opp, k, seed, nodes }) {
  const swap = k % 2 === 1, ms = subSeed(seed, k * 31 + PANEL.indexOf(opp));
  const mk = (name, side, weights) => makeAgent(name, { side, seed: subSeed(ms, side + 1), reactionFrames: 9, mistakeRate: 0,
    budget: name === 'minimax' ? { nodes } : name === 'mcts' ? { rollouts: 60 } : null, weights });
  const me = mk('minimax', swap ? 1 : 0, toWeights(genome)), them = mk(opp, swap ? 0 : 1, opp === 'minimax' ? { ...DEFAULT_WEIGHTS } : undefined);
  const agents = swap ? [them, me] : [me, them];
  const m = new Match({ chars: ['samurai', 'samurai'], controllers: agents.map((a) => new AgentController(a)), bestOf: 1, roundFrames: 1800 }).run();
  const mySide = swap ? 1 : 0, r = m.rounds[0];
  const score = m.winner === null ? 0.5 : m.winner === mySide ? 1 : 0;
  return score + 0.25 * (r.hp[mySide] - r.hp[1 - mySide]) / 1000;
}

async function evaluate(pop, o, pool) {
  const jobs = [];
  pop.forEach((genome, gi) => { for (const opp of PANEL) for (let k = 0; k < o.matches; k++) jobs.push({ gi, genome, opp, k, seed: o.seed, nodes: o.nodes }); });
  const res = await pool(jobs);
  if (process.env.GA_DEBUG) console.log(jobs.map((j, i) => `${j.gi}:${j.opp}=${res[i].toFixed(3)}`).join(" "), pop.map((g) => g.map((v) => v.toFixed(2)).join("|")));
  const fit = pop.map(() => 0);
  jobs.forEach((j, i) => { fit[j.gi] += res[i]; });
  return fit.map((f) => f / (PANEL.length * o.matches));
}

function makePool(n) {
  if (n <= 1) return async (jobs) => jobs.map(fitnessMatch);
  const workers = Array.from({ length: n }, () => new Worker(fileURLToPath(import.meta.url), { workerData: { worker: 'ga' } }));
  const pool = (jobs) => new Promise((resolve, reject) => {
    const out = new Array(jobs.length); let next = 0, done = 0;
    for (const w of workers) {
      const feed = () => { if (next < jobs.length) { const i = next++; w.postMessage({ i, job: jobs[i] }); } };
      w.removeAllListeners('message');
      w.on('message', ({ i, r }) => { out[i] = r; done++; if (done === jobs.length) resolve(out); else feed(); });
      w.on('error', reject);
      feed();
    }
  });
  pool.close = () => workers.forEach((w) => w.terminate());
  return pool;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const o = { pop: +(a.pop || 16), gens: +(a.gens || 15), matches: +(a.matches || 4), seed: +(a.seed || 7), nodes: +(a.nodes || 300), workers: +(a.workers || cpus().length) };
  const out = join(HERE, 'out'); mkdirSync(out, { recursive: true });
  const rng = new Rng(o.seed), pool = makePool(o.workers);
  const clamp = (v, i) => Math.max(LO[i], Math.min(HI[i], v));
  const gauss = () => { let u = 0, v = 0; while (!u) u = rng.next(); while (!v) v = rng.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const stateFile = join(out, 'ga_state.json');
  let pop, log, best = null, gen0 = 0;
  if (a.resume && existsSync(stateFile)) {
    const st = JSON.parse(readFileSync(stateFile, 'utf8'));
    pop = st.pop; log = st.log; best = st.best; gen0 = st.gen; rng.s = st.rng; Object.assign(o, st.o);
    console.log(`resuming at generation ${gen0}`);
  } else {
    // initial population: the hand-tuned default + random genomes
    pop = [GENES.map((g) => DEFAULT_WEIGHTS[g])];
    while (pop.length < o.pop) pop.push(GENES.map((_, i) => LO[i] + rng.next() * (HI[i] - LO[i])));
    log = ['generation,best,mean,worst,' + GENES.map((g) => 'best_' + g).join(',')];
  }
  const t0 = performance.now(), budget = a.budgetSec ? +a.budgetSec * 1000 : Infinity;
  for (let gen = gen0; gen < o.gens; gen++) {
    const fit = await evaluate(pop, o, pool);
    const order = fit.map((f, i) => [f, i]).sort((x, y) => y[0] - x[0]);
    const [bf, bi] = order[0];
    if (!best || bf > best.fitness) best = { fitness: bf, genome: pop[bi].slice(), generation: gen };
    const mean = fit.reduce((q, f) => q + f, 0) / fit.length;
    log.push([gen, bf.toFixed(4), mean.toFixed(4), order.at(-1)[0].toFixed(4), ...pop[bi].map((v) => v.toFixed(4))].join(','));
    console.log(`gen ${String(gen).padStart(2)}  best ${bf.toFixed(3)}  mean ${mean.toFixed(3)}  worst ${order.at(-1)[0].toFixed(3)}  (${((performance.now() - t0) / 1000).toFixed(0)} s)  ${GENES.map((g, i) => `${g}=${pop[bi][i].toFixed(2)}`).join(' ')}`);
    writeFileSync(join(out, 'ga_log.csv'), log.join('\n') + '\n');
    if (gen < o.gens - 1) {
      // next generation: elitism 2, then tournament selection + BLX-0.3 crossover + Gaussian mutation
      const tour = () => { let b = -1; for (let k = 0; k < 3; k++) { const i = rng.int(pop.length); if (b < 0 || fit[i] > fit[b]) b = i; } return pop[b]; };
      const next = [pop[order[0][1]].slice(), pop[order[1][1]].slice()];
      while (next.length < o.pop) {
        const p1 = tour(), p2 = tour();
        next.push(p1.map((x, i) => {
          const lo = Math.min(x, p2[i]), hi = Math.max(x, p2[i]), d = hi - lo;
          let c = lo - 0.3 * d + rng.next() * (d * 1.6);
          if (rng.next() < 0.3) c += gauss() * 0.15 * (HI[i] - LO[i]);
          return clamp(c, i);
        }));
      }
      pop = next;
    }
    writeFileSync(stateFile, JSON.stringify({ gen: gen + 1, pop, log, best, rng: rng.s, o }));
    if (gen < o.gens - 1 && performance.now() - t0 > budget) { console.log(`stopping after generation ${gen} (budget); continue with --resume`); pool.close?.(); return; }
  }
  const result = { weights: toWeights(best.genome), fitness: best.fitness, generation: best.generation, config: { ...o, panel: PANEL, fitnessMatch: 'single 1,800-frame round, reaction 9, fitness = score + 0.25 HP margin, Minimax nodes:' + o.nodes + ', MCTS rollouts:60' }, defaults: DEFAULT_WEIGHTS };
  writeFileSync(join(out, 'ga_best.json'), JSON.stringify(result, null, 1));
  console.log(`best fitness ${best.fitness.toFixed(3)} (generation ${best.generation}) -> ${join(out, 'ga_best.json')}`);
  pool.close?.();
}

if (!isMainThread && workerData?.worker === 'ga') parentPort.on('message', ({ i, job }) => parentPort.postMessage({ i, r: fitnessMatch(job) }));
else if (isMainThread && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
