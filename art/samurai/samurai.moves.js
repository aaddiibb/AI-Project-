// Samurai (Minimax fighter): movement + combat data. Same entry shapes as game/src/moves.js (MOVES / ANIMS / PHYS / HURT),
// bundled per character for the character registry (contract docs/samurai/04_integration_contract.md §1.4).
// Units: rig master units (character 1180 tall), 60 fps. Box: x forward from the fighter's centre line, y height above ground.
// Animation keys: `hold` = frames on that key; the animator eases toward the next key during the last `tween` frames of the hold
// (default 5); `ease: 'in'` accelerates into the next key (strike keys). Pose names live in art/samurai/poses.json.
//
// Hit boxes were MEASURED from the rig's sword anchors over the active frames (tools/measure_boxes.mjs, see README.md), +40 padding.
// Walk steps come from tools/author_poses.mjs (planted-foot distances, so feet do not slide).

const f = (pose, hold, tween, ease) => ({ pose, hold, ...(tween !== undefined ? { tween } : {}), ...(ease ? { ease } : {}) });

// shared fields of the three Crimson Tempest waves (ult projectiles: unscaled, parryable, a clean hit starts the cinematic)
const WAVE = { ult: true, noScale: true, parryable: true, cine: true, knockdown: true, launch: { vx: 12, vy: 12 },
  hitstun: 40, blockstun: 18, hitstop: 10, push: { hit: 30, block: 26 }, meter: 0 };
// cinematic animation (indexed by the fighter's t during sim.cine): the attacker flashes through one strike key per cut
const CUT_POSES = ['iai_slash', 'heavy_cleave', 'thrust', 'ult_release', 'ult_rise', 'heavy_follow', 'iai_slash'];
const CINE_CUTS = [34, 43, 51, 58, 64, 69, 74, 78, 82, 86, 89, 92, 95, 98];
const cineAtk = [f('heavy_follow', 14), f('dash', 20, 0),
  ...CINE_CUTS.map((t, i) => f(CUT_POSES[i % CUT_POSES.length], (CINE_CUTS[i + 1] ?? 106) - t, 2, 'in')),
  f('heavy_follow', 26, 10), f('ult_sheathe', 16, 14), f('ult_end', 60)];
// strike pairs (windup -> strike) used by the cinematic's cuts (ultfx.js picks one per cut)
export const CINE_STRIKES = [['iai_windup', 'iai_slash'], ['heavy_windup', 'heavy_cleave'], ['thrust_windup', 'thrust'], ['ult_windup', 'ult_release'], ['ult_rise_wind', 'ult_rise']];
export const cineDef = (fr) => [fr('hit', 34, 0), ...Array.from({ length: 22 }, (_, i) => fr(i % 2 ? 'hit' : 'ko_stagger', 3, 1)), fr('ko_stagger', 90)];

export const SAMURAI = {
  id: 'samurai', name: 'SAMURAI',
  rig: 'art/samurai/rig.json', rigP2: 'art/samurai/rig_p2.json',
  poseFiles: ['art/samurai/poses.json'],
  // no jump, crouch or run: the sim masks those inputs for this fighter (W / S / double-tap do nothing; double-tap = dash only)
  can: { jump: false, crouch: false, run: false, parry: true, repel: true },
  // projectile parry: pressing guard opens a `window`-frame window; a projectile (not an ultimate) arriving inside it is
  // deflected with no damage. Re-pressing within `cooldown` frames does not reopen it (no mashing).
  parry: { window: 7, cooldown: 26 },
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
    cine_atk: { loop: false, frames: cineAtk },
    cine_def: { loop: false, frames: cineDef(f) },
    // ---- render-only clips for the Crimson Tempest finale (ultfx.js drives them through f.anim)
    c_impact: { frames: [f('heavy_follow', 400)] },
    // the sheathe + iai stance before the first draw (from cine frame 14)
    c_ready: { frames: [f('heavy_follow', 4, 4), f('ult_sheathe', 8, 6), f('ult_end', 4, 4), f('iai_windup', 400, 6)] },
    // each cut: windup -> strike while crossing her, held through the follow-through
    ...Object.fromEntries(CINE_STRIKES.map(([w, s], i) => ['c_cut' + i, { frames: [f(w, 1, 1, 'in'), f(s, 4, 2), f(s, 400)] }])),
    // after the last cut (from cine frame 98): hold the follow-through, rise, the slow sheathe ... click (151)
    c_finish: { frames: [f('iai_recover', 26, 12), f('ult_sheathe', 18, 18), f('ult_sheathe', 5, 5, 'in'), f('ult_end', 400)] },
    // the victim of the Shinobi's cinematic: jolted by each cut, collapse
    v_hit: { frames: [f('hit', 400)] },
    v_stag: { frames: [f('ko_stagger', 400)] },
    v_fall: { frames: [f('ko_stagger', 6, 4), f('ko_fall', 10, 8), f('ko_down', 400, 6)] },
  },

  moves: {
    // J: quick iaido draw-cut. The blade leaves the saya on the windup -> slash tween (frames 4-6) and is fully out on 7.
    light: {
      name: 'Iai cut', rank: 1, level: 'mid', meter: 8,
      frames: [f('iai_windup', 7, 3, 'in'), f('iai_slash', 5, 3), f('iai_recover', 12, 6), f('stance', 5)],
      active: [7, 12], box: { x0: 140, x1: 1036, y0: 311, y1: 829 }, adv: 4,
      // balance (2026-10-17): block / hit pushback reduced so a blocked iai leaves the Shinobi within dash range (was 20 / 24)
      dmg: 90, hitstop: 9, hitstun: 22, blockstun: 14, push: { hit: 14, block: 12 }, power: 2,
      arc: { from: 'iai_windup', to: 'iai_slash', anchor: 'sword_tip', inner: 'sword_guard', samples: 8, life: 12 },
    },
    // L: two-handed overhead cleave. Overhead (stand-block only), knockdown, chip through a block.
    // The box covers the whole downward arc (from above the head to the low follow), so it also catches jump-ins.
    heavy: {
      name: 'Overhead cleave', rank: 3, level: 'overhead', knockdown: true, meter: 16,
      // balance: follow-through 16 -> 22 frames (-14 on block instead of -8), chip 0.25 -> 0.2, block pushback 40 -> 18
      frames: [f('heavy_windup', 16, 3, 'in'), f('heavy_cleave', 6, 3), f('heavy_follow', 22, 8), f('stance', 8)],
      active: [16, 22], box: { x0: 140, x1: 936, y0: 29, y1: 1610 }, adv: 5,
      dmg: 210, chip: 0.2, hitstop: 14, hitstun: 34, blockstun: 22, push: { hit: 34, block: 18 }, launch: { vx: 12, vy: 13 }, power: 3,
      arc: { from: 'heavy_windup', to: 'heavy_cleave', anchor: 'sword_tip', inner: 'sword_guard', samples: 10, life: 14 },
    },
    // K: forward-stepping draw-thrust. Lunges ~420 units during frames 3..14 (much faster than walking): the gap closer,
    // and the follow-up after a parry. Mid, rank 2 (iai cut -> thrust -> cleave chains on contact).
    thrust: {
      name: 'Stepping thrust', rank: 2, level: 'mid', meter: 8,
      frames: [f('thrust_windup', 6, 3, 'in'), f('thrust', 8, 3), f('thrust_recover', 13, 6), f('stance', 5)],
      lunge: { from: 3, to: 14, v: 36 },
      active: [6, 14], box: { x0: 140, x1: 1145, y0: 330, y1: 520 }, // measured: blade fwd 635..1105, up ~300..430
      dmg: 80, hitstop: 9, hitstun: 22, blockstun: 14, push: { hit: 18, block: 12 }, power: 2, // balance: block pushback 26 -> 12
    },
    // REPEL (guard + light: Space + J, 25 meter): usable ANYTIME (hitstun, blockstun, knocked down, getting up, mid-attack).
    // A blade shockwave: invulnerable frames invuln[0..1]; on frame repel.at everyone within repel.range is shoved away with
    // no damage (stagger `stun` frames, knockback `kb`), so both sides start even again. Cooldown frames after use.
    repel: {
      name: 'Repel', rank: 0, level: 'mid', fade: 1, cost: 25, cooldown: 150, invuln: [0, 14],
      repel: { at: 4, range: 900, kb: 90, stun: 20 },
      frames: [f('parry', 4, 3, 'in'), f('ult_release', 8, 4), f('ult_follow', 10, 6), f('stance', 8)],
    },
    // perfect-timed guard vs a projectile (started by the simulator, not a button). Cancellable into any normal from `cancelFrom`.
    parry: {
      name: 'Parry', rank: 0, level: 'mid', cancelFrom: 3, fade: 1,
      frames: [f('parry', 4, 3, 'in'), f('parry_hold', 12, 6), f('stance', 4)],
    },
    // U (full meter): "Crimson Tempest". Super freeze (flash showpiece; nothing can hit during it), then three swings, each
    // releasing a crimson slash-wave that crosses the whole screen. Each wave needs a different answer:
    //   1 rising draw-cut  -> HIGH wave (y 890..1230): crouch under it (a crouching Shinobi reaches 870)
    //   2 low sweep        -> LOW wave  (y 0..300):    jump it (the Shinobi's jump apex is 425)
    //   3 overhead cleave  -> TALL wave (y 0..1300):   block it, or forward-dash THROUGH it (dash frames 2..16 pass through)
    // All waves hit MID (blockable standing: the Samurai cannot crouch) and are parryable one by one (timed guard tap).
    // The blade draw after the freeze is NOT invulnerable (hit there = the ult and its meter are lost).
    // A CLEAN hit by any wave starts the cinematic (`cine`): both fighters locked, fixed damage frames, then a knockdown.
    // Ult vs ult: when any wave meets an opposing ult projectile (regardless of height), BOTH ultimates are cancelled
    // completely, waves not yet thrown included (sim.clashProjectiles). A wave eats a normal kunai it touches.
    ult: {
      name: 'Ultimate: Crimson Tempest', ult: true, level: 'mid', cost: 100, freeze: 34, fade: 2,
      // Fast (2026-10-18): the three waves leave within 38 frames. They fly at different speeds (high 40, low 22, tall 20) so
      // a Shinobi can still duck the high one and then jump the low one, but the tall one arrives as she lands: a full dodge
      // chain is no longer possible, the safe answer is crouch-blocking (the high wave misses, low + tall cost chip).
      // (2026-10-18: compressed to the Shinobi ultimate's pace, 128 -> 63 frames: the three swings come 15 frames apart)
      frames: [f('ult_charge', 3, 3), f('ult_rise_wind', 4, 2, 'in'), f('ult_rise', 6, 3),        // swing 1 lands on t 7
        f('ult_windup', 9, 3, 'in'), f('ult_release', 5, 2), f('ult_follow', 3, 2),                // swing 2 on t 22
        f('heavy_windup', 8, 3, 'in'), f('heavy_cleave', 5, 2), f('heavy_follow', 12, 6), f('stance', 8)], // swing 3 on t 38
      // cosmetic, played by the caster during the super freeze (sim time frozen), same idea as the Shinobi's ult.flash
      flash: [f('ult_charge', 7, 6), f('ult_flourish', 19, 8), f('ult_charge', 8)],
      arcs: [ // swing 1 (the rising draw) has no trail: interpolated from a sheathed pose it smears into a panel
        { at: 22, from: 'ult_windup', to: 'ult_release', anchor: 'sword_tip', inner: 'sword_guard', samples: 10, life: 16 },
        { at: 38, from: 'heavy_windup', to: 'heavy_cleave', anchor: 'sword_tip', inner: 'sword_guard', samples: 10, life: 16 },
      ],
      waves: [
        { at: 8, kind: 'wave', shape: 'high', vx: 40, ox: 360, h: 1060, hgt: 340, w: 170, life: 180, dmg: 60, chip: 40, ...WAVE },
        { at: 23, kind: 'wave', shape: 'low', vx: 22, ox: 400, h: 150, hgt: 300, w: 170, life: 180, dmg: 60, chip: 40, ...WAVE },
        { at: 39, kind: 'wave', shape: 'tall', vx: 20, ox: 380, h: 650, hgt: 1300, w: 220, life: 260, dmg: 90, chip: 70, ...WAVE,
          evade: { states: ['dash'], from: 2, to: 14 } }, // (was 16; the Shinobi's faster dash (2026-10-17) needs 14 to keep the ~6-frame window)
      ],
      // the punishment (sim frames after the clean hit): impact, ink-wash + blink, 14 accelerating cuts, silence, the X.
      // Damage 40 + 14 x 18 + 2 x 90 = 472, unscaled; only the X can KO.
      cine: {
        len: 180, impact: 40, slashDmg: 18, xDmg: 90,
        slashes: [34, 43, 51, 58, 64, 69, 74, 78, 82, 86, 89, 92, 95, 98],
        x: [152, 156], land: 106,
        launch: { vx: 10, vy: 14 },
      },
    },
  },
};

for (const m of Object.values(SAMURAI.moves)) m.total = m.frames.reduce((s, fr) => s + fr.hold, 0);
