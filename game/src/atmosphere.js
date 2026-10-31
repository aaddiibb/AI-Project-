// Time of day + weather. RENDER ONLY: nothing here reads or writes the sim, so replays and the AI are unaffected.
// Every round of a match gets a condition (clear day, morning mist, golden dusk, moonlit night, rain, thunderstorm,
// snow) that re-lights the current stage:
//   - a painted sky (gradient, sun / moon, stars, clouds) cross-faded over the stage's own sky layer
//   - per-depth colour grading of the parallax layers (sky / far / mid / near / floor) and of the fighters
//   - haze banks between the depth bands, god rays, lit lanterns and shoji windows (stage.json `lights`)
//   - particles: rain with ground splashes, snow, fireflies; lightning bolts with a double flash and thunder
//   - a wet (reflective) or snow-dusted floor, a vignette, and rain / thunder audio on the SFX bus
// A new condition blends in over ~2 s, so the weather visibly turns as the next round is announced.
// Front end: with no game running the conditions cycle slowly behind the menus.

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const mixC = (a, b, t) => {
  const r = lerp((a >> 16) & 255, (b >> 16) & 255, t), g = lerp((a >> 8) & 255, (b >> 8) & 255, t), bl = lerp(a & 255, b & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
/** multiply two 0xRRGGBB colours (a tint applied on top of a tint) */
export const mulC = (a, b) => ((Math.round(((a >> 16) & 255) * ((b >> 16) & 255) / 255) << 16) | (Math.round(((a >> 8) & 255) * ((b >> 8) & 255) / 255) << 8) | Math.round((a & 255) * (b & 255) / 255)) >>> 0;

// ------------------------------------------------------------------ the conditions
// t* = multiply tints per depth band, haze/hazeA = fog between bands, glow = lanterns + windows, rays = god rays,
// rain/snow/flies = particle amounts, wind = slant + drift, bolt = lightning, vig = vignette, wet / cover = floor,
// amb = stage petals / leaves, stars = night sky sparkle. Colours blend channel-wise, everything else linearly.
const BASE = { sky: null, tSky: 0xffffff, tFar: 0xffffff, tMid: 0xffffff, tNear: 0xffffff, tFloor: 0xffffff, tFighter: 0xffffff, haze: 0xfff4dc, hazeA: 0, glow: 0, rays: 0, rayC: 0xfff2c8, rain: 0, snow: 0, flies: 0, wind: 0, bolt: 0, vig: 0.1, wet: 0, cover: 0, amb: 1, stars: 0 };
export const CONDITIONS = {
  day: { ...BASE, label: 'CLEAR SKY', icon: '☀︎', rays: 0.55 },
  dawn: { ...BASE, label: 'MORNING MIST', icon: '≋', sky: 'dawn', tSky: 0xf4eef6, tFar: 0xd8d6ec, tMid: 0xe6e2f0, tNear: 0xf2eef2, tFloor: 0xf0ecee, tFighter: 0xf4f0f4, haze: 0xf2e8f0, hazeA: 0.62, rays: 0.4, rayC: 0xffe4e8, amb: 0.8, vig: 0.12 },
  dusk: { ...BASE, label: 'GOLDEN DUSK', icon: '◓', sky: 'dusk', tFar: 0xe8a08c, tMid: 0xf6b896, tNear: 0xffd2b0, tFloor: 0xffd0aa, tFighter: 0xffe0c6, haze: 0xff9a64, hazeA: 0.32, glow: 0.55, rays: 0.75, rayC: 0xffb070, vig: 0.26 },
  night: { ...BASE, label: 'MOONLIT NIGHT', icon: '☾', sky: 'night', tFar: 0x46568a, tMid: 0x46548a, tNear: 0x5a6698, tFloor: 0x66729e, tFighter: 0x9ca6d2, haze: 0x26325c, hazeA: 0.32, glow: 1, flies: 1, amb: 0.55, vig: 0.46, stars: 1 },
  rain: { ...BASE, label: 'RAIN', icon: '☂︎', sky: 'rain', tFar: 0x8a96a8, tMid: 0x7e8a9c, tNear: 0x8b95a6, tFloor: 0x7c8696, tFighter: 0xc6ccd8, haze: 0xb0b8c8, hazeA: 0.5, glow: 0.5, rain: 0.65, wind: 0.25, vig: 0.3, wet: 1, amb: 0.2 },
  storm: { ...BASE, label: 'THUNDERSTORM', icon: 'ϟ', sky: 'storm', tFar: 0x3c4458, tMid: 0x3e465c, tNear: 0x4e566c, tFloor: 0x4e566a, tFighter: 0x8c94aa, haze: 0x2a3042, hazeA: 0.46, glow: 0.9, rain: 1, wind: 0.6, bolt: 1, vig: 0.55, wet: 1, amb: 0.1 },
  snow: { ...BASE, label: 'FIRST SNOW', icon: '❄︎', sky: 'snow', tFar: 0xc8d2ea, tMid: 0xd4dcf0, tNear: 0xe2e6f4, tFloor: 0xeceef6, tFighter: 0xe4e8f6, haze: 0xe6ecf8, hazeA: 0.52, glow: 0.35, snow: 1, wind: 0.15, cover: 1, amb: 0, vig: 0.2 },
};
const COLORS = ['tSky', 'tFar', 'tMid', 'tNear', 'tFloor', 'tFighter', 'haze', 'rayC'];
const NUMS = ['hazeA', 'glow', 'rays', 'rain', 'snow', 'flies', 'wind', 'bolt', 'vig', 'wet', 'cover', 'amb', 'stars'];

/** OPTIONS → TIME & WEATHER: 'dynamic' (the day turns round by round), 'random', or one fixed condition */
export const WEATHER_MODES = ['dynamic', 'random', ...Object.keys(CONDITIONS)];
export const weatherLabel = (m) => (m === 'dynamic' ? 'DYNAMIC' : m === 'random' ? 'RANDOM' : CONDITIONS[m]?.label || 'DYNAMIC');
// dynamic: round 1 in daylight, round 2 at dusk or night, round 3 brings the weather; later rounds anything new
const POOLS = [['day', 'day', 'dawn'], ['dusk', 'night', 'night'], ['storm', 'storm', 'rain', 'snow']];
/** the conditions for rounds 1..n (cosmetic, so Math.random is fine) */
export function rollConditions(mode = 'dynamic', n = 9) {
  if (CONDITIONS[mode]) return Array(n).fill(mode);
  const all = Object.keys(CONDITIONS), out = [];
  for (let i = 0; i < n; i++) {
    const pool = (mode === 'dynamic' && POOLS[i]) || all;
    let c, k = 0;
    do c = pool[Math.floor(Math.random() * pool.length)]; while (c === out[i - 1] && ++k < 20);
    out.push(c);
  }
  return out;
}
// the front end shows the whole cycle, one condition every ~12 s
const CYCLE = ['day', 'dusk', 'night', 'storm', 'snow', 'dawn', 'rain'];

// ------------------------------------------------------------------ procedural textures
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function radial(n, stops) {
  const [c, g] = canvas(n, n), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, n, n); return c;
}
function softRect(n, edge) { // white rectangle with soft edges (lit windows)
  const [c, g] = canvas(n, n), d = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const e = Math.min(x, y, n - 1 - x, n - 1 - y) / edge, a = Math.max(0, Math.min(1, e));
    d.data.set([255, 255, 255, Math.round(255 * a * a * (3 - 2 * a))], (y * n + x) * 4);
  }
  g.putImageData(d, 0, 0); return c;
}
function vgradient(w, h, stops) {
  const [c, g] = canvas(w, h), gr = g.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, w, h); return c;
}
function rayCanvas() {
  const [c, g] = canvas(64, 512), d = g.createImageData(64, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 64; x++) {
    const h = Math.exp(-(((x - 31.5) / 14) ** 2)), v = Math.sin(Math.PI * Math.min(1, y / 512)) ** 1.5 * (1 - y / 700);
    d.data.set([255, 255, 255, Math.round(255 * h * v)], (y * 64 + x) * 4);
  }
  g.putImageData(d, 0, 0); return c;
}
function ringCanvas() {
  const [c, g] = canvas(64, 24);
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.ellipse(32, 12, 29, 9, 0, 0, Math.PI * 2); g.stroke(); return c;
}
function coverCanvas() { // snow dusting: soft white drifts, denser at the back of the floor
  const [c, g] = canvas(1024, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,.35)');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 128);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const y = r() * 128, w = 10 + r() * 60;
    g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.5})`; g.beginPath(); g.ellipse(r() * 1024, y, w, w * 0.12 + y * 0.03, 0, 0, Math.PI * 2); g.fill();
  }
  return c;
}

// ------------------------------------------------------------------ painted skies (sky layer space: x -700..5900, y -2000..1500)
const SX = -700, SY = -2000, SW = 6600, SH = 3500, SC = 0.2;
function paintSky(key) {
  const [c, g] = canvas(SW * SC, SH * SC), X = (x) => (x - SX) * SC, Y = (y) => (y - SY) * SC;
  let seed = { dawn: 3, dusk: 5, night: 9, rain: 13, storm: 17, snow: 21 }[key] || 1;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sky = (stops) => { const gr = g.createLinearGradient(0, Y(-1500), 0, Y(1250)); for (const [o, col] of stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height); };
  const glow = (x, y, rad, col, a) => { const gr = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), rad * SC); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height); };
  const cloud = (x, y, w, h, top, bottom, a) => { // a soft layered cloud bank, lit from above
    g.save(); if ('filter' in g) g.filter = 'blur(2px)';
    for (let i = 0; i < 9; i++) {
      const cx = x + (r() - 0.5) * w, cy = y + (r() - 0.5) * h * 0.5, rw = w * (0.18 + r() * 0.25), rh = h * (0.35 + r() * 0.4);
      const gr = g.createLinearGradient(0, Y(cy - rh), 0, Y(cy + rh)); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
      g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.ellipse(X(cx), Y(cy), rw * SC, rh * SC, 0, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  };
  const streak = (y, a, col) => { g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.ellipse(X(1500 + r() * 3000), Y(y), (1400 + r() * 1400) * SC, (18 + r() * 22) * SC, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; };
  if (key === 'dawn') {
    sky([[0, '#8fa6d0'], [0.4, '#c9c3e0'], [0.72, '#f3d6dc'], [1, '#fde6d6']]);
    glow(1600, 700, 1300, 'rgba(255,236,214,A)', 0.8);
    for (let i = 0; i < 7; i++) streak(-300 + i * 170, 0.35, '#fff4f4');
  } else if (key === 'dusk') {
    sky([[0, '#26244e'], [0.3, '#5a3a6e'], [0.55, '#c25a5a'], [0.75, '#f39150'], [0.9, '#ffc372'], [1, '#ffe2a4']]);
    glow(3600, 820, 1700, 'rgba(255,170,90,A)', 0.75);
    for (let i = 0; i < 9; i++) { const y = -1000 + i * 190 + r() * 60; cloud(800 + r() * 5000, y, 1400, 120, i < 4 ? '#f6a0a0' : '#ffcf8a', i < 4 ? '#6a3a62' : '#c25a5a', 0.75); }
  } else if (key === 'night') {
    sky([[0, '#05081a'], [0.45, '#0f1838'], [0.8, '#1f2a54'], [1, '#33406e']]);
    // the milky way: a faint diagonal band of dust and dense stars
    g.save(); g.translate(X(2600), Y(-500)); g.rotate(-0.35);
    const mw = g.createLinearGradient(0, -90, 0, 90); mw.addColorStop(0, 'rgba(160,170,230,0)'); mw.addColorStop(0.5, 'rgba(170,180,240,.16)'); mw.addColorStop(1, 'rgba(160,170,230,0)');
    g.fillStyle = mw; g.fillRect(-900, -90, 1800, 180); g.restore();
    for (let i = 0; i < 900; i++) {
      const x = SX + r() * SW, y = -1900 + (r() ** 1.6) * 2600, b = r();
      g.fillStyle = `rgba(${Math.round(220 + b * 35)},${Math.round(220 + b * 30)},255,${(0.25 + b * 0.75) * (1 - Math.max(0, Math.min(1, (y - 300) / 900)))})`;
      g.fillRect(X(x), Y(y), b > 0.93 ? 2 : 1, b > 0.93 ? 2 : 1);
    }
    for (let i = 0; i < 5; i++) cloud(400 + r() * 5400, -200 + r() * 900, 1200, 110, '#3a4878', '#141c3c', 0.6);
    glow(3900, -620, 900, 'rgba(150,170,255,A)', 0.22);
  } else if (key === 'rain') {
    sky([[0, '#4a5262'], [0.5, '#6c7686'], [1, '#a0a8b4']]);
    for (let i = 0; i < 16; i++) cloud(SX + r() * SW, -1400 + r() * 1700, 1300, 260, '#8a93a2', '#4e5666', 0.7);
  } else if (key === 'storm') {
    sky([[0, '#0c0f17'], [0.4, '#1d2230'], [0.8, '#353c4c'], [1, '#4e5664']]);
    for (let i = 0; i < 20; i++) cloud(SX + r() * SW, -1500 + r() * 1800, 1300, 300, '#3c4458', '#0e1118', 0.8);
  } else if (key === 'snow') {
    sky([[0, '#8592aa'], [0.5, '#b4bed0'], [1, '#e0e5ee']]);
    for (let i = 0; i < 12; i++) cloud(SX + r() * SW, -1300 + r() * 1500, 1400, 240, '#e6eaf2', '#9aa4b8', 0.55);
  }
  return c;
}
/** the moon: a crisp disc with soft maria and a halo (hi-res, separate from the low-res sky) */
function moonCanvas() {
  const n = 256, [c, g] = canvas(n, n), m = n / 2, rad = 46;
  let gr = g.createRadialGradient(m, m, rad * 0.8, m, m, m); gr.addColorStop(0, 'rgba(200,215,255,.45)'); gr.addColorStop(1, 'rgba(200,215,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  gr = g.createRadialGradient(m - 12, m - 12, 4, m, m, rad); gr.addColorStop(0, '#fffdf4'); gr.addColorStop(1, '#e4e2d6');
  g.fillStyle = gr; g.beginPath(); g.arc(m, m, rad, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(150,150,140,.22)';
  for (const [x, y, s] of [[-14, -8, 13], [10, 6, 10], [-4, 18, 8], [16, -16, 6], [-20, 12, 5]]) { g.beginPath(); g.arc(m + x, m + y, s, 0, Math.PI * 2); g.fill(); }
  return c;
}
function sunCanvas(col) {
  const n = 256, [c, g] = canvas(n, n), m = n / 2;
  const gr = g.createRadialGradient(m, m, 0, m, m, m);
  gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.28, '#fff2c4'); gr.addColorStop(0.32, col); gr.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n); return c;
}

// ------------------------------------------------------------------ weather audio (on the SFX bus: follows volume / mute)
class WeatherAudio {
  constructor(sound) { this.sound = sound; this.node = null; }
  ok() {
    const e = this.sound?.engine;
    if (!e?.ctx || e.offline || e.ctx.state !== 'running' || !e.bus?.sfx) return null;
    if (!this.node) {
      const c = e.ctx, len = c.sampleRate * 3, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      let p = 0; for (let i = 0; i < len; i++) { p = 0.97 * p + 0.03 * (Math.random() * 2 - 1); d[i] = (Math.random() * 2 - 1) * 0.55 + p * 4; }
      const src = c.createBufferSource(); src.buffer = b; src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
      this.node = c.createGain(); this.node.gain.value = 0;
      src.connect(hp).connect(lp).connect(this.node).connect(e.bus.sfx.level); src.start();
    }
    return e;
  }
  update(rain, paused) { const e = this.ok(); if (e) this.node.gain.setTargetAtTime(paused ? 0 : 0.2 * rain, e.ctx.currentTime, 0.5); }
  thunder(delay, power) {
    const e = this.ok(); if (!e || this.sound.paused) return;
    const c = e.ctx, t0 = c.currentTime + delay, len = Math.floor(c.sampleRate * 3.2), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let p = 0; // brown noise with a cracking attack and a long rolling decay
    for (let i = 0; i < len; i++) { const t = i / c.sampleRate; p = 0.985 * p + 0.015 * (Math.random() * 2 - 1); d[i] = p * 9 * Math.exp(-t * 1.1) * (1 + 0.6 * Math.sin(t * 7)) + (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.5; }
    const src = c.createBufferSource(); src.buffer = b;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = c.createGain(); g.gain.value = 0.55 * power;
    src.connect(lp).connect(g).connect(e.bus.sfx.level); src.start(t0);
  }
}

// ------------------------------------------------------------------ the atmosphere
export class Atmosphere {
  /** stage: the Stage (its layers get graded); screen: a screen-space container above the world (VIEW coords);
   *  view: render.js VIEW ({ ex } = extra width each side on wide screens) */
  constructor(PIXI, stage, screen, sound, view) {
    this.PIXI = PIXI; this.stage = stage; this.view = view;
    this.lite = matchMedia('(pointer: coarse)').matches; // phones: fewer particles
    const T = (c) => PIXI.Texture.from(c);
    this.tex = {
      glow: T(radial(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [0.6, 'rgba(255,255,255,.14)'], [1, 'rgba(255,255,255,0)']])),
      rect: T(softRect(64, 14)), streak: T(vgradient(4, 64, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,1)']])),
      flake: T(radial(32, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']])),
      haze: T(vgradient(4, 256, [[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,.45)'], [0.85, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,1)']])),
      wet: T(vgradient(4, 128, [[0, 'rgba(255,255,255,.95)'], [0.25, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,.15)']])),
      refl: T(vgradient(16, 128, [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']])),
      vig: T(radial(256, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0)'], [0.85, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,1)']])),
      ray: T(rayCanvas()), ring: T(ringCanvas()), cover: T(coverCanvas()), moon: T(moonCanvas()),
      sunDusk: T(sunCanvas('#ff9a4a')), sunDawn: T(sunCanvas('rgba(255,236,214,.9)')),
    };
    this.skyTex = {}; this.decor = {};
    this.p = { ...CONDITIONS.day }; this.from = this.p; this.to = this.p; this.key = 'day'; this.t = 1; this.dur = 1;
    this.skyFrom = null; this.skyTo = null;
    this.flash = 0; this.boltT = 99; this.idle = 0; this.cycleI = 0;
    // world-space particles (behind the fighters, above the stage) and screen-space ones (over everything)
    this.back = new PIXI.Container(); stage.back.addChild(this.back);
    this.splashL = new PIXI.Container(); this.rainL = new PIXI.Container(); this.snowL = new PIXI.Container(); this.flyL = new PIXI.Container();
    this.back.addChild(this.splashL, this.rainL, this.snowL, this.flyL);
    this.vig = new PIXI.Sprite(this.tex.vig);
    this.fRain = new PIXI.Container(); this.fSnow = new PIXI.Container();
    this.flashG = new PIXI.Graphics();
    screen.addChild(this.fRain, this.fSnow, this.vig, this.flashG);
    const k = this.lite ? 0.6 : 1;
    this.drops = this.pool(this.rainL, this.tex.streak, Math.round(260 * k), { anchor: [0.5, 1], tint: 0xcfd8ea });
    this.flakes = this.pool(this.snowL, this.tex.flake, Math.round(240 * k));
    this.flies = this.pool(this.flyL, this.tex.glow, 28, { blend: 'add', tint: 0xd6ff8c });
    this.splashes = this.pool(this.splashL, this.tex.ring, Math.round(60 * k), { tint: 0xdfe6f4 });
    this.fDrops = this.pool(this.fRain, this.tex.streak, Math.round(50 * k), { anchor: [0.5, 1], tint: 0xdfe6f4 });
    this.fFlakes = this.pool(this.fSnow, this.tex.flake, Math.round(36 * k));
    this.audio = new WeatherAudio(sound);
  }
  pool(layer, tex, n, { anchor = [0.5, 0.5], tint = 0xffffff, blend } = {}) {
    return Array.from({ length: n }, () => {
      const s = new this.PIXI.Sprite(tex); s.anchor.set(...anchor); s.tint = tint; if (blend) s.blendMode = blend; s.visible = false; layer.addChild(s);
      return { s, live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, ph: 0, t: 0, land: 0 };
    });
  }

  // ------------------------------------------------------------------ conditions
  /** switch to condition `key`; frames = blend time (0 = cut) */
  set(key, frames = 120) {
    if (!CONDITIONS[key]) key = 'day';
    if (key === this.key && this.t >= 1) return;
    this.from = { ...this.p }; this.to = CONDITIONS[key]; this.key = key; this.t = frames > 0 ? 0 : 1; this.dur = Math.max(1, frames);
    this.skyFrom = frames > 0 ? this.skyTo : null; this.skyTo = this.to.sky;
    if (!frames) this.p = { ...this.to };
    this.idle = 0;
  }
  get condition() { return CONDITIONS[this.key]; }
  /** front end: walk through the cycle while no game runs */
  cycle(frames) {
    this.idle += frames;
    if (this.idle > 720) { this.cycleI = (this.cycleI + 1) % CYCLE.length; this.set(CYCLE[this.cycleI], 180); }
  }
  /** multiply tint for the fighters (lightning lifts it towards white) */
  fighterTint() { return mixC(this.p.tFighter, 0xffffff, Math.min(1, this.flash * Math.min(1, this.p.bolt + 0.2) * 0.8)); }

  // ------------------------------------------------------------------ per-stage decoration (built once per stage)
  decorFor(name) {
    const set = this.stage.sets[name]; if (!set) return null;
    if (this.decor[name]) return this.decor[name];
    const { PIXI } = this, d = { skies: {}, holders: [], lights: [], layers: [] };
    const band = (l) => (l.name === 'sky' ? 'tSky' : l.name === 'floor' ? 'tFloor' : l.factor <= 0.2 ? 'tFar' : l.factor <= 0.6 ? 'tMid' : 'tNear');
    for (const l of set.layers) for (const sp of [l.sprite, ...(l.extra || [])]) d.layers.push({ sprite: sp, band: band(l) });
    const byName = Object.fromEntries(set.layers.map((l) => [l.name, l]));
    d.sky = byName.sky?.holder;
    // extra depth holders right after the last layer matching pred, with their own parallax factor
    const insertAfter = (pred, factor) => {
      const idx = set.layers.reduce((a, l, i) => (pred(l) ? i : a), -1);
      const holder = new PIXI.Container(), at = idx < 0 ? 1 : set.root.getChildIndex(set.layers[idx].holder) + 1;
      set.root.addChildAt(holder, at); d.holders.push({ holder, factor }); return holder;
    };
    const far = (l) => l.factor <= 0.2 && l.name !== 'sky', mid = (l) => l.factor <= 0.6 && l.name !== 'sky';
    // god rays from the upper right, between the mid and the near layers (above the mid haze, inserted next)
    const rh = insertAfter(mid, 0.4);
    d.rays = [-200, 700, 1500, 2300, 3200, 4100, 5000].map((x, i) => {
      const s = new PIXI.Sprite(this.tex.ray); s.blendMode = 'add'; s.anchor.set(0.5, 0); s.rotation = 0.42;
      s.position.set(x + 600, -900); s.width = 260 + (i % 3) * 140; s.height = 2700; s.alpha = 0; rh.addChild(s); return { s, ph: i * 1.7 };
    });
    // haze banks: after the far band and after the mid band
    d.haze = [[far, 0.15, 0.85], [mid, 0.45, 0.6]].map(([pred, f, k]) => {
      const h = insertAfter(pred, f), s = new PIXI.Sprite(this.tex.haze);
      s.position.set(-900, 250); s.width = 7000; s.height = 1080; s.alpha = 0; h.addChild(s); return { s, k };
    });
    // lights: lanterns and windows in their own layers (they parallax with them), with wet-floor reflections
    for (const L of set.meta.lights || []) {
      const holder = byName[L.layer]?.holder; if (!holder) continue;
      const col = parseInt(L.color.slice(1), 16), items = [];
      const glow = (x, y, w, h, tint, k) => { const s = new PIXI.Sprite(this.tex.glow); s.blendMode = 'add'; s.tint = tint; s.anchor.set(0.5); s.position.set(x, y); s.width = w; s.height = h; items.push([s, k]); };
      if (L.kind === 'rect') {
        const s = new PIXI.Sprite(this.tex.rect); s.blendMode = 'add'; s.tint = col; s.position.set(L.x - 8, L.y - 8); s.width = L.w + 16; s.height = L.h + 16; items.push([s, 0.62]);
        glow(L.x + L.w / 2, L.y + L.h / 2, L.w * 2.2, L.h * 1.8, col, 0.28);
      } else { glow(L.x, L.y, L.r * 2, L.r * 2, col, 0.8); glow(L.x, L.y, L.r * 0.5, L.r * 0.5, 0xfff2c8, 0.9); }
      for (const [s] of items) { s.alpha = 0; holder.addChild(s); }
      let refl = null;
      if (L.layer === 'hall' || L.layer === 'lanterns' || L.layer === 'shrine') { // reflections on the wet stones below
        refl = new PIXI.Sprite(this.tex.refl); refl.blendMode = 'add'; refl.tint = col; refl.anchor.set(0.5, 0); refl.alpha = 0;
        refl.position.set(L.kind === 'rect' ? L.x + L.w / 2 : L.x, L.layer === 'lanterns' ? 1340 : L.layer === 'shrine' ? 1250 : 1215);
        refl.width = L.kind === 'rect' ? L.w * 0.8 : L.r * 0.5; refl.height = L.layer === 'lanterns' ? 320 : 200;
        holder.addChild(refl);
      }
      d.lights.push({ items, refl, a: L.a ?? 1, flicker: !!L.flicker, ph: Math.random() * 10 });
    }
    // the floor: wet sheen (reflects the sky) and a snow dusting
    const floor = byName.floor?.holder;
    if (floor) {
      d.wet = new PIXI.Sprite(this.tex.wet); d.wet.position.set(-700, 1196); d.wet.width = 6600; d.wet.height = 740; d.wet.alpha = 0;
      d.cover = new PIXI.Sprite(this.tex.cover); d.cover.position.set(-700, 1192); d.cover.width = 6600; d.cover.height = 740; d.cover.alpha = 0;
      floor.addChild(d.wet, d.cover);
    }
    // sky extras: twinkling stars, the lightning bolt and the sky flash (all above the painted skies)
    d.twinkle = [];
    if (d.sky) {
      d.twinkle = Array.from({ length: 16 }, () => {
        const s = new PIXI.Sprite(this.tex.flake); s.anchor.set(0.5); s.blendMode = 'add'; s.position.set(SX + Math.random() * SW, -1500 + Math.random() * 1500);
        s.width = s.height = 14 + Math.random() * 16; s.alpha = 0; d.sky.addChild(s); return { s, ph: Math.random() * 10, sp: 0.02 + Math.random() * 0.05 };
      });
      d.skyFlash = new PIXI.Sprite(PIXI.Texture.WHITE); d.skyFlash.position.set(SX, SY); d.skyFlash.width = SW; d.skyFlash.height = SH; d.skyFlash.tint = 0xc8d4ff; d.skyFlash.alpha = 0; d.skyFlash.blendMode = 'add';
      d.bolt = new PIXI.Graphics(); d.sky.addChild(d.skyFlash, d.bolt);
    }
    return (this.decor[name] = d);
  }
  /** the painted sky for `key` in this stage's sky layer (built on first use), or null for the stage's own sky */
  skySprite(d, key) {
    if (!key || !d.sky) return null;
    if (!d.skies[key]) {
      const { PIXI } = this;
      this.skyTex[key] ||= PIXI.Texture.from(paintSky(key));
      const c = new PIXI.Container(), s = new PIXI.Sprite(this.skyTex[key]);
      s.position.set(SX, SY); s.width = SW; s.height = SH; c.addChild(s);
      const orb = { night: [this.tex.moon, 3900, -620, 560], dusk: [this.tex.sunDusk, 3600, 760, 900], dawn: [this.tex.sunDawn, 1600, 700, 700] }[key];
      if (orb) { const o = new PIXI.Sprite(orb[0]); o.anchor.set(0.5); o.position.set(orb[1], orb[2]); o.width = o.height = orb[3]; c.addChild(o); }
      c.alpha = 0; d.sky.addChildAt(c, 1); d.skies[key] = c; // above the stage's painted sky, below the twinkles
    }
    return d.skies[key];
  }

  // ------------------------------------------------------------------ lightning
  strike(d, cam) {
    this.boltT = 0; this.flash = 1;
    this.audio.thunder(0.25 + Math.random() * 1.1, 0.7 + Math.random() * 0.3);
    if (!d?.bolt) return;
    const g = d.bolt.clear(), x0 = 2600 + (Math.random() - 0.5) * cam.w * 0.9;
    const path = (x, y, end, w) => {
      const pts = [[x, y]];
      while (y < end) { x += (Math.random() - 0.5) * 140; y += 60 + Math.random() * 90; pts.push([x, y]); }
      for (const [wd, a, col] of [[w * 7, 0.12, 0xa8b8ff], [w * 2.6, 0.45, 0xd8e0ff], [w, 1, 0xffffff]]) {
        g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p);
        g.stroke({ width: wd, color: col, alpha: a, join: 'round', cap: 'round' });
      }
      return pts;
    };
    const main = path(x0, -1400, 700 + Math.random() * 300, 9);
    for (let i = 0; i < 3; i++) { const p = main[2 + Math.floor(Math.random() * Math.max(1, main.length - 3))]; if (p) path(p[0], p[1], p[1] + 300 + Math.random() * 400, 4); }
    d.bolt.alpha = 1;
  }

  // ------------------------------------------------------------------ per frame
  /** cam: { cx, w, s }; frames: elapsed time in 60 Hz frames; o: { ink (0..1 ultimate ink-wash), paused } */
  update(cam, frames = 1, o = {}) {
    const d = this.decorFor(this.stage.cur);
    frames = Math.max(0.2, Math.min(4, frames)); // render frames at 60 Hz (fractional on faster screens)
    // blend the parameters
    if (this.t < 1) {
      this.t = Math.min(1, this.t + frames / this.dur); const k = ease(this.t), p = {};
      for (const f of COLORS) p[f] = mixC(this.from[f], this.to[f], k);
      for (const f of NUMS) p[f] = lerp(this.from[f], this.to[f], k);
      this.p = { ...this.to, ...p };
    }
    const P = this.p, ex = this.view?.ex || 0, ey = this.view?.ey || 0, run = !o.paused;
    // lightning: random strikes while the storm is in; a quick double flash
    if (run) {
      this.boltT += frames;
      if (P.bolt > 0.3 && Math.random() < (P.bolt * frames) / 330) this.strike(d, cam);
      const b = this.boltT;
      this.flash = b < 3 ? 1 : b < 7 ? 0.25 : b < 10 ? 0.75 : Math.max(0, this.flash * 0.86 ** frames);
      if (d?.bolt) d.bolt.alpha = b < 12 ? 1 : Math.max(0, d.bolt.alpha - 0.08 * frames);
    }
    this.audio.update(Math.max(P.rain, P.bolt * 0.8), !run);
    if (!d) return;
    const fl = this.flash * Math.min(1, P.bolt + 0.2);
    // grading
    for (const l of d.layers) l.sprite.tint = mixC(P[l.band], 0xdde4ff, fl * 0.55);
    for (const h of d.holders) h.holder.x = (1 - h.factor) * (cam.cx - 2600);
    // skies: the target fades in on top of the previous one
    const kk = ease(this.t), top = this.skySprite(d, this.skyTo);
    this.skySprite(d, this.skyFrom);
    if (top) { const want = d.sky.getChildIndex(d.twinkle[0].s) - 1; if (d.sky.getChildIndex(top) !== want) d.sky.setChildIndex(top, want); }
    for (const [key, c] of Object.entries(d.skies)) c.alpha = key === this.skyTo ? (this.skyFrom === key ? 1 : kk) : key === this.skyFrom ? (this.skyTo ? 1 : 1 - kk) : 0;
    for (const tw of d.twinkle) { tw.ph += tw.sp * frames; tw.s.alpha = P.stars * Math.max(0, Math.sin(tw.ph)) ** 3 * 0.9; }
    if (d.skyFlash) d.skyFlash.alpha = fl * 0.55;
    for (const h of d.haze) { h.s.tint = P.haze; h.s.alpha = P.hazeA * h.k; }
    for (const r of d.rays) { r.ph += 0.006 * frames; r.s.tint = P.rayC; r.s.alpha = P.rays * (0.1 + 0.07 * Math.sin(r.ph)); }
    for (const L of d.lights) {
      L.ph += 0.15 * frames;
      const fk = L.flicker ? 0.88 + 0.08 * Math.sin(L.ph) + 0.04 * Math.sin(L.ph * 2.7) : 1, a = P.glow * L.a * fk;
      for (const [s, k] of L.items) s.alpha = a * k;
      if (L.refl) L.refl.alpha = a * P.wet * 0.55;
    }
    if (d.wet) { d.wet.tint = mixC(0xa8b4c8, 0xffffff, fl * 0.6); d.wet.alpha = P.wet * 0.22; d.cover.alpha = P.cover * 0.72; }
    // the stage's own petals / leaves follow the wind, and thin out in rain and snow
    this.stage.look = { wind: P.wind, alpha: P.amb, tint: P.tNear };
    // world particles in the visible area (wide screens see more than the 16:9 frame)
    const k = 1 + (2 * ex) / 1920, left = cam.cx - (cam.w * k) / 2 - 200, width = cam.w * k + 400, skyTop = 1300 - 940 / cam.s - 200;
    // rain: depth z decides speed, length, brightness and where on the floor it lands
    this.particles(this.drops, P.rain, run, (q, init) => {
      q.z = Math.random(); q.x = left + Math.random() * width - P.wind * 300; q.y = init ? skyTop + Math.random() * (1500 - skyTop) : skyTop - Math.random() * 300;
      q.vy = 34 + q.z * 26; q.vx = P.wind * (10 + q.z * 8); q.land = 1215 + q.z * 520;
    }, (q) => {
      q.x += q.vx * frames; q.y += q.vy * frames;
      if (q.y > q.land) { this.splash(q.x, q.land, q.z); return false; }
      q.s.position.set(q.x, q.y); q.s.rotation = -Math.atan2(q.vx, q.vy); q.s.scale.set((2.4 + q.z * 3) / 4, (70 + q.z * 120) / 64); q.s.alpha = (0.16 + q.z * 0.32) * Math.min(1, P.rain * 1.6);
      return true;
    });
    for (const q of this.splashes) {
      if (!q.live || !run) continue;
      q.t += frames; const a = q.t / 14;
      if (a >= 1) { q.live = false; q.s.visible = false; continue; }
      q.s.position.set(q.x, q.y); q.s.scale.set((0.4 + a * 0.9) * (0.6 + q.z)); q.s.alpha = (1 - a) * 0.5 * P.rain;
    }
    // snow
    this.particles(this.flakes, P.snow, run, (q, init) => {
      q.z = Math.random(); q.x = left + Math.random() * width - P.wind * 400; q.y = init ? skyTop + Math.random() * (1500 - skyTop) : skyTop - Math.random() * 200;
      q.vy = 1.6 + q.z * 2.6; q.ph = Math.random() * 6; q.land = 1220 + q.z * 520;
    }, (q) => {
      q.ph += 0.03 * frames; q.x += (P.wind * 4 + Math.sin(q.ph) * 1.6) * frames; q.y += q.vy * frames;
      if (q.y > q.land) return false;
      q.s.position.set(q.x, q.y); q.s.scale.set((12 + q.z * 24) / 32); q.s.alpha = (0.6 + q.z * 0.4) * Math.min(1, P.snow * 1.5) * Math.min(1, (q.land - q.y) / 40);
      return true;
    });
    // fireflies: drift low over the ground, blinking (more of them in the forest)
    this.particles(this.flies, P.flies * (this.stage.cur === 'forest' ? 1 : 0.6), run, (q) => {
      q.x = left + Math.random() * width; q.y = 760 + Math.random() * 520; q.ph = Math.random() * 6; q.vx = (Math.random() - 0.5) * 1.2; q.vy = (Math.random() - 0.5) * 0.6; q.t = 0;
    }, (q) => {
      q.t += frames; q.ph += 0.05 * frames; q.vx += (Math.random() - 0.5) * 0.12; q.vy += (Math.random() - 0.5) * 0.08; q.vx *= 0.98; q.vy *= 0.98;
      q.x += q.vx * frames; q.y += q.vy * frames;
      if (q.t > 900 || q.x < left - 300 || q.x > left + width + 300) return false;
      q.s.position.set(q.x, q.y); q.s.scale.set(0.28); q.s.alpha = P.flies * (0.25 + 0.75 * Math.max(0, Math.sin(q.ph)) ** 2) * Math.min(1, q.t / 60);
      return true;
    });
    // screen space: a few big close streaks / flakes over the fighters (faded out under the ink-wash cinematic)
    const clear = 1 - (o.ink || 0), SL = -ex - 60, SWd = 1920 + 2 * ex + 120;
    this.particles(this.fDrops, P.rain * clear, run, (q, init) => {
      q.z = Math.random(); q.x = SL + Math.random() * SWd; q.y = init ? -ey + Math.random() * (1080 + 2 * ey) : -ey - Math.random() * 400; q.vy = 46 + q.z * 22; q.vx = P.wind * 18;
    }, (q) => {
      q.x += q.vx * frames; q.y += q.vy * frames;
      if (q.y > 1300 + ey) return false;
      q.s.position.set(q.x, q.y); q.s.rotation = -Math.atan2(q.vx, q.vy); q.s.scale.set((2 + q.z * 2) / 4, (150 + q.z * 160) / 64); q.s.alpha = (0.07 + q.z * 0.1) * Math.min(1, P.rain * 1.4);
      return true;
    });
    this.particles(this.fFlakes, P.snow * clear, run, (q, init) => {
      q.z = Math.random(); q.x = SL + Math.random() * SWd; q.y = init ? -ey + Math.random() * (1080 + 2 * ey) : -ey - 40; q.vy = 2.4 + q.z * 2.4; q.ph = Math.random() * 6;
    }, (q) => {
      q.ph += 0.025 * frames; q.x += (P.wind * 6 + Math.sin(q.ph) * 2.2) * frames; q.y += q.vy * frames;
      if (q.y > 1120 + ey) return false;
      q.s.position.set(q.x, q.y); q.s.scale.set((18 + q.z * 22) / 32); q.s.alpha = (0.35 + q.z * 0.3) * Math.min(1, P.snow * 1.5);
      return true;
    });
    // vignette + lightning flash over the whole view
    this.vig.position.set(-ex, -ey); this.vig.width = 1920 + 2 * ex; this.vig.height = 1080 + 2 * ey; this.vig.alpha = P.vig * clear;
    this.flashG.clear(); if (fl > 0.02) this.flashG.rect(-ex, -ey, 1920 + 2 * ex, 1080 + 2 * ey).fill({ color: 0xdfe6ff, alpha: fl * 0.2 * clear });
  }
  /** keep round(amount * pool) particles alive: spawn(q, initial) places a new one, step(q) moves it (false = respawn) */
  particles(pool, amount, run, spawn, step) {
    const want = Math.round(Math.max(0, Math.min(1, amount)) * pool.length);
    for (let i = 0; i < pool.length; i++) {
      const q = pool[i];
      if (i >= want) { if (q.live) { q.live = false; q.s.visible = false; } continue; }
      if (!q.live) { spawn(q, true); q.live = true; q.s.visible = true; }
      if (run && !step(q)) spawn(q, false);
    }
  }
  splash(x, y, z) {
    if (z < 0.25) return;
    const q = this.splashes.find((p) => !p.live); if (!q) return;
    q.live = true; q.s.visible = true; q.x = x; q.y = y; q.z = z; q.t = 0; q.s.alpha = 0;
  }
}
