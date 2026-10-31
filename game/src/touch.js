// Touch controls (mobile): a DOM overlay — D-pad left, button cluster right — that feeds the exact BTN bitmask the
// sim consumes, so touch and keyboard share one input path. Only mounted on touch-capable devices (or `?touch=1` to
// preview it on a PC); the keyboard is untouched and both can be active at once. The cluster adapts per character:
// the samurai gets no KUNAI and no jump/crouch (his inputMask drops U/D/T), the special is REPEL (samurai) /
// KAWARIMI (shinobi) and the attack buttons carry the real move names (STAB / THRUST / CLEAVE). Both glow once P1's
// meter covers their cost. Buttons can be dragged anywhere on screen from OPTIONS ("MOVE BUTTONS" → drag → DONE).
// OPTIONS also carries an HP SETTER (1000 / 2000 / 5000) on every device, not just phones. Presses buzz the phone (where the
// browser supports navigator.vibrate). Two quick forward taps on the pad are two discrete L presses, so the sim's
// double-tap run logic works exactly like on the keyboard.
import { BTN } from './characters/buttons.js';
import { getChar } from './characters/index.js';

let inst = null;
/** kept for the HUD letterbox math; touch mode overlays the game, so it reserves nothing */
export function touchStrip() { return inst ? inst.strips() : [0, 0]; }
/** the menu reads this for its touch-only OPTIONS rows (independent of the main loop's copy) */
export function touchInst() { return inst; }

const STORE = 'algo-fighter-touch';
const DRAGGABLE = ['tcL', 'tcR', 'tcTop']; // D-pad, buttons, and the ☰ / ⛶ / AI chip row (MOVE BUTTONS in OPTIONS)
const HP_TIERS = [1, 2, 5]; // 1000 / 2000 / 5000
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const save = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* storage unavailable */ } };

// The HP setter belongs to OPTIONS on every device (PC and phone), so its state lives outside the touch overlay.
// (Same storage key as before, so an HP value already chosen on a phone carries over.)
const storedHp = Number(load().hpMult);
let hpMult = HP_TIERS.includes(storedHp) ? storedHp : 1;
/** OPTIONS HP setter value: 1 = stock 1000, 2 = 2000, 5 = 5000; the next new game picks it up */
export function getHpMult() { return hpMult; }
export function setHpMult(mult) {
  hpMult = HP_TIERS.includes(mult) ? mult : 1;
  save({ ...load(), hpMult });
}

export class TouchControls {
  constructor() {
    this.enabled = new URLSearchParams(location.search).get('touch') === '1'
      || ((navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && matchMedia('(pointer: coarse)').matches);
    this.bits = 0;
    this.counts = new Map(); // BTN bit -> active pointer count (buttons + pad)
    this.padPts = new Map(); // pointerId -> Map(BTN bit -> true) pressed on the pad this moment
    this.padPrev = new Set(); // last direction set, so sliding across the pad only buzzes on a change
    this.visible = false;
    this.paused = false;
    this.char = null; this.specialCost = 25; this.ultCost = 100; this.spRdy = false; this.ultRdy = false;
    this.edit = false;
    const s = load();
    this.drag = (s.drag && typeof s.drag === 'object') ? { tcTop: null, ...s.drag } : { tcL: null, tcR: null, tcTop: null }; // { side: { xPct, yPct } } in viewport units
    if (!this.enabled) return;
    inst = this;
    document.body.classList.add('touchDevice'); // menu copy / tap-target CSS
    this.ui = document.getElementById('touchUI');
    this.pad = document.getElementById('tpad');
    this.padHl = [...this.pad.querySelectorAll('[data-b]')];
    this.sp = document.getElementById('tSpecial');
    this.ult = this.ui.querySelector('.t-ult');
    addEventListener('resize', () => this.fit());
    addEventListener('blur', () => this.clearBits());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearBits(); });
    addEventListener('contextmenu', (e) => { if (e.target.closest('#touchUI')) e.preventDefault(); });
    this.wireButtons();
    this.wirePad();
    const menuBtn = document.getElementById('touchMenuBtn');
    menuBtn?.addEventListener('click', (e) => { e.preventDefault(); if (this.edit) return; this.haptic(12); this.onPause?.(); });
    const ai = document.getElementById('touchAI'); // show / hide the AI thinking overlay mid-match
    ai?.addEventListener('click', (e) => { e.preventDefault(); if (this.edit) return; this.haptic(10); this.onToggleAI?.(); });
    const fs = document.getElementById('touchFS');
    if (fs && !document.documentElement.requestFullscreen) fs.style.display = 'none'; // iPhone Safari has no element fullscreen: no dead button
    if (fs) fs.addEventListener('click', (e) => { e.preventDefault(); if (this.edit) return; this.haptic(10); this.toggleFullscreen(); });
    const done = document.getElementById('touchDone');
    done?.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.haptic(14); this.endEdit(true); });
    const reset = document.getElementById('touchReset');
    reset?.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.haptic(18); this.resetDrag(); });
    // browsers require a user gesture for fullscreen: silently grab it on the first tap (title screen)
    document.addEventListener('pointerdown', () => {
      if (this.fsTried) return; this.fsTried = true;
      this.enterFullscreen();
    }, { once: true });
    // the game is landscape-only: report portrait so the main loop can hold the fight
    this.mqPortrait = matchMedia('(orientation: portrait)');
    this.mqPortrait.addEventListener?.('change', () => this.syncOrientation());
    this.fit();
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else this.enterFullscreen();
  }
  /** fullscreen + landscape lock (Android Chrome honours the lock only in fullscreen; elsewhere it quietly fails) */
  enterFullscreen() {
    const p = document.documentElement.requestFullscreen?.();
    p?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch?.(() => {});
  }

  /** short buzz on press; silently ignored where the browser has no vibration API (iOS Safari) */
  haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch { /* unsupported / blocked */ } }

  /** pointer capture can throw (stale pointer id / odd browser): a button press must never be lost to it */
  capture(el, id) { try { el.setPointerCapture(id); } catch { /* the press still works without capture */ } }

  /** the canvas is the same size as the viewport: the clusters overlay its bottom corners semi-transparently */
  strips() { return [0, 0]; }
  /** px size the widest cluster wants (buttons are --tu-scaled off it) */
  clusterSize() { return Math.max(112, Math.min(innerWidth * 0.185, 200)) * this.editScale(); }

  fit() {
    if (!this.enabled || !this.ui) return;
    const s = this.clusterSize();
    this.ui.style.setProperty('--tw', `${s}px`);
    this.ui.style.setProperty('--tu', `${Math.max(0.62, Math.min(s / 152, 1.4))}`);
    this.applyDrag();
  }

  /** (1.12x bigger default: the first user report was "small D-pad, hard to reach") */
  editScale() { return 1.12; }

  applyDrag() {
    for (const side of DRAGGABLE) {
      const el = document.getElementById(side);
      const d = this.drag?.[side];
      if (side === 'tcTop') { // the chip row is not a full-height strip: only its corner moves
        el.style.left = d ? `${d.x}vw` : ''; el.style.top = d ? `${d.y}vh` : ''; el.style.bottom = d ? 'auto' : ''; continue;
      }
      if (d) { el.style.left = `${d.x}vw`; el.style.top = `${d.y}vh`; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.height = 'auto'; } // collapse: buttons move with the drag
      else { el.style.left = ''; el.style.top = ''; el.style.right = side === 'tcR' ? '0' : ''; el.style.bottom = ''; el.style.height = ''; }
    }
  }

  /** release every held button (pause, tab switch, editor) so nothing sticks down */
  clearBits() {
    this.counts.clear(); this.padPts.clear(); this.padPrev.clear(); this.bits = 0; this.spRdy = this.ultRdy = false;
    for (const el of this.ui?.querySelectorAll('.on') || []) el.classList.remove('on');
  }

  /** OPTIONS hook: enter the drag-editor. The overlay is shown over the menu so the player can actually see it. */
  beginEdit() {
    if (!this.enabled) return;
    this.edit = true;
    this.paused = false;
    this.clearBits();
    this.ui.classList.remove('noctl', 'paused');
    this.ui.classList.add('edit');
    document.body.classList.add('touchOn');
    this.fit();
  }

  /** OPTIONS hook: leave the drag-editor; positions are already saved after every drag. notify = refresh the menu. */
  endEdit(notify = false) {
    if (!this.edit) return;
    this.edit = false;
    save({ hpMult, drag: this.drag });
    this.ui.classList.remove('edit');
    this.ui.classList.toggle('noctl', !this.visible);
    document.body.classList.toggle('touchOn', this.visible);
    this.applyDrag();
    if (notify) this.onEditEnd?.();
  }

  /** OPTIONS editor: put both clusters back in their corners */
  resetDrag() {
    this.drag = { tcL: null, tcR: null, tcTop: null };
    save({ hpMult, drag: this.drag });
    for (const side of DRAGGABLE) { const el = document.getElementById(side); if (el) el.style.paddingBottom = ''; }
    this.applyDrag();
    this.fit();
  }

  /** OPTIONS hook: HP setter tier (kept for the touch overlay; OPTIONS itself uses setHpMult) */
  setHp(mult) { setHpMult(mult); }

  /** called when a game starts / ends: the overlay is shown only in modes where the human is P1 */
  setVisible(on) {
    if (!this.enabled) return;
    if (on && this.edit) this.endEdit(false); // never enter a fight in edit mode: buttons must be live
    this.visible = on;
    if (!on) this.clearBits();
    this.ui.classList.toggle('noctl', !on);
    document.body.classList.toggle('touchOn', on); // gates the rotate overlay + hides PC-only HUD chrome
    this.applyDrag();
    if (on) this.fit();
  }

  /** any game running (also CPU vs CPU / replays, which have no player controls): the chip row stays reachable;
   *  hasAI shows the AI chip, aiOn its state */
  setGameActive(on, hasAI = false, aiOn = true) {
    if (!this.enabled) return;
    this.ui.classList.toggle('ingame', !!on);
    this.ui.classList.toggle('hasai', !!on && hasAI);
    this.setAI(aiOn);
  }
  setAI(on) { document.getElementById('touchAI')?.classList.toggle('off', !on); }

  /** VS screen / pause menu / result screen: keep the controls on screen but out of the way */
  setPaused(on) {
    if (!this.enabled) return;
    this.paused = !!on;
    if (on) this.clearBits();
    this.ui.classList.toggle('paused', this.paused);
  }

  /** tell the main loop whether the phone is being held upright (the rotate gate is covering the game) */
  syncOrientation() { this.onRotate?.(!!this.visible && !!this.mqPortrait?.matches); }

  /** per-character layout + labels (called on every new game with the P1 character id) */
  setCharacter(id) {
    if (!this.enabled || !this.ui) return;
    const c = getChar(id);
    this.char = c;
    this.ui.classList.toggle('s-samurai', c.id === 'samurai');
    this.specialCost = c.moves.repel?.cost ?? c.moves.kawarimi?.cost ?? 25;
    this.ultCost = c.moves.ult?.cost ?? 100;
    this.sp.textContent = c.id === 'samurai' ? 'REPEL' : 'KAWARIMI';
    const cap = this.ui.querySelector('.tcap');
    if (cap) cap.innerHTML = c.id === 'samurai' ? 'WALK' : 'JUMP · WALK · CROUCH<br><span>double-tap ▶ = run</span>';
    // per-character real move names (user report: "kick" does a thrust for the samurai; shinobi's light is a stab)
    const label = { P: null, K: null, S: null };
    if (c.id === 'samurai') { label.P = 'CUT'; label.K = 'THRUST'; label.S = 'CLEAVE'; }
    else { label.P = 'STAB'; label.K = 'KICK'; label.S = 'SLASH'; }
    for (const [b, t] of Object.entries(label)) {
      const el = this.ui.querySelector(`.tb[data-b="${b}"]`);
      if (el) el.firstChild.textContent = t;
    }
  }

  /** once per frame: the special + ult buttons glow while the meter can pay for them */
  tick(sim) {
    if (!this.enabled || !this.visible || !sim) return;
    const meter = sim.f[0].meter;
    const ready = meter >= this.specialCost;
    if (ready !== this.spRdy) { this.spRdy = ready; this.sp.classList.toggle('rdy', ready); }
    const ultReady = meter >= this.ultCost;
    if (ultReady !== this.ultRdy) { this.ultRdy = ultReady; this.ult.classList.toggle('rdy', ultReady); }
  }

  // ------------------------------------------------------------------ bit accounting
  setBit(bit, on, src = bit) {
    const n = (this.counts.get(src) || 0) + (on ? 1 : -1);
    if (n <= 0) this.counts.delete(src); else this.counts.set(src, n);
    let b = 0;
    for (const k of this.counts.keys()) b |= k;
    this.bits = b;
  }

  /** buttons: press-and-hold, multi-touch safe via per-pointer capture; draggable in edit mode */
  wireButtons() {
    // the special button: tap = press BLOCK+SWORD on the exact same frame, the edge the kawarimi/repel check looks for
    const sp = this.sp, spBit = BTN.B | BTN.P;
    sp.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.edit) return;
      this.capture(sp, e.pointerId);
      sp.classList.add('on');
      this.haptic(14);
      this.setBit(spBit, true); // guard + light: identical bits to holding Space then tapping J on the keyboard
    });
    const spUp = () => { if (this.edit) return; sp.classList.remove('on'); this.setBit(spBit, false); };
    sp.addEventListener('pointerup', spUp);
    sp.addEventListener('pointercancel', spUp);
    for (const el of this.ui.querySelectorAll('.tb[data-b]')) {
      const bit = BTN[el.dataset.b];
      const heavy = el.dataset.b === 'ULT';
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (this.edit) return;
        this.capture(el, e.pointerId); // a finger that slides a little keeps the button held
        el.classList.add('on');
        this.haptic(heavy ? 16 : 9);
        this.setBit(bit, true);
      });
      const up = () => {
        if (this.edit) return;
        el.classList.remove('on');
        this.setBit(bit, false);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
    this.wireDrag();
  }

  /** edit mode: drag either side cluster anywhere on screen; positions persist in viewport units */
  wireDrag() {
    const mk = (side) => {
      const el = document.getElementById(side);
      el.addEventListener('pointerdown', (e) => {
        if (!this.edit) return;
        e.preventDefault(); e.stopPropagation();
        if (side !== 'tcTop') { el.style.height = 'auto'; el.style.paddingBottom = '8px'; } // collapse the strip so it moves as one hand-sized handle
        const r = el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
        try { el.setPointerCapture(e.pointerId); } catch { /* mouse without capture still works inside the box */ }
        this.haptic(10);
        const mv = (ev) => {
          const x = Math.max(0, Math.min(100 - (r.width / innerWidth) * 100, ((ev.clientX - sx) / innerWidth) * 100));
          const y = Math.max(0, Math.min(100 - (r.height / innerHeight) * 100, ((ev.clientY - sy) / innerHeight) * 100));
          this.drag[side] = { x, y };
          el.style.top = `${y}vh`; el.style.left = `${x}vw`; el.style.right = el.style.bottom = 'auto';
        };
        const done = () => {
          el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', done); el.removeEventListener('pointercancel', done);
          save({ hpMult, drag: this.drag });
        };
        el.addEventListener('pointermove', mv);
        el.addEventListener('pointerup', done);
        el.addEventListener('pointercancel', done);
      });
    };
    DRAGGABLE.forEach(mk);
  }

  /** the D-pad is one hit area: press anywhere and slide between directions, diagonals included */
  wirePad() {
    const rect = () => this.pad.getBoundingClientRect();
    const dirBits = (x, y) => {
      const r = rect(), ux = (x - (r.left + r.width / 2)) / (r.width / 2), uy = (y - (r.top + r.height / 2)) / (r.height / 2);
      const bits = new Map();
      if (ux < -0.45) bits.set(BTN.L, true); else if (ux > 0.45) bits.set(BTN.R, true);
      if (uy < -0.45) bits.set(BTN.U, true); else if (uy > 0.45) bits.set(BTN.D, true);
      return bits;
    };
    const apply = () => {
      // recompute the pad's contribution: clear its source slots, then set whatever is touched now
      for (const b of [BTN.L, BTN.R, BTN.U, BTN.D]) this.setBit(b, false, b);
      const cur = new Set();
      for (const m of this.padPts.values()) for (const b of m.keys()) cur.add(b);
      for (const b of cur) this.setBit(b, true, b); // (two fingers on the same direction still count once)
      for (const el of this.padHl) el.classList.toggle('on', cur.has(BTN[el.dataset.b]));
      // a little tick whenever the slide reaches a new direction (not on every move event)
      if (cur.size && [...cur].some((b) => !this.padPrev.has(b))) this.haptic(6);
      this.padPrev = cur;
    };
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.edit) return;
      this.capture(this.pad, e.pointerId);
      this.haptic(8);
      this.padPts.set(e.pointerId, dirBits(e.clientX, e.clientY)); apply();
    };
    const move = (e) => { if (this.padPts.has(e.pointerId)) { e.preventDefault(); this.padPts.set(e.pointerId, dirBits(e.clientX, e.clientY)); apply(); } };
    const up = (e) => { if (this.padPts.delete(e.pointerId)) { e.preventDefault(); apply(); } };
    this.pad.addEventListener('pointerdown', down);
    this.pad.addEventListener('pointermove', move);
    this.pad.addEventListener('pointerup', up);
    this.pad.addEventListener('pointercancel', up);
  }
}
