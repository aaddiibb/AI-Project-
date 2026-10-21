// Combat effects (world space): hit sparks (ink-burst style), block sparks, blade trails, kunai projectiles, dust, popups, shake,
// the Samurai's slash-waves, projectile clashes and the ultimate cinematic's cuts / X / petals.
import { mul, T, R } from '../../art/shinobi/rig_runtime.js';

const GROUND = 1300;
const ease = (t) => 1 - (1 - t) * (1 - t);
// flame palettes for the flaming kunai / fan glow / embers: [outer, mid, core]
const FLAME = { fire: [0xd6263a, 0xff7a1a, 0xffe27a], shadow: [0x3b1f8a, 0x8f6cff, 0xeee6ff] };

export class Fx {
  constructor(PIXI, layer, kunaiTex, kunaiPart, uiLayer) {
    this.PIXI = PIXI; this.layer = layer; this.ui = uiLayer;
    this.g = new PIXI.Graphics(); layer.addChild(this.g);
    this.debug = new PIXI.Graphics(); layer.addChild(this.debug);
    this.kunaiTex = kunaiTex; this.kunaiPart = kunaiPart;
    this.kunaiSprites = new Map();
    this.fanSprites = []; this.fanUsed = 0; this.glows = []; // kunai fanned between the fingers during the ultimate
    this.parts = []; this.texts = [];
    this.shake = 0; this.flash = 0; this.slow = 0;
    this.white = 0; // full-screen white flash (drawn by main.js in screen space)
  }

  // ---------------------------------------------------------------- spawning
  hit(e) {
    const p = e.power || 1, size = 150 + p * 60 + (e.counter ? 60 : 0);
    this.parts.push({ kind: 'burst', x: e.x, y: GROUND - e.h, dir: e.dir, size, life: 16, t: 0, spikes: 9 + Math.floor(Math.random() * 5), rot: Math.random() * 6, counter: e.counter, big: p >= 3 || e.ko });
    for (let i = 0; i < 6 + p * 3; i++) {
      const a = (e.dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.4;
      const v = 8 + Math.random() * 18 + p * 3;
      this.parts.push({ kind: 'drop', x: e.x, y: GROUND - e.h, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, r: 6 + Math.random() * 9, life: 22 + Math.random() * 12, t: 0 });
    }
    this.shake = Math.max(this.shake, 6 + p * 5 + (e.ko ? 14 : 0));
    this.flash = Math.max(this.flash, e.ko ? 0.55 : p >= 3 ? 0.28 : 0);
    if (e.counter) this.popup('COUNTER', e.x, GROUND - e.h - 220, '#ff3d4a', 54);
    if (e.dmg) this.popup(String(e.dmg), e.x + e.dir * 40, GROUND - e.h - 90, '#ffffff', 40, true);
  }
  block(e) {
    const p = e.power || 1;
    this.parts.push({ kind: 'ring', x: e.x, y: GROUND - e.h, size: 110 + p * 40, life: 12, t: 0 });
    for (let i = 0; i < 7 + p * 2; i++) {
      const a = (e.dir > 0 ? Math.PI : 0) + (Math.random() - 0.5) * 2.2;
      this.parts.push({ kind: 'spark', x: e.x, y: GROUND - e.h, a, len: 40 + Math.random() * 60, v: 10 + Math.random() * 16, life: 12 + Math.random() * 6, t: 0 });
    }
    this.shake = Math.max(this.shake, 3 + p * 2);
  }
  /** projectile parry: bright steel ring + white flash + sparks thrown back toward the thrower */
  parry(e) {
    const y = GROUND - e.h;
    this.parts.push({ kind: 'ring', x: e.x, y, size: 260, life: 16, t: 0 });
    this.parts.push({ kind: 'ring', x: e.x, y, size: 140, life: 10, t: 0 });
    for (let i = 0; i < 16; i++) {
      const a = (e.dir > 0 ? Math.PI : 0) + (Math.random() - 0.5) * 2.6;
      this.parts.push({ kind: 'spark', x: e.x, y, a, len: 60 + Math.random() * 80, v: 14 + Math.random() * 20, life: 14 + Math.random() * 8, t: 0 });
    }
    this.shake = Math.max(this.shake, 9); this.flash = Math.max(this.flash, 0.22);
  }
  /** projectile clash: small = steel spark; big (ultimate vs ultimate) = blade-lock flash */
  clash(e) {
    const y = GROUND - e.h;
    if (!e.big) {
      this.parts.push({ kind: 'ring', x: e.x, y, size: e.ult ? 200 : 120, life: 12, t: 0 });
      for (let i = 0; i < (e.ult ? 12 : 7); i++) { const a = Math.random() * Math.PI * 2; this.parts.push({ kind: 'spark', x: e.x, y, a, len: 40 + Math.random() * 70, v: 10 + Math.random() * 18, life: 12 + Math.random() * 8, t: 0 }); }
      this.shake = Math.max(this.shake, e.ult ? 8 : 4);
      return;
    }
    this.parts.push({ kind: 'ring', x: e.x, y, size: 900, life: 26, t: 0 });
    this.parts.push({ kind: 'ring', x: e.x, y, size: 480, life: 18, t: 0, fire: true });
    this.parts.push({ kind: 'lock', x: e.x, y, life: 30, t: 0 });
    for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2; this.parts.push({ kind: 'spark', x: e.x, y, a, len: 80 + Math.random() * 160, v: 16 + Math.random() * 30, life: 18 + Math.random() * 14, t: 0 }); }
    this.shake = Math.max(this.shake, 24); this.white = Math.max(this.white, 0.75);
    this.popup('CLASH!', e.x, y - 330, '#fff4c8', 96);
  }
  /** a slash-wave leaving the blade */
  waveBurst(e) {
    const y = GROUND - e.h;
    for (let i = 0; i < 14; i++) this.parts.push({ kind: 'ember', x: e.x, y: y + (Math.random() - 0.5) * 200, vx: e.dir * (4 + Math.random() * 10), vy: -2 - Math.random() * 4, r: 7 + Math.random() * 9, life: 20 + Math.random() * 12, t: 0 });
    if (e.h < 400 || e.shape === 'tall') this.dust(e.x, e.shape === 'tall' ? 16 : 10, -e.dir, 1.6);
    this.shake = Math.max(this.shake, e.shape === 'tall' ? 16 : 10);
  }
  // ---- ultimate cinematic (ink-wash): only red survives the ink, so the cuts are white light with a crimson core
  cineCut(x, y, ang) {
    this.parts.push({ kind: 'cut', x, y, ang: (ang * Math.PI) / 180, life: 16, t: 0 });
    for (let i = 0; i < 9; i++) { const a = (ang * Math.PI) / 180 + (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.8, v = 10 + Math.random() * 22; this.parts.push({ kind: 'drop', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, r: 7 + Math.random() * 11, life: 26 + Math.random() * 14, t: 0 }); }
    this.parts.push({ kind: 'blot', x: x + (Math.random() - 0.5) * 120, y: y + (Math.random() - 0.5) * 160, r: 50 + Math.random() * 60, life: 70, t: 0, rot: Math.random() * 6 });
    this.shake = Math.max(this.shake, 7);
  }
  cineX(x, y, i) { this.parts.push({ kind: 'xcut', x, y, i, life: 64, t: 0 }); this.shake = Math.max(this.shake, i ? 30 : 18); this.white = Math.max(this.white, i ? 0.85 : 0.5); }
  streak(x0, x1, y) { this.parts.push({ kind: 'streak', x0, x1, y, life: 12, t: 0 }); }
  petals(x, n = 34) {
    for (let i = 0; i < n; i++) this.parts.push({ kind: 'petal', x: x + (Math.random() - 0.5) * 2200, y: GROUND - 1500 - Math.random() * 500, vx: -1 + Math.random() * 3, vy: 2 + Math.random() * 2.5, r: 12 + Math.random() * 10, life: 150 + Math.random() * 90, t: 0, ph: Math.random() * 6 });
  }
  /** samurai repel: a crimson-white shockwave from the blade */
  repel(e) {
    const y = GROUND - e.h;
    this.parts.push({ kind: 'ring', x: e.x, y, size: 760, life: 22, t: 0 });
    this.parts.push({ kind: 'ring', x: e.x, y, size: 420, life: 16, t: 0, fire: true });
    for (let i = 0; i < 20; i++) { const a = (e.dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.2; this.parts.push({ kind: 'spark', x: e.x, y, a, len: 80 + Math.random() * 120, v: 18 + Math.random() * 24, life: 16 + Math.random() * 8, t: 0 }); }
    this.dust(e.x, 14, -e.dir, 1.8);
    this.popup('REPEL', e.x, y - 360, '#ffd7c8', 60);
    this.shake = Math.max(this.shake, 14);
  }
  /** guard break: the guard shatters (glass shards) */
  guardBreak(e) {
    const y = GROUND - e.h;
    for (let i = 0; i < 22; i++) { const a = Math.random() * Math.PI * 2, v = 10 + Math.random() * 22; this.parts.push({ kind: 'drop', x: e.x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: 6 + Math.random() * 8, life: 30 + Math.random() * 12, t: 0, shard: true }); }
    this.parts.push({ kind: 'ring', x: e.x, y, size: 520, life: 20, t: 0 });
    this.popup('GUARD BREAK!', e.x, y - 330, '#ff6a5a', 66);
    this.shake = Math.max(this.shake, 20); this.white = Math.max(this.white, 0.35);
  }
  /** kawarimi: smoke where she was, a log falling out of it; smoke where she reappears */
  kawarimi(e) {
    this.smoke(e.from, 18, 1.3); this.smoke(e.to, 14, 1);
    this.parts.push({ kind: 'log', x: e.from, y: GROUND - 520, vx: -e.dir * 2, vy: -6, rot: 0.15, vr: e.dir * 0.05, life: 54, t: 0 });
    this.popup('KAWARIMI!', e.from, GROUND - 1200, '#dfe9c8', 58);
    this.shake = Math.max(this.shake, 8);
  }
  smoke(x, n = 10, power = 1) {
    for (let i = 0; i < n; i++) this.parts.push({ kind: 'smoke', x: x + (Math.random() - 0.5) * 220 * power, y: GROUND - 120 - Math.random() * 900, vx: (Math.random() - 0.5) * 6, vy: -1 - Math.random() * 2, r: 60 + Math.random() * 70 * power, life: 30 + Math.random() * 18, t: 0 });
  }
  dust(x, n = 6, dir = 0, power = 1) {
    for (let i = 0; i < n; i++) this.parts.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 120, y: GROUND - 6, vx: -dir * (2 + Math.random() * 6) + (Math.random() - 0.5) * 6 * power, vy: -(1 + Math.random() * 3) * power, r: 20 + Math.random() * 30 * power, life: 20 + Math.random() * 14, t: 0 });
  }
  /** ultimate activation: flame burst + rings at the caster's hands (the screen dim is driven by sim.superFreeze) */
  superFlash(points) {
    for (const [x, y] of points) {
      this.parts.push({ kind: 'ring', x, y, size: 420, life: 22, t: 0, fire: true });
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 16;
        this.parts.push({ kind: 'ember', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, r: 8 + Math.random() * 10, life: 26 + Math.random() * 16, t: 0 });
      }
    }
    this.shake = Math.max(this.shake, 10);
  }
  /** draw a fan of kunai held in a hand this frame: x, y = grip (world), dir = facing, open 0..1 = spread, heat 0..1 = glow */
  fan(x, y, dir, open = 1, heat = 0.5, flame = 'fire') {
    const n = 4, part = this.kunaiPart;
    for (let i = 0; i < n; i++) {
      let s = this.fanSprites[this.fanUsed];
      if (!s) { s = new this.PIXI.Sprite(this.kunaiTex); this.layer.addChild(s); this.fanSprites.push(s); }
      this.fanUsed++;
      const ang = dir > 0 ? -55 + (i - (n - 1) / 2) * 22 * open : -125 - (i - (n - 1) / 2) * 22 * open;
      const m = mul(mul(mul(mul(T(x, y), R(ang - part.grip.axisDeg)), [1.35, 0, 0, 1.35, 0, 0]), T(-part.grip.x, -part.grip.y)), T(part.offset.x, part.offset.y));
      const kx = part.size.w / s.texture.width, ky = part.size.h / s.texture.height;
      s.visible = true; s.tint = flame === 'fire' ? 0xffe0b0 : 0xe2d6ff;
      s.setFromMatrix(new this.PIXI.Matrix(m[0] * kx, m[1] * kx, m[2] * ky, m[3] * ky, m[4], m[5]));
    }
    // heat glow behind the blades: hot core + flame halo along the fan
    this.glows.push({ x: x + (dir > 0 ? 54 : -54), y: y - 66, heat, flame }); // drawn in tick() (after the layer is cleared)
    if (Math.random() < 0.5) this.parts.push({ kind: 'ember', x: x + (Math.random() - 0.5) * 80, y: y + (Math.random() - 0.5) * 60, vx: (Math.random() - 0.5) * 3, vy: -3 - Math.random() * 4, r: 6 + Math.random() * 7, life: 18 + Math.random() * 10, t: 0, flame });
  }
  arc(points) { this.parts.push({ kind: 'arc', ...points, life: 14, max: 14, t: 0 }); }
  popup(text, x, y, color, size, small = false) {
    const t = new this.PIXI.Text({ text, style: { fontFamily: 'Georgia, "Yu Mincho", serif', fontWeight: '900', fontSize: size, fill: color, stroke: { color: '#1b1a22', width: Math.round(size / 6) }, letterSpacing: 2 } });
    t.anchor.set(0.5); t.position.set(x, y); this.layer.addChild(t);
    this.texts.push({ t, vy: small ? -2.4 : -1.2, life: small ? 40 : 52, max: small ? 40 : 52, x, y, pop: small ? 1 : 1.4 });
  }

  // ---------------------------------------------------------------- per-frame
  tick(frames, sim, debug) {
    const g = this.g; g.clear();
    for (let i = this.fanUsed; i < this.fanSprites.length; i++) this.fanSprites[i].visible = false;
    this.fanUsed = 0;
    for (const { x, y, heat, flame } of this.glows) {
      const F = FLAME[flame || 'fire'];
      g.circle(x, y, 150 + 40 * heat).fill({ color: flame === 'shadow' ? F[0] : 0xff5a1a, alpha: 0.14 + 0.18 * heat });
      g.circle(x, y, 90 + 30 * heat).fill({ color: flame === 'shadow' ? F[1] : 0xff9a2a, alpha: 0.22 + 0.25 * heat });
      g.circle(x, y + 30, 36).fill({ color: F[2], alpha: 0.45 + 0.3 * heat });
    }
    this.glows = [];
    for (const p of this.parts) p.t += frames;
    this.parts = this.parts.filter((p) => p.t < (p.life || 10));
    for (const p of this.parts) {
      const k = p.t / p.life;
      switch (p.kind) {
        case 'burst': {
          const r0 = p.size * (0.35 + 0.65 * ease(Math.min(1, k * 2))), a = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
          const pts = [];
          for (let i = 0; i < p.spikes * 2; i++) {
            const ang = p.rot + (i / (p.spikes * 2)) * Math.PI * 2;
            const rr = i % 2 === 0 ? r0 * (0.8 + 0.4 * ((i * 7) % 5) / 4) : r0 * 0.34;
            pts.push(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr * 0.9);
          }
          g.poly(pts).fill({ color: p.counter ? 0xffe2a0 : 0xffffff, alpha: a }).stroke({ width: 9, color: p.counter ? 0xff3d4a : 0xd6263a, alpha: a, join: 'round' });
          g.circle(p.x, p.y, r0 * 0.28).fill({ color: p.big ? 0xff4a5a : 0xffe46b, alpha: a });
          break;
        }
        case 'drop': {
          p.x += p.vx * frames; p.y += p.vy * frames; p.vy += 1.2 * frames; p.vx *= 0.96;
          if (p.shard) { const r = p.r * (1 - k * 0.5); g.poly([p.x, p.y - r * 1.6, p.x + r, p.y, p.x, p.y + r, p.x - r * 0.8, p.y - r * 0.2]).fill({ color: 0xcfe9ff, alpha: 1 - k }).stroke({ width: 2, color: 0x4f8fd6, alpha: 1 - k }); break; }
          g.circle(p.x, p.y, p.r * (1 - k * 0.6)).fill({ color: 0xc81e32, alpha: 1 - k * 0.8 });
          break;
        }
        case 'ember': {
          p.x += p.vx * frames; p.y += p.vy * frames; p.vy -= 0.15 * frames; p.vx *= 0.95;
          const F = FLAME[p.flame || 'fire'];
          g.circle(p.x, p.y, p.r * (1 - k * 0.7)).fill({ color: k < 0.4 ? F[2] : p.flame === 'shadow' ? F[1] : 0xff6a1a, alpha: 1 - k });
          break;
        }
        case 'ring': {
          const r = p.size * (0.3 + 0.7 * ease(k));
          if (p.fire) { g.circle(p.x, p.y, r).stroke({ width: 22 * (1 - k) + 2, color: 0xff7a1a, alpha: 1 - k }); g.circle(p.x, p.y, r * 0.5).fill({ color: 0xffe27a, alpha: 0.6 * (1 - k) }); break; }
          g.circle(p.x, p.y, r).stroke({ width: 10 * (1 - k) + 2, color: 0xcfe9ff, alpha: 1 - k });
          g.circle(p.x, p.y, r * 0.55).fill({ color: 0xffffff, alpha: 0.7 * (1 - k * k) });
          break;
        }
        case 'spark': {
          const d = p.v * p.t, x0 = p.x + Math.cos(p.a) * d, y0 = p.y + Math.sin(p.a) * d * 0.9;
          g.moveTo(x0, y0).lineTo(x0 + Math.cos(p.a) * p.len * (1 - k), y0 + Math.sin(p.a) * p.len * (1 - k) * 0.9).stroke({ width: 7 * (1 - k) + 2, color: 0xffe08a, alpha: 1 - k, cap: 'round' });
          break;
        }
        case 'dust': {
          p.x += p.vx * frames; p.y += p.vy * frames; p.vx *= 0.93; p.vy *= 0.95;
          g.circle(p.x, p.y, p.r * (0.6 + k)).fill({ color: 0xf1e7d0, alpha: 0.55 * (1 - k) });
          break;
        }
        case 'lock': { // blade-lock: crossed white blades of light
          const a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8, L = 700 * (0.6 + 0.4 * ease(Math.min(1, k * 3)));
          for (const s of [1, -1]) g.moveTo(p.x - L, p.y - s * L * 0.45).lineTo(p.x + L, p.y + s * L * 0.45).stroke({ width: 22 * a + 2, color: 0xffffff, alpha: a, cap: 'round' });
          g.circle(p.x, p.y, 150 * a).fill({ color: 0xfff1c0, alpha: 0.8 * a });
          break;
        }
        case 'cut': { // a cut across the whole screen: flares white, leaves a crimson hairline
          const L = 2600, c = Math.cos(p.ang), s = Math.sin(p.ang), grow = Math.min(1, k * 5), a = 1 - k;
          const x0 = p.x - c * L * grow, y0 = p.y - s * L * grow, x1 = p.x + c * L * grow, y1 = p.y + s * L * grow;
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 34 * (1 - k) + 3, color: 0xffffff, alpha: a, cap: 'round' });
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 7, color: 0xd6263a, alpha: Math.min(1, a * 1.4), cap: 'round' });
          break;
        }
        case 'blot': { // red ink soaking into the paper
          const r = p.r * (0.5 + 0.5 * ease(Math.min(1, k * 4))), a = k < 0.7 ? 0.75 : 0.75 * (1 - (k - 0.7) / 0.3);
          const pts = [];
          for (let i = 0; i < 14; i++) { const an = p.rot + (i / 14) * Math.PI * 2, rr = r * (0.7 + 0.3 * Math.sin(i * 2.7 + p.rot)); pts.push(p.x + Math.cos(an) * rr, p.y + Math.sin(an) * rr); }
          g.poly(pts).fill({ color: 0xb3142a, alpha: a });
          break;
        }
        case 'xcut': { // the finishing X: two huge crimson brush strokes, the second one 4 frames later
          const a = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25, grow = ease(Math.min(1, p.t / 5)), s = p.i ? -1 : 1, L = 1500;
          const x0 = p.x - L, y0 = p.y - s * L * 0.62, x1 = p.x - L + 2 * L * grow, y1 = y0 + s * 2 * L * 0.62 * grow;
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 120, color: 0x3a0610, alpha: 0.55 * a, cap: 'round' });
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 82, color: 0xc8142c, alpha: a, cap: 'round' });
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 18, color: 0xffd9c8, alpha: a * (1 - k), cap: 'round' });
          break;
        }
        case 'streak': { // the blink: a thin horizontal flash where he crossed the screen
          const a = 1 - k;
          g.moveTo(p.x0, p.y).lineTo(p.x1, p.y).stroke({ width: 26 * a + 2, color: 0x16121a, alpha: 0.8 * a, cap: 'round' });
          g.moveTo(p.x0, p.y).lineTo(p.x1, p.y).stroke({ width: 6, color: 0xd6263a, alpha: a, cap: 'round' });
          break;
        }
        case 'smoke': {
          p.x += p.vx * frames; p.y += p.vy * frames; p.vx *= 0.95;
          g.circle(p.x, p.y, p.r * (0.6 + 0.8 * ease(k))).fill({ color: k < 0.3 ? 0xf4f2ec : 0xcfcac0, alpha: 0.75 * (1 - k) });
          break;
        }
        case 'log': { // the substitution log: bark cylinder with a rope band, tumbling to the floor
          p.vy += 1.1 * frames; p.x += p.vx * frames; p.y = Math.min(GROUND - 70, p.y + p.vy * frames); p.rot += p.vr * frames;
          const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3, c = Math.cos(p.rot), s = Math.sin(p.rot), W = 60, H = 220;
          const pt = (u, v) => [p.x + u * c - v * s, p.y + u * s + v * c];
          const quad = (u0, v0, u1, v1) => [...pt(u0, v0), ...pt(u1, v0), ...pt(u1, v1), ...pt(u0, v1)];
          g.poly(quad(-W, -H, W, H)).fill({ color: 0x7a4a26, alpha: a }).stroke({ width: 7, color: 0x2a160a, alpha: a, join: 'round' });
          for (const u of [-30, 2, 30]) g.moveTo(...pt(u, -H + 20)).lineTo(...pt(u + 6, H - 20)).stroke({ width: 4, color: 0x4a2a12, alpha: a });
          g.poly(quad(-W - 4, -40, W + 4, -14)).fill({ color: 0xd8c08a, alpha: a });
          g.ellipse(...pt(0, -H), W, 18).fill({ color: 0xc89a62, alpha: a }).stroke({ width: 5, color: 0x2a160a, alpha: a });
          break;
        }
        case 'petal': {
          p.x += (p.vx + Math.sin(p.t * 0.05 + p.ph) * 1.6) * frames; p.y += p.vy * frames;
          g.ellipse(p.x, p.y, p.r, p.r * 0.55).fill({ color: 0xf2a7b8, alpha: Math.min(1, (1 - k) * 3) * 0.9 });
          break;
        }
        case 'scar': { // glowing ground scar behind a wave
          const a = 1 - k;
          g.ellipse(p.x, GROUND - 4, p.w * (1 - 0.4 * k), 14).fill({ color: 0xff3d4a, alpha: 0.35 * a });
          break;
        }
        case 'arc': {
          const a = 1 - k;
          const pts = [...p.outer, ...p.inner.slice().reverse()].flat();
          if (pts.length >= 6) {
            g.poly(pts).fill({ color: 0xffffff, alpha: 0.82 * a }).stroke({ width: 6, color: 0xd6464e, alpha: a, join: 'round' });
          }
          break;
        }
      }
    }
    for (const t of this.texts) {
      t.life -= frames; t.t.y += t.vy * frames;
      const k = 1 - t.life / t.max;
      t.t.alpha = Math.min(1, t.life / 14);
      t.t.scale.set(1 + (t.pop - 1) * Math.max(0, 1 - k * 5) + 0.0);
    }
    for (const t of this.texts.filter((q) => q.life <= 0)) { t.t.destroy(); }
    this.texts = this.texts.filter((q) => q.life > 0);
    this.drawProjectiles(sim);
    this.drawDebug(sim, debug);
    this.shake *= Math.pow(0.82, frames);
    if (this.shake < 0.3) this.shake = 0;
    this.flash *= Math.pow(0.8, frames);
    this.white *= Math.pow(0.8, frames); if (this.white < 0.02) this.white = 0;
  }

  /** the Samurai's Crimson Crescent: a moon-shaped blade wave hugging the ground (drawn to its sim box, y 0..hgt) */
  drawCrescent(p) {
    const g = this.g, s = p.spec, d = p.dir, X = p.x, mid = GROUND - p.h, top = mid - s.hgt / 2 - 40, bot = GROUND + 6;
    const w = s.w * 1.8, age = s.life - p.life, pulse = 0.85 + 0.15 * Math.sin(age * 0.9);
    const shape = (k, inner, ox) => {
      const pts = [];
      for (let i = 0; i <= 18; i++) { const t = i / 18, y = top + (bot - top) * t; pts.push(X + d * (ox - w * 0.25 + Math.sin(Math.PI * t) * w * k), y); }
      for (let i = 18; i >= 0; i--) { const t = i / 18, y = top + (bot - top) * t; pts.push(X + d * (ox - w * 0.25 + Math.sin(Math.PI * t) * w * inner), y); }
      return pts;
    };
    for (let k = 3; k >= 1; k--) g.poly(shape(0.7, 0.2, -k * 60)).fill({ color: 0xc8243a, alpha: 0.12 * (4 - k) * pulse }); // after-images
    g.ellipse(X, GROUND - 4, w * 0.9, 26).fill({ color: 0xff3d4a, alpha: 0.25 });
    g.poly(shape(0.85, 0.3, 0)).fill({ color: 0x8e1626, alpha: 0.55 });
    g.poly(shape(0.75, 0.32, 0)).fill({ color: 0xd6263a, alpha: 0.9 }).stroke({ width: 6, color: 0xffd7c8, alpha: 0.9, join: 'round' });
    g.poly(shape(0.62, 0.42, 6)).fill({ color: 0xfff1e6, alpha: 0.85 * pulse });
    if (Math.random() < 0.6) this.parts.push({ kind: 'ember', x: X - d * (40 + Math.random() * 120), y: top + Math.random() * (bot - top), vx: -d * (2 + Math.random() * 4), vy: -1 - Math.random() * 3, r: 6 + Math.random() * 8, life: 16 + Math.random() * 10, t: 0 });
  }

  /** the Samurai's slash-waves: crimson crescents (high arc / low ground wave / tall curtain) with an ink-brush trail */
  drawWave(p) {
    const g = this.g, s = p.spec, d = p.dir, X = p.x, age = s.life - p.life;
    const y0 = p.h - s.hgt / 2, top = GROUND - (p.h + s.hgt / 2) - 30, bot = GROUND - y0 + (y0 <= 1 ? 6 : 30);
    const tall = s.shape === 'tall', w = s.w * (tall ? 2.8 : 2.5), pulse = 0.85 + 0.15 * Math.sin(age * 0.9);
    const grow = Math.min(1, age / 5); // unfurls out of the swing
    const shape = (k, inner, ox) => {
      const pts = [];
      for (let i = 0; i <= 20; i++) { const t = i / 20, y = top + (bot - top) * t; pts.push(X + d * (ox - w * 0.25 + Math.sin(Math.PI * t) * w * k * grow), y); }
      for (let i = 20; i >= 0; i--) { const t = i / 20, y = top + (bot - top) * t; pts.push(X + d * (ox - w * 0.25 + Math.sin(Math.PI * t) * w * inner * grow), y); }
      return pts;
    };
    // ink-brush trail: ragged crimson-to-black strokes streaming behind the wave
    g.ellipse(X - d * w * 0.15, (top + bot) / 2, w * 1.1, (bot - top) * 0.62).fill({ color: 0xff3d4a, alpha: 0.16 * pulse }); // halo
    const n = tall ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, y = top + (bot - top) * (0.1 + 0.8 * t), len = (tall ? 700 : 560) * Math.sin(Math.PI * (0.15 + 0.7 * t)) * Math.min(1, age / 10) * (0.8 + 0.2 * Math.sin(age * 0.7 + i));
      g.moveTo(X - d * w * 0.1, y).lineTo(X - d * (w * 0.1 + len), y + Math.sin(i * 1.7) * 10).stroke({ width: (bot - top) / n * 0.9, color: i % 2 ? 0x5a0a16 : 0x9e1428, alpha: 0.35, cap: 'round' });
    }
    for (let k = 3; k >= 1; k--) g.poly(shape(0.7, 0.2, -k * 60)).fill({ color: 0xc8243a, alpha: 0.12 * (4 - k) * pulse });
    g.poly(shape(0.85, 0.3, 0)).fill({ color: 0x8e1626, alpha: 0.6 });
    g.poly(shape(0.75, 0.32, 0)).fill({ color: 0xd6263a, alpha: 0.92 }).stroke({ width: 6, color: 0xffd7c8, alpha: 0.9, join: 'round' });
    g.poly(shape(0.62, 0.44, 8)).fill({ color: 0xfff1e6, alpha: 0.9 * pulse });
    if (y0 <= 1 && age % 2 === 0) this.parts.push({ kind: 'scar', x: X, w: w * 0.9, life: 26, t: 0 });
    if (Math.random() < 0.7) this.parts.push({ kind: 'ember', x: X - d * (40 + Math.random() * 160), y: top + Math.random() * (bot - top), vx: -d * (2 + Math.random() * 4), vy: -1 - Math.random() * 3, r: 6 + Math.random() * 8, life: 16 + Math.random() * 10, t: 0 });
    if (Math.random() < 0.25) this.parts.push({ kind: 'petal', x: X - d * Math.random() * 200, y: top + Math.random() * (bot - top), vx: -d * 3, vy: 1, r: 9, life: 40, t: 0, ph: Math.random() * 6 });
  }

  drawProjectiles(sim) {
    const { PIXI } = this, part = this.kunaiPart, live = new Set();
    for (const p of sim.projectiles) {
      if (p.spec.kind === 'crescent') { this.drawCrescent(p); continue; }
      if (p.spec.kind === 'wave') { this.drawWave(p); continue; }
      if (p.spec.kind === 'clone') continue; // the clones' kick / slash carriers: drawn as the clones themselves (ultfx.js)
      if (!this.kunaiTex) continue;
      live.add(p.id);
      let s = this.kunaiSprites.get(p.id);
      if (!s) { s = new PIXI.Sprite(this.kunaiTex); this.layer.addChild(s); this.kunaiSprites.set(p.id, s); }
      const X = p.x, Y = GROUND - p.h, vy = p.vy || 0;
      const ang = (Math.atan2(-vy, Math.abs(p.vx)) * 180) / Math.PI; // flight direction (mirrored by p.dir)
      const m = mul(mul(mul(mul([p.dir, 0, 0, 1, X, Y], R(ang)), R(-part.grip.axisDeg)), T(-part.grip.x, -part.grip.y)), T(part.offset.x, part.offset.y));
      const kx = part.size.w / s.texture.width, ky = part.size.h / s.texture.height;
      s.setFromMatrix(new PIXI.Matrix(m[0] * kx, m[1] * kx, m[2] * ky, m[3] * ky, m[4], m[5]));
      if (p.fan || p.spec.flame) {
        // flaming kunai: layered tapered fire trail + embers
        const tx = -p.vx, ty = vy, L = Math.hypot(tx, ty) || 1, ux = tx / L, uy = ty / L;
        const grow = Math.min(1, ((p.spec.life - p.life) * L) / 260); // trails grow out of the hand instead of starting full length
        const flame = p.spec.flame || 'fire', F = FLAME[flame];
        this.g.moveTo(X, Y).lineTo(X + ux * 260 * grow, Y + uy * 260 * grow).stroke({ width: 34, color: F[0], alpha: flame === 'shadow' ? 0.55 : 0.35, cap: 'round' });
        this.g.moveTo(X, Y).lineTo(X + ux * 190 * grow, Y + uy * 190 * grow).stroke({ width: 22, color: F[1], alpha: 0.8, cap: 'round' });
        this.g.moveTo(X, Y).lineTo(X + ux * 110 * grow, Y + uy * 110 * grow).stroke({ width: 10, color: F[2], alpha: 0.95, cap: 'round' });
        if (Math.random() < 0.35) this.parts.push({ kind: 'ember', x: X + ux * 60, y: Y + uy * 60, vx: ux * 4 + (Math.random() - 0.5) * 3, vy: uy * 4 - 1, r: 6 + Math.random() * 6, life: 14 + Math.random() * 8, t: 0, flame });
      } else {
        this.g.moveTo(X, Y).lineTo(X - p.dir * 170, Y).stroke({ width: 5, color: 0xffffff, alpha: 0.5, cap: 'round' });
      }
    }
    for (const [id, s] of this.kunaiSprites) if (!live.has(id)) { s.destroy(); this.kunaiSprites.delete(id); }
  }

  /** a projectile that hit the floor */
  spark(x, h) { for (let i = 0; i < 8; i++) { const a = -Math.PI * Math.random(); this.parts.push({ kind: 'ember', x, y: GROUND - h, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, r: 6 + Math.random() * 6, life: 16, t: 0 }); } }

  drawDebug(sim, on) {
    const d = this.debug; d.clear();
    if (!on) return;
    const box = (b, color, a = 0.18) => d.rect(b.x0, GROUND - b.y1, b.x1 - b.x0, b.y1 - b.y0).fill({ color, alpha: a }).stroke({ width: 3, color, alpha: 0.9 });
    sim.f.forEach((f) => {
      const hb = sim.hurtbox(f) || (() => { const H = sim.C(f).hurt, b = sim.isCrouching(f) ? H.crouch : H.stand; return sim.worldBox(f, b); })();
      box(hb, f.invuln ? 0x888888 : 0x25c26e);
      const ab = sim.attackBox(f); if (ab) box(ab, 0xff2d6a, 0.3);
      d.circle(f.x, GROUND - f.h, 8).fill({ color: 0xffffff });
    });
    for (const p of sim.projectiles) d.rect(p.x - p.spec.w / 2, GROUND - p.h - p.spec.hgt / 2, p.spec.w, p.spec.hgt).fill({ color: 0xff2d6a, alpha: 0.3 }).stroke({ width: 3, color: 0xff2d6a });
  }
}
