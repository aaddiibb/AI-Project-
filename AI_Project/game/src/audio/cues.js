// Cue logic (prompt 06). PURE and READ-ONLY: turns what the live sim and match just did into a list of sound cues. It never
// writes to the sim (so the replay hash cannot change) and imports no Web Audio (so it runs under Node in the tests and in
// the offline renderer). main.js calls frame() once per sim step, with the live sim only (never an agent's view).
//
// Sources, all observable after a step:
//   sim.events         hit / block / super / crescent / throw / fan / pland / jump / land
//   fighter state      swings (move + frame), dash / run / back-dash entry, guard entry, walk + run distance (footsteps)
//   sim.projectiles    the travelling crescent (a loop whose pan follows its x)
//   match              phase changes (round call, FIGHT, K.O., TIME, winner), the last-10-seconds timer
// Variation (variant + +-3 % rate) comes from a seeded audio-only RNG reset per game: a replay always sounds the same.
import { SOUNDS } from './sounds.js';

const SWING = {
  samurai: { light: 'sam_draw', heavy: 'sam_cleave' },
  shinobi: { stab: 'shi_swish', crouch_stab: 'shi_swish', air_stab: 'shi_swish', kick: 'shi_kick', sweep: 'shi_kick', air_kick: 'shi_kick', slash: 'shi_slash' },
};
/** frame of the move on which its whoosh starts, so that the whoosh peaks on the first active frame */
export function swingFrame(move, id) {
  const lead = Math.round((SOUNDS[id].peakMs * 60) / 1000);
  return Math.max(1, move.active[0] - lead);
}
const CHAR_RATE = { samurai: 0.97, shinobi: 1.04 };
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 0..1 fight intensity from observable state only (drives the music stems) */
export function tension(sim, match) {
  const [a, b] = sim.f;
  const close = clamp01(1 - (Math.abs(a.x - b.x) - 300) / 1500);
  const hp = Math.min(a.hp / sim.C(a).phys.hp, b.hp / sim.C(b).phys.hp);
  const low = clamp01((0.45 - hp) / 0.3);
  const meter = a.meter >= 100 || b.meter >= 100 ? 1 : 0;
  const late = match && match.phase === 'fight' && match.timeLeft <= 10 ? 1 : 0;
  return clamp01(0.35 * close + 0.35 * low + 0.15 * meter + 0.3 * late);
}

export class CueTracker {
  constructor(seed = 0x5a11) { this.seed = seed; this.reset(); }
  reset() {
    this.rng = mulberry32(this.seed);
    this.prev = [null, null]; // per fighter: { state, move, t, walkDist, runDist, stepAcc, runAcc }
    this.lastPhase = null; this.lastRound = -1; this.lastTick = null; this.lastEvents = null;
    this.loops = [];
  }
  /** variant + rate jitter; P2 uses the upper half of the variants and plays 5 % lower, so a mirror match reads by ear */
  cue(id, x, side = -1, extra = {}) {
    const s = SOUNDS[id], r = this.rng();
    const n = s.variants || 1, half = Math.max(1, n >> 1);
    const variant = n === 1 ? 0 : side === 1 ? (n > 1 ? half + Math.floor(r * (n - half)) : 0) : Math.floor(r * (side === 0 ? half : n));
    const rate = (1 + (this.rng() - 0.5) * 0.06) * (side === 1 ? 0.95 : 1) * (extra.charRate || 1);
    return { id, x, side, variant, rate, gain: extra.gain ?? 1 };
  }

  /**
   * @param sim   the LIVE sim after this step (main.js: G.sim)
   * @param match the Match or null (training)
   * @returns array of cues { id, x, side, variant, rate, gain, frame }; this.loops holds the active loops { key, id, x }
   */
  frame(sim, match = null) {
    const out = [];
    const C = (i) => sim.C(sim.f[i]);
    const charOf = (i) => C(i).id;
    // ---- match flow (stingers + timer)
    if (match) {
      if (match.phase !== this.lastPhase || match.round !== this.lastRound) {
        const p = match.phase, lp = this.lastPhase;
        if (p === 'intro') out.push(this.cue('st_round' + Math.min(3, match.round + 1), 2600));
        else if (p === 'fight' && (lp === 'intro' || lp === null)) out.push(this.cue('st_fight', 2600));
        else if (p === 'ko') out.push(this.cue(match.pending?.reason === 'time' ? 'st_time' : 'st_ko', 2600));
        else if (p === 'over') out.push(this.cue(match.winner === null ? 'st_draw' : 'st_win', 2600));
        if (p === 'intro' || (p === 'fight' && lp === null)) this.lastTick = null;
        this.lastPhase = p; this.lastRound = match.round;
      }
      if (match.phase === 'fight') {
        const tl = match.timeLeft;
        if (tl <= 10 && tl > 0 && tl !== this.lastTick) out.push(this.cue(tl <= 3 ? 'tick_hi' : 'tick', 2600));
        this.lastTick = tl;
      }
    }
    // ---- only a real sim step has new events and state (the intro and 'over' phases do not step the sim)
    const stepped = sim.events !== this.lastEvents; this.lastEvents = sim.events;
    if (!stepped) { for (const q of out) q.frame = sim.frame; return out; }
    // ---- events of this step
    for (const e of sim.events) {
      switch (e.kind) {
        case 'hit': {
          const by = 1 - e.target, cr = CHAR_RATE[charOf(by)];
          const id = e.power >= 3 ? 'hit_h' : e.power === 2 ? 'hit_m' : 'hit_l';
          out.push(this.cue(id, e.x, by, { charRate: cr, gain: Math.min(1.15, 0.85 + 0.06 * e.power) }));
          if (e.counter) out.push(this.cue('counter', e.x, by));
          if (e.ko) { out.push(this.cue('ko_boom', e.x, by)); if (!match) out.push(this.cue('st_ko', 2600)); }
          break;
        }
        case 'block': {
          out.push(this.cue(charOf(e.def) === 'samurai' ? 'block_steel' : 'block_wood', e.x, e.def, { gain: Math.min(1.1, 0.85 + 0.06 * e.power) }));
          if (e.chip > 0) out.push(this.cue('chip', e.x, e.def));
          break;
        }
        case 'super': out.push(this.cue('super', e.x, e.id)); break;
        case 'crescent': out.push(this.cue('crescent_rel', e.x, this.nearest(sim, e.x))); break;
        case 'throw': out.push(this.cue('kunai', e.x, this.nearest(sim, e.x))); break;
        case 'fan': out.push(this.cue('fan', e.x, this.nearest(sim, e.x))); break;
        case 'pland': out.push(this.cue('thunk', e.x)); break;
        case 'jump': out.push(this.cue('jump', e.x, this.nearest(sim, e.x))); break;
        case 'land': out.push(this.cue(e.down ? 'bodyfall' : 'land', e.x, this.nearest(sim, e.x))); break;
        default: break; // dash events are read from the state machine below (it knows who and which way)
      }
    }
    // ---- fighter state: swings, dashes, guard entry, footsteps
    for (let i = 0; i < 2; i++) {
      const f = sim.f[i], c = C(i), p = this.prev[i];
      if (f.state === 'attack') {
        const id = SWING[c.id]?.[f.move], m = c.moves[f.move];
        if (id && m.active && f.t === swingFrame(m, id) && !(p && p.state === 'attack' && p.move === f.move && p.t === f.t)) out.push(this.cue(id, f.x, i, { charRate: 1 }));
      }
      if (p && p.state !== f.state) {
        if (f.state === 'dash' || (f.state === 'run' && p.state !== 'runstop')) out.push(this.cue('dash', f.x, i));
        else if (f.state === 'backdash') out.push(this.cue('heel_drag', f.x, i));
        else if (f.state === 'backhop') out.push(this.cue('jump', f.x, i));
        else if (f.state === 'guard' && p.state !== 'blockstun') out.push(this.cue('guard', f.x, i));
      }
      // footsteps: one per half walk cycle (walkDist) / half run stride (runDist); jumps in distance (round reset) ignored
      let stepAcc = p ? p.stepAcc : 0;
      if (p && f.state === 'walk') {
        const d = Math.abs(f.walkDist - p.walkDist), half = c.walk.steps.reduce((s, x) => s + x, 0) / 2;
        if (d < 100) { stepAcc += d; if (stepAcc >= half) { stepAcc -= half; out.push(this.cue('step', f.x, i)); } }
      } else if (p && f.state === 'run') {
        const d = Math.abs(f.runDist - p.runDist), half = (c.run?.stride || 420) / 2;
        if (d < 100) { stepAcc += d; if (stepAcc >= half) { stepAcc -= half; out.push(this.cue('step', f.x, i, { gain: 1.4 })); } }
      } else stepAcc = Math.min(stepAcc, 60);
      this.prev[i] = { state: f.state, move: f.move, t: f.t, walkDist: f.walkDist, runDist: f.runDist, stepAcc };
    }
    // ---- loops: the travelling crescent
    this.loops = [];
    for (const pr of sim.projectiles) if (pr.spec && pr.spec.kind === 'crescent') this.loops.push({ key: 'cres' + pr.id, id: 'crescent_loop', x: pr.x, side: pr.owner });
    for (const q of out) q.frame = sim.frame;
    return out;
  }
  nearest(sim, x) { return Math.abs(sim.f[0].x - x) <= Math.abs(sim.f[1].x - x) ? 0 : 1; }
}
