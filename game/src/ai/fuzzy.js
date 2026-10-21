// FuzzyAgent: instinct, no search (Lab 05: fuzzy logic, Mamdani inference).
//
// 1. Fuzzification: crisp observations -> membership degrees in linguistic sets (triangles / trapezoids).
//      distance (gap to the opponent's body, in units of the Samurai's light reach): close / mid / far
//      own HP, opponent HP (fraction): low / mid / high
//      meter: empty / partial / full
//      opponent state: attacking / recovering / neutral (degrees, from the visible animation frame)
// 2. Rule base (16 readable rules): antecedent = min of its memberships (AND = min), each rule clips its output set.
// 3. Aggregation: max over rules, per output variable (aggression, defence on [0, 1]).
// 4. Defuzzification: centroid  z* = Σ z·μ(z) / Σ μ(z)  over 101 samples.
// 5. A small deterministic table (+ the seeded RNG for ties / footsie variety) maps (aggression, defence, situation) to a macro.
// 0. Before the rules, a REFLEX layer for incoming projectiles (instinct, no inference): its urgency is fuzzy too
//    (proj.now / proj.soon on the ETA in frames); the strongest reflex picks the parry timing or the dodge for the wave.
import { Agent } from './agent.js';
import { legalMacros, macroSet } from './macros.js';
import { features, projEta } from './features.js';

const tri = (a, b, c) => (x) => (x <= a || x >= c ? (x === b ? 1 : 0) : x <= b ? (x - a) / (b - a || 1) : (c - x) / (c - b || 1));
const trap = (a, b, c, d) => (x) => (x < a || x > d ? 0 : x < b ? (x - a) / (b - a || 1) : x <= c ? 1 : (d - x) / (d - c || 1));

// ---------------------------------------------------------------- linguistic variables
// distance is measured as gap / lightReach: 1.0 = exactly at the tip of the iai cut
export const SETS = {
  // close = inside the iai cut's reach, mid = the footsie edge just around it, far = outside it plus a step
  dist: { close: trap(-1, -1, 0.9, 1.0), mid: tri(0.92, 1.06, 1.3), far: trap(1.15, 1.45, 9, 9) },
  hp: { low: trap(-1, 0, 0.25, 0.45), mid: tri(0.3, 0.55, 0.8), high: trap(0.65, 0.85, 1, 2) },
  meter: { empty: trap(-1, 0, 10, 35), partial: tri(20, 55, 95), full: trap(90, 100, 100, 101) },
  // incoming projectile ETA (frames until it reaches my body)
  proj: { now: trap(-1, -1, 4, 8), soon: tri(4, 12, 22) },
};
const OUT = { low: tri(-0.01, 0, 0.4), medium: tri(0.25, 0.5, 0.75), high: tri(0.6, 0.85, 1.01), very_high: tri(0.8, 1, 1.01) };

// ---------------------------------------------------------------- rule base: [label, antecedents, consequents]
// antecedent keys: d.close/mid/far, me.low/mid/high, op.low/mid/high, m.empty/partial/full, o.attacking/recovering/neutral
export const RULES = [
  ['opp recovering & mid -> aggression very high (punish with heavy)', ['o.recovering', 'd.mid'], { agg: 'very_high' }],
  ['opp recovering & close -> aggression high (punish with light)', ['o.recovering', 'd.close'], { agg: 'high' }],
  ['opp attacking & close -> defence high', ['o.attacking', 'd.close'], { def: 'high' }],
  ['opp attacking & mid -> defence high', ['o.attacking', 'd.mid'], { def: 'high' }],
  ['opp attacking & far -> aggression low (stay out)', ['o.attacking', 'd.far'], { agg: 'low', def: 'low' }],
  ['far & opp neutral -> aggression medium (advance)', ['d.far', 'o.neutral'], { agg: 'medium' }],
  ['mid & opp neutral -> footsies (medium / medium)', ['d.mid', 'o.neutral'], { agg: 'medium', def: 'medium' }],
  ['own HP low & opp HP high -> defence high', ['me.low', 'op.high'], { def: 'high' }],
  ['own HP high & opp HP low -> aggression high', ['me.high', 'op.low'], { agg: 'high' }],
  ['meter full & mid -> aggression very high (ultimate)', ['m.full', 'd.mid'], { agg: 'very_high' }],
  ['meter full & opp recovering -> aggression very high', ['m.full', 'o.recovering'], { agg: 'very_high' }],
  ['close & opp neutral -> aggression high (pressure)', ['d.close', 'o.neutral'], { agg: 'high' }],
  ['own HP low & opp attacking -> defence high', ['me.low', 'o.attacking'], { def: 'high' }],
  ['opp HP low & mid -> aggression high (finish)', ['op.low', 'd.mid'], { agg: 'high' }],
  ['meter empty & own HP mid -> defence medium', ['m.empty', 'me.mid'], { def: 'medium' }],
  ['far & own HP low -> aggression low, defence medium', ['d.far', 'me.low'], { agg: 'low', def: 'medium' }],
];

/** fuzzify the situation of `side` */
export function fuzzify(sim, side) {
  const F = features(sim, side);
  const d = F.gap / F.lightReach;
  const mu = {};
  for (const [k, f] of Object.entries(SETS.dist)) mu['d.' + k] = f(d);
  for (const [k, f] of Object.entries(SETS.hp)) { mu['me.' + k] = f(F.hp); mu['op.' + k] = f(F.opHp); }
  for (const [k, f] of Object.entries(SETS.meter)) mu['m.' + k] = f(F.meter);
  // opponent state as degrees: attacking peaks while its swing is coming (startup / active); recovering covers whiff
  // recovery, being stunned and lying down; neutral is what is left
  const op = F.op, m = op.state === 'attack' ? sim.C(op).moves[op.move] : null;
  let att = 0, rec = 0;
  if (F.opPhase === 'startup' || F.opPhase === 'active') att = m && m.active ? Math.min(1, 0.6 + 0.4 * (op.t / Math.max(1, m.active[0]))) : 1;
  else if (F.opPhase === 'recovery') rec = 1;
  else if (F.opPhase === 'stunned') rec = 0.6;
  else if (F.opPhase === 'down') rec = 0.4;
  mu['o.attacking'] = att; mu['o.recovering'] = rec; mu['o.neutral'] = Math.max(0, 1 - att - rec);
  return { mu, F, d };
}

/** Mamdani inference: returns crisp outputs + every rule's firing strength */
export function infer(mu) {
  const agg = new Float64Array(101), def = new Float64Array(101);
  const fired = RULES.map(([label, ante, cons]) => {
    const w = Math.min(...ante.map((k) => mu[k] ?? 0));
    if (w > 0) for (const [outVar, set] of Object.entries(cons)) {
      const acc = outVar === 'agg' ? agg : def, f = OUT[set];
      for (let i = 0; i <= 100; i++) acc[i] = Math.max(acc[i], Math.min(w, f(i / 100))); // clip (min) then aggregate (max)
    }
    return { label, w };
  });
  const centroid = (a, dflt) => { let s = 0, sw = 0; for (let i = 0; i <= 100; i++) { s += (i / 100) * a[i]; sw += a[i]; } return sw > 0 ? s / sw : dflt; };
  return { aggression: centroid(agg, 0.5), defence: centroid(def, 0.3), fired, curves: { agg, def } };
}

export class FuzzyAgent extends Agent {
  constructor(o = {}) { super(o); this.name = 'fuzzy'; }

  /** reflex for an incoming projectile: a macro id, or null (then the rule base decides) */
  reflex(sim, F, can) {
    const th = F.threat, ch = sim.C(F.me), op = F.op;
    // the opponent is still inside a wave ultimate with waves left to throw: hold position, ready to answer the next one
    const um = op.state === 'attack' && op.move === 'ult' ? sim.C(op).moves.ult : null;
    const pending = !!(um && um.waves && op.t <= um.waves.at(-1).at);
    const close = Math.abs(op.x - F.me.x) < 1050; // too close to jump a fresh low wave (spawn 400 ahead + 13 frames x 30): block instead
    const ready = () => (ch.can.crouch ? (close ? 'crouch_guard' : 'crouch') : 'wait_short'); // (the Samurai waits WITHOUT pressing guard: keeps the parry cooldown clear)
    // Kage Bunshin: an overhead dive kick, a slash and kunai from behind are coming: stand and guard (crouching loses to the kick)
    const cloneUlt = (um && um.clones && op.t <= um.cloneEnd + 4) || sim.projectiles.some((p) => p.owner !== this.side && p.spec.clone);
    if (cloneUlt && can('guard')) return 'guard';
    if (!th) return pending && can(ready()) ? ready() : null;
    const now = SETS.proj.now(th.eta), soon = SETS.proj.soon(th.eta);
    if (now + soon < 0.2 && !th.ult) return null; // (ultimate waves are answered from any distance)
    if (ch.can.parry && th.parryable) { // Samurai: time the guard tap into the ~5-frame window (tap at eta-2), thrust back if far
      // the fast Crimson Tempest: a successful parry locks him in its follow-through for ~25 frames, about the gap to the
      // next wave. While waves are still to be thrown (or two are close together) hold guard EARLY instead (pressing it
      // as a wave arrives would itself parry); only the last wave is worth a parry
      const etas = sim.projectiles.filter((p) => p.owner !== this.side).map((p) => projEta(sim, p, F.me)).filter(Number.isFinite).sort((a, b) => a - b);
      const lock = (ch.moves.parry?.total ?? 20) + 6;
      if ((pending || (etas.length > 1 && etas[1] - etas[0] < lock)) && can('guard')) return 'guard';
      // the tap at program frame k parries when ceil(eta) - 6 <= k <= ceil(eta) - 1 (measured); -1 / -5 keeps a margin
      const e = Math.ceil(th.eta), k = [6, 3, 0].find((t) => t <= e - 1 && t >= e - 5 && can(`parry_${t}`));
      if (k === undefined) return e > 7 && can('wait_short') ? 'wait_short' : 'guard'; // too early: wait; no tap possible: block
      const back = F.gap > F.lightReach && !th.ult;
      return can(`parry${back ? '_thrust' : ''}_${k}`) ? `parry${back ? '_thrust' : ''}_${k}` : `parry_${k}`;
    }
    if (ch.can.crouch) { // Shinobi: every incoming wave, by height class (windows measured in test_samurai: jump 13-20, dash 4-8)
      const inc = sim.projectiles.filter((p) => p.owner !== this.side).map((p) => ({ eta: projEta(sim, p, F.me), shape: p.spec.shape || (p.fan ? 'fan' : 'kunai') })).filter((q) => Number.isFinite(q.eta));
      const has = (shape, lo, hi) => inc.some((q) => q.shape === shape && q.eta >= lo && q.eta <= hi);
      if (has('fan', 0, 30)) return 'crouch_guard';
      // point-blank during his ultimate: waves spawn on top of her, nothing can be dodged -> crouch-guard (ducks the high
      // wave, blocks the low and tall ones)
      if ((pending || inc.length) && Math.abs(F.op.x - F.me.x) < 1050 && !has('low', 13, 20) && !has('tall', 4, 8)) return 'crouch_guard';
      if (has('low', 13, 20)) return 'jump_up';                    // over the low wave (the high one has passed by then)
      if (has('tall', 4, 8)) return 'dash_fwd';                    // through the tall wave
      if (has('low', 0, 12) || has('tall', 0, 3)) return 'crouch_guard'; // too late to dodge: block it
      if (has('high', 0, 30) || has('kunai', 0, 14)) return 'crouch'; // duck (4 frames at a time: never skips a jump window)
      if (has('tall', 9, 20)) return 'wait_short';                 // line up the dash
      if (has('low', 21, 999) || has('tall', 21, 999) || pending) return 'crouch'; // a wave is still coming: stay low and ready
    }
    return now > 0.5 ? 'guard' : null;
  }

  decide(sim) {
    const { mu, F } = fuzzify(sim, this.side);
    const { aggression: A, defence: D, fired } = infer(mu);
    const set = macroSet(sim.C(sim.f[this.side])).byId, legal = new Set(legalMacros(sim, this.side).map((m) => m.id));
    const can = (id) => legal.has(id);
    const inLight = F.gap < F.lightReach - 30, inHeavy = F.gap < F.heavyReach - 30;
    const threatened = mu['o.attacking'] > 0.3 && F.opGap < F.opMoveReach + 80;
    let pick = this.reflex(sim, F, can);
    if (pick && !can(pick)) pick = null;
    const thrustBand = F.thrustReach > 0 && F.gap >= F.lightReach - 30 && F.gap < F.thrustReach - 60;
    // deterministic mapping table (defence first, then aggression bands), seeded RNG only inside the footsie band
    if (pick) { /* reflex */ }
    // a read: the opponent is winding up a swing that will reach me -> kawarimi (sometimes: a fixed habit would be exploitable)
    else if (can('kawarimi') && F.opPhase === 'startup' && F.opGap < F.opMoveReach + 40 && this.rng.next() < 0.45) pick = 'kawarimi';
    else if (D > 0.6 && threatened) pick = F.opGap < F.opMoveReach - 250 || F.wallBehind < 200 ? 'guard' : this.rng.next() < 0.5 ? 'guard' : 'dash_back';
    else if (A > 0.55 && can('ult') && F.meter >= 100 && F.gap < 1700 && mu['o.attacking'] < 0.5) pick = 'ult'; // full bar + aggressive
    else if (A > 0.78) {
      if (inHeavy && (mu['o.recovering'] > 0.5 || F.opPhase === 'stunned')) pick = can('chain') && inLight ? 'chain' : 'heavy';
      else if (inLight) pick = can('chain') && this.rng.next() < 0.4 ? 'chain' : 'light';
      else if (thrustBand && can('thrust')) pick = 'thrust'; // lunge in from outside the iai cut
      else pick = 'dash_fwd';
    } else if (thrustBand && can('thrust') && (mu['o.recovering'] > 0.5 || F.opMove === 'throw') && A > 0.35) pick = 'thrust'; // punish a whiff / a throw from range
    else if (mu['d.far'] > 0.7 && A >= 0.35 && D < 0.6) pick = mu['d.far'] > 0.95 && this.rng.next() < 0.4 ? 'dash_fwd' : 'walk_fwd'; // far: close the distance
    else if (A > 0.55) pick = inLight ? (mu['o.recovering'] > 0.5 && inHeavy && this.rng.next() < 0.3 ? 'heavy' : 'light') : 'walk_fwd';
    // footsies band: strike when the opponent is inside the reach, otherwise hover at the edge
    else if (A > 0.35) pick = inLight ? (D > 0.55 && this.rng.next() < 0.3 ? 'guard' : 'light')
      : F.gap < F.lightReach + 90 ? this.rng.weighted([['light', 0.5], ['walk_back', 0.5]]) : 'walk_fwd'; // edge: poke the approach or re-space
    else pick = this.rng.weighted([['walk_back', 0.45], ['guard', 0.35], ['dash_back', 0.2]]);
    if (!can(pick)) pick = can('guard') ? 'guard' : 'wait';
    const top = fired.filter((r) => r.w > 0).sort((a, b) => b.w - a.w).slice(0, 3);
    this._think = { algo: 'fuzzy', chosen: pick, aggression: A, defence: D, mu, top, reflex: F.threat ? `projectile eta ${F.threat.eta.toFixed(0)} (${F.threat.shape})` : null };
    return set[pick];
  }
}
