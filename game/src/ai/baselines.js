// Baselines for sanity checks and the report.
//  RandomAgent:   uniform over the legal macros.
//  ScriptedAgent: a short hand-written policy: "walk in, light in range, guard when the opponent swings, heavy on a whiff".
import { Agent } from './agent.js';
import { legalMacros, macroSet } from './macros.js';
import { features } from './features.js';

export class RandomAgent extends Agent {
  constructor(o) { super(o); this.name = 'random'; }
  decide(sim) {
    const legal = legalMacros(sim, this.side);
    const m = this.rng.pick(legal);
    this._think = { algo: 'random', chosen: m.id, legal: legal.map((x) => x.id) };
    return m;
  }
}

export class ScriptedAgent extends Agent {
  constructor(o) { super(o); this.name = 'scripted'; }
  decide(sim) {
    const set = macroSet(sim.C(sim.f[this.side])).byId, F = features(sim, this.side);
    let m, why;
    if ((F.opPhase === 'startup' || F.opPhase === 'active') && F.opGap < F.opMoveReach + 60) { m = set.guard; why = 'opponent swings in range -> guard'; }
    else if (F.opPhase === 'recovery' && F.gap < F.heavyReach) { m = set.heavy; why = 'opponent whiffed -> heavy'; }
    else if (F.gap < F.lightReach - 40 && F.opPhase !== 'down') { m = set.light; why = 'in light range -> light'; }
    else if (set.thrust && F.gap < F.thrustReach - 80 && F.opPhase === 'recovery') { m = set.thrust; why = 'whiff at range -> thrust'; }
    else if (F.opPhase === 'down') { m = set.wait; why = 'opponent down -> wait'; }
    else { m = set.walk_fwd; why = 'walk in'; }
    this._think = { algo: 'scripted', chosen: m.id, rule: why };
    return m;
  }
}
