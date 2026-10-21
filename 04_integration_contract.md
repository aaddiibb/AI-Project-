# Samurai: integration contract

What the game expects from a finished character package, and what the integrator will change on the game side. The friend delivers exactly the "Deliverables" section; the integrator does the "Engine side" section.

## 1. Deliverables (the friend)

### 1.1 Folder `art/samurai/` (mirrors `art/shinobi/`)

```
art/samurai/
  rig.json            rig_p2.json         # skeleton, slots, anchors, contacts, springs, stress, default pose
  poses.json                              # every pose the Samurai uses (see 1.3)
  parts/*.svg         parts/p2/*.svg      # per-part SVGs referenced by rig*.json "file"
  samurai.moves.js                        # combat/movement data module (see 1.4)
  src/ tools/ package.json                # the build pipeline, runnable with `npm run all`
  README.md                               # how to rebuild + any deviations from this contract
  renders/                                # review images
```

`rig_runtime.js` is **shared** and stays in `art/shinobi/` (the game imports it from there). The only allowed change to it is the backwards-compatible `rig.springs` / `rig.stress` support described in `02_build_samurai_art_prompt.md` 3.4.

### 1.2 `rig.json` schema (same as the Shinobi; additions marked NEW)

```jsonc
{
  "name": "samurai", "palette": "default", "units": "master", "viewBox": "0 0 1000 1400",
  "height": 1180, "groundY": 1300, "root": "pelvis",
  "recommendedScale": 0.38,
  "slots": { "hand_near": {"options": [...], "default": "..."}, "hand_far": {...}, "face": {...}, "foot_near": {...} },
  "contacts": { "foot_near": [[x,y],...], "foot_far": [[x,y],...] },
  "anchors": { "sword_tip": {"part":"sword","x":0,"y":0}, "sword_guard": {...}, "saya_mouth": {...},
               "hand_near": {...}, "hand_near_grip": {...}, "hand_far_grip": {...}, "fist_near": {...},
               "head": {...}, "chest": {...}, "foot_far_toe": {...}, "foot_near_toe": {...} },
  "attachments": { "sword": { "rest": "<part the sheathed sword lives on>", "grips": ["hand_near_grip_sword","hand_far_grip_sword"] } },
  "defaultPose": { "root": {"x":0,"y":0}, "rot": {...}, "slots": {...}, "attach": {"sword":"<rest>"} },
  "springs": { "<partId>": {"hang":0.6,"k":60,"c":7,"g":0.04,"wind":1.2}, ... },   // NEW (data-driven springs)
  "stress":  { "<partId>": [min,max], ... },                                         // NEW
  "parts": [ { "id","parent","pivot":{x,y},"zIndex","file":"parts/x.svg","offset":{x,y},"size":{w,h},
               "slot?","rotKey?","hidden?","grip?":{x,y,axisDeg},"notes?" } ]
}
```
Bone names shared with the Shinobi must be kept (see `02_...` section 3.2). `rig_p2.json` is identical except `file` paths (`parts/p2/...`).

### 1.3 `poses.json` (pose names the game will request)

Same pose schema as the Shinobi's `poses.json` (`rot`, `slots`, `root`, `attach`, `attachRot`, `ground`, `groundBy`, `springHang`).
**Required pose names** (the Samurai has no jump, crouch, run or kick poses; do not provide them):

| Group | Poses |
|---|---|
| Idle | `stance`, `stance_b` |
| Walk | `walk_1` ... `walk_8` (planted-foot cycle; forward = ascending, backward = the same keys descending) |
| Dash forward | `dash_start`, `dash`, `dash_end` |
| Dash backward | `backdash_start`, `backdash`, `backdash_end` (**grounded** slide, not an airborne hop) |
| Guard | `guard` (standing brace; sword stays sheathed) |
| Light attack | `iai_windup`, `iai_slash`, `iai_recover` |
| Heavy attack | `heavy_windup`, `heavy_cleave`, `heavy_follow` |
| Ultimate | `ult_charge`, `ult_windup`, `ult_release`, `ult_follow`, `ult_flourish` (cosmetic during the super freeze) |
| Reactions | `hit`, `ko_stagger`, `ko_fall`, `ko_down`, `wakeup` |
| Optional | `win` (victory), `select` (character-select pose) |

### 1.4 `samurai.moves.js`: the data module

An ES module in the **same shape as `game/src/moves.js`**, per character. The friend fills the numbers (frame holds, boxes, damage) following `03_...`; the integrator wires it in.

```js
export const SAMURAI = {
  id: 'samurai', name: 'SAMURAI',
  rig: 'art/samurai/rig.json', rigP2: 'art/samurai/rig_p2.json',
  poseFiles: ['art/samurai/poses.json'],
  can: { jump: false, crouch: false, run: false },
  phys: { walkF: 9.2, walkB: 7.4, dashV: 20, dashFrames: 14, dashTotal: 28, backdashV: 17, backdashFrames: 14, backdashTotal: 22, pushHalf: 100 },
  hurt: { stand: { x0: -140, x1: 180, y0: 0, y1: 1190 } },
  walk: { steps: [/* 8 planted-foot distances */], poses: ['walk_1', /* ... */ 'walk_8'] },
  anims: {            // same entry shape as ANIMS in game/src/moves.js: { loop, frames:[{pose, hold, tween?, ease?}] }
    idle, guard, hit, dash, backdash, down, wake, knock_air
  },
  moves: {            // same entry shape as MOVES in game/src/moves.js
    light:  { name, rank, level, frames, active, box, dmg, hitstop, hitstun, blockstun, push, power, meter, adv?, arc? },
    heavy:  { name, rank, level: 'overhead', knockdown: true, frames, active, box, dmg, chip, ... , arc },
    ult:    { name, ult: true, cost: 100, freeze, frames, flash, spawnAt, projectile|fan|strike: {...} },
  },
};
```

Rules the data must obey (same as the Shinobi's data):
- Pose names inside `frames` must exist in `poses.json`.
- `active: [start, end]` is in frames from move start; `box` is `{x0,x1,y0,y1}`, **x forward from the centre line, y height above ground**, measured from rig anchors (see `03_...`).
- Levels: `mid`, `overhead` (stand-block only), `high`, `low`. The Samurai has no low moves.
- `meter` = meter gained on connect (hit full, block 60%). `chip` = fraction of damage that passes through a block.

### 1.5 Acceptance checklist (the friend must be able to tick all of these)

- [ ] `npm run all` in `art/samurai/` runs clean from a fresh checkout (after `npm install`).
- [ ] `rig.json` and `rig_p2.json` load; every `file` exists; both palettes render.
- [ ] Every pose in 1.3 exists and renders without gaps at game size (about 440 px tall).
- [ ] The Shinobi still renders identically (before/after proof for the `rig_runtime.js` change).
- [ ] Every pose name used in `samurai.moves.js` exists in `poses.json`.
- [ ] Hitboxes in `samurai.moves.js` were measured from anchors, not guessed (script output included in the README).
- [ ] A preview page shows idle, walk both ways, dash both ways, guard, light, heavy, ultimate, hit, KO and wake-up with springs running.
- [ ] No jump, crouch, run, kick or air poses were produced.

## 2. Engine side (the integrator; for the friend's information)

Nothing here is the friend's task. It explains why the contract is shaped this way.

1. **Character registry** `game/src/characters/`: one module per character exporting the object in 1.4 (the Shinobi's data moves out of `moves.js` into `shinobi.js`). `sim.js`, `render.js` and `hud.js` read the active fighter's data instead of global `MOVES` / `PHYS` / `HURT`.
2. **Per-fighter rig loading** in `main.js` (`loadRig` takes the character's `rig` / `rigP2`; pose files are merged per character).
3. **Input masking:** with `can.jump/crouch/run` false the sim ignores those inputs for that fighter (for example a held `S` does nothing; `W` does nothing; double-tap forward does nothing, only dash).
4. **Grounded back-dash** state (the Shinobi's back-hop is airborne with `vy`).
5. **Level rules unchanged:** the Samurai is `stand`-only, so the Shinobi's lows (`crouch_stab`, `sweep`) always beat his stand-block; his overhead heavy beats crouch-blockers. His damage and reach are the trade-off.
6. **Ultimate:** the sim already supports a super freeze and projectile/fan ultimates (`fan` in `ult`); a Samurai-specific projectile or strike ultimate is a small addition once the data exists.
7. **HUD / dummy / AI hooks:** names, per-character move tables, frame-data panel reading the active character, character select (later).
