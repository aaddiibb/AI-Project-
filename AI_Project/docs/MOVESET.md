# Shinobi moveset: v1 draft for refinement

Status of each item is tagged:

- **[DECIDED]**: stated by the project owner, treat as fixed unless they reopen it.
- **[PROPOSED]**: a recommendation (with reasoning) that still needs a yes/no.
- **[OPEN]**: a question nobody has answered yet.

Numbers are starting points taken from the current build (`game/src/moves.js`, 60 fps frames, 1000 HP) and meant to be tuned by playing.

---

## 1. Design goals

- **Small and readable.** Every action should matter in the neutral game; no redundant buttons. Not a Street Fighter / KOF command-list game. **[DECIDED]**
- **Decisions, not execution.** Mix-ups (high / low / overhead), spacing, and one big read-based ultimate. **[DECIDED]**
- **Must be playable by search-based AI in real time** (Minimax, MCTS, Fuzzy; see section 8). **[DECIDED]**
- No turtling: a defender who only blocks must eventually lose. **[DECIDED]**, with the mechanism in section 4.

## 2. Movement **[DECIDED]**

| Action | Input | Notes (current build) |
|---|---|---|
| Stand | none | idle breathing |
| Walk forward / back | `A` / `D` (relative to facing) | 11.4 / 9.7 units per frame |
| Dash forward | `Shift` | short burst, about 25 frames total |
| Dash backward | double-tap back (or `Shift` + back) | low airborne hop, about 25 frames |
| Run | double-tap forward and hold | accelerates to 21 units per frame, skids to a stop |
| Crouch | hold `S` | lowers hurtbox, enables crouch attacks and crouch-block |
| Jump | `W` (+ direction) | tap = light jump, hold = high jump **[OPEN: keep both?]** |
| Block | hold `Space` (+ `S` to crouch-block) | see section 4 |

## 3. Attacks **[DECIDED]**

The **normal punch is removed** (it adds nothing next to the light sword).

| Stance | Move | Key | Level | Start / Active / Recover | Damage | Notes |
|---|---|---|---|---|---|---|
| Stand | **Light sword** (kunai stab) | `J` | mid | 6 / 6 / 11 | 60 | fast, short-medium reach, chain starter |
| Stand | **Kick** | `K` | mid | 7 / 5 / 10 | 70 | longer reach, chain middle |
| Stand | **Heavy sword** (slash) | `L` | see 4 | 11 / 5 / 16 | 140 | slow, big reach, knockdown |
| Stand | **Kunai throw** | `I` | projectile | 9 / n/a / 20 | 45 | travels about 1400 units; one or two in flight |
| Crouch | **Crouch kick** (current "sweep") | `S` + `K` | **low** | 8 / 5 / 18 | 60 | knockdown |
| Crouch | **Crouch light sword** | `S` + `J` | **low** | about 7 / 4 / 12 (new) | about 45 | new move; short reach |
| Air | **Air light sword** | `J` in air | mid | about 4 / 12 / land (new) | about 45 | new move; diagonal-down stab |
| Air | **Air kick** | `K` in air | mid | 4 / 17 / land | 65 | exists |
| Any | **Ultimate** | `U` (bar full) | see 6 | see 6 | up to 50% HP | new |

Not available: air heavy sword, air kunai, crouch heavy, throws/grabs. **[DECIDED]**

### Chains **[PROPOSED]**
After a move connects (hit or block) it may cancel into a higher rank, as in the current build:
`light sword (J)` -> `kick (K)` -> `heavy sword (L)` -> `kunai throw (I)`; crouch: `crouch light sword` -> `crouch kick`.
The ultimate is **not** chainable from normals (keeps it a read, not a free combo ender). **[OPEN]**
Light sword repeating itself up to 3 times? **[OPEN]**

## 4. Blocking, hit levels and anti-turtle

### Rules as stated by the owner **[DECIDED]**
- Crouching attacks (**low**) hit an opponent who is blocking while standing; they do nothing to an opponent who is crouch-blocking.
- Heavy sword and kunai deal **chip damage** through a block, so blocking crouched (or standing) forever cannot guarantee zero damage.

### Resulting matrix **[PROPOSED]**

| Attack level | Standing block | Crouch block | Not blocking |
|---|---|---|---|
| **mid** (light sword, kick, air moves) | blocked | blocked | hit |
| **low** (both crouch moves) | **hits** | blocked | hit |
| **overhead** (heavy sword) | blocked, **chip** | **hits** | hit |
| **kunai** (projectile, chest height) | blocked, **chip** | whiffs if the target is crouching (flies over) | hit |

Why the heavy sword should be **overhead** (the current build has it as "high", which makes a crouching target simply dodge it): with a low, an overhead and chip, every defensive posture has a counter:

- standing turtle loses to lows and chip,
- crouching turtle loses to the overhead heavy sword,
- projectile spam is chipped when blocked, ducked when not.

### Chip damage **[PROPOSED]** (parameters, tune by play)
- Chip = **25%** of the move's damage for heavy sword and kunai (heavy: about 35 HP, kunai: about 11 HP); **35%** for ultimate hits (see 6).
- Whether chip can KO: **[OPEN]**. Recommendation: **yes**, otherwise turtling at 1 HP is still safe and the anti-turtle goal fails.
- A round timer (60-99 s) decided by remaining HP is a second, cheap backstop against stalling. **[OPEN]**

## 5. Super meter **[PROPOSED]**

- One bar, 0-100. Starts empty each round **[OPEN: carries over?]**.
- **Fills when you attack the opponent and the attack connects, whether it hits or is blocked.** Whiffs give nothing. **[DECIDED]**
- Suggested gain per connecting move (hit = full, blocked = 60%): light sword 6, kick 8, heavy sword 14, kunai 5, crouch light sword 6, crouch kick 8, air light sword 6, air kick 8. About 10-12 connecting moves fill the bar.
- Optional comeback: the defender gains (damage taken / 10). **[OPEN]**
- Bar is spent entirely on use. Max one stock.

## 6. Ultimate **[DECIDED concept, PROPOSED numbers]**

**Concept:** a sharp, fiery cone (fan) of kunai. Simple but readable, and it gives the opponent real choices:

- **If it hits unblocked: about 50% of max HP.**
- **If blocked: about 15-20% (chip).**
- Kunai can be dodged: a crouch lets high ones fly over, jumping avoids low ones, but because there are many it is unlikely you dodge all of them. Blocking handles most of it. **[DECIDED]**

### Proposed spec

| Parameter | Value |
|---|---|
| Activation | `U`, bar full, grounded, in a neutral state |
| Startup | 18 frames with a short screen freeze and flame flash (the telegraph) |
| Projectiles | **7 flaming kunai** in a fan, launch angles -24 / -16 / -8 / 0 / +8 / +16 / +24 degrees from horizontal, from hand height; speed about 26 units per frame; range about 1400 units |
| Damage per kunai | **70 HP (7%)** unblocked, so 7 hits = **49% (about 50%)** |
| Chip per kunai | **25 HP (2.5%)** blocked, so 7 blocked = **17.5%** (inside the 15-20% target) |
| Last hit | knockdown |
| Invulnerability | **none** during startup: you can interrupt it by hitting the Shinobi |
| If interrupted in startup | ultimate is cancelled and the meter is lost **[OPEN: or refund half?]** |
| Recovery | about 30 frames |

**Why a fan:** the cone widens with distance. Up close, everything hits (you must block or interrupt); at range the outer kunai miss a crouching or jumping target, so choosing the right counter (block / duck / jump / close in / run out of range) is a real decision, which is exactly the "let the opponent decide" goal.

**Defender counterplay table:**

| Counter | Result |
|---|---|
| Block | take about 17% chip, safe |
| Crouch (no block) | high kunai miss, middle ones hit |
| Jump | low kunai miss, the rest hit; air landing is punishable |
| Interrupt during the 18-frame startup (needs to be close) | cancels it |
| Stay out of range (more than about 1400 units) | free dodge, but gives up space |

Open ultimate questions **[OPEN]**: can it be used in the air; does the Shinobi get a cinematic cut-in (nice for presentation, small cost); should the aim follow the opponent's position at fire time (recommend: no, a fixed fan, so it stays readable).

## 7. Implementation delta (what must change in the current build)

**Status (2026-10-06):** done: punch removed (J = light sword), `crouch_stab`, `air_stab`, `ultimate` (super freeze, 7-kunai fan, chip on block), meter per fighter with per-move gain, HUD meter bars, `U` key, new poses for all of these plus a reworked crouch / jump / sweep set, and smooth animation (`game/src/animator.js`). Still open: slash `overhead`, chip on heavy slash and kunai throw, `clone()` for search.


| Area | Change |
|---|---|
| `game/src/moves.js` | remove `punch`, `crouch_punch`, `air_punch`; make `stab` the plain `J` move; add `crouch_stab`, `air_stab`, `ultimate`; set slash `level: 'overhead'`; add `chip` field per move; add `meter` gain per move |
| `game/src/sim.js` | meter state per fighter; chip on block; fan projectiles with angle; ultimate state with startup freeze; `clone()` for search (hand-written, not `structuredClone`) |
| New poses (art) | `crouch_stab` (kunai in hand, low forward stab), `air_stab` (diagonal-down kunai stab), `ult_windup`, `ult_release` (arm sweep, flame) |
| `game/src/fx.js` | fire trail on kunai, super flash and freeze, flame burst on impact |
| `game/src/hud.js` / `index.html` | meter bar under each health bar, `U` key hint, chip damage shown in a different colour |
| Controls | `J` light sword, `K` kick, `L` heavy sword, `I` kunai, `U` ultimate (frees the current `Forward+J` command) |

## 8. Is this moveset too complex for the AI? (measured, not guessed)

**Short answer: no.** Benchmarks on the current simulator (Node, one thread, random fighting on both sides):

- **About 860,000 simulated frames per second** (1.2 microseconds per frame).
- A random **one-second rollout (60 frames) costs about 0.07 ms.**
- Copying the full game state (needed for every tree branch) costs about **20 microseconds** with a naive `structuredClone`; a hand-written copy should be several times cheaper.

What that buys in a real-time budget (estimates from the above, not yet measured with a real agent):

| Agent | Budget | Roughly feasible |
|---|---|---|
| MCTS | 16 ms (one frame) | about 100-200 one-second rollouts; at 100 ms of "thinking" about 1,000+ |
| Minimax + alpha-beta | 16 ms | a few hundred nodes; **in a Web Worker with ~100 ms** (also acts as human-like reaction delay) several thousand, enough for a 2-3 decision lookahead |
| Fuzzy logic | n/a | effectively free |

### Why the moveset stays tractable
1. **Fighting games are commitment-based.** Once a move starts, the fighter cannot change its mind, so the AI only decides at decision points, about every 6-10 frames, and while stunned or recovering it has exactly one legal action.
2. **Search over macro-actions, not buttons.** About 18-21 macro-actions in total, but only about 6-10 are sensible in any one state (attacks only matter in range, air moves only airborne, ultimate only with a full bar).
   - Movement: wait, walk forward, walk back, run, dash forward, dash back, crouch, block, crouch-block, jump (neutral / forward / back).
   - Attacks: light sword, kick, heavy sword, kunai, crouch light sword, crouch kick, air light sword, air kick, ultimate.
3. **Simultaneous moves** are the real algorithmic issue, not speed: Minimax treats it as "assume the worst reply" (maximin); MCTS samples opponent behaviour. That difference is a good comparison to present.
4. **The ultimate is cheap for the simulator and good for the AI story:** one rare, high-stakes action; the AI must decide when to fire it and how to defend it.

### Recommendations for AI
- Fixed decision interval (about 8 frames) with a **reaction delay per difficulty** (more delay and more random mistakes = easier).
- A simple evaluation: HP difference, meter difference, distance vs own best attack range, being in recovery, being cornered.
- Run AI vs AI **headless** (no rendering): 100 full matches finish in seconds of simulation time plus search time, which is what the benchmarking deliverable needs.
- Do not add more moves until the AIs play sensibly with this set; the ceiling is evaluation quality, not compute.

## 9. Open questions (collected)

1. Heavy sword as **overhead** (recommended) or mid? Does a crouching, non-blocking target dodge the kunai (recommended: yes)?
2. Chip percentages, and **can chip kill**?
3. Round timer and round structure (best of 3? meter carry-over?).
4. Jump: tap = light and hold = high, or a single jump? Are air attacks blockable both ways (recommended: yes)?
5. Dash backward: pure hop, or a few invulnerable startup frames?
6. Does light sword repeat (up to 3)? Is anything chainable into the ultimate (recommended: no)?
7. Ultimate: interruptible startup (recommended: yes), meter loss on interrupt, air use, fan angles and damage split.
8. Defender meter gain on taking damage (comeback mechanic): yes or no?
9. Can the player attack out of a run, and with what momentum (current build: yes, momentum carries and decays)?
