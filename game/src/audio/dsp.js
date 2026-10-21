// Procedural sound bank (prompt 06). PURE: no DOM, no Web Audio. Every sound in the game is synthesised here into a mono
// Float32Array at 48 kHz, deterministically (seeded RNG), so the bank is identical in the browser, in the tests and in the
// offline renderer (tools/render_audio.mjs). No sample files: nothing to license, nothing to download, works offline.
//
// Building blocks: white noise, RBJ biquads with swept cutoff, modal resonators (damped sine banks: steel, wood, gong,
// drum membranes), Karplus-Strong (koto), additive + breath (shakuhachi), formant filtering (kiai), envelopes.

export const SR = 48000;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ primitives
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function strSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

class BQ {
  constructor(type, q = 0.707, db = 0) { this.type = type; this.q = q; this.db = db; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.f = -1; }
  set(f) {
    f = Math.max(20, Math.min(SR * 0.45, f));
    if (Math.abs(f - this.f) < 0.5) return; this.f = f;
    const w = TAU * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * this.q);
    let b0, b1, b2, a0, a1, a2;
    if (this.type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (this.type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (this.type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { const A = 10 ** (this.db / 40); b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** attack (linear) then exponential decay with time constant d */
export const ad = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));
/** whoosh shape: smooth rise to the peak at tp, exponential tail */
const bell = (t, tp, tail) => (t < 0 ? 0 : t < tp ? Math.sin((t / tp) * Math.PI / 2) ** 2 : Math.exp(-(t - tp) / tail));
/** exponential glide a -> b over the span 0..1 */
const glide = (a, b, u) => a * (b / a) ** clamp01(u);

function span(out, start, dur, fn) {
  const i0 = Math.max(0, Math.round(start * SR)), i1 = Math.min(out.length, Math.round((start + dur) * SR));
  for (let i = i0; i < i1; i++) { const v = fn((i - i0) / SR, i); out[i] += v; }
}
/** multiply a region by g(t) */
function mul(out, start, dur, g) {
  const i0 = Math.max(0, Math.round(start * SR)), i1 = Math.min(out.length, Math.round((start + dur) * SR));
  for (let i = i0; i < i1; i++) out[i] *= g((i - i0) / SR);
}

/** filtered noise; f(t) gives the cutoff / centre; env(t) the amplitude */
function noise(out, r, { start = 0, dur, type = 'bp', q = 1, f, env, gain = 1, am = null }) {
  const bq = new BQ(type, q), bq2 = type === 'bp' ? new BQ('bp', q) : null;
  let k = 0;
  span(out, start, dur, (t) => {
    if ((k++ & 15) === 0) { const fc = typeof f === 'function' ? f(t) : f; bq.set(fc); bq2?.set(fc); }
    let x = r() * 2 - 1; x = bq.run(x); if (bq2) x = bq2.run(x) * 1.6;
    return x * env(t) * gain * (am ? am(t) : 1);
  });
}

/** sine with an exponential pitch glide f0 -> f1 over `glideT` seconds */
function tone(out, { start = 0, dur, f0, f1 = f0, glideT = dur, env, gain = 1, harm = null, vib = null }) {
  let ph = 0, ph2 = 0, ph3 = 0;
  span(out, start, dur, (t) => {
    let f = glide(f0, f1, t / glideT); if (vib) f *= 1 + vib(t);
    ph += TAU * f / SR; ph2 += TAU * 2 * f / SR; ph3 += TAU * 3 * f / SR;
    let s = Math.sin(ph); if (harm) s += harm[0] * Math.sin(ph2) + (harm[1] || 0) * Math.sin(ph3);
    return s * env(t) * gain;
  });
}

/** bank of damped sines [freq, amp, decay]; `jit` detunes each mode a little (variants); `bloom` delays upper modes */
function modal(out, r, { start = 0, dur, modes, gain = 1, att = 0.0004, jit = 0.01, bloom = 0 }) {
  const ms = modes.map(([f, a, d], i) => ({ w: TAU * f * (1 + (r() - 0.5) * jit) / SR, a, d, ph: r() * TAU, up: bloom && i > 1 ? bloom : 0 }));
  span(out, start, dur, (t, i) => {
    let s = 0;
    for (const m of ms) { m.ph += m.w; s += m.a * Math.exp(-t / m.d) * Math.sin(m.ph) * (m.up ? 1 - Math.exp(-t / m.up) : 1); }
    return s * gain * (t < att ? t / att : 1);
  });
}

/** Karplus-Strong plucked string with a fractional delay (koto) */
function pluck(out, r, { start = 0, dur, f, gain = 1, damp = 0.996, bright = 0.6 }) {
  const N = SR / f - 1.5, L = Math.ceil(N) + 3, buf = new Float32Array(L);
  let lp = 0;
  for (let i = 0; i < L; i++) { const x = r() * 2 - 1; lp += bright * (x - lp); buf[i] = lp; }
  let w = 0; const fr = N - Math.floor(N), n = Math.floor(N);
  span(out, start, dur, () => {
    const a = buf[(w - n + L * 4) % L], b = buf[(w - n - 1 + L * 4) % L], c = buf[(w - n - 2 + L * 4) % L];
    const d1 = a + (b - a) * fr, d2 = b + (c - b) * fr;
    const y = damp * 0.5 * (d1 + d2);
    w = (w + 1) % L; buf[w] = y;
    return y * gain;
  });
}

function saturate(buf, drive) { const k = Math.tanh(drive); for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) / k; return buf; }
export function normalize(buf, peak = 0.89, fade = true) {
  let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) { const g = peak / m; for (let i = 0; i < buf.length; i++) buf[i] *= g; }
  // cosine fade over the last 12 % (at most 120 ms) so a voice never ends on a click or a cut-off ring
  const f = fade ? Math.min(Math.round(buf.length * 0.12), Math.round(0.12 * SR)) : 0; for (let i = 0; i < f; i++) buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / f);
  return buf;
}
/** make a buffer loop seamlessly: the last `xf` seconds are cross-faded into the start, then cut */
function loopify(buf, xf) {
  const n = Math.round(xf * SR), len = buf.length - n, out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = buf[i];
  for (let i = 0; i < n; i++) { const g = i / n; out[i] = buf[i] * Math.sqrt(g) + buf[len + i] * Math.sqrt(1 - g); }
  return out;
}
const B = (sec) => new Float32Array(Math.round(sec * SR));

// ------------------------------------------------------------------ musical scale (D miyako-bushi: D Eb G A Bb)
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
export const NOTES = { A2: 45, D3: 50, Eb3: 51, G3: 55, A3: 57, Bb3: 58, D4: 62, Eb4: 63, G4: 67, A4: 69, Bb4: 70, D5: 74, Eb5: 75, G5: 79 };
export const noteHz = (n) => midiHz(NOTES[n]);

// ------------------------------------------------------------------ recipes (r: seeded rng, v: variant index)
const whoosh = (out, r, { start = 0, peak, dur, f0, fp, f1, q = 1.2, gain = 1, type = 'bp' }) =>
  noise(out, r, { start, dur, type, q, gain, f: (t) => (t < peak ? glide(f0, fp, t / peak) : glide(fp, f1, (t - peak) / (dur - peak))), env: (t) => bell(t, peak, (dur - peak) / 3.2) });

const flutter = (hz, depth, r) => { const ph = r() * TAU; return (t) => 1 - depth + depth * (0.5 + 0.5 * Math.sin(TAU * hz * t + ph)); };

const thump = (out, { start = 0, f0, f1, d, gain = 1, glideT = 0.04 }) => tone(out, { start, dur: d * 6, f0, f1, glideT, env: (t) => ad(t, 0.0015, d), gain });

const STEEL = [[1180, 1, 0.3], [1184, 0.5, 0.28], [1795, 0.55, 0.22], [2930, 0.8, 0.2], [2936, 0.4, 0.18], [4310, 0.5, 0.14], [5920, 0.35, 0.1], [7480, 0.2, 0.07]];

export const RECIPES = {
  // ---- Samurai
  sam_draw(r) { // saya click, steel "shing" as the blade leaves the scabbard, fast draw-whoosh peaking 50 ms in
    const o = B(0.55);
    modal(o, r, { dur: 0.06, modes: [[2400, 1, 0.012], [4100, 0.6, 0.008], [6900, 0.4, 0.006]], gain: 0.7 });
    noise(o, r, { start: 0.008, dur: 0.2, type: 'bp', q: 5, f: (t) => glide(3500, 7800, t / 0.14), env: (t) => ad(t, 0.01, 0.06), gain: 0.5 });
    modal(o, r, { start: 0.02, dur: 0.4, modes: [[3150, 0.5, 0.09], [4720, 0.45, 0.07], [6610, 0.3, 0.05], [8900, 0.2, 0.04]], gain: 0.16 });
    whoosh(o, r, { peak: 0.05, dur: 0.3, f0: 900, fp: 2600, f1: 650, q: 1.1, gain: 1.1 });
    return o;
  },
  sam_cleave(r) { // two-handed overhead cleave: long rising whoosh peaking 167 ms in, cloth flutter, low weight
    const o = B(0.6);
    whoosh(o, r, { peak: 0.167, dur: 0.45, f0: 240, fp: 1150, f1: 300, q: 0.9, gain: 1.1 });
    whoosh(o, r, { peak: 0.167, dur: 0.4, f0: 120, fp: 420, f1: 140, q: 0.7, gain: 0.8, type: 'lp' });
    noise(o, r, { start: 0.04, dur: 0.3, type: 'bp', q: 1.4, f: 1600, env: (t) => bell(t, 0.12, 0.05), gain: 0.35, am: flutter(22, 0.8, r) });
    noise(o, r, { start: 0.15, dur: 0.12, type: 'bp', q: 6, f: (t) => glide(4200, 6500, t / 0.1), env: (t) => ad(t, 0.01, 0.03), gain: 0.18 });
    return o;
  },
  crescent_rel(r) { // the ultimate's release: a huge draw-sweep with a crimson ring
    const o = B(1.0);
    whoosh(o, r, { peak: 0.06, dur: 0.65, f0: 380, fp: 1700, f1: 260, q: 0.8, gain: 1.1 });
    whoosh(o, r, { peak: 0.08, dur: 0.6, f0: 70, fp: 160, f1: 50, q: 0.7, gain: 0.9, type: 'lp' });
    modal(o, r, { start: 0.03, dur: 0.9, modes: [[690, 0.6, 0.45], [1390, 0.4, 0.35], [2085, 0.3, 0.25], [3480, 0.2, 0.15]], gain: 0.4 });
    return saturate(o, 1.4);
  },
  crescent_loop(r) { // travelling crescent: a hum + whistle that loops seamlessly (pan and gain follow the projectile)
    const o = B(1.3);
    noise(o, r, { dur: 1.3, type: 'bp', q: 4, f: (t) => 640 + 60 * Math.sin(TAU * 3 * t), env: () => 1, gain: 0.8, am: flutter(14, 0.5, r) });
    tone(o, { dur: 1.3, f0: 1290, env: () => 0.18, vib: (t) => 0.012 * Math.sin(TAU * 7 * t) });
    noise(o, r, { dur: 1.3, type: 'lp', q: 0.7, f: 260, env: () => 0.7 });
    return loopify(o, 0.3);
  },
  // ---- Shinobi
  shi_swish(r) { const o = B(0.25); whoosh(o, r, { peak: 0.05, dur: 0.2, f0: 1700, fp: 4300, f1: 1400, q: 1.5 }); return o; },
  shi_kick(r) {
    const o = B(0.3);
    whoosh(o, r, { peak: 0.05, dur: 0.22, f0: 600, fp: 1700, f1: 500, q: 1 });
    noise(o, r, { dur: 0.2, type: 'bp', q: 1.2, f: 1300, env: (t) => bell(t, 0.05, 0.04), gain: 0.5, am: flutter(28, 0.9, r) });
    return o;
  },
  shi_slash(r) {
    const o = B(0.42);
    whoosh(o, r, { peak: 0.083, dur: 0.34, f0: 850, fp: 3100, f1: 750, q: 1.2, gain: 1.1 });
    modal(o, r, { start: 0.06, dur: 0.3, modes: [[3600, 0.4, 0.12], [5300, 0.3, 0.08]], gain: 0.15 });
    return o;
  },
  kunai(r) {
    const o = B(0.16);
    whoosh(o, r, { peak: 0.02, dur: 0.11, f0: 2800, fp: 6200, f1: 3000, q: 2 });
    modal(o, r, { dur: 0.06, modes: [[5200, 0.6, 0.02], [7900, 0.3, 0.01]], gain: 0.35 });
    return o;
  },
  fan(r) { // seven staggered flicks + a fire roar and crackle
    const o = B(0.8);
    for (let k = 0; k < 7; k++) whoosh(o, r, { start: k * 0.022, peak: 0.02, dur: 0.1, f0: 2400 + 300 * k, fp: 5600, f1: 2600, q: 2, gain: 0.55 });
    noise(o, r, { dur: 0.75, type: 'lp', q: 0.8, f: (t) => glide(1400, 500, t / 0.7), env: (t) => ad(t, 0.04, 0.2), gain: 0.7 });
    const cr = B(0.75); // crackle: sparse filtered impulses
    for (let i = 0; i < cr.length; i++) if (r() < 0.004 * Math.exp(-i / SR / 0.35)) cr[i] = (r() * 2 - 1) * 3;
    const bq = new BQ('bp', 1.5); bq.set(2300); for (let i = 0; i < cr.length; i++) o[i] += bq.run(cr[i]) * 0.6;
    return o;
  },
  thunk(r) { const o = B(0.25); modal(o, r, { dur: 0.25, modes: [[520, 1, 0.045], [1340, 0.5, 0.025], [3100, 0.25, 0.01]] }); return o; },
  // ---- impacts
  hit_l(r) {
    const o = B(0.3);
    thump(o, { f0: 170, f1: 70, d: 0.04, gain: 0.9 });
    noise(o, r, { dur: 0.12, type: 'lp', q: 0.7, f: 3200, env: (t) => ad(t, 0.001, 0.03), gain: 0.7 });
    noise(o, r, { start: 0.003, dur: 0.08, type: 'bp', q: 0.9, f: 6200, env: (t) => ad(t, 0.001, 0.022), gain: 0.5 });
    return saturate(o, 1.5);
  },
  hit_m(r) {
    const o = B(0.42);
    thump(o, { f0: 140, f1: 55, d: 0.07, gain: 1 });
    noise(o, r, { dur: 0.2, type: 'lp', q: 0.7, f: 2600, env: (t) => ad(t, 0.001, 0.05), gain: 0.8 });
    noise(o, r, { dur: 0.12, type: 'bp', q: 1.4, f: 1100, env: (t) => ad(t, 0.001, 0.03), gain: 0.5 });
    noise(o, r, { start: 0.004, dur: 0.12, type: 'bp', q: 0.9, f: 5800, env: (t) => ad(t, 0.001, 0.035), gain: 0.55 });
    return saturate(o, 1.8);
  },
  hit_h(r) {
    const o = B(0.75);
    thump(o, { f0: 115, f1: 40, d: 0.14, gain: 1.1, glideT: 0.08 });
    tone(o, { dur: 0.7, f0: 56, env: (t) => ad(t, 0.004, 0.2), gain: 0.6 });
    noise(o, r, { dur: 0.35, type: 'lp', q: 0.7, f: 1900, env: (t) => ad(t, 0.001, 0.09), gain: 0.9 });
    noise(o, r, { dur: 0.2, type: 'bp', q: 1.6, f: 850, env: (t) => ad(t, 0.001, 0.05), gain: 0.6 });
    noise(o, r, { start: 0.005, dur: 0.2, type: 'bp', q: 0.9, f: 5200, env: (t) => ad(t, 0.001, 0.06), gain: 0.6 });
    return saturate(o, 1.6);
  },
  counter(r) {
    const o = B(1.0);
    tone(o, { dur: 0.09, f0: 1900, f1: 3300, env: (t) => ad(t, 0.002, 0.03), gain: 0.4 });
    modal(o, r, { start: 0.01, dur: 1.0, modes: [[3150, 1, 0.2], [4730, 0.7, 0.15], [6280, 0.4, 0.1], [8400, 0.3, 0.06]], gain: 0.6 });
    return o;
  },
  ko_boom(r) {
    const o = B(2.4);
    tone(o, { dur: 2.4, f0: 72, f1: 31, glideT: 0.9, env: (t) => ad(t, 0.005, 0.5), gain: 1 });
    noise(o, r, { dur: 1.0, type: 'lp', q: 0.7, f: (t) => glide(900, 200, t / 0.6), env: (t) => ad(t, 0.002, 0.25), gain: 0.8 });
    modal(o, r, { dur: 2.4, modes: [[62, 0.6, 0.6], [99, 0.4, 0.4], [133, 0.3, 0.3]], gain: 0.5 });
    return saturate(o, 1.8);
  },
  block_steel(r) {
    const o = B(1.1);
    noise(o, r, { dur: 0.03, type: 'hp', q: 0.7, f: 2200, env: (t) => ad(t, 0.0005, 0.006), gain: 0.8 });
    thump(o, { f0: 230, f1: 120, d: 0.035, gain: 0.5 });
    modal(o, r, { dur: 1.1, modes: STEEL, gain: 0.55, jit: 0.02 });
    return o;
  },
  block_wood(r) {
    const o = B(0.3);
    noise(o, r, { dur: 0.02, type: 'hp', q: 0.7, f: 1800, env: (t) => ad(t, 0.0005, 0.005), gain: 0.6 });
    thump(o, { f0: 200, f1: 110, d: 0.03, gain: 0.5 });
    modal(o, r, { dur: 0.25, modes: [[820, 1, 0.05], [2140, 0.6, 0.03], [3600, 0.3, 0.02], [3820, 0.35, 0.06], [5600, 0.25, 0.04]], gain: 0.7, jit: 0.03 });
    return o;
  },
  chip(r) { // gritty scrape of a blade grinding along a guard
    const o = B(0.3); let g = 1;
    noise(o, r, { dur: 0.26, type: 'bp', q: 3, f: (t) => 2600 - 1200 * t, env: (t) => ad(t, 0.005, 0.07), gain: 0.9, am: () => (r() < 0.08 ? (g = 0.3 + r()) : g) });
    noise(o, r, { dur: 0.2, type: 'bp', q: 4, f: 5200, env: (t) => ad(t, 0.003, 0.04), gain: 0.4 });
    return o;
  },
  // ---- movement
  dash(r) {
    const o = B(0.3);
    noise(o, r, { dur: 0.16, type: 'bp', q: 1, f: 1250, env: (t) => ad(t, 0.006, 0.05), gain: 0.8, am: flutter(30, 0.7, r) });
    let g = 1; noise(o, r, { start: 0.02, dur: 0.22, type: 'lp', q: 0.8, f: 1900, env: (t) => ad(t, 0.01, 0.06), gain: 0.6, am: () => (r() < 0.05 ? (g = 0.4 + 0.6 * r()) : g) });
    return o;
  },
  heel_drag(r) {
    const o = B(0.4); let g = 1;
    noise(o, r, { dur: 0.32, type: 'lp', q: 0.9, f: 950, env: (t) => ad(t, 0.02, 0.1), gain: 1, am: () => (r() < 0.04 ? (g = 0.35 + 0.65 * r()) : g) });
    noise(o, r, { dur: 0.25, type: 'bp', q: 2, f: 2600, env: (t) => ad(t, 0.01, 0.06), gain: 0.25 });
    noise(o, r, { dur: 0.14, type: 'bp', q: 1, f: 1300, env: (t) => ad(t, 0.005, 0.04), gain: 0.4, am: flutter(26, 0.7, r) });
    return o;
  },
  jump(r) {
    const o = B(0.2);
    whoosh(o, r, { peak: 0.03, dur: 0.14, f0: 800, fp: 1600, f1: 700, q: 1 });
    thump(o, { f0: 120, f1: 80, d: 0.025, gain: 0.35 });
    return o;
  },
  land(r) {
    const o = B(0.25);
    thump(o, { f0: 98, f1: 60, d: 0.05, gain: 0.9 });
    modal(o, r, { dur: 0.2, modes: [[182, 1, 0.05], [410, 0.5, 0.04], [930, 0.25, 0.025]], gain: 0.6, jit: 0.05 });
    noise(o, r, { dur: 0.05, type: 'lp', q: 0.7, f: 1500, env: (t) => ad(t, 0.001, 0.01), gain: 0.4 });
    return o;
  },
  bodyfall(r) {
    const o = B(0.9);
    thump(o, { f0: 85, f1: 42, d: 0.15, gain: 1.1, glideT: 0.08 });
    modal(o, r, { dur: 0.4, modes: [[150, 1, 0.1], [340, 0.6, 0.07], [760, 0.3, 0.04]], gain: 0.7, jit: 0.05 });
    noise(o, r, { dur: 0.3, type: 'lp', q: 0.7, f: 1200, env: (t) => ad(t, 0.002, 0.07), gain: 0.6 });
    for (let k = 0; k < 4; k++) modal(o, r, { start: 0.02 + r() * 0.12, dur: 0.06, modes: [[3800 + r() * 1500, 0.5, 0.012], [6100 + r() * 1500, 0.3, 0.008]], gain: 0.25 });
    return saturate(o, 1.5);
  },
  step(r) {
    const o = B(0.2);
    noise(o, r, { dur: 0.08, type: 'lp', q: 0.7, f: 900, env: (t) => ad(t, 0.003, 0.02), gain: 0.8 });
    modal(o, r, { dur: 0.1, modes: [[210, 0.5, 0.03], [520, 0.2, 0.015]], gain: 0.6, jit: 0.08 });
    return o;
  },
  guard(r) {
    const o = B(0.18);
    noise(o, r, { dur: 0.14, type: 'bp', q: 0.8, f: 1500, env: (t) => ad(t, 0.01, 0.035), gain: 0.8 });
    modal(o, r, { start: 0.03, dur: 0.08, modes: [[4200, 0.5, 0.025], [6300, 0.25, 0.012]], gain: 0.45 });
    return o;
  },
  // ---- ultimate start: o-daiko + inhale + a shimmer swelling across the 34-frame freeze + kiai
  super(r) {
    const o = B(2.4);
    RECIPES._drum(o, r, { f: 56, d: 0.7, gain: 1.1 });
    noise(o, r, { start: 0.04, dur: 0.32, type: 'bp', q: 1.2, f: (t) => glide(1800, 900, t / 0.3), env: (t) => bell(t, 0.22, 0.04), gain: 0.25 });
    const sh = B(0.62); // shimmer that swells across the freeze and cuts at the release
    modal(sh, r, { dur: 0.62, modes: [[1210, 0.5, 9], [1815, 0.4, 9], [2422, 0.35, 9], [3630, 0.2, 9]], gain: 0.3 });
    noise(sh, r, { dur: 0.62, type: 'bp', q: 10, f: (t) => glide(2400, 4800, t / 0.57), env: () => 0.6 });
    mul(sh, 0, 0.62, (t) => (t / 0.57) ** 2 * (t < 0.57 ? 1 : Math.max(0, 1 - (t - 0.57) / 0.05)));
    for (let i = 0; i < sh.length; i++) o[i] += sh[i];
    RECIPES._kiai(o, r, { start: 0.4, gain: 0.5 });
    return o;
  },
  // ---- instruments (music + stingers)
  _drum(o, r, { start = 0, f, d, gain = 1, slap = 0.5 }) { // taiko membrane (ratios of a struck circular membrane)
    tone(o, { start, dur: d * 5, f0: f * 1.2, f1: f, glideT: 0.03, env: (t) => ad(t, 0.002, d), gain });
    modal(o, r, { start, dur: d * 4, modes: [[f * 1.59, 0.35, d * 0.5], [f * 2.14, 0.22, d * 0.35], [f * 2.65, 0.12, d * 0.25], [f * 3.16, 0.08, d * 0.2]], gain: gain * 0.8 });
    noise(o, r, { start, dur: 0.06, type: 'lp', q: 0.7, f: 900, env: (t) => ad(t, 0.0008, 0.012), gain: gain * slap });
  },
  _kiai(o, r, { start = 0, gain = 1 }) { // "HAA!": a breathy glottal pulse train through the formants of /a/
    const fs = [[780, 9, 1], [1180, 11, 0.55], [2550, 14, 0.25], [3400, 16, 0.12]].map(([f, q, g]) => { const b = new BQ('bp', q); b.set(f); return [b, g]; });
    let ph = 0;
    span(o, start, 0.42, (t) => {
      const f0 = t < 0.08 ? glide(165, 235, t / 0.08) : glide(235, 150, (t - 0.08) / 0.3);
      ph += f0 / SR; if (ph >= 1) ph -= 1;
      const voiced = t < 0.03 ? t / 0.03 * 0.3 : 1, src = (1 - 2 * ph) * voiced * 0.8 + (r() * 2 - 1) * (t < 0.04 ? 1 : 0.3);
      let s = 0; for (const [b, g] of fs) s += b.run(src) * g;
      return Math.tanh(s * 2.5) * gain * (t < 0.02 ? t / 0.02 : 1) * (t < 0.24 ? 1 : Math.exp(-(t - 0.24) / 0.06));
    });
  },
  don(r) { const o = B(1.8); RECIPES._drum(o, r, { f: 88, d: 0.32 }); return saturate(o, 1.3); },
  odaiko(r) { const o = B(3.6); RECIPES._drum(o, r, { f: 54, d: 0.75, gain: 1.1, slap: 0.4 }); return saturate(o, 1.4); },
  ka(r) { const o = B(0.12); modal(o, r, { dur: 0.1, modes: [[1750, 1, 0.018], [2950, 0.5, 0.012], [5100, 0.2, 0.006]] }); noise(o, r, { dur: 0.02, type: 'bp', q: 1, f: 3000, env: (t) => ad(t, 0.0005, 0.004), gain: 0.5 }); return o; },
  shime(r) { const o = B(0.35); RECIPES._drum(o, r, { f: 330, d: 0.06, slap: 0.8 }); noise(o, r, { dur: 0.04, type: 'bp', q: 1, f: 2600, env: (t) => ad(t, 0.0005, 0.012), gain: 0.4 }); return o; },
  clack(r) { const o = B(0.12); modal(o, r, { dur: 0.1, modes: [[2300, 1, 0.025], [4900, 0.6, 0.015], [7600, 0.3, 0.01]] }); noise(o, r, { dur: 0.01, type: 'hp', q: 0.7, f: 3000, env: (t) => ad(t, 0.0003, 0.002), gain: 0.8 }); return o; },
  gong(r) {
    const o = B(7), f = 98;
    modal(o, r, { dur: 7, modes: [[f, 1, 2.4], [f * 1.003, 0.6, 2.2], [f * 1.48, 0.7, 2], [f * 2.03, 0.6, 1.6], [f * 2.69, 0.5, 1.2], [f * 3.38, 0.4, 1], [f * 4.17, 0.3, 0.8], [f * 5.02, 0.25, 0.6], [f * 6.3, 0.15, 0.4]], gain: 0.7, bloom: 0.25, jit: 0.004 });
    noise(o, r, { dur: 0.1, type: 'lp', q: 0.7, f: 1200, env: (t) => ad(t, 0.001, 0.02), gain: 0.5 });
    tone(o, { dur: 0.4, f0: 70, f1: 50, env: (t) => ad(t, 0.002, 0.08), gain: 0.5 });
    return o;
  },
  koto(r, v, note) { // plucked string + "tsume" pick click + a body resonance
    const o = B(2.2), f = noteHz(note);
    pluck(o, r, { dur: 2.2, f, damp: 0.9965 - Math.max(0, f - 300) * 0.000004, bright: 0.55 });
    noise(o, r, { dur: 0.012, type: 'hp', q: 0.7, f: 3500, env: (t) => ad(t, 0.0003, 0.003), gain: 0.4 });
    const pk = new BQ('peak', 1.2, 5); pk.set(420); for (let i = 0; i < o.length; i++) o[i] = pk.run(o[i]);
    mul(o, 0, 2.2, (t) => Math.exp(-t / 1.1));
    return o;
  },
  shaku(r, v, note) { // shakuhachi: breathy fundamental, delayed vibrato, "muraiki" breath attack; sustains 2.4 s
    const o = B(2.8), f = noteHz(note);
    const env = (t) => (t < 0.1 ? t / 0.1 : 1) * (t > 2.4 ? Math.exp(-(t - 2.4) / 0.08) : 1) * (0.85 + 0.15 * Math.sin(TAU * 0.7 * t));
    tone(o, { dur: 2.8, f0: f * 0.985, f1: f, glideT: 0.12, env, gain: 0.55, harm: [0.22, 0.06], vib: (t) => (t > 0.5 ? 0.007 * Math.min(1, (t - 0.5) / 0.6) * Math.sin(TAU * 5.2 * t) : 0) });
    noise(o, r, { dur: 2.8, type: 'bp', q: 9, f, env, gain: 0.35 });
    noise(o, r, { dur: 2.8, type: 'hp', q: 0.7, f: 2500, env: (t) => env(t) * 0.5, gain: 0.04 });
    noise(o, r, { dur: 0.25, type: 'bp', q: 2, f: f * 2.2, env: (t) => ad(t, 0.02, 0.06), gain: 0.3 });
    return o;
  },
  shami(r, v, note) { // shamisen: bright, buzzing pluck ("sawari") with a hard bachi attack and a skin-head thump
    const o = B(1.1), f = noteHz(note);
    pluck(o, r, { dur: 1.1, f, damp: 0.9935, bright: 0.92 });
    pluck(o, r, { dur: 1.1, f: f * 2.003, damp: 0.991, bright: 0.9, gain: 0.35 });
    for (let i = 0; i < o.length; i++) o[i] = Math.tanh(o[i] * 2.4) * 0.6 + o[i] * 0.4; // the buzz
    noise(o, r, { dur: 0.03, type: 'bp', q: 1.4, f: 2400, env: (t) => ad(t, 0.0004, 0.006), gain: 0.7 }); // bachi click
    tone(o, { dur: 0.12, f0: 190, f1: 120, env: (t) => ad(t, 0.001, 0.025), gain: 0.35 }); // the cat-skin head
    mul(o, 0, 1.1, (t) => Math.exp(-t / 0.42));
    return o;
  },
  drone(r) { // loopable D drone: D2 + A2 + D3 + A3 with slow beating
    const o = B(8.4);
    for (const [f, a] of [[73.42, 0.5], [110, 0.32], [146.83, 0.26], [220, 0.1], [293.66, 0.05]]) for (const dt of [-0.12, 0.12]) {
      const ph0 = r() * TAU, lfo = r() * TAU; let ph = ph0;
      span(o, 0, 8.4, (t) => { ph += TAU * (f + dt) / SR; return a * Math.sin(ph) * (0.8 + 0.2 * Math.sin(TAU * 0.11 * t + lfo)); });
    }
    noise(o, r, { dur: 8.4, type: 'bp', q: 6, f: 147, env: () => 0.25 });
    const lp = new BQ('lp', 0.7); lp.set(700); for (let i = 0; i < o.length; i++) o[i] = lp.run(o[i]);
    return loopify(o, 1.2);
  },
  wind(r) { // loopable wind for the menu ambience
    const o = B(9.5);
    const p = [r() * TAU, r() * TAU];
    noise(o, r, { dur: 9.5, type: 'bp', q: 0.9, f: (t) => 520 + 260 * Math.sin(TAU * 0.13 * t + p[0]) + 120 * Math.sin(TAU * 0.37 * t + p[1]), env: (t) => 0.6 + 0.4 * Math.sin(TAU * 0.09 * t + p[1]) });
    return loopify(o, 1.5);
  },
  // ---- UI + timer
  ui_hover(r) { const o = B(0.12); modal(o, r, { dur: 0.12, modes: [[1850, 1, 0.012], [4100, 0.3, 0.006]] }); return o; },
  ui_tab(r) { const o = B(0.16); modal(o, r, { dur: 0.16, modes: [[1100, 1, 0.022], [2600, 0.4, 0.014]] }); return o; },
  ui_back(r) { const o = B(0.16); modal(o, r, { dur: 0.16, modes: [[760, 1, 0.024], [1900, 0.35, 0.012]] }); return o; },
  tick(r) { const o = B(0.16); modal(o, r, { dur: 0.16, modes: [[1400, 1, 0.022], [3300, 0.4, 0.012]] }); return o; },
  tick_hi(r) { const o = B(0.2); modal(o, r, { dur: 0.2, modes: [[2050, 1, 0.026], [4700, 0.5, 0.015], [6900, 0.2, 0.008]] }); return o; },
};

// ------------------------------------------------------------------ stingers composed from the instruments
const mixIn = (o, src, at, g = 1) => { const i0 = Math.round(at * SR); for (let i = 0; i < src.length && i0 + i < o.length; i++) o[i0 + i] += src[i] * g; };
const inst = (name, seed, note) => normalize(RECIPES[name](mulberry32(seed), 0, note));
Object.assign(RECIPES, {
  ui_go(r) { const o = B(2.2); mixIn(o, inst('koto', 3, 'D4'), 0, 0.7); mixIn(o, inst('koto', 4, 'A4'), 0.09, 0.6); mixIn(o, inst('don', 5), 0, 0.5); return o; },
  ui_pick(r) { // a fighter is chosen: shamisen strike + taiko + a bright koto pair
    const o = B(2.4); mixIn(o, inst('shami', 6, 'D3'), 0, 0.8); mixIn(o, inst('don', 7), 0, 0.7); mixIn(o, inst('koto', 8, 'A4'), 0.05, 0.5); mixIn(o, inst('koto', 9, 'D5'), 0.1, 0.45);
    RECIPES._kiai(o, r, { start: 0.04, gain: 0.18 }); return o;
  },
  vs_slam(r) { // the VS screen: two clacks, an o-daiko hit and the gong swelling under it
    const o = B(6); mixIn(o, inst('clack', 91), 0, 0.9); mixIn(o, inst('clack', 92), 0.22, 1); mixIn(o, inst('odaiko', 93), 0.24, 1); mixIn(o, inst('gong', 94), 0.26, 0.55);
    mixIn(o, inst('shami', 95, 'D3'), 0.24, 0.6); return o;
  },
  st_round1(r) { const o = B(7.6); mixIn(o, inst('odaiko', 11), 0, 1); mixIn(o, inst('gong', 12), 0.55, 0.45); return o; },
  st_round2(r) { const o = B(7.9); mixIn(o, inst('odaiko', 11), 0, 0.9); mixIn(o, inst('odaiko', 13), 0.3, 1); mixIn(o, inst('gong', 12), 0.85, 0.45); return o; },
  st_round3(r) { const o = B(8.1); mixIn(o, inst('odaiko', 11), 0, 0.8); mixIn(o, inst('odaiko', 13), 0.25, 0.9); mixIn(o, inst('odaiko', 14), 0.5, 1); mixIn(o, inst('gong', 12), 1.05, 0.5); return o; },
  st_fight(r) { const o = B(2.6); mixIn(o, inst('clack', 21), 0, 1); mixIn(o, inst('clack', 22), 0.13, 1); mixIn(o, inst('odaiko', 23), 0.13, 0.9); RECIPES._kiai(o, r, { start: 0.15, gain: 0.35 }); return o; },
  st_ko(r) { const o = B(7); mixIn(o, inst('gong', 31), 0, 1); mixIn(o, inst('odaiko', 32), 0, 0.7); return o; },
  st_time(r) { // hyoshigi roll that speeds up, then a single clack (the kabuki curtain call)
    const o = B(2.8); let t = 0, gap = 0.16; for (let k = 0; k < 9; k++) { mixIn(o, inst('clack', 40 + k), t, 0.6 + 0.04 * k); t += gap; gap *= 0.8; }
    mixIn(o, inst('clack', 60), t + 0.25, 1); mixIn(o, inst('don', 61), t + 0.25, 0.6); return o;
  },
  st_win(r) {
    const o = B(7.6); ['D4', 'Eb4', 'G4', 'A4', 'D5'].forEach((n, k) => mixIn(o, inst('koto', 70 + k, n), k * 0.11, 0.6));
    mixIn(o, inst('gong', 79), 0.55, 0.6); mixIn(o, inst('odaiko', 78), 0.55, 0.7); return o;
  },
  st_draw(r) { const o = B(7); mixIn(o, inst('gong', 81), 0, 0.8); mixIn(o, inst('koto', 82, 'D3'), 0.1, 0.5); mixIn(o, inst('koto', 83, 'Eb3'), 0.35, 0.4); return o; },
});

const LOOPS = new Set(['crescent_loop', 'drone', 'wind']); // seamless loops: no end fade
/** render one sound variant (seeded by id + variant), normalised */
export function render(id, v = 0, note) {
  const fn = RECIPES[id]; if (!fn) throw new Error('no recipe ' + id);
  return normalize(fn(mulberry32(strSeed(id + ':' + v + ':' + (note || ''))), v, note), 0.89, !LOOPS.has(id));
}

/** a dojo-hall impulse response (stereo, decorrelated decaying noise, high frequencies die first) for the reverb send */
export function reverbIR(sec = 1.4, seed = 99) {
  const r = mulberry32(seed), n = Math.round(sec * SR), L = new Float32Array(n), R = new Float32Array(n);
  const lpL = new BQ('lp', 0.7), lpR = new BQ('lp', 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = Math.exp(-t / (sec / 6.9)) * (t < 0.008 ? 0 : 1), fc = 9000 * Math.exp(-t / 0.5) + 900;
    if ((i & 31) === 0) { lpL.set(fc); lpR.set(fc); }
    L[i] = lpL.run(r() * 2 - 1) * e; R[i] = lpR.run(r() * 2 - 1) * e;
  }
  for (const [ms, g] of [[11, 0.5], [17, 0.4], [23, 0.3], [31, 0.25]]) { const i = Math.round(ms / 1000 * SR); L[i] += g; R[i + 37] += g * 0.9; } // early reflections
  let m = 0; for (let i = 0; i < n; i++) m += L[i] * L[i] + R[i] * R[i];
  const g = 1 / Math.sqrt(m / 2); for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}
