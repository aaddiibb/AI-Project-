// Stage 3 evidence: agent unit tests (prompt 05 §7, stage 3).
//   node game/tools/test_agents.mjs
//  1. Minimax: alpha-beta (with and without the transposition table) returns the same root value and the same move as
//     plain maximin (no pruning, no table) on fixed positions; and it searches fewer nodes.
//  2. MCTS beats Random above 90% (Samurai mirror, sides swapped).
//  3. Fuzzy: the documented rules fire in the documented situations and map to the documented macros.
//  4. Views: the opponent's input state is wiped; a leaking view is rejected; agent randomness is seeded (replays match).
import { Sim, BTN } from '../src/sim.js';
import { MinimaxAgent } from '../src/ai/minimax.js';
import { FuzzyAgent, fuzzify, infer, RULES } from '../src/ai/fuzzy.js';
import { sanitise, assertSanitised } from '../src/ai/view.js';
import { Match, AgentController } from '../src/ai/match.js';
import { makeAgent } from '../src/ai/registry.js';
import { playMatch } from './arena.mjs';

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

// ---------------------------------------------------------------- 1. alpha-beta == maximin
function position(k) {
  const s = new Sim({ chars: ['samurai', 'samurai'], autoReset: false });
  const P = [[2000, 3100, 0, 0], [2200, 2900, 100, 0], [1500, 2400, 0, 100], [2600, 3500, 40, 60], [900, 1800, 100, 100], [2000, 3250, 0, 0]][k];
  s.f[0].x = P[0]; s.f[1].x = P[1]; s.f[0].meter = P[2]; s.f[1].meter = P[3];
  if (k === 3) s.f[1].hp = 640;
  if (k === 5) { s.step([0, BTN.S]); for (let i = 0; i < 6; i++) s.step([0, 0]); } // opponent mid-heavy (committed)
  return s;
}
let totalPlain = 0, totalAB = 0;
for (let k = 0; k < 6; k++) {
  for (const side of [0, 1]) {
    for (const depth of [1, 2]) {
      const sim = position(k);
      const plain = new MinimaxAgent({ side, alphaBeta: false, tt: false }).searchFixed(sim, depth);
      const ab = new MinimaxAgent({ side, alphaBeta: true, tt: false }).searchFixed(sim, depth);
      const abt = new MinimaxAgent({ side, alphaBeta: true, tt: true }).searchFixed(sim, depth);
      totalPlain += plain.nodes; totalAB += ab.nodes;
      const same = Math.abs(plain.v - ab.v) < 1e-9 && Math.abs(plain.v - abt.v) < 1e-9;
      // the chosen move must be optimal under maximin (ties may pick a different, equally valued macro)
      const plainRow = (id) => plain.rows.find((r) => r.id === id)?.v;
      const moveOk = Math.abs(plainRow(ab.best.id) - plain.v) < 1e-9 && Math.abs(plainRow(abt.best.id) - plain.v) < 1e-9;
      ok(same && moveOk, `pos ${k} side ${side} depth ${depth}: maximin ${plain.v.toFixed(2)} (${plain.best.id}, ${plain.nodes} nodes) = alpha-beta ${ab.v.toFixed(2)} (${ab.best.id}, ${ab.nodes}) = alpha-beta+TT ${abt.v.toFixed(2)} (${abt.best.id}, ${abt.nodes})`);
    }
  }
}
ok(totalAB < totalPlain, `alpha-beta searched ${totalAB} nodes vs ${totalPlain} for plain maximin (${(100 * (1 - totalAB / totalPlain)).toFixed(0)}% pruned)`);

// ---------------------------------------------------------------- 2. MCTS > 90% vs Random
{
  const N = 60;
  const res = Array.from({ length: N }, (_, id) => playMatch({ a: 'mcts', b: 'random', id, seed: 99, chars: ['samurai', 'samurai'], budgets: [{ rollouts: 60 }, null], level: null, react: 0, weights: {} }).res);
  const w = res.filter((r) => r.winner === 'A').length;
  ok(w / N > 0.9, `MCTS (60 rollouts) beats Random in ${w}/${N} matches (${(100 * w / N).toFixed(0)}%), sides swapped`);
  const res2 = Array.from({ length: N }, (_, id) => playMatch({ a: 'minimax', b: 'random', id, seed: 98, chars: ['samurai', 'samurai'], budgets: [{ nodes: 120 }, null], level: null, react: 0, weights: {} }).res);
  const w2 = res2.filter((r) => r.winner === 'A').length;
  ok(w2 / N > 0.9, `Minimax (120 nodes) beats Random in ${w2}/${N} matches`);
  const res3 = Array.from({ length: N }, (_, id) => playMatch({ a: 'fuzzy', b: 'random', id, seed: 97, chars: ['samurai', 'samurai'], budgets: [null, null], level: null, react: 0, weights: {} }).res);
  const w3 = res3.filter((r) => r.winner === 'A').length;
  ok(w3 / N > 0.9, `Fuzzy beats Random in ${w3}/${N} matches`);
}

// ---------------------------------------------------------------- 3. fuzzy rules
{
  const fz = (setup, side = 0) => { const s = new Sim({ chars: ['samurai', 'samurai'], autoReset: false }); setup(s); const f = fuzzify(s, side); return { ...f, ...infer(f.mu), sim: s }; };
  const rule = (r, i) => r.fired[i].w;
  // opponent whiffed a heavy just inside my reach: rule 2 (opp recovering & close -> aggression high) -> heavy punish
  const a = fz((s) => { s.f[0].x = 1900; s.f[1].x = 3200; s.step([0, BTN.S]); for (let i = 0; i < 26; i++) s.step([0, 0]); }); // 1,300 apart: the heavy whiffs
  ok(rule(a, 1) > 0.5 && a.aggression > 0.78, `opp recovering & close: rule 2 fires ${rule(a, 1).toFixed(2)}, aggression ${a.aggression.toFixed(2)}`);
  const ag = new FuzzyAgent({ side: 0, seed: 1 }); const m = ag.decide(a.sim);
  // (since the chain exists, the heavy punish is delivered through it when in iai range: iai -> thrust -> cleave, 7f startup)
  ok(m.id === 'heavy' || m.id === 'chain', `... and the agent picks ${m.id} (documented: heavy punish, via the chain in iai range)`);
  // the same whiff from further away: rule 1 (opp recovering & mid -> aggression very high)
  const a2 = fz((s) => { s.f[0].x = 1900; s.f[1].x = 3360; s.step([0, BTN.S]); for (let i = 0; i < 26; i++) s.step([0, 0]); });
  ok(rule(a2, 0) > 0.5 && a2.aggression > 0.78, `opp recovering & mid: rule 1 fires ${rule(a2, 0).toFixed(2)}, aggression ${a2.aggression.toFixed(2)} (very high)`);
  // opponent starting an attack close: defence high -> guard / back-dash
  const b = fz((s) => { s.f[0].x = 2200; s.f[1].x = 2900; s.step([0, BTN.P]); s.step([0, 0]); });
  ok(rule(b, 2) > 0.3 && b.defence > 0.6, `opp attacking & close: rule 3 fires ${rule(b, 2).toFixed(2)}, defence ${b.defence.toFixed(2)}`);
  const m2 = new FuzzyAgent({ side: 0, seed: 1 }).decide(b.sim);
  ok(m2.id === 'guard' || m2.id === 'dash_back', `... and the agent picks ${m2.id} (documented: guard / dash back)`);
  // full meter at mid range: rule 10 (ultimate)
  const c = fz((s) => { s.f[0].x = 2000; s.f[1].x = 3300; s.f[0].meter = 100; });
  const m3 = new FuzzyAgent({ side: 0, seed: 1 }).decide(c.sim);
  ok(rule(c, 9) > 0.5 && m3.id === 'ult', `meter full & mid: rule 10 fires ${rule(c, 9).toFixed(2)}, aggression ${c.aggression.toFixed(2)}, picks ${m3.id}`);
  // far away, neutral: rule 6 (advance)
  const d = fz((s) => { s.f[0].x = 800; s.f[1].x = 3800; });
  const m4 = new FuzzyAgent({ side: 0, seed: 1 }).decide(d.sim);
  ok(rule(d, 5) > 0.9 && (m4.id === 'walk_fwd' || m4.id === 'dash_fwd'), `far & neutral: rule 6 fires ${rule(d, 5).toFixed(2)}, aggression ${d.aggression.toFixed(2)} (medium), picks ${m4.id} (documented: advance)`);
  // low HP vs high HP
  const e = fz((s) => { s.f[0].x = 2000; s.f[1].x = 3150; s.f[0].hp = 150; });
  ok(rule(e, 7) > 0.9 && e.defence > 0.6, `own HP low & opp HP high: rule 8 fires ${rule(e, 7).toFixed(2)}, defence ${e.defence.toFixed(2)}`);
  ok(RULES.length >= 12, `${RULES.length} rules (>= 12 required)`);
}

// ---------------------------------------------------------------- 4. views + determinism
{
  const s = new Sim({ chars: ['samurai', 'samurai'] });
  s.step([BTN.R, BTN.P | BTN.L]); s.step([BTN.R, BTN.L]);
  const v = sanitise(s.clone(), 0);
  let threw = false; try { assertSanitised(v, 0); } catch { threw = true; }
  ok(!threw && v.f[1].buf.P === 0 && v.f[1].prev === 0 && v.f[0].prev === s.f[0].prev, "view wipes the opponent's buf / prev / tap / held flags and keeps the agent's own");
  const leak = s.clone(); let threw2 = false; try { assertSanitised(leak, 0); } catch { threw2 = true; }
  ok(threw2, 'a view that still contains the opponent inputs is rejected (assert)');
  // controllers never hand the live sim to an agent
  let sawLive = false;
  const spy = makeAgent('random', { side: 0, seed: 3 }); const orig = spy.act.bind(spy);
  const m = new Match({ chars: ['samurai', 'samurai'], controllers: [new AgentController(spy), new AgentController(makeAgent('random', { side: 1, seed: 4 }))] });
  spy.act = (view, frame, age) => { if (view === m.sim) sawLive = true; return orig(view, frame, age); };
  m.run();
  ok(!sawLive, 'agents only ever receive cloned views, never the live sim');
  // same seeds => bit-identical match; different seed => different match
  const job = { a: 'mcts', b: 'fuzzy', id: 3, seed: 5, chars: ['samurai', 'samurai'], budgets: [{ rollouts: 40 }, null], level: 'hard', react: 0, weights: {} };
  const r1 = playMatch({ ...job, record: true }), r2 = playMatch({ ...job, record: true });
  const same = JSON.stringify(r1.log.inputs) === JSON.stringify(r2.log.inputs) && JSON.stringify(r1.log.checkpoints) === JSON.stringify(r2.log.checkpoints);
  ok(same, `same seeds (with reaction delay + mistakes, level hard) replay bit-identically (${r1.log.inputs.length} frames)`);
  const r3 = playMatch({ ...job, seed: 6, record: true });
  ok(JSON.stringify(r3.log.inputs) !== JSON.stringify(r1.log.inputs), 'a different seed gives a different match');
}
console.log(fails ? `\n${fails} FAILED` : '\nall agent tests passed');
process.exit(fails ? 1 : 0);
