// Web Worker host for the Master level (remote.js). The main thread keeps running the game at 60 fps; the worker gets the
// agent's predicted next decision positions (speculate.js, most likely first) as plain data, runs the real agent's
// decide() on each in turn and posts every answer back as soon as it is ready. Between two searches it yields, so a newer
// request (the agent has moved on to another macro) cancels whatever is left of the old queue.
import { Sim } from '../sim.js';
import { makeAgent } from './registry.js';

let agent = null, gen = 0, queue = [];
function next() {
  const job = queue.shift(); if (!job) return;
  if (job.gen === gen) {
    const sim = Sim.fromState(job.state);
    agent.side = job.side;
    const t0 = performance.now();
    const m = agent.decide(sim);
    self.postMessage({ gen: job.gen, k: job.k, macro: m.id, thinking: agent.thinking(), ms: performance.now() - t0 });
  }
  if (queue.length) setTimeout(next, 0); // yield: a newer request may arrive and supersede the rest
}
self.onmessage = (e) => {
  const d = e.data;
  if (d.init) { agent = makeAgent(d.init.name, d.init.opts); return; }
  if (d.speculate && agent) {
    gen = d.speculate.gen;
    const idle = queue.length === 0;
    queue = d.speculate.states.map((state, k) => ({ gen, k, state, side: d.speculate.side }));
    if (idle) setTimeout(next, 0);
  }
};
