// Rounds and matches (prompt 05 §4.2 "Rounds" and §5): best of 3, 99-second rounds (5,940 frames), at time-out the higher
// HP percentage wins (equal = draw), meter carries over between rounds, default start positions. The SIM never knows about
// rounds; this runner does. Shared by the headless arena (tools/arena.mjs) and the browser (main.js), so on-screen
// behaviour and benchmark results come from the same code.
//
// Controllers drive one side each: { reset(match, side), act(match, side) -> bits, observe(match, side) }.
//   AgentController  wraps an Agent: keeps a ViewBuffer of delayed, sanitised clones; the agent never sees the live sim
//   ReplayController plays back a recorded input log bit-identically
//   FnController     any (sim, frame) -> bits function (keyboard, training dummy)
import { Sim } from '../sim.js';
import { ViewBuffer, assertSanitised } from './view.js';

export const ROUND_FRAMES = 5940;

export class AgentController {
  constructor(agent, { delay = agent.reactionFrames ?? 0, check = true } = {}) { this.agent = agent; this.delay = delay; this.check = check; this.vb = null; }
  reset(match, side) {
    this.vb = new ViewBuffer(side, this.delay); this.vb.reset(match.sim);
    this.agent.side = side; this.agent.reset(this.vb.get());
  }
  act(match, side) {
    const view = this.vb.get();
    if (this.check) assertSanitised(view, side);
    return this.agent.act(view, match.sim.frame, this.vb.age());
  }
  observe(match) { this.vb.push(match.sim); }
}
export class ReplayController {
  constructor(log) { this.log = log; }
  reset() {}
  act(match, side) { const r = this.log.inputs[match.fightFrame]; return r ? r[side] : 0; }
  observe() {}
}
export class FnController {
  constructor(fn) { this.fn = fn; }
  reset() {}
  act(match, side) { return this.fn(match.sim, match.sim.frame, side) || 0; }
  observe() {}
}

const newStats = () => ({ dmg: 0, hits: 0, blocked: 0, blocksMade: 0, chip: 0, ults: 0, ultHits: 0, heavies: 0, heavyHits: 0, heavyWhiffs: 0, lights: 0, lightHits: 0 });

export class Match {
  /**
   * @param {object} o
   *   chars: [p1, p2] character ids; controllers: [c1, c2]; bestOf (3); roundFrames (5940)
   *   koFrames / introFrames: frames shown between rounds (browser); 0 headless. They never change the outcome:
   *   the sim's frame counter is restored at the round boundary, so replays are bit-identical with or without them.
   *   record: keep the per-frame input log (for --replay and browser playback)
   */
  constructor({ chars = ['samurai', 'samurai'], controllers, bestOf = 3, roundFrames = ROUND_FRAMES, koFrames = 0, introFrames = 0, record = false, meta = {}, verify = null }) {
    // verify: a recorded log; every checkpoint hash and round end of this run is compared with it (replay proof)
    this.verify = verify ? { cp: new Map(verify.checkpoints), ends: verify.roundEnds || [], ok: 0, bad: 0, firstBad: null } : null;
    this.chars = chars; this.controllers = controllers; this.bestOf = bestOf; this.roundFrames = roundFrames;
    this.koFrames = koFrames; this.introFrames = introFrames;
    this.sim = new Sim({ chars, autoReset: false });
    this.round = 0; this.roundFrame = 0; this.fightFrame = 0; this.wins = [0, 0]; this.rounds = [];
    this.stats = [newStats(), newStats()];
    this.phase = introFrames ? 'intro' : 'fight'; this.phaseT = 0; this.over = false; this.winner = null;
    this.log = record ? { chars, bestOf, roundFrames, meta, inputs: [], checkpoints: [], roundEnds: [] } : null;
    this.lastBits = [0, 0];
    controllers.forEach((c, i) => c.reset(this, i));
  }

  get timeLeft() { return Math.max(0, Math.ceil((this.roundFrames - this.roundFrame) / 60)); }

  /** advance one frame; returns the phase */
  step() {
    if (this.over) return 'over';
    const sim = this.sim;
    if (this.phase === 'intro') { // fighters stand still for the round call (no sim step)
      if (++this.phaseT >= this.introFrames) { this.phase = 'fight'; this.phaseT = 0; }
      return 'intro';
    }
    if (this.phase === 'ko') { // the loser falls; display only (the frame counter is restored afterwards)
      sim.step([0, 0]);
      if (++this.phaseT >= this.koFrames) this.endRound();
      return 'ko';
    }
    const bits = [this.controllers[0].act(this, 0), this.controllers[1].act(this, 1)];
    this.lastBits = bits;
    sim.step(bits);
    if (this.log) { this.log.inputs.push(bits); if (this.fightFrame % 60 === 0) this.log.checkpoints.push([this.fightFrame, sim.hash()]); }
    if (this.verify && this.verify.cp.has(this.fightFrame)) {
      if (this.verify.cp.get(this.fightFrame) === sim.hash()) this.verify.ok++; else { this.verify.bad++; this.verify.firstBad ??= this.fightFrame; }
    }
    this.fightFrame++; if (!sim.cine) this.roundFrame++; // the round timer stops during an ultimate cinematic
    this.track();
    for (let i = 0; i < 2; i++) this.controllers[i].observe(this, i);
    const ko = sim.f[0].ko || sim.f[1].ko;
    if (ko || this.roundFrame >= this.roundFrames) {
      this.pending = this.result(ko);
      this.endFrame = sim.frame; this.endHash = sim.hash(); // the round's final fight state (before any K.O. display frames)
      if (this.koFrames > 0) { this.phase = 'ko'; this.phaseT = 0; return 'ko'; }
      this.endRound();
    }
    return 'fight';
  }

  result(ko) {
    const [a, b] = this.sim.f;
    const pa = a.hp / this.sim.C(a).phys.hp, pb = b.hp / this.sim.C(b).phys.hp;
    let winner = null, reason = 'time';
    if (ko) { reason = a.ko && b.ko ? 'double' : 'ko'; winner = a.ko && b.ko ? null : a.ko ? 1 : 0; }
    else winner = pa > pb ? 0 : pb > pa ? 1 : null;
    return { winner, reason, hp: [a.hp, b.hp], frames: this.roundFrame };
  }

  endRound() {
    const r = this.pending; this.pending = null;
    this.rounds.push(r);
    if (r.winner !== null) this.wins[r.winner]++;
    if (this.log) this.log.roundEnds.push([this.fightFrame, this.endHash, r.winner]);
    if (this.verify) {
      const e = this.verify.ends[this.rounds.length - 1];
      if (e && e[0] === this.fightFrame && e[1] === this.endHash && e[2] === r.winner) this.verify.ok++; else { this.verify.bad++; this.verify.firstBad ??= this.fightFrame; }
    }
    const need = Math.floor(this.bestOf / 2) + 1;
    if (this.wins[0] >= need || this.wins[1] >= need || this.rounds.length >= this.bestOf) {
      this.over = true; this.phase = 'over';
      this.winner = this.wins[0] > this.wins[1] ? 0 : this.wins[1] > this.wins[0] ? 1 : null;
      return;
    }
    this.sim.frame = this.endFrame; // KO display frames never change the state the next round starts from
    this.sim.newRound();
    this.round++; this.roundFrame = 0; this.cur = [null, null];
    this.controllers.forEach((c, i) => c.reset(this, i));
    this.phase = this.introFrames ? 'intro' : 'fight'; this.phaseT = 0;
  }

  /** per-side combat statistics from the sim's events */
  track() {
    const sim = this.sim;
    for (const e of sim.events) {
      if (e.kind === 'hit') { const s = this.stats[1 - e.target]; s.dmg += e.dmg; s.hits++; if (e.move === 'ult') s.ultHits++; if (e.move === 'heavy' || e.move === 'slash') s.heavyHits++; if (e.move === 'light' || e.move === 'stab') s.lightHits++; }
      else if (e.kind === 'block') { const s = this.stats[1 - e.def]; s.blocked++; s.chip += e.chip || 0; s.dmg += e.chip || 0; this.stats[e.def].blocksMade++; }
      else if (e.kind === 'super') this.stats[e.id].ults++;
    }
    // attack instances: count starts, and heavies that ended without touching anything (whiffs; being hit out of it is not a whiff)
    this.cur ||= [null, null];
    for (let i = 0; i < 2; i++) {
      const f = sim.f[i], inAtk = f.state === 'attack';
      let p = this.cur[i];
      if (inAtk && (!p || p.move !== f.move || f.t < p.t)) {
        if (p) this.finishAttack(i, p, false);
        p = this.cur[i] = { move: f.move, t: f.t, contact: false };
        if (f.move === 'heavy' || f.move === 'slash') this.stats[i].heavies++;
        if (f.move === 'light' || f.move === 'stab') this.stats[i].lights++;
      }
      if (inAtk) { p.t = f.t; if (f.contact) p.contact = true; }
      else if (p) { this.finishAttack(i, p, f.state === 'hitstun' || f.state === 'knock'); this.cur[i] = null; }
    }
  }
  finishAttack(i, p, interrupted) {
    if ((p.move === 'heavy' || p.move === 'slash') && !p.contact && !interrupted) this.stats[i].heavyWhiffs++;
  }

  /** run to the end (headless) */
  run() { while (!this.over) this.step(); return this; }
}
