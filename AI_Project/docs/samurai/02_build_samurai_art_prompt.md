# TASK: Build the Samurai fighter as a rig-ready layered SVG character (same pipeline as the Shinobi)

You are the art-production engineer for a 2D anime-style fighting game. The **Shinobi** is already finished and shipping in the game. Your job is to build the **Samurai** with **the same pipeline, the same rig conventions and the same visual quality**, so that he can be dropped into the existing engine with no engine-side art changes. Work in stages, show renders after each stage, be critical of your own output, and **stop for approval** where indicated.

Project root: `D:\AI\AI_Project`. Put everything for this character in `art/samurai/`. **Do not modify anything under `game/` or the Shinobi's art files**, with one narrowly-scoped exception in 3.4.

---

## 1. Context

- Game: 2D side-view real-time fighting game for a university AI lab. Fighters are algorithms; the Samurai is the **Minimax** fighter (a disciplined, calculating duelist).
- Engine (already built): PixiJS, plain JS. Characters are **cutout puppets**: SVG parts rasterised to textures, attached to a skeleton, posed by `art/shinobi/rig_runtime.js` (shared, engine-agnostic solver, also used by the game's `render.js`), animated with held keyframe poses, plus springs for hair and cloth.
- **The Shinobi is your template.** Read these first, in this order, before writing anything:
  1. `art/shinobi/README.md` (pipeline, rig conventions, effect hooks, limitations)
  2. `art/shinobi/rig_runtime.js` (the solver: transforms, springs, ground lock, held items, slots)
  3. `art/shinobi/src/shinobi.art.mjs`, `src/palette.mjs`, `tools/svglib.mjs` (how art is authored as code)
  4. `art/shinobi/tools/*.mjs` (build, split, pose render, joint check, walk generator)
  5. `art/shinobi/rig.json` (schema in practice), `poses.json`, `poses_extra.json`
  6. `game/src/moves.js` and `game/src/render.js` (how the game consumes poses; frame `hold`, `tween`, `ease`)
- Look at the rendered Shinobi (`art/shinobi/renders/master.png`, `poses_sheet.png`) to see the quality bar.

## 2. The Samurai (design)

### Visual references (LOOK AT THEM; read with the Read tool)
- `references/Silver-Haired Ronin in Dynamic Stance.png`: the original reference image.
- `references/samurai/` (generated reference set, see `docs/samurai/01_reference_image_prompts.md`): character sheet, game-view idle, walk, guard, light/heavy attack poses, dash, hit, KO, faces, costume details, palettes. **The sheet and the game-view idle win over any prose below on conflict.** If a file is missing, say so and work from what exists.

### Character
Tall (about 8.5 heads), broad and lean-muscular, imposing and serious. Slightly taller and wider than the Shinobi: target **about 1180 master units tall** (Shinobi is 1130), clearly **heavier-looking**, with a lower, planted stance.
- Hair: long, messy silver-white, tied loosely low at the nape, long loose strands, a few over the face.
- Face: sharp narrow grey eyes, thin scar across the left cheek / nose bridge, hard calm expression. Same standard of face quality as the Shinobi.
- Costume: tattered charcoal-black kimono with open collar and grey inner layer; frayed wide-sleeved haori-style jacket; **wide pleated black hakama with torn hems** (this hides most of the legs; it is the main cloth silhouette); dark grey obi with a long crimson cloth strip trailing; black fingerless wrist wraps with crimson cord; black shin wraps with crimson cord; black tabi with straw sandals.
- Weapon: long slightly curved **katana** (visible hamon, black diamond-wrap hilt, round bronze tsuba), black lacquered **scabbard (saya)** at the left hip with a red cord. The sword is **sheathed at rest** and drawn for attacks.
- Palette tokens (defined once, like the Shinobi): near-black charcoal `#14141c`, `#26262f`, dark grey `#6e6e78`, silver `#e6e6ee`, crimson `#8f1d2c`, steel (blade), bronze `#8a6a3a`, skin tone. A **second palette (`p2`)** for mirror matches is required: deep indigo-navy and ivory with gold accents, black hair.

### What the Samurai can and cannot do (IMPORTANT, this limits the work)
He has **only**: idle, **walk forward, walk back, dash forward, dash backward**, guard, **light attack, heavy attack, ultimate**, hit reaction, knockdown / KO / wake-up.
He has **NO jump, NO crouch, NO run, NO kick, NO throw**. Do **not** author poses for those. Do **not** build crouch / jump / air / run / kick poses; they would be dead weight.

## 3. Technical requirements

### 3.1 Conventions (identical to the Shinobi; the game depends on them)
- **Master coordinates:** `viewBox 0 0 1000 1400`, character **faces RIGHT**, ground line **y = 1300** (`rig.groundY`), centre line about x = 520. (The Samurai may be wider; keep the centre line at 520 so the engine's positioning code works unchanged.)
- **One source file** (`src/samurai.art.mjs`) authors every part in master coordinates, array order = z-order. Colours only via `src/palette.mjs` tokens (default + `p2`). Reuse `tools/svglib.mjs` helpers (copy the Shinobi's `tools/` and `package.json` into `art/samurai/` and adapt; do not rewrite them from scratch).
- **Build outputs:** `samurai_master.svg`, `parts/*.svg`, `parts/p2/*.svg`, `rig.json`, `rig_p2.json`, `renders/` (master, part sheet, pose sheets, stress sheet, joint closeups).
- **Rotation signs, slots, held items, ground lock, springs, anchors:** exactly as documented in `art/shinobi/README.md`. Re-read the "Rig conventions" and "Effect hooks" sections and obey them.
- Parts overlap generously at joints so nothing gaps when rotated (at least +-30 degrees clean). Every part is self-contained (base fill, clipped shading, outline).
- Face is **slot-swapped**: `face_neutral`, `face_intense` (attack shout), `face_hurt`.

### 3.2 Skeleton and parts
Root is **`pelvis`**. Keep the Shinobi's **bone names** wherever the same bone exists, because the engine's pose tables and the walk generator key on them:

`pelvis`, `waist`, `torso_upper`, `neck`, `head_base`, `upper_arm_near/far`, `forearm_near/far`, hands (slot options below), `thigh_near/far`, `shin_boot_near/far`, `foot_near/far` (+ `foot_near_side` slot variant), faces (`face_neutral/intense/hurt`).

Samurai-specific parts (new ids, you define pivots and parents):
- **Hair:** `hair_back` (static mass), `hair_front` (bangs), a **chain of 4 spring segments** `hair_1..hair_4` for the tied tail/loose lengths, and 2 loose `strand_near/far`.
- **Cloth with secondary motion (all spring-driven):** `sleeve_near`, `sleeve_far` (wide haori sleeves hanging off the upper arms), `haori_tail_back` (back of jacket), `hakama_front_panel`, `hakama_back_panel`, `hakama_side_near`, `hakama_side_far` (the wide trousers: large flowing panels, **the main cloth read**), `obi_knot`, `obi_tail_1a/1b`, `obi_tail_2a/2b` (the crimson strip).
- **Weapon:** `saya` (scabbard on the left hip, with red cord), `sword` (the complete drawn katana: blade + hilt + tsuba, with `grip` point and axis), and the **sheathed state**: when sheathed the sword sits in the saya (follow how the Shinobi's `sword` / `sheath_back` pair works; read `rig_runtime.js` held-item logic and `rig.attachments`). When drawn the saya remains on the hip, **empty**. The hilt must be visible while sheathed.
- **Hands (slots):** `hand_near_*` and `hand_far_*` with options `open`, `fist`, `grip_sword`. Provide a `grip_sword` for **both** hands: the heavy attack is **two-handed** (both grips attach the same sword; use the two-hand logic your reading of the runtime requires, and if the runtime supports only one attach per item, solve it with the sword attached to the near hand and the far hand posed onto the hilt; document the choice). One hand also needs a `grip_saya` (hand resting on the scabbard) or a pose-only solution for the iaido stance.

Required **anchors** (`rig.anchors`): `sword_tip`, `sword_guard`, `hand_near`, `hand_near_grip`, `hand_far_grip`, `fist_near`, `head`, `chest`, `foot_far_toe`, `foot_near_toe`. Also `saya_mouth` (where the blade leaves the scabbard; used for draw effects).

Required **contacts** for ground lock: foot sole polylines for `foot_near`, `foot_far`, and any side variant, as in the Shinobi's `rig.contacts`.

**Springs:** the shared solver reads a hard-coded `SPRINGS` table keyed by the Shinobi's part ids. See 3.4.

### 3.3 Palette, p2, outputs
Run the same flow as the Shinobi: `npm run build` (master + renders, both palettes), `npm run split` (parts + `rig.json` + `rig_p2.json`), `npm run render` (poses/animations), `npm run check` (joint closeups). `rig_p2.json` must reference `parts/p2/*.svg`.

### 3.4 The one permitted change outside `art/samurai/`: data-driven springs
`art/shinobi/rig_runtime.js` hard-codes `SPRINGS`, `WIND` and `STRESS` for Shinobi part ids. Make the **smallest backwards-compatible change**:
- If `rig.springs` exists, use it (same shape as the current `SPRINGS[id]` entries: `{hang,k,c,g}`, plus optional `wind`), else fall back to the existing tables.
- Same for `rig.stress` (joint test ranges).
- Do **not** change any behaviour for the Shinobi. **Prove it:** before the change, render `art/shinobi` `renders/poses_sheet.png`; after the change, re-render and show the two are pixel-identical (or explain any difference). The game imports this same file, so a regression breaks the Shinobi.
- Put the Samurai's spring and stress tables into `rig.json` via the build, not into `rig_runtime.js`.

## 4. Working process (stage-gated; STOP after Stage 1 and Stage 2)

**Stage 0: Study and plan.** Read everything in section 1 and look at all reference images. Write a short plan: the part list with parents and pivots, how you will make the wide hakama read and move, the sword/saya attach strategy, spring list, risks. Check that Node and `@resvg/resvg-js` are available (the Shinobi's `package.json`), and that you can render PNGs and view them. You **must** be able to see your own output.

**Stage 1: Hero render.** Scaffold `art/samurai/` from the Shinobi tooling. Author the **assembled** character in the game-view idle pose (side view facing right, neutral stance, sword sheathed, matching `02_samurai_game_view_idle.png`), organised as `<g id="part-...">` groups. Render at game size (about 430-450 px tall) **and** large. Compare side by side with the references. Do **at least 3 critique-and-fix rounds**, each time listing concrete flaws (proportions, face, hair, hakama silhouette, sleeve shape, wraps, sword and saya, line quality, readability at 440 px against a bright background) and fixing them. Then **STOP and show me the result**. Do not continue until approved.

**Stage 2: Split, rig, and test.** Implement the build for both palettes, produce `rig.json` and `rig_p2.json` (parents, pivots, z-order, slots, anchors, contacts, springs, stress ranges, default pose), make the data-driven spring change (3.4) with the before/after proof, and verify joints under stress (no gaps at the extremes of the walk, guard, strike and cleave ranges). Show the part sheet, stress sheet, joint closeups and a **neutral idle with springs** in a quick preview (reuse `art/shinobi/preview.html` as a base; copy it to `art/samurai/preview.html` and point it at the Samurai). Fix problems, then **STOP for approval**.

Poses, animations and combat data are covered by the **next prompt** (`docs/samurai/03_samurai_moves_and_animation_prompt.md`). Do not start them here.

## 5. Quality bar and anti-patterns

Good: instantly readable heavy-duelist silhouette in solid black at 440 px, hakama and sleeves that clearly move, a sword that visibly draws from and returns to the scabbard, crisp consistent linework matching the Shinobi's cel style, elegant serious face.
Reject and redo: stick limbs, flat blob hair, hakama that looks like two tubes, sleeves welded to the body, a sword that floats in front of the saya, mismatched line weights vs the Shinobi, gaps at joints, hard-coded hex colours, a face that looks cute or comedic, any crouch / jump / run / kick work.

Always view your own renders and compare them with the references before claiming a stage is complete. If something is not good enough, say so plainly and propose the fix. Keep all new files under `art/samurai/` (plus the single change in 3.4).
