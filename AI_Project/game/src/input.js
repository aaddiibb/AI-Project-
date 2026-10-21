// Keyboard -> input bitmask (the same BTN bits the simulator consumes). Layout-independent (uses KeyboardEvent.code).
import { BTN } from './sim.js';

export const KEYMAP = {
  KeyA: BTN.L, ArrowLeft: BTN.L, KeyD: BTN.R, ArrowRight: BTN.R,
  KeyW: BTN.U, ArrowUp: BTN.U, KeyS: BTN.D, ArrowDown: BTN.D,
  KeyJ: BTN.P, KeyK: BTN.K, KeyL: BTN.S, KeyI: BTN.T, KeyU: BTN.ULT,
  Space: BTN.B, KeyO: BTN.B, ShiftLeft: BTN.DASH, ShiftRight: BTN.DASH,
};

export class Keyboard {
  constructor() {
    this.bits = 0;
    this.down = new Set();
    this.onHotkey = null;
    addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (KEYMAP[e.code] !== undefined) { e.preventDefault(); this.down.add(e.code); this.recalc(); return; }
      if (!e.repeat && this.onHotkey) this.onHotkey(e);
    });
    addEventListener('keyup', (e) => { if (this.down.delete(e.code)) this.recalc(); });
    addEventListener('blur', () => { this.down.clear(); this.bits = 0; });
  }
  recalc() { let b = 0; for (const c of this.down) b |= KEYMAP[c]; this.bits = b; }
}
