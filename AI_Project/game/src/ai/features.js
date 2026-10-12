// Observable features of a game state from one side's point of view, shared by the evaluation function, the Fuzzy agent,
// the scripted baseline and the MCTS rollout policy. Everything here is readable from the screen (positions, states,
// animation frames, HP, meter): nothing reads the opponent's inputs.
import { FREE_STATES } from '../sim.js';
import { WORLD } from '../characters/common.js';

/** forward reach of a move's hit box including its lunge (`adv` per frame until the end of the active window) */
export function moveReach(m) {
  if (!m) return 0;
  if (m.projectile) return m.projectile.ox + m.projectile.vx * m.projectile.life + m.projectile.w / 2;
  if (m.fan) return m.fan.ox + m.fan.speed * m.fan.life;
  return m.box.x1 + (m.adv || 0) * m.active[1];
}

/** phase of a fighter: neutral | startup | active | recovery | stunned | down | moving | air */
export function phase(sim, f) {
  const s = f.state;
  if (FREE_STATES.has(s)) return 'neutral';
  if (s === 'attack') {
    const m = sim.C(f).moves[f.move];
    if (m.active) return f.t < m.active[0] ? 'startup' : f.t < m.active[1] ? 'active' : 'recovery';
    return f.t <= (m.spawnAt ?? 0) ? 'startup' : 'recovery';
  }
  if (s === 'hitstun' || s === 'blockstun') return 'stunned';
  if (s === 'knock' || s === 'down' || s === 'wake') return 'down';
  if (s === 'air' || s === 'prejump') return 'air';
  return 'moving'; // dash, backdash, backhop, land, run
}

/** frames until the fighter can act again (0 when free) — an estimate from frame data */
export function framesToFree(sim, f) {
  const s = f.state;
  if (FREE_STATES.has(s)) return 0;
  const P = sim.C(f).phys;
  switch (s) {
    case 'attack': return Math.max(0, sim.C(f).moves[f.move].total - f.t);
    case 'hitstun': case 'blockstun': return Math.max(0, f.stun);
    case 'dash': return Math.max(0, (P.dashTotal ?? 25) - f.t);
    case 'backdash': return Math.max(0, (P.backdashTotal ?? 22) - f.t);
    case 'knock': return 50 + 14;
    case 'down': return Math.max(0, 46 - f.t) + 14;
    case 'wake': return Math.max(0, 14 - f.t);
    default: return 10;
  }
}

/** main features for side `side` */
export function features(sim, side) {
  const me = sim.f[side], op = sim.f[1 - side];
  const C = sim.C(me), O = sim.C(op);
  const dist = Math.abs(op.x - me.x);
  // how far my hit box must reach to touch the opponent's body (their hurtbox front facing me)
  const opFront = (op.facing === Math.sign(me.x - op.x) || me.x === op.x) ? O.hurt.stand.x1 : -O.hurt.stand.x0;
  const meFront = (me.facing === Math.sign(op.x - me.x) || me.x === op.x) ? C.hurt.stand.x1 : -C.hurt.stand.x0;
  const gap = dist - opFront;      // distance my attacks must cover
  const opGap = dist - meFront;    // distance the opponent's attacks must cover
  const lo = WORLD.stageMargin, hi = WORLD.stageW - WORLD.stageMargin;
  const dirToOp = op.x >= me.x ? 1 : -1;
  const wallBehind = dirToOp > 0 ? me.x - lo : hi - me.x;   // room to retreat
  const opWallBehind = dirToOp > 0 ? hi - op.x : op.x - lo;
  const lightName = C.moves.light ? 'light' : 'stab', heavyName = C.moves.heavy ? 'heavy' : 'slash';
  const lightReach = moveReach(C.moves[lightName]), heavyReach = moveReach(C.moves[heavyName]);
  const opLightReach = moveReach(O.moves[O.moves.light ? 'light' : 'stab']), opHeavyReach = moveReach(O.moves[O.moves.heavy ? 'heavy' : 'slash']);
  const opPhase = phase(sim, op), myPhase = phase(sim, me);
  const opMove = op.state === 'attack' ? O.moves[op.move] : null;
  const opMoveReach = opMove ? moveReach(opMove) : 0;
  // incoming projectiles (owned by the opponent, heading at me)
  let threat = null;
  for (const p of sim.projectiles) {
    if (p.owner === side) continue;
    const dx = me.x - p.x;
    if (Math.sign(dx) !== Math.sign(p.vx) && Math.abs(dx) > 200) continue;
    const eta = Math.abs(dx) / Math.max(1, Math.abs(p.vx));
    if (!threat || eta < threat.eta) threat = { eta, dmg: p.spec.dmg, chip: p.spec.chip || 0 };
  }
  return {
    me, op, dist, gap, opGap, wallBehind, opWallBehind, dirToOp,
    lightReach, heavyReach, opLightReach, opHeavyReach, opMoveReach,
    myPhase, opPhase, opMove: op.state === 'attack' ? op.move : null,
    myFree: framesToFree(sim, me), opFree: framesToFree(sim, op),
    hp: me.hp / C.phys.hp, opHp: op.hp / O.phys.hp, meter: me.meter, opMeter: op.meter,
    threat,
  };
}
