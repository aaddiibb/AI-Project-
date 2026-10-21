// Web Audio engine (prompt 06). BROWSER ONLY: imported by audio/index.js, never by the sim, the agents or the tools.
//
// master chain:  buses (music, sfx, ui, voice) -> per-bus level -> per-bus duck -> pre -> compressor -> limiter -> out
//                every voice also feeds a reverb send (convolver with a procedural dojo-hall IR)
// voices:        AudioBufferSource -> gain -> stereo panner -> bus. SFX are capped at MIX.maxVoices (priority stealing),
//                music notes at 10. A minimum interval per sound id stops machine-gunning at 4x speed.
// The AudioContext is created on the first user gesture (autoplay rules); until then every call is a silent no-op.
import { SOUNDS, MIX, sampleJobs } from './sounds.js';
import { SR, reverbIR } from './dsp.js';

const dbToGain = (db) => 10 ** (db / 20);

export class AudioEngine {
  constructor() {
    this.ctx = null; this.raw = new Map(); this.buffers = new Map();
    this.voices = []; this.musicVoices = []; this.loops = new Map(); this.lastPlay = new Map();
    this.ducks = {}; this.vol = { master: 0.8, music: 0.7, sfx: 0.9 }; this.muted = false; this.loopsMuted = false;
  }
  get ready() { return !!this.ctx && (this.offline || this.ctx.state === 'running'); }
  /** the engine's clock: the context time, or (offline rendering) the time the driver sets */
  now() { return this.offline ? this.offlineTime : this.ctx.currentTime; }
  /** render into an OfflineAudioContext instead (tools/audio_render.html): the driver advances offlineTime */
  useOffline(ctx) { this.ctx = ctx; this.offline = true; this.offlineTime = 0; this.build(); }

  /** call from a user gesture */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
      this.build();
      for (const k of this.raw.keys()) this.buffer(k);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  build() {
    const c = this.ctx;
    this.out = c.createGain();
    const comp = c.createDynamicsCompressor(), lim = c.createDynamicsCompressor();
    for (const [n, o] of [[comp, MIX.comp], [lim, MIX.limit]]) { n.threshold.value = o.threshold; n.ratio.value = o.ratio; n.attack.value = o.attack; n.release.value = o.release; n.knee.value = o.knee ?? 0; }
    this.pre = c.createGain();
    this.pre.connect(comp).connect(lim).connect(this.out).connect(c.destination);
    this.bus = {};
    // each bus has a dry chain and a wet chain (its voices' reverb sends): both follow the bus volume, duck and pause,
    // so a muted or ducked bus also silences its reverb
    for (const name of Object.keys(MIX.bus)) {
      const mk = () => { const level = c.createGain(), duck = c.createGain(), pause = c.createGain(); level.connect(duck).connect(pause); return { level, duck, pause }; };
      const dry = mk(), wet = mk();
      dry.pause.connect(this.pre);
      this.bus[name] = { level: dry.level, wet: wet.level, chains: [dry, wet] };
    }
    // the convolver needs the context's own rate (44.1 or 48 kHz): resample the 48 kHz IR if they differ
    const rs = (x) => { if (c.sampleRate === SR) return x; const n = Math.round(x.length * c.sampleRate / SR), y = new Float32Array(n), k = SR / c.sampleRate; for (let i = 0; i < n; i++) { const j = i * k, j0 = Math.floor(j), fr = j - j0; y[i] = (x[j0] || 0) * (1 - fr) + (x[j0 + 1] || 0) * fr; } return y; };
    const [L, R] = reverbIR(MIX.reverb.sec).map(rs), ir = c.createBuffer(2, L.length, c.sampleRate);
    ir.copyToChannel(L, 0); ir.copyToChannel(R, 1);
    this.rvIn = c.createGain(); const conv = c.createConvolver(); conv.normalize = false; conv.buffer = ir;
    const ret = c.createGain(); ret.gain.value = MIX.reverb.ret;
    this.rvIn.connect(conv).connect(ret).connect(this.pre);
    for (const b of Object.values(this.bus)) b.chains[1].pause.connect(this.rvIn);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.now(), set = (p, v) => p.setTargetAtTime(v, t, 0.03);
    set(this.out.gain, this.muted ? 0 : this.vol.master);
    for (const b of Object.keys(MIX.bus)) for (const ch of this.bus[b].chains) set(ch.level.gain, MIX.bus[b] * (b === 'music' ? this.vol.music : this.vol.sfx));
  }
  setVolume(k, v) { this.vol[k] = v; this.applyVolumes(); }
  setMuted(m) { this.muted = m; this.applyVolumes(); }
  /** fade one bus out / in (pause) */
  setBusPaused(name, paused) { if (this.ctx) for (const ch of this.bus[name].chains) ch.pause.gain.setTargetAtTime(paused ? 0 : 1, this.now(), 0.08); }

  /** recorded clips (character voices): fetched now, decoded once a context exists (offline contexts decode too) */
  loadSamples() {
    if (!this.sampleFetch) this.sampleFetch = Promise.all(sampleJobs().map(async (j) => {
      try { const r = await fetch(new URL('../../' + j.url, import.meta.url)); return r.ok ? [j.key, await r.arrayBuffer()] : null; } catch { return null; }
    }));
    if (!this.ctx) return this.sampleFetch;
    return (this.sampleDecode ||= this.sampleFetch.then((list) => Promise.all(list.filter(Boolean).map(async ([key, ab]) => {
      try { this.buffers.set(key, await this.ctx.decodeAudioData(ab.slice(0))); } catch { /* a bad file just stays silent */ }
    }))));
  }

  addRaw(key, f32) { this.raw.set(key, f32); if (this.ctx && !this.offline) this.buffer(key); } // convert early: no first-play spike
  has(key) { return this.raw.has(key); }
  buffer(key) {
    let b = this.buffers.get(key);
    if (!b) { const r = this.raw.get(key); if (!r || !this.ctx) return null; b = this.ctx.createBuffer(1, r.length, SR); b.copyToChannel(r, 0); this.buffers.set(key, b); }
    return b;
  }

  /** duck buses: { music: dB, sfx: dB, hold: ms }; overlapping ducks keep the deepest level and the latest end */
  duck(d) {
    const now = this.now();
    for (const name of ['music', 'sfx']) {
      if (d[name] === undefined) continue;
      const st = this.ducks[name] || { depth: 0, until: 0 }, active = st.until > now;
      const depth = active ? Math.min(st.depth, d[name]) : d[name], until = Math.max(active ? st.until : 0, now + d.hold / 1000);
      this.ducks[name] = { depth, until };
      for (const ch of this.bus[name].chains) {
        const g = ch.duck.gain;
        g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(dbToGain(depth), now + MIX.duckAttack);
        g.setValueAtTime(dbToGain(depth), until);
        g.linearRampToValueAtTime(1, until + MIX.duckRelease);
      }
    }
  }

  /** play a bank sound; returns the voice or null (not ready, rate-limited, or no voice free) */
  play(id, { variant = 0, rate = 1, gain = 1, pan = 0, when = 0 } = {}) {
    if (!this.ready) return null;
    const s = SOUNDS[id]; if (!s) return null;
    const now = this.now();
    const last = this.lastPlay.get(id);
    if (s.min && last !== undefined && (now - last) * 1000 < s.min) return null;
    const buf = this.buffer(id + ':' + variant) || this.buffer(id + ':0'); if (!buf) return null; // a variant still rendering: use the first
    if (!this.makeRoom(this.voices, MIX.maxVoices, s.pri)) return null;
    this.lastPlay.set(id, now);
    const v = this.voice(buf, { bus: s.bus, gain: gain * s.gain, rate, pan: pan * (s.panScale ?? 1), send: s.send, pri: s.pri, when: Math.max(when, now) }, this.voices);
    if (s.duck) this.duck(s.duck);
    return v;
  }
  /** play an instrument note on the music bus (stem gain node given) */
  note(key, { when, gain = 1, dest, dur = 0, rate = 1 }) {
    if (!this.ready) return null;
    const buf = this.buffer(key); if (!buf) return null;
    if (!this.makeRoom(this.musicVoices, 10, 1)) return null;
    const v = this.voice(buf, { dest, gain, rate, pan: 0, send: 0.35, pri: 1, when }, this.musicVoices);
    if (dur) { const e = when + dur; v.g.gain.setValueAtTime(gain, e); v.g.gain.linearRampToValueAtTime(0, e + 0.12); v.src.stop(e + 0.15); }
    return v;
  }
  voice(buf, { bus, dest, gain, rate, pan, send, pri, when }, pool) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = gain;
    const p = c.createStereoPanner(); p.pan.value = pan;
    src.connect(g).connect(p).connect(dest || this.bus[bus].level);
    let sg = null;
    if (send) { sg = c.createGain(); sg.gain.value = send; p.connect(sg).connect(dest ? this.bus.music.wet : this.bus[bus].wet); }
    const v = { src, g, p, sg, pri, t: when, end: when + buf.duration / rate };
    pool.push(v);
    src.onended = () => { const i = pool.indexOf(v); if (i >= 0) pool.splice(i, 1); src.disconnect(); g.disconnect(); p.disconnect(); sg?.disconnect(); };
    src.start(when);
    return v;
  }
  makeRoom(pool, max, pri) {
    const now = this.now();
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].end < now - 0.05) pool.splice(i, 1); // safety: ended but no event yet
    if (pool.length < max) return true;
    let k = -1;
    for (let i = 0; i < pool.length; i++) if (pool[i].pri <= pri && (k < 0 || pool[i].pri < pool[k].pri || (pool[i].pri === pool[k].pri && pool[i].t < pool[k].t))) k = i;
    if (k < 0) return false;
    const v = pool[k]; pool.splice(k, 1);
    v.g.gain.setTargetAtTime(0, now, 0.005); try { v.src.stop(now + 0.03); } catch { /* already stopped */ }
    return true;
  }

  /** looping sounds keyed by the caller (the travelling crescent): start / move / stop to match `list` */
  syncLoops(list, panOf) {
    if (!this.ready) return;
    const c = this.ctx, now = this.now(), seen = new Set();
    for (const l of list) {
      seen.add(l.key);
      let v = this.loops.get(l.key);
      const s = SOUNDS[l.id];
      if (!v) {
        const buf = this.buffer(l.id + ':0'); if (!buf) continue;
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        const g = c.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(this.loopsMuted ? 0 : s.gain, now, 0.03);
        const p = c.createStereoPanner(); p.pan.value = panOf(l.x);
        const sg = c.createGain(); sg.gain.value = s.send;
        src.connect(g).connect(p).connect(this.bus[s.bus].level); p.connect(sg).connect(this.bus[s.bus].wet);
        src.start(now, (l.x * 0.37) % buf.duration); // offset from x: deterministic
        v = { src, g, p, sg, gain: s.gain }; this.loops.set(l.key, v);
      }
      v.p.pan.setTargetAtTime(panOf(l.x), now, 0.02);
    }
    for (const [k, v] of this.loops) if (!seen.has(k)) this.stopLoop(k, v);
  }
  stopLoop(k, v) {
    const now = this.now(); this.loops.delete(k);
    v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0, now, 0.04);
    v.src.stop(now + 0.3); v.src.onended = () => { v.src.disconnect(); v.g.disconnect(); v.p.disconnect(); v.sg.disconnect(); };
  }
  stopLoops() { if (this.ctx) for (const [k, v] of this.loops) this.stopLoop(k, v); }
  muteLoops(m) {
    this.loopsMuted = m; if (!this.ctx) return;
    for (const v of this.loops.values()) v.g.gain.setTargetAtTime(m ? 0 : v.gain, this.now(), 0.05);
  }
}
