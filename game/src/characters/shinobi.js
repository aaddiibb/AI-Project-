// Shinobi (P1 / training character): movement + combat data. Moved verbatim out of game/src/moves.js (which now re-exports
// it), plus the character-registry wrapper (prompt 05 §4.1). Units are rig "master units" (character ~1100 tall); 60 fps.
//
// Box convention: x = forward from the fighter's centre line, y = height above the ground.
// Levels: high (whiffs on a crouching target), mid, low (must be blocked crouching), overhead (must be blocked standing).
import { BTN_ALL } from './buttons.js';
import { cineDef } from '../../../art/samurai/samurai.moves.js';

export const PHYS = {
  gravity: 1.7,
  walkF: 11.4, walkB: 9.7,           // matches the walk cycle's foot travel (about 546 units / 48 frames)
  // speed pass (2026-10-17): she out-moves the Samurai: dash 30 x 16 = 480 units (his 280), back hop ~590 (his back-dash 238)
  runMax: 26, runAccel: 2.8, runStartV: 18,
  dashV: 30, dashFrames: 16,
  backhopV: 22, backhopVy: 12, backhopG: 0.9,
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
// shared fields of the clone attacks (ult projectiles; a clean hit starts the cinematic)
const CLONE = { ult: true, noScale: true, parryable: true, cine: true, clone: true, knockdown: true, launch: { vx: 10, vy: 12 }, meter: 0 };

export const MOVES = {
  stab: {
    name: 'Light sword (kunai)', rank: 1, level: 'mid', chain: 3, meter: 6,
    frames: [{ pose: 'light_windup', hold: 4, tween: 3, ease: 'in' }, { pose: 'kunai_strike', hold: 6, tween: 4 }, { pose: 'light_recover', hold: 6, tween: 5 }, { pose: 'stance', hold: 3 }],
    active: [4, 10], box: { x0: 150, x1: 480, y0: 560, y1: 770 }, adv: 3,
    dmg: 60, hitstop: 8, hitstun: 20, blockstun: 13, push: { hit: 16, block: 20 }, power: 1,
  },
  kick: {
    name: 'Kick', rank: 2, level: 'mid', meter: 8,
    frames: [{ pose: 'kick_chamber', hold: 5, tween: 3, ease: 'in' }, { pose: 'kick_extend', hold: 5, tween: 3 }, { pose: 'kick_recover', hold: 7, tween: 5 }, { pose: 'stance', hold: 3 }],
    active: [5, 10], box: { x0: 150, x1: 700, y0: 700, y1: 960 },
    dmg: 70, hitstop: 8, hitstun: 21, blockstun: 14, push: { hit: 18, block: 24 }, power: 2,
  },
  slash: {
    name: 'Heavy slash', rank: 3, level: 'high', knockdown: true, meter: 14,
    frames: [{ pose: 'sword_windup', hold: 8, tween: 3, ease: 'in' }, { pose: 'sword_slash', hold: 5, tween: 3 }, { pose: 'heavy_follow', hold: 8, tween: 6 }, { pose: 'stance', hold: 5 }],
    active: [8, 13], box: { x0: 110, x1: 600, y0: 480, y1: 1000 }, adv: 4,
    dmg: 140, chip: 0.25, hitstop: 12, hitstun: 30, blockstun: 20, push: { hit: 30, block: 34 }, launch: { vx: 12, vy: 13 }, power: 3,
    arc: { from: 'sword_windup', to: 'sword_slash', anchor: 'sword_tip', inner: 'sword_guard', samples: 8, life: 14 },
  },
  throw: {
    name: 'Kunai throw', rank: 4, level: 'high',
    frames: [{ pose: 'throw_windup', hold: 6, tween: 3, ease: 'in' }, { pose: 'throw_release', hold: 4, tween: 3 }, { pose: 'throw_follow', hold: 8, tween: 6 }, { pose: 'stance', hold: 5 }],
    spawnAt: 6, projectile: { vx: 30, h: 700, ox: 200, life: 55, dmg: 45, chip: 0.25, hitstun: 20, blockstun: 12, hitstop: 7, push: { hit: 14, block: 16 }, w: 90, hgt: 70, meter: 5 },
  },
  crouch_stab: {
    name: 'Crouch light sword', rank: 1, level: 'low', crouch: true, meter: 6,
    frames: [{ pose: 'crouch_stab_wind', hold: 6, tween: 3, ease: 'in' }, { pose: 'crouch_stab', hold: 4, tween: 3 }, { pose: 'crouch_stab_rec', hold: 7, tween: 6 }, { pose: 'crouch', hold: 4 }],
    active: [6, 10], box: { x0: 150, x1: 510, y0: 320, y1: 540 },
    dmg: 45, hitstop: 6, hitstun: 17, blockstun: 11, push: { hit: 12, block: 16 }, power: 1,
  },
  sweep: {
    name: 'Crouch kick (sweep)', rank: 2.5, level: 'low', knockdown: true, crouch: true, meter: 8,
    frames: [{ pose: 'sweep_wind', hold: 6, tween: 3, ease: 'in' }, { pose: 'sweep_extend', hold: 5, tween: 4 }, { pose: 'sweep_recover', hold: 12, tween: 8 }, { pose: 'crouch', hold: 4 }],
    active: [6, 11], box: { x0: 120, x1: 730, y0: 0, y1: 260 },
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
  // Kawarimi no jutsu (guard + light: Space + J, grounded, from neutral only). A hand-seal stance: a MELEE attack that
  // connects during frames counter[0]..counter[1] hits a log instead; she reappears behind the attacker and strikes
  // (kawa_strike, started by the simulator). Anti-abuse: whiffed = 20 frames of open recovery; cooldown frames from the
  // start (whiff) / refreshed on a success; costs `cost` meter (paid on activation, also when it whiffs); not from hit- or
  // blockstun; projectiles, waves and ultimates go straight through it.
  kawarimi: {
    // cost: meter spent on activation (whiff or not): every substitution is a slice of her ultimate
    name: 'Substitution (kawarimi)', rank: 0, level: 'mid', counter: [3, 14], cooldown: { whiff: 90, hit: 150 }, cost: 25,
    frames: [{ pose: 'kawa_seal', hold: 3, tween: 3, ease: 'in' }, { pose: 'kawa_seal', hold: 12 }, { pose: 'stance_b', hold: 20, tween: 10 }, { pose: 'stance', hold: 3 }],
  },
  // the ESCAPE version (same input from hitstun / blockstun / knocked down / getting up, same cost): a log takes her
  // place and she reappears ~560 units AWAY from the attacker (behind him only when cornered), briefly invulnerable. No free strike.
  kawa_escape: {
    name: 'Substitution escape', rank: 0, level: 'mid', fade: 1, invuln: [0, 12],
    frames: [{ pose: 'land', hold: 4, tween: 3 }, { pose: 'stance', hold: 10, tween: 6 }],
  },
  // the reappearing strike from behind (gatling rank 1.5: chains into kick / sweep / slash on contact)
  kawa_strike: {
    name: 'Kawarimi strike', rank: 1.5, level: 'mid', meter: 10, fade: 1,
    frames: [{ pose: 'land', hold: 4, tween: 3, ease: 'in' }, { pose: 'kunai_strike', hold: 6, tween: 4 }, { pose: 'light_recover', hold: 9, tween: 5 }, { pose: 'stance', hold: 3 }],
    active: [4, 10], box: { x0: 120, x1: 560, y0: 480, y1: 900 },
    dmg: 110, hitstop: 12, hitstun: 32, blockstun: 14, push: { hit: 10, block: 14 }, power: 3,
  },
  // Ultimate (U, full meter, grounded): "Kage Bunshin". During the super freeze she makes the seal and three ink clones
  // split out of her: one leaps into the AIR (in front of him), one sets up in FRONT, one slides under him and rises
  // BEHIND him (or, cornered, far in front). Positions are fixed when the freeze starts (sim.stageClones).
  // After the freeze she HOLDS the seal (vulnerable: hit her and no further clone attacks come) while the clones strike:
  //   kick  (t 2):  dive kick from above aimed at him (overhead: a crouch-guard loses), contact ~t 12
  //   slash (t 16): lunging slash from the front (mid)
  //   kunai (t 12 / 18 / 24): three volleys of 5 shadow-flame kunai from the rear clone, each aimed at him when thrown
  // Every clone attack is an ult projectile: blockable (chip only), parryable one by one, and ANY clean hit starts the
  // Shadow Execution cinematic. Ult vs ult contact cancels both ultimates (sim.clashProjectiles).
  ult: {
    name: 'Ultimate: Kage Bunshin', ult: true, level: 'mid', cost: 100, freeze: 46, fade: 2,
    frames: [{ pose: 'kawa_seal', hold: 50, tween: 4 }, { pose: 'stance_b', hold: 10, tween: 8 }],
    // cosmetic: the seal held through the super freeze (sim time is frozen; see Animator)
    flash: [{ pose: 'stance', hold: 3, tween: 3, ease: 'in' }, { pose: 'kawa_seal', hold: 60, tween: 5 }],
    cloneEnd: 28, // last frame a clone attack can start (AI: the ultimate is "active" until here)
    clones: {
      kick: { ...CLONE, kind: 'clone', at: 2, frames: 10, h: 800, back: 860, level: 'overhead', dmg: 60, chip: 18, w: 240, hgt: 320, life: 14, hitstun: 30, blockstun: 18, hitstop: 10, push: { hit: 20, block: 22 }, power: 2 },
      slash: { ...CLONE, kind: 'clone', at: 16, front: 620, ox: 300, h: 600, vx: 30, life: 8, dmg: 80, chip: 26, w: 300, hgt: 1000, hitstun: 30, blockstun: 20, hitstop: 12, push: { hit: 24, block: 26 }, power: 3 },
      kunai: { ...CLONE, kind: 'kunai', flame: 'shadow', volleys: [12, 18, 24], per: 5, sweep: 16, behind: 850, h: 720, speed: 34, dmg: 20, chip: 5, w: 90, hgt: 60, life: 44, hitstun: 18, blockstun: 10, hitstop: 4, push: { hit: 6, block: 6 }, power: 1 },
    },
    // the Shadow Execution (sim frames after the clean hit): impact, 12 accelerating clone passes, all three at once, silence,
    // her descending cut (156) and every hanging cut igniting (168). 40 + 12 x 18 + 54 + 70 + 70 = 450, only the last can KO.
    cine: {
      len: 224, impact: 40,
      hits: [...[29, 43, 55, 65, 72, 79, 85, 90, 94, 98, 101, 104].map((at) => ({ at, dmg: 18 })), { at: 108, dmg: 54 }, { at: 156, dmg: 70 }, { at: 168, dmg: 70, last: true }],
      land: 156, landDx: -500, // she lands IN FRONT of him (500 short of him, facing him)
      endDown: true, // he ends lying where he collapsed (no launch)
      launch: { vx: 0, vy: 0 },
    },
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
  dash: { loop: false, frames: [{ pose: 'stance_b', hold: 3, tween: 3, ease: 'in' }, { pose: 'dash', hold: 16, tween: 6 }, { pose: 'stance', hold: 6 }] },
  runstart: { loop: false, frames: [{ pose: 'dash', hold: 60 }] },
  runstop: { loop: false, frames: [{ pose: 'stance_b', hold: 8 }] },
  backhop: { loop: false, frames: [{ pose: 'backstep', hold: 40 }] },
  down: { loop: false, frames: [{ pose: 'ko_stagger', hold: 6 }, { pose: 'ko_fall', hold: 6 }, { pose: 'ko_down', hold: 200 }] },
  wake: { loop: false, frames: [{ pose: 'wakeup', hold: 8, tween: 6 }, { pose: 'land', hold: 6, tween: 6 }, { pose: 'stance', hold: 2 }] },
  knock_air: { loop: false, frames: [{ pose: 'ko_stagger', hold: 6, tween: 6 }, { pose: 'ko_fall', hold: 60 }] },
  // on the receiving end of the Samurai's ultimate cinematic (jerked by every cut)
  cine_def: { loop: false, frames: cineDef((pose, hold, tween) => ({ pose, hold, tween })) },
  cine_atk: { loop: false, frames: [{ pose: 'kawa_seal', hold: 400 }] }, // (the render replaces it: see ultfx.js)
  // ---- render-only clips (ultfx.js drives them through f.anim): the Kage Bunshin clones and the Shadow Execution
  u_seal: { frames: [{ pose: 'stance', hold: 3, tween: 3, ease: 'in' }, { pose: 'kawa_seal', hold: 400, tween: 5 }] },
  u_front: { frames: [{ pose: 'kawa_seal', hold: 2, tween: 2 }, { pose: 'dash', hold: 9, tween: 5 }, { pose: 'sword_windup', hold: 400, tween: 6 }] },
  u_air: { frames: [{ pose: 'kawa_seal', hold: 2, tween: 2 }, { pose: 'jump_squat', hold: 3, tween: 3 }, { pose: 'jump_rise', hold: 7, tween: 6 }, { pose: 'air_kick_chamber', hold: 400, tween: 6 }] },
  u_rear: { frames: [{ pose: 'crouch', hold: 4, tween: 4 }, { pose: 'throw_windup', hold: 400, tween: 6 }] },
  u_dive: { frames: [{ pose: 'air_kick_chamber', hold: 5, tween: 4, ease: 'in' }, { pose: 'jump_kick', hold: 400, tween: 3 }] },
  u_cut: { frames: [{ pose: 'sword_windup', hold: 14, tween: 3, ease: 'in' }, { pose: 'sword_slash', hold: 5, tween: 3 }, { pose: 'heavy_follow', hold: 400, tween: 6 }] },
  u_volley: { frames: [{ pose: 'throw_windup', hold: 12, tween: 4 }, { pose: 'throw_release', hold: 3, tween: 2, ease: 'in' }, { pose: 'throw_follow', hold: 3, tween: 2 },
    { pose: 'throw_release', hold: 3, tween: 2, ease: 'in' }, { pose: 'throw_follow', hold: 3, tween: 2 }, { pose: 'throw_release', hold: 3, tween: 2, ease: 'in' }, { pose: 'throw_follow', hold: 400, tween: 8 }] },
  u_pass_dash: { frames: [{ pose: 'dash', hold: 400 }] },
  u_pass_cut: { frames: [{ pose: 'sword_slash', hold: 400 }] },
  u_pass_kick: { frames: [{ pose: 'jump_kick', hold: 400 }] },
  u_pass_stab: { frames: [{ pose: 'kunai_strike', hold: 400 }] },
  // her descent: tucked leap, blade overhead the whole fall, the cut lands with her (frame 24), kneeling, rise
  u_drop: { frames: [{ pose: 'dive_wind', hold: 23, tween: 3, ease: 'in' }, { pose: 'dive_cut', hold: 1, tween: 1 }, { pose: 'dive_land', hold: 44, tween: 2 }, { pose: 'stance_b', hold: 400, tween: 16 }] },
  // the victim of a cinematic: jolted by each cut, collapse
  v_hit: { frames: [{ pose: 'hit', hold: 400 }] },
  v_stag: { frames: [{ pose: 'ko_stagger', hold: 400 }] },
  v_fall: { frames: [{ pose: 'ko_stagger', hold: 6, tween: 4 }, { pose: 'ko_fall', hold: 10, tween: 8 }, { pose: 'ko_down', hold: 400, tween: 6 }] },
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
  can: { jump: true, crouch: true, run: true, hop: true, kawarimi: true },
  inputMask: BTN_ALL,
  phys: PHYS, hurt: HURT, moves: MOVES, anims: ANIMS,
  walk: { steps: WALK_STEPS, poses: WALK_POSES },
  run: { poses: RUN_POSES, stride: RUN_STRIDE },
  pickMove,
  projectilePart: 'kunai',
};
