# TASK: Build the Shinobi fighter as a rig-ready layered SVG character (vertical-slice art test)

You are the art-production engineer for a 2D anime-style fighting game. This is the **first character** we build, and it is a *style test*: if the result is good, the same pipeline will be reused for the rest of the cast. Work in stages, show me your results visually after each stage, and be critical of your own output.

---

## 1. Project context (read this first)

- **Game:** a 2D side-view fighting game for a university AI Laboratory course. It is played in real time by humans and by AI agents (Minimax, MCTS, Fuzzy Logic, etc.). Fighters are literally the algorithms: the **Shinobi is the MCTS fighter** (trickster, shadow clones, smoke), a Samurai will be Minimax (later), a large Brute/Oni will be the Fuzzy-logic fighter (later).
- **Stack (planned):** TypeScript + PixiJS in the browser. Characters are **cutout/skeletal puppets**: SVG parts rasterized to textures once at load, attached to a skeleton, animated with **stepped, held poses** (changing every 2-3 frames) for a snappy anime feel. Animation is *not* done in this task beyond a rig test.
- **Team:** two university students, no illustrator. You (an LLM) author all vector art as code. No hand drawing is possible, so **art direction is chosen around what clean vector code can achieve well** (see section 3).
- **Look & tone the user wants:** serious, elegant, tall and heroic proportions, as close to the reference illustration as vector code can get. Not chibi, not cartoonish, not goofy.
- **Environment note:** the folder `F:\__Projects\AI\AI_Project` is the project root. Stages (backgrounds) will be bright traditional-Japanese environments, so the dark characters must **pop against bright backgrounds**: strong outline, clean silhouette, crimson accents.

## 2. Reference images (LOOK AT THEM with the Read tool before anything else)

- `references/Shinobi Assassin Character Concept Sheet.png`: **the design target for this task.** It has hero stance, front / side / back views, a face close-up, combat pose, detail crops, weapons & gear, and a color palette. Study every panel.
- `references/Silver-Haired Ronin in Dynamic Stance.png`: the **Samurai** (NOT this task). Use it only as a *tone/rendering* reference: tattered dark cloth, red wrap accents, serious expression, rim-lit dark figure. Do not build it now.

### Shinobi design summary (verify against the sheet; the sheet wins on any conflict)
- Female, tall, athletic, long legs (~8 to 8.5 heads tall), calm hard expression with sharp eyes (violet-grey irises).
- **Hair:** very long, near-black with blue-indigo sheen, high ponytail tied with a red ribbon, loose side strands and long flowing tail. Hair is a major secondary-motion element.
- **Outfit:** sleeveless high-collar black top with neck scarf/high collar and a small red knot ornament; bare midriff; black fingerless arm sleeves/gloves with red cord lacing; dark-indigo tattered half-skirt/apron with red embroidered marks; wide **red sash** at the waist with a bow and trailing tails; leather belt with pouches and a kunai holster; thigh-high black stockings with leather thigh straps; black split-toe (tabi) boots with red cord ties at the ankle.
- **Gear:** a straight-ish short sword (chokuto) on the back in a black sheath with red wrap, kunai (varied sizes), throwing blades, smoke bombs, leather utility pouches.
- **Palette (from the sheet):** near-black `#0d0d18`, deep indigo `#2a2744`, steel/navy blue `#3b4a8a`, crimson `#a8232f`, mid grey `#7a7a85`, light grey `#b5b5bd`; leather browns for pouches/straps; warm skin tone. Eventually an alternate palette for Player-2 mirror matches, so **all colors must be defined once as palette tokens** (see 5.4).

## 3. Art style definition (follow this; if you deviate, explain why)

Target: **clean anime cel-style illustration, vectorized**: confident inked line, 2 to 3 tone cel shading, subtle rim light, restrained gradients.

- **Line:** variable-weight look. Thicker outer silhouette line, thinner interior detail lines. Prefer **filled tapered shapes** over uniform `stroke` for key contours (hair tips, cloth edges, blade) so lines look inked, not like wireframe. Use `stroke-linejoin/linecap: round` where strokes are used.
- **Color/shading:** base color + one shadow tone + one highlight/rim tone per material, applied as **separate shape layers clipped (`clipPath`) to the part's base shape**, so each part stays self-contained when rotated. Cloth gets a few fold/shadow shapes; leather gets simple highlight edges; the blade gets a bright edge line and a subtle hamon (temper line).
- **Hair:** built from many overlapping tapered "lock" shapes with an indigo sheen and a few lighter strand lines. It must feel voluminous and flowing, not a flat blob.
- **Face:** the highest-fidelity part. Sharp, narrow, slightly angled eyes with iris highlights, thin brows, small nose, firm closed mouth. Serious and elegant, never cute.
- **Anatomy:** believable, athletic, strong stance-ready proportions. Respect the reference silhouette but keep it tasteful and serious, with no exaggerated emphasis.
- **No** filters/blur inside part art (rasterization cost and edge artifacts). Glows and effects are done later in the engine.
- **Be honest about limits.** Vector code will not match the painterly detail of the reference render. Aim for a **polished stylized interpretation**: strong silhouette, correct costume read, elegant face, confident linework. If some element (hands, face, hair) falls short, say so clearly and propose fixes. Do not hide weaknesses.

## 4. Camera / view for the in-game sprite

- Fighting-game convention: **side view, character faces RIGHT by default** (the engine mirrors horizontally for facing left). Use a **slight 3/4 turn** of the torso toward camera so the costume details (sash, pouches, chest) still read, but limb and weapon structure remain clean for cutout rigging.
- The far-side arm and leg are separate parts drawn in slightly darker tones for depth.
- On-screen the sprite will be about **400 to 450 px tall** (about 40 percent of a 1080p screen). Details must **read at that size**; avoid micro-detail that turns to noise.

## 5. Technical requirements

### 5.1 Source of truth
- Author the character as **one master SVG** (`art/shinobi/shinobi_master.svg`) with a fixed `viewBox` (suggest `0 0 1000 1400`; feet line near y=1300, character about 1100 units tall) where every part is a top-level `<g id="part-...">` in **master coordinates**, in correct z-order.
- Write a **build script** (Node or Python; whatever is available, check first) that:
  1. splits the master into **individual per-part SVG files** (tightly cropped, plus recorded `x, y` offset in master coordinates),
  2. writes `rig.json` (see 5.3),
  3. renders PNG previews (assembled character, each part sheet) for review.
- Parts must **overlap generously at joints** (extend into the neighboring part, hidden under it) so no gaps appear when joints rotate. Round the joint ends.

### 5.2 Required part list (rename as needed, but keep this granularity)
Rotation-capable skeleton, root at pelvis:
- `pelvis` (hips + belt base), `waist/midriff`, `torso_upper` (top + collar), `neck`, `head_base` (face shape + ear), `face_*` swappable expression layers (`neutral`, `intense` (attack/shout, mouth open, fierce eyes), `hurt` (eyes shut, wince)), `hair_front` (bangs/side strands), `hair_back`, **ponytail in 4 chained segments** (`pony_1..4`) for spring-physics follow-through, plus 2 loose side strand pieces.
- Arms (near and far, each): `upper_arm`, `forearm_glove` (with cord lacing), **swappable hands**: `open`, `fist`, `grip_sword`, `grip_kunai`.
- Legs (near and far, each): `thigh` (stocking + leather strap armor), `shin_boot`, `foot` (tabi boot with red cord ties).
- Cloth with secondary motion: `skirt_front_panel`, `skirt_back_panel`, `sash_knot`, `sash_tail_1`, `sash_tail_2` (each a chain of 2 to 3 segments if it improves motion), `scarf_collar_tail` (if present).
- Gear: `sheath_back` (sheath on back, diagonal), `sword` (separate, drawable in hand or sheathed), `kunai` (separate, for hand), `pouch_hip`, `kunai_holster_thigh`, `smoke_bomb_cluster`.
- Define a **clear z-order list** (far arm and far leg behind body, near arm and leg in front, hair back behind torso, etc.).

### 5.3 `rig.json`
For every part include: `id`, `parent`, `pivot` (joint position in master coordinates), `zIndex`, `file`, `offset {x,y}`, `size {w,h}`, plus a `defaultPose` (bone rotations for neutral stance) and a short `notes` field where useful (e.g. "chain_segment: spring"). Also include the character's `height`, `groundY`, and the recommended on-screen scale.

### 5.4 Palette tokens
Define all colors once (SVG `<defs>` CSS custom properties or a JS palette object in the build script) so an **alternate palette** can be generated by rebuilding. Do not scatter hard-coded hex values through the art.

### 5.5 Rig test page
Create `art/shinobi/preview.html` (plain HTML + PixiJS from a CDN is fine; no bundler) that loads the part SVGs and `rig.json`, assembles the puppet, and demonstrates:
- idle (subtle breathing, ponytail/sash secondary motion via simple springs),
- 4 to 5 stepped test poses: neutral stance, walk contact pose, kunai strike, sword slash, guard, and hit-reaction (with `hurt` face),
- a toggle to mirror horizontally, and a toggle to show joint pivots.

## 6. Working process (stage-gated: STOP and show me after each stage)

**Stage 0: Study & plan.** Read both reference images. Write a short plan: style decisions, shape language, line-weight rules, how you will build the face and hair, any risks. Check available tooling (Node/Python, ability to rasterize SVG to PNG, a browser you can screenshot for self-review). Do not skip the self-review capability: you must be able to *see* your output.

**Stage 1: Hero render (assembled, neutral side-3/4 stance).** Draw the full assembled character in the master SVG, **not yet split**, but already organized in `<g id="part-...">` groups. Render it to PNG, **view it, and compare it side by side against the reference sheet**. Do at least **3 critique-and-fix rounds**, each time listing concrete flaws (proportions, face, hair, costume read, line quality, silhouette) and fixing them. Then **STOP** and show me the result for approval. Do not proceed to Stage 2 until I approve.

**Stage 2: Split, rig, and test.** Implement the build script, `rig.json`, and `preview.html`. Verify no gaps at joints when rotated through a plausible range. Show screenshots of the test poses. Fix problems, then STOP for approval.

**Stage 3 (only if I ask): move set poses.** Idle, walk forward/back, dash, light attack (kunai), heavy attack (sword slash), guard, hit, KO, throw. Pose JSON plus effects hooks (slash-arc anchor points).

## 7. Quality bar and anti-patterns

Good: a recognizable silhouette in solid black, a readable costume at 420 px tall, an elegant face, crisp consistent linework, believable pose.
Bad (reject and redo): stick-figure limbs, blobby hair, mismatched line weights, wireframe look, a face that looks cute or comedic, uniform grey values with no shading, gaps at joints, hard-coded colors everywhere.

Always view your own renders and compare with the reference before claiming a stage is done. If something is not good enough, say so plainly and show what you'd change. Keep all files under `F:\__Projects\AI\AI_Project\art\shinobi\`.
