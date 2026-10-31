// Stage 1 evidence: the Samurai in the simulator (prompt 05 §8 acceptance item 2).
//   node game/tools/test_samurai.mjs
// Checks input masking, the grounded back-dash, levels / chip / knockdown of every move, the Crimson Tempest ultimate
// (cinematic, block / parry / dodge per wave, ult-vs-ult clashes, chip K.O.) and mixed Shinobi vs Samurai matches.
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
const FREE = new Set(['idle', 'crouch', 'walk', 'guard']);

// --- masking ------------------------------------------------------------------------------------------------------
{
  const s = at(1500, 3600);
  play(s, 40, () => U);
  ok(s.f[0].state === 'idle' && s.f[0].h === 0, `W (jump) is ignored: state ${s.f[0].state}, h ${s.f[0].h}`);
  play(s, 20, () => D);
  ok(s.f[0].state === 'idle' && !s.sim, `S (crouch) is ignored: state ${s.f[0].state}`);
  const ev = play(s, 40, tap(K));
  ok(s.f[0].state === 'idle' && !ev.some((e) => e.kind === 'throw'), 'K starts the stepping thrust (and it is over after 40 frames)');
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
  ok(blk && blk.chip === 42 && s2.f[1].hp === 958, `heavy blocked standing deals chip ${blk?.chip} (20% of 210, balance 2026-10-17), hp ${s2.f[1].hp}`);
  // overhead vs a crouch-blocking Shinobi: hits
  const s3 = at(2000, 2800, ['samurai', 'shinobi']);
  const ev3 = play(s3, 60, tap(S), () => B | D);
  ok(ev3.some((e) => e.kind === 'hit'), 'heavy (overhead) hits a crouch-blocking Shinobi');
  // a Samurai cannot crouch-block: the Shinobi's low (sweep) hits his stand-block
  const s4 = at(2000, 2700, ['shinobi', 'samurai']);
  const ev4 = play(s4, 60, (i) => (i < 3 ? D : i === 3 ? D | K : D), () => B | D);
  ok(ev4.some((e) => e.kind === 'hit'), "Shinobi's sweep (low) beats the Samurai's guard (B+S is masked to a stand-block)");
}
// --- ultimate: Crimson Tempest (three waves, clashes, cinematic) ----------------------------------------------------
/** frames until projectile p touches fighter d's hurtbox (Infinity once it has passed) */
function eta(sim, p, d) {
  const hb = sim.worldBox(d, sim.isCrouching(d) && sim.C(d).hurt.crouch ? sim.C(d).hurt.crouch : sim.C(d).hurt.stand), w = p.spec.w / 2;
  const gap = p.vx > 0 ? hb.x0 - (p.x + w) : (p.x - w) - hb.x1;
  return gap < -(2 * w + hb.x1 - hb.x0) ? Infinity : gap / Math.abs(p.vx);
}
const incoming = (sim, side, shape) => sim.projectiles.filter((p) => p.owner !== side && p.spec.shape === shape && Number.isFinite(eta(sim, p, sim.f[side])));
{
  const s = at(2000, 3200, ['samurai', 'shinobi']); s.f[0].meter = 100;
  const ev = play(s, 140, tap(ULT));
  const waves = ev.filter((e) => e.kind === 'wave');
  ok(ev.some((e) => e.kind === 'super') && waves.length >= 1 && waves[0].shape === 'high', 'U: super freeze, then the first (high) wave spawns');
  const ci = ev.find((e) => e.kind === 'cine');
  ok(ci && s.f.every((f) => f.state === 'cine') && s.projectiles.length === 0, 'a clean hit starts the cinematic: both fighters locked, remaining waves gone');
  const ev2 = play(s, 200, () => 0);
  const dmg = 1000 - s.f[1].hp, hits = [...ev, ...ev2].filter((e) => e.kind === 'hit' && e.cine).length;
  ok(dmg === 472 && hits === 17 && s.cine === null && ev2.some((e) => e.kind === 'land' && e.down), `cinematic: ${hits} cuts, ${dmg} damage (472 expected), knockdown afterwards`);
  ok(s.f[0].x > s.f[1].x, 'the Samurai ends the cinematic behind the target (sides switched)');
}
{
  const s = at(2000, 3200); s.f[0].meter = 50;
  ok(!play(s, 80, tap(ULT)).some((e) => e.kind === 'super'), 'U without full meter does nothing');
}
{ // a Samurai cannot crouch or jump: he blocks all three standing (all waves are mid) and takes chip
  const s = at(2000, 3200); s.f[0].meter = 100;
  const ev = play(s, 260, tap(ULT), () => B);
  const bl = ev.filter((e) => e.kind === 'block');
  ok(bl.length === 3 && bl.map((e) => e.chip).join() === '40,40,70' && s.f[1].hp === 850 && !ev.some((e) => e.kind === 'cine'), `Samurai blocks all three waves standing: chip ${bl.map((e) => e.chip).join(' + ')}, hp ${s.f[1].hp}`);
}
{ // ... or parries them one by one (guard tapped just before each lands)
  const s = at(2000, 3200); s.f[0].meter = 100;
  const tapped = new Set();
  const ev = play(s, 260, tap(ULT), (i, sim) => {
    for (const p of sim.projectiles) if (p.owner === 0 && !tapped.has(p.id) && eta(sim, p, sim.f[1]) <= 2) { tapped.add(p.id); return B; }
    return 0;
  });
  const n = ev.filter((e) => e.kind === 'parry').length;
  ok(n === 3 && s.f[1].hp === 1000, `Samurai parries all three waves (${n} parries, hp ${s.f[1].hp})`);
  ok(s.f[1].meter === 15, `each parry gives meter (${s.f[1].meter})`);
}
{ // the Shinobi: crouch under the high wave, jump the low one, dash through the tall one (or block)
  const dashOnly = (dashEta) => { // crouch-block the first two, then dash at the tall one
    const s = at(2000, 3400, ['samurai', 'shinobi']); s.f[0].meter = 100;
    let dashed = false;
    play(s, 300, tap(ULT), (i, sim) => {
      const me = sim.f[1], tall = incoming(sim, 1, 'tall')[0];
      if (tall && !dashed && FREE.has(me.state) && eta(sim, tall, me) <= dashEta) { dashed = true; return DASH; }
      return dashed ? 0 : B | D;
    });
    return s.f[1].hp;
  };
  const dashWin = [];
  for (let d = 0; d <= 40; d++) if (dashOnly(d) === 1000 - 40) dashWin.push(d);
  ok(dashWin.length >= 2 && dashWin.length <= 8, `the tall wave can be dashed through, tight timing (${dashWin.length}-frame window: eta ${dashWin.join(',')})`);
  const dodge = (jumpEta, dashEta) => {
    const s = at(2000, 3400, ['samurai', 'shinobi']); s.f[0].meter = 100;
    let jumped = false, dashed = false;
    const ev = play(s, 300, tap(ULT), (i, sim) => {
      const me = sim.f[1];
      const lo = incoming(sim, 1, 'low')[0], tall = incoming(sim, 1, 'tall')[0];
      if (lo && !jumped && eta(sim, lo, me) <= jumpEta) { jumped = true; return U; }
      if (me.state === 'prejump' || me.state === 'air') return U;
      if (tall && !dashed && FREE.has(me.state) && eta(sim, tall, me) <= dashEta) { dashed = true; return DASH; }
      if (me.state === 'dash' || dashed) return 0;
      return D;
    });
    return { hp: s.f[1].hp, ev };
  };
  const jumpOk = [];
  for (let j = 0; j <= 40; j++) { const c = dodge(j, -99).ev.find((e) => e.kind === 'cine'); if (c && c.shape === 'tall') jumpOk.push(j); }
  ok(jumpOk.length >= 3 && jumpOk.length <= 10, `after ducking the high wave, the low wave can be jumped (${jumpOk.length}-frame window: eta ${jumpOk.join(',')})`);
  // the fast ultimate (waves within 38 frames): the tall wave arrives as she lands from the jump, so a full dodge chain no
  // longer exists; the answer is crouch-blocking (checked below)
  const all = jumpOk.flatMap((j) => dashWin.map((d) => [j, d])).filter(([j, d]) => dodge(j, d).hp === 1000);
  ok(all.length === 0, `the fast ultimate cannot be dodged all the way (duck, jump, dash through): ${all.length} working timing pairs`);
  const crouchOnly = dodge(-99, -99).ev.find((e) => e.kind === 'cine');
  ok(crouchOnly && crouchOnly.shape === 'low', `crouching ducks the high wave (then the low wave hits: ${crouchOnly?.shape})`);
  const s = at(2000, 3400, ['samurai', 'shinobi']); s.f[0].meter = 100;
  const evb = play(s, 300, tap(ULT), () => B | D);
  ok(!evb.some((e) => e.kind === 'cine') && s.f[1].hp === 1000 - 40 - 70, `crouch-blocking: the high wave misses, low + tall are blocked (hp ${s.f[1].hp})`);
}
{ // ultimate vs ultimate
  const mirror = (chars) => { const s = at(2000, 3200, chars); s.f[0].meter = 100; s.f[1].meter = 100; const ev = play(s, 300, tap(ULT), tap(ULT)); return { s, ev }; };
  const cancelled = ({ s, ev }) => s.f.every((f) => f.hp === 1000) && ev.filter((e) => e.kind === 'clash' && e.big).length === 1 && !ev.some((e) => e.kind === 'cine') && s.projectiles.length === 0;
  ok(cancelled(mirror(['samurai', 'samurai'])), 'Samurai mirror, both ultimates together: blade-lock clash, both cancelled completely, no damage');
  ok(cancelled(mirror(['shinobi', 'shinobi'])), 'Shinobi mirror, both ultimates together: the two Kage Bunshin cancel completely, no damage');
  ok(cancelled(mirror(['samurai', 'shinobi'])), 'Samurai vs Shinobi ultimates together: both cancelled completely');
  // answered late (right after the first super freeze): still a full cancel, and the Samurai throws no more waves
  const s = at(2000, 3200, ['samurai', 'shinobi']); s.f[0].meter = 100; s.f[1].meter = 100;
  const ev = play(s, 300, tap(ULT, 0), tap(ULT, 36));
  ok(cancelled({ s, ev }) && ev.filter((e) => e.kind === 'wave').length <= 1, `Shinobi answers the Samurai's ultimate: the ultimates meet, everything cancelled (${ev.filter((e) => e.kind === 'wave').length} wave thrown)`);
  const s2 = at(2000, 3200, ['samurai', 'shinobi']); s2.f[0].meter = 100;
  let thrown = false;
  const ev2 = play(s2, 260, tap(ULT, 0), (i, sim) => { const w = incoming(sim, 1, 'tall')[0]; if (w && !thrown && FREE.has(sim.f[1].state) && !incoming(sim, 1, 'low').length) { thrown = true; return T; } return thrown ? 0 : B | D; });
  ok(ev2.some((e) => e.kind === 'clash' && !e.ult) && s2.f[0].hp === 1000, 'a thrown kunai that meets the tall wave is destroyed (wave unaffected)');
}
{ // ultimates can kill through a block
  const s = at(2000, 3200); s.f[0].meter = 100; s.f[1].hp = 30;
  play(s, 200, tap(ULT), () => B);
  ok(s.f[1].ko, 'chip from a blocked wave can K.O.');
}
{ // hit during the blade draw (after the freeze): the ultimate is gone, so is the meter
  const s = at(2400, 2800, ['samurai', 'shinobi']); s.f[0].meter = 100;
  const ev = play(s, 140, tap(ULT), tap(K, 36));
  ok(!ev.some((e) => e.kind === 'wave') && s.f[0].meter < 100 && ev.some((e) => e.kind === 'hit' && e.target === 0), 'hit during the blade draw: no waves, meter spent');
}
{ // determinism: serialise mid-flight, clone mid-cinematic
  const s = at(2000, 3200, ['samurai', 'shinobi']); s.f[0].meter = 100;
  play(s, 60, tap(ULT));
  const mid = Sim.fromState(JSON.parse(JSON.stringify(s.toState())));
  play(s, 40, () => 0); play(mid, 40, () => 0);
  ok(s.hash() === mid.hash(), 'a serialised sim with waves in flight replays identically');
  const c = s.clone(); play(s, 200, () => 0); play(c, 200, () => 0);
  ok(s.cine === null && s.hash() === c.hash(), 'a clone taken during the cinematic replays identically');
}
// --- mirror palettes / mixed match sanity ------------------------------------------------------------------------
{
  const s = new Sim({ chars: ['shinobi', 'samurai'] });
  play(s, 600, (i) => [R, P, K, S, 0, B][Math.floor(i / 20) % 6], (i) => [L, P, S, 0, B, DASH][Math.floor(i / 23) % 6]);
  ok(s.frame === 600 && s.f.every((f) => Number.isFinite(f.x)), 'mixed Shinobi vs Samurai runs 600 frames');
}

// ---- stepping thrust + projectile parry (added with the parry / thrust update)
{
  const s = at(2000, 3100, ['samurai', 'shinobi']); const x0 = s.f[0].x;
  const ev = play(s, 40, tap(K, 2));
  ok(s.f[0].x - x0 > 300 && ev.some((e) => e.kind === 'hit'), `thrust lunges > 300 units and hits from 1100 away (moved ${Math.round(s.f[0].x - x0)})`);
}
{
  // when does a thrown kunai reach a guard-holding Samurai?
  let arrive = -1; const s0 = at(1800, 3000, ['samurai', 'shinobi']);
  for (let i = 0; i < 120 && arrive < 0; i++) { s0.step([BTN.B, i === 2 ? BTN.T : 0]); if (s0.events.some((e) => e.kind === 'block')) arrive = i; }
  const tryAt = (early, extra = () => 0) => { const s = at(1800, 3000, ['samurai', 'shinobi']); const ev = play(s, 100, (i) => ((i >= arrive - early && i < arrive - early + 2) ? BTN.B : extra(i)), (i) => (i === 2 ? T : 0)); return { s, ev }; };
  const good = tryAt(2);
  ok(good.ev.some((e) => e.kind === 'parry') && good.s.f[0].hp === 1000, 'guard pressed 2 frames before a kunai lands parries it (no damage)');
  const early = tryAt(10);
  ok(!early.ev.some((e) => e.kind === 'parry') && early.s.f[0].hp < 1000, 'guard tapped 10 frames early misses the window');
  const s1 = at(1800, 3000, ['samurai', 'shinobi']); const held = play(s1, 100, () => BTN.B, (i) => (i === 2 ? T : 0));
  ok(held.some((e) => e.kind === 'block') && !held.some((e) => e.kind === 'parry'), 'holding guard just blocks (chip), no parry');
  const fol = tryAt(3, (i) => (i >= arrive + 1 && i < arrive + 3 ? K : 0));
  ok(fol.ev.some((e) => e.kind === 'hit') && fol.s.f[1].hp < 1000, 'parry cancels into the thrust, which reaches the thrower');
}
{
  const s = at(2300, 2900, ['samurai', 'shinobi']);
  const ev = play(s, 80, (i) => (i === 2 ? P : i >= 12 && i < 14 ? S : 0));
  ok(ev.filter((e) => e.kind === 'hit').length === 2, 'iai cut chains into the overhead cleave on contact');
}
// ---- Shinobi kawarimi (substitution) vs the Samurai (balance pass 2026-10-17)
{
  const seal = BTN.B | BTN.P;
  const at0 = (a, b, meter = 100) => { const s = at(a, b, ['samurai', 'shinobi']); s.f[1].meter = meter; return s; }; // kawarimi costs meter
  for (const [name, btn, d, t] of [['iai cut', P, 900, 1], ['cleave', S, 700, 8], ['stepping thrust', K, 1100, 0]]) {
    const s = at0(2000, 2000 + d); const ev = play(s, 90, tap(btn), tap(seal, t));
    const k = ev.find((e) => e.kind === 'kawarimi'), hit = ev.find((e) => e.kind === 'hit' && e.target === 0);
    ok(k && hit && s.f[1].hp === 1000 && s.f[0].hp < 1000, `kawarimi vs ${name}: the log takes the hit, she strikes from behind (${hit?.dmg} dmg)`);
  }
  { const s = at0(2000, 2850); const ev = play(s, 70, tap(P, 24), tap(seal, 0));
    ok(ev.some((e) => e.kind === 'hit' && e.target === 1) && !ev.some((e) => e.kind === 'kawarimi'), 'a whiffed kawarimi stance is punished by the iai cut'); }
  { const s = at0(2000, 3000); const seen = [];
    play(s, 80, () => 0, (i, sim) => { if (sim.f[1].state === 'attack' && !seen.includes(sim.f[1].move)) seen.push(sim.f[1].move); return i === 0 || i === 45 ? seal : 0; });
    ok(seen.join() === 'kawarimi,stab', `spamming it: the second press inside the cooldown is just a stab (${seen.join(' -> ')})`); }
  const COST = new Sim({ chars: ['shinobi', 'shinobi'] }).C({ id: 0 }).moves.kawarimi.cost;
  { const s = at0(2000, 3000, COST - 5); const seen = [];
    play(s, 40, () => 0, (i, sim) => { if (sim.f[1].state === 'attack' && !seen.includes(sim.f[1].move)) seen.push(sim.f[1].move); return i === 0 ? seal : 0; });
    ok(seen.join() === 'stab' && s.f[1].meter === COST - 5, `without ${COST} meter the seal is just a stab (${seen.join()}, meter ${s.f[1].meter})`); }
  { const s = at0(2000, 3000, COST + 10); play(s, 10, () => 0, tap(seal, 0));
    ok(s.f[1].state === 'attack' && s.f[1].move === 'kawarimi' && s.f[1].meter === 10, `casting it spends ${COST} meter (${COST + 10} -> ${s.f[1].meter})`); }
  { const s = at0(2000, 2800); const x0 = 2800; const ev = play(s, 40, tap(S), (i) => (i === 20 ? seal : BTN.B));
    const esc = ev.find((e) => e.kind === 'kawarimi' && e.escape);
    ok(esc && !ev.some((e) => e.kind === 'seal') && Math.abs(s.f[1].x - s.f[0].x) > 700, `from blockstun the same input is the ESCAPE (no counter stance): she reappears away (gap ${Math.round(Math.abs(s.f[1].x - s.f[0].x))})`); }
  { const s = at(2000, 3200, ['shinobi', 'shinobi']); const ev = play(s, 60, tap(T, 0), tap(seal, 14));
    ok(!ev.some((e) => e.kind === 'kawarimi') && ev.some((e) => e.kind === 'hit' && e.target === 1), 'a thrown kunai is not substituted (melee only)'); }
  { const s = at0(2000, 3300); s.f[0].meter = 100; const ev = play(s, 140, tap(ULT, 0), (i) => (i === 52 ? seal : 0));
    ok(!ev.some((e) => e.kind === 'kawarimi') && ev.some((e) => e.kind === 'cine'), 'the ultimate waves go through the stance'); }
}
// ---- wake-up guard (user report 2026-10-17: a meaty on the get-up frame looped knockdowns)
{
  // knocked down, then a cleave timed to land exactly as she gets up; she holds guard after the knockdown
  const meaty = (hold) => { const s = at(2300, 3000, ['samurai', 'shinobi']); let downed = false; const ev = [];
    play(s, 220, (i) => (i === 0 || i === 86 ? S : 0), (i, sim) => { if (['knock', 'down'].includes(sim.f[1].state)) downed = true; return downed && hold ? B : 0; }).forEach((e) => ev.push(e));
    return { s, ev }; };
  const g = meaty(true), n = meaty(false);
  ok(g.ev.filter((e) => e.kind === 'hit' && e.target === 1).length === 1 && g.ev.some((e) => e.kind === 'block' && e.def === 1) && g.s.f[1].state === 'guard',
    'holding guard through the get-up blocks a meaty cleave on the exact wake-up frame (ends in guard)');
  ok(n.ev.filter((e) => e.kind === 'hit' && e.target === 1).length === 2, '... without guard the meaty still lands (getting up carelessly is punishable)');
  // the Samurai cannot crouch: a meaty SWEEP on his get-up is blocked by the wake-up guard window, not a knockdown loop
  const sweepAt = (d, p2) => { const s = at(2300, 2900, ['shinobi', 'samurai']); let downed = false, wakeEnd = -1; const ev = [];
    for (let i = 0; i < 220; i++) { if (['knock', 'down'].includes(s.f[1].state)) downed = true; const was = s.f[1].state;
      s.step([i === 0 ? D | K : i >= d && i < d + 3 ? D | K : i < d + 3 ? D : 0, p2(downed, wakeEnd, i)]);
      if (was === 'wake' && s.f[1].state !== 'wake' && wakeEnd < 0) wakeEnd = i;
      for (const e of s.events) ev.push({ ...e, i }); }
    return ev; };
  const looped = [76, 80, 84, 88].filter((d) => sweepAt(d, (dn) => (dn ? B : 0)).filter((e) => e.kind === 'hit' && e.target === 1).length > 1);
  ok(looped.length === 0, `a meaty sweep on the Samurai's get-up is blocked (wake-up guard window), not a loop (${looped.length} loops)`);
  const out = sweepAt(92, (dn, we, i) => (!dn ? 0 : we >= 0 && i - we === 1 ? P : we >= 0 ? 0 : B));
  ok(out.some((e) => e.kind === 'hit' && e.target === 0), '... a later sweep can be beaten by attacking out (iai cut right after getting up)');
}
// ---- Samurai repel (guard + light, 25 meter, any state) and the guard gauge (2026-10-17)
{
  const RP = B | P;
  // from a knockdown get-up, the Shinobi standing over him
  { const s = at(2300, 2900, ['shinobi', 'samurai']); s.f[1].meter = 60; let downed = false, used = false;
    const ev = play(s, 160, (i) => (i === 0 ? D | K : i < 90 ? D : 0), (i, sim) => { if (['knock', 'down'].includes(sim.f[1].state)) downed = true; if (downed && sim.f[1].state === 'wake' && !used) { used = true; return RP; } return 0; });
    ok(ev.some((e) => e.kind === 'repel') && Math.abs(s.f[0].x - s.f[1].x) > 1000 && s.f[1].meter < 60, `repel while getting up shoves her away (gap ${Math.round(Math.abs(s.f[0].x - s.f[1].x))}, 25 meter spent)`); }
  // out of hitstun (mid-combo): her follow-up never lands
  { const s = at(2400, 2800, ['shinobi', 'samurai']); s.f[1].meter = 30;
    const ev = play(s, 90, (i) => [P, 0, 0, 0, 0, 0, 0, 0, P, 0, 0, 0, 0, 0, 0, 0, K][i] || 0, tap(RP, 12));
    ok(ev.some((e) => e.kind === 'repel') && ev.filter((e) => e.kind === 'hit' && e.target === 1).length === 1, 'repel from hitstun breaks the combo (no further hits)'); }
  // costs meter: without 25 it does nothing special
  { const s = at(2400, 2800, ['shinobi', 'samurai']); s.f[1].meter = 20; const ev = play(s, 40, () => 0, tap(RP, 2));
    ok(!ev.some((e) => e.kind === 'repel'), 'no repel without 25 meter'); }
  // invulnerable start: a stab arriving during the burst does not hit
  { const s = at(2400, 2900, ['shinobi', 'samurai']); s.f[1].meter = 100; const ev = play(s, 40, tap(P, 0), tap(RP, 0));
    ok(!ev.some((e) => e.kind === 'hit' && e.target === 1), 'repel is invulnerable through its burst'); }
  // guard gauge: back-to-back cleaves break the guard; time without blocking drains it
  { const s = at(2300, 3000, ['samurai', 'shinobi']); const ev = play(s, 360, (i, sim) => (Math.abs(sim.f[0].x - sim.f[1].x) > 900 ? R : i % 54 === 0 ? S : 0), () => B);
    const br = ev.find((e) => e.kind === 'guardbreak');
    ok(br && ev.filter((e) => e.kind === 'block').length === 3, `sustained cleaves on a guard: 3 blocks, then GUARD BREAK (frame ${br?.frame})`); }
  { const s = at(2000, 3000); s.f[1].guard = 80; play(s, 200, () => 0, () => 0);
    ok(s.f[1].guard === 0, 'the guard gauge drains when not blocking'); }
}
{ // Shinobi ultimate: Kage Bunshin (three clones: overhead dive kick, slash, kunai fury from behind)
  const kb = (def, x1 = 3150, chars = ['shinobi', 'samurai']) => { const s = at(2050, x1, chars); s.f[0].meter = 100; const ev = play(s, 420, tap(ULT, 2), def); return { s, ev }; };
  const r1 = kb(() => 0);
  ok(r1.ev.some((e) => e.kind === 'cine') && r1.s.f[1].hp === 1000 - 450 && r1.s.f[1].state !== 'cine', `standing still: the dive kick lands, the Shadow Execution deals exactly 450 (hp ${r1.s.f[1].hp})`);
  const r2 = kb(() => B);
  const chip = r2.ev.filter((e) => e.kind === 'block').reduce((t, e) => t + e.chip, 0);
  ok(!r2.ev.some((e) => e.kind === 'cine') && r2.s.f[1].hp === 1000 - chip && chip === 18 + 26 + 15 * 5, `standing guard blocks all 17 clone attacks: chip only (${chip})`);
  const r3 = kb(() => B | D, 3150, ['shinobi', 'shinobi']);
  ok(r3.ev.some((e) => e.kind === 'cine'), 'crouch-guarding loses to the overhead dive kick');
  const r4 = kb(() => B, 4900);
  ok(r4.s.f[0].cCx < 4900 && r4.s.f[0].cCf === 1 && !r4.ev.some((e) => e.kind === 'cine'), `cornered: the rear clone takes the far front (x ${Math.round(r4.s.f[0].cCx)}) and the ultimate stays blockable`);
  // hit out of the seal: no further clone attacks
  const s5 = at(2050, 2350, ['shinobi', 'samurai']); s5.f[0].meter = 100;
  const ev5 = play(s5, 200, tap(ULT, 2), (i) => (i === 49 ? P : 0));
  ok(ev5.filter((e) => e.kind === 'clone' && e.clone !== 'kick').length === 0, `hit out of the seal at point blank: no slash / kunai follow (${ev5.filter((e) => e.kind === 'clone').map((e) => e.clone).join(',')})`);
}
console.log(fails ? `\n${fails} FAILED` : '\nall Samurai checks passed');
process.exit(fails ? 1 : 0);
