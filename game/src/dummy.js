// Training-dummy input generators. Each returns a BTN bitmask for the dummy fighter on a given frame.
// Later, AI agents (Minimax / MCTS / Fuzzy) plug in here with the same signature: (sim, frame) -> bits.
import { BTN } from './sim.js';

export const DUMMY_MODES = [
  { id: 'stand', label: 'Stand still' },
  { id: 'crouch', label: 'Crouch' },
  { id: 'guard', label: 'Block standing' },
  { id: 'cguard', label: 'Block crouching' },
  { id: 'jump', label: 'Jump repeatedly' },
  { id: 'poke', label: 'Attack (light sword/kick/slash/kunai)' },
];

export function dummyInput(mode, sim, frame) {
  const d = sim.f[1];
  switch (mode) {
    case 'crouch': return BTN.D;
    case 'guard': return BTN.B;
    case 'cguard': return BTN.B | BTN.D;
    case 'jump': return frame % 90 < 3 ? BTN.U : 0;
    case 'poke': {
      // fixed pattern, once every ~1.4 s; stays in place
      const step = Math.floor(frame / 85) % 4, k = frame % 85;
      if (k > 2) return 0;
      return [BTN.P, BTN.K, BTN.S, BTN.T][step];
    }
    default: return d.state === 'idle' || d.state === 'hitstun' ? 0 : 0;
  }
}
