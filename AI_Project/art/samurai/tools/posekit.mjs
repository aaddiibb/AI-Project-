// Pose-authoring kit: write poses as ABSOLUTE limb angles (body frame) instead of raw joint rotations.
// Angle convention (same as the rig): 0 = hanging straight down, + = swung back (-x), - = swung forward (+x);
// so -90 = pointing straight forward, ±180 = straight up.
//   leg(side, thigh, kneeFlex, footPitch)  kneeFlex + = knee bends forward (shin swings back); footPitch + = heel up / toe down
//   arm(side, upper, elbowFlex)            elbowFlex - = forearm folds forward/up (natural elbow bend)
//   ikLeg(side, fx, lift, drop, pitch)     foot target: ankle fx units forward of the hip midline, lifted `lift` above its
//                                          rest height, with the pelvis lowered by `drop` -> leg() rotations
//   reach(pose, spec)                      numeric IK: rotates the given joints so a point on a hand lands on a target point
//                                          (and optionally aligns the hand's grip axis with the target's axis)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve, ap } from '../../shinobi/rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rig = JSON.parse(readFileSync(join(ROOT, 'rig.json'), 'utf8'));
const byId = Object.fromEntries(rig.parts.map((p) => [p.id, p]));
const P = Object.fromEntries(rig.parts.map((p) => [p.id, p.pivot]));
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const r1 = (v) => Math.round(v * 10) / 10;

/** direction of the bone a -> b, measured from straight down (+ = toward -x) */
const restAng = (a, b) => deg(Math.atan2(-(P[b].x - P[a].x), P[b].y - P[a].y));
export const REST = {
  near: { thigh: restAng('thigh_near', 'shin_boot_near'), shin: restAng('shin_boot_near', 'foot_near'), upper: restAng('upper_arm_near', 'forearm_near'), fore: restAng('forearm_near', 'hand_near_open') },
  far: { thigh: restAng('thigh_far', 'shin_boot_far'), shin: restAng('shin_boot_far', 'foot_far'), upper: restAng('upper_arm_far', 'forearm_far'), fore: restAng('forearm_far', 'hand_far_open') },
};
const K = (side) => (side === 'near'
  ? { t: 'thigh_near', s: 'shin_boot_near', f: 'foot_near', u: 'upper_arm_near', fa: 'forearm_near' }
  : { t: 'thigh_far', s: 'shin_boot_far', f: 'foot_far', u: 'upper_arm_far', fa: 'forearm_far' });

export function leg(side, thigh, flex = 0, pitch = 0) {
  const r = REST[side], k = K(side);
  const rt = thigh - r.thigh, rs = thigh + flex - r.shin - rt, rf = pitch - rt - rs;
  return { [k.t]: r1(rt), [k.s]: r1(rs), [k.f]: r1(rf) };
}

export function arm(side, upper, flex = 0) {
  const r = REST[side], k = K(side);
  const ru = upper - r.upper, rf = upper + flex - r.fore - ru;
  return { [k.u]: r1(ru), [k.fa]: r1(rf) };
}

// ---- two-bone IK for grounded legs (pelvis unrotated)
const HIP = { near: P.thigh_near, far: P.thigh_far }, KNEE = { near: P.shin_boot_near, far: P.shin_boot_far }, ANKLE = { near: P.foot_near, far: P.foot_far };
export const LEN = Object.fromEntries(['near', 'far'].map((s) => [s, [Math.hypot(KNEE[s].x - HIP[s].x, KNEE[s].y - HIP[s].y), Math.hypot(ANKLE[s].x - KNEE[s].x, ANKLE[s].y - KNEE[s].y)]]));
export const HIP_MID_X = (HIP.near.x + HIP.far.x) / 2;

export function ikAngles(side, fx, lift = 0, drop = 0) {
  const [L1, L2] = LEN[side];
  const ax = HIP_MID_X + fx - HIP[side].x, ay = ANKLE[side].y - HIP[side].y - lift - drop;
  const dist = Math.hypot(ax, ay);
  const d = Math.min(L1 + L2 - 0.5, Math.max(Math.abs(L1 - L2) + 1, dist));
  const phi = deg(Math.atan2(-ax, ay));
  const alpha = deg(Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const t1 = phi - alpha; // knee leads forward
  const kx = HIP[side].x - L1 * Math.sin(rad(t1)), ky = HIP[side].y + L1 * Math.cos(rad(t1));
  const tx = HIP[side].x + (ax * d) / dist, ty = HIP[side].y + (ay * d) / dist;
  const t2 = deg(Math.atan2(-(tx - kx), ty - ky));
  return [t1, t2 - t1];
}
export function ikLeg(side, fx, lift = 0, drop = 0, pitch = 0) {
  return leg(side, ...ikAngles(side, fx, lift, drop), pitch);
}

/** body chain: waist / torso / neck / head rotations (+ = lean or nod forward) */
export const body = (waist = 0, torso = 0, neck = 0, head = 0) => ({ waist, torso_upper: torso, neck, head_base: head });

/** Points on the body that can touch the floor: [partId, x, y] in master coords of that part. */
export const PTS = {
  knee_near: ['shin_boot_near', 516, 965], knee_far: ['shin_boot_far', 594, 962],
  heel_far: ['foot_far', 545, 1300], toe_far: ['foot_far', 709, 1300],
  heel_near: ['foot_near', 430, 1300], toe_near: ['foot_near', 594, 1300],
  heel_near_side: ['foot_near_side', 430, 1300], toe_near_side: ['foot_near_side', 594, 1300],
  palm_near: ['hand_near_open', 566, 760], palm_far: ['hand_far_open', 640, 640],
  head_back: ['head_base', 462, 200], hair_tie: ['hair_front', 446, 262],
};
/** Plant a pose on chosen contact points instead of the soles (ground:false, root.y set so the lowest of `names` touches the floor). */
export function settle(pose, names) {
  const sol = solve(rig, { ...pose, ground: false });
  const y = (n) => { const [id, x, yy] = PTS[n]; return sol.W[id] ? ap(sol.W[id], x, yy)[1] : -Infinity; };
  const low = Math.max(...names.map(y));
  return { ...pose, ground: false, root: { x: pose.root?.x || 0, y: (pose.root?.y || 0) + rig.groundY - low } };
}

// ---------------------------------------------------------------- numeric reach (hands onto hilt / saya)
const worldAngle = (W) => deg(Math.atan2(W[1], W[0])); // rotation part of a matrix, as an angle
/**
 * spec: { hand: partId (a slot option, e.g. 'hand_far_grip_sword'), point: [x,y] on the hand (master coords),
 *         target: [partId, x, y] or a function(sol) -> [x,y], joints: [ids], axis?: { hand: deg (master), target: [partId, deg] },
 *         limits?: { id: [lo, hi] } }
 * Returns the pose with the joints' rotations replaced. Coordinate descent with shrinking steps (the rig is tiny, this is fast).
 */
export function reach(pose, spec) {
  const p = { ...pose, rot: { ...(pose.rot || {}) } };
  const tgt = (sol) => (typeof spec.target === 'function' ? spec.target(sol) : ap(sol.W[spec.target[0]], spec.target[1], spec.target[2]));
  const measure = (rot) => {
    const sol = solve(rig, { ...p, rot }, { ground: false });
    const W = sol.W[spec.hand];
    const a = ap(W, spec.point[0], spec.point[1]), b = tgt(sol);
    let ang = 0;
    if (spec.axis) {
      const ha = worldAngle(W) + spec.axis.hand;
      const ta = worldAngle(sol.W[spec.axis.target[0]]) + spec.axis.target[1];
      ang = ((ha - ta + 540) % 360) - 180;
    }
    let lim = 0;
    for (const [id, [lo, hi]] of Object.entries(spec.limits || {})) {
      const v = rot[id] || 0;
      if (v < lo) lim += 40 * (lo - v) ** 2;
      if (v > hi) lim += 40 * (v - hi) ** 2;
    }
    return { d2: (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2, ang, lim };
  };
  const descend = (w) => {
    const cost = (rot) => { const m = measure(rot); return (w ? 30 : 1) * m.d2 + w * m.ang * m.ang + m.lim; };
    let best = cost(p.rot);
    for (let step = 30; step > 0.05; step *= 0.6) {
      let improved = true;
      for (let it = 0; improved && it < 80; it++) {
        improved = false;
        for (const j of spec.joints) for (const s of [step, -step]) {
          const rot = { ...p.rot, [j]: (p.rot[j] || 0) + s };
          const c = cost(rot);
          if (c < best - 1e-9) { best = c; p.rot = rot; improved = true; }
        }
      }
    }
  };
  // phase 1: get the hand there (several starts for the elbow, keep the best); phase 2: also align the grip axis
  const start = { ...p.rot };
  let bestRot = null, bestD = Infinity;
  const w = spec.axis ? spec.axis.weight ?? 1 : 0;
  for (const sh of [0, -40, 40, -80]) for (const elbow of [0, -40, -80, -120]) {
    p.rot = { ...start, [spec.joints[0]]: (start[spec.joints[0]] || 0) + sh, [spec.joints[1]]: (start[spec.joints[1]] || 0) + elbow };
    descend(0);
    if (w) descend(w);
    const m = measure(p.rot);
    const c = 30 * m.d2 + w * m.ang * m.ang + m.lim;
    if (c < bestD) { bestD = c; bestRot = p.rot; }
  }
  p.rot = bestRot;
  for (const j of spec.joints) p.rot[j] = r1(p.rot[j] || 0);
  const m = measure(p.rot);
  p._reachErr = Math.sqrt(m.d2);
  p._reachAng = Math.abs(m.ang);
  return p;
}

const GRIP = (id) => [byId[id].grip.x, byId[id].grip.y];
const SWORD = rig.attachments.sword;
const FAR_ARM = ['upper_arm_far', 'forearm_far', 'hand_far_open'];
const NEAR_ARM = ['upper_arm_near', 'forearm_near', 'hand_near_open'];

/** far (left) hand onto the pommel end of the drawn sword (two-handed grip): sword must be attached to the near hand */
export const farOnHilt = (pose, limits) => reach({ ...pose, slots: { ...(pose.slots || {}), hand_far: 'hand_far_grip_sword' } }, {
  hand: 'hand_far_grip_sword', point: GRIP('hand_far_grip_sword'), target: ['sword', SWORD.secondGrip.x, SWORD.secondGrip.y],
  joints: FAR_ARM, axis: { hand: byId.hand_far_grip_sword.grip.axisDeg, target: ['sword', byId.sword.grip.axisDeg] }, limits: { hand_far_open: [-75, 75], ...limits },
});
/** far (left) hand gripping the saya just behind the tsuba (thumb on the guard) */
export const farOnSaya = (pose, s = 30, limits) => {
  const sp = rig.anchors.saya_mouth, g = rig.anchors.sword_guard;
  const ux = (sp.x - g.x) / 8, uy = (sp.y - g.y) / 8; // unit-ish saya axis from guard to mouth (anchor is 8 units along)
  return reach({ ...pose, slots: { ...(pose.slots || {}), hand_far: 'hand_far_grip_saya' } }, {
    hand: 'hand_far_grip_saya', point: GRIP('hand_far_grip_saya'), target: ['saya', g.x + ux * s, g.y + uy * s],
    joints: FAR_ARM, axis: { hand: byId.hand_far_grip_saya.grip.axisDeg, target: ['saya', byId.sword.grip.axisDeg + 180] }, limits: { hand_far_open: [-75, 75], ...limits },
  });
};
/** near (right) hand on the sheathed hilt (iaido ready): sword stays at rest in the saya */
export const nearOnSheathedHilt = (pose, limits) => reach({ ...pose, slots: { ...(pose.slots || {}), hand_near: 'hand_near_grip_sword' } }, {
  hand: 'hand_near_grip_sword', point: GRIP('hand_near_grip_sword'), target: ['sword', byId.sword.grip.x, byId.sword.grip.y],
  joints: NEAR_ARM, axis: { hand: byId.hand_near_grip_sword.grip.axisDeg, target: ['sword', byId.sword.grip.axisDeg + 180] }, limits: { hand_near_open: [-75, 75], ...limits },
});

export const FISTS = { hand_near: 'hand_near_fist', hand_far: 'hand_far_fist' };
export { rig };
