// Pose-authoring kit: write poses as ABSOLUTE limb angles (body frame) instead of raw joint rotations.
// Angle convention (same as the rig): 0 = hanging straight down, + = swung back (-x), - = swung forward (+x);
// so -90 = pointing straight forward, ±180 = straight up.
//   leg(side, thigh, kneeFlex, footPitch)  kneeFlex + = knee bends forward (shin swings back); footPitch + = heel up / toe down
//   arm(side, upper, elbowFlex)            elbowFlex - = forearm folds forward/up (natural elbow bend)
//   ikLeg(side, fx, lift, drop, pitch)     foot target: ankle fx units forward of the hip midline, lifted `lift` above its
//                                          rest height, with the pelvis lowered by `drop` -> leg() rotations
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve, ap } from '../rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rig = JSON.parse(readFileSync(join(ROOT, 'rig.json'), 'utf8'));
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
const LEN = Object.fromEntries(['near', 'far'].map((s) => [s, [Math.hypot(KNEE[s].x - HIP[s].x, KNEE[s].y - HIP[s].y), Math.hypot(ANKLE[s].x - KNEE[s].x, ANKLE[s].y - KNEE[s].y)]]));
export const HIP_MID_X = (HIP.near.x + HIP.far.x) / 2;

export function ikLeg(side, fx, lift = 0, drop = 0, pitch = 0) {
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
  return leg(side, t1, t2 - t1, pitch);
}

/** body chain: waist / torso / neck / head rotations (+ = lean or nod forward) */
export const body = (waist = 0, torso = 0, neck = 0, head = 0) => ({ waist, torso_upper: torso, neck, head_base: head });

/** Points on the body that can touch the floor: [partId, x, y] in master coords of that part. */
export const PTS = {
  knee_near: ['shin_boot_near', 426, 1016], knee_far: ['shin_boot_far', 595, 1018],
  heel_far: ['foot_far', 545, 1296], toe_far: ['foot_far', 684, 1296],
  sole_near: ['foot_near', 340, 1318], heel_near_side: ['foot_near_side', 312, 1314], toe_near_side: ['foot_near_side', 452, 1316],
  palm_near: ['hand_near_open', 400, 760], palm_far: ['hand_far_open', 650, 760],
};
/**
 * Plant a pose on chosen contact points instead of the soles: returns the pose with ground:false and root.y set so
 * the lowest of `names` touches the floor (kneeling, sweeps, hand plants). Also reports anything below the floor.
 */
export function settle(pose, names) {
  const sol = solve(rig, { ...pose, ground: false });
  const y = (n) => { const [id, x, yy] = PTS[n]; return sol.W[id] ? ap(sol.W[id], x, yy)[1] : -Infinity; };
  const low = Math.max(...names.map(y));
  return { ...pose, ground: false, root: { x: pose.root?.x || 0, y: (pose.root?.y || 0) + rig.groundY - low } };
}

export const FISTS = { hand_near: 'hand_near_fist', hand_far: 'hand_far_fist' };
export { rig };
