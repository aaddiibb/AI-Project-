// Walk cycle generator. Keys are authored as ABSOLUTE leg angles (from vertical, + = back), knee flex,
// and foot pitch (+ = heel up); they are converted to rig rotations using each bone's rest angle,
// so the near leg's tilted rest pose doesn't skew the gait. Root motion per key is solved so the
// planted foot stays fixed on the ground between keys (no foot sliding).
//   node tools/walk_gen.mjs   -> writes walk_1..walk_8 into poses.json, walk_forward / walk_back into animations.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve, ap } from '../rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rig = JSON.parse(readFileSync(join(ROOT, 'rig.json'), 'utf8'));
const poses = JSON.parse(readFileSync(join(ROOT, 'poses.json'), 'utf8'));
const anims = JSON.parse(readFileSync(join(ROOT, 'animations.json'), 'utf8'));
const P = Object.fromEntries(rig.parts.map((p) => [p.id, p.pivot]));

// rest angle of a bone = direction from its pivot to its child's pivot (degrees from vertical, + = toward -x)
const restAng = (a, b) => (Math.atan2(-(P[b].x - P[a].x), P[b].y - P[a].y) * 180) / Math.PI;
const REST = {
  near: { thigh: restAng('thigh_near', 'shin_boot_near'), shin: restAng('shin_boot_near', 'foot_near') },
  far: { thigh: restAng('thigh_far', 'shin_boot_far'), shin: restAng('shin_boot_far', 'foot_far') },
};

/** absolute leg description -> rig rotations */
function leg(side, thigh, flex, foot) {
  const r = REST[side];
  const rt = thigh - r.thigh;
  const rs = thigh + flex - r.shin - rt;
  const rf = foot - rt - rs;
  const k = side === 'near' ? ['thigh_near', 'shin_boot_near', 'foot_near'] : ['thigh_far', 'shin_boot_far', 'foot_far'];
  return { [k[0]]: +rt.toFixed(1), [k[1]]: +rs.toFixed(1), [k[2]]: +rf.toFixed(1) };
}

// ---- two-bone IK: foot targets -> absolute thigh angle + knee flex (knee bends forward, toward +x)
const HIP = { near: P.thigh_near, far: P.thigh_far };
const KNEE = { near: P.shin_boot_near, far: P.shin_boot_far };
const ANKLE = { near: P.foot_near, far: P.foot_far };
const LEN = Object.fromEntries(['near', 'far'].map((s) => [s, [Math.hypot(KNEE[s].x - HIP[s].x, KNEE[s].y - HIP[s].y), Math.hypot(ANKLE[s].x - KNEE[s].x, ANKLE[s].y - KNEE[s].y)]]));
const CENTER_X = (HIP.near.x + HIP.far.x) / 2;
const deg = (r) => (r * 180) / Math.PI;
/** fx: ankle x relative to body centre (+ forward), lift: ankle height above its rest height, drop: pelvis drop */
function ik(side, fx, lift, drop) {
  const [L1, L2] = LEN[side];
  const ax = CENTER_X + fx - HIP[side].x;
  const ay = ANKLE[side].y - HIP[side].y - lift - drop;
  const d = Math.min(L1 + L2 - 0.5, Math.max(Math.abs(L1 - L2) + 1, Math.hypot(ax, ay)));
  const phi = deg(Math.atan2(-ax, ay)); // hip->ankle direction (+ = back)
  const alpha = deg(Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const t1 = phi - alpha; // rotate the thigh forward so the knee leads
  const kx = HIP[side].x - L1 * Math.sin((t1 * Math.PI) / 180), ky = HIP[side].y + L1 * Math.cos((t1 * Math.PI) / 180);
  const tx = HIP[side].x + ax * (d / Math.hypot(ax, ay)), ty = HIP[side].y + ay * (d / Math.hypot(ax, ay));
  const t2 = deg(Math.atan2(-(tx - kx), ty - ky));
  return [t1, t2 - t1];
}

// half cycle with the "lead" leg landing in front. foot: [fx, lift, pitch(+ = heel up)]
const HALF = [
  { name: 'contact', drop: 14, lead: [118, 0, -14], trail: [-112, 6, 24], arm: 1 },
  { name: 'down', drop: 30, lead: [66, 0, 0], trail: [-150, 36, 42], arm: 0.7 },
  { name: 'pass', drop: 6, lead: [0, 0, 0], trail: [-18, 74, 20], arm: 0.1 },
  { name: 'up', drop: 0, lead: [-62, 8, 14], trail: [78, 44, -6], arm: -0.6 },
];
const body = { waist: 1, torso_upper: 4, neck: -1, head_base: -3 };
const legKey = (side, [fx, lift, pitch], drop) => leg(side, ...ik(side, fx, lift, drop), pitch);
const keys = [];
for (const [lead, trail, armSign] of [['far', 'near', 1], ['near', 'far', -1]]) {
  for (const h of HALF) {
    const s = h.arm * armSign; // near arm swings forward when the far leg leads
    keys.push({
      rot: {
        ...legKey(lead, h.lead, h.drop), ...legKey(trail, h.trail, h.drop), ...body,
        waist: body.waist + (h.name === 'down' ? 1 : 0),
        upper_arm_near: +(-16 * s).toFixed(1), forearm_near: +(-14 - 8 * Math.max(0, s)).toFixed(1),
        upper_arm_far: +(16 * s).toFixed(1), forearm_far: +(-14 - 8 * Math.max(0, -s)).toFixed(1),
      },
      slots: { hand_near: 'hand_near_open', hand_far: 'hand_far_open', foot_near: 'foot_near_side' },
      stance: lead,
    });
  }
}

// planted-foot x for a key (middle sole contact of the stance foot)
const footId = (side) => (side === 'near' ? 'foot_near_side' : 'foot_far');
function footX(pose, side) {
  const sol = solve(rig, pose);
  const pts = rig.contacts[footId(side)];
  const [x, y] = pts[Math.floor(pts.length / 2)];
  return ap(sol.W[footId(side)], x, y)[0];
}
const steps = keys.map((k, i) => {
  const next = keys[(i + 1) % keys.length];
  return +(footX(k, k.stance) - footX(next, k.stance)).toFixed(1); // the foot planted during this transition stays put
});

keys.forEach((k, i) => {
  const { stance, ...pose } = k;
  poses[`walk_${i + 1}`] = pose;
});
const fwd = keys.map((_, i) => ({ pose: `walk_${i + 1}`, hold: 6, step: steps[(i - 1 + keys.length) % keys.length] }));
const back = keys.map((_, i) => keys.length - 1 - i).map((i) => ({ pose: `walk_${i + 1}`, hold: 7, step: -steps[i] }));
anims.walk_forward = { loop: true, frames: fwd };
anims.walk_back = { loop: true, frames: back };
writeFileSync(join(ROOT, 'poses.json'), JSON.stringify(poses, null, 1));
writeFileSync(join(ROOT, 'animations.json'), JSON.stringify(anims, null, 1));
console.log('leg lengths', JSON.stringify(LEN));
console.log('steps', steps.join(', '), '| per cycle', steps.reduce((a, b) => a + b, 0).toFixed(0));
