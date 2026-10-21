// Character registry (prompt 05 §4.1, contract 04 §2.1). Every character object has the same shape:
// { id, name, rig, rigP2, poseFiles, can, inputMask, phys, hurt, moves, anims, walk, run?, pickMove(btn, {air, down}) }
import { SHINOBI } from './shinobi.js';
import { SAMURAI } from './samurai.js';

export const CHARACTERS = { shinobi: SHINOBI, samurai: SAMURAI };
export function getChar(c) {
  if (c && typeof c === 'object') return c;
  const ch = CHARACTERS[c];
  if (!ch) throw new Error(`unknown character "${c}" (have: ${Object.keys(CHARACTERS).join(', ')})`);
  return ch;
}
