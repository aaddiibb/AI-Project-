// Stage 1 evidence: the Samurai in the simulator (prompt 05 §8 acceptance item 2).
//   node game/tools/test_samurai.mjs
// Checks input masking, the grounded back-dash, levels / chip / knockdown of every move, the crescent ultimate (hits,
// blocked with chip, not avoided by crouching, jumpable) and mixed Shinobi vs Samurai matches.
import { Sim, BTN } from '../src/sim.js';

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const { L, R, U, D, P, K, S, T, B, DASH, ULT } = BTN;

/** run frames with input functions per side; returns the sim and all events */
function play(sim, frames, in0, in1 = () => 0) {
  const ev = [];
  for (let i = 0; i < frames; i++) { sim.step([in0(i, sim), in1(i, sim)]); for (const e of sim.events) ev.push({ ...e, frame: sim.frame }); }
  return ev;
}
const at = (x0, x1, chars = ['samurai', 'samurai']) => { const s = new Sim({ chars, autoReset: false }); s.f[0].x = x0; s.f[1].x = x1; return s; };
const tap = (bits, when = 0) => (i) => (i === when ? bits : 0);

// --- masking ------------------------------------------------------------------------------------------------------
{
  const s = at(1500, 3600);
  play(s, 40, () => U);
  ok(s.f[0].state === 'idle' && s.f[0].h === 0, `W (jump) is ignored: state ${s.f[0].state}, h ${s.f[0].h}`);
  play(s, 20, () => D);
  ok(s.f[0].state === 'idle' && !s.sim, `S (crouch) is ignored: state ${s.f[0].state}`);
  const ev = play(s, 30, tap(K));
  ok(s.f[0].state !== 'attack' && !ev.some((e) => e.kind === 'throw'), 'K (kick) does nothing');
  play(s, 30, tap(T));
  ok(!s.projectiles.length, 'I (kunai throw) does nothing');
  const x0 = s.f[0].x;
  play(s, 30, (i) => (i < 2 || (i >= 4 && i < 30) ? R : 0));
  ok(s.f[0].state === 'walk' && Math.abs(s.f[0].vx - 9.2) < 1e-9, `double-tap forward + hold = walk, not run (state ${s.f[0].state}, vx ${s.f[0].vx})`);
  ok(s.f[0].x > x0, 'walked forward');
}
// --- dash / back-dash ---------------------------------------------------------------------------------------------
{
  const s = at(2000, 4200); const x0 = s.f[0].x; let maxH = 0, states = new Set();
  play(s, 40, (i, sim) => { maxH = Math.max(maxH, sim.f[0].h); states.add(sim.f[0].state); return i === 0 ? DASH : 0; });
  ok(states.has('dash') && s.f[0].x - x0 > 250, `dash forward travels ${Math.round(s.f[0].x - x0)} units`);
  const x1 = s.f[0].x; maxH = 0; states = new Set(); let t = 0;
  play(s, 40, (i, sim) => { maxH = Math.max(maxH, sim.f[0].h); states.add(sim.f[0].state); if (sim.f[0].state === 'backdash') t++; return i === 0 ? DASH | L : 0; });
  ok(states.has('backdash') && !states.has('backhop') && maxH === 0, `Shift+back = GROUNDED back-dash (max height ${maxH}, states ${[...states]})`);
  ok(x1 - s.f[0].x > 200 && t === 22, `back-dash travels ${Math.round(x1 - s.f[0].x)} units in ${t} frames (backdashTotal 22)`);
  const x2 = s.f[0].x; states = new Set();
  play(s, 40, (i, sim) => { states.add(sim.f[0].state); return i === 0 || i === 3 ? L : 0; });
  ok(states.has('backdash') && s.f[0].x < x2, 'double-tap back = grounded back-dash');
}
// --- light: mid, blocked standing, no chip ---------------------------------------------------------------------------
{
  const s = at(2000, 2900);
  const ev = play(s, 40, tap(P));
  const hit = ev.find((e) => e.kind === 'hit');
  ok(hit && hit.dmg === 90 && s.f[1].hp === 910, `light (iai cut) hits at 900 apart for ${hit?.dmg} (hp ${s.f[1].hp})`);
  const s2 = at(2000, 2900);
  const ev2 = play(s2, 40, tap(P), () => B);
  ok(ev2.some((e) => e.kind === 'block') && s2.f[1].hp === 1000, `light is blocked standing with no chip (hp ${s2.f[1].hp})`);
  const s3 = at(2000, 3300);
  play(s3, 40, tap(P));
  ok(s3.f[1].hp === 1000, 'light whiffs at 1,300 apart (reach 1,036 + lunge 48 + hurtbox 180 = 1,264)');
}
// --- heavy: overhead, knockdown, chip 25% ---------------------------------------------------------------------------
{
  const s = at(2000, 2800);
  const ev = play(s, 60, tap(S));
  const hit = ev.find((e) => e.kind === 'hit');
  ok(hit && hit.dmg === 210 && ev.some((e) => e.kind === 'land' && e.down), `heavy hits for ${hit?.dmg} and knocks down`);
  const s2 = at(2000, 2800);
  const ev2 = play(s2, 60, tap(S), () => B);
  const blk = ev2.find((e) => e.kind === 'block');
  ok(blk && blk.chip === 53 && s2.f[1].hp === 947, `heavy blocked standing deals chip ${blk?.chip} (25% of 210), hp ${s2.f[1].hp}`);
  // overhead vs a crouch-blocking Shinobi: hits
  const s3 = at(2000, 2800, ['samurai', 'shinobi']);
  const ev3 = play(s3, 60, tap(S), () => B | D);
  ok(ev3.some((e) => e.kind === 'hit'), 'heavy (overhead) hits a crouch-blocking Shinobi');
  // a Samurai cannot crouch-block: the Shinobi's low (sweep) hits his stand-block
  const s4 = at(2000, 2700, ['shinobi', 'samurai']);
  const ev4 = play(s4, 60, (i) => (i < 3 ? D : i === 3 ? D | K : D), () => B | D);
  ok(ev4.some((e) => e.kind === 'hit'), "Shinobi's sweep (low) beats the Samurai's guard (B+S is masked to a stand-block)");
}
// --- ultimate: Crimson Crescent ----------------------------------------------------------------------------------
{
  const s = at(2000, 3200); s.f[0].meter = 100;
  const ev = play(s, 120, tap(ULT));
  ok(ev.some((e) => e.kind === 'super') && ev.some((e) => e.kind === 'crescent'), 'U with full meter: super freeze, then the crescent spawns');
  const hit = ev.find((e) => e.kind === 'hit');
  ok(hit && hit.dmg === 500 && s.f[0].meter < 100 && ev.some((e) => e.kind === 'land' && e.down), `crescent hits for ${hit?.dmg}, no combo scaling, knockdown`);
  const s2 = at(2000, 3200); s2.f[0].meter = 50;
  const ev2 = play(s2, 80, tap(ULT));
  ok(!ev2.some((e) => e.kind === 'super'), 'U without full meter does nothing');
  const s3 = at(2000, 3200); s3.f[0].meter = 100;
  const ev3 = play(s3, 120, tap(ULT), () => B);
  const b3 = ev3.find((e) => e.kind === 'block');
  ok(b3 && b3.chip === 175 && s3.f[1].hp === 825, `crescent blocked: chip ${b3?.chip}, hp ${s3.f[1].hp}`);
  const s4 = at(2000, 3200, ['samurai', 'shinobi']); s4.f[0].meter = 100;
  const ev4 = play(s4, 120, tap(ULT), () => D);
  ok(ev4.some((e) => e.kind === 'hit'), 'crescent is NOT avoided by crouching (it is low: y 0..300)');
  // jumpable: a Shinobi jumping as the crescent arrives clears it
  const s5 = at(2000, 3600, ['samurai', 'shinobi']); s5.f[0].meter = 100;
  let jumpAt = -1;
  const ev5 = play(s5, 140, tap(ULT), (i, sim) => {
    const p = sim.projectiles[0];
    if (p && jumpAt < 0 && Math.abs(p.x - sim.f[1].x) < 900) jumpAt = i;
    return jumpAt >= 0 && i < jumpAt + 14 ? U : 0;
  });
  ok(!ev5.some((e) => e.kind === 'hit') && s5.f[1].hp === 1000, `crescent is jumpable (Shinobi jumps when it is ~900 away; jumping at 700 is too late: hp ${s5.f[1].hp})`);
  const s6 = at(2000, 4300); s6.f[0].meter = 100;
  const ev6 = play(s6, 140, tap(ULT));
  ok(!ev6.some((e) => e.kind === 'hit'), 'crescent runs out before 2,300 units (range ~1,500 + 420 offset)');
}
// --- mirror palettes / mixed match sanity ------------------------------------------------------------------------
{
  const s = new Sim({ chars: ['shinobi', 'samurai'] });
  play(s, 600, (i) => [R, P, K, S, 0, B][Math.floor(i / 20) % 6], (i) => [L, P, S, 0, B, DASH][Math.floor(i / 23) % 6]);
  ok(s.frame === 600 && s.f.every((f) => Number.isFinite(f.x)), 'mixed Shinobi vs Samurai runs 600 frames');
}

console.log(fails ? `\n${fails} FAILED` : '\nall Samurai checks passed');
process.exit(fails ? 1 : 0);
