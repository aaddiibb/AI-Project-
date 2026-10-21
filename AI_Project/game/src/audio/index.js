// Sound facade (prompt 06). BROWSER ONLY: main.js and menu.js use it; nothing in the sim, the agents or the headless tools
// imports anything under src/audio except the pure cues/dsp/score modules used by the audio tests and renderer.
//
//   sound.onStep(sim, match)    once per SIM STEP, with the live sim: cues -> voices (+ the crescent loop)
//   sound.update(dt, cam, ...)  once per render frame: camera for panning, fight tension for the music
//   sound.ui(name)              menu clicks / hovers
//   sound.setMenu / setPaused / setSpeed / newGame, settings (master, music, sfx, muted) saved in localStorage
// ?audiolog=1 prints every cue with its sim frame to the console.
import { AudioEngine } from './engine.js';
import { Music } from './music.js';
import { CueTracker, tension } from './cues.js';
import { MIX, panOf, bankJobs } from './sounds.js';
import { render } from './dsp.js';

const KEY = 'shinobi-arena-audio';
const DEFAULTS = { master: 0.8, music: 0.7, sfx: 0.9, muted: false };

export class Sound {
  constructor() {
    this.engine = new AudioEngine(); this.music = new Music(this.engine); this.tracker = new CueTracker();
    this.cam = { cx: 2600, w: 5200 }; this.speed = 1; this.paused = false; this.inMenu = true; this.onChange = null;
    this.log = (() => { try { return new URLSearchParams(location.search).get('audiolog') === '1'; } catch { return false; } })();
    this.settings = { ...DEFAULTS };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage unavailable */ }
    this.bankReady = this.renderBank();
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true); addEventListener('touchstart', unlock, true);
  }

  /** first user gesture: create / resume the AudioContext, start the music */
  unlock() {
    if (!this.engine.unlock()) return;
    this.applySettings();
    this.music.start(); this.music.setMode(this.inMenu ? 'menu' : 'battle');
  }

  /** render the bank in a worker (fallback: main thread in small slices) */
  renderBank() {
    const jobs = bankJobs(), add = (k, b) => this.engine.addRaw(k, b);
    return new Promise((resolve) => {
      let w = null;
      try { w = new Worker(new URL('./bank_worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
      const fallback = async () => {
        for (const j of jobs) { if (!this.engine.has(j.key)) add(j.key, render(j.id, j.v, j.note)); await new Promise((r) => setTimeout(r, 0)); }
        resolve();
      };
      if (!w) return fallback();
      let got = 0;
      w.onmessage = ({ data }) => { if (data.done) { w.terminate(); resolve(); return; } add(data.key, data.buf); got++; };
      w.onerror = (e) => { e.preventDefault?.(); w.terminate(); fallback(); };
      w.postMessage({ jobs });
    });
  }

  // ------------------------------------------------------------------ game hooks
  newGame() { this.tracker.reset(); this.engine.stopLoops(); }
  onStep(sim, match) {
    const cues = this.tracker.frame(sim, match);
    const rate = MIX.speedRate(this.speed), pan = (x) => panOf(x, this.cam.cx, this.cam.w);
    for (const q of cues) {
      const v = this.engine.play(q.id, { variant: q.variant, rate: q.rate * rate, gain: q.gain, pan: pan(q.x) });
      if (this.log) console.log(`[audio] f${q.frame} ${q.id}${q.side >= 0 ? ' P' + (q.side + 1) : ''} x=${Math.round(q.x)}${v ? '' : ' (skipped)'}`);
    }
    this.engine.syncLoops(this.tracker.loops, pan);
  }
  update(dt, cam, sim, match) {
    if (cam) this.cam = cam;
    if (sim && !this.inMenu) this.music.setTension(match && match.over ? 0 : tension(sim, match), dt);
  }
  ui(name) { this.engine.play(name, { variant: Math.random() < 0.5 ? 0 : 1, rate: 0.98 + Math.random() * 0.04 }); } // UI only: Math.random is fine here
  setMenu(v) { this.inMenu = v; this.music.setMode(v ? 'menu' : 'battle'); this.engine.muteLoops(v || this.paused); }
  setPaused(p) { this.paused = p; this.music.setPaused(p); this.engine.muteLoops(p); }
  setSpeed(s) { this.speed = s; }

  // ------------------------------------------------------------------ settings
  applySettings() {
    const s = this.settings, e = this.engine;
    e.vol.master = s.master; e.vol.music = s.music; e.vol.sfx = s.sfx; e.muted = s.muted; e.applyVolumes();
  }
  set(k, v) {
    this.settings[k] = v; this.applySettings();
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* storage unavailable */ }
    this.onChange?.(this.settings);
  }
  toggleMute() { this.set('muted', !this.settings.muted); return this.settings.muted; }
}
