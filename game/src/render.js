// Rig renderer: turns simulator state into posed puppets (PixiJS), plus the camera.
// The pose solver (rig_runtime.js) is SHARED by every character and with the art pipelines' previews.
// Per-fighter rigs (prompt 05 §4.1): each puppet uses its character's rig (P1) or rig_p2 (P2), and its own merged poses.
import { mul, T, R, ap, solve, anchor, blendPoses } from '../../art/shinobi/rig_runtime.js';
import { Animator } from './animator.js';

const ROOT = '../';            // the game is served from <project>/game/, character paths are relative to <project>/
const CENTER = 520;            // rig centre line in master units
const GROUND = 1300;
export const VIEW_W = 1920, VIEW_H = 1080;
/** screens that are not 16:9: the world view extends `ex` px past each side of the 1920x1080 frame (wide phones,
 *  ultrawide) and `ey` px above and below it (tablets, 16:10). The menus stay centred, the fight HUD hugs the top. */
export const VIEW = { ex: 0, ey: 0 };
/** fit the 1920x1080 frame into a w x h window: its scale and offset, and the extra view around it (sets VIEW) */
export function fitView(w, h) {
  const s = Math.min(w / VIEW_W, h / VIEW_H);
  VIEW.ex = Math.max(0, Math.min(340, (w / s - VIEW_W) / 2));
  VIEW.ey = Math.max(0, Math.min(220, (h / s - VIEW_H) / 2));
  return { s, x: (w - VIEW_W * s) / 2, y: (h - VIEW_H * s) / 2 };
}

const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

/** all pose files of a character, merged in order (Shinobi: poses.json + poses_extra.json) */
export function loadPoses(char) {
  return once('poses:' + char.id, async () => {
    const parts = await Promise.all(char.poseFiles.map(async (u) => (await fetch(ROOT + u)).json()));
    return Object.assign({}, ...parts);
  });
}
/** a rig file (e.g. art/samurai/rig_p2.json) + one texture per part; part files are relative to the rig's folder */
export function loadRig(PIXI, path) {
  return once('rig:' + path, async () => {
    const base = ROOT + path.slice(0, path.lastIndexOf('/') + 1);
    const rig = await (await fetch(ROOT + path)).json();
    const textures = {};
    await Promise.all(rig.parts.map(async (p) => { textures[p.id] = await PIXI.Assets.load({ src: base + p.file, data: { resolution: 2 } }); }));
    return { rig, textures };
  });
}
/** legacy helper (Shinobi poses) */
export async function loadData() { const { SHINOBI } = await import('./characters/shinobi.js'); return { poses: await loadPoses(SHINOBI) }; }

export class Puppet {
  constructor(PIXI, rig, textures, container, char, poses) {
    this.rig = rig; this.PIXI = PIXI; this.char = char; this.poses = poses;
    this.container = new PIXI.Container();
    this.container.sortableChildren = true;
    container.addChild(this.container);
    this.sprites = {};
    for (const p of rig.parts) {
      const s = new PIXI.Sprite(textures[p.id]);
      s.zIndex = p.zIndex;
      this.sprites[p.id] = s; this.container.addChild(s);
    }
    this.springs = {}; this.lastFacing = 1; this.sol = null; this.solveX = 0; this.solveFacing = 1;
    this.tint = 0xffffff; this.anim = null;
  }

  /** advance animation + physics (springs) every sim frame; only restyle the sprites when `redraw` (optional stepped "on 2s" look) */
  destroy() { this.container.destroy({ children: true }); }

  /** ctx (optional): { opp, freeze } for the facial expression (see Animator.expression) */
  update(f, time, dt, redraw, extraX = 0, ctx) {
    if (f.facing !== this.lastFacing) { for (const s of Object.values(this.springs)) { s.pos = null; s.vel = [0, 0]; } this.lastFacing = f.facing; }
    this.anim ||= new Animator(this.rig, this.poses, this.char);
    const pose = this.anim.step(f, ctx); // tweened keys + cross-faded state changes (see animator.js) + expression
    pose.root = { x: pose.root.x + f.facing * (f.x + extraX), y: pose.root.y };
    const idleLike = f.state === 'idle' || f.state === 'crouch' || f.state === 'guard';
    const sol = solve(this.rig, pose, { time, dt, idle: idleLike, springs: this.springs });
    if (redraw || !this.sol) { this.sol = sol; this.solveX = f.x + extraX; this.solveFacing = f.facing; }
    this.place(f, extraX);
  }

  place(f, extraX = 0) {
    const sol = this.sol, face = this.solveFacing;
    const dx = f.x + extraX - this.solveX;
    const F = [face, 0, 0, 1, -face * CENTER + dx, -f.h];
    const { PIXI } = this;
    for (const p of this.rig.parts) {
      const s = this.sprites[p.id];
      const vis = !!sol.visible[p.id];
      s.visible = vis;
      if (!vis) continue;
      s.tint = this.tint;
      s.zIndex = sol.zOverride[p.id] ?? p.zIndex;
      const m = mul(F, mul(sol.W[p.id], T(p.offset.x, p.offset.y)));
      const kx = p.size.w / s.texture.width, ky = p.size.h / s.texture.height;
      s.setFromMatrix(new PIXI.Matrix(m[0] * kx, m[1] * kx, m[2] * ky, m[3] * ky, m[4], m[5]));
    }
  }

  /** blade-trail polygon (world coords) for a swing, computed from the same solver */
  arcPoints(spec, f, poses = this.poses) {
    const outer = [], inner = [];
    const base = (p, t) => ({ ...p, root: { x: (p.root?.x || 0) + f.facing * f.x, y: p.root?.y || 0 } });
    for (let i = 0; i <= spec.samples; i++) {
      const t = i / spec.samples;
      const sol = solve(this.rig, base(blendPoses(poses[spec.from], poses[spec.to], t), t));
      const a = anchor(this.rig, sol, spec.anchor), b = anchor(this.rig, sol, spec.inner);
      if (!a || !b) continue;
      const k = 0.45 + 0.35 * Math.sin(Math.PI * t);
      const W = (q) => [f.facing * (q[0] - CENTER), q[1] - f.h];
      outer.push(W(a)); inner.push(W([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]));
    }
    return { outer, inner };
  }

  /** world position of a rig anchor right now (for effects), or null */
  anchorWorld(name, f) {
    if (!this.sol) return null;
    const a = anchor(this.rig, this.sol, name);
    return a ? [this.solveFacing * (a[0] - CENTER) + (f.x - this.solveX), a[1] - f.h] : null;
  }
}

export class Camera {
  constructor() { this.cx = 2600; this.w = 5200; }
  /** frame both fighters; returns the world container transform */
  update(a, b, snap = false) {
    const dist = Math.abs(a.x - b.x);
    const wide = 1 + (2 * VIEW.ex) / VIEW_W; // a wider screen sees w * wide: never past the world
    const maxW = Math.min(5200 / wide, (VIEW_W * 2850) / (940 + VIEW.ey)); // a taller one must not see above the sky art
    const targetW = Math.min(maxW, Math.max(3900, Math.min(5200, dist + 2300)));
    let targetCx = (a.x + b.x) / 2;
    targetCx = Math.max((targetW * wide) / 2, Math.min(5200 - (targetW * wide) / 2, targetCx));
    const k = snap ? 1 : 0.14;
    this.w += (targetW - this.w) * k;
    this.cx += (targetCx - this.cx) * k;
    const lim = (this.w * wide) / 2;
    this.cx = Math.max(lim, Math.min(5200 - lim, this.cx));
    const s = VIEW_W / this.w;
    return { s, tx: VIEW_W / 2 - this.cx * s, ty: 940 - GROUND * s, cx: this.cx, w: this.w };
  }
}
