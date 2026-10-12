// WorkerAgent: an Agent whose decide() runs in a Web Worker (browser only; Master level).
// While the worker thinks, the fighter holds a one-frame "think" macro (keeps guarding if it was guarding) and the request
// stays pending; the reply is applied at the next decision point, so the thinking time adds to the reaction delay exactly
// like a human's. Everything else (delayed sanitised views, extrapolation, executor) is the shared Agent code.
import { Agent } from './agent.js';
import { macroSet } from './macros.js';
import { BTN } from '../sim.js';

export class WorkerAgent extends Agent {
  constructor(name, opts) {
    super(opts);
    this.name = name; this.req = 0; this.reply = null; this.pending = false; this.waitFrames = 0;
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.postMessage({ init: { name, opts: { ...opts, side: opts.side } } });
    this.worker.onmessage = (e) => { if (e.data.req === this.req) this.reply = e.data; };
  }
  reset(view) { super.reset(view); this.req++; this.reply = null; this.pending = false; }
  decide(sim) {
    const me = sim.f[this.side], set = macroSet(sim.C(me));
    if (this.reply) {
      const r = this.reply; this.reply = null; this.pending = false;
      this._think = { ...r.thinking, ms: r.ms, worker: true, waited: this.waitFrames }; this.waitFrames = 0;
      return set.byId[r.macro] || set.byId.wait;
    }
    if (!this.pending) { this.pending = true; this.req++; this.worker.postMessage({ decide: { req: this.req, state: sim.toState(), side: this.side } }); }
    this.waitFrames++;
    const hold = me.state === 'guard' ? BTN.B : 0;
    return { id: 'think', kind: 'think', first: hold, hold, len: 1, stick: hold, idx: -1 };
  }
  dispose() { this.worker.terminate(); }
}
