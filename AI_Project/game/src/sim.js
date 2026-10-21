// Deterministic fighting-game simulator: 60 Hz fixed step, pure function of the input stream (no rendering, no randomness).
// Human input, the training dummy and the AI agents all drive it through the same bitmask per fighter per frame.
//
//   const sim = new Sim({ chars: ['samurai', 'samurai'] });  sim.step([bitsP1, bitsP2]);  // then read sim.f[], sim.projectiles, sim.events
//
// Fighter states: idle crouch walk run runstop guard | attack (incl. the ultimate) | prejump air land dash backhop backdash |
//                 hitstun blockstun | knock down wake
// Meter: 0-100, filled by attacks that connect (hit = full gain, block = 60%); the ultimate spends all of it.
//
// Per-fighter data (character registry, prompt 05 §4.1): every frame-data / physics / hurtbox read goes through the fighter's
// own character, `this.C(f)`. Fighter objects stay plain data (no character pointer), so they can be cloned, hashed and
// posted to a Web Worker. `clone()` / `hash()` support search (prompt 05 §4.2). Runs headless under Node (no DOM imports).
import { getChar } from './characters/index.js';
import { WORLD } from './characters/common.js';
import { BTN } from './characters/buttons.js';

export { BTN };
const ATTACKS = ['P', 'K', 'S', 'T'];
export const FREE_STATES = new Set(['idle', 'crouch', 'walk', 'run', 'runstop', 'guard']);
const SIGN = (v) => (v < 0 ? -1 : 1);

function newFighter(id, x, facing, hp) {
  return {
    id, x, h: 0, vx: 0, vy: 0, facing, state: 'idle', t: 0, hp, meter: 0, flash: 0,
    move: null, hitDone: false, contact: false, chainCount: 0,
    kb: 0, stun: 0, crouchGuard: false, hitCrouch: false, invuln: false,
    walkDist: 0, runDist: 0, kunaiCd: 0, ko: false, airUsed: false, cutArmed: false, runJump: false,
    combo: 0, comboDmg: 0, lastHit: 0, counter: false,
    // input state
    prev: 0, fwd: false, back: false, up: false, down: false, guardBtn: false,
    buf: { P: 0, K: 0, S: 0, T: 0, U: 0, DASH: 0, ULT: 0 }, tapF: 0, tapB: 0, evRun: 0, evHop: 0,
  };
}

/** hand-written copy of one fighter (all fields are scalars except `buf`) */
function cloneFighter(f) {
  const g = { ...f };
  const b = f.buf;
  g.buf = { P: b.P, K: b.K, S: b.S, T: b.T, U: b.U, DASH: b.DASH, ULT: b.ULT };
  return g;
}

export class Sim {
  /**
   * @param {{chars?: (string|object)[], autoReset?: boolean}} [opts]
   *   chars: one character id (or object) per side, default Shinobi vs Shinobi.
   *   autoReset: training behaviour (after a KO, reset positions + refill HP and meter). The arena turns it off and runs rounds.
   */
  constructor(opts = {}) {
    this.chars = (opts.chars || ['shinobi', 'shinobi']).map(getChar);
    this.autoReset = opts.autoReset ?? true;
    this.resetAll();
  }

  /** the fighter's character data (immutable, shared by clones) */
  C(f) { return this.chars[f.id]; }

  resetAll() {
    this.f = [newFighter(0, 2050, 1, this.chars[0].phys.hp), newFighter(1, 3150, -1, this.chars[1].phys.hp)];
    this.projectiles = [];
    this.hitstop = 0; this.superFreeze = 0; this.frame = 0; this.events = []; this.koTimer = 0;
    this.comboShow = [{ hits: 0, dmg: 0, t: 0 }, { hits: 0, dmg: 0, t: 0 }];
    this.lastHit = null;
  }
  resetPositions() {
    const [a, b] = this.f;
    Object.assign(a, { x: 2050, h: 0, vx: 0, vy: 0, facing: 1, kb: 0 });
    Object.assign(b, { x: 3150, h: 0, vx: 0, vy: 0, facing: -1, kb: 0 });
    for (const f of this.f) { this.setState(f, 'idle'); f.stun = 0; f.move = null; f.contact = false; f.combo = 0; f.comboDmg = 0; f.ko = false; }
    this.projectiles = []; this.hitstop = 0; this.superFreeze = 0;
  }
  resetHealth() { for (const f of this.f) { f.hp = this.C(f).phys.hp; f.meter = 100; f.ko = false; f.combo = 0; f.comboDmg = 0; } this.koTimer = 0; }

  /** next round (arena): default positions, full HP, meter carried over, input buffers cleared */
  newRound() {
    this.resetPositions();
    for (const f of this.f) {
      f.hp = this.C(f).phys.hp; f.ko = false; f.flash = 0; f.hitDone = false; f.chainCount = 0; f.crouchGuard = false; f.hitCrouch = false;
      f.walkDist = 0; f.runDist = 0; f.kunaiCd = 0; f.airUsed = false; f.cutArmed = false; f.runJump = false; f.lastHit = 0; f.counter = false;
      f.prev = 0; f.fwd = f.back = f.up = f.down = f.guardBtn = false;
      for (const k of Object.keys(f.buf)) f.buf[k] = 0;
      f.tapF = f.tapB = f.evRun = f.evHop = 0;
    }
    this.koTimer = 0; this.lastHit = null; this.events = [];
    this.comboShow = [{ hits: 0, dmg: 0, t: 0 }, { hits: 0, dmg: 0, t: 0 }];
  }

  setState(f, s) { f.state = s; f.t = 0; f.invuln = s === 'knock' || s === 'down' || s === 'wake'; }

  // ------------------------------------------------------------------ search support (prompt 05 §4.2)
  /** hand-written deep copy of ALL mutable state; character data is shared (immutable). Events start empty. */
  clone() {
    const s = Object.create(Sim.prototype);
    s.chars = this.chars; s.autoReset = this.autoReset;
    s.f = [cloneFighter(this.f[0]), cloneFighter(this.f[1])];
    const P = this.projectiles, Q = new Array(P.length);
    for (let i = 0; i < P.length; i++) Q[i] = { ...P[i] }; // `spec` stays shared (immutable move data)
    s.projectiles = Q;
    s.hitstop = this.hitstop; s.superFreeze = this.superFreeze; s.frame = this.frame; s.koTimer = this.koTimer;
    s.events = [];
    const c = this.comboShow;
    s.comboShow = [{ hits: c[0].hits, dmg: c[0].dmg, t: c[0].t }, { hits: c[1].hits, dmg: c[1].dmg, t: c[1].t }];
    s.lastHit = this.lastHit ? { ...this.lastHit } : null;
    return s;
  }

  /** plain-data snapshot (structured-clone / postMessage safe): character ids instead of character objects */
  toState() {
    const c = this.clone();
    return { chars: this.chars.map((ch) => ch.id), autoReset: this.autoReset, f: c.f, projectiles: c.projectiles.map((p) => ({ ...p, spec: null, specKey: this.specKey(p) })),
      hitstop: c.hitstop, superFreeze: c.superFreeze, frame: c.frame, koTimer: c.koTimer, comboShow: c.comboShow, lastHit: c.lastHit };
  }
  /** where a projectile's spec lives in its owner's move data (so a deserialised sim shares the real spec object) */
  specKey(p) {
    const M = this.chars[p.owner].moves;
    for (const [k, m] of Object.entries(M)) { if (m.projectile === p.spec) return k + '.projectile'; if (m.fan === p.spec) return k + '.fan'; }
    return null;
  }
  static fromState(o) {
    const s = Object.create(Sim.prototype);
    s.chars = o.chars.map(getChar); s.autoReset = o.autoReset;
    s.f = o.f.map((f) => ({ ...f, buf: { ...f.buf } }));
    s.projectiles = o.projectiles.map((p) => { const [k, part] = p.specKey.split('.'); const q = { ...p, spec: s.chars[p.owner].moves[k][part] }; delete q.specKey; return q; });
    s.hitstop = o.hitstop; s.superFreeze = o.superFreeze; s.frame = o.frame; s.koTimer = o.koTimer; s.events = [];
    s.comboShow = o.comboShow.map((c) => ({ ...c })); s.lastHit = o.lastHit ? { ...o.lastHit } : null;
    return s;
  }

  /** stable 32-bit state hash (FNV-1a over float64 bits) of all mutable state except the transient `events` */
  hash() {
    _h = 0x811c9dc5;
    for (const f of this.f) {
      for (const k of HASH_FIGHTER) hv(f[k]);
      const b = f.buf; hv(b.P); hv(b.K); hv(b.S); hv(b.T); hv(b.U); hv(b.DASH); hv(b.ULT);
    }
    hv(this.projectiles.length);
    for (const p of this.projectiles) { hv(p.owner); hv(p.x); hv(p.h); hv(p.vx); hv(p.vy); hv(p.dir); hv(p.life); hv(p.id); hv(p.fan); hv(p.spec.dmg); }
    hv(this.hitstop); hv(this.superFreeze); hv(this.frame); hv(this.koTimer);
    for (const c of this.comboShow) { hv(c.hits); hv(c.dmg); hv(c.t); }
    const l = this.lastHit; hv(!!l); if (l) { hv(l.by); hv(l.dmg); hv(l.counter); hv(l.move); hv(l.frame); }
    return _h >>> 0;
  }

  // ------------------------------------------------------------------ frame step
  step(inputs) {
    this.events = [];
    this.frame++;
    for (let i = 0; i < 2; i++) this.readInput(this.f[i], inputs[i] || 0);
    if (this.superFreeze > 0) { this.superFreeze--; for (const f of this.f) if (f.flash > 0) f.flash--; return; } // ultimate flash: the world holds (the caster's showpiece is cosmetic)
    if (this.hitstop > 0) { this.hitstop--; return; }
    const [f0, f1] = this.f;
    this.tickTimers(f0); this.tickTimers(f1);
    this.update(f0, f1); this.update(f1, f0);
    this.moveProjectiles();
    this.resolvePush();
    this.detectHits();
    this.trackCombo(f0); this.trackCombo(f1);
    const cs = this.comboShow; if (cs[0].t > 0) cs[0].t--; if (cs[1].t > 0) cs[1].t--;
    if (this.autoReset && this.f.some((f) => f.ko)) { if (++this.koTimer > 200) { this.resetPositions(); this.resetHealth(); this.events.push({ kind: 'reset' }); } }
  }

  tickTimers(f) {
    const b = f.buf;
    if (b.P > 0) b.P--; if (b.K > 0) b.K--; if (b.S > 0) b.S--; if (b.T > 0) b.T--; if (b.U > 0) b.U--; if (b.DASH > 0) b.DASH--; if (b.ULT > 0) b.ULT--;
    if (f.tapF > 0) f.tapF--; if (f.tapB > 0) f.tapB--;
    if (f.evRun > 0) f.evRun--; if (f.evHop > 0) f.evHop--;
    if (f.kunaiCd > 0) f.kunaiCd--;
  }

  // ------------------------------------------------------------------ input
  readInput(f, bits) {
    const ch = this.C(f);
    bits &= ch.inputMask; // input masking: buttons this character does not have never reach the state machine
    const fb = f.facing > 0 ? BTN.R : BTN.L, bb = f.facing > 0 ? BTN.L : BTN.R;
    f.fwd = !!(bits & fb) && !(bits & bb); f.back = !!(bits & bb) && !(bits & fb);
    f.up = !!(bits & BTN.U); f.down = !!(bits & BTN.D); f.guardBtn = !!(bits & BTN.B);
    const pressed = bits & ~f.prev;
    const win = ch.phys.doubleTapWindow;
    if (pressed & fb) { if (f.tapF > 0) { if (ch.can.run) f.evRun = 8; f.tapF = 0; } else f.tapF = win; } // double-tap forward = run (if the character can run)
    if (pressed & bb) { if (f.tapB > 0) { f.evHop = 8; f.tapB = 0; } else f.tapB = win; }                 // double-tap back = hop / back-dash
    const ib = ch.phys.inputBuffer;
    for (const k of ATTACKS) if (pressed & BTN[k]) f.buf[k] = ib;
    if (pressed & BTN.U) f.buf.U = ib;
    if (pressed & BTN.DASH) f.buf.DASH = ib;
    if (pressed & BTN.ULT) f.buf.ULT = ib;
    f.prev = bits;
  }
  bestBuffered(f) {
    let best = null, v = 0;
    for (const k of ATTACKS) if (f.buf[k] > v) { v = f.buf[k]; best = k; }
    return best;
  }
  pickMove(f, btn, air) { return this.C(f).pickMove(btn, { air, down: f.down }) || null; }

  // ------------------------------------------------------------------ per-state update
  update(f, o) {
    f.t++;
    switch (f.state) {
      case 'idle': case 'crouch': case 'walk': case 'run': case 'runstop': case 'guard': return this.free(f, o);
      case 'attack': return this.attack(f, o);
      case 'prejump': return this.prejump(f, o);
      case 'air': return this.air(f, o);
      case 'dash': return this.dash(f, o);
      case 'backhop': return this.backhop(f, o);
      case 'backdash': return this.backdash(f, o);
      case 'land': f.vx *= WORLD.groundFriction; f.x += f.vx; if (f.t >= this.C(f).phys.landLag) { this.face(f, o); this.setState(f, 'idle'); } return;
      case 'hitstun': case 'blockstun': return this.stunned(f, o);
      case 'knock': return this.knock(f, o);
      case 'down': if (!f.ko && f.t >= 46) this.setState(f, 'wake'); return;
      case 'wake': if (f.t >= 14) { this.face(f, o); this.setState(f, 'idle'); } return;
    }
  }

  face(f, o) { if (f.h === 0) f.facing = o.x >= f.x ? 1 : -1; }

  free(f, o) {
    const P = this.C(f).phys, ult = this.C(f).moves.ult;
    this.face(f, o);
    const prevState = f.state;
    // ultimate (full meter, grounded)
    if (f.buf.ULT > 0) { f.buf.ULT = 0; if (ult && f.meter >= ult.cost && f.h === 0) return this.startUlt(f); }
    // attacks (buffered presses)
    const b = this.bestBuffered(f);
    if (b) { const mv = this.pickMove(f, b, false); if (mv && this.startMove(f, mv)) { f.buf[b] = 0; return; } }
    // jump
    if (f.buf.U > 0) { f.buf.U = 0; return this.startJump(f); }
    // dash (towards the held direction, forward by default; back = hop / grounded back-dash)
    if (f.buf.DASH > 0) { f.buf.DASH = 0; if (f.back) return this.startHop(f); return this.startDash(f); }
    if (f.evHop > 0) { f.evHop = 0; return this.startHop(f); }
    if (f.evRun > 0 && f.fwd && !f.down) {
      f.evRun = 0; this.setState(f, 'run'); f.vx = f.facing * P.runStartV; f.runDist = 0;
      this.events.push({ kind: 'dash', x: f.x, dir: f.facing }); f.x += f.vx; return;
    }
    // stance & movement
    if (f.down) {
      f.crouchGuard = f.guardBtn;
      this.enter(f, f.guardBtn ? 'guard' : 'crouch'); this.slide(f); return;
    }
    if (f.guardBtn) { f.crouchGuard = false; this.enter(f, 'guard'); this.slide(f); return; }
    if (prevState === 'run' && f.fwd) { // keep running
      f.state = 'run';
      f.vx = f.facing * Math.min(P.runMax, Math.abs(f.vx) + P.runAccel);
      f.runDist += f.vx * f.facing; f.x += f.vx; return;
    }
    if (prevState === 'run' || (prevState === 'runstop' && f.t < 8 && !f.fwd && !f.back)) {
      this.enter(f, 'runstop'); f.vx *= 0.78; f.x += f.vx; return;
    }
    if (f.fwd || f.back) {
      this.enter(f, 'walk');
      f.vx = f.facing * (f.fwd ? P.walkF : -P.walkB);
      f.walkDist += f.vx * f.facing; f.x += f.vx; return;
    }
    this.enter(f, 'idle'); this.slide(f);
  }
  enter(f, s) { if (f.state !== s) { f.state = s; f.t = 0; } }
  slide(f) { f.vx = Math.abs(f.vx) < 0.5 ? 0 : f.vx * WORLD.groundFriction; f.x += f.vx; }

  startMove(f, name, air = false) {
    const m = this.C(f).moves[name];
    if (!m) return false;
    if (name === 'throw' && (f.kunaiCd > 0 || this.projectiles.filter((p) => p.owner === f.id).length >= 2)) return false;
    if (air && f.airUsed) return false;
    const chained = f.state === 'attack' && f.move === name;
    f.chainCount = chained ? f.chainCount + 1 : (f.state === 'attack' ? f.chainCount : 0);
    f.state = 'attack'; f.move = name; f.t = 0; f.hitDone = false; f.contact = false; f.invuln = false;
    if (air) f.airUsed = true;
    return true;
  }

  startUlt(f) {
    const ult = this.C(f).moves.ult;
    this.startMove(f, 'ult'); f.meter = 0; f.vx = 0;
    this.superFreeze = ult.freeze; f.flash = ult.freeze;
    this.events.push({ kind: 'super', id: f.id, x: f.x, dir: f.facing });
  }

  attack(f, o) {
    const M = this.C(f).moves, m = M[f.move];
    if (m.air) {
      this.airPhysics(f);
      if (f.h <= 0) return this.land(f, o, 6);
      return;
    }
    if (m.adv && f.t <= m.active[1]) f.x += m.adv * f.facing;
    f.vx *= WORLD.groundFriction; f.x += f.vx;
    if (m.spawnAt !== undefined && f.t === m.spawnAt + 1) (m.fan ? this.spawnFan(f, m) : this.spawnProjectile(f, m));
    if (f.contact) { // gatling cancel into a heavier normal after it connects
      const b = this.bestBuffered(f);
      if (b) {
        const nm = this.pickMove(f, b, false), n = nm && M[nm];
        if (n && n.rank !== undefined && (n.rank > m.rank || (nm === f.move && m.chain && f.chainCount < m.chain - 1))) {
          if (this.startMove(f, nm)) { f.buf[b] = 0; return; }
        }
      }
    }
    if (f.t >= m.total) {
      f.invuln = false;
      this.setState(f, f.down ? 'crouch' : 'idle'); f.crouchGuard = false;
    }
  }

  spawnProjectile(f, m) {
    const s = m.projectile;
    this.projectiles.push({ owner: f.id, x: f.x + f.facing * s.ox, h: s.h + f.h * 0.5, vx: f.facing * s.vx, dir: f.facing, life: s.life, spec: s, id: this.frame * 2 + f.id });
    f.kunaiCd = 26;
    this.events.push({ kind: s.kind || 'throw', x: f.x + f.facing * s.ox, h: s.h, dir: f.facing });
  }

  spawnFan(f, m) {
    const s = m.fan;
    s.angles.forEach((deg, i) => {
      const r = (deg * Math.PI) / 180;
      this.projectiles.push({ owner: f.id, x: f.x + f.facing * s.ox, h: s.h, vx: f.facing * s.speed * Math.cos(r), vy: s.speed * Math.sin(r), dir: f.facing, life: s.life, spec: s, fan: true, id: this.frame * 16 + i * 2 + f.id });
    });
    this.events.push({ kind: 'fan', x: f.x + f.facing * s.ox, h: s.h, dir: f.facing });
  }

  startJump(f) {
    f.runJump = f.state === 'run';
    this.setState(f, 'prejump'); f.airUsed = false;
  }
  prejump(f, o) {
    const P = this.C(f).phys;
    f.vx *= 0.7; f.x += f.vx;
    if (f.t < P.prejump) return;
    const dir = f.fwd ? f.facing : f.back ? -f.facing : (f.runJump ? f.facing : 0);
    const speed = f.runJump ? 17 : dir === f.facing ? P.jumpVx : P.jumpBackVx;
    this.setState(f, 'air'); f.vy = P.jumpVy; f.vx = dir * speed; f.cutArmed = true; f.airUsed = false;
    this.events.push({ kind: 'jump', x: f.x });
  }
  airPhysics(f, g = WORLD.gravity) {
    if (f.cutArmed) {
      const cut = this.C(f).phys.jumpVyCut;
      if (!f.up && f.vy > cut) { f.vy = cut; f.cutArmed = false; }
      else if (f.vy <= cut) f.cutArmed = false;
    }
    f.x += f.vx; f.h += f.vy; f.vy -= g;
  }
  air(f, o) {
    this.airPhysics(f);
    if (f.h <= 0) return this.land(f, o, 0);
    const b = this.bestBuffered(f);
    if (b) { const mv = this.pickMove(f, b, true); if (mv && this.startMove(f, mv, true)) f.buf[b] = 0; }
  }
  land(f, o, extraLag) {
    f.h = 0; f.vy = 0; f.vx *= 0.3; f.cutArmed = false;
    this.events.push({ kind: 'land', x: f.x, power: 1 });
    this.setState(f, 'land'); f.t = -extraLag; // extra landing lag after air normals
    this.face(f, o);
  }

  startDash(f) {
    this.setState(f, 'dash'); f.vx = 0;
    this.events.push({ kind: 'dash', x: f.x, dir: f.facing });
  }
  dash(f, o) {
    const P = this.C(f).phys;
    if (f.t > 3 && f.t <= 3 + P.dashFrames) f.vx = f.facing * P.dashV; else f.vx = f.facing * 2;
    f.x += f.vx;
    if (f.t >= (P.dashTotal ?? 25)) { this.setState(f, 'idle'); f.vx = 0; }
  }
  /** back-dash: an airborne hop for characters with `phys.backhopV` (Shinobi), a grounded slide otherwise (Samurai) */
  startHop(f) {
    const P = this.C(f).phys;
    if (P.backhopV === undefined) {
      this.setState(f, 'backdash'); f.vx = 0;
      this.events.push({ kind: 'dash', x: f.x, dir: -f.facing });
      return;
    }
    this.setState(f, 'backhop'); f.vx = -f.facing * P.backhopV; f.vy = P.backhopVy; f.h = 0.01;
    this.events.push({ kind: 'dash', x: f.x, dir: -f.facing });
  }
  backhop(f, o) {
    f.x += f.vx; f.h += f.vy; f.vy -= this.C(f).phys.backhopG;
    if (f.h <= 0) { f.h = 0; f.vy = 0; f.vx = 0; this.events.push({ kind: 'land', x: f.x, power: 0 }); this.setState(f, 'land'); f.t = 1; }
  }
  /** grounded back-dash: 3 load frames, `backdashFrames` sliding at `backdashV`, then braking until `backdashTotal` */
  backdash(f, o) {
    const P = this.C(f).phys;
    if (f.t > 3 && f.t <= 3 + P.backdashFrames) f.vx = -f.facing * P.backdashV;
    else if (f.t <= 3) f.vx = 0;
    else f.vx *= 0.6;
    f.x += f.vx;
    if (f.t >= P.backdashTotal) { this.setState(f, 'idle'); f.vx = 0; this.face(f, o); }
  }

  stunned(f, o) {
    f.x += f.kb; f.kb *= WORLD.kbFriction;
    if (--f.stun <= 0) {
      f.kb = 0;
      const guarding = f.state === 'blockstun' && f.guardBtn;
      this.setState(f, 'idle'); f.crouchGuard = f.crouchGuard && f.down;
      if (guarding) this.enter(f, 'guard');
    }
  }
  knock(f, o) {
    f.x += f.vx; f.h += f.vy; f.vy -= WORLD.gravity;
    if (f.h <= 0 && f.vy < 0) {
      f.h = 0; f.vy = 0; f.vx = 0;
      this.events.push({ kind: 'land', x: f.x, power: 3, down: true });
      this.setState(f, 'down');
    }
  }

  // ------------------------------------------------------------------ projectiles / pushboxes
  moveProjectiles() {
    for (const p of this.projectiles) {
      p.x += p.vx; p.h += p.vy || 0; p.life--;
      if (p.h < 20) { p.life = 0; this.events.push({ kind: 'pland', x: p.x, h: 20, dir: p.dir }); }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0 && p.x > 0 && p.x < WORLD.stageW);
  }

  resolvePush() {
    const [a, b] = this.f;
    const lo = WORLD.stageMargin, hi = WORLD.stageW - WORLD.stageMargin;
    const lying = (f) => f.state === 'knock' || f.state === 'down';
    // wall push-back transfer: a defender pinned in the corner pushes the attacker back
    for (let k = 0; k < 2; k++) {
      const f = k ? b : a, o = k ? a : b;
      if (f.x < lo) { if (f.kb) o.x += SIGN(o.x - f.x) * Math.min(Math.abs(f.kb), lo - f.x); f.x = lo; }
      if (f.x > hi) { if (f.kb) o.x -= SIGN(f.x - o.x) * Math.min(Math.abs(f.kb), f.x - hi); f.x = hi; }
    }
    if (a.h < 120 && b.h < 120 && !lying(a) && !lying(b)) {
      const d = b.x - a.x, min = this.C(a).phys.pushHalf + this.C(b).phys.pushHalf;
      if (Math.abs(d) < min) {
        const dir = d >= 0 ? 1 : -1, push = (min - Math.abs(d)) / 2;
        a.x -= dir * push; b.x += dir * push;
      }
    }
    a.x = Math.max(lo, Math.min(hi, a.x)); b.x = Math.max(lo, Math.min(hi, b.x));
  }

  // ------------------------------------------------------------------ hit detection
  isCrouching(f) {
    return f.state === 'crouch' || ((f.state === 'guard' || f.state === 'blockstun') && f.crouchGuard) ||
      (f.state === 'attack' && !!this.C(f).moves[f.move]?.crouch) || (f.state === 'hitstun' && f.hitCrouch);
  }
  hurtbox(f) {
    if (f.invuln) return null;
    const H = this.C(f).hurt, b = this.isCrouching(f) ? H.crouch : H.stand;
    const x0 = f.facing > 0 ? f.x + b.x0 : f.x - b.x1, x1 = f.facing > 0 ? f.x + b.x1 : f.x - b.x0;
    return { x0, x1, y0: f.h + b.y0, y1: f.h + b.y1 };
  }
  worldBox(f, box) {
    const x0 = f.facing > 0 ? f.x + box.x0 : f.x - box.x1, x1 = f.facing > 0 ? f.x + box.x1 : f.x - box.x0;
    return { x0, x1, y0: f.h + box.y0, y1: f.h + box.y1 };
  }
  attackBox(f) {
    if (f.state !== 'attack') return null;
    const m = this.C(f).moves[f.move];
    if (!m.active || f.hitDone || f.t < m.active[0] || f.t >= m.active[1]) return null;
    return this.worldBox(f, m.box);
  }
  canBlock(d, level) {
    if (d.h > 0) return false;
    if (d.state !== 'guard' && d.state !== 'blockstun') return false;
    return d.crouchGuard ? level !== 'overhead' : level !== 'low';
  }

  detectHits() {
    if (this.f[0].state !== 'attack' && this.f[1].state !== 'attack' && this.projectiles.length === 0) return; // nothing can hit
    const hits = [];
    for (let i = 0; i < 2; i++) {
      const a = this.f[i];
      if (a.state !== 'attack') continue;
      const d = this.f[1 - i], box = this.attackBox(a);
      if (!box) continue;
      const hb = this.hurtbox(d);
      if (!hb) continue;
      const m = this.C(a).moves[a.move];
      if (box.x1 < hb.x0 || box.x0 > hb.x1 || box.y1 < hb.y0 || box.y0 > hb.y1) continue;
      if (m.level === 'high' && this.isCrouching(d)) continue; // ducks under it
      hits.push({ a, d, spec: m, dir: a.facing, level: m.level, cx: (Math.max(box.x0, hb.x0) + Math.min(box.x1, hb.x1)) / 2, ch: (Math.max(box.y0, hb.y0) + Math.min(box.y1, hb.y1)) / 2 });
    }
    for (const p of this.projectiles) {
      const d = this.f[1 - p.owner], hb = this.hurtbox(d);
      if (!hb) continue;
      const s = p.spec;
      if (p.x + s.w / 2 < hb.x0 || p.x - s.w / 2 > hb.x1 || p.h + s.hgt / 2 < hb.y0 || p.h - s.hgt / 2 > hb.y1) continue;
      // a thrown kunai at chest height flies over a crouching target; the ultimate's fan and the low crescent are purely geometric
      if (!p.fan && s.kind !== 'crescent' && this.isCrouching(d)) continue;
      hits.push({ a: this.f[p.owner], d, spec: s, dir: p.dir, level: 'mid', cx: p.x, ch: p.h, proj: p });
    }
    for (const h of hits) this.applyHit(h);
  }

  applyHit({ a, d, spec, dir, level, cx, ch, proj }) {
    if (d.invuln) return;
    if (proj) { this.projectiles = this.projectiles.filter((p) => p !== proj); } else { a.hitDone = true; }
    const blocked = this.canBlock(d, level);
    const power = spec.power || 1;
    a.meter = Math.min(100, a.meter + (spec.meter || 0) * (blocked ? 0.6 : 1));
    if (blocked) {
      let chipDmg = 0;
      if (spec.chip) { // chip damage: a fraction of the damage when <= 1 (Samurai heavy 0.25), else absolute (fan 25, crescent 175). Cannot KO.
        const chip = spec.chip <= 1 ? Math.round(spec.dmg * spec.chip) : spec.chip;
        d.hp = Math.max(1, d.hp - chip); d.lastHit = chip; chipDmg = chip;
      }
      this.setState(d, 'blockstun'); d.stun = spec.blockstun; d.kb = spec.push.block * dir;
      this.hitstop = Math.max(this.hitstop, Math.max(4, spec.hitstop - 2));
      if (!proj) a.contact = true;
      this.events.push({ kind: 'block', x: cx, h: ch, dir, power, def: d.id, chip: chipDmg });
      return;
    }
    const counter = d.state === 'attack';
    d.combo++;
    const scale = spec.noScale ? 1 : Math.max(0.3, 1 - 0.12 * (d.combo - 1));
    const dmg = Math.max(1, Math.round(spec.dmg * scale * (counter ? 1.25 : 1)));
    d.hp = Math.max(0, d.hp - dmg); d.comboDmg += dmg; d.lastHit = dmg; d.counter = counter;
    this.lastHit = { by: a.id, dmg, counter, move: proj ? (proj.fan || proj.spec.kind === 'crescent' ? 'ult' : 'throw') : a.move, frame: this.frame };
    const ko = d.hp <= 0;
    d.hitCrouch = this.isCrouching(d);
    if (ko) d.ko = true;
    if (spec.knockdown || d.h > 0 || ko || d.state === 'knock') {
      const L = spec.launch || { vx: 6, vy: 9 };
      this.setState(d, 'knock'); d.vx = L.vx * dir; d.vy = ko ? L.vy + 4 : L.vy; d.h = Math.max(d.h, 0.01); d.kb = 0;
    } else {
      this.setState(d, 'hitstun'); d.stun = spec.hitstun + (counter ? 4 : 0); d.kb = spec.push.hit * dir;
    }
    this.hitstop = Math.max(this.hitstop, spec.hitstop + (counter ? 3 : 0) + (ko ? 14 : 0));
    if (!proj) a.contact = true;
    this.events.push({ kind: 'hit', x: cx, h: ch, dir, power: power + (counter ? 1 : 0), counter, ko, dmg, target: d.id, move: this.lastHit.move });
  }

  trackCombo(f) {
    const inCombo = f.state === 'hitstun' || f.state === 'knock' || f.state === 'down' || f.state === 'wake';
    if (!inCombo && f.combo > 0) {
      if (f.combo > 1) this.comboShow[1 - f.id] = { hits: f.combo, dmg: f.comboDmg, t: 140 };
      else this.comboShow[1 - f.id] = { hits: f.combo, dmg: f.comboDmg, t: 90 };
      f.combo = 0; f.comboDmg = 0;
    }
  }
}

// ------------------------------------------------------------------ hashing helpers (module-level for speed)
const HASH_FIGHTER = ['x', 'h', 'vx', 'vy', 'facing', 'state', 't', 'hp', 'meter', 'flash', 'move', 'hitDone', 'contact', 'chainCount',
  'kb', 'stun', 'crouchGuard', 'hitCrouch', 'invuln', 'walkDist', 'runDist', 'kunaiCd', 'ko', 'airUsed', 'cutArmed', 'runJump',
  'combo', 'comboDmg', 'lastHit', 'counter', 'prev', 'fwd', 'back', 'up', 'down', 'guardBtn', 'tapF', 'tapB', 'evRun', 'evHop'];
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
let _h = 0;
function hu(v) {
  _h ^= v & 0xff; _h = Math.imul(_h, 0x01000193);
  _h ^= (v >>> 8) & 0xff; _h = Math.imul(_h, 0x01000193);
  _h ^= (v >>> 16) & 0xff; _h = Math.imul(_h, 0x01000193);
  _h ^= v >>> 24; _h = Math.imul(_h, 0x01000193);
}
function hv(v) {
  switch (typeof v) {
    case 'number': F64[0] = v; hu(U32[0]); hu(U32[1]); return;
    case 'boolean': hu(v ? 0xb1 : 0xb0); return;
    case 'string': hu(0xc0 + v.length); for (let i = 0; i < v.length; i++) hu(v.charCodeAt(i)); return;
    default: hu(v === null ? 0xa2 : 0xa1);
  }
}
