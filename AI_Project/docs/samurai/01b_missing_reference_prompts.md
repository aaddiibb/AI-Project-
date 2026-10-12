# Samurai: prompts for the MISSING reference images (round 2)

Round 1 produced 4 good images (now the design is fixed by them):
- `01_samurai_character_sheet.jpg` (the full sheet) = **the master reference**
- turnaround (3 views), light windup (iaido), heavy windup (two-handed raise)

What round 1 got wrong: the pose images came out in **three-quarter view**, not a strict side view, and the canvas was wide. The game needs **strict profile, facing right**. The prompts below push much harder on that.

## How to use (Gemini or any generator)

1. Attach **the character sheet** (`01_samurai_character_sheet.jpg`) as the image reference every time. Once B (idle) is approved, attach **both** the sheet and B for all later images.
2. Prompt = **LOCK BLOCK** + **CAMERA BLOCK** + one **IMAGE PROMPT** + **STYLE BLOCK**. Copy them verbatim.
3. Gemini has no negative-prompt box, so the "Avoid" line is already inside the STYLE BLOCK.
4. Generate 3-4 candidates, keep the one where the face/hair/sword match the sheet best and the view is a true side view.
5. Save into `references/samurai/` with the given file name.

**Order:** B first (everything else copies its camera and scale), then O, F, H, C, D, J, K, L, N, I, M, Q, P, R.

---

## LOCK BLOCK (start of every prompt)

> Use the attached character sheet as the exact character design; keep his face, scar, hair, costume, colours and sword identical to it. A tall, imposing, lean-muscular male ronin samurai, about 30, calm hard expression, sharp narrow grey eyes, a thin scar across the left cheek and nose bridge. Long messy silver-white hair tied low at the nape with a dark cord into a long loose tail, long strands past the shoulders, a few strands over the face. Tattered charcoal-black kimono with open collar and grey inner layer; frayed elbow-length wide black haori sleeves with ragged torn edges; very wide pleated black hakama with jagged torn hems reaching the shins; dark grey obi with a crimson cloth strip knotted at the front and its two long tails hanging down; black fingerless wrist wraps criss-crossed with crimson cord; black shin wraps tied with crimson cord; black split-toe tabi with woven straw sandals. One long slightly curved katana: steel blade with a wavy temper line, black diamond-wrapped hilt, round bronze tsuba; black lacquered scabbard (saya) with a red cord, worn through the obi at his LEFT hip.

## CAMERA BLOCK (every full-body pose)

> Camera: strict orthographic side view at exactly 90 degrees, the character faces RIGHT in pure profile; we see one eye and the right side of his body; his left arm and left leg are the far side, partly hidden behind his body. Because the scabbard is on his far (left) hip, its hilt and bronze tsuba stick out in front of his belly and the end of the scabbard sticks out behind his hips, both clearly visible. Same camera distance and scale in every image: the standing character fills about 85 percent of the image height, the feet stand on one flat ground line near the bottom edge, the whole body is inside the frame with empty space around it.

## STYLE BLOCK (end of every prompt)

> Clean anime cel-style illustration, confident ink linework, thicker outer silhouette and thinner inner lines, two to three tone cel shading with subtle rim light, serious elegant mature mood, about 8.5 heads tall, flat plain light grey background, no ground shadow, no text, no watermark, sharp focus, high resolution. Avoid: three-quarter view, front view, camera angle from above or below, chibi, cute or comedic face, extra fingers, extra limbs, two swords, cropped head or feet, busy background, armour plates, modern clothing.

---

## IMAGE PROMPTS

### B. Game-view idle  `02_samurai_game_view_idle.png`  — **portrait 5:7 — MOST IMPORTANT**
> [LOCK] [CAMERA] Neutral fighting-game idle stance: feet about shoulder-width apart along the ground line (front foot ahead, back foot behind), knees slightly bent, weight low and planted, torso upright, shoulders relaxed and broad. His far (left) hand rests on the scabbard just below the tsuba; his near (right) arm hangs loosely at his side with the hand open and relaxed. Sword sheathed. The wide hakama hangs in deep vertical pleats and is clearly wider than his legs; the crimson obi tails hang straight down; the hair tail hangs down his back. [STYLE]

### C. Walk, contact pose  `03_samurai_walk_contact.png`  — portrait 5:7
> [LOCK] [CAMERA] Calm walking step, mid-stride: front heel just touching the ground with the toes up, back leg extended behind with the heel lifted, the wide hakama swinging open between the legs with the torn hem trailing, sleeves swaying slightly back, far hand on the scabbard, near arm swinging slightly back, torso upright. Sword sheathed. Walking, not running. [STYLE]

### D. Guard (block)  `04_samurai_guard.png`  — portrait 5:7
> [LOCK] [CAMERA] Bracing to block a strike: both forearms raised and crossed in front of his chest and face, the wrapped wrists forward, the wide sleeves hanging off the forearms like a shield, chin tucked, jaw clenched, shoulders hunched, knees bent, weight low and rooted, feet wide. Sword still sheathed at the hip. [STYLE]

### F. Light attack: draw-cut strike  `06_samurai_light_strike.png`  — landscape 16:9
> [LOCK] [CAMERA] The instant after a lightning-fast iaido draw cut: the katana fully drawn and held straight forward at chest height in his near (right) hand, arm fully extended, blade pointing right; his far hand pulls the now-empty scabbard backward at the hip; deep forward lunge, front knee bent, back leg straight; hair and sleeves whipping backward; a thin bright white crescent speed-trail along the blade path. [STYLE]

### H. Heavy attack: overhead cleave  `08_samurai_heavy_strike.png`  — landscape 16:9
> [LOCK] [CAMERA] The moment of a powerful two-handed overhead cleave: both hands on the hilt, the blade chopping down and forward at about 45 degrees in front of him, arms extended, deep forward lunge with the front knee bent, back leg straight and braced, torso leaning into the cut; hair, sleeves and crimson obi tails flying backward; a large bright white arc-shaped slash trail from above and behind his head down to the blade. The empty scabbard stays at his hip. [STYLE]

### I. Heavy attack: follow-through  `09_samurai_heavy_follow.png`  — landscape 16:9
> [LOCK] [CAMERA] Recovery after the cleave: both hands still on the hilt, the blade pointing low and forward with the tip near the ground in front of him, still in a deep lunge, head slightly lowered, exhaling, loose silver strands hanging forward over the face. Empty scabbard at the hip. [STYLE]

### J. Dash forward  `10_samurai_dash.png`  — landscape 16:9
> [LOCK] [CAMERA] Explosive forward dash, moving right: body leaning far forward, torso almost horizontal, front foot reaching forward low over the ground, back foot trailing behind, far hand holding the scabbard against the hip, near hand gripping the hilt, sword still sheathed; hair, sleeves, hakama and crimson tails streaming straight back; a few thin dust streaks at the feet. [STYLE]

### K. Dash backward  `11_samurai_backdash.png`  — landscape 16:9
> [LOCK] [CAMERA] Grounded backward dash: he still faces RIGHT but slides to the LEFT, body leaning back, weight on the heels, both feet sliding low across the ground, far hand on the scabbard, near hand open and raised slightly in front, wary glare forward; sleeves, hakama and crimson tails billowing FORWARD (to the right) from the backward motion; small dust streaks at the feet. Sword sheathed. Feet stay on the ground, not jumping. [STYLE]

### L. Hit reaction  `12_samurai_hit.png`  — portrait 5:7
> [LOCK] [CAMERA] Struck hard from the front (from the right): head snapped back, torso recoiling backward, eyes shut in a wince, teeth clenched, arms flung slightly back and out, knees buckling, a few strands of hair thrown forward. Sword still sheathed. [STYLE]

### M. Knocked down, lying  `13_samurai_ko_lying.png`  — landscape 16:9
> [LOCK] Strict side view, camera at ground level. He lies flat on his back on the ground, head to the LEFT, feet to the RIGHT, knees slightly bent, one arm out to the side, eyes closed, silver hair spread on the ground, torn hakama hem fanned out, the katana still in its scabbard at his hip. Whole body inside the frame, same scale as the standing poses. [STYLE]

### N. Ultimate: key pose  `14_samurai_ultimate.png`  — landscape 16:9
> [LOCK] [CAMERA] A legendary single draw-cut: the katana has just swept in a huge arc from behind him to far in front, now held out forward in his near hand; an enormous crimson-and-white crescent of energy leaves the blade, drawn in flat crimson and white shapes with a few embers; far hand holds the empty scabbard back at the hip; deep wide stance; hair and haori blown back hard; eyes with a faint red glow. The character must stay clearly readable in front of the effect. [STYLE]

### O. Faces (three expressions)  `15_samurai_faces.png`  — landscape 16:9
> [LOCK] Expression sheet: three head-and-shoulders panels side by side, all in strict PROFILE facing RIGHT, same size, same lighting, labelled "NEUTRAL", "INTENSE", "HURT". 1 NEUTRAL: calm hard stare, mouth closed. 2 INTENSE: attacking shout, mouth open showing teeth, eyes narrowed, brow down. 3 HURT: eyes squeezed shut in a wince, gritted teeth. Identical face shape, scar, hair and collar in all three; only the expression changes. [STYLE, but labels allowed]

### P. Costume and gear details  `16_samurai_details.png`  — landscape 16:9 (optional; the sheet's DETAILS row partly covers this)
> [LOCK] Costume detail sheet, no full body, separate labelled close-ups on plain grey: the wide haori sleeve with ragged edge seen from the side; the hakama side view showing deep pleats and the torn hem; the fingerless wrist wrap with crimson cord; the shin wrap with crimson cord, black tabi and straw sandal in side view; the obi with the crimson knot and two tails; the hilt with black diamond wrap and round bronze tsuba; the black scabbard with red cord, and the katana half-drawn from it showing the blade leaving the scabbard mouth. [STYLE, but labels allowed]

### Q. Alternate palette for Player 2  `17_samurai_palettes.png`  — landscape 16:9
> [LOCK, but change only the colours as listed] [CAMERA] Two identical copies of the game-view idle pose, side by side, same pose, same costume shapes, only colours differ, labelled. Left "DEFAULT": charcoal black, dark grey, crimson, silver-white hair, bronze tsuba. Right "P2": deep indigo-navy kimono, haori and hakama, ivory-white inner layer, obi and wraps, gold accents (tsuba, cords, obi strip in gold-ochre), BLACK hair, same skin. [STYLE, but labels allowed]

### R. Character-select portrait  `18_samurai_portrait.png`  — portrait 4:5 (optional)
> [LOCK] Vertical bust portrait, three-quarter view looking slightly toward the camera, katana hilt and bronze tsuba visible near the left shoulder, wind in the hair, a few crimson cloth strands in the air, dramatic soft rim light, plain grey background. [STYLE, but three-quarter view allowed here]

---

## Optional re-dos of round-1 images
The iaido windup (E) and two-handed raise (G) are good poses but in three-quarter view. If time allows, regenerate them with the CAMERA BLOCK:

### E. Light windup  `05_samurai_light_windup.png`  — portrait 5:7
> [LOCK] [CAMERA] Iaido ready stance just before a quick draw: knees bent, weight forward on the front leg, torso twisted slightly back, far hand pushing the scabbard forward with the thumb on the tsuba, near hand gripping the hilt across his belly, blade still fully in the scabbard, intense eyes locked forward. [STYLE]

### G. Heavy windup  `07_samurai_heavy_windup.png`  — portrait 5:7
> [LOCK] [CAMERA] Katana drawn and gripped in both hands raised high above and behind the head, blade pointing back, elbows up, back arched slightly, weight on the back leg, the wide sleeves fallen back off the forearms, face tense and focused. Empty scabbard at the hip. [STYLE]

## Not needed
- `Silver-Haired Ronin in Dynamic Stance.png` (the original): the approved sheet replaces it. If you still have the file, drop it into `references/` anyway.
- No jump, crouch, run, kick or throw images.
