// Sound table and mix constants (prompt 06). PURE. Shared by the browser engine (engine.js) and the offline renderer
// (tools/render_audio.mjs), so what the tests measure is what the player hears.
//
// Per sound: variants (seeded renders), bus, pri (1 ambient .. 9 must play; voice stealing drops the lowest),
// gain (linear, after the bank's peak normalisation), send (reverb), min (minimum ms between two plays of this id:
// stops machine-gunning at 4x speed), peakMs (whooshes: when the swing peaks, used by cues.js to lead the active frame),
// duck ({ music, sfx } in dB, hold ms) applied when the sound starts; panScale scales the stereo position (0 = centred:
// stingers and UI; low booms stay near the centre).
export const SOUNDS = {
  // swings (cue fires `peakMs` before the move's first active frame)
  sam_draw: { variants: 4, bus: 'sfx', pri: 6, gain: 0.55, send: 0.2, min: 40, peakMs: 50 },
  sam_cleave: { variants: 4, bus: 'sfx', pri: 6, gain: 0.6, send: 0.25, min: 40, peakMs: 167 },
  shi_swish: { variants: 4, bus: 'sfx', pri: 5, gain: 0.45, send: 0.15, min: 40, peakMs: 50 },
  shi_kick: { variants: 4, bus: 'sfx', pri: 5, gain: 0.45, send: 0.15, min: 40, peakMs: 50 },
  shi_slash: { variants: 4, bus: 'sfx', pri: 6, gain: 0.55, send: 0.2, min: 40, peakMs: 83 },
  // impacts
  hit_l: { variants: 4, bus: 'sfx', pri: 8, gain: 0.7, send: 0.2, min: 30 },
  hit_m: { variants: 4, bus: 'sfx', pri: 8, gain: 0.8, send: 0.25, min: 30 },
  hit_h: { variants: 4, bus: 'sfx', pri: 8, gain: 0.95, send: 0.3, min: 30 },
  counter: { variants: 2, bus: 'sfx', pri: 8, gain: 0.45, send: 0.35, min: 60 },
  ko_boom: { variants: 1, bus: 'sfx', pri: 9, panScale: 0.3, gain: 0.95, send: 0.5, min: 300, duck: { music: -9, hold: 2200 } },
  block_steel: { variants: 4, bus: 'sfx', pri: 7, gain: 0.55, send: 0.3, min: 30 },
  block_wood: { variants: 4, bus: 'sfx', pri: 7, gain: 0.6, send: 0.2, min: 30 },
  chip: { variants: 2, bus: 'sfx', pri: 6, gain: 0.4, send: 0.15, min: 60 },
  // projectiles + ultimates
  super: { variants: 1, bus: 'voice', pri: 9, panScale: 0.5, gain: 0.85, send: 0.45, min: 300, duck: { music: -9, sfx: -6, hold: 900 } },
  crescent_rel: { variants: 2, bus: 'sfx', pri: 8, gain: 0.85, send: 0.4, min: 100 },
  crescent_loop: { variants: 1, bus: 'sfx', pri: 8, gain: 0.35, send: 0.3, loop: true },
  kunai: { variants: 3, bus: 'sfx', pri: 5, gain: 0.4, send: 0.15, min: 40 },
  fan: { variants: 1, bus: 'sfx', pri: 8, gain: 0.7, send: 0.35, min: 200 },
  thunk: { variants: 3, bus: 'sfx', pri: 3, gain: 0.3, send: 0.15, min: 40 },
  // movement
  dash: { variants: 3, bus: 'sfx', pri: 4, gain: 0.4, send: 0.1, min: 60 },
  heel_drag: { variants: 2, bus: 'sfx', pri: 4, gain: 0.45, send: 0.1, min: 60 },
  jump: { variants: 3, bus: 'sfx', pri: 3, gain: 0.3, send: 0.1, min: 60 },
  land: { variants: 3, bus: 'sfx', pri: 4, gain: 0.4, send: 0.15, min: 60 },
  bodyfall: { variants: 2, bus: 'sfx', pri: 7, panScale: 0.7, gain: 0.75, send: 0.3, min: 120 },
  step: { variants: 4, bus: 'sfx', pri: 1, gain: 0.16, send: 0.05, min: 90 },
  guard: { variants: 3, bus: 'sfx', pri: 2, gain: 0.22, send: 0.05, min: 80 },
  // match flow (stingers) + UI
  st_round1: { variants: 1, bus: 'voice', panScale: 0, pri: 9, gain: 0.8, send: 0.35, min: 500, duck: { music: -6, hold: 2400 } },
  st_round2: { variants: 1, bus: 'voice', panScale: 0, pri: 9, gain: 0.8, send: 0.35, min: 500, duck: { music: -6, hold: 2600 } },
  st_round3: { variants: 1, bus: 'voice', panScale: 0, pri: 9, gain: 0.8, send: 0.35, min: 500, duck: { music: -6, hold: 2800 } },
  st_fight: { variants: 1, bus: 'voice', panScale: 0, pri: 9, gain: 0.85, send: 0.3, min: 500, duck: { music: -6, hold: 900 } },
  st_ko: { variants: 1, bus: 'voice', panScale: 0, pri: 9, gain: 0.85, send: 0.4, min: 500, duck: { music: -9, hold: 2500 } },
  st_time: { variants: 1, bus: 'voice', panScale: 0, pri: 9, gain: 0.8, send: 0.3, min: 500, duck: { music: -9, hold: 2200 } },
  st_win: { variants: 1, bus: 'voice', panScale: 0, pri: 9, gain: 0.8, send: 0.4, min: 500, duck: { music: -9, hold: 3500 } },
  st_draw: { variants: 1, bus: 'voice', panScale: 0, pri: 9, gain: 0.75, send: 0.4, min: 500, duck: { music: -9, hold: 3500 } },
  tick: { variants: 2, bus: 'ui', panScale: 0, pri: 3, gain: 0.35, send: 0.05, min: 150 },
  tick_hi: { variants: 2, bus: 'ui', panScale: 0, pri: 3, gain: 0.45, send: 0.05, min: 150 },
  ui_hover: { variants: 2, bus: 'ui', panScale: 0, pri: 2, gain: 0.25, send: 0, min: 50 },
  ui_tab: { variants: 2, bus: 'ui', panScale: 0, pri: 2, gain: 0.35, send: 0.05, min: 50 },
  ui_go: { variants: 1, bus: 'ui', panScale: 0, pri: 5, gain: 0.6, send: 0.2, min: 300 },
};

/** instruments of the score (one render per note; pitched instruments are rendered at every note they use) */
export const INSTRUMENTS = {
  don: { variants: 3, gain: 0.55 }, odaiko: { variants: 2, gain: 0.7 }, ka: { variants: 3, gain: 0.3 }, shime: { variants: 3, gain: 0.28 },
  koto: { gain: 0.32, notes: ['A2', 'D3', 'Eb3', 'G3', 'A3', 'Bb3', 'D4', 'Eb4', 'G4', 'A4', 'Bb4', 'D5'] },
  shaku: { gain: 0.3, notes: ['D4', 'Eb4', 'G4', 'A4', 'Bb4', 'D5', 'Eb5'] },
  drone: { variants: 1, gain: 0.32, loop: true }, wind: { variants: 1, gain: 0.3, loop: true },
};

/** mix: bus levels (linear), master chain, reverb, pan law */
export const MIX = {
  bus: { music: 0.6, sfx: 0.9, ui: 0.55, voice: 0.85 },
  reverb: { sec: 1.4, ret: 0.35 },
  comp: { threshold: -14, ratio: 4, attack: 0.003, release: 0.15, knee: 6 },
  limit: { threshold: -1.5, ratio: 20, attack: 0.001, release: 0.06 },
  duckAttack: 0.04, duckRelease: 0.35,
  maxVoices: 24,
  panWidth: 0.8,
  /** speed > 1: raise playback rate a little so cues stay snappy (never above 1.12) */
  speedRate: (speed) => (speed > 1 ? Math.min(1.12, speed ** 0.08) : 1),
};

/** world x -> stereo pan, relative to the camera (centre cx, visible width w) */
export const panOf = (x, cx = 2600, w = 5200) => Math.max(-MIX.panWidth, Math.min(MIX.panWidth, ((x - cx) / (w / 2)) * MIX.panWidth));

/** every buffer the game needs, most urgent first (combat, then match flow, then music); key = id:variant or inst:note */
export function bankJobs() {
  const jobs = [], add = (id, v, note) => jobs.push({ key: id + ':' + (note ?? v), id, v, note });
  const sfx = Object.entries(SOUNDS).filter(([id, s]) => s.bus === 'sfx' || id === 'super');
  for (const [id, s] of sfx) add(id, 0);
  for (const [id, s] of Object.entries(SOUNDS)) if (s.bus !== 'sfx' && id !== 'super') for (let v = 0; v < s.variants; v++) add(id, v);
  for (const [id, s] of sfx) for (let v = 1; v < s.variants; v++) add(id, v);
  for (const [id, s] of Object.entries(INSTRUMENTS)) {
    if (s.notes) for (const n of s.notes) add(id, 0, n);
    else for (let v = 0; v < s.variants; v++) add(id, v);
  }
  return jobs;
}
