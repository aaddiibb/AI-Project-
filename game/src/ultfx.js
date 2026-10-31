// Ultimate presentation (render only; never writes to the sim). Reads the live sim every step and draws:
//   Shinobi "Kage Bunshin"   freeze: seal, night, 影, three ink clones split out of her and take their stations
//                            (sim.stageClones: f.cAx/cAh air, f.cBx front, f.cCx/cCf rear); strike: the clones play their
//                            attacks on the real clone projectiles (kick / slash carriers, shadow-flame kunai) and burst
//                            into smoke when spent; cinematic: the Shadow Execution under the moon (frames = cine.hits).
//   Samurai "Crimson Tempest" cinematic: sheathe + iai stance, 14 real dash-through cuts (windup -> strike while crossing,
//                            crimson afterimages, ink-brush trails), the slow sheathe ... click, the screen split + the
//                            brush stroke (frames = cine.slashes / land / x).
// main.js calls: view(sim, f, i) per fighter (pose / position override), step(sim) once per sim step, camera(cam)
// (optional override) and screen(world) in the frame loop (bars, fades, flashes; the screen split).
import { Puppet, VIEW } from './render.js';

const GROUND = 1300;
const BASE = { vx: 0, vy: 0, flash: 0, walkDist: 0, runDist: 0, hp: 1000, meter: 0, combo: 0, chainCount: 0, crouchGuard: false, hitCrouch: false, state: 'attack', move: null };
const E = { out: (t) => 1 - (1 - t) ** 3, in: (t) => t * t * t, inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2) };
const cl = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => cl((t - a) / (b - a));
const CUT_ANG = [-18, 34, -62, 8, 72, -36, 24, -78, 52, -8, 84, -50, 14, -28, 40];
const SAM_CUT_POSE = (k) => (k === 0 || k === 13 ? 0 : [1, 2, 3, 0, 4][k % 5]); // which strike pair each Samurai cut plays

export class UltFx {
  constructor(PIXI, L, fx) {
    this.PIXI = PIXI; this.L = L; this.fx = fx; // L: { app, root, world, dim, kanjiLayer, fighterLayer, fxLayer }
    this.casters = [null, null]; this.sam = [null, null]; this.white = 0;
    const { world, dim, fxLayer, root, app } = L, G = () => new PIXI.Graphics();
    // world layers (persist across games): night wash + moon behind the fighters, cuts / ink above them
    this.night = G(); this.moonL = new PIXI.Container();
    this.moonGlow = G(); this.moonGlow.filters = [new PIXI.BlurFilter({ strength: 40, quality: 5 })];
    this.moon = G(); this.clouds = G(); this.clouds.filters = [new PIXI.BlurFilter({ strength: 12, quality: 4 })];
    this.moonL.addChild(this.moonGlow, this.moon, this.clouds);
    const at = world.getChildIndex(dim) + 1;
    world.addChildAt(this.moonL, at); world.addChildAt(this.night, at);
    this.kanji = new PIXI.Text({ text: '影', style: { fontFamily: '"Yu Mincho", "MS Mincho", "Noto Serif JP", serif', fontWeight: '900', fontSize: 1000, fill: '#7a55e6' } });
    this.kanji.anchor.set(0.5); this.kanji.alpha = 0; this.kanji.filters = [new PIXI.BlurFilter({ strength: 2 })]; L.kanjiLayer.addChild(this.kanji);
    this.cutGlow = G(); this.cutGlow.blendMode = 'add'; this.cutGlow.filters = [new PIXI.BlurFilter({ strength: 10, quality: 4 })];
    this.cutCore = G(); this.cutCore.blendMode = 'add';
    this.flare = G(); this.flare.blendMode = 'add'; this.flare.filters = [new PIXI.BlurFilter({ strength: 10, quality: 4 })];
    this.ring = G(); this.ring.blendMode = 'add'; this.ring.filters = [new PIXI.BlurFilter({ strength: 3 })];
    this.ink = G(); this.splat = G();
    fxLayer.addChild(this.cutGlow, this.cutCore, this.flare, this.ring, this.ink, this.splat);
    // screen space (VIEW coords): fades, bars, glints
    this.scr = G(); root.addChild(this.scr);
    // the Samurai's screen split: the finished frame rendered to a texture, shown as two masked halves on top
    this.split = new PIXI.Container(); this.split.visible = false; app.stage.addChild(this.split);
    this.halves = [0, 1].map(() => { const s = new PIXI.Sprite(), m = new PIXI.Graphics(); s.mask = m; this.split.addChild(s, m); return { s, m }; });
    this.seam = G(); this.split.addChild(this.seam);
    this.rt = null;
    this.reset();
  }

  // ------------------------------------------------------------------ per game
  /** build the clone / afterimage puppets for each fighter (call after main.js made its puppets) */
  setup(chars, rigs, poses) {
    const { PIXI } = this, FL = this.L.fighterLayer;
    for (const c of this.casters) c?.destroy();
    for (const s of this.sam) s?.destroy();
    this.casters = [null, null]; this.sam = [null, null];
    let k = 0;
    this.smokeL?.destroy({ children: true }); this.shadowG?.destroy();
    this.smokeL = new PIXI.Container(); this.smokeL.filters = [new PIXI.BlurFilter({ strength: 14, quality: 4 })];
    this.smokeG = new PIXI.Graphics(); this.smokeL.addChild(this.smokeG); FL.addChildAt(this.smokeL, k++);
    this.shadowG = new PIXI.Graphics(); this.shadowG.filters = [new PIXI.BlurFilter({ strength: 8, quality: 3 })]; FL.addChildAt(this.shadowG, k++);
    chars.forEach((ch, i) => {
      const { rig, textures } = rigs[i], P = poses[i];
      const make = () => { const p = new Puppet(PIXI, rig, textures, FL, ch, P); FL.addChildAt(p.container, k++); p.container.visible = false; return p; };
      if (ch.id === 'shinobi') {
        const violet = () => { const cm = new PIXI.ColorMatrixFilter(); cm.matrix = [0, 0, 0, 0, 0.72, 0, 0, 0, 0, 0.55, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]; return cm; };
        const ghosts = Array.from({ length: 6 }, () => { const p = make(); p.container.filters = [violet(), new PIXI.BlurFilter({ strength: 3, quality: 3 })]; return p; });
        const ink = () => { // violet glow copy behind a near-black body copy
          const rim = make(), body = make(); body.tint = 0x0e0a20; rim.container.filters = [violet(), new PIXI.BlurFilter({ strength: 6, quality: 4 })];
          return { rim, body };
        };
        const B = ink(), A = ink(), C = ink(); // (A over B: the dive passes in front)
        const all = [...ghosts, A.rim, A.body, B.rim, B.body, C.rim, C.body];
        this.casters[i] = { A, B, C, ghosts, hist: { A: [], B: [] }, last: { A: null }, gone: { A: -1 }, mode: null, burst: -1, fired: new Set(), destroy: () => all.forEach((p) => p.destroy()) };
      } else if (ch.id === 'samurai') {
        const ghosts = Array.from({ length: 4 }, () => { const p = make(); p.tint = 0xb3142a; return p; });
        this.sam[i] = { ghosts, hist: [], destroy: () => ghosts.forEach((p) => p.destroy()) };
      }
    });
    this.reset();
  }
  reset() {
    this.cuts = []; this.drops = []; this.smoke = []; this.arcs = []; this.lastTc = -1; this.white = 0;
    this.splitState = null; this.screenState = null; this.camState = null; this.ownsDim = false;
    for (const c of this.casters) if (c) { c.mode = null; c.fired = new Set(); c.burst = -1; }
  }

  // ------------------------------------------------------------------ fighter overrides
  /** pose / position override for a real fighter this step: { f, visible, tint } (or null = as the sim says) */
  view(sim, f, i) {
    const c = sim.cine;
    if (!c) return null; // (the Kage Bunshin freeze: she holds the seal through ult.flash; nothing to override)
    const by = sim.f[c.by], id = sim.C(by).id, d = sim.f[1 - c.by], tc = c.t, dir = c.dir;
    if (id === 'shinobi') {
      if (i === c.by) { // hidden until she drops in front of the moon; backlit, colour returns after the landing
        const DROP = 132, CUT = 156;
        if (tc < 10) return { f: { ...f, state: 'attack', move: 'ult', t: 30, flash: 0 }, visible: true };
        if (tc < DROP) return { f, visible: false };
        const rise = E.out(seg(tc, DROP, DROP + 6)), fall = E.in(seg(tc, DROP + 6, CUT));
        const x = d.x - dir * lerp(760, 500, E.out(seg(tc, DROP, CUT))), h = tc < DROP + 6 ? lerp(400, 500, rise) : lerp(500, 0, fall);
        return { f: { ...f, anim: 'u_drop', t: tc - DROP, x, h, facing: dir }, visible: true, tint: tc < CUT ? 0x2a2450 : tc < 186 ? 0x8a84c0 : 0xffffff };
      }
      const S = sim.C(by).moves.ult.cine, hits = S.hits.filter((h) => h.at <= tc && h.at < 168).length;
      const night = seg(tc, 10, 24) * (1 - seg(tc, 186, 214));
      return { f: { ...f, anim: tc >= 170 ? 'v_fall' : hits % 2 ? 'v_stag' : 'v_hit', t: tc >= 170 ? tc - 170 : 0, x: f.x + this.joltOf(S.hits, tc, dir) }, visible: true, tint: night > 0.3 && tc < 170 ? 0x9f9ac8 : undefined };
    }
    if (id === 'samurai') {
      if (i === c.by) return { f: this.samView(sim, f, d, tc, dir), visible: true };
      const S = sim.C(by).moves.ult.cine, k = S.slashes.filter((s) => s <= tc).length;
      return { f: { ...f, anim: tc < 34 ? 'v_hit' : tc > 100 || k % 2 ? 'v_stag' : 'v_hit', t: 0, x: f.x + this.joltOf(S.slashes.map((at) => ({ at })), tc, dir) }, visible: true };
    }
    return null;
  }
  joltOf(hits, tc, dir) { // the victim shoved by the last cut, decaying
    let last = -1, k = 0; for (const h of hits) if (h.at <= tc) { last = h.at; k++; }
    return last < 0 ? 0 : 30 * (k % 2 ? 1 : -1) * dir * Math.pow(0.78, tc - last);
  }
  /** the Samurai during his cinematic: a = attacker (sim), d = target */
  samView(sim, a, d, tc, dir) {
    const S = sim.C(a).moves.ult.cine, SL = S.slashes, LAND = S.land, dX = d.x;
    if (tc >= LAND) return { ...a, anim: 'c_finish', t: tc - (LAND - 8) };
    if (tc < 14) return { ...a, anim: 'c_impact', t: tc, facing: dir };
    const k = SL.findLastIndex((s) => tc >= s - 2);
    if (k < 0) return { ...a, anim: 'c_ready', t: tc - 14, facing: dir };
    if (tc >= LAND - 8) return { ...a, anim: 'c_finish', t: tc - (LAND - 8), x: dX + dir * 520, facing: dir };
    const p = this.samPath(k, a.x, dX, dir, SL), D = Math.min(4, Math.max(2, (SL[k + 1] ?? LAND) - SL[k] - 1)), u = E.out(seg(tc, SL[k] - 2, SL[k] - 2 + D));
    const air = k % 5 === 4 ? 300 : 0;
    return { ...a, anim: 'c_cut' + SAM_CUT_POSE(k), t: tc - (SL[k] - 2), x: lerp(p.from, p.to, u), h: air * Math.sin(u * Math.PI), facing: Math.sign(p.to - p.from) || dir };
  }
  samPath(k, aX0, dX, dir, SL) {
    const to = (j) => { const side = j === 0 || j === 13 ? dir : j === 12 ? -dir : j % 2 ? -dir : dir; return j === SL.length - 1 ? dX + dir * 520 : dX + side * (360 + ((j * 53) % 140)); };
    return { from: k === 0 ? aX0 : to(k - 1), to: to(k) };
  }

  // ------------------------------------------------------------------ per sim step
  step(sim, puppets) {
    for (const g of [this.night, this.flare, this.ring, this.shadowG, this.cutGlow, this.cutCore, this.ink, this.splat, this.moonGlow, this.moon, this.clouds]) g.clear();
    this.kanji.alpha = 0; this.screenState = null; this.camState = null; this.splitState = null;
    const c = sim.cine;
    let nightA = 0;
    sim.f.forEach((f, i) => {
      const K = this.casters[i]; if (!K) return;
      nightA = Math.max(nightA, c && c.by === i ? this.shinobiCine(sim, i, K, puppets) : this.kageBunshin(sim, i, K, puppets));
    });
    if (c && this.sam[c.by] && sim.C(sim.f[c.by]).id === 'samurai') this.samuraiCine(sim, c.by, this.sam[c.by], puppets);
    else for (const s of this.sam) if (s) s.ghosts.forEach((p) => (p.container.visible = false));
    if (nightA > 0) this.night.rect(-2000, -3000, 10000, 7000).fill({ color: 0x0c0820, alpha: nightA });
    this.ownsDim = nightA > 0;
    // smoke + ink drops
    this.smokeG.clear();
    for (const p of this.smoke) {
      if (p.home) {
        const dx = p.home[0] - p.x, dy = p.home[1] - p.y, d = Math.hypot(dx, dy) || 1;
        if (p.t > 0) { const sp = Math.min(d, 6 + p.t * 1.6); p.x += (dx / d) * sp; p.y += (dy / d) * sp; p.r *= 0.975; if (d < 40) p.a *= 0.7; } else { p.y -= 1; p.r += 1.5; }
        p.t++;
      } else { p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.r += 2.2; p.a *= 0.93; }
      this.smokeG.ellipse(p.x, p.y, p.r * 1.3, p.r).fill({ color: p.c, alpha: p.a });
    }
    this.smoke = this.smoke.filter((p) => p.a > 0.03);
    for (const d of this.drops) { d.x += d.vx; d.y += d.vy; d.vy += 0.6; d.vx *= 0.96; d.a *= 0.965; this.splat.circle(d.x, d.y, d.r).fill({ color: d.red ? 0xc8142c : 0x14100f, alpha: d.a }); }
    this.drops = this.drops.filter((d) => d.a > 0.05 && d.y < GROUND + 40);
    this.lastTc = c ? c.t : -1;
  }

  puff(x, y, n, spread, up = 1, big = 1) {
    for (let i = 0; i < n; i++) this.smoke.push({ x: x + (Math.random() - 0.5) * spread, y: y - Math.random() * 120, vx: (Math.random() - 0.5) * 6, vy: -(1 + Math.random() * 3) * up, r: (40 + Math.random() * 50) * big, a: 0.55 + Math.random() * 0.3, c: Math.random() < 0.3 ? 0x8f6cff : 0x2a1f55 });
  }
  /** pose an ink clone (rim + body); alpha 0 hides it */
  ink3(clone, f, alpha = 1, squash = 1) {
    for (const p of [clone.rim, clone.body]) {
      p.container.visible = alpha > 0.01;
      if (alpha <= 0.01) continue;
      p.update({ ...BASE, ...f }, 0, 1 / 60, true);
      p.container.pivot.set(0, 0); p.container.position.set(0, 0); p.container.scale.set(1, 1);
      if (squash !== 1) { const py = GROUND - (f.h || 0); p.container.pivot.set(0, py); p.container.position.set(0, py); p.container.scale.set(1, squash); }
      p.container.alpha = alpha;
    }
  }
  hideClones(K) { for (const c of [K.A, K.B, K.C]) { c.rim.container.visible = false; c.body.container.visible = false; } K.ghosts.forEach((p) => (p.container.visible = false)); }
  trail(ghosts, hist, cur, moving) {
    hist.unshift(cur); hist.length = Math.min(hist.length, 7);
    ghosts.forEach((p, j) => {
      const s = hist[(j + 1) * 2];
      if (!moving || !s) { p.container.visible = false; return; }
      p.container.visible = true; p.update({ ...BASE, ...s }, 0, 1 / 60, true); p.container.alpha = 0.5 - j * 0.15;
    });
  }

  /** Kage Bunshin: the super freeze (seal + split) and the strike phase; returns the night-wash alpha */
  kageBunshin(sim, i, K, puppets) {
    const f = sim.f[i], o = sim.f[1 - i], ult = sim.C(f).moves.ult, fx = this.fx;
    const inUlt = f.state === 'attack' && f.move === 'ult' && !!ult.clones;
    if (inUlt && (K.mode === null || K.mode === 'done' || K.mode === 'cine')) { K.mode = 'freeze'; K.fired = new Set(); K.hist = { A: [], B: [] }; K.gone = { A: -1 }; K.last = { A: null }; K.burst = -1; }
    if (K.mode === 'cine' && !inUlt) { K.mode = 'done'; this.hideClones(K); this.cuts = []; }
    if (K.mode === null || K.mode === 'done') { this.hideClones(K); return 0; }
    const dir = o.x >= f.x ? 1 : -1, X = f.x;
    const once = (key) => (K.fired.has(key) ? false : (K.fired.add(key), true));
    // interrupted (hit out of the seal, a clash) or over: whatever is left bursts into smoke
    if (K.burst < 0 && (!inUlt || f.ultVoid)) {
      K.burst = 0;
      for (const c of [K.A, K.B, K.C]) if (c.body.container.visible) { const b = c.body.container.getBounds(), q = this.L.fighterLayer.toLocal({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); this.puff(q.x, q.y + 200, 10, 260, 1, 1.1); }
    }
    if (K.burst >= 0) {
      this.hideClones(K); K.burst++;
      if (K.burst > 16) K.mode = 'done';
      return 0.66 * (1 - Math.min(1, K.burst / 16));
    }
    if (f.flash > 0) { // ---- the super freeze: seal, night, 影, the split
      K.mode = 'freeze';
      const t = ult.freeze - f.flash;
      const hand = puppets[i].anchorWorld('hand_near_grip', f) || [X + dir * 95, GROUND - 790];
      const fl = seg(t, 4, 7) * (1 - seg(t, 8, 22));
      if (fl > 0) { this.flare.circle(hand[0], hand[1], 70 + 60 * fl).fill({ color: 0xb79bff, alpha: 0.9 * fl }); this.flare.circle(hand[0], hand[1], 26).fill({ color: 0xffffff, alpha: fl }); }
      const rp = seg(t, 5, 20);
      if (rp > 0 && rp < 1) this.ring.circle(hand[0], hand[1], 60 + 900 * E.out(rp)).stroke({ width: 26 * (1 - rp) + 4, color: 0xa47dff, alpha: 0.85 * (1 - rp) });
      const ka = E.out(seg(t, 8, 20)) * (1 - seg(t, 38, 46));
      this.kanji.position.set(X - dir * 120, 560); this.kanji.alpha = 0.26 * ka; this.kanji.scale.set(1.25 - 0.25 * E.out(seg(t, 8, 22)));
      const emerge = (tt) => E.out(seg(t, tt, tt + 5));
      // B (front) dashes to its station; A (air) leaps to its station; C (rear) sinks, slides under him, rises behind him
      const bT = 13, bx = lerp(X, f.cBx, E.out(seg(t, bT + 2, bT + 11)));
      const aT = 15, aP = E.out(seg(t, aT + 3, aT + 14)), ax = lerp(X, f.cAx, aP), ah = f.cAh * Math.sin(aP * Math.PI * 0.5);
      const cT = 17, cSink = seg(t, cT + 2, cT + 7), cSlide = E.inout(seg(t, cT + 7, cT + 16)), cRise = E.out(seg(t, cT + 16, cT + 23));
      const cx0 = X + dir * 60, cx = lerp(cx0, f.cCx, cSlide);
      if (t < bT) this.ink3(K.B, null, 0); else this.ink3(K.B, { anim: 'u_front', t: t - bT, x: bx, h: 0, facing: dir }, emerge(bT));
      if (t < aT) this.ink3(K.A, null, 0); else this.ink3(K.A, { anim: 'u_air', t: t - aT, x: ax, h: ah, facing: dir }, emerge(aT));
      if (t < cT || (cSink >= 1 && cRise <= 0)) this.ink3(K.C, null, 0);
      else {
        const sq = cRise > 0 ? 0.02 + 0.98 * cRise : 1 - 0.98 * E.in(cSink);
        this.ink3(K.C, cRise > 0 ? { anim: 'u_rear', t: t - (cT + 16), x: f.cCx, h: 0, facing: f.cCf } : { anim: 'u_seal', t: 40, x: cx0, h: 0, facing: dir }, emerge(cT), sq);
      }
      this.trail(K.ghosts.slice(0, 3), K.hist.B, { anim: 'u_front', t: t - bT, x: bx, h: 0, facing: dir }, t >= bT + 2 && t <= bT + 13);
      this.trail(K.ghosts.slice(3), K.hist.A, { anim: 'u_air', t: t - aT, x: ax, h: ah, facing: dir }, t >= aT + 3 && t <= aT + 16);
      const poolA = cSink > 0 ? Math.min(1, cSink * 1.5) * (1 - cRise) : 0;
      if (poolA > 0) {
        this.shadowG.ellipse(cx, GROUND - 4, 210, 30).fill({ color: 0x05030c, alpha: 0.85 * poolA });
        this.shadowG.ellipse(cx, GROUND - 4, 250, 40).stroke({ width: 10, color: 0x8f6cff, alpha: 0.5 * poolA });
      }
      if (t >= 12 && once('split')) this.puff(X, GROUND - 500, 14, 260, 1, 1.3);
      if (t >= bT + 11 && once('bland')) this.puff(bx - dir * 60, GROUND - 60, 8, 300, 0.4);
      if (t >= cT + 16 && once('crise')) this.puff(f.cCx, GROUND - 40, 12, 260, 1.4, 1.1);
      // camera: push in on the seal, pull back to frame the clones
      const pull = E.inout(seg(t, 24, 42)), lo = Math.min(X, f.cAx, f.cBx, f.cCx, o.x), hi = Math.max(X, f.cAx, f.cBx, f.cCx, o.x);
      this.camState = { cx: lerp(X + dir * 150, (lo + hi) / 2, pull), w: lerp(2900, Math.max(3900, Math.min(5200, hi - lo + 900)), pull) };
      return 0.66 * E.out(seg(t, 1, 12));
    }
    // ---- the strike (sim time runs): the clones attack on the real projectiles
    K.mode = 'strike';
    const t = f.t, C = ult.clones;
    const pk = sim.projectiles.find((p) => p.owner === i && p.spec === C.kick);
    // A: the dive kick rides its projectile, then bounces off and bursts
    if (pk) { K.last.A = { x: pk.x - dir * 330, h: Math.max(0, pk.h - 520) }; this.ink3(K.A, { anim: 'u_dive', t: t - C.kick.at, x: K.last.A.x, h: K.last.A.h, facing: dir }, 1); K.gone.A = -1; }
    else if (t < C.kick.at) this.ink3(K.A, { anim: 'u_air', t: 60, x: f.cAx, h: f.cAh, facing: dir }, 1);
    else {
      if (K.gone.A < 0) { K.gone.A = t; if (K.last.A) this.puff(K.last.A.x, GROUND - K.last.A.h - 300, 10, 260); }
      const k = E.out(seg(t, K.gone.A, K.gone.A + 10)), L0 = K.last.A || { x: f.cAx, h: f.cAh };
      this.ink3(K.A, { anim: 'u_dive', t: 30, x: L0.x - dir * 260 * k, h: L0.h + 300 * Math.sin(k * Math.PI * 0.8), facing: dir }, 1 - seg(t, K.gone.A + 4, K.gone.A + 12));
    }
    this.trail(K.ghosts.slice(3), K.hist.A, { anim: 'u_dive', t: t - C.kick.at, x: K.last.A?.x ?? f.cAx, h: K.last.A?.h ?? f.cAh, facing: dir }, !!pk);
    // B: the lunge slash
    const bx = lerp(f.cBx, f.cBx + dir * 300, E.in(seg(t, 12, 20)));
    this.ink3(K.B, { anim: 'u_cut', t, x: bx, h: 0, facing: dir }, 1 - seg(t, 30, 38));
    if (t >= 31 && once('bgone')) this.puff(bx + dir * 60, GROUND - 200, 12, 260, 1, 1.1);
    this.trail(K.ghosts.slice(0, 3), K.hist.B, { anim: 'u_cut', t, x: bx, h: 0, facing: dir }, t >= 13 && t <= 21);
    if (t >= 20 && once('arc')) { const pts = K.B.body.arcPoints({ from: 'sword_windup', to: 'sword_slash', anchor: 'sword_tip', inner: 'sword_guard', samples: 8 }, { ...BASE, x: bx, h: 0, facing: dir }); if (pts) this.arcs.push({ ...pts, t: 0, violet: true }); }
    // C: the kunai fury (fans in both hands until the last volley leaves)
    const cf = { anim: 'u_volley', t, x: f.cCx, h: 0, facing: f.cCf };
    this.ink3(K.C, cf, 1 - seg(t, 46, 54));
    if (t >= 47 && once('cgone')) this.puff(f.cCx, GROUND - 200, 12, 260, 1, 1.1);
    if (t < C.kunai.volleys.at(-1) + C.kunai.per) for (const a of ['hand_near_grip', 'hand_far_grip']) { const p = K.C.body.anchorWorld(a, cf); if (p) fx.fan(p[0], p[1], f.cCf, 0.6 + 0.4 * seg(t, 0, 8), 0.8, 'shadow'); }
    for (const a of this.arcs) if (a.violet) {
      a.t++; const k = a.t / 14; if (k >= 1) continue;
      const pts = [...a.outer, ...a.inner.slice().reverse()].flat();
      if (pts.length >= 6) this.ink.poly(pts).fill({ color: 0xc9b6ff, alpha: 0.6 * (1 - k) }).stroke({ width: 8, color: 0x7a4dff, alpha: 1 - k, join: 'round' });
    }
    this.arcs = this.arcs.filter((a) => !a.violet || a.t < 16);
    return 0.66 * (1 - seg(t, 50, 60));
  }

  /** the Shadow Execution (Shinobi cinematic); returns the night alpha */
  shinobiCine(sim, i, K, puppets) {
    const c = sim.cine, tc = c.t, a = sim.f[i], d = sim.f[1 - i], dir = c.dir, S = sim.C(a).moves.ult.cine, fx = this.fx, SX = d.x;
    const fresh = tc !== this.lastTc;
    if (K.mode !== 'cine') { K.mode = 'cine'; this.cuts = []; }
    // 0..10: the hit freezes everything (the clones hold their last pose), flash, sink to black
    if (tc < 10) { this.screenState = { black: seg(tc, 3, 10), bars: 0 }; return 0.66; }
    const tp = tc - 10, night = seg(tp, 0, 14) * (1 - seg(tp, 176, 204));
    const MX = SX - dir * 300, MY = GROUND - 1120, MR = 380;
    this.moonGlow.circle(MX, MY, MR * 1.9).fill({ color: 0x8f7dff, alpha: 0.32 * night }).circle(MX, MY, MR * 1.25).fill({ color: 0xd9d2ff, alpha: 0.35 * night });
    this.moon.circle(MX, MY, MR).fill({ color: 0xece8ff, alpha: night }).circle(MX - 90, MY - 60, MR * 0.22).fill({ color: 0xd8d2f2, alpha: 0.5 * night }).circle(MX + 120, MY + 90, MR * 0.14).fill({ color: 0xd8d2f2, alpha: 0.45 * night });
    const glint = seg(tp, 112, 118) * (1 - seg(tp, 120, 128));
    if (glint > 0) { const gx = MX - 140, gy = MY - 230, L = 240 * glint; this.moon.moveTo(gx - L, gy).lineTo(gx + L, gy).moveTo(gx, gy - L * 0.7).lineTo(gx, gy + L * 0.7).stroke({ width: 6, color: 0xffffff, alpha: glint }); }
    this.clouds.ellipse(MX - 300 + tp * 1.2, MY + 150, 520, 34).fill({ color: 0x1c1640, alpha: 0.85 * night }).ellipse(MX + 380 - tp * 0.7, MY - 190, 420, 26).fill({ color: 0x1c1640, alpha: 0.7 * night });
    // the rush: one pass per cut (hits before 108), alternating sides, accelerating; then all three at once (108)
    const clones = [K.B, K.C, K.A], kind = ['u_pass_cut', 'u_pass_stab', 'u_pass_kick'];
    this.hideClones(K);
    let gi = 0;
    const passes = S.hits.filter((h) => h.at < 108);
    passes.forEach((h, k) => {
      const D = k < 4 ? 6 : k < 8 ? 5 : 4, st = h.at - Math.floor(D / 2), u = (tc - st) / D, s = (k % 2 ? -1 : 1) * dir, air = k % 3 === 2 ? 260 : 0;
      if (fresh && tc === h.at && k % 2 === 0) this.cuts.push({ x: SX + (Math.random() - 0.5) * 440, y: GROUND - 640 + (Math.random() - 0.5) * 520, ang: (CUT_ANG[k] * Math.PI) / 180, len: 1300 + Math.random() * 500, t0: tc });
      if (fresh && tc === h.at) fx.shake = Math.max(fx.shake, 6 + k);
      if (u < 0 || u > 1) return;
      const xAt = (uu) => SX - s * 700 + s * 1400 * uu, ci = k % 3, an = u < 0.25 || u > 0.75 ? 'u_pass_dash' : kind[ci];
      this.ink3(clones[ci], { anim: an, t: 0, x: xAt(u), h: air * Math.sin(u * Math.PI), facing: s }, 1);
      for (let j = 1; j <= 3 && gi < K.ghosts.length; j++) {
        const uu = u - j * 0.12; if (uu < 0) break;
        const p = K.ghosts[gi++]; p.container.visible = true; p.container.alpha = 0.55 - j * 0.15;
        p.update({ ...BASE, anim: an, t: 0, x: xAt(uu), h: air * Math.sin(uu * Math.PI), facing: s }, 0, 1 / 60, true);
      }
    });
    if (tc >= 106 && tc <= 111) { const u = (tc - 106) / 5; [[0, 1, 0], [1, -1, 0], [2, 1, 700]].forEach(([ci, s0, h]) => { const s = s0 * dir; this.ink3(clones[ci], { anim: kind[ci], t: 0, x: SX - s * 800 + s * 1600 * u, h: h ? h * (1 - u) + 200 : 0, facing: s }, 1); }); }
    if (fresh && tc === 108) { for (let j = 0; j < 3; j++) this.cuts.push({ x: SX + (Math.random() - 0.5) * 440, y: GROUND - 640 + (Math.random() - 0.5) * 520, ang: (CUT_ANG[12 + j] * Math.PI) / 180, len: 1300 + Math.random() * 500, t0: tc }); fx.shake = 22; this.white = 0.18; }
    // her descent cut (156) and the ignite (168)
    if (fresh && tc === 156) { fx.dust(SX - dir * 500, 14, 0, 1.6); this.cuts.push({ x: SX - dir * 30, y: GROUND - 900, ang: Math.PI / 2, len: 2600, t0: tc, big: true }); this.white = 0.95; fx.shake = 30; }
    if (fresh && tc === 168) {
      this.white = 0.6; fx.shake = 36; for (const k of this.cuts) k.ignite = tc; fx.hit({ x: SX, h: 640, dir: -dir, power: 3 });
      for (let j = 0; j < 26; j++) this.smoke.push({ x: SX + (Math.random() - 0.5) * 900, y: GROUND - Math.random() * 1000, r: 50 + Math.random() * 60, a: 0.75, c: Math.random() < 0.35 ? 0x8f6cff : 0x2a1f55, home: [SX - dir * 500, GROUND - 560], t: -14 });
    }
    for (const k of this.cuts) {
      const age = tc - k.t0, grow = E.out(cl(age / (k.big ? 4 : 2)));
      let al = age < 6 ? 1 : 0.3 + 0.06 * Math.sin(tc * 0.3 + k.x), w = k.big ? 26 : 9;
      if (k.ignite !== undefined) { const q = tc - k.ignite; al = q < 6 ? 1 : Math.max(0, 1 - (q - 6) / 16); w *= 1 + 1.4 * Math.max(0, 1 - q / 10); }
      if (al <= 0) continue;
      const dx = ((Math.cos(k.ang) * k.len) / 2) * grow, dy = ((Math.sin(k.ang) * k.len) / 2) * grow;
      this.cutGlow.moveTo(k.x - dx, k.y - dy).lineTo(k.x + dx, k.y + dy).stroke({ width: w * 3, color: 0x7a4dff, alpha: 0.9 * al, cap: 'round' });
      this.cutCore.moveTo(k.x - dx, k.y - dy).lineTo(k.x + dx, k.y + dy).stroke({ width: w * 0.45, color: 0xffffff, alpha: al, cap: 'round' });
    }
    const absorb = seg(tc, 188, 202) * (1 - seg(tc, 206, 222));
    if (absorb > 0) this.flare.circle(SX - dir * 500, GROUND - 560, 260).fill({ color: 0x8f6cff, alpha: 0.5 * absorb });
    // camera: framed on him, slow push-in during the silence, tilt up to the moon for the drop
    const push = E.inout(seg(tp, 100, 140)) * (1 - E.inout(seg(tp, 168, 200)));
    this.camState = { cx: SX - dir * 200, w: lerp(3100, 2750, push), lift: 300 * E.inout(seg(tp, 104, 126)) * (1 - E.inout(seg(tp, 136, 148))) };
    this.screenState = { black: 1 - seg(tp, 0, 12), bars: 118 * (1 - seg(tp, 196, 212)) };
    if (night > 0) this.night.rect(-2000, GROUND - 4, 10000, 10).fill({ color: 0x9d8cff, alpha: 0.18 * night });
    return 0.86 * night;
  }

  /** Crimson Tempest cinematic effects (the poses come from view / samView) */
  samuraiCine(sim, i, Z, puppets) {
    const c = sim.cine, tc = c.t, a = sim.f[i], d = sim.f[1 - i], dir = c.dir, S = sim.C(a).moves.ult.cine, SL = S.slashes, fx = this.fx;
    const fresh = tc !== this.lastTc, pup = puppets[i], dX = d.x;
    const k = SL.findLastIndex((s) => tc >= s - 2);
    const af = this.samView(sim, a, d, tc, dir);
    // crimson afterimages while he crosses
    const crossing = k >= 0 && tc < S.land - 8 && tc >= SL[k] - 1 && tc <= SL[k] + 2;
    Z.hist.unshift(af); Z.hist.length = Math.min(Z.hist.length, 6);
    Z.ghosts.forEach((p, j) => {
      const s = Z.hist[j + 1];
      if (!crossing || !s) { p.container.visible = false; return; }
      p.container.visible = true; p.container.alpha = 0.4 - j * 0.09; p.update({ ...BASE, ...s }, 0, 1 / 60, true);
    });
    if (fresh && k >= 0 && tc < S.land - 8) {
      const p = this.samPath(k, a.x, dX, dir, SL), m = Math.sign(p.to - p.from) || dir;
      if (tc === SL[k] - 1) fx.streak(p.from, p.to, GROUND - 560 - (af.h || 0));
      if (tc === SL[k]) { // the blade passes her: ink-brush trail + drops
        const fr = sim.C(a).anims['c_cut' + SAM_CUT_POSE(k)].frames;
        const pts = pup.arcPoints({ from: fr[0].pose, to: fr[1].pose, anchor: 'sword_tip', inner: 'sword_guard', samples: 10 }, { ...BASE, x: dX - m * 260, h: k % 5 === 4 ? 160 : 0, facing: m });
        if (pts) this.arcs.push({ ...pts, t: 0, big: k === 0 || k === SL.length - 1 });
        fx.shake = Math.max(fx.shake, k === 0 ? 14 : 7);
        for (let j = 0; j < 6; j++) { const an = Math.random() * Math.PI * 2, v = 8 + Math.random() * 16; this.drops.push({ x: dX + (Math.random() - 0.5) * 80, y: GROUND - 640 + (Math.random() - 0.5) * 200, vx: Math.cos(an) * v + m * 6, vy: Math.sin(an) * v - 4, r: 6 + Math.random() * 10, a: 1, red: Math.random() < 0.6 }); }
      }
    }
    for (const q of this.arcs) {
      if (q.violet) continue;
      if (fresh) q.t++;
      const kk = q.t / (q.big ? 22 : 16); if (kk >= 1) continue;
      const o = q.outer.slice(Math.floor(q.outer.length * 0.6)), n = o.length - 1, W = (q.big ? 34 : 22) * (1 - kk * 0.6);
      for (let j = 0; j < n; j++) { const w = W * Math.sin((Math.PI * (j + 0.5)) / n) + 2; this.ink.moveTo(o[j][0], o[j][1]).lineTo(o[j + 1][0], o[j + 1][1]).stroke({ width: w, color: 0x14100f, alpha: 1 - kk * kk, cap: 'round' }); }
      for (let j = 0; j < n; j++) this.ink.moveTo(o[j][0], o[j][1]).lineTo(o[j + 1][0], o[j + 1][1]).stroke({ width: 3, color: 0xd21f3c, alpha: 1 - kk, cap: 'round' });
    }
    this.arcs = this.arcs.filter((q) => q.violet || q.t < 24);
    // glints: the guard before the first draw, the saya mouth at the click
    const glints = [];
    if (tc >= 26 && tc <= 33) glints.push({ a: pup.anchorWorld('hand_near_grip', af), k: seg(tc, 26, 29) * (1 - seg(tc, 30, 33)), s: 1 });
    if (tc >= 148 && tc <= 156) glints.push({ a: pup.anchorWorld('saya_mouth', af) || pup.anchorWorld('hand_near_grip', af), k: seg(tc, 148, 151) * (1 - seg(tc, 152, 156)), s: 1.4 });
    // the finale: hairline (x[0]) -> the halves slide apart -> brush stroke + splatter (x[1])
    const [X0, X1] = S.x, cx = dX - dir * 40, cy = GROUND - 640, ang = (-24 * dir * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    if (fresh && tc === X0) fx.shake = 18;
    if (fresh && tc === X1) {
      fx.shake = 34; fx.petals(dX, 44);
      for (let j = 0; j < 46; j++) { const along = (Math.random() - 0.5) * 2.4 * 900, off = (Math.random() - 0.5) * 120, v = 6 + Math.random() * 22, a2 = ang + ((Math.random() < 0.5 ? -1 : 1) * Math.PI) / 2 + (Math.random() - 0.5); this.drops.push({ x: cx + ca * along - sa * off, y: cy + sa * along + ca * off, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 3, r: 5 + Math.random() * 16, a: 1, red: Math.random() < 0.45 }); }
    }
    if (tc >= X1) {
      const grow = E.out(seg(tc, X1, X1 + 5)), fade = 1 - seg(tc, X1 + 10, X1 + 22), L = 1700;
      const strip = (wmax, off, color, alpha) => {
        const top = [], bot = [];
        for (let j = 0; j <= 24; j++) {
          const u = -1 + 2 * grow * (j / 24), along = u * L, w = wmax * Math.pow(Math.max(0, Math.sin((Math.PI * (u + 1)) / 2)), 0.55) * (0.85 + 0.15 * Math.sin(j * 2.1));
          const px = cx + ca * along - sa * off, py = cy + sa * along + ca * off; top.push(px - sa * w, py + ca * w); bot.push(px + sa * w, py - ca * w);
        }
        const pts = [...top]; for (let j = bot.length - 2; j >= 0; j -= 2) pts.push(bot[j], bot[j + 1]);
        this.ink.poly(pts).fill({ color, alpha: alpha * fade });
      };
      strip(70, 0, 0x120c0e, 0.92);
      for (const [w, off] of [[10, -62], [7, 66], [5, -84]]) strip(w, off, 0x120c0e, 0.6);
      strip(16, 6, 0xd21f3c, 0.95);
    }
    if (tc >= X0 && tc < X1 + 2) this.splitState = { cx, cy, ang, slide: tc < X1 ? 30 * E.out(seg(tc, X0, X0 + 3)) : 30 * (1 - seg(tc, X1, X1 + 2)), a: tc < X1 ? 1 : 0.6 };
    // camera: frame her; creep in through the silence; snap back on the cut
    const push = E.inout(seg(tc, 104, 150)) * (1 - E.out(seg(tc, 152, 160)));
    this.camState = { cx: lerp(dX, dX + dir * 160, push), w: lerp(3940, 3200, push) };
    this.screenState = { black: 0, bars: 118 * Math.min(1, tc / 10, Math.max(0, (S.len - tc) / 10)), glints };
  }

  // ------------------------------------------------------------------ frame loop hooks
  /** camera override (ultimate freeze / cinematics): moves the shared camera so it eases back afterwards; null = none */
  camera(cam) {
    const s0 = this.camState; if (!s0) return null;
    cam.cx = s0.cx; cam.w = s0.w;
    const s = 1920 / s0.w;
    return { s, tx: 960 - s0.cx * s, ty: 940 - GROUND * s + (s0.lift || 0), cx: s0.cx, w: s0.w };
  }
  /** screen-space layer (VIEW coords): fades, bars, white flash, glints; then the screen split. true = bars handled */
  screen(world) {
    const g = this.scr; g.clear();
    const st = this.screenState, x0 = -VIEW.ex, sw = 1920 + 2 * VIEW.ex, y0 = -VIEW.ey, sh = 1080 + 2 * VIEW.ey; // (cover the extended view too)
    if (this.white > 0.01) { g.rect(x0, y0, sw, sh).fill({ color: 0xffffff, alpha: this.white }); this.white *= 0.82; }
    if (st) {
      if (st.bars > 0) g.rect(x0, y0, sw, st.bars).fill(0x07060c).rect(x0, y0 + sh - st.bars, sw, st.bars).fill(0x07060c);
      for (const gl of st.glints || []) {
        if (!gl.a || gl.k <= 0) continue;
        const q = g.toLocal(world.toGlobal({ x: gl.a[0], y: gl.a[1] })), L = 120 * gl.k * gl.s;
        g.moveTo(q.x - L, q.y).lineTo(q.x + L, q.y).moveTo(q.x, q.y - L * 0.6).lineTo(q.x, q.y + L * 0.6).stroke({ width: 4, color: 0xffffff, alpha: gl.k });
        g.circle(q.x, q.y, 10 * gl.k * gl.s).fill({ color: 0xffffff, alpha: gl.k });
      }
      if (st.black > 0) g.rect(x0, y0, sw, sh).fill({ color: 0x000000, alpha: st.black });
    }
    // the split: render the finished frame (minus this layer) to a texture, show it as two halves sliding along the cut
    const sp = this.splitState, { app } = this.L;
    this.split.visible = false;
    if (sp) {
      const r = app.renderer, res = r.resolution || 1, W = r.width / res, H = r.height / res;
      if (!this.rt || this.rt.width !== W || this.rt.height !== H) { this.rt?.destroy(true); this.rt = this.PIXI.RenderTexture.create({ width: W, height: H, resolution: res }); for (const h of this.halves) h.s.texture = this.rt; }
      r.render({ container: app.stage, target: this.rt });
      const c = this.split.toLocal(world.toGlobal({ x: sp.cx, y: sp.cy })), dx = Math.cos(sp.ang), dy = Math.sin(sp.ang), nx = -dy, ny = dx, R = 6000;
      this.halves.forEach(({ s, m }, j) => {
        const sg = j ? 1 : -1;
        m.clear().poly([c.x - dx * R, c.y - dy * R, c.x + dx * R, c.y + dy * R, c.x + dx * R + nx * R * sg, c.y + dy * R + ny * R * sg, c.x - dx * R + nx * R * sg, c.y - dy * R + ny * R * sg]).fill(0xffffff);
        s.position.set(dx * sp.slide * sg, dy * sp.slide * sg); m.position.copyFrom(s.position);
      });
      const L = 4000;
      this.seam.clear().moveTo(c.x - dx * L, c.y - dy * L).lineTo(c.x + dx * L, c.y + dy * L).stroke({ width: 26, color: 0xd21f3c, alpha: 0.35 * sp.a })
        .moveTo(c.x - dx * L, c.y - dy * L).lineTo(c.x + dx * L, c.y + dy * L).stroke({ width: 6, color: 0xfff4ec, alpha: sp.a })
        .moveTo(c.x - dx * L, c.y - dy * L).lineTo(c.x + dx * L, c.y + dy * L).stroke({ width: 2, color: 0xd21f3c, alpha: sp.a });
      this.split.visible = true;
    }
    return !!st;
  }
}
