// Samurai (Minimax fighter): movement + combat data. Same entry shapes as game/src/moves.js (MOVES / ANIMS / PHYS / HURT),
// bundled per character for the character registry (contract docs/samurai/04_integration_contract.md §1.4).
// Units: rig master units (character 1180 tall), 60 fps. Box: x forward from the fighter's centre line, y height above ground.
// Animation keys: `hold` = frames on that key; the animator eases toward the next key during the last `tween` frames of the hold
// (default 5); `ease: 'in'` accelerates into the next key (strike keys). Pose names live in art/samurai/poses.json.
//
// Hit boxes were MEASURED from the rig's sword anchors over the active frames (tools/measure_boxes.mjs, see README.md), +40 padding.
// Walk steps come from tools/author_poses.mjs (planted-foot distances, so feet do not slide).

const f = (pose, hold, tween, ease) => ({ pose, hold, ...(tween !== undefined ? { tween } : {}), ...(ease ? { ease } : {}) });

export const SAMURAI = {
  id: 'samurai', name: 'SAMURAI',
  rig: 'art/samurai/rig.json', rigP2: 'art/samurai/rig_p2.json',
  poseFiles: ['art/samurai/poses.json'],
  // no jump, crouch or run: the sim masks those inputs for this fighter (W / S / double-tap do nothing; double-tap = dash only)
  can: { jump: false, crouch: false, run: false },
  phys: { walkF: 9.2, walkB: 7.4, dashV: 20, dashFrames: 14, dashTotal: 28, backdashV: 17, backdashFrames: 14, backdashTotal: 22, pushHalf: 100 },
  hurt: { stand: { x0: -140, x1: 180, y0: 0, y1: 1190 } },

  // planted-foot distance per walk key: steps[i] = travel from walk_{i} to walk_{i+1} (the animator blends key i-1 -> i
  // over steps[i], like WALK_STEPS in game/src/moves.js). Forward = ascending keys, backward = the same keys descending.
  walk: {
    steps: [55.7, 54.3, 56.2, 62.1, 56.1, 55.2, 56.1, 61.6],
    poses: ['walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5', 'walk_6', 'walk_7', 'walk_8'],
  },

  anims: {
    // slow breathing; the left hand never leaves the saya
    idle: { loop: true, frames: [f('stance', 30, 30), f('stance_b', 30, 30)] },
    guard: { loop: true, frames: [f('guard', 30)] },
    hit: { loop: true, frames: [f('hit', 60)] },
    // grounded burst: 3 load + 14 move + 11 brake = dashTotal 28
    dash: { loop: false, frames: [f('dash_start', 3, 3, 'in'), f('dash', 14, 6), f('dash_end', 11, 6)] },
    // grounded back slide (no airborne key): 3 + 14 + 5 = backdashTotal 22
    backdash: { loop: false, frames: [f('backdash_start', 3, 3, 'in'), f('backdash', 14, 6), f('backdash_end', 5, 4)] },
    down: { loop: false, frames: [f('ko_stagger', 6), f('ko_fall', 6), f('ko_down', 200)] },
    wake: { loop: false, frames: [f('wakeup', 8, 6), f('stance_b', 6, 6), f('stance', 2)] },
    knock_air: { loop: false, frames: [f('ko_stagger', 6, 6), f('ko_fall', 60)] },
  },

  moves: {
    // J: quick iaido draw-cut. The blade leaves the saya on the windup -> slash tween (frames 4-6) and is fully out on 7.
    light: {
      name: 'Iai cut', rank: 1, level: 'mid', meter: 8,
      frames: [f('iai_windup', 7, 3, 'in'), f('iai_slash', 5, 3), f('iai_recover', 12, 6), f('stance', 5)],
      active: [7, 12], box: { x0: 140, x1: 1036, y0: 311, y1: 829 }, adv: 4,
      dmg: 90, hitstop: 9, hitstun: 22, blockstun: 14, push: { hit: 20, block: 24 }, power: 2,
      arc: { from: 'iai_windup', to: 'iai_slash', anchor: 'sword_tip', inner: 'sword_guard', samples: 8, life: 12 },
    },
    // L: two-handed overhead cleave. Overhead (stand-block only), knockdown, chip through a block.
    // The box covers the whole downward arc (from above the head to the low follow), so it also catches jump-ins.
    heavy: {
      name: 'Overhead cleave', rank: 3, level: 'overhead', knockdown: true, meter: 16,
      frames: [f('heavy_windup', 16, 3, 'in'), f('heavy_cleave', 6, 3), f('heavy_follow', 16, 8), f('stance', 8)],
      active: [16, 22], box: { x0: 140, x1: 936, y0: 29, y1: 1610 }, adv: 5,
      dmg: 210, chip: 0.25, hitstop: 14, hitstun: 34, blockstun: 22, push: { hit: 34, block: 40 }, launch: { vx: 12, vy: 13 }, power: 3,
      arc: { from: 'heavy_windup', to: 'heavy_cleave', anchor: 'sword_tip', inner: 'sword_guard', samples: 10, life: 14 },
    },
    // U (full meter): "Crimson Crescent". Super freeze (flash showpiece), then one huge draw-sweep releases a crimson crescent
    // that travels along the ground. Startup is NOT invulnerable. Counterplay: block it (chip 175), jump it with good timing,
    // or be out of range (about 1500). Crouching does not avoid it (it is low: y 0..300, a crouching body reaches 870).
    // Integration data fix (prompt 05 stage 1): was h 210 / hgt 420 (y 0..420), but the Shinobi's jump apex is
    // 38^2 / (2*1.7) = 425, so it could not actually be jumped (acceptance item "jumpable"). Now y 0..300.
    ult: {
      name: 'Ultimate: Crimson Crescent', ult: true, level: 'mid', cost: 100, freeze: 34, fade: 2,
      frames: [f('ult_charge', 6, 4), f('ult_windup', 12, 4, 'in'), f('ult_release', 8, 5), f('ult_follow', 14, 7), f('stance', 8)],
      spawnAt: 18,
      // cosmetic, played by the caster during the super freeze (sim time frozen), same idea as the Shinobi's ult.flash
      flash: [f('ult_charge', 7, 6), f('ult_flourish', 19, 8), f('ult_charge', 8)],
      arc: { from: 'ult_windup', to: 'ult_release', anchor: 'sword_tip', inner: 'sword_guard', samples: 10, life: 16 },
      // one wide crescent; h / hgt = centre height / height (same projectile fields as the Shinobi's kunai throw)
      projectile: {
        kind: 'crescent', vx: 34, ox: 420, h: 150, hgt: 300, w: 160, life: 44,
        dmg: 500, chip: 175, noScale: true, knockdown: true, launch: { vx: 14, vy: 12 },
        hitstun: 40, blockstun: 22, hitstop: 10, push: { hit: 30, block: 36 }, meter: 0,
      },
    },
  },
};

for (const m of Object.values(SAMURAI.moves)) m.total = m.frames.reduce((s, fr) => s + fr.hold, 0);
