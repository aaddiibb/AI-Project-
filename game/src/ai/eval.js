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
  guard: 0.8,       // per point of guard-gauge difference (a near-full gauge is close to a guard break)
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
  // a live Kage Bunshin is still worth the full bar it cost: its clones strike ~60 frames after the cast, beyond the search
  // horizon, so without this credit casting looks like throwing 100 meter away (and Minimax never times it well)
  // The same holds for the Samurai's Crimson Tempest: its three waves fly for over a second and the cinematic they start
  // pays off later still, so a cast looked like -200 and both search agents sat on a full bar for whole rounds. Each wave
  // not yet thrown, and each one still in flight, carries its share of the bar; the threat term adds the incoming damage.
  const liveUlt = (f) => {
    const u = sim.C(f).moves.ult;
    if (f.state !== 'attack' || f.move !== 'ult' || f.ultVoid) return 0;
    if (u.clones) return f.t <= u.cloneEnd ? 1 : 0;
    return u.waves ? u.waves.filter((wv) => wv.at >= f.t).length / u.waves.length : 0;
  };
  const flying = [0, 0];
  for (const p of sim.projectiles) { const u = sim.C(sim.f[p.owner]).moves.ult; if (p.spec.ult && u.waves && p.life > 0) flying[p.owner] += 1 / u.waves.length; }
  const ultLive = (s) => Math.min(1, liveUlt(sim.f[s]) + flying[s]);
  t.meter += (w.meter * 100 + w.meterFull) * (ultLive(side) - ultLive(1 - side));
  // range: how far I am from the distance where my light's tip just reaches; only meaningful in neutral
  t.range = F.myPhase === 'neutral' ? -w.range * Math.abs(F.gap - (F.lightReach - 60)) : 0;
  // commitment: frames I am locked while the opponent is free and inside its light reach, minus the same for the opponent
  // (not while that side's wave ultimate is still live: its waves stand between the two fighters and must be answered first)
  const myLocked = F.myFree > 0 && F.opFree === 0 && F.opGap < F.opLightReach + 120 && !ultLive(side) ? F.myFree : 0;
  const opLocked = F.opFree > 0 && F.myFree === 0 && F.gap < F.lightReach + 120 && !ultLive(1 - side) ? F.opFree : 0;
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
    // a clean hit by a cinematic wave is worth the whole punishment, not the wave's own damage; a guarding target only
    // risks the chip (a wave that goes past that guard is resolved by the search itself)
    const owner = sim.C(sim.f[p.owner]), cine = p.spec.cine && owner.moves.ult.cine;
    const guarding = target.state === 'guard' || target.state === 'blockstun';
    const dmg = cine ? (guarding ? p.spec.chip || 0 : cineDamage(owner.moves.ult.cine)) : p.spec.dmg;
    th += (p.owner === side ? 1 : -1) * w.threat * dmg * soon;
  }
  t.threat = th;
  t.guard = w.guard * ((op.guard || 0) - (me.guard || 0));
  t.ko = w.ko * ((op.ko ? 1 : 0) - (me.ko ? 1 : 0));
  return t;
}

/** total damage of an ultimate's cinematic (wave form: impact + slashes + the X; clone form: listed hits) */
function cineDamage(c) {
  if (c.hits) return c.hits.reduce((t, h) => t + (Array.isArray(h) ? h[1] : h.dmg || 0), 0);
  return 40 + (c.slashes?.length || 0) * (c.slashDmg || 0) + (c.x?.length || 0) * (c.xDmg || 0);
}

export function evaluate(sim, side, w = WEIGHTS) {
  const t = terms(sim, side, w);
  return t.hp + t.meter + t.range + t.commit + t.whiff + t.corner + t.knockdown + t.threat + t.guard + t.ko;
}

/** squash to [0, 1] for MCTS (logistic; 250 HP of advantage ≈ 0.73) */
export const squash = (v, scale = 250) => 1 / (1 + Math.exp(-v / scale));
