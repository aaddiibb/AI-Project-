// Measure attack boxes from the rig's sword anchors (contract 04 §1.4: "measured from rig anchors, not guessed").
// For every frame of a move's measurement window it reproduces the game's Animator sampling (hold + end-of-hold tween + ease),
// solves the pose (ground lock on), and samples points along the blade from `sword_guard` to `sword_tip`.
// Output: forward offset from the centre line (x 520, root motion included) and height above ground, + padding.
//   node tools/measure_boxes.mjs            -> prints a table and writes renders/boxes.json
//   node tools/measure_boxes.mjs --write    -> also writes the boxes into samurai.moves.js
// x0 is clamped to the fighter's front (140): the blade sweeps through the space in front of him, and a point-blank
// opponent (centre ~200, body ~35..325) must not stand under the blade without being hit.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { solve, anchor, blendPoses } from '../../shinobi/rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rig = JSON.parse(readFileSync(join(ROOT, 'rig.json'), 'utf8'));
const poses = JSON.parse(readFileSync(join(ROOT, 'poses.json'), 'utf8'));
const { SAMURAI } = await import(pathToFileURL(join(ROOT, 'samurai.moves.js')).href);
const PAD = 40, CENTER = 520, FRONT = 140;

export const EASE = { linear: (t) => t, in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), inout: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)), smooth: (t) => t * t * (3 - 2 * t) };
/** same rule as game/src/animator.js sample(): hold, then ease toward the next key during the last `tween` frames */
export function sampleFrames(frames, t) {
  let acc = 0, i = 0;
  while (i < frames.length - 1 && t >= acc + frames[i].hold) acc += frames[i++].hold;
  const fr = frames[i], lt = t - acc, next = frames[i + 1];
  const a = poses[fr.pose];
  if (!next || fr.tween === 0) return { pose: a, label: fr.pose };
  const L = Math.min(fr.hold, fr.tween ?? 5), start = fr.hold - L;
  if (lt < start) return { pose: a, label: fr.pose };
  const u = (lt - start + 1) / (L + 1);
  const k = (EASE[fr.ease] || EASE.inout)(u);
  return { pose: blendPoses(a, poses[next.pose], k), label: `${fr.pose}>${next.pose} ${k.toFixed(2)}` };
}

// measurement windows: the active frames; for the heavy also the last frames of the windup -> cleave swing (the blade passes
// overhead into the active window, which is what lets the cleave catch jump-ins)
// [first frame, last frame, swing frames before the active window counted only where the blade is in front (fwd >= 140)]
const WINDOWS = { light: [...SAMURAI.moves.light.active, 0], heavy: [...SAMURAI.moves.heavy.active, 1] };
const out = {};
for (const [name, [a0, t1, swing]] of Object.entries(WINDOWS)) {
  const t0 = a0 - swing;
  const m = SAMURAI.moves[name];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const rows = [];
  for (let t = t0; t <= t1; t++) {
    const { pose, label } = sampleFrames(m.frames, t);
    const sol = solve(rig, pose);
    const g = anchor(rig, sol, 'sword_guard'), tip = anchor(rig, sol, 'sword_tip');
    if (!g || !tip) continue;
    // blade points: from 25% out from the guard to the tip (the hilt end is inside the fighter's own hurtbox anyway)
    for (let k = 0.25; k <= 1.0001; k += 0.25) {
      const x = g[0] + (tip[0] - g[0]) * k - CENTER, y = rig.groundY - (g[1] + (tip[1] - g[1]) * k);
      if (t < a0 && x < 140) continue; // swing frames: only the part of the arc in front of the fighter
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    rows.push(`  f${String(t).padStart(2)} ${label.padEnd(34)} tip fwd ${Math.round(tip[0] - CENTER)} up ${Math.round(rig.groundY - tip[1])} | guard fwd ${Math.round(g[0] - CENTER)} up ${Math.round(rig.groundY - g[1])}`);
  }
  const box = { x0: Math.min(FRONT, Math.round(x0 - PAD)), x1: Math.round(x1 + PAD), y0: Math.round(Math.max(0, y0 - PAD)), y1: Math.round(y1 + PAD) };
  out[name] = { window: [t0, t1], measured: { x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1) }, box, inData: m.box };
  console.log(`${name}: frames ${t0}..${t1}`);
  console.log(rows.join('\n'));
  console.log(`  blade extent  fwd ${Math.round(x0)}..${Math.round(x1)}  up ${Math.round(y0)}..${Math.round(y1)}  -> box (+${PAD}) ${JSON.stringify(box)}  | samurai.moves.js has ${JSON.stringify(m.box)}`);
}
writeFileSync(join(ROOT, 'renders/boxes.json'), JSON.stringify(out, null, 1));

if (process.argv.includes('--write')) {
  const file = join(ROOT, 'samurai.moves.js');
  let src = readFileSync(file, 'utf8');
  for (const [name, r] of Object.entries(out)) {
    const at = src.indexOf(`\n    ${name}: {`);
    const b0 = at < 0 ? -1 : src.indexOf('box: {', at);
    if (b0 < 0) throw new Error('box not found for ' + name);
    const b1 = src.indexOf('}', b0);
    src = src.slice(0, b0) + `box: { x0: ${r.box.x0}, x1: ${r.box.x1}, y0: ${r.box.y0}, y1: ${r.box.y1} }` + src.slice(b1 + 1);
  }
  writeFileSync(file, src);
  console.log('wrote boxes into samurai.moves.js');
}
