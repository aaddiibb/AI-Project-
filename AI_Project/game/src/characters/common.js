// World constants shared by every character (the stage, gravity, input timing, HP).
// Per-character physics (walk / dash / back-dash speeds, pushbox) lives in each character's `phys`, merged over these.
export const WORLD = {
  gravity: 1.7,
  groundFriction: 0.8, kbFriction: 0.84,
  stageW: 5200, stageMargin: 260,
  hp: 1000,
  doubleTapWindow: 16, inputBuffer: 6,
  prejump: 3, landLag: 4,
};
