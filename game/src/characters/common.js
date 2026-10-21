// World constants shared by every character (the stage, gravity, input timing, HP).
// Per-character physics (walk / dash / back-dash speeds, pushbox) lives in each character's `phys`, merged over these.
export const WORLD = {
  gravity: 1.7,
  groundFriction: 0.8, kbFriction: 0.84,
  stageW: 5200, stageMargin: 260,
  hp: 1000,
  doubleTapWindow: 16, inputBuffer: 6,
  prejump: 3, landLag: 4,
  // defensive meter (comeback): the fighter on the receiving end also builds the ultimate bar.
  //   taking a hit: perHp * damage taken (light 90 -> ~6, cleave 210 -> ~15, the ultimate cinematic 472 -> ~33)
  //   blocking: block + chipFrac * chip taken (a blocked cleave, chip 42 -> ~10; a blocked light -> 2)
  defMeter: { perHp: 0.07, block: 2, chipFrac: 0.2 },
  // guard gauge (KOF / SF style guard crush): every BLOCKED hit adds perDmg * its damage; at max the guard breaks (the
  // defender is stunned breakStun frames, gauge reset). It drains at `regen` per frame once `delay` frames pass without a block.
  guard: { perDmg: 0.2, max: 100, delay: 60, regen: 0.5, breakStun: 56 },
};
