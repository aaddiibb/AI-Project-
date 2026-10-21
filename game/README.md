# Shinobi Arena: duel of algorithms

A 2D fighting game for the CSE 3210 AI lab in which each fighter's personality is an AI algorithm. Two characters
(the Shinobi and the Samurai) share one deterministic 60 Hz simulator. Three fundamentally different AIs (Minimax with
alpha-beta, MCTS / DUCT, Mamdani fuzzy logic) plus two baselines can drive either character. They can fight each
other, on screen or headless, and a human can play against any of them at four difficulty levels.

**Start here:** the title menu has *Human vs AI*, *AI vs AI*, *Training* (the original test bed) and *Replay*.
AI design and results: [`AI_PLAN.md`](AI_PLAN.md), [`../docs/ai_report.md`](../docs/ai_report.md),
[`../docs/ai_benchmark.md`](../docs/ai_benchmark.md).

## Run

The game loads art from `../art/shinobi`, so serve the **project root** (not `game/`):

```bash
python -m http.server 8766
```

Then open <http://localhost:8766/game/index.html>. URL presets skip the menu, for example
`index.html?mode=ava&p1=samurai&p2=samurai&a1=minimax&a2=mcts&l1=hard&l2=hard&autostart=1` or
`index.html?mode=replay&replay=replays/demo_minimax_vs_mcts.json&autostart=1`. (Inside Claude Code the `shinobi-game` entry in `.claude/launch.json` does the same.)
PixiJS is vendored in `vendor/`, so it runs offline.

## Play on your PC and phone

Double-click **`Play Algo Fighter.bat`** in the project root. It serves the project root on port `8766`, opens the game
on the PC, and prints the address to open on a phone:

```text
Phone : http://<your-PC's-Wi-Fi-IP>:8766/game/index.html
```

Put the phone on the **same Wi-Fi**, open that link, and use the on-screen controls (buttons can be rearranged from
OPTIONS → MOVE BUTTONS). Keep the launcher window open while playing; Ctrl+C stops the server. If the phone cannot
connect, allow Python through Windows Defender Firewall for **Private** networks. To use another port, set
`ALGO_FIGHTER_PORT` before starting, e.g. `set ALGO_FIGHTER_PORT=8767`, and use that port in both URLs.

## Controls

| Key | Action |
|---|---|
| `A` / `D` (or arrows) | walk (screen-relative; forward = towards the opponent) |
| double-tap **forward**, hold | **run** (release to skid to a stop) |
| double-tap **back** | **hop back** (short airborne backstep) |
| `W` | jump: **tap = light jump**, **hold = high jump**; hold a direction to jump that way |
| `S` | crouch (hold) |
| `Space` | block (hold). `Space`+`S` = crouch-block |
| `Shift` | dash forward (`Shift`+back = hop back) |
| `J` light sword (kunai) · `K` kick · `L` heavy slash · `I` kunai throw | normals |
| `S`+`J` / `S`+`K` | crouch light sword / sweep (both low) |
| `W`, then `J` / `K` in the air | dive stab / flying kick |
| `U` (meter full) | **ultimate**: super flash, then a fan of 7 flaming kunai |

**Gatling chains:** after a move connects (hit *or* block) you may cancel into a higher-rank move:
light sword (x3) / crouch light sword → kick / sweep → slash → kunai throw. Slash and sweep knock the opponent down.

### Training hotkeys

`R` reset positions · `T` refill health · `H` show hit/hurt boxes · `P` pause · `N` step one frame · `Tab` / `1`-`6` change dummy behaviour
(stand, crouch, block, crouch-block, jump, attack) · `F1` controls card. The side panel also has *stepped look* (the 2s/3s held-pose anime look) and slow-motion.

## Animation

Rendering is smooth by default (60 fps), via `src/animator.js`:

- **In-move tweening.** Each key of a move holds, then eases into the next key over its last `tween` frames (default 5), so every key lands exactly on its frame-data frame. Strikes use `ease: 'in'`, so they accelerate into the active frame.
- **Cross-fades.** Every state change (stand / crouch, landing, hit, chaining, block) blends from the last displayed pose over a few frames.
- **Locomotion.** Walking and running interpolate between keys by distance travelled. Jumps blend rise → tuck → fall by vertical speed. Forward and back jumps somersault around the body's centre.
- The panel's *Stepped look* option still gives the old held-pose anime look ("on 2s").

The game-only poses are authored in `../art/shinobi/tools/author_moves.mjs`, using absolute limb angles and leg IK (`tools/posekit.mjs`), and written to `poses_extra.json`.

Review the game's motion offline with `node tools/seq_render.mjs <scenario> [--every N]`, which writes a filmstrip PNG. Add `--video --fps60` to get an MP4 instead. It drives the real simulator and animator with scripted inputs.

## Rules in this build

- Meter (0-100) fills when your attacks connect (60% on block). `U` with a full meter fires the ultimate: 34-frame super freeze, then 7 kunai at -24..+24 degrees, 70 damage each (no combo scaling), 25 chip each if blocked. Startup is not invulnerable. Panel: *Meter: always full* for practice; `T` refills health and meter.
- 1000 HP. Damage scales down 12% per hit in a combo (floor 30%). Counter-hit (hitting a move in progress): +25% damage, +4 hitstun.
- Hit levels: **high** attacks (slash, kunai throw) whiff against a crouching target; **low** (sweep, crouch light sword) must be blocked crouching; everything else is **mid**. The ultimate's fan is purely geometric (crouching ducks the high kunai only).
- Frame data is in the panel (start / active / recovery in 60 fps frames).
- Hit-stop, screen shake, wall pushback and corner pressure are all in.

## Layout

| Path | What |
|---|---|
| `src/sim.js` | **Deterministic simulator**: pure function of the input bitmask per fighter per frame; no rendering, no randomness; per-fighter character data, `clone()`, `hash()`, `toState()`. |
| `src/moves.js` | Re-export of the Shinobi's data (`src/characters/shinobi.js`). |
| `src/input.js` / `src/dummy.js` | Keyboard to bitmask; dummy behaviours (same `bits = f(sim, frame)` signature an AI agent will use). |
| `src/render.js` | Puppets (rig + springs), pose selection per sim state, camera. |
| `src/stage.js`, `tools/build_stage.mjs` | Parallax stage (SVG layers generated by script, rasterised once at load), falling petals. |
| `src/fx.js`, `src/hud.js`, `index.html` | Hit/block sparks, blade trail, kunai, dust, shake; DOM HUD. |
| `../art/shinobi/poses_extra.json` | New game-only poses (crouch, jump, run, punch, sweep). `node tools/render_extra.mjs` renders them for review. |

Rebuild the stage after editing it: `node tools/build_stage.mjs` (needs `npm install` in `art/shinobi` for the SVG renderer).

## Tuning

Shinobi gameplay data is in `src/characters/shinobi.js` (the Samurai's comes from `art/samurai/samurai.moves.js`, rebuilt by its pipeline): `PHYS` (speeds, jump, gravity, buffers), each move's `frames`, `active`, `box`, `dmg`, `hitstun`, `blockstun`, `push`.
Boxes are measured from the rig anchors (see `render_extra.mjs --anchors`), x = forward from centre, y = height above ground.

## Samurai (P1 controls)

`A` / `D` walk · `Shift` dash (`Shift`+back, or double-tap back = **grounded** back-dash) · `J` iai cut (mid) ·
`L` overhead cleave (25% chip on block, knockdown) · `U` Crimson Crescent (full meter; a low crescent along the
ground: block it, jump it, or be out of range) · `Space` block (standing only). He cannot jump, crouch, run, kick or
throw: the simulator masks those inputs for him.

## AI (see `AI_PLAN.md`)

| Path | What |
|---|---|
| `src/characters/` | character registry: `shinobi.js` (data moved from `moves.js`, which re-exports it), `samurai.js` (wraps `art/samurai/samurai.moves.js`) |
| `src/ai/macros.js` | 9 Samurai macro-actions, legality filter, executor, search-side playout |
| `src/ai/eval.js` | evaluation function (exported `WEIGHTS`, tuned by the GA) |
| `src/ai/minimax.js` · `mcts.js` · `fuzzy.js` · `baselines.js` | the agents |
| `src/ai/agent.js` · `view.js` · `match.js` | agent interface, delayed sanitised views, rounds / best-of-3 runner |
| `src/ai/difficulty.js` · `worker.js` · `remote.js` | Easy / Normal / Hard / Master (Master searches in a Web Worker) |
| `src/menu.js` · `src/overlay.js` | title menu, "thinking" overlay and intent labels |
| `tools/arena.mjs` | headless AI vs AI: pairings, round-robin, CSV / JSON, `--replay` |
| `tools/ga_tune.mjs` · `scaling.mjs` · `charts.mjs` · `decision_log.mjs` | GA tuning, scaling curves, charts, decision logs |
| `tools/replay_hash.mjs` · `test_*.mjs` | regression proof and unit tests: `npm test` |

In matches: `H` thinking overlay · `G` hit boxes · `P` pause · `N` step · `R` rematch · `M` sound on / off · `Esc` menu; speed ¼× to 4×.

## Sound (see `AUDIO_PLAN.md` and `../docs/audio.md`)

Every sound is synthesised in code at load time (no sample files, nothing to license, works offline). Sound starts on the
first click or key press (browser autoplay rule). The side panel has Volume / Music / Effects sliders and Mute (`M`);
settings are remembered. Audio only *reads* the simulation, so the replay hash and every benchmark are unchanged.

| Path | What |
|---|---|
| `src/audio/dsp.js` | procedural sound bank: every recipe (steel, wood, taiko, gong, koto, shakuhachi, kiai…), seeded |
| `src/audio/sounds.js` | sound table (bus, priority, gain, reverb, rate limit, ducking) and the mix constants |
| `src/audio/cues.js` | pure cue logic: sim events + fighter state + match phase -> cues; fight tension for the music |
| `src/audio/score.js` · `music.js` | the 48-bar battle score + menu ambience, and its look-ahead scheduler with tension stems |
| `src/audio/engine.js` · `index.js` · `bank_worker.js` | Web Audio engine (buses, compressor, reverb, voice pool) and the facade `main.js` uses |
| `tools/test_audio.mjs` | cue timing, isolation, determinism, bank and loudness tests (in `npm test`) |
| `tools/audio_render.html` · `render_audio.mjs` | offline render of a replay through the real engine -> WAV + loudness (`npm run audio:render`) |

## Known limitations

- Frame rate in the headless preview pane is software-rendered (about 30 fps there); the simulation itself costs about 0.5 µs per step.
- The run cycle is still the first-pass hand-authored set (not yet reworked with posekit).
- Shinobi heavy slash and kunai chip from MOVESET.md are not in (the Shinobi's frame data is frozen by the regression proof).
