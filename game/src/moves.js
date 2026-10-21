// Thin re-export of the Shinobi's data (moved to characters/shinobi.js by the character registry refactor), so older
// imports (`import { MOVES, PHYS } from './moves.js'`, tools/seq_render.mjs) keep working unchanged.
export { PHYS, HURT, MOVES, ANIMS, frameAt, WALK_STEPS, WALK_POSES, RUN_POSES, RUN_STRIDE } from './characters/shinobi.js';
