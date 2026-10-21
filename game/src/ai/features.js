// Observable features of a game state from one side's point of view, shared by the evaluation function, the Fuzzy agent,
// the scripted baseline and the MCTS rollout policy. Everything here is readable from the screen (positions, states,
// animation frames, HP, meter): nothing reads the opponent's inputs.
import { FREE_STATES } from '../sim.js';
import { WORLD } from '../characters/common.js';

/** forward reach of a move's hit box including its lunge (`adv` per frame until the end of the active window) */
export function moveReach(m) {
  if (!m || (!m.box && !m.projectile && !m.fan && !m.waves && !m.clones)) return 0; // e.g. the parry (no hit box)
  if (m.clones) return 2600; // Kage Bunshin: the clones reach him anywhere
  if (m.projectile) return m.projectile.ox + m.projectile.vx * m.projectile.life + m.projectile.w / 2;
  if (m.fan) return m.fan.ox + m.fan.speed * m.fan.life;
  if (m.waves) return Math.max(...m.waves.map((w) => w.ox + w.vx * w.life));
  const lunge = m.lunge ? m.lunge.v * Math.max(0, Math.min(m.active[1], m.lunge.to) - m.lunge.from) : 0; // stepping thrust
  return m.box.x1 + (m.adv || 0) * m.active[1] + lunge;
}

/**
 * frames until projectile p touches fighter d's hurtbox front (Infinity once it has passed or moves away). Uses the
 * standing box: the decision a defender makes (crouch, jump, parry) is about when the projectile ARRIVES.
 */
export function projEta(sim, p, d) {
  const hb = sim.worldBox(d, sim.C(d).hurt.stand), w = p.spec.w / 2;
  const toward = p.vx > 0 ? hb.x1 > p.x - w : hb.x0 < p.x + w;
  if (!toward) return Infinity;
  const gap = p.vx > 0 ? hb.x0 - (p.x + w) : (p.x - w) - hb.x1;
  return Math.max(0, gap) / Math.max(1, Math.abs(p.vx));
}
/** can this projectile be parried (everything except the kunai fan / non-parryable ultimates) */
export const parryable = (p) => !p.fan && (!p.spec.noScale || !!p.spec.parryable);

/** phase of a fighter: neutral | startup | active | recovery | stunned | down | moving | air */
export function phase(sim, f) {
  const s = f.state;
  if (FREE_STATES.has(s)) return 'neutral';
  if (s === 'attack') {
    const m = sim.C(f).moves[f.move];
    if (m.active) return f.t < m.active[0] ? 'startup' : f.t < m.active[1] ? 'active' : 'recovery';
    if (m.waves) return f.t < m.waves[0].at ? 'startup' : f.t <= m.waves.at(-1).at ? 'active' : 'recovery'; // wave ultimate: still throwing
    if (m.clones) return f.t < m.clones.kick.at ? 'startup' : f.t <= m.cloneEnd ? 'active' : 'recovery'; // clones still attacking
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
  const thrustReach = C.moves.thrust ? moveReach(C.moves.thrust) : 0;
  const opLightReach = moveReach(O.moves[O.moves.light ? 'light' : 'stab']), opHeavyReach = moveReach(O.moves[O.moves.heavy ? 'heavy' : 'slash']);
  const opPhase = phase(sim, op), myPhase = phase(sim, me);
  const opMove = op.state === 'attack' ? O.moves[op.move] : null;
  const opMoveReach = opMove ? moveReach(opMove) : 0;
  // incoming projectiles (owned by the opponent, heading at me)
  // (eta = frames until it reaches my body; shape = the Samurai's wave height class: high / low / tall; kunai otherwise)
  let threat = null;
  for (const p of sim.projectiles) {
    if (p.owner === side) continue;
    const eta = projEta(sim, p, me);
    if (!Number.isFinite(eta)) continue;
    if (!threat || eta < threat.eta) threat = { eta, dmg: p.spec.dmg, chip: p.spec.chip || 0, parryable: parryable(p), shape: p.spec.shape || (p.fan ? 'fan' : 'kunai'), ult: !!p.spec.ult };
  }
  return {
    me, op, dist, gap, opGap, wallBehind, opWallBehind, dirToOp,
    lightReach, heavyReach, thrustReach, opLightReach, opHeavyReach, opMoveReach,
    myPhase, opPhase, opMove: op.state === 'attack' ? op.move : null,
    myFree: framesToFree(sim, me), opFree: framesToFree(sim, op),
    hp: me.hp / C.phys.hp, opHp: op.hp / O.phys.hp, meter: me.meter, opMeter: op.meter,
    threat,
  };
}
