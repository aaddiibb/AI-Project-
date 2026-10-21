// Stage 2 evidence: sim.clone() / sim.hash() (prompt 05 §4.2).
//   node game/tools/test_clone.mjs
// 1. Clone equality: clone mid-fight, step original and clone with the same random inputs for 600 frames, compare hash()
//    every frame (repeated from several start points, Samurai mirror, Shinobi mirror and mixed).
// 2. hash() stability: two independent sims fed the same inputs hash identically; one differing input changes the hash.
// 3. Timing: hand-written clone() vs structuredClone of the same state, and simulator frames per second.
import { Sim, BTN } from '../src/sim.js';
import { Rng } from '../src/ai/rng.js';

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const keys = [0, BTN.L, BTN.R, BTN.P, BTN.S, BTN.B, BTN.DASH, BTN.DASH | BTN.L, BTN.ULT, BTN.K, BTN.D, BTN.U, BTN.T];
const randBits = (r) => keys[r.int(keys.length)] | (r.next() < 0.3 ? keys[r.int(keys.length)] : 0);

for (const chars of [['samurai', 'samurai'], ['shinobi', 'shinobi'], ['shinobi', 'samurai']]) {
  const r = new Rng(7);
  const sim = new Sim({ chars, autoReset: true });
  let worst = 0, checks = 0, frames = 0;
  for (let start = 0; start < 5; start++) {
    for (let i = 0; i < 300 + start * 137; i++) sim.step([randBits(r), randBits(r)]);
    sim.f[0].meter = 100; sim.f[1].meter = 70 + start * 6;
    const c = sim.clone();
    if (c.hash() !== sim.hash()) { worst++; }
    for (let i = 0; i < 600; i++) {
      const inp = [randBits(r), randBits(r)];
      sim.step(inp); c.step(inp); checks++; frames++;
      if (c.hash() !== sim.hash()) { worst++; break; }
    }
    // the clone is independent: mutating it does not touch the original
    const before = sim.hash(); c.f[0].x += 1; c.f[0].buf.P = 5; c.projectiles.push({ owner: 0, x: 0, h: 0, vx: 0, dir: 1, life: 1, spec: { dmg: 1 }, id: -1 });
    if (sim.hash() !== before) worst++;
  }
  ok(worst === 0, `${chars.join(' vs ')}: clone stepped in lockstep with the original, ${checks} frame hashes equal over 5 starts x 600 frames; clone is independent`);
}

{ // hash stability
  const a = new Sim({ chars: ['samurai', 'samurai'] }), b = new Sim({ chars: ['samurai', 'samurai'] });
  const r1 = new Rng(3), r2 = new Rng(3);
  let same = true;
  for (let i = 0; i < 2000; i++) { a.step([randBits(r1), randBits(r1)]); b.step([randBits(r2), randBits(r2)]); if (a.hash() !== b.hash()) same = false; }
  ok(same, 'two sims with identical inputs hash identically for 2,000 frames');
  const h = a.hash(); b.step([BTN.P, 0]); a.step([0, 0]);
  ok(a.hash() !== h && a.hash() !== b.hash(), 'one different input changes the hash');
}

{ // timing
  const sim = new Sim({ chars: ['samurai', 'samurai'] }), r = new Rng(11);
  for (let i = 0; i < 500; i++) sim.step([randBits(r), randBits(r)]);
  sim.newRound(); sim.f[0].meter = 100; sim.step([BTN.ULT, 0]); for (let i = 0; i < 60; i++) sim.step([0, 0]); // a projectile in flight
  const N = 200000;
  let t = performance.now(); for (let i = 0; i < N; i++) sim.clone(); const tc = (performance.now() - t) * 1000 / N;
  const plain = () => ({ f: sim.f, projectiles: sim.projectiles, comboShow: sim.comboShow, lastHit: sim.lastHit, hitstop: sim.hitstop, superFreeze: sim.superFreeze, frame: sim.frame, koTimer: sim.koTimer });
  t = performance.now(); for (let i = 0; i < N / 10; i++) structuredClone(plain()); const ts = (performance.now() - t) * 1000 / (N / 10);
  t = performance.now(); for (let i = 0; i < N; i++) sim.hash(); const th = (performance.now() - t) * 1000 / N;
  console.log(`TIMING clone() ${tc.toFixed(2)} µs, structuredClone ${ts.toFixed(2)} µs (${(ts / tc).toFixed(1)}x slower), hash() ${th.toFixed(2)} µs  [projectiles in flight: ${sim.projectiles.length}]`);
  ok(tc * 3 < ts, 'hand-written clone is several times cheaper than structuredClone');
  for (const chars of [['samurai', 'samurai'], ['shinobi', 'shinobi']]) {
    const s = new Sim({ chars }), rr = new Rng(5), M = 600000, inps = Array.from({ length: 4096 }, () => [randBits(rr), randBits(rr)]);
    t = performance.now(); for (let i = 0; i < M; i++) s.step(inps[i & 4095]); const dt = performance.now() - t;
    console.log(`TIMING ${chars.join(' vs ')} sim: ${Math.round(M / dt * 1000).toLocaleString('en')} frames/s (${(dt * 1000 / M).toFixed(2)} µs/frame)`);
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nall clone/hash checks passed');
process.exit(fails ? 1 : 0);
