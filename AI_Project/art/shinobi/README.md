# Shinobi: vector fighter art pipeline

The Shinobi (MCTS fighter) is authored as code, split into 47 rig parts, and animated as a cutout puppet with stepped, held poses.
Everything lives in this folder. The same pipeline is meant to be reused for the Samurai and Oni.

## Quick start

```bash
npm install          # one dependency: @resvg/resvg-js (SVG -> PNG for review renders)
npm run all          # build master SVG -> split parts + rig.json -> render poses/animations -> joint check
python -m http.server 8765    # then open http://localhost:8765/preview.html
```

The preview must be served over HTTP: it fetches JSON and loads ES modules.

## Files

| Path | What it is |
|---|---|
| `src/shinobi.art.mjs` | **Art source.** Every part as code in master coordinates (`viewBox 0 0 1000 1400`, faces right, ground ≈ y 1300). The array order is the z-order. |
| `src/palette.mjs` | **The only place colours are defined** (`default` = P1, `p2` = alternate). Art references tokens via classes `f-<token>` / `s-<token>`. |
| `tools/svglib.mjs` | Drawing helpers: smooth curves, tapered "inked" strokes, self-contained shaded shapes (base, clipped shading, outline), open outlines for joints. |
| `shinobi_master.svg` | Generated master: one `<g id="part-…">` per part, in z-order. |
| `parts/*.svg`, `parts/p2/*.svg` | Generated per-part SVGs, tightly cropped (the viewBox is the part's master-space box). |
| `rig.json`, `rig_p2.json` | Skeleton: parent, pivot, zIndex, file, offset, size, slots, grips, foot contacts, effect anchors, default pose. |
| `poses.json` | Named poses (rotations, root offset, slot swaps, held items). |
| `animations.json` | Move set: stepped frames (`pose`, `hold` at 60 fps, `dx` root motion) plus effect events. |
| `rig_runtime.js` | Engine-agnostic solver (ES module), used by both the browser preview and the Node tools. |
| `preview.html` | PixiJS v8 (CDN) rig test: animations, poses, idle and springs, stepped-on-3s display, mirror, pivots, hitboxes, joint stress test, P1/P2. |
| `renders/` | Review images: `master.png`, `part_sheet.png`, `poses_sheet.png`, `anim_sheet.png`, `stress_sheet.png`, `joint_closeups.png`, zoom crops. |

## Scripts

| Command | Does |
|---|---|
| `npm run build` | Writes `shinobi_master.svg` and master renders for both palettes. |
| `npm run split` | Writes per-part SVGs, `rig.json` / `rig_p2.json`, `renders/parts/*.png` and `renders/part_sheet.png`. |
| `npm run render` | Writes `renders/poses/*.png`, `poses_sheet.png`, `stress_sheet.png` and `anim_sheet.png` (same solver as the preview). |
| `npm run check` | Writes `renders/joint_closeups.png` (knees, elbows, shoulder, hip, ankle, neck at extreme rotation). |
| `npm run plant -- <pose…>` | Adjusts the floating leg of the named poses so both soles sit flat. Run it only on poses that should have both feet down. |
| `npm run walk` | Regenerates the 8-key walk cycle (`walk_1..8`, `walk_forward`, `walk_back`). Keys are foot targets, solved with two-bone IK; root steps keep the planted foot fixed. |
| `npm run video` | Renders `renders/showcase.mp4` and `showcase.gif` (combo reel with springs and effects; needs ffmpeg). `node tools/video_render.mjs <anim> [speed]` renders any animation. |

## Rig conventions

- **Units:** master units. The recommended screen scale is `rig.recommendedScale` (0.38), which makes the character about 430 px tall.
- **Transforms:** each part's world matrix is `parent ∘ rotateAbout(pivot, rot)`, and maps master coordinates to the world. A sprite is drawn at `offset` with `size`. The root is `pelvis`, plus `pose.root`.
- **Rotation signs:** degrees, clockwise positive.
  - Hanging limbs: negative swings forward. Elbows flex negative, knees flex positive.
  - Upright parts (waist, torso, neck, head): positive leans forward.
- **Mirroring** for facing left is a flip in the stage transform only. Physics and poses are unaffected.
- **Slots** (`hand_near`, `hand_far`, `face`, `foot_near`): exactly one option is visible. Variants share one rotation key (`rotKey`): all hands of a side use `hand_*_open`, and both near feet use `foot_near`.
- **`foot_near`** is the camera-facing tabi by default (stances, as in the concept art). Walks and the dash swap in `foot_near_side` so both feet travel side-on.
- **Held items** (`sword`, `kunai`):
  - `pose.attach.sword = "hand_near_grip_sword"` puts the item's grip point onto the hand's grip point and aligns the axes, so the blade points along the hand's +x.
  - `pose.attachRot` rotates the item about the grip.
  - At rest the sword rides `sheath_back`.
- **Ground lock** (on by default):
  - The root is moved so the lowest sole contact (`rig.contacts`) sits at its rest height. The near foot is drawn lower than the far foot for perspective.
  - Lying poses use `groundBy: [parts]` instead.
- **Secondary motion:** spring bones are `pony_1..4`, `sash_tail_*`, `strand_*` and the skirt panels.
  - They hang under gravity relative to their parent's world angle, react to pivot acceleration, and get a little wind.
  - `pose.springHang` scales the hang (KO-down uses 0.12).
- **Stepped look:** physics runs every frame; the preview updates the picture on 3s. Animation frames are held poses with no tweening.

## Effect hooks (`animations.json` events)

| Event | Fields | Use |
|---|---|---|
| `hitbox` | `anchor`, `radius` | Active hit circle for that frame (e.g. `kunai_tip`, `sword_tip`). |
| `slashArc` | `anchor`, `inner`, `from`, `to`, `samples`, `life` | Blade trail: the sword-tip path sampled across the blend `from → to`. Draw it as a crescent toward `inner`. |
| `spawn` | `item`, `anchor`, `velocity`, `life` | Projectile (the thrown kunai) spawned at the anchor. |
| `flash` | `frames` | Hit tint. |

Frame fields:

- `dx`: root motion per game frame.
- `step`: root motion applied once when the key starts. Walks use it so feet don't slide during held frames.
- `startX`: start offset for one-shot sequences.

`showcase` chains the whole move set into a combo reel.

The anchors (`rig.anchors`) are `sword_tip`, `sword_guard`, `kunai_tip`, `hand_near`, `hand_near_grip`, `hand_far_grip`, `fist_near`, `head`, `chest`, `foot_far_toe` and `foot_near_toe`.

## Editing the art

1. Edit `src/shinobi.art.mjs` (geometry) or `src/palette.mjs` (colours).
2. Run `npm run all`. Pivots, parents and grips live next to each part's `add(...)` call.
3. Before adding a part or palette token, read `tools/svglib.mjs`.
   - `shape()` keeps every part self-contained: base fill, shading clipped to the base, and an outline.
   - Use `olD: Sseg(...)` to leave the joint end of a limb un-outlined.

## Known limitations

- Flat cel style with bold lines, chosen for readability at about 430 px. It is less painterly than the concept render.
- The hands are readable at game size but simple up close.
- The ponytail and sash are sliced into rigid segments. Large bends can show a cut edge (overlap hides gaps up to about 30°).
- While a character lies down (KO), hair and cloth can dip slightly below the floor line.
- The preview steps one animation frame per display tick, so it assumes a 60 Hz display.
