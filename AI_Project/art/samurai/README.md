# Samurai: vector fighter art pipeline

The Samurai (Minimax fighter) uses the Shinobi's pipeline. He is authored as code, split into 48 rig parts, and animated as a cutout puppet by the **shared** `art/shinobi/rig_runtime.js`. All the work lives in this folder. The only exception is the backwards-compatible springs/stress change to the runtime (see [Data-driven springs](#data-driven-springs-the-one-change-outside-this-folder)).

## Quick start

```bash
npm install          # one dependency: @resvg/resvg-js
npm run all          # build -> split -> poses + measured boxes -> renders -> joint check + acceptance checks
# preview (it imports ../shinobi/rig_runtime.js, so serve the PROJECT ROOT):
python -m http.server 8767        # from the project root, then open http://localhost:8767/art/samurai/preview.html
```

## Files

| Path | What it is |
|---|---|
| `src/samurai.art.mjs` | **Art source.** Every part as code in master coordinates (`viewBox 0 0 1000 1400`, faces right, strict profile, ground y 1300, centre x 520). Array order = z-order. |
| `src/palette.mjs` | **The only place colours are defined:** `default` (charcoal, crimson, silver hair) and `p2` (indigo-navy, ivory, gold, black hair). |
| `src/rig_data.mjs` | Springs, joint stress ranges, foot contacts, effect anchors and attachments (all computed from the art's constants). |
| `samurai_master.svg` | Generated master: one `<g id="part-…">` per part. |
| `parts/*.svg`, `parts/p2/*.svg` | Per-part SVGs, tightly cropped. |
| `rig.json`, `rig_p2.json` | Skeleton (contract §1.2) including the new `springs` and `stress`. `rig_p2.json` differs only in `file` (`parts/p2/`). |
| `poses.json` | All 33 contract poses (generated, see `tools/author_poses.mjs`). |
| `walk.json` | Planted-foot distances of the generated walk keys. |
| `samurai.moves.js` | Combat/movement data module (contract §1.4): `SAMURAI = { id, rig, poseFiles, can, phys, hurt, walk, anims, moves }`. |
| `preview.html` | PixiJS rig test that plays every action from `samurai.moves.js`. |
| `renders/` | Review images and reports (listed below). |

## Scripts

| Command | Does |
|---|---|
| `npm run build` | `samurai_master.svg` plus master renders for both palettes, zoom crops, and `compare.png` (game-view idle reference overlaid). |
| `npm run split` | Part SVGs, `rig.json` / `rig_p2.json`, `renders/parts/*.png`, `renders/part_sheet.png`. |
| `npm run poses` | `tools/author_poses.mjs` writes `poses.json` + `walk.json`. Then `tools/measure_boxes.mjs --write` measures the attack boxes from the sword anchors and writes them into `samurai.moves.js`. |
| `npm run render` | `renders/poses/*.png`, `poses_sheet.png`, `stress_sheet.png`, `anim_sheet.png` and one `anim_<row>.png` per action (box / arc / crescent overlays). |
| `npm run check` | `renders/joint_closeups.png`, then `tools/check_package.mjs`: the contract acceptance checks (`renders/check_report.txt`). |
| `npm run anchors` | Anchor positions (forward from the centre line, height above ground) for the strike poses. |
| `npm run proof` | Re-renders the Shinobi with the current runtime and diffs it against the capture taken **before** the runtime change. |
| `node tools/render_extra.mjs [--anchors] <poses…>` | Pose workbench (`renders/extra_pick.png`). |

## Rig conventions (same as the Shinobi; differences called out)

- **Units / transforms / rotation signs / mirroring / slots / ground lock:** identical to `art/shinobi/README.md`. Root is `pelvis`. Rotations are clockwise-positive. Hanging limbs swing forward with negative values; knees flex positive. Facing left is a stage flip only.
- **Strict profile.** Near = camera side = his **right** side. As for the Shinobi, the near leg is the back leg (screen left) and the far leg the front leg. Both feet share one ground line (no near/far perspective offset).
- **`recommendedScale` 0.3797** (about 448 px tall at game size; height 1180).
- **Hakama (the main cloth read).** Each trouser leg has two pieces:
  - `thigh_*`: the upper trouser.
  - `hakama_side_*`: the lower trouser with the torn hem. It hangs from the **knee** (parent `shin_boot_*`), so the hem follows the shin and can never sink under the floor.

  The pleated centre panels hang from the hips. `hakama_front_panel` rides the front thigh and `hakama_back_panel` the back thigh, both with a spring hang of 0.5, so they sit halfway between the leg and vertical. In a lunge the hakama spreads like a skirt.
- **Feet.** `foot_near` and `foot_near_side` are the same profile tabi + sandal. The `foot_near_side` slot option is kept so tools and poses that swap it keep working.
- **Hands (slots).**
  - `hand_near_{open,fist,grip_sword}`.
  - `hand_far_{open,fist,grip_sword,grip_saya}`. `grip_saya` is the default: his left hand rests on the saya, thumb on the tsuba.
- **Faces (slot `face`).** `face_neutral`, `face_intense` (open-mouth shout via a jaw-drop overlay, since the face is in profile), `face_hurt`. The scar is on all three.

### Sword and saya (held items)

- `sword` is the complete katana (blade with hamon, diamond-wrapped hilt, round bronze tsuba). It is drawn at the sheathed position as a child of `saya`, which hangs on the pelvis at the left hip. `rig.attachments.sword.rest = 'saya'` and `defaultPose.attach.sword = 'saya'`.
- **z-order:** sword < saya < body. The saya hides the blade, the body hides the saya mouth, and the hilt and tsuba stick out in front of the obi (visible).
- **Drawn:** `pose.attach.sword = 'hand_near_grip_sword'` puts the grip onto the right hand. The runtime gives the sword `zOverride` just below the hand. The **saya stays on the hip, empty.** `pose.rot.saya` tilts the scabbard (the iaido push forward / pull back).
- **Two-handed heavy (documented choice).** The runtime attaches an item to ONE hand. The sword attaches to the near (right) hand at the tsuba end. The far (left) hand is posed onto the pommel-end grip point (`rig.attachments.sword.secondGrip`, anchor `sword_grip2`) by a numeric IK solve in `tools/posekit.mjs` (`farOnHilt`). Measured hand-to-grip error: heavy_windup 0.3, heavy_cleave 0.6, heavy_follow 0.2 units.
- **Anchors:** `sword_tip`, `sword_guard`, `sword_grip2`, `saya_mouth` (where the blade leaves the scabbard; for draw effects), `hand_near`, `hand_near_grip`, `hand_far_grip`, `fist_near`, `head`, `chest`, `foot_far_toe`, `foot_near_toe`.

### Springs (secondary motion)

17 spring bones, all listed in `rig.springs`:
- tied tail `hair_1..4`; loose locks `strand_near/far`;
- `sleeve_near/far` (wide haori sleeves);
- `haori_tail_back`;
- `hakama_front_panel`, `hakama_back_panel`, `hakama_side_near/far`;
- crimson obi strip `obi_tail_1a/1b/2a/2b`.

Each entry is `{ hang, k, c, g, wind }`. `pose.springHang` lowers the hang on lying poses (`ko_down` uses 0.12).

## Data-driven springs: the one change outside this folder

`art/shinobi/rig_runtime.js` now reads `rig.springs` / `rig.stress` when present and falls back to its built-in Shinobi tables otherwise. The diff is 4 changed lines plus 3 helpers (`springsOf`, `stressOf`, `windOf`), saved in `renders/proof/rig_runtime.diff`.

**Proof the Shinobi is unchanged:** `tools/shinobi_proof.mjs` captured the Shinobi before the edit and again after. `renders/proof/proof.txt`:

```
poses_sheet PNG bytes identical: true  (sha256 babfb4c3ad84d341 vs babfb4c3ad84d341)
decoded pixel channels differing: 0 of 18432000
240-frame dynamic sim (idle + springs + wind + stress) world matrices identical: true  (sha256 948fefa9796fb6c8 vs 948fefa9796fb6c8)
```

The renders are `renders/proof/shinobi_before.png` and `shinobi_after.png`. The game imports `mul, T, R, ap, solve, anchor, blendPoses, groundOffset`, and their behaviour for the Shinobi is identical.

## Poses (`poses.json`, contract §1.3)

All 33 required names are present, with no extras. There is **no** jump / crouch / run / kick / air / throw pose and no `ground: false` pose; the back-dash is a grounded slide.

| Group | Poses | Notes |
|---|---|---|
| Idle | `stance`, `stance_b` | Wide planted stance, left hand on the saya, right hand loose. |
| Walk | `walk_1..8` | Generated with two-bone IK from foot targets: shorter stride and less bob than the Shinobi, left hand stays on the saya. |
| Dash | `dash_start`, `dash`, `dash_end` | Load, near-horizontal lean with the hand on the hilt, heel skid. Sheathed. |
| Back-dash | `backdash_start`, `backdash`, `backdash_end` | Lean back, heels dragging (grounded). |
| Guard | `guard` | Fists raised in front of chest and face, knees bent. Sheathed. |
| Light | `iai_windup`, `iai_slash`, `iai_recover` | Sheathed grip → blade horizontal at chest height (saya pulled back) → blade low. |
| Heavy | `heavy_windup`, `heavy_cleave`, `heavy_follow` | **Two hands on the hilt** in all three. Blade overhead and behind → 44° chop in a deep lunge → low follow. |
| Ultimate | `ult_charge`, `ult_windup`, `ult_release`, `ult_follow`, `ult_flourish` | Sheathed crouch → blade swept back → wide sweep forward → follow-through up → chiburi (cosmetic, plays during the freeze). |
| Reactions | `hit`, `ko_stagger`, `ko_fall`, `ko_down`, `wakeup` | `ko_fall` / `ko_down` use `groundBy`; `ko_down` has `springHang: 0.12`. |

- **Sword drawn** (attached to the right hand) in exactly: `iai_slash`, `iai_recover`, `heavy_*`, `ult_windup`, `ult_release`, `ult_follow`, `ult_flourish`. Everywhere else it rests in the saya.
- **Faces:** `face_intense` on every `iai_*` / `heavy_*` / `ult_*` pose, `face_hurt` on `hit` and the KO poses.
- **Editing:** change `tools/author_poses.mjs`, not `poses.json`. Poses are written as absolute limb angles (`posekit.mjs`: `leg`, `arm`, `ikLeg`, `body`). Hands find the hilt and saya with `reach()`, and blade directions are set in world degrees (`blade(pose, angle)`).

## Move data (`samurai.moves.js`)

Same entry shapes as `game/src/moves.js`. Totals: light 29, heavy 46, ult 48 frames; dash 28, back-dash 22.

| Move | Frames (hold) | Active | Box (x fwd / y up) | Damage | Notes |
|---|---|---|---|---|---|
| Light `iai cut` | windup 7, slash 5, recover 12, stance 5 | 7–12 | x 140..1036, y 311..829 | 90 | mid, hitstun/blockstun 22/14, push 20/24, hitstop 9, power 2, meter 8, adv 4, blade arc |
| Heavy `overhead cleave` | windup 16, cleave 6, follow 16, stance 8 | 16–22 | x 140..936, y 29..1610 | 210 | **overhead**, knockdown, chip 0.25, hitstun/blockstun 34/22, push 34/40, hitstop 14, power 3, meter 16, adv 5, launch 12/13, blade arc |
| Ultimate `Crimson Crescent` | charge 6, windup 12, release 8, follow 14, stance 8; spawn at frame 18; freeze 34 with `flash` (charge → chiburi → charge) | projectile | crescent w 160, y 0..300 (was 0..420, see data fix below), speed 34, life 44 (range ≈ 1500 + 420) | 500 / chip 175 | `noScale`, knockdown, **no invulnerability**, cost 100 |

### Boxes were measured, not guessed

`tools/measure_boxes.mjs` reproduces the animator's sampling on each frame of the window (hold, tween, ease) and solves the pose with ground lock. It then samples the blade from `sword_guard` to `sword_tip` (25% to 100% out), measures forward from the centre line (root motion included) and up from the ground, and adds 40 of padding.

`x0` is clamped to the fighter's front (140): the blade sweeps through that space, and a point-blank opponent (centre about 200, body about 35..325) must not stand under the blade unhit. For the heavy, the last swing frame before the active window (f15, blade overhead) is counted where it is in front of him. That frame is what lets the cleave catch jump-ins. Output (`renders/boxes_measurement.txt`):

```
light: frames 7..12
  f 7 iai_slash                          tip fwd 996 up 789 | guard fwd 527 up 756
  f 9 iai_slash>iai_recover 0.13         tip fwd 989 up 730 | guard fwd 518 up 723
  f10 iai_slash>iai_recover 0.50         tip fwd 940 up 558 | guard fwd 475 up 631
  f11 iai_slash>iai_recover 0.88         tip fwd 856 up 400 | guard fwd 410 up 550
  f12 iai_recover                        tip fwd 820 up 351 | guard fwd 384 up 527
  blade extent  fwd 493..996  up 351..789  -> box (+40) {"x0":140,"x1":1036,"y0":311,"y1":829}
heavy: frames 15..22
  f15 heavy_windup>heavy_cleave 0.56     tip fwd 607 up 1570 | guard fwd 420 up 1139
  f16 heavy_cleave                       tip fwd 896 up 184 | guard fwd 546 up 498
  f19 heavy_cleave>heavy_follow 0.13     tip fwd 882 up 160 | guard fwd 526 up 466
  f20 heavy_cleave>heavy_follow 0.50     tip fwd 825 up 103 | guard fwd 449 up 385
  f21 heavy_cleave>heavy_follow 0.88     tip fwd 748 up 73 | guard fwd 354 up 330
  f22 heavy_follow                       tip fwd 719 up 69 | guard fwd 320 up 318
  blade extent  fwd 420..896  up 69..1570  -> box (+40) {"x0":140,"x1":936,"y0":29,"y1":1610}
```

> **Balance note (deviation from prompt 03 §3.2 / §5).** The prompt estimated reach at about 650 (light) and about 700 (heavy). With a to-scale katana (blade 470 units, about 40% of his height) held horizontally on a straight arm, the light measures 996. The reference strike image shows an even longer reach. Because "boxes that do not match the drawn blade" are a reject, the boxes follow the art. The lunge is already reduced to 36 units. The Samurai therefore has very long reach, his intended trade-off for being slow (light 29 frames vs the Shinobi's 21). If playtesting shows it is too much, the cheapest fixes are: shorten `BLADE` in `src/samurai.art.mjs`, or bend the elbow more in `iai_slash` (in `author_poses.mjs`), then `npm run all`. The boxes update themselves.

### Walk

`walk.steps = [55.7, 54.3, 56.2, 62.1, 56.1, 55.2, 56.1, 61.6]`, 457 units per cycle. These are the planted-foot distances from the generated keys, in the animator's order: `steps[i]` is the travel from key i−1 to key i, as with `WALK_STEPS`. At `walkF` 9.2 one cycle takes about 50 frames. The planted foot slides at most **0.4 units** (0.1 px) during the key blends (`check_package.mjs`).

## Data fix from integration (game side, prompt 05 stage 1)

- `moves.ult.projectile`: `h 210 / hgt 420` (y 0..420) became `h 150 / hgt 300` (y 0..300). With 420 the crescent could not be
  jumped: the Shinobi's jump apex is `jumpVy² / (2·gravity) = 38² / 3.4 ≈ 425`, so his feet clear 420 for only about 5 frames
  while the crescent needs about 14 frames to pass under him. At 300 his feet are above it for about 25 frames, while a
  crouching body (hurtbox up to 870) is still hit. This is a hand-authored projectile field (not a measured hit box;
  `measure_boxes.mjs` only rewrites `box:`). Re-run `npm run all` to refresh the renders that draw the crescent.

## Notes for the integrator

- `anims.wake` uses `stance_b` where the Shinobi uses `land`; the Samurai has no `land` pose.
- `moves.ult.projectile.kind = 'crescent'` is new: one wide low projectile using the kunai-throw fields (`vx, ox, h, hgt, w, life, dmg, chip, …`) plus `knockdown` and `launch`. Draw it from the sword's `arc` at release, as in `preview.html`.
- `moves.heavy.chip = 0.25` is a fraction (contract §1.4). `moves.ult.projectile.chip = 175` is absolute, like the Shinobi's `fan.chip`.
- The back-dash is grounded: `backdashV` 17 for `backdashFrames` 14, then 8 frames of recovery (`anims.backdash` totals `backdashTotal` 22).
- `can: { jump: false, crouch: false, run: false }`.

## Acceptance checklist (contract §1.5)

- [x] **`npm run all` runs clean after `npm install`.** `npm install` reports "up to date"; `npm run all` ends with `all checks passed` (about 95 s).
- [x] **`rig.json` and `rig_p2.json` load, every `file` exists, both palettes render.** `check_package.mjs`: "default rig: every part file exists under parts/ (48 parts)", "p2 rig … under parts/p2/", "rig_p2.json matches rig.json except files". Renders: `renders/master.png`, `master_p2.png`, `master_small*.png`, `renders/preview/walk_p2.png`.
- [x] **Every pose in §1.3 exists and renders without gaps at game size (about 448 px).** "every contract pose exists (33 required)". `renders/poses_sheet.png`, `renders/stress_sheet.png`, `renders/joint_closeups.png` (knees, elbows, shoulders, hip, ankle, neck, waist, wrist at the walk / guard / strike / cleave extremes).
- [x] **The Shinobi still renders identically.** `renders/proof/proof.txt`: identical PNG bytes (0 of 18,432,000 channels differ) and identical 240-frame spring simulation.
- [x] **Every pose name used in `samurai.moves.js` exists in `poses.json`.** "every pose name used in samurai.moves.js exists in poses.json (33 names)".
- [x] **Hitboxes were measured from anchors.** Output above, `renders/boxes.json`, and the check "light/heavy box equals the anchor measurement".
- [x] **A preview page shows every action with springs running.** `preview.html` has idle, walk fwd/back, dash, back-dash, guard, light, heavy, ultimate (freeze flash, arc, travelling crescent), hit, KO + wake-up and a combo reel, with P1/P2, mirror, pivots, boxes and stepped display. Verified in headless Chrome: `renders/preview/*.png`. Capture hook: `preview.html?action=heavy&at=17&zoom=1&palette=p2`.
- [x] **No jump, crouch, run, kick or air poses.** "no jump / crouch / run / kick / air / throw poses", "no airborne (ground:false) poses".

## Known limitations

- Flat cel style with bold lines, matching the Shinobi. The cloth is darker and flatter than the painted references.
- On a fully raised arm, the wide sleeve lies along the arm like a panel. The runtime clamps spring rotation at ±70°, so it cannot drape further.
- The near hand on the **sheathed** hilt holds it in reverse grip direction (axis toward the pommel). A 2D cutout cannot pronate the wrist. On the draw, the attach switches, so the hand art snaps once at the tween midpoint, as for the Shinobi's sword.
- The far (left) arm is drawn behind the torso. In `guard`, only the part of that arm in front of the body outline is visible.
- When lying or crouching very low, hair and the hakama hem can dip a few units below the floor line (same as the Shinobi).
- The original `Silver-Haired Ronin in Dynamic Stance.png` was not available. The character sheet and the generated set (copied into `references/samurai/` under the prompt's names) were used. The guard reference faces left and was mirrored.
