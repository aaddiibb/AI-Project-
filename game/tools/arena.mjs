// Headless AI-vs-AI arena (prompt 05 §5.1). No rendering, no DOM: the sim + agents under Node, optionally on worker threads.
//
//   node game/tools/arena.mjs --p1 minimax --p2 mcts --char samurai --matches 200 --seed 1 --budget nodes:120 [--level hard] [--out game/tools/out/]
//   node game/tools/arena.mjs --roundrobin minimax,mcts,fuzzy,scripted,random --matches 200 --seed 1 --tag rr
//   node game/tools/arena.mjs --p1 minimax --p2 mcts --seed 1 --replay 17          # dump match 17's input log for the browser
//
// Options
//   --char samurai | --chars samurai,shinobi        characters (mirror by default)
//   --budget <spec>        applies to both agents where it fits: nodes:N -> Minimax, rollouts:N -> MCTS, ms:N -> both
//   --b1 / --b2 <spec>     budget for agent A / agent B only;  default Minimax nodes:120, MCTS rollouts:60 (≈10-15 ms each)
//   --level easy|normal|hard|master    reaction delay + mistakes (+ budget converted to nodes, unless --budget is given)
//   --l1 / --l2 <level>    level for agent A / agent B only (e.g. --l1 master --l2 hard)
//   --lat1 / --lat2 N      emulate the browser's Master (a Web Worker that answers N frames after it is asked, ~3 at 50 ms)
//                          exactly as remote.js runs it: speculative search of the next decision point (speculate.js),
//                          answer used if the prediction held and it has arrived, else a Hard-budget decision at once
//   --react N              reaction delay in frames for both (default 0: pure algorithm comparison)
//   --weights file.json    eval weights for agent name "minimax_ga" (default game/tools/out/ga_best.json)
//   --o1 / --o2 k=v,k=v    extra constructor options for agent A / B (e.g. --o2 rolloutFrames=60,c=1)
//   --ids lo-hi            only play these match ids (split one pairing across machines; merge the .jsonl files)
//   --skip a-b,c-d         round-robin pairings to leave out (e.g. one that runs on another machine)
//   --workers N            worker threads (default: CPU count)
//   --out dir --tag name   output: <out>/<tag>_matches.csv and <tag>_summary.json (+ round-robin table)
//   --resume               every finished match is appended to <out>/<tag>_<a>_vs_<b>.jsonl; with --resume, match ids
//                          already in that file are skipped, so a run can be stopped and continued (results identical)
// Sides are swapped for half the matches (odd match ids: agent A plays P2). Per-match seeds derive from --seed, so in
// node / rollout budget mode every match replays bit-identically.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Match, AgentController } from '../src/ai/match.js';
import { makeAgent, parseBudget } from '../src/ai/registry.js';
import { subSeed } from '../src/ai/rng.js';
import { DEFAULT_WEIGHTS } from '../src/ai/eval.js';
import { predictAll, snapshot, stillValid, whyStale } from '../src/ai/speculate.js';
import { levelOptions } from '../src/ai/difficulty.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------ args
export function parseArgs(argv) {
  const o = { matches: 200, seed: 1, out: join(HERE, 'out'), char: 'samurai', react: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; if (!a.startsWith('--')) continue;
    const k = a.slice(2), v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    o[k] = v;
  }
  o.matches = +o.matches; o.seed = +o.seed; o.react = +o.react;
  o.chars = o.chars ? String(o.chars).split(',') : [o.char, o.char];
  return o;
}

/** budget for one agent name from the CLI spec */
function budgetFor(name, o, which) {
  const own = o[which] ? parseBudget(o[which]) : null;
  if (own) return own;
  const base = name.startsWith('minimax') ? 'minimax' : name;
  if (o.budget) {
    for (const part of String(o.budget).split(',')) {
      const [maybeName, rest] = part.includes('=') ? part.split('=') : [null, part];
      if (maybeName && maybeName !== base && maybeName !== name) continue;
      const b = parseBudget(rest);
      if (b.ms !== undefined) return b;
      if (b.nodes !== undefined && base === 'minimax') return b;
      if (b.rollouts !== undefined && base === 'mcts') return b;
    }
  }
  if (o.level || o[which === 'b1' ? 'l1' : 'l2']) return null; // level converts its time budget to nodes
  return base === 'minimax' ? { nodes: 120 } : base === 'mcts' ? { rollouts: 60 } : null;
}

// ------------------------------------------------------------------ browser Master (worker) emulation
/** the browser's Master in Node: `agent` (Master budget) is the worker, searching the predicted next decision point the
 *  moment a macro starts; its answer counts only `frames` later and only if the prediction held. Otherwise `fb` (a
 *  Hard-budget copy) decides on the spot, like remote.js does on the main thread. */
const REFRESH = 6;
function withSpeculation(agent, frames, fb) {
  const search = agent.decide.bind(agent), act = agent.act.bind(agent);
  let frame = 0, spec = null;
  agent.stats.spec = { hit: 0, miss: 0, why: {} };
  agent.act = (...a) => { frame++; return act(...a); };
  // the worker searches predictions one after another: the k-th answer of a request exists `frames` * (k + 1) frames later
  const ask = (cur, prog, max) => predictAll(cur, agent.side, prog, max).map((p, k) => ({ snap: p.snap, macro: search(p.sim), ready: frame + frames * (k + 1), think: agent._think, work: agent.lastWork }));
  let lastAsk = 0;
  agent.onDecided = (cur, prog) => { spec = ask(cur, prog); lastAsk = frame; };
  // every REFRESH frames while the macro plays out, a fresh prediction from the newest view (newest answers first)
  agent.onTick = (view, age) => {
    if (frame - lastAsk < REFRESH) return;
    lastAsk = frame;
    const cur = agent.extrapolate(view, Math.min(age, agent.sent.length));
    spec = [...ask(cur, agent.prog, 2), ...(spec || [])].slice(0, 12);
  };
  agent.decide = (sim) => {
    const list = spec || []; spec = null;
    const now = snapshot(sim, agent.side), s = list.find((x) => frame >= x.ready && stillValid(x.snap, now));
    if (s) { agent.stats.spec.hit++; agent._think = s.think; agent.lastWork = s.work; return s.macro; }
    agent.stats.spec.miss++;
    const w = !list.length ? 'none' : list.some((x) => stillValid(x.snap, now)) ? 'late' : whyStale(list[0].snap, now); agent.stats.spec.why[w] = (agent.stats.spec.why[w] || 0) + 1;
    const m = fb.decide(sim); agent._think = fb.thinking(); agent.lastWork = fb.lastWork; return m;
  };
  return agent;
}

// ------------------------------------------------------------------ one match
export function playMatch(job) {
  const { a, b, id, seed, chars, budgets, level, levels, lats, react, weights, record, extra = [{}, {}] } = job;
  const ms = subSeed(seed, id);
  const swap = id % 2 === 1;                      // odd ids: agent A plays P2
  const names = swap ? [b, a] : [a, b];
  const bud = swap ? [budgets[1], budgets[0]] : budgets;
  const ext = swap ? [extra[1], extra[0]] : extra;
  const lvs = levels ? (swap ? [levels[1], levels[0]] : levels) : [level, level];
  const lat = lats ? (swap ? [lats[1], lats[0]] : lats) : [0, 0];
  const agents = names.map((n, side) => {
    const opts = { ...ext[side], side, seed: subSeed(ms, side + 1), mode: 'nodes' };
    if (lvs[side]) opts.level = lvs[side];
    if (bud[side]) opts.budget = bud[side];
    if (!lvs[side]) { opts.reactionFrames ??= react; opts.mistakeRate ??= 0; } // explicit per-agent options (--o1 / --o2) win
    if (n === 'minimax_ga') opts.weights = { ...DEFAULT_WEIGHTS, ...weights };
    const ag = makeAgent(n, opts);
    if (!(lat[side] > 0)) return ag;
    const base = n.startsWith('minimax') ? 'minimax' : n;
    const fb = makeAgent(n, { ...opts, budget: levelOptions(base, 'hard', 'nodes').budget }); // = remote.js's main-thread fallback
    return withSpeculation(ag, lat[side], fb);
  });
  const ctrls = agents.map((ag) => new AgentController(ag));
  const t0 = performance.now();
  const m = new Match({ chars, controllers: ctrls, record, meta: { a, b, id, seed, swap, names, budgets: bud, level: level || null, react } }).run();
  const wall = performance.now() - t0;
  const A = swap ? 1 : 0, B = 1 - A;
  const sideStats = (s) => {
    const ag = agents[s], arr = ag.stats.ms.slice().sort((x, y) => x - y);
    const mean = arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0;
    const p95 = arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))] : 0;
    const work = ag.stats.work.length ? ag.stats.work.reduce((x, y) => x + y, 0) / ag.stats.work.length : 0;
    return { ...m.stats[s], decisions: ag.stats.decisions, msMean: mean, msP95: p95, work, mistakes: ag.stats.mistakes, spec: ag.stats.spec || null };
  };
  const hpm = m.rounds.map((r) => (r.hp[A] - r.hp[B]) / 1000);
  const res = {
    id, a, b, aSide: A, winner: m.winner === null ? 'draw' : m.winner === A ? 'A' : 'B',
    roundsA: m.wins[A], roundsB: m.wins[B], rounds: m.rounds.length, timeouts: m.rounds.filter((r) => r.reason === 'time').length,
    hpMargin: hpm.reduce((x, y) => x + y, 0) / hpm.length, frames: m.rounds.reduce((s, r) => s + r.frames, 0), wall,
    A: sideStats(A), B: sideStats(B),
  };
  return record ? { res, log: m.log } : { res };
}

// ------------------------------------------------------------------ statistics
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const cl = (x) => Math.min(1, Math.max(0, x));
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [cl((c - r) / d), cl((c + r) / d)];
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function summarise(results) {
  const n = results.length, a = results[0].a, b = results[0].b;
  const wA = results.filter((r) => r.winner === 'A').length, wB = results.filter((r) => r.winner === 'B').length, dr = n - wA - wB;
  const half = (side) => { const rs = results.filter((r) => r.aSide === side); const k = rs.filter((r) => r.winner === 'A').length; return { n: rs.length, wins: k, rate: rs.length ? k / rs.length : 0, ci: wilson(k, rs.length) }; };
  const per = (key) => ({
    dmg: mean(results.map((r) => r[key].dmg)), hits: mean(results.map((r) => r[key].hits)), blocked: mean(results.map((r) => r[key].blocked)),
    hitRatio: (() => { const h = results.reduce((s, r) => s + r[key].hits, 0), bl = results.reduce((s, r) => s + r[key].blocked, 0); return h + bl ? h / (h + bl) : 0; })(),
    chip: mean(results.map((r) => r[key].chip)), ults: mean(results.map((r) => r[key].ults)), ultHits: mean(results.map((r) => r[key].ultHits)),
    heavyWhiffs: mean(results.map((r) => r[key].heavyWhiffs)), lights: mean(results.map((r) => r[key].lights)), heavies: mean(results.map((r) => r[key].heavies)),
    decisions: mean(results.map((r) => r[key].decisions)),
    msMean: mean(results.map((r) => r[key].msMean)), msP95: (() => { const xs = results.map((r) => r[key].msP95).sort((x, y) => x - y); return xs[Math.floor(xs.length * 0.95)] ?? 0; })(),
    work: mean(results.map((r) => r[key].work)),
  });
  return {
    a, b, n, winsA: wA, winsB: wB, draws: dr, winRateA: wA / n, ciA: wilson(wA, n), winRateB: wB / n, ciB: wilson(wB, n), drawRate: dr / n,
    hpMarginA: mean(results.map((r) => r.hpMargin)), timeoutRate: mean(results.map((r) => r.timeouts / r.rounds)),
    rounds: mean(results.map((r) => r.rounds)), frames: mean(results.map((r) => r.frames)),
    asP1: half(0), asP2: half(1), A: per('A'), B: per('B'),
  };
}
const pct = (x) => (100 * x).toFixed(1) + '%';
const ci = (c) => `[${(100 * c[0]).toFixed(0)}-${(100 * c[1]).toFixed(0)}]`;
export function printSummary(s) {
  console.log(`\n== ${s.a} (A) vs ${s.b} (B): ${s.n} matches, Samurai mirror`);
  console.log(`  A wins ${s.winsA} ${pct(s.winRateA)} ${ci(s.ciA)} | B wins ${s.winsB} ${pct(s.winRateB)} ${ci(s.ciB)} | draws ${pct(s.drawRate)} | A HP margin/round ${(100 * s.hpMarginA).toFixed(1)}% | time-outs ${pct(s.timeoutRate)}`);
  console.log(`  A as P1 ${pct(s.asP1.rate)} ${ci(s.asP1.ci)}  A as P2 ${pct(s.asP2.rate)} ${ci(s.asP2.ci)}  | rounds/match ${s.rounds.toFixed(2)}, frames/match ${s.frames.toFixed(0)}`);
  for (const [k, x] of [['A', s.A], ['B', s.B]]) {
    console.log(`  ${k} ${k === 'A' ? s.a : s.b}: dmg ${x.dmg.toFixed(0)}, hits ${x.hits.toFixed(1)}, blocked ${x.blocked.toFixed(1)} (hit ratio ${pct(x.hitRatio)}), chip ${x.chip.toFixed(0)}, ult ${x.ults.toFixed(2)}/${x.ultHits.toFixed(2)} landed, heavy whiffs ${x.heavyWhiffs.toFixed(2)}, decisions ${x.decisions.toFixed(0)}, ${x.msMean.toFixed(2)} ms (p95 ${x.msP95.toFixed(2)}), work/decision ${x.work.toFixed(0)}`);
  }
}

const CSV_COLS = ['id', 'a', 'b', 'aSide', 'winner', 'roundsA', 'roundsB', 'rounds', 'timeouts', 'hpMargin', 'frames', 'wall'];
const SIDE_COLS = ['dmg', 'hits', 'blocked', 'blocksMade', 'chip', 'ults', 'ultHits', 'heavies', 'heavyHits', 'heavyWhiffs', 'lights', 'lightHits', 'decisions', 'msMean', 'msP95', 'work', 'mistakes'];
export function toCsv(results) {
  const head = [...CSV_COLS, ...SIDE_COLS.map((c) => 'A_' + c), ...SIDE_COLS.map((c) => 'B_' + c)].join(',');
  const f = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(4)) : v);
  return [head, ...results.map((r) => [...CSV_COLS.map((c) => f(r[c])), ...SIDE_COLS.map((c) => f(r.A[c])), ...SIDE_COLS.map((c) => f(r.B[c]))].join(','))].join('\n');
}

// ------------------------------------------------------------------ parallel runner
export async function runJobs(jobs, nWorkers, onResult = null) {
  if (nWorkers <= 1 || jobs.length < 4) return jobs.map((j) => { const r = playMatch(j).res; onResult?.(r); return r; });
  const out = new Array(jobs.length);
  let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    for (let w = 0; w < nWorkers; w++) {
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { worker: 'arena' } });
      const feed = () => { if (next < jobs.length) { const i = next++; wk.postMessage({ i, job: jobs[i] }); } else wk.terminate(); };
      wk.on('message', ({ i, res }) => { out[i] = res; onResult?.(res); done++; if (done % 50 === 0) process.stdout.write(`  ${done}/${jobs.length}\r`); if (done === jobs.length) resolve(); feed(); });
      wk.on('error', reject);
      feed();
    }
  });
  return out;
}

export function loadGaWeights(o) {
  const f = o.weights && o.weights !== true ? o.weights : join(HERE, 'out', 'ga_best.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).weights : {};
}

export function makeJobs(a, b, o, weights) {
  const budgets = [budgetFor(a, o, 'b1'), budgetFor(b, o, 'b2')];
  const seed = o.pairSeed ?? o.seed;
  const kv = (x) => (x && x !== true ? Object.fromEntries(String(x).split(',').map((p) => { const [k, v] = p.split('='); return [k, isNaN(+v) ? v : +v]; })) : {});
  const extra = [kv(o.o1), kv(o.o2)];
  const levels = o.l1 || o.l2 ? [o.l1 || o.level || null, o.l2 || o.level || null] : null;
  const lats = [+(o.lat1 || 0), +(o.lat2 || 0)];
  return Array.from({ length: o.matches }, (_, id) => ({ a, b, id, seed, chars: o.chars, budgets, level: o.level || null, levels, lats, react: o.react, weights, extra }));
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  mkdirSync(o.out, { recursive: true });
  const nW = o.workers ? +o.workers : Math.max(1, cpus().length);
  const weights = loadGaWeights(o);
  if (o.replay !== undefined) {
    const id = +o.replay;
    const job = makeJobs(o.p1, o.p2, o, weights)[0];
    const { res, log } = playMatch({ ...job, id, record: true });
    const file = join(o.out, `replay_${o.p1}_vs_${o.p2}_s${o.seed}_m${id}.json`);
    writeFileSync(file, JSON.stringify(log));
    console.log(`match ${id}: winner ${res.winner} (A=${o.p1} on side ${res.aSide}), ${res.frames} fight frames, rounds ${res.roundsA}-${res.roundsB}`);
    console.log(`wrote ${file} (${log.inputs.length} frames of inputs, ${log.checkpoints.length} hash checkpoints). Load it in the game: AI vs AI -> Replay.`);
    return;
  }
  const tag = o.tag || (o.roundrobin ? 'roundrobin' : `${o.p1}_vs_${o.p2}`);
  const pairs = [];
  if (o.roundrobin) {
    const names = String(o.roundrobin).split(',');
    const skip = new Set(o.skip ? String(o.skip).split(',') : []);
    for (let i = 0; i < names.length; i++) for (let j = i; j < names.length; j++) if (!skip.has(`${names[i]}-${names[j]}`)) pairs.push([names[i], names[j]]);
  } else pairs.push([o.p1, o.p2]);
  const all = [], summaries = [];
  const t0 = performance.now();
  for (const [a, b] of pairs) {
    const t1 = performance.now();
    const jl = join(o.out, `${tag}_${a}_vs_${b}.jsonl`);
    const prev = o.resume && existsSync(jl) ? readFileSync(jl, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    if (!o.resume) writeFileSync(jl, '');
    const have = new Set(prev.map((r) => r.id));
    const [idLo, idHi] = o.ids ? String(o.ids).split('-').map(Number) : [0, Infinity];
    const todo = makeJobs(a, b, { ...o, pairSeed: o.seed }, weights).filter((j) => !have.has(j.id) && j.id >= idLo && j.id <= idHi);
    if (todo.length) console.log(`${a} vs ${b}: ${prev.length} done, ${todo.length} to play`);
    const fresh = await runJobs(todo, nW, (r) => appendFileSync(jl, JSON.stringify(r) + '\n'));
    const res = [...prev, ...fresh].sort((x, y) => x.id - y.id);
    const s = summarise(res);
    s.wallSec = (performance.now() - t1) / 1000;
    s.budgets = makeJobs(a, b, o, weights)[0]?.budgets;
    summaries.push(s); all.push(...res);
    printSummary(s);
  }
  writeFileSync(join(o.out, `${tag}_matches.csv`), toCsv(all));
  writeFileSync(join(o.out, `${tag}_summary.json`), JSON.stringify({ args: o, summaries }, null, 1));
  console.log(`\n${all.length} matches in ${((performance.now() - t0) / 1000).toFixed(1)} s on ${nW} worker(s) -> ${join(o.out, tag + '_matches.csv')}, ${tag}_summary.json`);
}

if (!isMainThread && workerData?.worker === 'arena') {
  parentPort.on('message', ({ i, job }) => parentPort.postMessage({ i, res: playMatch(job).res }));
} else if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
