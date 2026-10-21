// Rig data that is not geometry: springs, joint stress ranges, foot contacts, effect anchors, attachments.
// split.mjs writes all of it into rig.json / rig_p2.json (the shared rig_runtime.js reads rig.springs / rig.stress).
import { SWORD, HANDS, FEET, GRIP_LOCAL, xf } from './samurai.art.mjs';

const r2 = (p) => ({ x: +p[0].toFixed(2), y: +p[1].toFixed(2) });
const onHand = (side, local) => xf(local, ...HANDS[side]);

// secondary motion. hang: how strongly the bone counter-rotates to hang under gravity (relative to its parent's world angle);
// k/c: spring stiffness/damping; g: reaction to pivot acceleration; wind: idle sway amplitude (deg).
export const SPRINGS = {
  // tied tail: stiff at the tie, loose at the ends
  hair_1: { hang: 0.35, k: 70, c: 8, g: 0.03, wind: 0.6 },
  hair_2: { hang: 0.6, k: 60, c: 7, g: 0.04, wind: 1 },
  hair_3: { hang: 0.7, k: 55, c: 6, g: 0.05, wind: 1.4 },
  hair_4: { hang: 0.8, k: 50, c: 6, g: 0.06, wind: 2 },
  strand_near: { hang: 0.5, k: 90, c: 9, g: 0.03, wind: 1 },
  strand_far: { hang: 0.5, k: 95, c: 9, g: 0.03, wind: 1.2 },
  // wide haori sleeves: follow the arm, lagging and falling back toward the shoulder when it lifts
  sleeve_near: { hang: 0.22, k: 80, c: 9, g: 0.03, wind: 0.9 },
  sleeve_far: { hang: 0.22, k: 80, c: 9, g: 0.03, wind: 0.9 },
  haori_tail_back: { hang: 0.35, k: 100, c: 10, g: 0.025, wind: 0.8 },
  // hakama: centre panels hang from the hips (front panel on the front thigh, back panel on the back thigh, halfway to vertical); the lower trouser legs hang from the knees (they follow the shins, lagging a little)
  hakama_front_panel: { hang: 0.5, k: 110, c: 11, g: 0.02, wind: 0.5 },
  hakama_back_panel: { hang: 0.5, k: 100, c: 10, g: 0.025, wind: 0.6 },
  hakama_side_near: { hang: 0.22, k: 95, c: 10, g: 0.025, wind: 0.4 },
  hakama_side_far: { hang: 0.22, k: 95, c: 10, g: 0.025, wind: 0.4 },
  // crimson obi strip
  obi_tail_1a: { hang: 0.6, k: 60, c: 7, g: 0.04, wind: 0.8 },
  obi_tail_1b: { hang: 0.8, k: 50, c: 6, g: 0.05, wind: 1.6 },
  obi_tail_2a: { hang: 0.6, k: 60, c: 7, g: 0.04, wind: 1 },
  obi_tail_2b: { hang: 0.8, k: 50, c: 6, g: 0.05, wind: 2.2 },
};

// joint stress ranges [min, max] (deg): the extremes of walk, guard, iai strike and overhead cleave
export const STRESS = {
  upper_arm_near: [-165, 40], forearm_near: [-130, 0], upper_arm_far: [-120, 60], forearm_far: [-110, 40],
  thigh_near: [-70, 45], shin_boot_near: [0, 100], foot_near: [-30, 30],
  thigh_far: [-70, 45], shin_boot_far: [0, 100], foot_far: [-30, 30],
  waist: [-10, 14], torso_upper: [-18, 24], neck: [-14, 14], head_base: [-20, 18],
  hand_near_open: [-35, 35], hand_far_open: [-35, 35],
};

// sole polylines (master coords on each foot part); the sandal bottom is y 1301
const sole = (x0) => [[x0 - 40, 1301], [x0 - 10, 1301], [x0 + 40, 1301], [x0 + 90, 1301], [x0 + 124, 1300]];
export const CONTACTS = { foot_near: sole(FEET.near), foot_far: sole(FEET.far), foot_near_side: sole(FEET.near) };

export const ANCHORS = {
  sword_tip: { part: 'sword', ...r2(SWORD.tip) },
  sword_guard: { part: 'sword', ...r2(SWORD.guard) },
  sword_grip2: { part: 'sword', ...r2(SWORD.grip2) },
  saya_mouth: { part: 'saya', ...r2(SWORD.mouth) },
  hand_near: { part: 'hand_near_open', ...r2(onHand('near', [0, 40])) },
  hand_near_grip: { part: 'hand_near_grip_sword', ...r2(onHand('near', GRIP_LOCAL)) },
  hand_far_grip: { part: 'hand_far_grip_sword', ...r2(onHand('far', GRIP_LOCAL)) },
  fist_near: { part: 'hand_near_fist', ...r2(onHand('near', [0, 44])) },
  head: { part: 'head_base', x: 540, y: 200 },
  chest: { part: 'torso_upper', x: 590, y: 420 },
  foot_far_toe: { part: 'foot_far', x: FEET.far + 120, y: 1292 },
  foot_near_toe: { part: 'foot_near', x: FEET.near + 120, y: 1292 },
};

export const ATTACHMENTS = {
  sword: {
    rest: 'saya',
    grips: ['hand_near_grip_sword', 'hand_far_grip_sword'],
    // the runtime attaches an item to ONE hand: two-handed poses attach to the near (right) hand at the tsuba end
    // and pose the far (left) hand onto this second grip point near the kashira (anchor `sword_grip2`)
    secondGrip: r2(SWORD.grip2),
  },
};
