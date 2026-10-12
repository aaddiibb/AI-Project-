// Audio tests (prompt 06, stage 2). Node only: the cue logic, the sound bank, the score and the loudness meter are pure
// modules; the Web Audio engine is not needed. Run: node game/tools/test_audio.mjs (part of npm test).
//
//   isolation   no module reachable from the sim, the agents or the headless tools imports src/audio/
//   read-only   feeding the cue tracker every step leaves the replay bit-identical (checkpoint + round-end hashes)
//   timing      whooshes start before the hit and peak on the first active frame; impacts land on the hit frame
//   rules       chip scrape only when chip > 0; one guard cue per guard entry; the crescent loop follows its x;
//               footsteps follow the walk; timer ticks 10..1; stingers in match order
//   determinism the same replay gives the same cues (variants + rates) every run; views carry no events
//   bank        every sound renders, finite, normalised, deterministic; loops are seamless; every score note exists
//   loudness    the BS.1770 meter reads a reference sine correctly
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sim, BTN } from '../src/sim.js';
import { Match, ReplayController, FnController } from '../src/ai/match.js';
import { CueTracker, swingFrame, tension } from '../src/audio/cues.js';
import { SOUNDS, INSTRUMENTS, bankJobs, panOf } from '../src/audio/sounds.js';
import { RECIPES, render, SR, noteHz } from '../src/audio/dsp.js';
import { BATTLE, MENU_SCORE } from '../src/audio/score.js';
import { loudness } from '../src/audio/loudness.js';

const HERE = dirname(fileURLToPath(import.meta.url)), SRC = resolve(HERE, '../src');
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

// ------------------------------------------------------------------ isolation (static import graph)
function importsOf(file) {
  const src = readFileSync(file, 'utf8'), out = [];
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|new URL\(\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1] || m[2] || m[3];
    if (spec.startsWith('.')) out.push(resolve(dirname(file), spec));
  }
  return out;
}
function reach(entry) {
  const seen = new Set(), stack = [entry];
  while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); try { stack.push(...importsOf(f)); } catch { /* not a file */ } }
  return seen;
}
const headless = ['../src/sim.js', ...readdirSync(join(SRC, 'ai')).map((f) => '../src/ai/' + f),
  ...['arena', 'ga_tune', 'replay_hash', 'test_samurai', 'test_clone', 'test_agents', 'scaling', 'difficulty_ladder', 'decision_log', 'charts', 'bench_tables'].map((t) => `./${t}.mjs`)]
  .map((p) => resolve(HERE, p));
const leaks = headless.flatMap((e) => [...reach(e)].filter((f) => f.includes('/src/audio/')).map((f) => e.split('/').pop() + ' -> ' + f.split('/src/')[1]));
check(leaks.length === 0, `no audio module is reachable from the sim, the ${readdirSync(join(SRC, 'ai')).length} AI modules or the headless tools${leaks.length ? ': ' + leaks.slice(0, 3).join(', ') : ''}`);
const browserOnly = ['engine.js', 'music.js', 'index.js'];
const pureLeaks = ['cues.js', 'dsp.js', 'sounds.js', 'score.js', 'loudness.js'].flatMap((f) => [...reach(join(SRC, 'audio', f))].filter((x) => browserOnly.some((b) => x.endsWith('/audio/' + b))));
check(pureLeaks.length === 0, 'the pure audio modules (cues, dsp, sounds, score, loudness) never import the browser-only engine');
const audioSrc = readdirSync(join(SRC, 'audio')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(SRC, 'audio', f), 'utf8'));
check(!/sim\.(f|projectiles|hitstop|superFreeze|frame|events)\s*(\[[^\]]*\])?\s*(\.[\w]+)?\s*(=[^=]|\+\+|--|\+=|-=)/.test(audioSrc.join('\n')) && !/\bf\.(\w+)\s*(=[^=]|\+\+|--|\+=|-=)/.test(readFileSync(join(SRC, 'audio/cues.js'), 'utf8')), 'no audio module assigns to the sim or a fighter (read-only)');

// ------------------------------------------------------------------ read-only + determinism on the demo replay
const log = JSON.parse(readFileSync(resolve(HERE, '../replays/demo_minimax_vs_mcts.json'), 'utf8'));
const runReplay = (withAudio) => {
  const m = new Match({ chars: log.chars, controllers: [new ReplayController(log), new ReplayController(log)], bestOf: log.bestOf, roundFrames: log.roundFrames, koFrames: 150, introFrames: 90, verify: log });
  const tr = new CueTracker(), cues = [], events = [], hashes = [];
  while (!m.over) {
    m.step();
    if (withAudio) cues.push(...tr.frame(m.sim, m));
    for (const e of m.sim.events) events.push({ ...e, frame: m.sim.frame });
    if (m.fightFrame % 60 === 0) hashes.push(m.sim.hash());
  }
  if (withAudio) cues.push(...tr.frame(m.sim, m));
  return { m, cues, events, hashes };
};
const A = runReplay(true), B0 = runReplay(false), A2 = runReplay(true);
check(A.m.verify.bad === 0 && A.m.verify.ok === B0.m.verify.ok && A.hashes.join() === B0.hashes.join(), `with the cue tracker the demo replay stays bit-identical (${A.m.verify.ok} checkpoints + round ends match the arena log)`);
const sig = (c) => c.map((q) => `${q.frame}:${q.id}:${q.variant}:${q.rate.toFixed(6)}`).join('|');
check(sig(A.cues) === sig(A2.cues) && A.cues.length > 100, `the same replay gives the same ${A.cues.length} cues (ids, frames, variants, rates) every run`);
// every hit event has its impact cue on the same frame; every block its block cue
const hitEv = A.events.filter((e) => e.kind === 'hit'), hitCues = A.cues.filter((q) => /^hit_/.test(q.id));
check(hitEv.length > 0 && hitEv.every((e) => hitCues.some((q) => q.frame === e.frame)) && hitCues.length === hitEv.length, `every hit (${hitEv.length}) has exactly one impact cue, on the hit frame`);
const blk = A.events.filter((e) => e.kind === 'block'), chipCues = A.cues.filter((q) => q.id === 'chip');
check(blk.length > 0 && chipCues.length === blk.filter((e) => e.chip > 0).length && chipCues.every((q) => blk.some((e) => e.frame === q.frame && e.chip > 0)), `chip scrape only on blocks with chip > 0 (${chipCues.length} of ${blk.length} blocks)`);
const stingers = A.cues.filter((q) => q.id.startsWith('st_')).map((q) => q.id);
check(JSON.stringify(stingers) === JSON.stringify(['st_round1', 'st_fight', 'st_ko', 'st_round2', 'st_fight', 'st_ko', 'st_win']), `stingers in match order: ${stingers.join(' ')}`);
// a view (what agents get) carries no events, so it could never trigger an event cue
{ const s = new Sim({ chars: ['samurai', 'samurai'] }); let v = null;
  for (let i = 0; i < 200 && !v; i++) { s.step([i % 30 === 0 ? BTN.P : BTN.R, 0]); if (s.events.some((e) => e.kind === 'hit')) v = s.clone(); }
  check(v && v.events.length === 0, 'an agent view (sim.clone) carries no events: event cues can only come from the live sim'); }

// ------------------------------------------------------------------ scripted timing
function scripted(chars, inputs, n, setup) {
  const s = new Sim({ chars }); setup?.(s);
  const tr = new CueTracker(), cues = [], events = [], loops = [];
  for (let k = 0; k < n; k++) {
    s.step(inputs(k, s));
    cues.push(...tr.frame(s, null));
    for (const e of s.events) events.push({ ...e, frame: s.frame });
    loops.push({ frame: s.frame, loops: tr.loops.map((l) => ({ ...l })), proj: s.projectiles.filter((p) => p.spec.kind === 'crescent').map((p) => p.x) });
  }
  return { s, cues, events, loops };
}
const close = (s) => { while (Math.abs(s.f[0].x - s.f[1].x) > 700) s.step([BTN.R, 0]); for (let i = 0; i < 20; i++) s.step([0, 0]); };
for (const [char, move, btn, sound] of [['samurai', 'light', BTN.P, 'sam_draw'], ['samurai', 'heavy', BTN.S, 'sam_cleave'], ['shinobi', 'stab', BTN.P, 'shi_swish'], ['shinobi', 'slash', BTN.S, 'shi_slash']]) {
  const r = scripted([char, 'samurai'], (k) => [k === 0 ? btn : 0, 0], 60, close);
  const sw = r.cues.find((q) => q.id === sound), hit = r.cues.find((q) => /^hit_/.test(q.id));
  const m = r.s.C(r.s.f[0]).moves[move], lead = m.active[0] - swingFrame(m, sound), peak = Math.round(SOUNDS[sound].peakMs * 60 / 1000);
  check(sw && hit && hit.frame - sw.frame === lead && lead === peak, `${char} ${move}: ${sound} starts ${lead} frames before the hit and peaks on it (peak ${SOUNDS[sound].peakMs} ms, active frame ${m.active[0]})`);
}
// guard: one cue per entry
{ const hold = (k) => (k >= 10 && k < 40) || (k >= 60 && k < 90) ? BTN.B : 0;
  const r = scripted(['samurai', 'samurai'], (k) => [hold(k), 0], 100);
  check(r.cues.filter((q) => q.id === 'guard').length === 2, 'guard: one cue per guard entry (2 entries, 60 frames held -> 2 cues)'); }
// footsteps follow the walk cycle
{ const r = scripted(['samurai', 'samurai'], () => [BTN.R, 0], 100);
  const steps = r.cues.filter((q) => q.id === 'step' && q.side === 0).length, half = r.s.C(r.s.f[0]).walk.steps.reduce((a, b) => a + b, 0) / 2;
  const expect = Math.floor((r.s.f[0].x - 2050) / half);
  check(Math.abs(steps - expect) <= 1 && steps >= 2, `footsteps follow the walk: ${steps} steps over ${Math.round(r.s.f[0].x - 2050)} units (half cycle ${Math.round(half)})`); }
// the crescent loop follows the projectile's x, then stops
{ const r = scripted(['samurai', 'samurai'], (k) => [k === 0 ? BTN.ULT : 0, BTN.B], 140, (s) => { s.f[0].meter = 100; });
  const withP = r.loops.filter((l) => l.proj.length);
  const tracks = withP.length > 3 && withP.every((l) => l.loops.length === 1 && l.loops[0].x === l.proj[0]);
  const xs = withP.map((l) => l.loops[0].x), pans = xs.map((x) => panOf(x));
  const ends = r.loops.slice(r.loops.indexOf(withP.at(-1)) + 1).every((l) => l.loops.length === 0);
  check(tracks && ends && xs.every((x, i) => i === 0 || x > xs[i - 1]) && pans.at(-1) > pans[0], `crescent loop follows its x for ${withP.length} frames (pan ${pans[0].toFixed(2)} -> ${pans.at(-1).toFixed(2)}) and stops when it is gone`);
  check(['super', 'crescent_rel'].every((id) => r.cues.some((q) => q.id === id)) && r.cues.some((q) => q.id === 'block_steel' || /^hit_/.test(q.id)), 'ultimate: super stinger, release sweep, then the crescent lands (block or hit)'); }
// Shinobi: kunai throw, ultimate fan
{ const r = scripted(['shinobi', 'samurai'], (k) => [k === 0 ? BTN.T : k === 60 ? BTN.ULT : 0, BTN.B], 160, (s) => { s.f[0].meter = 100; });
  const ids = r.cues.map((q) => q.id);
  check(ids.includes('kunai') && ids.includes('super') && ids.includes('fan') && ids.indexOf('super') < ids.indexOf('fan'), 'Shinobi: kunai flick on the throw, super then the fan on the ultimate'); }
// timer ticks 10..1, then TIME
{ const m = new Match({ chars: ['samurai', 'samurai'], controllers: [new FnController(() => 0), new FnController(() => 0)], bestOf: 1, roundFrames: 900, koFrames: 30, introFrames: 0 });
  const tr = new CueTracker(), cues = [];
  while (!m.over) { m.step(); cues.push(...tr.frame(m.sim, m)); }
  cues.push(...tr.frame(m.sim, m));
  const ticks = cues.filter((q) => q.id.startsWith('tick')).map((q) => q.id === 'tick_hi' ? 'H' : 't').join('');
  check(ticks === 'tttttttHHH' && cues.some((q) => q.id === 'st_time') && cues.at(-1).id === 'st_draw', `timer: ${ticks.length} ticks (last 3 high), then TIME and the draw stinger`); }
// tension rises when close + low HP
{ const s = new Sim({ chars: ['samurai', 'samurai'] }); const t0 = tension(s, null); s.f[0].x = 2500; s.f[1].x = 2800; s.f[0].hp = 150;
  check(t0 < 0.2 && tension(s, null) > 0.6, `tension: ${t0.toFixed(2)} at the start, ${tension(s, null).toFixed(2)} close with low HP`); }

// ------------------------------------------------------------------ bank + score
{ const ids = Object.keys(SOUNDS), missing = ids.filter((id) => !RECIPES[id]);
  check(!missing.length, `every one of the ${ids.length} sounds has a recipe${missing.length ? ' (missing ' + missing.join(', ') + ')' : ''}`);
  const jobs = bankJobs(); let bad = [], total = 0;
  const t0 = performance.now();
  for (const j of jobs) {
    const b = render(j.id, j.v, j.note); total += b.length;
    let pk = 0, finite = true; for (const x of b) { if (!Number.isFinite(x)) finite = false; pk = Math.max(pk, Math.abs(x)); }
    if (!finite || pk > 0.9 || pk < 0.5) bad.push(j.key);
  }
  check(!bad.length, `all ${jobs.length} buffers render finite and peak-normalised (${(total / SR).toFixed(0)} s of audio in ${((performance.now() - t0) / 1000).toFixed(1)} s)${bad.length ? ': ' + bad.join(',') : ''}`);
  const a = render('hit_m', 1), b = render('hit_m', 1), c = render('hit_m', 2);
  check(a.every((x, i) => x === b[i]) && c.some((x, i) => x !== a[i]), 'renders are deterministic per variant, and variants differ');
  // seam: the end -> start step compared with the buffer's typical sample-to-sample step
  const seam = ['crescent_loop', 'drone', 'wind'].map((id) => { const x = render(id, 0); let d = 0; for (let i = 1; i < x.length; i++) d += Math.abs(x[i] - x[i - 1]); return [id, Math.abs(x[x.length - 1] - x[0]) / (d / (x.length - 1))]; });
  check(seam.every(([, d]) => d < 4), `loops are seamless (end -> start step / typical step: ${seam.map(([id, d]) => id + ' ' + d.toFixed(2)).join(', ')})`);
  const keys = new Set(jobs.map((j) => j.key)), need = new Set();
  for (const bar of [...BATTLE, ...MENU_SCORE]) for (const e of bar) need.add(e.inst + ':' + (e.note ?? 0));
  const gone = [...need].filter((k) => !keys.has(k));
  check(!gone.length && BATTLE.length === 48, `every note of the 48-bar score and the menu exists in the bank (${need.size} distinct)${gone.length ? ': missing ' + gone.join(',') : ''}`);
  // the koto is in tune: autocorrelation pitch of A3 within 10 cents
  const k = render('koto', 0, 'A3'), seg = k.subarray(4800, 4800 + 9600); let best = 0, lag = 0;
  for (let L = 150; L < 300; L++) { let s = 0; for (let i = 0; i < seg.length - L; i++) s += seg[i] * seg[i + L]; if (s > best) { best = s; lag = L; } }
  let fine = lag; { const s = (L) => { let t = 0; for (let i = 0; i < seg.length - L; i++) t += seg[i] * seg[i + L]; return t; }; const y0 = s(lag - 1), y1 = s(lag), y2 = s(lag + 1); fine = lag + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2); }
  const cents = 1200 * Math.log2(SR / fine / noteHz('A3'));
  check(Math.abs(cents) < 10, `koto A3 is in tune (${cents.toFixed(1)} cents)`); }

// ------------------------------------------------------------------ loudness meter
{ const n = SR * 3, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.1 * Math.sin(2 * Math.PI * 1000 * i / SR);
  const L = loudness([x, x]);
  check(Math.abs(L.integrated - -20) < 0.3 && Math.abs(L.samplePeakDb - -20) < 0.05, `BS.1770 meter: a -20 dBFS 1 kHz stereo sine reads ${L.integrated.toFixed(2)} LUFS`); }

console.log(fails ? `\n${fails} audio check(s) FAILED` : '\nall audio checks passed');
process.exit(fails ? 1 : 0);
