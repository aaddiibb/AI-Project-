# Samurai: character package (index)

The Samurai is the **Minimax fighter** (disciplined, calculating duelist). This folder is the hand-off kit for building him the same way the Shinobi was built, so he can be dropped into the existing game.

## Design rules (fixed by the project owner)

| | Shinobi | **Samurai** |
|---|---|---|
| Movement | walk, run, dash, back-hop, crouch, jump | **walk forward/back, dash forward, dash backward only** |
| Attacks | light sword, kick, heavy sword, kunai, crouch/air moves | **light attack, heavy attack, ultimate** |
| Defence | stand-block, crouch-block | **stand-block only (cannot crouch or jump)** |
| Feel | fast, evasive | **slow, heavy, much higher damage** |
| Look | dark ninja, tall, athletic | **tall, broad, imposing silver-haired ronin** (see `references/Silver-Haired Ronin in Dynamic Stance.png`) |

Because he cannot crouch or jump, the Shinobi's low attacks hit him if he blocks, and he cannot duck kunai. His damage and reach are the trade-off.

## Files, in the order to use them

| # | File | Who uses it | Output |
|---|---|---|---|
| 1 | `01_reference_image_prompts.md` | the person with the image generator | images in `references/samurai/` |
| 2 | `02_build_samurai_art_prompt.md` | the stronger model (paste whole file) | `art/samurai/`: layered SVG character, rig, palettes (stage-gated) |
| 3 | `03_samurai_moves_and_animation_prompt.md` | the stronger model, after file 02 is approved | poses, animation tables, hitboxes and move data |
| 4 | `04_integration_contract.md` | both the friend (to deliver exactly this) and the integrator (to wire it in) | what the game expects and what integration will change |

## Hand-off flow

1. Generate the images (01), approve them.
2. Open a **fresh** session in this project folder and paste file 02. Approve each stage (it stops and shows renders).
3. Same session (or a new one): paste file 03. Approve each stage.
4. Check file 04's acceptance checklist, then give the finished `art/samurai/` folder back for integration.

## Notes for the integrator (the Shinobi session)

The game currently has **one global moveset** in `game/src/moves.js` and loads the Shinobi rig directly in `game/src/main.js`. Integration is mostly a small refactor into a *character registry* (rig, poses, physics, hurtbox, moves per character) plus a grounded back-dash state and input masking for "cannot crouch / jump". Everything needed from the friend's side is spelled out in file 04. Nothing in the friend's work needs to touch `game/`.
