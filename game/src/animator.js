// Animator: fighter state -> smoothly animated pose, once per simulation frame (pure; no PixiJS).
//
// Two mechanisms remove the "snapping between held poses" look:
//  1. In-clip tweening. Each key of a frame list holds its pose, then eases toward the next key during the last
//     `tween` frames of its hold, so every key pose is reached EXACTLY on the frame the frame data says
//     (hitboxes / active frames are unchanged; strikes accelerate into the active frame).
//  2. Cross-fades. Whenever the clip changes (stand -> crouch, landing, getting hit, starting an attack, chaining...)
//     the last displayed pose blends into the new clip over a few frames (per-clip `fade`), with joint angles
//     unwrapped so flips never spin the long way round.
// Grounding is kept continuous across ground <-> air changes: grounded poses are re-solved by the rig's ground lock,
// mixed blends interpolate the absolute root height.
//
// Per character (prompt 05 §4.1): ANIMS / walk / run data and MOVES come from the fighter's character object, not from
// global imports. The default character is the Shinobi, so `new Animator(rig, poses)` behaves exactly as before.
// Facial expressions: when the rig has the 16 raster faces (art/faces/build_faces.py), the `face` slot is chosen every
// frame from the fighter's situation (expression()), overriding the pose's own face; otherwise poses keep theirs.
import { groundOffset } from '../../art/shinobi/rig_runtime.js';
import { SHINOBI } from './characters/shinobi.js';

export const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  in3: (t) => t * t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inout: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  smooth: (t) => t * t * (3 - 2 * t),
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const DEFAULT_TWEEN = 5;

// fade-in length (frames) when a clip starts, by clip family
const FADE = { idle: 6, crouch: 4, guard: 3, walk: 4, run: 4, runstop: 4, attack: 2, prejump: 2, air: 3, land: 2, dash: 3, backhop: 3, hit: 1, knock: 2, down: 4, wake: 4 };


// forward / back somersault: rotate the body about its tucked centre of mass, not the pelvis pivot
const PELVIS = [524, 600], FLIP_CENTER = [526, 540];

export class Animator {
  constructor(rig, poses, char = SHINOBI) {
    this.rig = rig; this.poses = poses; this.char = char;
    const steps = char.walk.steps;
    this.walk = { steps, poses: char.walk.poses, cycle: steps.reduce((a, b) => a + b, 0), cum: steps.reduce((acc, s) => (acc.push((acc.at(-1) || 0) + s), acc), [0]) };
    this.cache = new Map();
    this.key = null; this.from = null; this.fadeT = 0; this.fadeLen = 0;
    this.last = null; this.clipName = '';
    this.faces = new Set(rig.slots?.face?.options || []);
    this.rasterFaces = this.faces.has('face_glare');
    this.tick = 0; this.face = 'face_neutral';
  }

  /**
   * expression for this frame (a `face` slot option). ctx (optional, render side only): { opp, freeze } = the opponent
   * fighter and whether a super freeze is running. Sheet order: 1 neutral, 2 confident, 3 focus, 4 intense (attack
   * shout), 5 grit, 6 glare, 7 surprised, 8 smirk, 9 wince, 10 hurt, 11 dazed, 12 tired, 13 cry (ultimate),
   * 14 victory, 15 defeated, 16 blink.
   */
  expression(f, ctx = {}) {
    const M = this.char.moves, opp = ctx.opp;
    if (f.anim) return f.anim.startsWith('v_') ? (f.anim === 'v_fall' ? 'face_defeated' : 'face_hurt') : f.anim === 'c_finish' && f.t > 50 ? 'face_confident' : 'face_glare'; // render-only clips (ultfx.js)
    switch (f.state) {
      case 'cine': return f.move === 'cine_def' ? (f.t % 6 < 3 ? 'face_hurt' : 'face_wince') : f.t < 104 ? 'face_cry' : f.t < 150 ? 'face_glare' : 'face_confident';
      case 'hitstun': return f.gBreak > 0 ? 'face_dazed' : f.lastHit >= 100 || f.counter ? 'face_hurt' : 'face_wince';
      case 'knock': return f.ko ? 'face_defeated' : 'face_hurt';
      case 'down': return f.ko ? 'face_defeated' : 'face_dazed';
      case 'wake': return 'face_tired';
      case 'blockstun': return 'face_grit';
      case 'win': return 'face_victory';
      case 'guard': return 'face_glare';
      case 'dash': case 'run': case 'backdash': case 'backhop': case 'prejump': return 'face_focus';
      case 'air': return f.vy > 10 ? 'face_focus' : 'face_glare';
      case 'attack': {
        const m = M[f.move];
        if (f.move === 'ult') return 'face_cry';                   // battle cry from the flash to the last release
        if (f.move === 'parry') return f.t < 8 ? 'face_glare' : 'face_smirk';
        if (f.move === 'throw' || f.move === 'kawarimi') return 'face_focus'; // aiming / the hand seal
        if (f.move === 'repel') return 'face_cry';
        const heavy = (m.power || 1) >= 3 || !!m.knockdown;
        const a0 = m.active ? m.active[0] : (m.spawnAt ?? 0), a1 = m.active ? m.active[1] : a0 + 4;
        if (f.t < a0 - 3) return 'face_focus';                       // wind-up
        if (f.t < a1 + 4) return heavy ? 'face_intense' : 'face_grit'; // the strike
        return f.contact ? 'face_confident' : 'face_focus';        // recovery: pleased on contact
      }
    }
    // neutral family: idle / walk / crouch / runstop / land
    if (ctx.freeze && !(f.flash > 0)) return 'face_surprised';    // the opponent's ultimate flash
    if (opp?.ko) return 'face_victory';
    if (opp && (opp.state === 'down' || opp.state === 'knock')) return 'face_smirk';
    const blink = this.tick % 190 >= 184;                           // ~ every 3 s, 6 frames
    if (f.hp < this.char.phys.hp * 0.3) return blink ? 'face_blink' : 'face_tired';
    if (blink) return 'face_blink';
    return f.meter >= 100 ? 'face_confident' : 'face_neutral';
  }

  // ---------------------------------------------------------------- pose algebra
  /** named pose -> normalised pose { rot, rx, ry, grounded, slots, attach, attachRot, springHang, groundBy } */
  P(name) {
    let p = this.cache.get(name);
    if (!p) {
      const src = this.poses[name] || this.poses.stance;
      p = {
        rot: { ...(src.rot || {}) }, rx: src.root?.x || 0, ry: src.root?.y || 0, grounded: src.ground !== false,
        slots: src.slots || {}, attach: src.attach || null, attachRot: src.attachRot || {}, springHang: src.springHang ?? 1,
        groundBy: src.groundBy || null, name,
      };
      this.cache.set(name, p);
    }
    return p;
  }
  /** absolute root y (ground lock included), computed lazily */
  absY(p) {
    if (p.ga === undefined) p.ga = p.grounded ? p.ry + groundOffset(this.rig, this.toSolve(p)) : p.ry;
    return p.ga;
  }
  blend(a, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const rot = {};
    for (const k of new Set([...Object.keys(a.rot), ...Object.keys(b.rot)])) {
      let av = a.rot[k] || 0;
      const bv = b.rot[k] || 0;
      av += 360 * Math.round((bv - av) / 360); // unwrap: never spin the long way round
      rot[k] = av + (bv - av) * t;
    }
    const pick = t < 0.5 ? a : b;
    const sameGround = a.grounded && b.grounded && JSON.stringify(a.groundBy) === JSON.stringify(b.groundBy);
    const sameAttach = JSON.stringify(a.attach) === JSON.stringify(b.attach);
    const attachRot = {};
    if (sameAttach) for (const k of new Set([...Object.keys(a.attachRot), ...Object.keys(b.attachRot)])) attachRot[k] = (a.attachRot[k] || 0) * (1 - t) + (b.attachRot[k] || 0) * t;
    return {
      rot, rx: a.rx + (b.rx - a.rx) * t,
      grounded: sameGround,
      ry: sameGround ? a.ry + (b.ry - a.ry) * t : this.absY(a) + (this.absY(b) - this.absY(a)) * t,
      slots: pick.slots, attach: pick.attach, attachRot: sameAttach ? attachRot : pick.attachRot,
      springHang: a.springHang + (b.springHang - a.springHang) * t, groundBy: sameGround ? pick.groundBy : null,
    };
  }
  /** normalised pose -> pose object for rig_runtime.solve */
  toSolve(p) {
    return { rot: p.rot, root: { x: p.rx, y: p.ry }, ground: p.grounded, groundBy: p.groundBy, slots: p.slots, attach: p.attach, attachRot: p.attachRot, springHang: p.springHang };
  }

  /** sample a held-pose frame list at frame t with end-of-hold tweening */
  sample(frames, t, loop = false) {
    const total = frames.reduce((s, f) => s + f.hold, 0);
    if (loop) t = ((t % total) + total) % total; else t = Math.max(0, Math.min(total - 1, t));
    let acc = 0, i = 0;
    while (i < frames.length - 1 && t >= acc + frames[i].hold) acc += frames[i++].hold;
    const fr = frames[i], lt = t - acc;
    const next = frames[i + 1] || (loop ? frames[0] : null);
    const a = this.P(fr.pose);
    if (!next || fr.tween === 0) return a;
    const L = Math.min(fr.hold, fr.tween ?? DEFAULT_TWEEN), start = fr.hold - L;
    if (lt < start) return a;
    const u = (lt - start + 1) / (L + 1);
    return this.blend(a, this.P(next.pose), (EASE[fr.ease] || EASE.inout)(u));
  }

  // ---------------------------------------------------------------- state -> clip
  clip(f) {
    const s = f.state, ANIMS = this.char.anims, MOVES = this.char.moves;
    if (f.anim && ANIMS[f.anim]) return [`anim:${f.anim}`, 'attack', this.sample(ANIMS[f.anim].frames, f.t, !!ANIMS[f.anim].loop)]; // render-only clip (ultfx.js)
    switch (s) {
      case 'cine': return [`cine:${f.move}`, 'attack', ANIMS[f.move] ? this.sample(ANIMS[f.move].frames, f.t) : this.P('stance')];
      case 'idle': return ['idle', 'idle', this.sample(ANIMS.idle.frames, f.t, true)];
      case 'win': return ['win', 'idle', this.P(this.poses.win ? 'win' : 'stance')];
      case 'crouch': return ['crouch', 'crouch', this.sample(ANIMS.crouch.frames, f.t, true)];
      case 'guard': case 'blockstun': {
        const g = this.P(f.crouchGuard ? 'crouch_guard' : 'guard');
        if (s === 'blockstun') { // shoved back a little, settles into the guard
          const k = clamp01(f.stun / 10);
          return [f.crouchGuard ? 'cguard' : 'guard', 'guard', { ...g, rx: g.rx - 26 * k, rot: { ...g.rot, torso_upper: (g.rot.torso_upper || 0) - 6 * k } }];
        }
        return [f.crouchGuard ? 'cguard' : 'guard', 'guard', g];
      }
      case 'walk': {
        const { steps, poses, cycle, cum } = this.walk;
        const d = ((f.walkDist % cycle) + cycle) % cycle;
        let i = 0; while (i < steps.length - 1 && d >= cum[i + 1]) i++;
        const u = (d - cum[i]) / steps[i];
        return ['walk', 'walk', this.blend(this.P(poses[(i + poses.length - 1) % poses.length]), this.P(poses[i]), u)];
      }
      case 'run': {
        if (f.t < 6) return ['run', 'run', this.P('dash')];
        const { poses: RUN_POSES, stride: RUN_STRIDE } = this.char.run;
        const L = RUN_STRIDE * RUN_POSES.length, d = ((f.runDist % L) + L) % L;
        const i = Math.floor(d / RUN_STRIDE), u = (d - i * RUN_STRIDE) / RUN_STRIDE;
        return ['run', 'run', this.blend(this.P(RUN_POSES[i]), this.P(RUN_POSES[(i + 1) % RUN_POSES.length]), EASE.smooth(u))];
      }
      case 'runstop': return ['runstop', 'runstop', this.P('stance_b')];
      case 'attack': {
        const m = MOVES[f.move];
        if (m.flash && f.flash > 0) return [`atk:${f.move}:${f.chainCount}`, 'attack', this.sample(m.flash, m.freeze - f.flash), m.fade];
        return [`atk:${f.move}:${f.chainCount}`, 'attack', this.sample(m.frames, f.t), m.fade];
      }
      case 'prejump': return ['prejump', 'prejump', this.P('jump_squat')];
      case 'air': return ['air', 'air', this.airPose(f)];
      case 'land': return ['land', 'land', this.P('land')];
      case 'dash': return ['dash', 'dash', this.sample(ANIMS.dash.frames, f.t)];
      case 'backhop': return ['backhop', 'backhop', this.P('backstep')];
      case 'backdash': return ['backdash', 'dash', this.sample(ANIMS.backdash.frames, f.t)]; // grounded back-dash (Samurai)
      case 'hitstun': if (f.gBreak > 0) return ['gbreak', 'hit', this.P('ko_stagger')]; // guard broken: staggering
        return [f.hitCrouch ? 'chit' : 'hit', 'hit', this.P(f.hitCrouch ? 'crouch_hit' : 'hit')];
      case 'knock': return ['knock', 'knock', this.sample(ANIMS.knock_air.frames, f.t)];
      case 'down': return ['down', 'down', this.P('ko_down')];
      case 'wake': return ['wake', 'wake', this.sample(ANIMS.wake.frames, f.t)];
      default: return ['idle', 'idle', this.P('stance')];
    }
  }

  /** jump: stretch on the way up, tuck at the apex, extend for the landing; somersault on forward / back jumps */
  airPose(f) {
    const v = f.vy;
    let p = v > 0 ? this.blend(this.P('jump_rise'), this.P('jump_peak'), EASE.smooth(clamp01(1 - v / 30)))
      : this.blend(this.P('jump_peak'), this.P('jump_fall'), EASE.smooth(clamp01(-v / 24)));
    const dirX = f.vx * f.facing;
    if (Math.abs(dirX) > 3) {
      const jv = this.char.phys.jumpVy; const ph = clamp01((jv - v) / (2 * jv)); // 0 take-off .. 0.5 apex .. 1 landing
      const u = clamp01((ph - 0.12) / 0.56); // flip progress
      if (u > 0) {
        // curl into a ball while rotating (tight in the middle of the flip), open up again for the landing
        p = this.blend(p, this.P('jump_flip'), Math.pow(Math.sin(Math.PI * u), 0.6));
        p = this.flip(p, (dirX > 0 ? 360 : -360) * EASE.inout(u));
      }
    }
    return p;
  }
  flip(p, ang) {
    const r = (ang * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    const dx = FLIP_CENTER[0] - PELVIS[0], dy = FLIP_CENTER[1] - PELVIS[1];
    const ox = FLIP_CENTER[0] - (PELVIS[0] + c * dx - s * dy), oy = FLIP_CENTER[1] - (PELVIS[1] + s * dx + c * dy);
    return { ...p, rot: { ...p.rot, pelvis: (p.rot.pelvis || 0) + ang }, rx: p.rx + ox, ry: p.ry + oy, grounded: false };
  }

  // ---------------------------------------------------------------- per-frame
  /** advance one simulation frame; returns a pose for rig_runtime.solve (root.x relative to the fighter) */
  step(f, ctx) {
    const [key, family, target, fadeOverride] = this.clip(f);
    this.tick++;
    if (key !== this.key) {
      this.from = this.last; this.key = key; this.fadeT = 0;
      this.fadeLen = this.from ? (fadeOverride ?? FADE[family] ?? 4) : 0;
    }
    let out = target;
    if (this.fadeT < this.fadeLen) {
      this.fadeT++;
      out = this.blend(this.from, target, EASE.out(this.fadeT / (this.fadeLen + 1)));
    }
    this.last = out; this.clipName = key;
    const pose = this.toSolve(out);
    if (this.rasterFaces) { this.face = this.expression(f, ctx); if (this.faces.has(this.face)) pose.slots = { ...pose.slots, face: this.face }; }
    return pose;
  }
}
