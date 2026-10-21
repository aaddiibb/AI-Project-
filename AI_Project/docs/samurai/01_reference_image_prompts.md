# Samurai: reference-image prompts (for an image generator)

Purpose: produce a consistent set of reference images so the modelling prompt (file 02/03) can build the Samurai the same way the Shinobi was built.
The Shinobi's reference was a **character sheet** (hero stance, front / side / back, close-up, combat pose, details, weapons, palette) plus a **game-view side pose**. The Samurai needs the same.

## How to use

1. Put the existing reference `references/Silver-Haired Ronin in Dynamic Stance.png` into your generator as an **image / character reference** (strength: medium, so the face, hair, costume and palette carry over, but the pose can change).
2. Paste the **CHARACTER BLOCK** below at the start of every prompt (copy it verbatim; consistency across images depends on it).
3. Then add one **IMAGE PROMPT** at a time. Generate 3-4 candidates for each and keep the one that matches the design best.
4. Save the keepers in `references/samurai/` using the suggested file names.
5. Re-use a good result as the new image reference for the next prompts (e.g. use the approved sheet for the pose images).

**Priority order if you are short on time:** B (game-view idle), A (character sheet), E+F (light attack), G+H (heavy attack), C (walk), D (guard), N (ultimate), then the rest.

---

## STYLE BLOCK (append to every prompt)

> clean anime cel-style illustration, confident ink linework with thicker outer silhouette and thinner inner lines, two to three tone cel shading with subtle rim light, restrained gradients, serious and elegant mood, mature character design, tall heroic proportions (about 8.5 heads tall), full body fully visible from hair to sandals, flat plain light grey background, no ground shadow, no text, no watermark, sharp focus, high resolution

(This matches the Shinobi's look so both characters feel like one game. It also keeps the images easy to trace into flat vector shapes.)

## CHARACTER BLOCK (paste at the start of every prompt)

> A tall, imposing, lean-muscular male samurai (ronin), about 30 years old, calm hard expression with sharp narrow grey eyes and a thin scar across the left cheek and nose bridge. Long messy silver-white hair, tied loosely low at the nape with a dark cord, long loose strands falling past the shoulders and a few strands over the face. Costume: a tattered charcoal-black kimono with an open collar showing a grey inner layer and part of the chest, a frayed wide-sleeved black haori-style outer jacket with ragged edges, wide pleated black hakama trousers with frayed torn hems, a dark grey obi sash with a long crimson cloth strip knotted at the waist and trailing, black fingerless hand wraps with crimson binding cord on both forearms, black cloth bandage wraps with crimson cord around both shins, black split-toe tabi with woven straw sandals. Weapon: one long, slightly curved katana with a visible wavy temper line, black diamond-wrapped hilt, round bronze tsuba, black lacquered scabbard (saya) worn at the left hip with a red cord. Colour palette: near-black charcoal, dark grey, silver-white hair, crimson accents, steel blade, small bronze details, warm skin tone.

---

## IMAGE PROMPTS

### A. Character sheet (the master reference)  `01_samurai_character_sheet.png`

> [CHARACTER BLOCK] Professional character design sheet on a pale off-white background with thin panel borders and small serif labels. Layout: panel 1 "HERO STANCE" three-quarter view, katana in hand, weight on the back leg; panel 2 "FRONT VIEW" neutral standing, katana sheathed at the left hip, arms relaxed; panel 3 "SIDE VIEW" facing right; panel 4 "BACK VIEW"; panel 5 "COMBAT POSE" mid-slash, wide stance, sword extended; panel 6 large "CLOSE-UP" of the face and shoulders; bottom row: "DETAILS" (haori sleeve edge, hakama folds and torn hem, hand wrap, shin wrap with sandal, tsuba and hilt, obi with crimson cloth), "WEAPONS & GEAR" (katana drawn and sheathed, scabbard, sword cord), "COLOR PALETTE" swatches (charcoal, dark grey, silver, crimson, steel, bronze) and the label "SAMURAI - RONIN / HEAVY DUELIST". [STYLE BLOCK, but keep the sheet background off-white]

### B. Game-view idle, side, facing right  `02_samurai_game_view_idle.png`  (**most important**)

> [CHARACTER BLOCK] Exact side view facing RIGHT, orthographic, neutral fighting-game idle stance: feet shoulder-width apart, knees slightly bent, torso upright and slightly turned toward the camera so the sash and chest still read, left hand resting on the scabbard at the hip, right hand loosely open at the side, sword still sheathed, both feet flat on the same ground line, the whole body inside the frame with space around it. [STYLE BLOCK]

### C. Walk, contact pose  `03_samurai_walk_contact.png`

> [CHARACTER BLOCK] Same side view facing RIGHT as the game-view idle, mid-stride walking pose with the front heel just touching the ground and the back leg extended, wide hakama swinging with the stride, sleeves swaying, sword sheathed at the hip, torso upright and calm, no running. [STYLE BLOCK]

### D. Guard (block)  `04_samurai_guard.png`

> [CHARACTER BLOCK] Same side view facing RIGHT, bracing to block: both forearms crossed or raised in front of the chest and face with the wrapped wrists and wide sleeves forming a shield, knees bent, weight low and rooted, shoulders hunched, sword still sheathed at the hip, jaw clenched. [STYLE BLOCK]

### E. Light attack: draw windup (iaido)  `05_samurai_light_windup.png`

> [CHARACTER BLOCK] Same side view facing RIGHT, iaido ready stance just before a quick-draw cut: knees bent, weight forward on the front leg, torso twisted slightly back, left hand pushing the scabbard forward with the thumb on the tsuba, right hand gripping the hilt but the blade still fully in the scabbard, intense eyes locked forward. [STYLE BLOCK]

### F. Light attack: draw cut strike  `06_samurai_light_strike.png`

> [CHARACTER BLOCK] Same side view facing RIGHT, the instant of a lightning-fast horizontal draw cut: the katana fully drawn and extended straight forward at chest height with the right arm straight, left hand pulling the empty scabbard back at the hip, front foot stepped forward on a deep lunge, back leg extended, hair and sleeves whipping backward, a thin bright crescent speed-trail along the blade path. [STYLE BLOCK]

### G. Heavy attack: windup  `07_samurai_heavy_windup.png`

> [CHARACTER BLOCK] Same side view facing RIGHT, the katana drawn and gripped in both hands raised high above and behind the head, elbows up, back arched slightly, weight loaded on the back leg, front foot lifted slightly, the wide sleeves falling back off the forearms, face tense and focused. [STYLE BLOCK]

### H. Heavy attack: overhead cleave  `08_samurai_heavy_strike.png`

> [CHARACTER BLOCK] Same side view facing RIGHT, the moment of a powerful two-handed overhead cleave: blade chopping down and forward at about forty-five degrees, both hands on the hilt, deep forward lunge with the front knee bent, back leg straight and braced, torso leaning into the cut, hair and crimson cloth flying back, a large bright arc-shaped slash trail from above and behind the head down to the blade. [STYLE BLOCK]

### I. Heavy attack: follow-through  `09_samurai_heavy_follow.png`

> [CHARACTER BLOCK] Same side view facing RIGHT, recovery after the cleave: the blade pointing low and forward, both hands still on the hilt, deep lunge, head slightly lowered, breathing out, loose silver strands hanging forward. [STYLE BLOCK]

### J. Dash forward  `10_samurai_dash.png`

> [CHARACTER BLOCK] Same side view facing RIGHT, an explosive forward dash: body leaning far forward, nearly horizontal, both feet low and skimming the ground with the back foot trailing, left hand holding the scabbard against the hip, right hand on the hilt, sword still sheathed, hair and sleeves streaming straight back, a few thin dust streaks at the feet. [STYLE BLOCK]

### K. Dash backward  `11_samurai_backdash.png`

> [CHARACTER BLOCK] Same side view facing RIGHT (he is retreating to the left while still facing right): body leaning back, weight on the heels, feet sliding backward across the ground, left hand on the scabbard, right hand open and ready, wary glare, sleeves and hakama billowing forward from the momentum, sword sheathed. [STYLE BLOCK]

### L. Hit reaction  `12_samurai_hit.png`

> [CHARACTER BLOCK] Same side view facing RIGHT, struck from the front: head thrown back, torso recoiling, eyes shut in a wince, teeth clenched, arms flung slightly back, knees buckling, sword still sheathed, a few strands of hair thrown forward. [STYLE BLOCK]

### M. Knocked down (lying)  `13_samurai_ko_lying.png`

> [CHARACTER BLOCK] Same side view facing RIGHT, lying flat on his back on the ground with his head to the left, knees slightly bent, one arm out to the side, eyes closed, silver hair spread on the ground, torn hakama hem fluttering, the katana still in the scabbard at the hip. Keep the whole body inside the frame. [STYLE BLOCK]

### N. Ultimate: key pose  `14_samurai_ultimate.png`

> [CHARACTER BLOCK] Dramatic key art, same side view facing RIGHT: a legendary single draw-cut. The katana swung in a huge sweeping arc from behind him to far in front, leaving an enormous glowing crimson crescent of energy leaving the blade, sparks and embers around the blade, hair and haori blown back by the force, eyes burning with a faint red glow, deep stance, one hand holding the scabbard back. Keep the character clearly readable; the effect can be drawn in flat crimson and white shapes. [STYLE BLOCK]

### O. Face expressions (three faces)  `15_samurai_faces.png`

> [CHARACTER BLOCK] Close-up head-and-shoulders character expression sheet, three panels side by side on a plain background, all in profile facing RIGHT: 1 "NEUTRAL" calm hard stare with a closed mouth; 2 "INTENSE" attacking shout with open mouth, narrowed eyes and visible teeth; 3 "HURT" eyes shut in a wince and gritted teeth. Same face, scar and hair in every panel. [STYLE BLOCK]

### P. Costume and gear details  `16_samurai_details.png`

> [CHARACTER BLOCK] Costume detail sheet, no character body, separate close-up swatches with small labels: the wide haori sleeve with frayed ragged edge (front and back), the black hakama with deep pleats and torn hem (side view), the black fingerless hand wrap with crimson cord, the shin wrap with crimson cord and straw sandal (side view), the obi sash with crimson cloth strip knot and tails, the katana hilt with black diamond wrap and round bronze tsuba, the black lacquered scabbard with red cord. [STYLE BLOCK]

### Q. Alternate colour palettes (for Player-2 mirror matches)  `17_samurai_palettes.png`

> [CHARACTER BLOCK, but change the colours as listed] Three identical side-view full-body samurai in the same neutral idle stance, facing right, lined up side by side. 1 "DEFAULT": charcoal black and crimson, silver-white hair. 2 "ALT A": deep indigo-navy and ivory white, gold accents, black hair. 3 "ALT B": dark forest green and bone, bronze accents, grey hair. Same pose, same costume shapes, only the colours differ. [STYLE BLOCK]

### R. Character-select portrait  `18_samurai_portrait.png`

> [CHARACTER BLOCK] Vertical bust portrait, three-quarter view looking slightly toward the camera, katana hilt and tsuba visible at the left shoulder, wind in the hair, a few crimson cloth strands, dramatic soft rim light, plain grey background. [STYLE BLOCK]

---

## Negative prompt (if your tool has one)

> chibi, child, cartoon, comedic, deformed hands, extra fingers, extra limbs, text, watermark, logo, cropped feet, cropped head, 3d render, photo, busy background, heavy shadow on the ground, gradient background, armor plates, modern clothing, gun

## Consistency tips

- Keep **hair, scar, crimson accents and the sword design identical** across images; if one drifts, regenerate it using the approved sheet as the reference.
- Generate poses **facing right**; the game mirrors the sprite for facing left.
- Ask for **flat plain backgrounds** so the images are easy to read and trace.
- Facing, camera and scale should match the idle (B) in every pose image: same camera distance, feet on the same ground line, so the modelling step can overlay them.
- The Samurai has **no jump, crouch or run**: do not generate those.
