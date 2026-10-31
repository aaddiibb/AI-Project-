// Regression proof for the character-registry refactor (prompt 05 §4.1).
//
// Plays a fixed, seeded input script for Shinobi vs Shinobi (>= 3,000 frames mixing every move, jump, crouch, run, hop,
// dash, block and the ultimate) through the simulator and hashes the FULL sim state after every frame.
//
//   node game/tools/replay_hash.mjs record   # run on the code BEFORE the refactor: writes the input script + per-frame hashes
//   node game/tools/replay_hash.mjs check    # run AFTER: replays the same inputs, every frame's hash must match
//
// The hash here is deliberately independent of sim.hash(): it serialises a fixed list of fields, so adding new fields to
// the sim (or removing the global data imports) cannot change it, while any behavioural change of the Shinobi will.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sim, BTN } from '../src/sim.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });
const INPUTS = join(OUT, 'shinobi_replay_inputs.json');
const BASE = join(OUT, 'shinobi_replay_baseline.json');
const FRAMES = 3600;

// ------------------------------------------------------------------ seeded input script
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** one player's script: segments of patterns; `fwd` / `back` are screen bits for that side's usual facing */
function makeScript(seed, side) {
  const rnd = mulberry32(seed);
  const F = side === 0 ? BTN.R : BTN.L, Bk = side === 0 ? BTN.L : BTN.R;
  const { U, D, P, K, S, T, B, DASH, ULT } = BTN;
  const pats = [
    ['walk_fwd', 7, (n) => Array(n).fill(F)],
    ['walk_back', 1, (n) => Array(n).fill(Bk)],
    ['run', 3, (n) => [F, F, 0, 0, ...Array(Math.max(1, n - 4)).fill(F)]],          // double-tap forward and hold
    ['hop', 1, (n) => [Bk, 0, 0, Bk, ...Array(Math.max(1, n - 4)).fill(0)]],         // double-tap back
    ['crouch', 1, (n) => Array(n).fill(D)],
    ['jump', 1, (n) => [U, U, U, ...Array(Math.max(1, n - 3)).fill(0)]],
    ['jump_hold_fwd', 1, (n) => [...Array(14).fill(U | F), ...Array(Math.max(1, n - 14)).fill(0)]],
    ['jump_back', 1, (n) => [...Array(6).fill(U | Bk), ...Array(Math.max(1, n - 6)).fill(0)]],
    ['air_stab', 1, (n) => [...Array(8).fill(U | F), 0, 0, 0, 0, P, 0, ...Array(Math.max(1, n - 14)).fill(0)]],
    ['air_kick', 1, (n) => [...Array(8).fill(U), 0, 0, 0, 0, 0, K, 0, ...Array(Math.max(1, n - 15)).fill(0)]],
    ['stab', 2, (n) => [P, 0, 0, ...Array(Math.max(1, n - 3)).fill(0)]],
    ['stab_chain', 1, (n) => [P, 0, 0, 0, 0, 0, 0, 0, P, 0, 0, 0, 0, 0, 0, 0, K, 0, 0, 0, 0, 0, 0, 0, 0, 0, S, ...Array(Math.max(1, n - 27)).fill(0)]],
    ['kick', 1, (n) => [K, ...Array(Math.max(1, n - 1)).fill(0)]],
    ['slash', 1, (n) => [S, ...Array(Math.max(1, n - 1)).fill(0)]],
    ['throw', 1, (n) => [T, ...Array(Math.max(1, n - 1)).fill(0)]],
    ['crouch_stab', 1, (n) => [D, D | P, ...Array(Math.max(1, n - 2)).fill(D)]],
    ['sweep', 1, (n) => [D, D | K, ...Array(Math.max(1, n - 2)).fill(D)]],
    ['guard', 3, (n) => Array(n).fill(B)],
    ['crouch_guard', 1, (n) => Array(n).fill(B | D)],
    ['dash', 1, (n) => [DASH, ...Array(Math.max(1, n - 1)).fill(0)]],
    ['dash_back', 1, (n) => [DASH | Bk, ...Array(Math.max(1, n - 1)).fill(0)]],
    ['ult', 1, (n) => [ULT, ...Array(Math.max(1, n - 1)).fill(0)]],
    ['idle', 1, (n) => Array(n).fill(0)],
    ['mash', 1, (n) => Array.from({ length: n }, () => [0, P, K, S, T, B, D, U, F, Bk, DASH][Math.floor(rnd() * 11)])],
  ];
  const total = pats.reduce((s, p) => s + p[1], 0);
  const out = [], used = {};
  while (out.length < FRAMES) {
    let r = rnd() * total, p = pats[0];
    for (const q of pats) { if ((r -= q[1]) < 0) { p = q; break; } }
    const n = 6 + Math.floor(rnd() * 34);
    out.push(...p[2](n)); used[p[0]] = (used[p[0]] || 0) + 1;
  }
  return { bits: out.slice(0, FRAMES), used };
}

// ------------------------------------------------------------------ fixed-field state hash (FNV-1a over float64 bits)
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
const FIGHTER_FIELDS = ['id', 'x', 'h', 'vx', 'vy', 'facing', 'state', 't', 'hp', 'meter', 'flash', 'move', 'hitDone', 'contact', 'chainCount',
  'kb', 'stun', 'crouchGuard', 'hitCrouch', 'invuln', 'walkDist', 'runDist', 'kunaiCd', 'ko', 'airUsed', 'cutArmed', 'runJump',
  'combo', 'comboDmg', 'lastHit', 'counter', 'prev', 'fwd', 'back', 'up', 'down', 'guardBtn', 'tapF', 'tapB', 'evRun', 'evHop'];
const BUF_FIELDS = ['P', 'K', 'S', 'T', 'U', 'DASH', 'ULT'];
const PROJ_FIELDS = ['owner', 'x', 'h', 'vx', 'vy', 'dir', 'life', 'id', 'fan'];
const EVENT_FIELDS = ['kind', 'x', 'h', 'dir', 'power', 'counter', 'ko', 'dmg', 'target', 'id', 'down'];
class H {
  constructor() { this.h = 0x811c9dc5; }
  u32(v) { for (let i = 0; i < 4; i++) { this.h ^= (v >>> (i * 8)) & 0xff; this.h = Math.imul(this.h, 0x01000193); } }
  val(v) {
    if (v === undefined) return this.u32(0xa1);
    if (v === null) return this.u32(0xa2);
    if (typeof v === 'boolean') return this.u32(v ? 0xb1 : 0xb0);
    if (typeof v === 'string') { this.u32(0xc0 + v.length); for (let i = 0; i < v.length; i++) this.u32(v.charCodeAt(i)); return; }
    F64[0] = v; this.u32(U32[0]); this.u32(U32[1]);
  }
  obj(o, fields) { for (const k of fields) this.val(o[k]); }
}
export function stateHash(sim) {
  const h = new H();
  for (const f of sim.f) { h.obj(f, FIGHTER_FIELDS); h.obj(f.buf, BUF_FIELDS); }
  h.val(sim.projectiles.length); for (const p of sim.projectiles) { h.obj(p, PROJ_FIELDS); h.val(p.spec.dmg); }
  h.obj(sim, ['hitstop', 'superFreeze', 'frame', 'koTimer']);
  for (const c of sim.comboShow) h.obj(c, ['hits', 'dmg', 't']);
  h.val(!!sim.lastHit); if (sim.lastHit) h.obj(sim.lastHit, ['by', 'dmg', 'counter', 'move', 'frame']);
  h.val(sim.events.length); for (const e of sim.events) h.obj(e, EVENT_FIELDS);
  return (h.h >>> 0).toString(16).padStart(8, '0');
}

// ------------------------------------------------------------------ run
function run(inputs) {
  const sim = new Sim();
  const hashes = [], stats = {};
  for (let i = 0; i < inputs[0].length; i++) {
    if (i % 1200 === 0) sim.resetHealth(); // like the training key T: full HP + full meter, so the ultimate is exercised
    sim.step([inputs[0][i], inputs[1][i]]);
    hashes.push(stateHash(sim));
    for (const e of sim.events) stats[e.kind] = (stats[e.kind] || 0) + 1;
    for (const f of sim.f) if (f.state === 'attack') stats['move:' + f.move] = (stats['move:' + f.move] || 0) + (f.t === 1 ? 1 : 0);
    for (const f of sim.f) stats['state:' + f.state] = (stats['state:' + f.state] || 0) + 1;
  }
  return { hashes, stats, final: stateHash(sim) };
}

const mode = process.argv[2] || 'check';
if (mode === 'record') {
  const [s1, s2] = (process.env.SEEDS || '9,10').split(',').map(Number);
  const a = makeScript(s1, 0), b = makeScript(s2, 1);
  const inputs = [a.bits, b.bits];
  writeFileSync(INPUTS, JSON.stringify({ frames: FRAMES, seeds: [s1, s2], patterns: [a.used, b.used], inputs }));
  const r = run(inputs);
  writeFileSync(BASE, JSON.stringify({ frames: FRAMES, final: r.final, stats: r.stats, hashes: r.hashes }));
  console.log(`recorded ${FRAMES} frames, final hash ${r.final}`);
  console.log('coverage:', JSON.stringify(Object.fromEntries(Object.entries(r.stats).filter(([k]) => !k.startsWith('state:')).sort())));
  console.log('states:', JSON.stringify(Object.fromEntries(Object.entries(r.stats).filter(([k]) => k.startsWith('state:')).sort())));
} else {
  if (!existsSync(BASE)) { console.error('no baseline: run `record` on the pre-refactor code first'); process.exit(2); }
  const { inputs } = JSON.parse(readFileSync(INPUTS, 'utf8'));
  const base = JSON.parse(readFileSync(BASE, 'utf8'));
  const r = run(inputs);
  let bad = -1;
  for (let i = 0; i < base.hashes.length; i++) if (base.hashes[i] !== r.hashes[i]) { bad = i; break; }
  if (bad >= 0) { console.log(`MISMATCH at frame ${bad + 1}: baseline ${base.hashes[bad]} vs now ${r.hashes[bad]}`); process.exit(1); }
  console.log(`replay-hash check: ${base.hashes.length} / ${base.hashes.length} frames identical (final ${r.final} = baseline ${base.final})`);
}
