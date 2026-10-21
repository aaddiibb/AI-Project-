// Authoring source for EVERY Samurai pose (contract 04 §1.3). Poses are written with posekit (absolute limb angles,
// leg IK, numeric hand reach) and written to poses.json; the walk cycle keys are generated here too.
//   node tools/author_poses.mjs          (then: node tools/render_extra.mjs <names> to review)
// Edit poses here, not in poses.json.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve, ap } from '../../shinobi/rig_runtime.js';
import { leg, arm, ikLeg, body, settle, reach, farOnHilt, farOnSaya, nearOnSheathedHilt, rig } from './posekit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const byId = Object.fromEntries(rig.parts.map((p) => [p.id, p]));
const deg = (r) => (r * 180) / Math.PI;

const INTENSE = { face: 'face_intense' }, HURT = { face: 'face_hurt' };
const DRAWN = { attach: { sword: 'hand_near_grip_sword' } };
const GRIPN = { hand_near: 'hand_near_grip_sword' };
const pose = (rot, more = {}) => ({ rot: Object.assign({}, ...rot), ...more });

/** rotate the whole body about the pelvis (+ = pitch forward) while keeping the legs' world angles */
function pitch(p, ang) {
  const rot = { ...p.rot, pelvis: (p.rot.pelvis || 0) + ang };
  for (const t of ['thigh_near', 'thigh_far']) rot[t] = +((rot[t] || 0) - ang).toFixed(1);
  return { ...p, rot };
}
/** drawn sword: set attachRot so the blade points at `angle` (deg, screen: 0 = forward, 90 = straight down, -90 = up) */
function blade(p, angle) {
  const sol = solve(rig, { ...p, attachRot: {} }, { ground: false });
  const W = sol.W.hand_near_grip_sword;
  const handAng = deg(Math.atan2(W[1], W[0])) + byId.hand_near_grip_sword.grip.axisDeg;
  const r = ((angle - handAng + 540) % 360) - 180;
  return { ...p, attachRot: { sword: +r.toFixed(1) } };
}
const clean = (p) => { const { _reachErr, _reachAng, ...q } = p; return q; };
const errs = {};
const track = (name, p) => { if (p._reachErr !== undefined) errs[name] = [Math.max(errs[name]?.[0] || 0, p._reachErr), Math.max(errs[name]?.[1] || 0, p._reachAng)]; return p; };
/** far hand on the saya (s = distance behind the tsuba) */
const saya = (name, p, s = 30) => track(name, farOnSaya(p, s));
const hilt2 = (name, p) => track(name, farOnHilt(p));
const sheathedGrip = (name, p) => track(name, nearOnSheathedHilt(p));

const P = {};

// ================================================================ IDLE (calm, planted, wide; left hand on the saya, right hand loose)
const stanceLegs = (drop) => [ikLeg('far', 96, 0, drop, 0), ikLeg('near', -104, 0, drop, 0)];
P.stance = saya('stance', pose([...stanceLegs(26), body(2, 3, -1, -2), arm('near', 5, -22)], { slots: { hand_near: 'hand_near_open' } }));
P.stance_b = saya('stance_b', pose([...stanceLegs(32), body(2, 5, -1, -3), arm('near', 7, -26)], { slots: { hand_near: 'hand_near_open' } }));

// ================================================================ WALK (8-key planted-foot cycle, heavy and level)
// half cycle with the lead leg landing in front. foot: [fx, lift, pitch(+ = heel up)]
const HALF = [
  { name: 'contact', drop: 18, lead: [100, 0, -12], trail: [-96, 4, 20], arm: 1 },
  { name: 'down', drop: 28, lead: [56, 0, 0], trail: [-128, 26, 34], arm: 0.6 },
  { name: 'pass', drop: 12, lead: [0, 0, 0], trail: [-14, 52, 14], arm: 0 },
  { name: 'up', drop: 8, lead: [-52, 4, 10], trail: [68, 30, -6], arm: -0.6 },
];
const walkKeys = [];
for (const [lead, trail, armSign] of [['far', 'near', 1], ['near', 'far', -1]]) {
  for (const h of HALF) {
    const s = h.arm * armSign; // near arm swings forward when the far leg leads (left hand stays on the saya)
    const k = pose([ikLeg(lead, h.lead[0], h.lead[1], h.drop, h.lead[2]), ikLeg(trail, h.trail[0], h.trail[1], h.drop, h.trail[2]), body(1, 3, -1, -2), arm('near', 4 - 12 * s, -20 - 6 * Math.max(0, s))], { slots: { hand_near: 'hand_near_open', foot_near: 'foot_near_side' } });
    walkKeys.push({ pose: k, stance: lead });
  }
}
walkKeys.forEach((k, i) => { P[`walk_${i + 1}`] = saya(`walk_${i + 1}`, k.pose); });

// ================================================================ DASH FORWARD (sheathed, hand on the hilt)
const ready = (name, p, s = 30) => saya(name, sheathedGrip(name, p), s);
P.dash_start = ready('dash_start', pose([ikLeg('far', 112, 0, 96, 0), ikLeg('near', -126, 0, 96, 0), body(8, 16, -4, -8)], { slots: { foot_near: 'foot_near_side' } }));
P.dash = ready('dash', pitch(pose([leg('far', -56, 64, 10), leg('near', 26, 34, 30), body(10, 16, -8, -16)], { slots: { foot_near: 'foot_near_side' } }), 16));
P.dash_end = ready('dash_end', pose([ikLeg('far', 196, 0, 92, -16), ikLeg('near', -96, 0, 92, 12), body(-4, -8, 2, 4)], { slots: { foot_near: 'foot_near_side' } }));

// ================================================================ DASH BACKWARD (grounded slide: heels dragging, no airborne key)
P.backdash_start = saya('backdash_start', pose([ikLeg('far', 120, 0, 70, 0), ikLeg('near', -96, 0, 70, 0), body(-2, -4, 1, 2), arm('near', -24, -40)], { slots: { hand_near: 'hand_near_open', foot_near: 'foot_near_side' } }));
P.backdash = saya('backdash', pose([ikLeg('far', 186, 0, 104, -18), ikLeg('near', -52, 0, 104, 6), body(-8, -14, 3, 6), arm('near', -46, -50)], { root: { x: -16, y: 0 }, slots: { hand_near: 'hand_near_open', foot_near: 'foot_near_side' } }));
P.backdash_end = saya('backdash_end', pose([ikLeg('far', 126, 0, 66, 0), ikLeg('near', -142, 0, 66, 0), body(3, 6, -2, -3), arm('near', -14, -32)], { slots: { hand_near: 'hand_near_open', foot_near: 'foot_near_side' } }));

// ================================================================ GUARD (forearms raised across chest and face, rooted; sword sheathed)
P.guard = pose([ikLeg('far', 128, 0, 66, 0), ikLeg('near', -138, 0, 66, 0), body(4, 9, -3, -8), arm('near', -78, -76), arm('far', -84, -80)], { slots: { hand_near: 'hand_near_fist', hand_far: 'hand_far_fist' } });

// ================================================================ LIGHT: iaido draw-cut
P.iai_windup = ready('iai_windup', pose([ikLeg('far', 150, 0, 84, 0), ikLeg('near', -156, 0, 84, 0), body(6, 12, -5, -8), { saya: 12 }], { slots: INTENSE }), 40);
P.iai_slash = saya('iai_slash', blade(pose([ikLeg('far', 214, 0, 118, 0), ikLeg('near', -222, 0, 118, 0), body(4, 6, -4, -8), arm('near', -84, -16), { saya: 22 }], { root: { x: 36, y: 0 }, slots: { ...GRIPN, ...INTENSE }, ...DRAWN }), -2), 60);
P.iai_recover = saya('iai_recover', blade(pose([ikLeg('far', 170, 0, 92, 0), ikLeg('near', -172, 0, 92, 0), body(4, 7, -3, -6), arm('near', -46, -22), { saya: 10 }], { root: { x: 24, y: 0 }, slots: { ...GRIPN, ...INTENSE }, ...DRAWN }), 24), 36);

// ================================================================ HEAVY: two-handed overhead cleave (overhead level, knockdown)
const twoHands = (name, p) => hilt2(name, p);
P.heavy_windup = twoHands('heavy_windup', blade(pose([ikLeg('far', 106, 34, 40, 10), ikLeg('near', -164, 0, 40, 0), body(-5, -12, 3, 6), arm('near', -172, -60)], { root: { x: -24, y: 0 }, slots: { ...GRIPN, ...INTENSE }, ...DRAWN }), 156));
P.heavy_cleave = twoHands('heavy_cleave', blade(pose([ikLeg('far', 250, 0, 150, 0), ikLeg('near', -252, 0, 150, 0), body(10, 22, -6, -12), arm('near', -84, -8)], { root: { x: 76, y: 0 }, slots: { ...GRIPN, ...INTENSE }, ...DRAWN }), 44));
P.heavy_follow = twoHands('heavy_follow', blade(pose([ikLeg('far', 244, 0, 160, 0), ikLeg('near', -248, 0, 160, 0), body(12, 26, -8, -16), arm('near', -50, -6)], { root: { x: 84, y: 0 }, slots: { ...GRIPN, ...INTENSE }, ...DRAWN }), 34));

// ================================================================ ULTIMATE: "Crimson Crescent"
P.ult_charge = ready('ult_charge', pose([ikLeg('far', 172, 0, 160, 0), ikLeg('near', -184, 0, 160, 0), body(10, 20, -6, -10), { saya: 14 }], { slots: INTENSE }), 44);
P.ult_windup = saya('ult_windup', blade(pose([ikLeg('far', 176, 0, 126, 0), ikLeg('near', -196, 0, 126, 0), body(-4, -8, 2, 2), arm('near', 64, -18), { saya: 26 }], { root: { x: -20, y: 0 }, slots: { ...GRIPN, ...INTENSE }, ...DRAWN }), 176), 60);
P.ult_release = saya('ult_release', blade(pose([ikLeg('far', 262, 0, 156, 0), ikLeg('near', -262, 0, 156, 0), body(8, 14, -6, -10), arm('near', -108, -2), { saya: 26 }], { root: { x: 84, y: 0 }, slots: { ...GRIPN, ...INTENSE }, ...DRAWN }), -14), 60);
P.ult_follow = saya('ult_follow', blade(pose([ikLeg('far', 240, 0, 140, 0), ikLeg('near', -246, 0, 140, 0), body(6, 10, -4, -8), arm('near', -134, -6), { saya: 22 }], { root: { x: 84, y: 0 }, slots: { ...GRIPN, ...INTENSE }, ...DRAWN }), -46), 56);
// cosmetic (super freeze): chiburi, the blade flicked down to the side
P.ult_flourish = saya('ult_flourish', blade(pose([ikLeg('far', 134, 0, 70, 0), ikLeg('near', -140, 0, 70, 0), body(2, 4, -2, -6), arm('near', -38, -14), { saya: 6 }], { slots: { ...GRIPN, ...INTENSE }, ...DRAWN }), 72), 30);

// ================================================================ REACTIONS
P.hit = pose([ikLeg('far', 96, 0, 40, 0), ikLeg('near', -116, 0, 40, 0), body(-8, -14, -6, -16), arm('near', 34, -28), arm('far', 40, -30)], { root: { x: -22, y: 0 }, slots: { hand_near: 'hand_near_open', hand_far: 'hand_far_open', ...HURT } });
P.ko_stagger = pose([ikLeg('far', 70, 0, 50, 0), ikLeg('near', -140, 0, 50, 0), body(-14, -22, -6, -20), arm('near', 54, -28), arm('far', 62, -36)], { slots: { hand_near: 'hand_near_open', hand_far: 'hand_far_open', ...HURT } });
P.ko_fall = pose([{ pelvis: -42 }, leg('far', -54, 44, 10), leg('near', -30, 62, 10), body(-10, -14, 0, -16), arm('near', 70, -40), arm('far', 90, -30)], {
  slots: { hand_near: 'hand_near_open', hand_far: 'hand_far_open', ...HURT }, groundBy: ['torso_upper', 'pelvis', 'shin_boot_near', 'foot_far', 'foot_near', 'head_base'], springHang: 0.5,
});
P.ko_down = pose([{ pelvis: -88 }, { thigh_far: 2, shin_boot_far: 8, foot_far: 30, thigh_near: -16, shin_boot_near: 8, foot_near: 30 }, body(0, 0, 0, -6), arm('near', -10, -16), arm('far', 8, -12)], {
  slots: { hand_near: 'hand_near_open', hand_far: 'hand_far_open', ...HURT }, groundBy: ['torso_upper', 'pelvis', 'thigh_near', 'thigh_far', 'shin_boot_near', 'shin_boot_far', 'head_base'], springHang: 0.12,
});
P.wakeup = saya('wakeup', pose([ikLeg('far', 132, 0, 170, 0), ikLeg('near', -120, 0, 170, 0), body(10, 20, -4, -10), arm('near', -24, -60)], { slots: { hand_near: 'hand_near_fist' } }));

// ================================================================ walk planted-foot distances (root motion per key)
const footX = (p, side) => {
  const id = side === 'near' ? 'foot_near_side' : 'foot_far';
  const sol = solve(rig, p);
  const pts = rig.contacts[id];
  const [x, y] = pts[Math.floor(pts.length / 2)];
  return ap(sol.W[id], x, y)[0];
};
const steps = walkKeys.map((k, i) => {
  const next = walkKeys[(i + 1) % walkKeys.length];
  return +(footX(P[`walk_${i + 1}`], k.stance) - footX(P[`walk_${(i + 1) % walkKeys.length + 1}`], k.stance)).toFixed(1);
});

const out = { _note: 'Generated by tools/author_poses.mjs (edit there). Samurai: no jump / crouch / run / kick / air poses by design.' };
for (const [k, v] of Object.entries(P)) out[k] = clean(v);
writeFileSync(join(ROOT, 'poses.json'), JSON.stringify(out, null, 1));
writeFileSync(join(ROOT, 'walk.json'), JSON.stringify({ steps, poses: walkKeys.map((_, i) => `walk_${i + 1}`), cycle: +steps.reduce((a, b) => a + b, 0).toFixed(1) }, null, 1));
console.log('wrote', Object.keys(P).length, 'poses');
console.log('walk steps', steps.join(', '), '| per cycle', steps.reduce((a, b) => a + b, 0).toFixed(1));
console.log('hand reach error (units / axis deg):', Object.entries(errs).map(([k, [d, a]]) => `${k} ${d.toFixed(1)}/${a.toFixed(0)}`).join(', '));
