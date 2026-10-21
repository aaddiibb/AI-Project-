// Music player (prompt 06). BROWSER ONLY. A look-ahead scheduler (25 ms timer, 120 ms horizon) plays the score in
// score.js through four stem gains (base, perc, high, menu) plus two looping pads (drone, wind). Fight tension, computed
// from observable state in cues.js, fades the stems in and out; it never restarts between rounds.
import { BATTLE, MENU_SCORE, SELECT_SCORE, STEP_SEC, MENU_STEP, SELECT_STEP, stemGains } from './score.js';
import { INSTRUMENTS } from './sounds.js';

const PADS = { menu: { drone: 0.55, wind: 1 }, select: { drone: 0.3, wind: 0.15 }, battle: { drone: 1, wind: 0.35 }, off: { drone: 0, wind: 0 } };
const SCORES = { menu: [MENU_SCORE, MENU_STEP], select: [SELECT_SCORE, SELECT_STEP], battle: [BATTLE, STEP_SEC] };

export class Music {
  constructor(engine) { this.e = engine; this.mode = 'off'; this.T = 0; this.paused = false; this.stems = null; this.pads = {}; this.pos = 0; this.nextTime = 0; }
  start() {
    if (this.stems || !this.e.ctx) return;
    const c = this.e.ctx;
    this.stems = {};
    for (const s of ['base', 'perc', 'high', 'menu', 'select']) { const g = c.createGain(); g.gain.value = 0; g.connect(this.e.bus.music.level); this.stems[s] = g; }
    if (!this.e.offline) this.timer = setInterval(() => this.tick(), 25);
    this.setMode(this.want || 'menu', true);
  }
  setMode(m, force = false) {
    this.want = m;
    if (!this.stems || (m === this.mode && !force)) return;
    this.mode = m; this.pos = 0; this.nextTime = this.e.now() + 0.15;
    const now = this.e.now();
    this.stems.menu.gain.setTargetAtTime(m === 'menu' ? 1 : 0, now, 0.4);
    this.stems.select.gain.setTargetAtTime(m === 'select' ? 1 : 0, now, 0.25);
    for (const s of ['base', 'perc', 'high']) this.stems[s].gain.setTargetAtTime(m === 'battle' ? stemGains(this.T)[s] : 0, now, 0.4);
    this.updatePads();
  }
  updatePads() {
    const now = this.e.now();
    for (const id of ['drone', 'wind']) {
      if (!this.pads[id]) {
        const buf = this.e.buffer(id + ':0'); if (!buf) continue;
        const c = this.e.ctx, src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        const g = c.createGain(); g.gain.value = 0; src.connect(g).connect(this.e.bus.music.level); src.start(now);
        this.pads[id] = g;
      }
      this.pads[id].gain.setTargetAtTime(PADS[this.mode][id] * INSTRUMENTS[id].gain, now, 0.8);
    }
  }
  /** tension 0..1 (smoothed, tau 1.5 s) */
  setTension(T, dt) {
    this.T += (T - this.T) * (1 - Math.exp(-dt / 1.5));
    if (!this.stems || this.mode !== 'battle') return;
    const g = stemGains(this.T), now = this.e.now();
    for (const s of ['perc', 'high']) this.stems[s].gain.setTargetAtTime(g[s], now, 0.3);
    this.stems.base.gain.setTargetAtTime(1, now, 0.3);
  }
  setPaused(p) {
    this.paused = p; this.e.setBusPaused('music', p);
    if (!p && this.e.ctx) this.nextTime = Math.max(this.nextTime, this.e.now() + 0.05);
  }
  tick() { if (this.e.ready) this.scheduleUntil(this.e.now() + 0.12); }
  /** schedule every note that starts before `until` (the timer uses a 120 ms horizon; offline rendering any horizon) */
  scheduleUntil(until) {
    if (!this.e.ready || this.mode === 'off' || this.paused || !this.stems) return;
    if (!this.pads.drone || !this.pads.wind) this.updatePads();
    const now = this.e.now(), [score, stepSec] = SCORES[this.mode], steps = score.length * 16;
    if (this.nextTime < now - 0.3) this.nextTime = now + 0.05; // the tab was hidden: no backlog
    while (this.nextTime < until) {
      const bar = Math.floor(this.pos / 16) % score.length, step = this.pos % 16;
      for (const ev of score[bar]) {
        if (ev.step !== step) continue;
        const inst = INSTRUMENTS[ev.inst], key = ev.inst + ':' + (ev.note ?? (this.pos % (inst.variants || 1)));
        this.e.note(key, { when: this.nextTime, gain: ev.vel * inst.gain, dest: this.stems[ev.stem], dur: ev.dur ? ev.dur * stepSec : 0 });
      }
      this.pos = (this.pos + 1) % steps; this.nextTime += stepSec;
    }
  }
}
