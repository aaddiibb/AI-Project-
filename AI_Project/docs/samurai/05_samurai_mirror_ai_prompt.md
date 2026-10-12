# TASK: Samurai vs Samurai: the same fighter driven by different AI algorithms (mirror-match AI arena)

You are the gameplay + AI engineer for **Shinobi Arena**, a 2D real-time anime fighting game built for a university AI lab. Each fighter's personality is an AI algorithm. Your job:
1. Wire the finished **Samurai** character into the game.
2. Build several AI agents that each control a Samurai.
3. Make two Samurai, driven by different algorithms, fight each other: headless for benchmarks, and on screen with each AI's "thinking" visible.
4. Let a human fight any of these AIs at several difficulty levels.

A **mirror match** (same character, same moves, same numbers on both sides) is the point. Any difference in results comes from the algorithm, not the character. Treat that as the scientific core of the work.

Project root: `D:\AI\AI_Project`. Work in stages, show results after each, be critical of your own output, and **stop for approval** where indicated.

---

## 0. Preconditions (check first; if any fails, stop and say so)

- `art/samurai/` is complete: `cd art/samurai && npm run all` ends with `all checks passed`.
- `art/samurai/samurai.moves.js` exports `SAMURAI` (contract shape in `docs/samurai/04_integration_contract.md` §1.4).
- `art/shinobi/rig_runtime.js` supports `rig.springs` / `rig.stress` (already done; see `art/samurai/README.md`).
- The game runs: serve the project root (`python -m http.server 8767`) and open `http://localhost:8767/game/index.html`.

## 1. Read before writing anything (in this order)

1. `docs/MOVESET.md`: the game rules (levels high / low / overhead, chip, meter, ultimate) and **section 8, "Is this moveset too complex for the AI?"**. It has the measured simulator speed (about 860,000 frames/s, a 60-frame rollout in about 0.07 ms, a state copy in about 20 µs) and the agreed AI approach: macro-actions, about 8-frame decision points, maximin for Minimax, sampling for MCTS, headless benchmarks.
2. `docs/samurai/04_integration_contract.md`, **section 2 "Engine side"**. That integration is now YOUR task (character registry, per-fighter rig loading, input masking, grounded back-dash).
3. `art/samurai/README.md` and `art/samurai/samurai.moves.js`: the Samurai's moves, frame data, measured boxes, walk steps, the "Crimson Crescent" ultimate projectile, and the notes for the integrator.
4. `game/src/sim.js`: the deterministic 60 Hz simulator. Its input is one bitmask per fighter per frame (`BTN`). Note that it imports ONE global `PHYS` / `HURT` / `MOVES` and has **no `clone()` yet**.
5. `game/src/dummy.js`: agents plug in with the same signature, `(sim, frame) -> bits` (the comment there says so).
6. `game/src/moves.js`, `game/src/animator.js`, `game/src/render.js`, `game/src/main.js`, `game/src/hud.js`, `game/index.html`: how data, animation, rendering, boot and HUD work today.

## 2. The game idea this must serve (from the project owner)

Each fighter is a character whose personality is an AI algorithm. A human can play against the AI at several difficulty levels, and two AIs can fight each other with no human involved. Attacks are high, low or overhead. Blocking forever is unsafe because of chip. A meter fills on connect and unlocks the ultimate. The simulator is fast and deterministic, so AIs can look ahead without rendering.

Course requirements this task must satisfy:

| # | Requirement | How this task meets it |
|---|---|---|
| R1 | Two or more **fundamentally different** AIs | Minimax + alpha-beta (adversarial search), MCTS (sampling), fuzzy logic (rule-based instinct). Optional: a genetic algorithm that tunes the Minimax evaluation. |
| R2 | AI vs AI mode with **benchmark data** | A headless arena runs hundreds of Samurai-vs-Samurai mirror matches per pairing, with statistics. |
| R3 | Human-playable mode with **difficulty levels** | Search depth / time budget, reaction delay and mistake rate per level. |
| R4 | **Polished visuals that show each AI's thinking** | An on-screen overlay per fighter: chosen action, candidates and their values / visits / rule activations. |

Lab topics to map onto the code, with comments that name them: adversarial search (minimax, alpha-beta), MCTS (with the simultaneous-move variant), fuzzy logic (Mamdani inference), genetic algorithms (optional tuning). Planning and knowledge-based reasoning are optional extensions (section 9). A* is not used.

## 3. The Samurai's action set (do not add moves)

He has only: **idle, walk forward, walk back, dash forward, dash back (grounded slide), guard (stand-block only), light attack (iai cut, mid), heavy attack (overhead cleave, knockdown, chip), ultimate (Crimson Crescent, full meter)**, plus hit / knockdown / wake-up. He **cannot jump, crouch or run**.

Input mapping for a Samurai fighter (the sim must enforce it via `can: { jump:false, crouch:false, run:false }`):

| Bits | Samurai action |
|---|---|
| `L` / `R` | walk back / forward (relative to facing) |
| `DASH` | dash forward; `DASH` + back = **grounded** back-dash (`phys.backdash*`) |
| `B` | guard (standing) |
| `P` (key J) | light (`moves.light`) |
| `S` (key L) | heavy (`moves.heavy`) |
| `ULT` (key U) | ultimate (needs meter 100) |
| `U`, `D`, `K`, `T`, double-tap forward | **ignored** for the Samurai (masked in the sim, not just in the agents) |

## 4. Technical requirements

### 4.1 Integration (contract 04 §2), behaviour-preserving for the Shinobi

- **Character registry** in `game/src/characters/`:
  - `index.js` exports `CHARACTERS = { shinobi, samurai }`.
  - `shinobi.js` moves the Shinobi's `PHYS` / `HURT` / `MOVES` / `ANIMS` / walk data out of `moves.js`. Keep `moves.js` as a thin re-export so nothing else breaks.
  - `samurai.js` re-exports `art/samurai/samurai.moves.js` and maps its move names onto buttons (`P` → `light`, `S` → `heavy`, `ULT` → `ult`).
- **Per-fighter data in the sim.** `new Sim({ chars: ['samurai', 'samurai'] })`. Every read of `PHYS` / `HURT` / `MOVES` goes through the fighter's own character (`f.char.phys`, ...). Mixed matches (Shinobi vs Samurai) must also work.
- **Input masking** from `can.*`; **grounded back-dash** state for characters without a hop; **chip as a fraction** (`chip: 0.25`) as well as the Shinobi's absolute fan chip; the Samurai's **crescent projectile** (`moves.ult.projectile.kind = 'crescent'`: one wide low projectile with `knockdown`, `noScale`, chip on block, mid level).
- **Per-fighter rig loading** in `main.js` / `render.js` / `animator.js`:
  - Each puppet uses its character's rig, P2 rig and poses.
  - The animator takes `ANIMS` / walk data / `MOVES` from the character, not from global imports.
  - The camera and pushboxes use each character's `pushHalf`.
  - `render.js` keeps importing the **shared** `art/shinobi/rig_runtime.js`.
- **Mirror palettes.** In a mirror match, P1 uses `rig.json` and P2 uses `rig_p2.json` (indigo/ivory/gold, black hair), so the two Samurai are always distinguishable.
- **Regression proof (mandatory).** Before refactoring, record a fixed input script for Shinobi vs Shinobi (at least 3,000 frames mixing every move, jump, crouch, ultimate). Hash the sim state every frame. After the refactor, replay it: **every frame's hash must match.** Put the tool in `game/tools/replay_hash.mjs`. Do not change any Shinobi frame data.

### 4.2 Simulator support for search

- **`sim.clone()`**: a hand-written deep copy of ALL mutable state (fighters including input buffers and tap timers, projectiles, hitstop, super-freeze, KO timer, frame counter, combo display), sharing only immutable character data.
  - Test it: clone, step both copies with the same random inputs for 600 frames, and compare hashes every frame.
  - Benchmark it against `structuredClone` (MOVESET §8 says a hand-written copy should be several times cheaper; measure it).
- **`sim.hash()`**: a stable state hash for determinism tests and transposition tables.
- **Headless:** the sim and the agents must run under Node with no DOM and no PixiJS imports.
- **Rounds.** The arena (not the sim) runs rounds:
  - best of 3, 99-second round timer (5,940 frames); at time-out the higher HP percentage wins, equal is a draw;
  - meter carries over between rounds;
  - start positions are the sim's defaults, sides swapped per match half (see 5.3).

### 4.3 Agent interface (`game/src/ai/agent.js`)

```js
// One agent instance controls one fighter. The game / arena calls act() once per simulation frame.
export class Agent {
  constructor({ side, seed, level, budgetMs, reactionFrames, mistakeRate }) {}
  reset(sim) {}                 // new round
  act(view, frame) { return 0 } // -> BTN bitmask for this frame
  thinking() { return null }    // data for the on-screen overlay (see 6.2); must be cheap
}
```

- **`view`, not the live sim.** The agent receives a read-only snapshot delayed by `reactionFrames` (a ring buffer of `sim.clone()`s). The live sim is NOT visible to it. Inside its own search it may clone and step that snapshot freely.
- **Simultaneity is real.** An agent must never read the opponent's inputs, buffers or decision for the current or future frames. Assert this: the opponent's `buf`, `prev` and `tap*` are zeroed in the view. Search must model the opponent's reply, not peek at it.
- **Determinism.** All agent randomness comes from a seeded PRNG (e.g. mulberry32 with `seed`). No `Math.random`. With the same seeds a whole match replays bit-identically. Under a wall-clock budget, results can vary with machine speed, so the arena must also support a deterministic **node/rollout budget** mode for reproducible benchmarks.

### 4.4 Macro-actions (`game/src/ai/macros.js`), shared by all agents

Search over macro-actions, not raw buttons (MOVESET §8). A macro is a short, committed input program. The Samurai has about 9:

| Macro | Program (relative to facing) | Legal when |
|---|---|---|
| `wait` | neutral for 8 frames | free |
| `walk_fwd` / `walk_back` | hold forward / back for 8 frames | free |
| `dash_fwd` / `dash_back` | `DASH` (+ back) once, then neutral until the dash ends | free |
| `guard` | hold `B` for 8 frames | free (also while being hit: holds the guard) |
| `light` | `P` once, then neutral until the move ends | free |
| `heavy` | `S` once, then neutral until the move ends | free |
| `ult` | `ULT` once | free and meter = 100 |

- **Decision points:** whenever the fighter is free (`idle` / `walk` / `guard`) and its previous macro has finished, or every 8 frames while free. While committed (attack, dash, hitstun, blockstun, knock, down, wake) there is exactly one action, so no search happens.
- **Legality filter:** prune pointless macros, such as `light` / `heavy` when the opponent is far outside the move's measured reach plus one dash (use the boxes in `samurai.moves.js`), or `ult` without meter.

### 4.5 The agents (all control the SAME Samurai data)

1. **`MinimaxAgent`: the "Minimax Samurai" (the character's canonical brain; R1 core).**
   - Depth-limited search over macros with **simultaneous moves**. At each node both sides pick a macro at once; the value is **maximin**: `max over mine (min over theirs (value after both play))`. Say in comments and in the report that this is pessimistic, and why that suits a disciplined duelist.
   - **Alpha-beta pruning** on the inner min and across siblings, with move ordering (previous best first, then attacks in range, guard, movement).
   - Iterative deepening under a time or node budget, plus a transposition table keyed by `sim.hash()` and depth.
   - Simulate each macro pair forward with `clone()` + `step()` until the next decision point of either side, capped at about 40 frames.
   - **Evaluation function** (`game/src/ai/eval.js`), a weighted sum with every term documented:
     - HP difference;
     - meter difference, with a bonus when full;
     - distance error versus the Samurai's best range (the light's measured reach);
     - who is committed / in recovery (a whiffed heavy is a big minus);
     - corner pressure (distance to the stage edge);
     - knockdown advantage;
     - pending projectile threat.
   - Weights live in one exported object so the GA (4.6) can tune them.
2. **`MctsAgent`: sampling-based (R1, fundamentally different).**
   - **Decoupled UCT (DUCT)** for simultaneous moves: each node keeps separate UCB statistics per player, and both players pick independently.
   - Rollouts of about 60 to 120 frames using a light random-but-legal macro policy (biased toward guard when the opponent is in an attack's startup), then the same `eval.js` at the horizon, squashed to [0, 1].
   - Selects by visit count; exposes visits / mean value per root macro for the overlay.
   - Default budget 16 ms per decision (one frame) or a fixed rollout count in benchmark mode. Report rollouts per second.
3. **`FuzzyAgent`: instinct (R1, rule-based, no search).**
   - Mamdani inference:
     - **inputs:** distance (close / mid / far), own HP and opponent HP (low / mid / high), meter (empty / partial / full), opponent state (attacking / recovering / neutral);
     - **output:** aggression (0..1) and a defensive bias.
   - At least 12 readable rules, e.g. "IF opponent recovering AND distance mid THEN aggression very high (punish with heavy)".
   - Defuzzify by centroid, then map to a macro with a tiny deterministic table plus the seeded RNG.
   - Exposes rule activations and membership degrees for the overlay.
4. **Baselines (for sanity and the report):**
   - `RandomAgent`: uniform over legal macros.
   - `ScriptedAgent`: a short hand-written "walk in, light, guard, heavy on whiff" policy.
5. **Difficulty wrapper** (`game/src/ai/difficulty.js`) for any agent:

   | Level | Budget | Reaction delay | Mistake rate |
   |---|---|---|---|
   | Easy | 2 ms | 22 frames | 20% |
   | Normal | 8 ms | 14 frames | 8% |
   | Hard | 16 ms | 9 frames | 2% |
   | Master | 50 ms in a Web Worker | 6 frames | 0% |

   A mistake replaces the chosen macro with a random legal one. Document the levels.

### 4.6 Genetic algorithm tuning (optional but recommended; lab topic)

`game/tools/ga_tune.mjs` evolves the `eval.js` weights for `MinimaxAgent` by self-play in the mirror match:
- population 16 to 24, tournament selection, blend crossover, Gaussian mutation, about 15 generations;
- fitness = win rate against a fixed panel (the current default weights, `MctsAgent` at a small budget, `FuzzyAgent`), in **deterministic node-budget mode** so it reproduces;
- logs every generation (best / mean fitness) to `game/tools/out/ga_log.csv`, writes `ga_best.json`, and reports the evolved Minimax against the hand-tuned one in the benchmark.

## 5. AI vs AI: the mirror arena (R2)

### 5.1 Headless runner `game/tools/arena.mjs`

```
node game/tools/arena.mjs --p1 minimax --p2 mcts --char samurai --matches 200 --seed 1 --budget nodes:4000 [--level hard] [--out game/tools/out/]
```

- Runs full best-of-3 matches with no rendering, swapping sides for half the matches, and with per-match seeds derived from `--seed`.
- Records per match: winner, rounds, final HP, time-outs, damage dealt, hits / blocks / chip / ultimates landed / whiffed heavies, decision count, mean and p95 decision time, nodes or rollouts per decision.
- Writes `matches.csv` + `summary.json` and prints a summary table.
- Supports `--replay <matchId>`, which dumps the input log so the match can be watched in the browser (5.2) frame for frame.

### 5.2 On-screen AI vs AI mode

- From the game menu: pick **Samurai vs Samurai**, an agent and difficulty per side, then Start. Both fighters are AI-driven, and the human only spectates.
- Pause / step / 0.25×–4× speed controls work as today.
- **Replay mode:** load an arena input log and play it back bit-identically (proof that headless results and on-screen behaviour match).

### 5.3 Benchmark protocol (put the results in the report)

- **Round-robin among** Minimax, MCTS, Fuzzy, Random, Scripted (+ GA-Minimax if done), all as Samurai vs Samurai. At least 200 matches per pairing, sides swapped half the time.
- **Tables:**
  - win rate with a 95% Wilson interval;
  - draw rate;
  - mean HP margin;
  - damage per match;
  - hit / block ratios;
  - ultimates used and landed;
  - mean / p95 decision time;
  - nodes or rollouts per decision.
- **Sanity checks:**
  - every real agent beats `RandomAgent` above 90%;
  - **self-mirror** (Minimax vs Minimax, MCTS vs MCTS) is about 50/50; if it is not, there is a side bias in the sim or the arena, so find it and fix it;
  - side-swap results agree within their confidence intervals.
- **Scaling curves:** win rate against budget (Minimax depth or nodes, MCTS rollouts) versus a fixed opponent.
- **Discussion:** why maximin plays more defensively than DUCT, and where each wins (whiff punishing, ultimate timing, spacing at the Samurai's long reach). Use the data, not intuition.

## 6. Human vs AI and the visuals (R3, R4)

### 6.1 Modes

- **Menu** (title screen): `Human vs AI`, `AI vs AI`, `Training` (today's dummy modes). Character select per side (Shinobi or Samurai), agent select, difficulty select.
- The human is always P1 on the keyboard. Keys stay as in `game/src/input.js`; for a Samurai, the masked keys do nothing.

### 6.2 "Thinking" overlay (toggle `H` or a menu checkbox; one panel per AI fighter, in that fighter's palette colour)

| Agent | Shows |
|---|---|
| Minimax | depth reached; nodes searched; chosen macro; per-macro worst-case value bars; the principal variation as icons (my macro / their reply / my macro …) |
| MCTS | rollouts this decision; visit-count bars and mean value per root macro; win-probability estimate |
| Fuzzy | membership bars for the inputs; the 3 strongest firing rules as text; aggression meter |

All agents also show a small "intent" label above the fighter's head (e.g. `PUNISH: heavy`, `SPACE: walk back`) for half a second after each decision.

- The overlay reads only `agent.thinking()`. Rendering must never affect the sim.
- Keep it readable at 1920×1080, styled to match the existing HUD.

## 7. Working process (stage-gated; STOP after each stage and show evidence)

**Stage 0: Plan.** Check the preconditions. Write `game/AI_PLAN.md`: file layout, the refactor plan for per-fighter data, the clone strategy, the macro list, eval terms, agent designs and the benchmark plan. List risks. **STOP.**

**Stage 1: Integration.**
- Registry, per-fighter data, input masking, grounded back-dash, crescent projectile, fractional chip, per-fighter rigs/poses.
- Evidence:
  - replay-hash proof that Shinobi vs Shinobi is frame-identical before and after;
  - Samurai vs dummy playable in the browser, every Samurai move hitting / blocking with the right level, chip and knockdown;
  - a Samurai vs Samurai mirror rendering with P1/P2 palettes;
  - screenshots.

**STOP.**

**Stage 2: Search support.**
- `clone()`, `hash()`, headless `arena.mjs` with Random and Scripted agents, rounds and timer.
- Evidence: clone equality test, clone vs `structuredClone` timing, frames per second of the mirror sim, a 200-match Random vs Scripted run.

**STOP.**

**Stage 3: Agents.**
- Minimax, MCTS, Fuzzy (+ difficulty wrapper).
- Unit tests:
  - Minimax's alpha-beta returns the same value as plain maximin on small fixed positions;
  - MCTS beats Random above 90%;
  - Fuzzy rules fire as documented.
- Show a short headless log of decisions per agent with its reasoning.

**STOP.**

**Stage 4: Mirror benchmark** (+ GA if done). Full round-robin per 5.3, scaling curves, tables and charts in `docs/ai_benchmark.md` (charts as PNG from Node, or an HTML page). **STOP.**

**Stage 5: In-game AI vs AI and Human vs AI.** Menu, mirror spectating with the thinking overlay, difficulty levels, replay of arena logs. Evidence: screenshots or a short screen capture of Minimax-Samurai vs MCTS-Samurai with overlays, and a human-vs-Easy/Hard play-test note. **STOP.**

**Stage 6: Report and acceptance.** `docs/ai_report.md` for the course:
- the algorithms (with the lab topic each covers);
- the simultaneous-move discussion;
- the benchmark results and what they show;
- difficulty design;
- limitations.

Tick the checklist below with evidence. **STOP.**

## 8. Acceptance checklist

- [ ] Shinobi vs Shinobi replay hash identical before and after the refactor (tool output included).
- [ ] Samurai fully playable: no jump / crouch / run / kick inputs take effect; back-dash grounded; heavy is overhead with chip; ultimate projectile hits low-to-mid, is blockable with chip, and is jumpable.
- [ ] `sim.clone()` passes the 600-frame equality test; `sim.hash()` stable; the sim and agents run headless under Node.
- [ ] At least 3 fundamentally different agents (Minimax + alpha-beta, MCTS/DUCT, Fuzzy) controlling the same Samurai data.
- [ ] Agents see only a delayed, read-only view; no peeking at opponent inputs (asserted); all randomness seeded.
- [ ] `arena.mjs` round-robin with at least 200 matches per pairing, side-swapped, CIs reported; self-mirror about 50%; every agent above 90% vs Random.
- [ ] On-screen AI vs AI mirror match with per-agent thinking overlays; human vs AI with 4 documented difficulty levels.
- [ ] Arena replays play back bit-identically in the browser.
- [ ] `docs/ai_report.md` and `docs/ai_benchmark.md` written from measured data.

## 9. Optional extensions (only after the checklist is green)

- **Planning (PDDL/STRIPS):** a planner that builds "meter → ultimate setup" sequences (preconditions: meter full, opponent in recovery, range). Compare it with search.
- **Knowledge-based reasoning:** a forward-chaining rule base ("opponent whiffed heavy → punish window open") feeding the Fuzzy agent or Minimax move ordering.
- **Opponent modelling for MCTS:** bias opponent rollouts with the observed macro frequencies of the current opponent.
- **Mixed matches:** Minimax-Samurai vs MCTS-Shinobi (not a mirror; report separately).

## 10. Rules and anti-patterns

- **Do not modify `art/`** except to report a data bug. If balance needs tuning (for example the Samurai's very long measured reach, see `art/samurai/README.md` "Balance note"), change it in `art/samurai` via its pipeline (`npm run all`), document it, and re-run the benchmark. Never hand-edit hit boxes.
- No `Math.random`, no wall-clock-dependent results in benchmark mode, no agent reading the live sim, no rendering code inside the sim or the agents.
- Do not add moves, jumps or crouches to the Samurai. Do not change the Shinobi's frame data.
- **Reject and redo:**
  - an "AI" that is a script with a different name;
  - Minimax that ignores the opponent's simultaneous reply;
  - MCTS that peeks at the opponent's real inputs;
  - benchmarks without side swapping or confidence intervals;
  - a self-mirror far from 50% left unexplained;
  - an overlay that slows the game below 60 fps.
- Always run and look at your own results (logs, tables, screenshots) before claiming a stage is complete. If something is weak, say so plainly and propose the fix.
