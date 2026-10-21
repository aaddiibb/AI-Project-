// The music, as data (prompt 06). PURE. D miyako-bushi (D Eb G A Bb), 80 BPM, 16 steps per bar.
//
// Battle: 48 bars (2 min 24 s), loops seamlessly. Three stems, faded in by fight tension (cues.js tension()):
//   base  koto ostinato + downbeat taiko (always on in a fight; the drone pad sits under it)
//   perc  shime 8ths + a don/ka groove, fills every 8 bars, o-daiko on section starts
//   high  shakuhachi phrases and koto melody (only when the fight is close / tense)
// Menu: an 8-bar ambience (wind + drone pads, sparse koto and shakuhachi), stem 'menu'.
// An event: { step, inst, note?, vel, stem, dur? (steps) }.
export const BPM = 80, STEPS = 16, BATTLE_BARS = 48, MENU_BARS = 8;
export const STEP_SEC = 60 / BPM / 4;

const OST = [['D3', 'A3', 'D4', 'A3', 'Eb4', 'A3'], ['D3', 'A3', 'Bb3', 'A3', 'G3', 'A3'], ['G3', 'D4', 'Eb4', 'D4', 'Bb3', 'A3'], ['D3', 'A3', 'D4', 'Eb4', 'D4', 'A3']];
const OST_STEPS = [0, 3, 6, 8, 11, 14];
// shakuhachi phrases: [barOffset, step, note, durSteps]
const SHAKU = {
  a: [[0, 0, 'A4', 12], [0, 12, 'G4', 4], [1, 0, 'A4', 6], [1, 6, 'Bb4', 2], [1, 8, 'A4', 8], [2, 0, 'D5', 12], [3, 0, 'Eb5', 4], [3, 4, 'D5', 4], [3, 8, 'Bb4', 8]],
  b: [[0, 0, 'D5', 8], [0, 8, 'Eb5', 8], [1, 0, 'D5', 12], [1, 12, 'Bb4', 4], [2, 0, 'A4', 8], [2, 8, 'G4', 8], [3, 0, 'A4', 12]],
  c: [[0, 0, 'G4', 6], [0, 6, 'A4', 10], [1, 0, 'Bb4', 6], [1, 6, 'A4', 6], [1, 12, 'G4', 4], [2, 0, 'Eb4', 8], [2, 8, 'D4', 8], [3, 0, 'D4', 12]],
};
// koto melodic cells (16th-note positions)
const KOTO_RUN = [[0, 'D5'], [2, 'Bb4'], [3, 'A4'], [6, 'G4'], [8, 'A4'], [10, 'Bb4'], [11, 'A4'], [14, 'Eb4']];
const KOTO_RUN2 = [[0, 'A4'], [3, 'G4'], [4, 'Eb4'], [6, 'D4'], [8, 'Eb4'], [10, 'G4'], [12, 'A4'], [14, 'Bb4']];

function battleBar(b) {
  const ev = [], add = (step, inst, vel, stem, note, dur) => ev.push({ step, inst, vel, stem, note, dur });
  const sec = b < 8 ? 'A1' : b < 16 ? 'A2' : b < 32 ? 'B' : b < 44 ? 'C' : 'D';
  const fill = b % 8 === 7;
  // base: koto ostinato + downbeat
  const ost = OST[Math.floor(b / 4) % 4];
  OST_STEPS.forEach((s, k) => add(s, 'koto', k === 0 ? 0.8 : 0.55, 'base', ost[k]));
  add(0, 'don', sec === 'D' ? 0.6 : 0.85, 'base');
  if (b % 2 === 1) add(10, 'don', 0.5, 'base');
  // perc
  if (sec !== 'D' || b === 47) {
    for (let s = 0; s < 16; s += 2) add(s, 'shime', s % 8 === 0 ? 0.75 : s % 4 === 0 ? 0.55 : 0.35, 'perc');
    if (fill) [0, 4, 8, 10, 12, 13, 14, 15].forEach((s, k) => add(s, 'don', 0.45 + 0.07 * k, 'perc'));
    else {
      [6, 8, 12].forEach((s) => add(s, 'don', sec === 'A1' ? 0.4 : 0.6, 'perc'));
      [4, 14].forEach((s) => add(s, 'ka', 0.6, 'perc'));
      if (sec === 'C') [3, 11].forEach((s) => add(s, 'ka', 0.45, 'perc'));
    }
    if (b === 16 || b === 32 || b === 0) add(0, 'odaiko', 0.9, 'perc');
    if (sec === 'C' && b % 4 === 0) add(0, 'odaiko', 0.7, 'perc');
  }
  // high
  const phrase = (name, start) => { for (const [o, s, n, d] of SHAKU[name]) if (b === start + o) add(s, 'shaku', 0.8, 'high', n, d); };
  phrase('a', 8); phrase('b', 12); phrase('a', 16); phrase('c', 24); phrase('b', 36); phrase('c', 40);
  if ((b >= 20 && b < 24) || (b >= 28 && b < 32)) for (const [s, n] of (b % 2 ? KOTO_RUN2 : KOTO_RUN)) add(s, 'koto', 0.6, 'high', n);
  if (b >= 32 && b < 36) for (const [s, n] of (b % 2 ? KOTO_RUN : KOTO_RUN2)) add(s, 'koto', 0.65, 'high', n);
  return ev;
}

const MENU = [
  [[0, 'koto', 'D4'], [6, 'koto', 'A3'], [10, 'koto', 'Bb3']],
  [[0, 'koto', 'G3'], [8, 'koto', 'A3']],
  [[0, 'shaku', 'A4', 12]],
  [[0, 'koto', 'D3'], [12, 'koto', 'Eb4']],
  [[0, 'koto', 'D4'], [3, 'koto', 'Eb4'], [6, 'koto', 'D4'], [10, 'koto', 'A3']],
  [[4, 'koto', 'G3']],
  [[0, 'shaku', 'D5', 10], [10, 'shaku', 'Bb4', 6]],
  [[0, 'koto', 'A2'], [8, 'koto', 'D3']],
];
const menuBar = (b) => MENU[b].map(([step, inst, note, dur]) => ({ step, inst, note, dur, vel: inst === 'shaku' ? 0.55 : 0.5, stem: 'menu' }));

export const BATTLE = Array.from({ length: BATTLE_BARS }, (_, b) => battleBar(b));
export const MENU_SCORE = Array.from({ length: MENU_BARS }, (_, b) => menuBar(b));

/** stem gains from tension (0..1) */
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const stemGains = (T) => ({ base: 1, perc: smooth(0.15, 0.55, T), high: smooth(0.45, 0.85, T) });
