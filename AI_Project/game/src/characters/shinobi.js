// Shinobi (P1 / training character): movement + combat data. Moved verbatim out of game/src/moves.js (which now re-exports
// it), plus the character-registry wrapper (prompt 05 §4.1). Units are rig "master units" (character ~1100 tall); 60 fps.
//
// Box convention: x = forward from the fighter's centre line, y = height above the ground.
// Levels: high (whiffs on a crouching target), mid, low (must be blocked crouching), overhead (must be blocked standing).
import { BTN_ALL } from './buttons.js';

export const PHYS = {
  gravity: 1.7,
  walkF: 11.4, walkB: 9.7,           // matches the walk cycle's foot travel (about 546 units / 48 frames)
  runMax: 21, runAccel: 2.4, runStartV: 15,
  dashV: 22, dashFrames: 14,
  backhopV: 16, backhopVy: 11, backhopG: 0.9,
  jumpVy: 38, jumpVyCut: 26, jumpVx: 12, jumpBackVx: 10, prejump: 3, landLag: 4,
  groundFriction: 0.8, kbFriction: 0.84,
  stageW: 5200, stageMargin: 260,
  hp: 1000,
  pushHalf: 90,                      // pushbox half-width
  doubleTapWindow: 16, inputBuffer: 6,
};

export const HURT = {
  stand: { x0: -125, x1: 165, y0: 0, y1: 1110 },
  crouch: { x0: -140, x1: 205, y0: 0, y1: 870 }, // matches the crouch art (head top ~870)
};

// Cancel (gatling) rank: after a move connects (hit or block) you may cancel into a strictly higher rank.
// Animation keys: `hold` = frames on that key; the renderer eases toward the next key during the last `tween`
// frames of the hold (default 5), so each key is reached exactly on its frame. `ease`: in (accelerate into the
// next key: strikes), out, inout (default), linear, smooth. `fade` = cross-fade frames when the move starts.
export const MOVES = {
  stab: {
    name: 'Light sword (kunai)', rank: 1, level: 'mid', chain: 3, meter: 6,
    frames: [{ pose: 'light_windup', hold: 5, tween: 3, ease: 'in' }, { pose: 'kunai_strike', hold: 6, tween: 4 }, { pose: 'light_recover', hold: 7, tween: 5 }, { pose: 'stance', hold: 3 }],
    active: [5, 11], box: { x0: 150, x1: 480, y0: 560, y1: 770 }, adv: 3,
    dmg: 60, hitstop: 8, hitstun: 20, blockstun: 13, push: { hit: 16, block: 20 }, power: 1,
  },
  kick: {
    name: 'Kick', rank: 2, level: 'mid', meter: 8,
    frames: [{ pose: 'kick_chamber', hold: 6, tween: 3, ease: 'in' }, { pose: 'kick_extend', hold: 5, tween: 3 }, { pose: 'kick_recover', hold: 8, tween: 5 }, { pose: 'stance', hold: 3 }],
    active: [6, 11], box: { x0: 150, x1: 700, y0: 700, y1: 960 },
    dmg: 70, hitstop: 8, hitstun: 21, blockstun: 14, push: { hit: 18, block: 24 }, power: 2,
  },
  slash: {
    name: 'Heavy slash', rank: 3, level: 'high', knockdown: true, meter: 14,
    frames: [{ pose: 'sword_windup', hold: 10, tween: 3, ease: 'in' }, { pose: 'sword_slash', hold: 5, tween: 3 }, { pose: 'heavy_follow', hold: 10, tween: 6 }, { pose: 'stance', hold: 6 }],
    active: [10, 15], box: { x0: 110, x1: 600, y0: 480, y1: 1000 }, adv: 4,
    dmg: 140, hitstop: 12, hitstun: 30, blockstun: 20, push: { hit: 30, block: 34 }, launch: { vx: 12, vy: 13 }, power: 3,
    arc: { from: 'sword_windup', to: 'sword_slash', anchor: 'sword_tip', inner: 'sword_guard', samples: 8, life: 14 },
  },
  throw: {
    name: 'Kunai throw', rank: 4, level: 'high',
    frames: [{ pose: 'throw_windup', hold: 8, tween: 3, ease: 'in' }, { pose: 'throw_release', hold: 4, tween: 3 }, { pose: 'throw_follow', hold: 10, tween: 6 }, { pose: 'stance', hold: 6 }],
    spawnAt: 8, projectile: { vx: 30, h: 700, ox: 200, life: 55, dmg: 45, hitstun: 20, blockstun: 12, hitstop: 7, push: { hit: 14, block: 16 }, w: 90, hgt: 70, meter: 5 },
  },
  crouch_stab: {
    name: 'Crouch light sword', rank: 1, level: 'low', crouch: true, meter: 6,
    frames: [{ pose: 'crouch_stab_wind', hold: 7, tween: 3, ease: 'in' }, { pose: 'crouch_stab', hold: 4, tween: 3 }, { pose: 'crouch_stab_rec', hold: 8, tween: 6 }, { pose: 'crouch', hold: 4 }],
    active: [7, 11], box: { x0: 150, x1: 510, y0: 320, y1: 540 },
    dmg: 45, hitstop: 6, hitstun: 17, blockstun: 11, push: { hit: 12, block: 16 }, power: 1,
  },
  sweep: {
    name: 'Crouch kick (sweep)', rank: 2.5, level: 'low', knockdown: true, crouch: true, meter: 8,
    frames: [{ pose: 'sweep_wind', hold: 7, tween: 3, ease: 'in' }, { pose: 'sweep_extend', hold: 5, tween: 4 }, { pose: 'sweep_recover', hold: 14, tween: 8 }, { pose: 'crouch', hold: 4 }],
    active: [7, 12], box: { x0: 120, x1: 730, y0: 0, y1: 260 },
    dmg: 60, hitstop: 8, hitstun: 24, blockstun: 16, push: { hit: 18, block: 24 }, launch: { vx: 8, vy: 8 }, power: 2,
  },
  air_stab: {
    name: 'Air light sword', air: true, level: 'mid', meter: 6,
    frames: [{ pose: 'air_stab_wind', hold: 4, tween: 3, ease: 'in' }, { pose: 'air_stab', hold: 12, tween: 8 }, { pose: 'air_stab_after', hold: 44 }], active: [4, 16], box: { x0: 140, x1: 490, y0: 420, y1: 780 },
    dmg: 45, hitstop: 6, hitstun: 20, blockstun: 12, push: { hit: 12, block: 16 }, power: 1,
  },
  air_kick: {
    name: 'Air kick', air: true, level: 'mid', meter: 8,
    frames: [{ pose: 'air_kick_chamber', hold: 3, tween: 3, ease: 'in' }, { pose: 'jump_kick', hold: 17, tween: 8 }, { pose: 'air_kick_after', hold: 40 }], active: [3, 20], box: { x0: 110, x1: 710, y0: 120, y1: 480 },
    dmg: 65, hitstop: 8, hitstun: 24, blockstun: 14, push: { hit: 16, block: 22 }, power: 2,
  },
  // Ultimate (U, full meter, grounded): super freeze, then a fan of 7 flaming kunai. Startup is NOT invulnerable.
  ult: {
    name: 'Ultimate: kunai fan', ult: true, level: 'mid', cost: 100, freeze: 34, fade: 2,
    frames: [{ pose: 'ult_charge', hold: 6, tween: 4 }, { pose: 'ult_windup', hold: 12, tween: 4, ease: 'in' }, { pose: 'ult_release', hold: 8, tween: 5 }, { pose: 'ult_follow', hold: 14, tween: 7 }, { pose: 'stance', hold: 8 }],
    spawnAt: 18,
    // cosmetic showpiece played by the caster during the super freeze (sim time is frozen; see Animator)
    flash: [{ pose: 'ult_charge', hold: 7, tween: 6 }, { pose: 'ult_flourish', hold: 19, tween: 8 }, { pose: 'ult_charge', hold: 8 }],
    fan: { angles: [-24, -16, -8, 0, 8, 16, 24], speed: 26, h: 720, ox: 190, life: 56, dmg: 70, chip: 25, noScale: true, hitstun: 26, blockstun: 14, hitstop: 4, push: { hit: 10, block: 12 }, w: 90, hgt: 60, meter: 0 },
  },
};

for (const m of Object.values(MOVES)) m.total = m.frames.reduce((s, f) => s + f.hold, 0);

/** pose for a frame counter t inside a frame list (held poses); loops when `loop` */
export function frameAt(frames, t, loop = false) {
  const total = frames.reduce((s, f) => s + f.hold, 0);
  if (loop) t = ((t % total) + total) % total;
  let acc = 0;
  for (const fr of frames) { acc += fr.hold; if (t < acc) return fr; }
  return frames[frames.length - 1];
}

// Looping / utility animations (pose names live in poses.json and poses_extra.json).
export const ANIMS = {
  idle: { loop: true, frames: [{ pose: 'stance', hold: 20, tween: 20 }, { pose: 'stance_b', hold: 20, tween: 20 }] },
  crouch: { loop: true, frames: [{ pose: 'crouch', hold: 22, tween: 22 }, { pose: 'crouch_b', hold: 22, tween: 22 }] },
  guard: { loop: true, frames: [{ pose: 'guard', hold: 30 }] },
  crouch_guard: { loop: true, frames: [{ pose: 'crouch_guard', hold: 30 }] },
  hit: { loop: true, frames: [{ pose: 'hit', hold: 60 }] },
  crouch_hit: { loop: true, frames: [{ pose: 'crouch_hit', hold: 60 }] },
  prejump: { loop: true, frames: [{ pose: 'land', hold: 10 }] },
  land: { loop: true, frames: [{ pose: 'land', hold: 10 }] },
  dash: { loop: false, frames: [{ pose: 'stance_b', hold: 3, tween: 3, ease: 'in' }, { pose: 'dash', hold: 14, tween: 6 }, { pose: 'stance', hold: 8 }] },
  runstart: { loop: false, frames: [{ pose: 'dash', hold: 60 }] },
  runstop: { loop: false, frames: [{ pose: 'stance_b', hold: 8 }] },
  backhop: { loop: false, frames: [{ pose: 'backstep', hold: 40 }] },
  down: { loop: false, frames: [{ pose: 'ko_stagger', hold: 6 }, { pose: 'ko_fall', hold: 6 }, { pose: 'ko_down', hold: 200 }] },
  wake: { loop: false, frames: [{ pose: 'wakeup', hold: 8, tween: 6 }, { pose: 'land', hold: 6, tween: 6 }, { pose: 'stance', hold: 2 }] },
  knock_air: { loop: false, frames: [{ pose: 'ko_stagger', hold: 6, tween: 6 }, { pose: 'ko_fall', hold: 60 }] },
};

// Walk keys: planted-foot distances per key (units), from animations.json walk_forward.
export const WALK_STEPS = [65.1, 63.3, 67, 74.1, 60.8, 69.3, 65.8, 80.8];
export const WALK_POSES = ['walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5', 'walk_6', 'walk_7', 'walk_8'];
export const RUN_POSES = ['run_a', 'run_b', 'run_c', 'run_d'];
export const RUN_STRIDE = 420; // units travelled per run key

/** button -> move name (verbatim from the old Sim.pickMove) */
function pickMove(btn, { air, down }) {
  if (air) return btn === 'P' ? 'air_stab' : btn === 'K' ? 'air_kick' : null;
  if (down) return { P: 'crouch_stab', K: 'sweep', S: 'slash', T: 'throw' }[btn];
  return { P: 'stab', K: 'kick', S: 'slash', T: 'throw' }[btn];
}

export const SHINOBI = {
  id: 'shinobi', name: 'SHINOBI',
  rig: 'art/shinobi/rig.json', rigP2: 'art/shinobi/rig_p2.json',
  poseFiles: ['art/shinobi/poses.json', 'art/shinobi/poses_extra.json'],
  can: { jump: true, crouch: true, run: true, hop: true },
  inputMask: BTN_ALL,
  phys: PHYS, hurt: HURT, moves: MOVES, anims: ANIMS,
  walk: { steps: WALK_STEPS, poses: WALK_POSES },
  run: { poses: RUN_POSES, stride: RUN_STRIDE },
  pickMove,
  projectilePart: 'kunai',
};
