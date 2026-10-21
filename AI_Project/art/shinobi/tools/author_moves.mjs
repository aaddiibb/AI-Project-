// Authoring source for the game-only poses (crouch, jump, air / crouch attacks, ultimate).
// Poses are written with posekit (absolute limb angles + leg IK) and merged into poses_extra.json.
//   node tools/author_moves.mjs     (then: node tools/render_extra.mjs <names> to review)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leg, arm, ikLeg, body, settle, FISTS } from './posekit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'poses_extra.json');
const extra = JSON.parse(readFileSync(FILE, 'utf8'));

const K = { hand_near: 'hand_near_grip_kunai', hand_far: 'hand_far_fist' };
const KUNAI = { attach: { kunai: 'hand_near_grip_kunai' } };
const INTENSE = { face: 'face_intense' };
const pose = (rot, more = {}) => ({ rot: Object.assign({}, ...rot), ...more });

const P = {};

// ---------------------------------------------------------------- crouch family (grounded, both soles planted)
const crouchLegs = (drop, ff = 120, nf = -125) => [ikLeg('far', ff, 0, drop, 0), ikLeg('near', nf, 0, drop, 0)];
P.crouch = pose([...crouchLegs(235), body(8, 16, -4, -12), arm('near', -30, -104), arm('far', -50, -96)], { slots: FISTS });
P.crouch_b = pose([...crouchLegs(243), body(9, 18, -4, -13), arm('near', -27, -107), arm('far', -47, -99)], { slots: FISTS });
P.crouch_guard = pose([...crouchLegs(245), body(10, 18, -4, -14), arm('near', -12, -132), arm('far', -30, -130)], { slots: FISTS });
P.crouch_hit = pose([...crouchLegs(220, 100, -140), body(-8, -16, -4, -16), arm('near', 34, -36), arm('far', 44, -40)], { root: { x: -16, y: 0 }, slots: { face: 'face_hurt' } });

// landing / pre-jump squat
P.land = pose([ikLeg('far', 60, 0, 170, 0), ikLeg('near', -80, 0, 170, 0), body(6, 14, -3, -8), arm('near', -14, -78), arm('far', -36, -66)], { slots: FISTS });
P.jump_squat = pose([ikLeg('far', 55, 0, 215, 0), ikLeg('near', -75, 0, 215, 0), body(8, 16, -4, -10), arm('near', 22, -40), arm('far', 8, -46)], { slots: FISTS });

// ---------------------------------------------------------------- air (not ground-locked: pelvis rides the jump arc)
const AIR = { ground: false };
P.jump_rise = pose([leg('far', -18, 26, 46), leg('near', 14, 22, 52), body(2, 4, -2, -6), arm('near', -70, -60), arm('far', 30, -40)], { ...AIR, slots: FISTS });
P.jump_peak = pose([leg('far', -108, 140, 30), leg('near', -84, 142, 34), body(10, 20, -6, -14), arm('near', -62, -112), arm('far', -78, -104)], { ...AIR, slots: FISTS });
// tight somersault ball (blended in by the animator during forward / back flips)
P.jump_flip = pose([leg('far', -128, 150, 30), leg('near', -112, 152, 34), body(14, 26, -8, -18), arm('near', -96, -100), arm('far', -110, -96)], { ...AIR, slots: FISTS });
P.jump_fall = pose([leg('far', -38, 52, 14), leg('near', -6, 40, 24), body(4, 8, -2, -6), arm('near', -58, -76), arm('far', -40, -74)], { ...AIR, slots: FISTS });

// air light sword: diagonal-down kunai stab
P.air_stab_wind = pose([leg('far', -74, 118, 30), leg('near', -40, 104, 34), body(4, 6, -2, -6), arm('near', 22, -116), arm('far', -60, -80)], { ...AIR, slots: { ...K, ...INTENSE }, ...KUNAI, attachRot: { kunai: 90 } });
P.air_stab = pose([leg('far', -40, 110, 30), leg('near', 26, 44, 44), body(12, 20, -10, -20), arm('near', -98, -2), arm('far', 50, -40)], { ...AIR, root: { x: 24, y: 0 }, slots: { ...K, ...INTENSE }, ...KUNAI, attachRot: { kunai: 90 } });
// whole body pitched into the dive (pelvis rotation), applied after the limb angles
P.air_stab.rot.pelvis = 22;
P.air_stab_after = pose([leg('far', -50, 96, 24), leg('near', -4, 60, 34), body(8, 12, -4, -10), arm('near', -54, -60), arm('far', 10, -60)], { ...AIR, slots: K, ...KUNAI, attachRot: { kunai: 90 } });

// air kick: chamber, then front leg driven forward-down
P.air_kick_chamber = pose([leg('far', -104, 132, 20), leg('near', -52, 122, 30), body(0, -4, 0, 0), arm('near', -36, -108), arm('far', -54, -100)], { ...AIR, slots: { ...FISTS, ...INTENSE } });
P.air_kick_after = pose([leg('far', -56, 52, 0), leg('near', -50, 112, 28), body(-2, -4, 0, 0), arm('near', -36, -100), arm('far', 0, -70)], { ...AIR, slots: FISTS });
P.jump_kick = pose([leg('far', -62, 2, -16), leg('near', -64, 132, 30), body(-6, -10, 2, 4), arm('near', -40, -104), arm('far', 34, -60)], { ...AIR, slots: { ...FISTS, ...INTENSE } });

// ---------------------------------------------------------------- crouch light sword (low kunai stab)
P.crouch_stab_wind = pose([...crouchLegs(240), body(4, 8, -4, -6), arm('near', 34, -104), arm('far', -54, -92)], { slots: { ...K, ...INTENSE }, ...KUNAI, attachRot: { kunai: 90 } });
P.crouch_stab = pose([ikLeg('far', 230, 0, 300, 0), ikLeg('near', -190, 0, 300, 0), body(16, 28, -8, -20), arm('near', -106, -2), arm('far', 44, -50)], { root: { x: 30, y: 0 }, slots: { ...K, ...INTENSE }, ...KUNAI, attachRot: { kunai: 90 } });
P.crouch_stab_rec = pose([ikLeg('far', 160, 0, 260, 0), ikLeg('near', -150, 0, 260, 0), body(10, 18, -4, -12), arm('near', 6, -120), arm('far', -40, -90)], { root: { x: 14, y: 0 }, slots: K, ...KUNAI, attachRot: { kunai: 90 } });

// ---------------------------------------------------------------- crouch kick (low sweep)
const SIDE = { foot_near: 'foot_near_side' };
P.sweep_wind = settle(pose([leg('far', -66, 120, -10), leg('near', -24, 124, 80), body(16, 22, -6, -12), arm('near', -24, -20), arm('far', -50, -96)], { root: { x: -10, y: 0 }, slots: { hand_near: 'hand_near_open', hand_far: 'hand_far_fist', ...SIDE, ...INTENSE } }), ['knee_near', 'heel_far', 'toe_far', 'toe_near_side']);
P.sweep_extend = settle(pose([leg('far', -50, 0, -14), leg('near', -30, 130, 80), body(20, 26, -8, -20), arm('near', -52, -4), arm('far', -40, -100)], { root: { x: 40, y: 0 }, slots: { hand_near: 'hand_near_open', hand_far: 'hand_far_fist', ...SIDE, ...INTENSE } }), ['knee_near', 'heel_far', 'toe_far', 'palm_near', 'toe_near_side']);
P.sweep_recover = settle(pose([leg('far', -72, 104, -6), leg('near', -14, 114, 80), body(12, 16, -4, -10), arm('near', -10, -60), arm('far', -48, -96)], { root: { x: 14, y: 0 }, slots: { ...FISTS, ...SIDE } }), ['knee_near', 'heel_far', 'toe_far', 'toe_near_side']);

// ---------------------------------------------------------------- ultimate: kunai fan
const BOTH = { hand_near: 'hand_near_grip_kunai', hand_far: 'hand_far_grip_kunai' };
// flash showpiece: low cross-guard -> rise and spread the two fans wide -> back to the guard (played during the super freeze)
P.ult_charge = pose([ikLeg('far', 130, 0, 250, 0), ikLeg('near', -150, 0, 250, 0), body(8, 14, -6, -10), arm('near', -70, -120), arm('far', -50, -138)], { slots: { ...BOTH, ...INTENSE } });
P.ult_flourish = pose([ikLeg('far', 120, 0, 120, 0), ikLeg('near', -140, 0, 120, 0), body(-4, -8, 4, 6), arm('near', 112, -18), arm('far', -134, -14)], { slots: { ...BOTH, ...INTENSE } });
// coil: weight back, both hands loaded behind the near shoulder
P.ult_windup = pose([ikLeg('far', 190, 0, 190, 0), ikLeg('near', -110, 0, 190, 0), body(-10, -18, 4, 6), arm('near', 140, -60), arm('far', 10, -150)], { root: { x: -24, y: 0 }, slots: { ...BOTH, ...INTENSE } });
// release: lunge, arms whip forward and apart (the fan leaves between them)
P.ult_release = pose([ikLeg('far', 240, 0, 250, 0), ikLeg('near', -230, 0, 250, 0), body(12, 22, -6, -14), arm('near', -102, -4), arm('far', -142, -6)], { root: { x: 40, y: 0 }, slots: { hand_near: 'hand_near_open', hand_far: 'hand_far_open', ...INTENSE } });
P.ult_follow = pose([ikLeg('far', 200, 0, 220, 0), ikLeg('near', -190, 0, 220, 0), body(10, 16, -4, -10), arm('near', -76, -24), arm('far', -110, -24)], { root: { x: 30, y: 0 }, slots: { hand_near: 'hand_near_open', hand_far: 'hand_far_open' } });

// replaced / retired poses
for (const old of ['punch_windup', 'punch_extend', 'punch_recover', 'crouch_punch_wind', 'crouch_punch', 'jump_punch']) delete extra[old];
Object.assign(extra, P);
extra._note = 'Game-only poses. Crouch / jump / air / crouch attacks / ultimate are generated by tools/author_moves.mjs (edit there, not here); run poses come from the earlier hand-authored pass. Air poses carry "ground": false (the pelvis follows the jump arc).';
writeFileSync(FILE, JSON.stringify(extra, null, 1));
console.log('wrote', Object.keys(P).length, 'poses:', Object.keys(P).join(' '));
