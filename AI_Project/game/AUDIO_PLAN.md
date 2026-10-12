# Audio plan (prompt 06, stage 0)

Goal: sound that makes every swing, hit, block and ultimate readable by ear without changing a single simulated frame.
Direction: samurai-film foley (steel, saya, cloth, wooden floor) plus a restrained taiko, shakuhachi and koto score.
Kabuki *hyoshigi* clappers and a temple gong stand in for an announcer voice.

## 1. Architecture

Pure modules have no DOM and no Web Audio, so they run under Node for tests and offline rendering. Browser-only modules
are imported by `main.js` alone.

| File | Kind | Role |
|---|---|---|
| `src/audio/dsp.js` | pure | Seeded DSP primitives (noise, RBJ biquads with swept cutoff, modal resonators, Karplus-Strong, formants, envelopes) and every **recipe** → `Float32Array` (mono, 48 kHz). |
| `src/audio/sounds.js` | pure | Sound table: recipe, variants, bus, priority, gain, min-interval; mix constants (bus gains, ducks, pan law, reverb sends). Shared by the browser engine and the offline renderer so the two mixes agree. |
| `src/audio/cues.js` | pure | `CueTracker`: (sim after a step, match phase, camera) → cue list and active loops. `tension()`. Seeded audio RNG (mulberry32), reset per match. |
| `src/audio/score.js` | pure | The music as data: 48-bar battle form at 80 BPM (2 min 24 s, loops), menu ambience; per-step note events tagged with a stem. |
| `src/audio/engine.js` | browser | `AudioContext` (created on the first gesture), buses, compressor/limiter, convolution reverb (IR from `dsp.js`), voice pool (24, priority stealing), buffer cache, loops, ducking. |
| `src/audio/music.js` | browser | Look-ahead scheduler (25 ms tick, 120 ms horizon) that plays `score.js` with per-stem gains driven by tension. |
| `src/audio/index.js` | browser | `Sound` facade used by `main.js`: `onStep(sim, match)`, `update(dt, camera)`, `ui(name)`, `setPaused`, `setMenu`, settings. |
| `tools/test_audio.mjs` | test | Cue-timing tests, determinism, isolation (no audio import reachable from the sim, AI or headless tools). |
| `src/audio/loudness.js` | pure | BS.1770 loudness meter + WAV writer. |
| `tools/audio_render.html` + `tools/render_audio.mjs` | tool | Offline render of a replay through the real engine (`OfflineAudioContext`) to WAV; reports LUFS, sample peak, cue counts. |

Sounds are **synthesised at load time**. There are no sample files, so there is nothing to license and nothing to
download. The whole bank renders in about 0.3 s, in slices, while the menu is up.

## 2. Cue list

Pan: `(x − camera.cx) / (camera.w / 2)` clamped to ±0.8, equal-power. Priorities run 1 (ambient) to 9 (must play).

| Trigger (observable) | Sound id | Bus | Pri | Notes |
|---|---|---|---|---|
| Samurai `light` at t = 4 | `sam_draw` | sfx | 6 | saya click, then the steel "shing", then a whoosh peaking at t = 7 (the active frame) |
| Samurai `heavy` at t = 6 | `sam_cleave` | sfx | 6 | a 420 ms rising whoosh peaking at t = 16 |
| Shinobi `stab` / `crouch_stab` / `air_stab` | `shi_swish` | sfx | 5 | short, high swish leading the active frame by 3 |
| Shinobi `kick` / `sweep` / `air_kick` | `shi_kick` | sfx | 5 | cloth whip |
| Shinobi `slash` | `shi_slash` | sfx | 6 | blade whoosh, peaks on the active frame |
| `hit` power ≤ 1 / 2 / ≥ 3 | `hit_l` / `hit_m` / `hit_h` | sfx | 8 | body thump + cloth + blade "shk"; rate ± 3 % (seeded) |
| `hit.counter` | + `counter` | sfx | 8 | a bright metallic accent on top |
| `hit.ko` | + `ko_boom` | sfx | 9 | sub boom; music ducks 9 dB |
| `block` (defender Samurai / Shinobi) | `block_steel` / `block_wood` | sfx | 7 | |
| `block.chip > 0` | + `chip` | sfx | 6 | gritty scrape |
| `super` | `super` | voice | 9 | o-daiko hit + shimmer swell across the 34-frame freeze + kiai; ducks music 9 dB and sfx 6 dB |
| `crescent` | `crescent_rel` + loop `crescent_loop` | sfx | 8 | the loop's pan and gain follow the projectile every frame and stop when it leaves |
| `throw` | `kunai` | sfx | 5 | |
| `fan` | `fan` | sfx | 8 | 7 staggered flicks + fire crackle |
| `pland` | `thunk` | sfx | 3 | kunai into the floor |
| `dash` (forward or run start) | `dash` | sfx | 4 | cloth burst + sandal skid |
| `dash` (Samurai grounded back-dash) | `heel_drag` | sfx | 4 | |
| `jump` | `jump` | sfx | 3 | |
| `land` power 0–1 / `down` | `land` / `bodyfall` | sfx | 4 / 7 | |
| walking / running | `step` | sfx | 1 | every half walk cycle (from `walkDist`); run every half stride (from `runDist`) |
| entering `guard` | `guard` | sfx | 2 | once per entry |
| phase `intro` round n | `st_round` | voice | 9 | n taiko strikes + gong |
| phase `fight` after intro | `st_fight` | voice | 9 | two hyoshigi clacks + a taiko hit |
| phase `ko` (ko / time / double) | `st_ko` / `st_time` / `st_ko` | voice | 9 | gong / hyoshigi roll |
| phase `over` | `st_win` / `st_draw` | voice | 9 | koto flourish + gong |
| timer 10…4 / 3…1 | `tick` / `tick_hi` | ui | 3 | fight phase only |
| menu hover / mode tab / start | `ui_hover` / `ui_tab` / `ui_go` | ui | 2 | |

P2 in a mirror match plays the same recipes at a 5 % lower rate with a different variant set, so the two sides stay
distinguishable by ear.

## 3. Mix

- Buses: `master → compressor (−14 dB threshold, 4:1) → limiter (−1 dB) → out`. Under master sit `music` (0.6), `sfx`
  (0.9), `ui` (0.5), `voice` (0.85), plus a reverb send (wooden dojo hall, 1.4 s).
- Ducks are gain ramps on the bus, 40 ms attack:
  - `super`: music −9 dB and sfx −6 dB for 0.9 s
  - `ko`: music −9 dB for 2.2 s
  - stingers: music −6 dB for their length
- Targets: music alone about −22 LUFS; full fight about −16 LUFS integrated; peaks under −1 dBFS. Measured offline by
  `render_audio.mjs` with ITU-R BS.1770 K-weighting and gating.
- Measured on the demo replay: full mix −15.7 LUFS, peak −2.6 dBFS; music alone −22.4 LUFS. The music bus ended at 0.6
  (the plan's 0.55 was 3 dB short once the reverb sends were routed per bus; see `docs/audio.md`).

## 4. Tension (observable state only)

```
close = clamp01(1 − (|x0 − x1| − 300) / 1500)
low   = clamp01((0.45 − min hp%) / 0.3)
meter = 1 if either meter is full
late  = 1 in the last 10 s of a fight
T     = clamp01(0.35 close + 0.35 low + 0.15 meter + 0.3 late), smoothed (τ = 1.5 s)
```

Stem gains: base = 1; percussion = smoothstep(0.15, 0.55, T); high = smoothstep(0.45, 0.85, T).

## 5. Timing, speed, pause, replay

- Cues are produced once per sim step, so ¼× to 4× stays in sync.
- Each sound has a minimum interval (footsteps 90 ms, ticks 150 ms, whooshes 40 ms), so 4× never machine-guns.
- Playback rate is × min(1.12, speed^0.08) above 1×.
- Paused: the music scheduler stops and the music bus fades to silence; a single `N` step still plays its cues.
- Menu: battle music crossfades to the menu ambience; SFX tails finish.
- Replay: the cues come from the replayed sim and the RNG is reset per match, so a replay sounds identical every time.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Procedural sounds can sound cheap | Layered recipes, modal synthesis for metal and wood, reverb send, variants; offline render to review. |
| Startup cost | Render in slices with `setTimeout(0)`; the bank is under 2 s of CPU even on a slow laptop. |
| Autoplay | The context is created only on the first pointer or key gesture; before that every call is a no-op. |
| Hosted page | No file fetches at all, so the CSP and offline constraints are met by construction. |
| Sim coupling | `cues.js` only reads; the test proves the replay hash and that no headless tool imports audio. |
