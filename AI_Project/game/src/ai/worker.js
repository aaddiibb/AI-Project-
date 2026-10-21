// Web Worker host for agents that think longer than a frame (the Master level: 50 ms per decision). The main thread keeps
// running the game at 60 fps; the worker receives the agent's (already delayed, sanitised and extrapolated) state as plain
// data, runs the real agent's decide(), and posts back the chosen macro + its thinking() for the overlay.
import { Sim } from '../sim.js';
import { makeAgent } from './registry.js';

let agent = null;
self.onmessage = (e) => {
  const d = e.data;
  if (d.init) { agent = makeAgent(d.init.name, d.init.opts); return; }
  if (d.decide && agent) {
    const sim = Sim.fromState(d.decide.state);
    agent.side = d.decide.side;
    const t0 = performance.now();
    const m = agent.decide(sim);
    self.postMessage({ req: d.decide.req, macro: m.id, thinking: agent.thinking(), ms: performance.now() - t0 });
  }
};
