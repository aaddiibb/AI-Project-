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
    switch (s) {
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
      case 'hitstun': return [f.hitCrouch ? 'chit' : 'hit', 'hit', this.P(f.hitCrouch ? 'crouch_hit' : 'hit')];
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
  step(f) {
    const [key, family, target, fadeOverride] = this.clip(f);
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
    return this.toSolve(out);
  }
}
