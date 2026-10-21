// Evaluation function shared by MinimaxAgent (leaf values) and MctsAgent (rollout horizon), prompt 05 §4.5.
// Value of a state for `side`, in HP-equivalent units (1000 HP per fighter); zero-sum: value(s, 1) ≈ -value(s, 0)
// for the symmetric terms. All weights live in ONE exported object so the genetic algorithm (tools/ga_tune.mjs) can tune them.
import { features } from './features.js';

export const DEFAULT_WEIGHTS = Object.freeze({
  hp: 1.0,          // HP difference (the score that decides rounds)
  meter: 1.2,       // meter difference per point (meter = future ultimate damage)
  meterFull: 80,    // bonus for holding a FULL bar (a 500-damage threat the opponent must respect)
  range: 0.06,      // per unit of distance error between my gap and my light's reach (the Samurai's best footsie range)
  commit: 3.0,      // per frame of recovery I am stuck in while the opponent is free and could reach me (and vice versa)
  whiff: 160,       // a heavy that has passed its active window without contact: a guaranteed punish for the opponent
  corner: 90,       // pressure: up to this much for having no room behind (scaled over the last 700 units)
  knockdown: 60,    // opponent knocked down / waking up: I get the next move for free (and vice versa)
  threat: 0.35,     // fraction of an incoming projectile's damage counted as already lost, scaled by how soon it lands
  ko: 3000,         // terminal: a KO dominates every other term
});
export let WEIGHTS = { ...DEFAULT_WEIGHTS };
export function setWeights(w) { WEIGHTS = { ...DEFAULT_WEIGHTS, ...w }; }

/** detailed terms (for the overlay and the report); `evaluate` sums them */
export function terms(sim, side, w = WEIGHTS) {
  const F = features(sim, side), { me, op } = F;
  const t = {};
  t.hp = w.hp * (me.hp - op.hp);
  t.meter = w.meter * (me.meter - op.meter) + w.meterFull * ((me.meter >= 100) - (op.meter >= 100));
  // range: how far I am from the distance where my light's tip just reaches; only meaningful in neutral
  t.range = F.myPhase === 'neutral' ? -w.range * Math.abs(F.gap - (F.lightReach - 60)) : 0;
  // commitment: frames I am locked while the opponent is free and inside its light reach, minus the same for the opponent
  const myLocked = F.myFree > 0 && F.opFree === 0 && F.opGap < F.opLightReach + 120 ? F.myFree : 0;
  const opLocked = F.opFree > 0 && F.myFree === 0 && F.gap < F.lightReach + 120 ? F.opFree : 0;
  t.commit = w.commit * (Math.min(opLocked, 40) - Math.min(myLocked, 40));
  const whiffing = (f) => f.state === 'attack' && !f.contact && (f.move === 'heavy' || f.move === 'slash') && f.t >= sim.C(f).moves[f.move].active[1];
  t.whiff = w.whiff * (whiffing(op) - whiffing(me));
  const cornered = (room) => Math.max(0, 1 - room / 700);
  t.corner = w.corner * (cornered(F.opWallBehind) - cornered(F.wallBehind));
  const down = (f) => f.state === 'knock' || f.state === 'down' || f.state === 'wake';
  t.knockdown = w.knockdown * (down(op) - down(me));
  let th = 0;
  for (const p of sim.projectiles) {
    const target = sim.f[1 - p.owner], dx = target.x - p.x;
    if (Math.sign(dx) !== Math.sign(p.vx) && Math.abs(dx) > 250) continue;
    const soon = Math.max(0, 1 - Math.abs(dx) / Math.max(1, Math.abs(p.vx)) / 40);
    th += (p.owner === side ? 1 : -1) * w.threat * p.spec.dmg * soon;
  }
  t.threat = th;
  t.ko = w.ko * ((op.ko ? 1 : 0) - (me.ko ? 1 : 0));
  return t;
}

export function evaluate(sim, side, w = WEIGHTS) {
  const t = terms(sim, side, w);
  return t.hp + t.meter + t.range + t.commit + t.whiff + t.corner + t.knockdown + t.threat + t.ko;
}

/** squash to [0, 1] for MCTS (logistic; 250 HP of advantage ≈ 0.73) */
export const squash = (v, scale = 250) => 1 / (1 + Math.exp(-v / scale));
