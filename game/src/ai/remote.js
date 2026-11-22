// WorkerAgent: the Master level in the browser. Its 50 ms search runs in a Web Worker (on the main thread it would drop
// frames), and it thinks ONE MOVE AHEAD (speculate.js): the moment a macro starts, the worker searches the position
// predicted at the next decision point under several opponent behaviours, most likely first. At that point the answer
// for the prediction that came true is used at once; if none did, a Hard-budget copy decides immediately on the main
// thread. So Master never stands still waiting for its worker (the old ask-and-wait version lost every match to Hard on
// that ~3-frame lag) and is never worse than Hard. Everything else (delayed sanitised views, extrapolation, executor,
// reaction interrupts) is the shared Agent code. tools/arena.mjs --lat1 3 emulates exactly this in Node.
import { Agent } from './agent.js';
import { macroSet } from './macros.js';
import { makeAgent } from './registry.js';
import { LEVELS } from './difficulty.js';
import { predictAll, snapshot, stillValid } from './speculate.js';

export class WorkerAgent extends Agent {
  constructor(name, opts) {
    super(opts);
    this.name = name; this.gen = 0; this.spec = null; this.stats.spec = { hit: 0, late: 0, changed: 0, none: 0 };
    this.local = makeAgent(name, { ...opts, budget: { ms: LEVELS.hard.budgetMs } }); // main-thread fallback (Hard budget; only ~25 % of decisions)
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.postMessage({ init: { name, opts: { ...opts, side: opts.side } } });
    this.ticks = 0;
    this.worker.onmessage = (e) => { const d = e.data, x = this.spec?.filter((s) => s.gen === d.gen)[d.k]; if (x) x.reply = d; };
  }
  reset(view) { super.reset(view); this.local.reset(view); this.spec = null; this.gen++; }
  /** a macro just started: the worker searches the predicted next decision points (most likely first) while it plays out */
  onDecided(cur, prog) { this.spec = []; this.ask(cur, prog); }
  /** every few frames while the macro plays out: a fresh prediction from the newest view (older answers are kept) */
  onTick(view, age) {
    if (++this.ticks % 6) return;
    this.ask(this.extrapolate(view, Math.min(age, this.sent.length)), this.prog, 2);
  }
  ask(cur, prog, max) {
    const preds = predictAll(cur, this.side, prog, max), gen = ++this.gen;
    const fresh = preds.map((p) => ({ snap: p.snap, reply: null, gen }));
    this.spec = [...fresh, ...(this.spec || [])].slice(0, 12);
    this.worker.postMessage({ speculate: { gen, side: this.side, states: preds.map((p) => p.sim.toState()) } });
  }
  decide(sim) {
    const list = this.spec || [], set = macroSet(sim.C(sim.f[this.side])), now = snapshot(sim, this.side);
    this.spec = null;
    const valid = list.filter((x) => stillValid(x.snap, now)), s = valid.find((x) => x.reply);
    if (s) {
      this.stats.spec.hit++;
      this._think = { ...s.reply.thinking, ms: s.reply.ms, worker: true };
      return set.byId[s.reply.macro] || set.byId.wait;
    }
    this.stats.spec[!list.length ? 'none' : !valid.length ? 'changed' : 'late']++;
    this.local.side = this.side;
    const m = this.local.decide(sim);
    this._think = this.local.thinking() ? { ...this.local.thinking(), fallback: true } : null;
    return m;
  }
  dispose() { this.worker.terminate(); }
}
