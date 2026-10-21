// Delayed, sanitised views (prompt 05 §4.3). The live sim is never given to an agent.
//
// The harness pushes `sim.clone()` after every frame; an agent with `reactionFrames = N` is handed the state from N frames
// ago. In every view the OPPONENT's input state is wiped: its buffered presses, previous bits, double-tap timers, pending
// run/hop events and held-button flags. Simultaneity is therefore real: an agent can see where the opponent is and what
// animation it is in, never what it pressed. `assertSanitised` enforces it (the arena calls it on every view).

/** wipe the opponent's input state in a cloned sim (in place) */
export function sanitise(sim, side) {
  const o = sim.f[1 - side];
  const b = o.buf; b.P = b.K = b.S = b.T = b.U = b.DASH = b.ULT = 0;
  o.prev = 0; o.tapF = 0; o.tapB = 0; o.evRun = 0; o.evHop = 0;
  o.fwd = false; o.back = false; o.up = false; o.down = false; o.guardBtn = false;
  return sim;
}

export function assertSanitised(view, side) {
  const o = view.f[1 - side], b = o.buf;
  if (b.P || b.K || b.S || b.T || b.U || b.DASH || b.ULT || o.prev || o.tapF || o.tapB || o.evRun || o.evHop || o.fwd || o.back || o.up || o.down || o.guardBtn) {
    throw new Error(`view for side ${side} leaks the opponent's input state`);
  }
}

/** ring buffer of sanitised clones for one side */
export class ViewBuffer {
  constructor(side, delay = 0) { this.side = side; this.delay = Math.max(0, delay | 0); this.ring = []; }
  reset(sim) { this.ring = []; this.push(sim); }
  /** call after every sim.step (and once at round start) */
  push(sim) {
    this.ring.push(sanitise(sim.clone(), this.side));
    if (this.ring.length > this.delay + 1) this.ring.shift();
  }
  /** the state `delay` frames before the newest one (or the oldest available at round start) */
  get() { return this.ring[0]; }
  /** how many frames old the view is */
  age() { return this.ring.length - 1; }
}
