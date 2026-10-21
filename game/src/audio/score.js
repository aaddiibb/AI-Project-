// The music, as data (prompt 06). PURE. D miyako-bushi (D Eb G A Bb), 80 BPM, 16 steps per bar.
//
// Battle: 48 bars (2 min 24 s), loops seamlessly. Three stems, faded in by fight tension (cues.js tension()):
//   base  koto ostinato + downbeat taiko (always on in a fight; the drone pad sits under it)
//   perc  shime 8ths + a don/ka groove, fills every 8 bars, o-daiko on section starts
//   high  shakuhachi phrases and koto melody (only when the fight is close / tense)
// Title theme ("menu", 72 BPM, 16 bars): koto arpeggios under a shakuhachi melody, taiko only at the phrase turns; stem 'menu'.
// Select theme ("select", 116 BPM, 16 bars): shamisen riff, shime 8ths and syncopated don, a shakuhachi hook; stem 'select'.
// An event: { step, inst, note?, vel, stem, dur? (steps) }. Every score has its own step length (BPM).
export const BPM = 80, STEPS = 16, BATTLE_BARS = 48, MENU_BARS = 16, SELECT_BARS = 16;
export const STEP_SEC = 60 / BPM / 4, MENU_STEP = 60 / 72 / 4, SELECT_STEP = 60 / 116 / 4;

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

// ---- title theme
const ARP = { // 8th-note arpeggio cells per harmony
  D: ['D3', 'A3', 'D4', 'Eb4', 'D4', 'A3', 'G3', 'A3'], G: ['G3', 'D4', 'G4', 'A4', 'G4', 'D4', 'Bb3', 'D4'],
  Bb: ['Bb3', 'D4', 'G4', 'Bb4', 'G4', 'D4', 'A3', 'D4'], A: ['A2', 'Eb3', 'A3', 'Bb3', 'A3', 'Eb3', 'D3', 'Eb3'],
};
const TITLE_HARM = ['D', 'D', 'D', 'G', 'Bb', 'G', 'A', 'D', 'D', 'G', 'G', 'Bb', 'D', 'Bb', 'A', 'D'];
const TITLE_MEL = [ // [step, note, dur] per bar
  [], [], [[0, 'A4', 8], [8, 'Bb4', 4], [12, 'A4', 4]], [[0, 'G4', 6], [6, 'A4', 10]],
  [[0, 'D5', 12], [12, 'Eb5', 4]], [[0, 'D5', 8], [8, 'Bb4', 8]], [[0, 'A4', 16]], [],
  [[0, 'D5', 6], [6, 'Eb5', 2], [8, 'D5', 8]], [[0, 'Bb4', 6], [6, 'A4', 10]], [[0, 'G4', 8], [8, 'A4', 8]], [[0, 'Bb4', 12], [12, 'A4', 4]],
  [[0, 'D5', 8], [8, 'Eb5', 8]], [[0, 'D5', 12], [12, 'Bb4', 4]], [[0, 'A4', 8], [8, 'G4', 4], [12, 'Eb4', 4]], [[0, 'D4', 16]],
];
function titleBar(b) {
  const ev = [], add = (step, inst, vel, note, dur) => ev.push({ step, inst, vel, stem: 'menu', note, dur });
  const arp = ARP[TITLE_HARM[b]], full = b >= 8;
  for (let k = 0; k < 8; k++) if (full || k % 2 === 0) add(k * 2, 'koto', (k === 0 ? 0.55 : 0.38) * (full ? 1 : 0.9), arp[k]);
  for (const [st, n, d] of TITLE_MEL[b]) add(st, 'shaku', 0.62, n, d);
  if (full) { add(0, 'don', b === 8 ? 0.2 : 0.42); add(8, 'shime', 0.22); }
  if (b === 8 || b === 0) add(0, 'odaiko', b === 8 ? 0.6 : 0.35);
  if (b === 7 || b === 15) [8, 12, 14].forEach((st, k) => add(st, 'don', 0.35 + 0.1 * k));
  if (b === 7) add(0, 'koto', 0.5, 'D5');
  return ev;
}

// ---- select theme
const RIFF = { // shamisen 16th-note riff per harmony: [step, note]
  D: [[0, 'D3'], [2, 'D3'], [3, 'A3'], [6, 'D3'], [8, 'Eb3'], [10, 'D3'], [11, 'A3'], [14, 'G3']],
  G: [[0, 'G3'], [2, 'G3'], [3, 'D4'], [6, 'G3'], [8, 'A3'], [10, 'G3'], [11, 'D4'], [14, 'Bb3']],
  Bb: [[0, 'Bb3'], [2, 'Bb3'], [3, 'D4'], [6, 'Bb3'], [8, 'A3'], [10, 'G3'], [11, 'A3'], [14, 'Bb3']],
  A: [[0, 'A2'], [2, 'A2'], [3, 'Eb3'], [6, 'A2'], [8, 'Bb3'], [10, 'A3'], [11, 'G3'], [14, 'Eb3']],
};
const SEL_HARM = ['D', 'D', 'G', 'A', 'D', 'D', 'Bb', 'A'];
const HOOK = {
  2: [[0, 'D5', 4], [4, 'Eb5', 4], [8, 'D5', 6], [14, 'Bb4', 2]], 3: [[0, 'A4', 12], [12, 'G4', 4]],
  6: [[0, 'G4', 4], [4, 'A4', 4], [8, 'Bb4', 4], [12, 'A4', 4]], 7: [[0, 'D5', 14]],
  14: [[0, 'G4', 4], [4, 'A4', 4], [8, 'Bb4', 4], [12, 'D5', 4]], 15: [[0, 'Eb5', 8], [8, 'D5', 8]],
};
const KOTO_RUN_SEL = [[0, 'D5'], [2, 'Bb4'], [4, 'A4'], [6, 'G4'], [8, 'A4'], [10, 'Bb4'], [12, 'D5'], [14, 'Bb4']];
function selectBar(b) {
  const ev = [], add = (step, inst, vel, note, dur) => ev.push({ step, inst, vel, stem: 'select', note, dur });
  const h = SEL_HARM[b % 8], fill = b % 8 === 7;
  for (const [st, n] of RIFF[h]) add(st, 'shami', st === 0 ? 0.8 : st % 4 === 3 ? 0.5 : 0.62, n);
  for (let st = 0; st < 16; st += 2) add(st, 'shime', st % 8 === 0 ? 0.6 : st % 4 === 0 ? 0.45 : 0.28);
  if (fill) [0, 4, 8, 10, 12, 13, 14, 15].forEach((st, k) => add(st, 'don', 0.45 + 0.06 * k));
  else { [0, 6, 10].forEach((st) => add(st, 'don', st ? 0.55 : 0.8)); [4, 12].forEach((st) => add(st, 'ka', 0.55)); }
  if (b === 0 || b === 8) add(0, 'odaiko', 0.75);
  add(0, 'koto', 0.45, { D: 'D4', G: 'G4', Bb: 'Bb4', A: 'A3' }[h]); add(8, 'koto', 0.35, { D: 'A4', G: 'D5', Bb: 'D5', A: 'Eb4' }[h]);
  for (const [st, n, d] of HOOK[b] || []) add(st, 'shaku', 0.7, n, d);
  if (b === 10 || b === 11) for (const [st, n] of KOTO_RUN_SEL) add(st, 'koto', 0.5, n);
  return ev;
}

export const BATTLE = Array.from({ length: BATTLE_BARS }, (_, b) => battleBar(b));
export const MENU_SCORE = Array.from({ length: MENU_BARS }, (_, b) => titleBar(b));
export const SELECT_SCORE = Array.from({ length: SELECT_BARS }, (_, b) => selectBar(b));

/** stem gains from tension (0..1) */
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const stemGains = (T) => ({ base: 1, perc: smooth(0.15, 0.55, T), high: smooth(0.45, 0.85, T) });
