// Do the agents use the Samurai's newer tools? (stepping thrust, iai -> thrust -> cleave chain, projectile parry) and do
// Shinobi agents answer the Crimson Tempest waves (duck / jump / dash through / block)?
//   node game/tools/test_ai_moveset.mjs [--quick]
// Scenarios are played through the same sanitised views the game uses (reaction delay 0 here: pure algorithm behaviour).
import { Sim, BTN } from '../src/sim.js';
import { sanitise } from '../src/ai/view.js';
import { makeAgent } from '../src/ai/registry.js';

const quick = process.argv.includes('--quick');
const BUDGET = { minimax: { nodes: 600 }, mcts: { rollouts: 250 }, fuzzy: null };
const AGENTS = ['minimax', 'mcts', 'fuzzy'];
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

/** run `frames` frames; side `aSide` is the agent, the other side plays `script(sim, i)`; returns events + chosen macros */
function run({ chars, x, agent, aSide, script, frames, setup, seed = 7 }) {
  const sim = new Sim({ chars, autoReset: false });
  sim.f[0].x = x[0]; sim.f[1].x = x[1];
  setup?.(sim);
  const a = makeAgent(agent, { side: aSide, seed, budget: BUDGET[agent] || undefined });
  const picks = {};
  const decide = a.decide.bind(a);
  a.decide = (s) => { const m = decide(s); picks[m.id] = (picks[m.id] || 0) + 1; return m; };
  const ev = [];
  for (let i = 0; i < frames; i++) {
    const inp = [0, 0];
    inp[aSide] = a.act(sanitise(sim.clone(), aSide), sim.frame, 0);
    inp[1 - aSide] = script(sim, i);
    sim.step(inp);
    for (const e of sim.events) ev.push({ ...e, i });
    if (sim.f.some((f) => f.ko)) break;
  }
  return { sim, ev, picks };
}
const count = (ev, f) => ev.filter(f).length;
const fmt = (p) => Object.entries(p).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' ');

// ---------------------------------------------------------------- A. Samurai agent vs a kunai zoner
// the Shinobi stays at range and throws whenever she can; before this update the only answer was guard (chip every throw)
console.log('\n== A. Samurai agent vs a kunai-throwing Shinobi (stays at range, throws every ~45 frames)');
for (const ag of AGENTS) {
  const r = run({
    chars: ['samurai', 'shinobi'], x: [1400, 3400], agent: ag, aSide: 0, frames: quick ? 500 : 900,
    script: (sim, i) => { // keeps 1500+ away (hops back when he closes in) and throws whenever her kunai is ready
      const d = Math.abs(sim.f[0].x - sim.f[1].x), back = sim.f[1].facing > 0 ? BTN.L : BTN.R;
      if (d < 1900) return i % 30 < 2 ? BTN.DASH | back : back; // (outside the stepping thrust's ~1540 reach)
      return i % 4 === 0 ? BTN.T : 0;
    },
  });
  const parries = count(r.ev, (e) => e.kind === 'parry' && e.def === 0);
  const thrustHits = count(r.ev, (e) => e.kind === 'hit' && e.target === 1);
  const kunaiTaken = count(r.ev, (e) => (e.kind === 'hit' || e.kind === 'block') && (e.target === 0 || e.def === 0));
  console.log(`   ${ag.padEnd(8)} parries ${parries}, kunai blocked/taken ${kunaiTaken}, hits landed ${thrustHits}, HP ${r.sim.f[0].hp} vs ${r.sim.f[1].hp} | ${fmt(r.picks)}`);
  ok(parries >= 1 || r.sim.f[1].hp === 0, `${ag}: parries kunai or simply runs the zoner down (${parries} parries, zoner HP ${r.sim.f[1].hp})`);
  ok((r.picks.thrust || 0) + Object.keys(r.picks).filter((k) => k.startsWith('parry_thrust')).reduce((s, k) => s + r.picks[k], 0) + (r.picks.dash_fwd || 0) + (r.picks.walk_fwd || 0) > 0, `${ag}: closes the gap (thrust / parry-thrust / approach)`);
}

// ---------------------------------------------------------------- B. Shinobi agent vs the Crimson Tempest
console.log('\n== B. Shinobi agent vs the Samurai\'s Crimson Tempest (fired on frame 5, 1300 apart)');
for (const ag of AGENTS) {
  const seeds = quick ? [7] : [7, 8, 9];
  for (const seed of seeds) {
    const r = run({
      chars: ['samurai', 'shinobi'], x: [2000, 3300], agent: ag, aSide: 1, frames: 330, seed,
      // fired on frame 30: after the agent's opening move (a frame-0 dash, now 480 units long, would otherwise be frozen
      // mid-air by the super flash and carried into the first wave: a scenario artefact, not a dodge decision)
      setup: (s) => { s.f[0].meter = 100; }, script: (sim, i) => (i === 30 ? BTN.ULT : 0),
    });
    const cine = r.ev.find((e) => e.kind === 'cine');
    const blocks = count(r.ev, (e) => e.kind === 'block' && e.def === 1);
    const dodges = Object.entries(r.picks).filter(([k]) => ['crouch', 'jump_up', 'dash_fwd', 'wait_short'].includes(k)).map(([k, v]) => `${k}×${v}`).join(' ');
    const outcome = cine ? `HIT by the ${cine.shape} wave -> cinematic` : blocks ? `blocked ${blocks}` : 'dodged everything';
    console.log(`   ${ag.padEnd(8)} seed ${seed}: ${outcome}, HP ${r.sim.f[1].hp} | dodge macros ${dodges || '-'} | ${fmt(r.picks)}`);
    ok(!cine, `${ag} seed ${seed}: is not caught by the cinematic`);
  }
}

// ---------------------------------------------------------------- C. Samurai agent vs Samurai ultimate (parry the waves)
console.log('\n== C. Samurai agent vs a Samurai\'s Crimson Tempest');
for (const ag of AGENTS) {
  const r = run({
    chars: ['samurai', 'samurai'], x: [2000, 3250], agent: ag, aSide: 1, frames: 300,
    setup: (s) => { s.f[0].meter = 100; }, script: (sim, i) => (i === 5 ? BTN.ULT : 0),
  });
  const parries = count(r.ev, (e) => e.kind === 'parry' && e.def === 1), blocks = count(r.ev, (e) => e.kind === 'block' && e.def === 1);
  console.log(`   ${ag.padEnd(8)} parries ${parries}, blocks ${blocks}, cinematic ${!!r.ev.find((e) => e.kind === 'cine')}, HP ${r.sim.f[1].hp} | ${fmt(r.picks)}`);
  ok(!r.ev.some((e) => e.kind === 'cine'), `${ag}: is not caught by the cinematic (parry / block / interrupt)`);
}

// ---------------------------------------------------------------- D. close range: thrust and chain get used
console.log('\n== D. Samurai agent vs a Shinobi that walks in and pokes (who uses thrust / chain)');
for (const ag of AGENTS) {
  const r = run({
    chars: ['samurai', 'shinobi'], x: [2000, 3400], agent: ag, aSide: 0, frames: quick ? 600 : 1200,
    script: (sim, i) => { const d = Math.abs(sim.f[0].x - sim.f[1].x); return d > 700 ? BTN.L : [BTN.P, 0, 0, BTN.K, 0, 0, BTN.B, BTN.B][Math.floor(i / 9) % 8]; },
  });
  const used = (r.picks.thrust || 0) + (r.picks.chain || 0);
  console.log(`   ${ag.padEnd(8)} thrust ${r.picks.thrust || 0}, chain ${r.picks.chain || 0}, 3-hit chains landed ${count(r.ev, (e) => e.kind === 'hit' && e.target === 1 && e.move === 'heavy')}, HP ${r.sim.f[0].hp} vs ${r.sim.f[1].hp} | ${fmt(r.picks)}`);
  ok(used > 0, `${ag}: uses the thrust or the chain`);
}

// ---------------------------------------------------------------- E. kawarimi: used against a heavy-swinging Samurai
console.log('\n== E. Shinobi agent vs a Samurai that walks in and cleaves (kawarimi as a read)');
for (const ag of AGENTS) {
  const r = run({
    chars: ['samurai', 'shinobi'], x: [2000, 3000], agent: ag, aSide: 1, frames: quick ? 700 : 1200,
    setup: (s) => { s.f[1].meter = 100; }, // kawarimi costs meter
    script: (sim, i) => { const d = Math.abs(sim.f[0].x - sim.f[1].x); return d > 820 ? BTN.R : i % 40 === 0 ? BTN.S : 0; },
  });
  const subs = count(r.ev, (e) => e.kind === 'kawarimi');
  console.log(`   ${ag.padEnd(8)} kawarimi stances ${r.picks.kawarimi || 0}, substitutions ${subs}, HP ${r.sim.f[1].hp} vs ${r.sim.f[0].hp} | ${fmt(r.picks)}`);
  // (with the meter cost an agent may rather spend the bar on its ultimate: winning the exchange is what counts)
  ok(subs >= 1 || r.sim.f[1].hp > r.sim.f[0].hp, `${ag}: beats the heavy-swinger (${subs} substitutions landed)`);
}
// ---------------------------------------------------------------- F. kawarimi is not abusable
console.log('\n== F. abuse check: a Shinobi that seals whenever she can vs each Samurai agent');
for (const ag of AGENTS) {
  const r = run({
    chars: ['samurai', 'shinobi'], x: [2100, 2900], agent: ag, aSide: 0, frames: quick ? 700 : 1500,
    setup: (s) => { s.f[1].meter = 100; }, // a full bar: four casts before she runs dry
    script: (sim, i) => (i % 2 === 0 ? BTN.B | BTN.P : BTN.B), // mashes guard + light every other frame
  });
  const subs = count(r.ev, (e) => e.kind === 'kawarimi');
  console.log(`   ${ag.padEnd(8)} substitutions ${subs}, HP samurai ${r.sim.f[0].hp} vs spammer ${r.sim.f[1].hp} | ${fmt(r.picks)}`);
  ok(r.sim.f[0].hp > r.sim.f[1].hp, `${ag}: beats a kawarimi spammer`);
}

// ---------------------------------------------------------------- G. kawarimi only against a real threat (user report 2026-10-17)
// it used to be started at a Samurai lying on the ground (the 38-frame stance doubled as a "wait" for a meaty on his wake-up)
console.log('\n== G. full hard-level matches: what is the Samurai doing when a Shinobi agent starts kawarimi?');
{
  const { Match, AgentController } = await import('../src/ai/match.js');
  const { phase } = await import('../src/ai/features.js');
  for (const ag of AGENTS) {
    const tally = {}; let bad = 0;
    for (let seed = 1; seed <= (quick ? 2 : 4); seed++) {
      const agents = [makeAgent('mcts', { side: 0, seed, mode: 'nodes', level: 'hard' }), makeAgent(ag, { side: 1, seed: seed + 100, mode: 'nodes', level: 'hard' })];
      const d0 = agents[1].decide.bind(agents[1]);
      agents[1].decide = (sim) => {
        const m = d0(sim);
        if (m.id === 'kawarimi') { const o = sim.f[0], k = o.state === 'attack' ? 'attack:' + phase(sim, o) : o.state; tally[k] = (tally[k] || 0) + 1; if (!/^(idle|walk|guard|dash|run|runstop|land|attack:startup|attack:active)$/.test(k)) bad++; }
        return m;
      };
      const m = new Match({ chars: ['samurai', 'shinobi'], controllers: agents.map((a) => new AgentController(a)) });
      while (!m.over) m.step();
    }
    console.log(`   ${ag.padEnd(8)} kawarimi starts by Samurai state: ${JSON.stringify(tally)}`);
    ok(bad === 0, `${ag}: never starts kawarimi at a downed / stunned / recovering Samurai (${bad} wasted)`);
  }
}

console.log(fails ? `\n${fails} FAILED` : '\nall AI moveset checks passed');
process.exit(fails ? 1 : 0);
