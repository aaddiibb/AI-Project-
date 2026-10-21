// Shinobi rig runtime: pose solver shared by preview.html (browser) and tools/pose_render.mjs (node).
// Every part's world matrix maps MASTER coordinates -> world (master units, pre-stage transform).
// Matrices are [a,b,c,d,e,f]: (x,y) -> (a*x + c*y + e, b*x + d*y + f).

export const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
export const T = (x, y) => [1, 0, 0, 1, x, y];
export const R = (deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; };
export const about = (x, y, deg) => mul(mul(T(x, y), R(deg)), T(-x, -y));
export const ap = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];

// secondary-motion springs: hang = how strongly the bone counter-rotates to hang under gravity
export const SPRINGS = {
  pony_1: { hang: 0.35, k: 70, c: 8, g: 0.03 }, pony_2: { hang: 0.6, k: 60, c: 7, g: 0.04 },
  pony_3: { hang: 0.7, k: 55, c: 6, g: 0.05 }, pony_4: { hang: 0.8, k: 50, c: 6, g: 0.06 },
  sash_tail_1a: { hang: 0.6, k: 60, c: 7, g: 0.04 }, sash_tail_1b: { hang: 0.8, k: 50, c: 6, g: 0.05 },
  sash_tail_2a: { hang: 0.6, k: 60, c: 7, g: 0.04 }, sash_tail_2b: { hang: 0.8, k: 50, c: 6, g: 0.05 },
  strand_near: { hang: 0.5, k: 90, c: 9, g: 0.03 }, strand_far: { hang: 0.5, k: 90, c: 9, g: 0.03 },
  skirt_front_panel: { hang: 0.3, k: 110, c: 11, g: 0.02 }, skirt_back_panel: { hang: 0.3, k: 100, c: 10, g: 0.025 },
};
const WIND = { pony_3: 1.2, pony_4: 2, sash_tail_1b: 1.6, sash_tail_2b: 2.2, sash_tail_1a: 0.8, sash_tail_2a: 1, strand_near: 1, strand_far: 1.2 };

// Data-driven override (other characters): rig.springs = { id: { hang, k, c, g, wind? } }, rig.stress = { id: [min, max] }.
// A rig without them uses the Shinobi tables below, so the Shinobi's behaviour is unchanged.
export const springsOf = (rig) => rig.springs || SPRINGS;
export const stressOf = (rig) => rig.stress || STRESS;
const windOf = (rig, id) => (rig.springs ? rig.springs[id]?.wind ?? 0.5 : WIND[id] || 0.5);

// joint stress ranges [min, max] (degrees)
export const STRESS = {
  upper_arm_near: [-150, 40], forearm_near: [-130, 0], upper_arm_far: [-150, 40], forearm_far: [-130, 0],
  thigh_near: [-80, 40], shin_boot_near: [0, 110], foot_near: [-25, 25],
  thigh_far: [-80, 40], shin_boot_far: [0, 110], foot_far: [-25, 25],
  waist: [-10, 12], torso_upper: [-18, 22], neck: [-12, 12], head_base: [-18, 18],
  hand_near_open: [-30, 30], hand_far_open: [-30, 30],
};

/** parts ordered parents-first */
export function topoOrder(rig) {
  const byId = Object.fromEntries(rig.parts.map((p) => [p.id, p]));
  const order = [], seen = new Set();
  const visit = (p) => { if (seen.has(p.id)) return; if (p.parent) visit(byId[p.parent]); seen.add(p.id); order.push(p); };
  rig.parts.forEach(visit);
  return { byId, order };
}

/**
 * Solve a pose. opts: { time, dt, idle, stress, springs (state object; omit to disable springs), ground (default true) }
 * returns { W: {id: matrix}, visible: {id: bool}, zOverride: {id: z} }
 */
export function solve(rig, pose, opts = {}) {
  return solveCore(rig, pose, opts, groundOffset(rig, pose, opts));
}

/**
 * Ground lock: the root y shift that puts the lowest sole contact on its rest ground line
 * (0 when the pose or opts disable grounding). pose.groundBy: [partIds] grounds on those parts instead (lying / KO).
 */
export function groundOffset(rig, pose, opts = {}) {
  rig._topo ||= topoOrder(rig);
  let groundDy = 0;
  if (opts.ground !== false && pose.ground !== false && rig.contacts) {
    const flat = solveCore(rig, pose, { ...opts, idle: false, springs: null }, 0);
    let worst = -Infinity;
    if (pose.groundBy) {
      const byId = rig._topo.byId;
      for (const id of pose.groundBy) {
        const p = byId[id], W = flat.W[id];
        if (!p || !W) continue;
        // bbox shrunk toward its centre: a rotated bbox corner sits well outside the actual shape
        const { w, h } = p.size, x = p.offset.x + w * 0.2, y = p.offset.y + h * 0.2;
        for (const [cx, cy] of [[x, y], [x + w * 0.6, y], [x, y + h * 0.6], [x + w * 0.6, y + h * 0.6]]) worst = Math.max(worst, ap(W, cx, cy)[1] - rig.groundY);
      }
    } else {
      for (const [id, pts] of Object.entries(rig.contacts)) {
        const W = flat.W[id];
        if (!W || !flat.visible[id]) continue;
        for (const [x, y] of pts) worst = Math.max(worst, ap(W, x, y)[1] - y);
      }
    }
    if (Number.isFinite(worst)) groundDy = -worst;
  }
  return groundDy;
}

function solveCore(rig, pose, opts, groundDy) {
  const { byId, order } = rig._topo || (rig._topo = topoOrder(rig));
  const { time = 0, dt = 0, idle = false, stress = false, springs = null } = opts;
  const breathe = Math.sin(time * 2.3);
  const rootOff = { x: pose.root?.x || 0, y: (pose.root?.y || 0) + groundDy + (idle ? 2.2 * breathe : 0) };
  const extra = {};
  if (idle) {
    Object.assign(extra, { torso_upper: 0.9 * breathe, waist: 0.4 * breathe, neck: -0.5 * breathe, head_base: -0.5 * breathe,
      upper_arm_near: 1.4 * breathe, upper_arm_far: 1.2 * breathe, forearm_near: -breathe, forearm_far: -0.8 * breathe });
  }
  if (stress) for (const [id, [lo, hi]] of Object.entries(stressOf(rig))) {
    const u = 0.5 + 0.5 * Math.sin(time * 1.3 + id.length * 0.7);
    extra[id] = (extra[id] || 0) + lo + (hi - lo) * u;
  }
  const slotSel = { ...rig.defaultPose.slots, ...(pose.slots || {}) };
  const attach = { ...rig.defaultPose.attach, ...(pose.attach || {}) };
  const W = {}, ang = {}, visible = {}, zOverride = {};
  for (const p of order) {
    let rot = (pose.rot?.[p.id] || 0) + (extra[p.id] || 0);
    // slot variants share one rotation key (all near hands use hand_near_open, both near feet use foot_near)
    if (p.rotKey) rot += (pose.rot?.[p.rotKey] || 0) + (extra[p.rotKey] || 0);
    const parentW = p.parent ? W[p.parent] : T(rootOff.x, rootOff.y);
    const parentAng = p.parent ? ang[p.parent] : 0;
    const sp = springsOf(rig)[p.id];
    if (sp && springs) {
      const st = springs[p.id] ||= { th: 0, om: 0, pos: null, vel: [0, 0] };
      const pos = ap(parentW, p.pivot.x, p.pivot.y);
      let ax = 0;
      if (st.pos && dt > 0) {
        const v = [(pos[0] - st.pos[0]) / dt, (pos[1] - st.pos[1]) / dt];
        ax = Math.max(-25000, Math.min(25000, (v[0] - st.vel[0]) / dt));
        st.vel = v;
      }
      st.pos = pos;
      const rel = ((parentAng + rot + 540) % 360) - 180; // wrapped: a somersault must not wind the hair up by 360 degrees
      const target = -rel * sp.hang * (pose.springHang ?? 1) + (idle ? windOf(rig, p.id) * Math.sin(time * 1.7 + p.zIndex) : 0);
      if (dt > 0) {
        const acc = -sp.k * (st.th - target) - sp.c * st.om + sp.g * ax;
        st.om += acc * dt;
        st.th = Math.max(-70, Math.min(70, st.th + st.om * dt));
      } else st.th = target; // static solve: settle at the hanging target
      rot += st.th;
    }
    W[p.id] = mul(parentW, about(p.pivot.x, p.pivot.y, rot));
    ang[p.id] = parentAng + rot;
    visible[p.id] = p.slot ? slotSel[p.slot] === p.id : !p.hidden;
  }
  // held items: grip point onto the hand grip, grip axis onto the hand axis
  for (const [item, target] of Object.entries(attach)) {
    const it = byId[item];
    if (!it) continue;
    if (!target) { visible[item] = false; continue; }
    if (target === rig.attachments?.[item]?.rest) { visible[item] = true; continue; }
    const hand = byId[target];
    if (!hand || !visible[target]) continue;
    const M = mul(mul(T(hand.grip.x, hand.grip.y), R(hand.grip.axisDeg - it.grip.axisDeg + (pose.attachRot?.[item] || 0))), T(-it.grip.x, -it.grip.y));
    W[item] = mul(W[target], M);
    visible[item] = true;
    zOverride[item] = hand.zIndex - 0.5;
  }
  return { W, visible, zOverride };
}

/** world position (master units) of a named anchor from rig.anchors, or null if its part is hidden */
export function anchor(rig, sol, name) {
  const a = rig.anchors?.[name];
  if (!a || !sol.visible[a.part] || !sol.W[a.part]) return null;
  return ap(sol.W[a.part], a.x, a.y);
}

/** blend two poses (rotations + root lerp; slots/attachments switch at t >= 0.5) */
export function blendPoses(a = {}, b = {}, t = 0.5) {
  const ids = new Set([...Object.keys(a.rot || {}), ...Object.keys(b.rot || {})]);
  const rot = {};
  for (const id of ids) rot[id] = (a.rot?.[id] || 0) * (1 - t) + (b.rot?.[id] || 0) * t;
  const pick = t < 0.5 ? a : b;
  return {
    ...pick,
    root: { x: (a.root?.x || 0) * (1 - t) + (b.root?.x || 0) * t, y: (a.root?.y || 0) * (1 - t) + (b.root?.y || 0) * t },
    rot,
    attachRot: Object.fromEntries([...new Set([...Object.keys(a.attachRot || {}), ...Object.keys(b.attachRot || {})])].map((k) => [k, (a.attachRot?.[k] || 0) * (1 - t) + (b.attachRot?.[k] || 0) * t])),
  };
}
