// Samurai (the Minimax fighter): re-exports the art package's data module (art/samurai/samurai.moves.js, contract §1.4)
// and adds what the engine needs on top of it: merged physics, input mask, button -> move map.
// Nothing here changes his frame data, boxes or damage: those stay owned by the art pipeline (`npm run all`).
import { SAMURAI as DATA } from '../../../art/samurai/samurai.moves.js';
import { WORLD } from './common.js';
import { BTN, BTN_ALL } from './buttons.js';

export const SAMURAI = {
  ...DATA,
  can: { ...DATA.can, hop: false },                                  // no jump / crouch / run; the back-dash is a grounded slide
  // the sim drops these bits for him before edge detection: W (jump), S (crouch), I (kunai throw)
  inputMask: BTN_ALL & ~(BTN.U | BTN.D | BTN.T),
  phys: { ...WORLD, ...DATA.phys },
  hurt: { stand: DATA.hurt.stand, crouch: DATA.hurt.stand },          // he cannot crouch
  /** J -> iai cut (light), K -> stepping thrust, L -> overhead cleave (heavy); the ultimate (U) is always moves.ult */
  pickMove: (btn, { air }) => (air ? null : btn === 'P' ? 'light' : btn === 'K' ? 'thrust' : btn === 'S' ? 'heavy' : null),
  projectilePart: null,
};
