// Stage 3 evidence: a short headless log of decisions per agent with its reasoning.
//   node game/tools/decision_log.mjs --p1 minimax --p2 mcts [--seed 1] [--frames 900] [--react 9] [--b1 nodes:600 --b2 rollouts:250]
// Prints every decision of both agents for the first --frames fight frames: the situation each saw (distance, gap to the
// opponent's body, both phases), the macro chosen and why (Minimax: depth / nodes / worst-case values / PV; MCTS: rollouts /
// visits / means; Fuzzy: aggression / defence / strongest rules), interleaved with hits and blocks.
import { Match, AgentController } from '../src/ai/match.js';
import { makeAgent, parseBudget } from '../src/ai/registry.js';
import { features } from '../src/ai/features.js';
import { parseArgs } from './arena.mjs';

const o = parseArgs(process.argv.slice(2));
const names = [o.p1 || 'minimax', o.p2 || 'mcts'];
const frames = +(o.frames || 900);
const kv = (x) => (x && x !== true ? Object.fromEntries(String(x).split(',').map((p) => { const [k, v] = p.split('='); return [k, isNaN(+v) ? v : +v]; })) : {});
const agents = names.map((n, side) => makeAgent(n, { ...kv(o['o' + (side + 1)]), side, seed: 100 + side, reactionFrames: +(o.react ?? 9), mistakeRate: 0, budget: parseBudget(o['b' + (side + 1)]) || undefined }));
const lines = [];
agents.forEach((a, side) => {
  const orig = a.decide.bind(a);
  a.decide = (sim) => {
    const m = orig(sim), F = features(sim, side), t = a.thinking();
    let why = '';
    if (t.algo === 'minimax') why = `depth ${t.depth}, ${t.nodes} nodes, value ${t.value.toFixed(0)} | worst cases: ${t.rows.slice(0, 4).map((r) => `${r.id}${r.bound ? '≤' : '='}${r.v.toFixed(0)}`).join(' ')} | PV ${t.pv.map((p) => p.join('/')).join(' > ')}`;
    else if (t.algo === 'mcts') why = `${t.rollouts} rollouts, win ${(100 * t.winProb).toFixed(0)}% | visits: ${t.rows.slice(0, 4).map((r) => `${r.id} ${r.visits}(${(100 * r.mean).toFixed(0)}%)`).join(' ')} | opp model: ${t.opRows.map((r) => r.id + ' ' + r.visits).join(', ')}`;
    else if (t.algo === 'fuzzy') why = `aggression ${t.aggression.toFixed(2)}, defence ${t.defence.toFixed(2)} | ${t.top.map((r) => `"${r.label}" ${r.w.toFixed(2)}`).join('; ')}`;
    else why = t.rule || '';
    lines.push(`f${String(sim.frame).padStart(5)}  P${side + 1} ${a.name.padEnd(8)} sees gap ${String(Math.round(F.gap)).padStart(5)} me:${F.myPhase.padEnd(8)} opp:${F.opPhase.padEnd(8)} -> ${m.id.padEnd(9)} ${why}`);
    return m;
  };
});
const match = new Match({ chars: ['samurai', 'samurai'], controllers: agents.map((a) => new AgentController(a)) });
while (!match.over && match.fightFrame < frames) {
  match.step();
  for (const e of match.sim.events) {
    if (e.kind === 'hit') lines.push(`f${String(match.sim.frame).padStart(5)}  ** HIT  P${2 - e.target} -> P${e.target + 1}: ${e.move} ${e.dmg}${e.counter ? ' COUNTER' : ''}  (HP ${match.sim.f.map((f) => f.hp).join(' / ')})`);
    if (e.kind === 'block') lines.push(`f${String(match.sim.frame).padStart(5)}  ** BLOCK by P${e.def + 1}${e.chip ? ` (chip ${e.chip})` : ''}`);
    if (e.kind === 'super') lines.push(`f${String(match.sim.frame).padStart(5)}  ** ULTIMATE by P${e.id + 1}`);
  }
}
console.log(`# ${names[0]} (P1) vs ${names[1]} (P2), Samurai mirror, reaction ${o.react ?? 9} frames, first ${frames} fight frames`);
console.log(lines.join('\n'));
console.log(`# after ${match.fightFrame} frames: HP ${match.sim.f.map((f) => f.hp).join(' / ')}, rounds won ${match.wins.join('-')}`);
