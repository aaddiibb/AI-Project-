# Samurai: Stage 0 plan

## References used
- `references/references/Game-view idle (02_…).jpg`: **primary** (strict profile, facing right, sword sheathed, hilt forward-up from the belly, saya trailing down-back behind the hakama).
- Character sheet (`Gemini_…igwd.jpg`), faces (`15_…`), walk, guard, light strike, heavy cleave, dash, backdash, hit, ultimate.
- Missing: `Silver-Haired Ronin in Dynamic Stance.png` (not in the project; the sheet replaces it). Images live in `references/references/`, not `references/samurai/`.
- Conflict noted: the guard image faces LEFT (mirror it mentally). The idle reads ~7.3 heads, prose says 8.5: the build uses ~7.9 (same head ratio as the Shinobi), height 1180.

## Conventions (unchanged from the Shinobi)
viewBox 0 0 1000 1400, faces right, ground y 1300, centre line x 520, root `pelvis`, clockwise-positive rotations, near = camera side = his RIGHT side, drawn at screen-left for the legs (back leg) like the Shinobi; far limbs get the `far` overlay.

## Skeleton (parent → part, pivot)
| part | parent | pivot | notes |
|---|---|---|---|
| pelvis (root) | – | 530,640 | grey obi + hakama hip yoke |
| waist | pelvis | 535,590 | kimono midsection (behind obi) |
| torso_upper | waist | 530,505 | haori body, grey inner kimono, open collar |
| neck | torso_upper | 535,305 | |
| head_base | neck | 532,268 | profile skull, nose/lips silhouette, ear |
| face_neutral/intense/hurt | head_base | slot `face` | eye, brow, scar, mouth |
| hair_back, hair_front | head_base | | static masses |
| hair_1..4 | head_base → chain | tie at nape 447,264 | tied tail, springs |
| strand_near, strand_far | head_base | | loose locks, springs |
| upper_arm_near/far | torso_upper | shoulder ~505,350 | kimono-sleeved arm |
| sleeve_near/far | upper_arm_* | shoulder | wide haori sleeve, spring |
| forearm_near/far | upper_arm_* | elbow | black wraps + crimson cord |
| hand_near_{open,fist,grip_sword} | forearm_near | wrist | slot `hand_near` |
| hand_far_{open,fist,grip_sword,grip_saya} | forearm_far | wrist | slot `hand_far` |
| thigh_near/far | pelvis | hips | **hakama trouser leg, upper** |
| hakama_side_near/far | thigh_* | ~knee | hakama trouser leg, lower + torn hem, spring |
| hakama_front_panel / hakama_back_panel | pelvis | obi front / back | pleated panels to the hem, springs |
| haori_tail_back | torso_upper | back waist | jacket hem at the back, spring |
| shin_boot_near/far | thigh_* | knee | shin wraps, crimson cord |
| foot_near (+ foot_near_side), foot_far | shin_boot_* | ankle | tabi + straw sandal, profile |
| obi_knot | pelvis | | crimson wrap + knot |
| obi_tail_1a/1b, 2a/2b | obi_knot → chain | | crimson strip, springs |
| saya | pelvis | mouth ~652,598 | lacquered scabbard + red sageo |
| sword | saya (rest) | | full katana; drawn = attach to a grip hand |

## Hakama (the main cloth read)
Each trouser leg is two rigid pieces (thigh = upper, `hakama_side_*` = flared lower with torn hem, spring-hung so it lags toward vertical when the thigh swings). Front and back pleated panels hang from the pelvis to the hem, so in a lunge the centre pleats hang between the legs, as in the strike references. z: back panel < far leg < front panel < near leg < obi.

## Sword / saya
- Sword drawn whole in master at the sheathed position (tsuba just in front of the obi, hilt up-forward ~44°, blade inside the saya). z: sword < saya < body, so the saya hides the blade and the body hides the saya mouth; the hilt is outside the body silhouette and stays visible.
- `attachments.sword = { rest: 'saya', grips: [...] }`. Drawn: `attach.sword = 'hand_near_grip_sword'`; the runtime gives it `zOverride` above the near hand. The saya stays on the hip, empty.
- Two-handed: the runtime supports ONE attach per item, so the sword attaches to the near (right) hand and the far (left) hand is posed onto the pommel end. `rig.attachments.sword.secondGrip` records that point and the anchor `hand_far_grip` lets pose tools check it.
- `grip_saya` far-hand variant: thumb on the tsuba, hand on the saya mouth (idle and iaido).

## Springs (data-driven via rig.springs)
hair_1..4, strand_near/far, sleeve_near/far, haori_tail_back, hakama_front/back_panel, hakama_side_near/far, obi_tail_1a/1b/2a/2b.

## Risks
- The wide sleeve hides the upper arm: overhead poses need a sleeve that hangs back (spring clamp ±70°).
- Deep knee bends pull the shin out of the back of the trouser leg (accepted: it reads as a wide trouser).
- A profile face needs a jaw-drop overlay for the shout (`face_intense`).
- Light hair on a bright background: grey cel shading + bold ink outline.
