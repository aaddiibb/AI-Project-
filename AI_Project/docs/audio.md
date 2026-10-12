# Sound for Shinobi Arena (prompt 06)

The game now has combat sound effects, match stingers, UI sounds and a reactive taiko / koto / shakuhachi score. Every
sound is **synthesised in code** when the page loads: there are no sample files, nothing to license or download, and the
game still works offline and as a hosted page. Audio only **reads** the simulation. The replay hash (`39e93813`, 3,600
frames) and every benchmark result are unchanged.

Listen: [`audio/demo_minimax_vs_mcts.mp3`](audio/demo_minimax_vs_mcts.mp3) (37 s). This is the demo replay, Minimax vs
MCTS in a Samurai mirror, rendered through the game's own audio engine. The spectrogram is in
[`img/audio_demo_spectrogram.png`](img/audio_demo_spectrogram.png).

## What each sound tells the player

| You hear | It means | Trigger (read from the sim) |
|---|---|---|
| saya click + steel "shing" + fast whoosh | Samurai iai cut (light) is coming; the whoosh peaks on the first active frame | move `light`, frame 4 (active 7) |
| long rising two-handed whoosh | Samurai overhead cleave (heavy): block or get out | move `heavy`, frame 6 (active 16) |
| short high swish / cloth whip / blade whoosh | Shinobi stab / kick or sweep / heavy slash | each move's first active frame minus the whoosh's peak |
| thump + cloth + blade "shk"; heavier = more low end | a hit, light / mid / heavy (from `power`) | `hit` event |
| bright metallic accent on top of the hit | counter hit (the defender was mid-attack) | `hit.counter` |
| sub boom, music dips | K.O. | `hit.ko` |
| ringing steel / wood-and-metal clack | blocked by the Samurai / by the Shinobi | `block` (defender's character) |
| gritty scrape after the block | chip damage went through the guard | `block.chip > 0` |
| o-daiko hit, a shimmer swelling across the freeze, a kiai | an ultimate has started (the world is frozen for 34 frames) | `super` |
| a huge sweep, then a hum that moves across the stereo field | the Crimson Crescent is travelling (pan follows the projectile every frame) | `crescent` + live projectile x |
| kunai flick / 7 staggered flicks with a fire crackle / thunk | kunai throw / Shinobi ultimate fan / a kunai hits the floor | `throw` / `fan` / `pland` |
| cloth burst + sandal skid / heel drag | dash or run start / the Samurai's grounded back-dash | state entry `dash`, `run`, `backdash` |
| soft footsteps | walking (one per half walk cycle) or running | `walkDist` / `runDist` |
| faint cloth and armour settle | someone raised their guard (once per entry) | state entry `guard` |
| light push-off / wooden floor / body fall | jump / landing / knocked down | `jump`, `land`, `land.down` |
| n taiko strikes + gong | round n | match phase `intro` |
| two hyoshigi clacks + taiko + kiai | FIGHT! | `intro` → `fight` |
| gong / accelerating hyoshigi roll | K.O. / TIME | phase `ko` (reason) |
| koto flourish + gong / gong alone | a winner / a draw | phase `over` |
| wood-clock ticks, higher for the last 3 | the last 10 seconds | `match.timeLeft` |

In a mirror match, P2 uses a different set of variants and plays 5 % lower, so the two Samurai can be told apart by ear.
Every cue also takes a small seeded pitch variation (±3 %), so nothing machine-guns. The seed resets with every game, so
a replay sounds the same every time.

## Music

The score is in D *miyako-bushi* (D Eb G A Bb) at 80 BPM: 48 bars (2 min 24 s) that loop seamlessly, plus an 8-bar menu
ambience. It has three stems:

| Stem | Instruments | Gain |
|---|---|---|
| base | drone pad, koto ostinato, downbeat taiko | always on |
| percussion | shime 8ths, don/ka groove, fills every 8 bars | `smoothstep(0.15, 0.55, T)` |
| high | shakuhachi phrases and koto runs | `smoothstep(0.45, 0.85, T)` |

`T` is the fight tension, computed only from what is on screen and smoothed over 1.5 s:

```
T = 0.35 close + 0.35 lowHP + 0.15 fullMeter + 0.3 last10s
```

A quiet footsie exchange is mostly drone and koto. When the fighters close in, HP runs low or a meter fills, the drums
and then the flute come in.

The music ducks −9 dB on an ultimate and on a K.O., and −6 dB under the round stingers. It never restarts between
rounds. Pausing fades it out, and the menu crossfades to the wind-and-drone ambience.

## Mix

```
voices -> gain -> stereo pan (from world x, relative to the camera) -> bus (dry + reverb send)
buses  music 0.6 · sfx 0.9 · ui 0.55 · voice 0.85   -> duck -> pause -> compressor (−14 dB, 4:1) -> limiter (−1.5 dB) -> out
reverb a procedural 1.4 s dojo-hall impulse response; each bus's reverb follows that bus's volume, duck and pause
```

- Up to 24 SFX voices (lowest priority stolen first) and 10 music voices.
- Each sound has a minimum repeat interval (for example 90 ms for footsteps, 40 ms for whooshes), so 4× speed stays clean.
- Stingers and UI sounds are centred, and the K.O. boom stays near the centre.

### Measured

Offline render of the demo replay through the engine (`npm run audio:render`, BS.1770 meter in
`src/audio/loudness.js`):

| | Integrated | Short-term max | Peak |
|---|---|---|---|
| full mix | **−15.7 LUFS** | −14.0 LUFS | −2.6 dBFS |
| music alone | **−22.4 LUFS** | | −7.6 dBFS |

Both match the plan's targets: about −16 for the fight and about −22 for the music, with peaks under −1 dBFS. Two
renders of the same replay differ by at most 1 LSB on 0.02 % of samples (−110 dB, browser float rounding in the
convolver). The cue stream itself is bit-identical; `test_audio.mjs` proves that.

Cost on the main thread over a full replay (2,100 steps):

| Hook | Mean | Worst |
|---|---|---|
| `sound.onStep` | 0.010 ms | 2.5 ms |
| `sound.update` | 0.006 ms per frame | |

That is well under 1 % of a 16.7 ms frame. The bank (125 buffers, 168 s of audio) renders in about 3 s in a Web Worker
(with a main-thread fallback), so the game never stutters while sounds are built.

## Tests (`node game/tools/test_audio.mjs`, part of `npm test`)

All 27 pass. They cover:

- **Isolation.** No module reachable from `sim.js`, the 15 AI modules or the 11 headless tools imports `src/audio/`. The
  pure audio modules never import the browser engine. No audio code assigns to the sim.
- **Read-only.** With the cue tracker running on every step, the demo replay matches all 27 checkpoint and round-end
  hashes of the arena log.
- **Determinism.** Two runs give the same 127 cues: ids, frames, variants and rates.
- **Agent views.** A view (`sim.clone()`) carries no events, so it can never trigger an event cue.
- **Timing.** Swing whooshes start 3 / 10 / 3 / 5 frames before the first active frame (Samurai light / heavy, Shinobi
  stab / slash) and peak on it.
- **Impacts.** Every hit has exactly one impact cue, on the hit frame.
- **Chip.** The chip scrape plays only when `chip > 0`.
- **Guard.** One guard cue per guard entry.
- **Footsteps.** Footsteps follow the walk distance.
- **Crescent.** The crescent loop follows the projectile's x every frame and stops when it is gone.
- **Ultimates.** Ultimate order is correct for both characters, including the Shinobi kunai and fan.
- **Timer.** Ticks 10…1, the last 3 high, then TIME.
- **Stingers.** Match stingers play in order.
- **Bank.** Every sound has a recipe. All 125 buffers are finite and normalised. Renders are deterministic and variants
  differ. Loops are seamless. Every note of the score exists. The koto is in tune (A3: 0.0 cents).
- **Loudness meter.** Reads a −20 dBFS sine as −19.99 LUFS.

Browser checks (headless Chromium):
- nothing plays before the first gesture, including an autostarted replay;
- FIGHT or the first key unlocks audio;
- `M` mutes (in the menu too);
- the sliders work and survive a reload;
- `P` pauses and resumes the music; `Esc` switches to the menu ambience and back;
- 4× speed works;
- replay and Shinobi training produce their cues;
- there are no console errors.

## How to retune

| To change… | Edit |
|---|---|
| how a sound sounds | its recipe in `src/audio/dsp.js` (each one is a few layered calls: `whoosh`, `noise`, `tone`, `modal`, `pluck`) |
| how loud it is, its reverb, priority, repeat limit, ducking, stereo width | its row in `SOUNDS` in `src/audio/sounds.js` |
| when a swing whoosh starts | `peakMs` in `SOUNDS` (`cues.js` starts it so that it peaks on the first active frame) |
| bus levels, compressor, limiter, reverb, voice cap | `MIX` in `sounds.js` |
| the music | `src/audio/score.js` (patterns, phrases, stem gains); instrument levels in `INSTRUMENTS` |
| how tension reacts | `tension()` in `src/audio/cues.js` |

After a change, run `npm test`, then `npm run serve` and `npm run audio:render`. Without Playwright, open
`http://localhost:8767/game/tools/audio_render.html` in a browser. It renders the demo replay and offers the WAV with
its loudness numbers. `?audiolog=1` on the game URL prints every cue with its sim frame.

## Credits

Every sound is original and generated by `src/audio/dsp.js`. There are no third-party recordings, so
`game/assets/audio/` is not needed and does not exist. Total shipped audio: about 69 KB of JavaScript (including the bank-render worker).

## Limitations

- I tuned the sounds by measurement (loudness, spectra, timing, pitch), not by ear; the model building this cannot listen.
  The recipes are easy to adjust (see above). Your ears are the real acceptance test: say which sounds feel wrong and
  they can be retuned.
- Procedural synthesis is cleaner than recorded foley. The steel, wood and drums are convincing, but the kiai is a
  formant-synthesised "HAA!" and reads as stylised. There is no announcer voice; taiko, gong and hyoshigi do that job.
- The 60 fps check could not be run on a GPU here: the headless browser renders in software at about 4 fps with or
  without sound. The audio cost was measured directly instead (above).
- Pressing `P` while a game is still loading is undone when loading finishes. This is the existing pause behaviour,
  which the music follows.
