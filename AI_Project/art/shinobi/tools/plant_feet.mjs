// Plant the second foot: for each pose, the ground lock already puts the lowest foot on the floor;
// this searches hip/knee/ankle of the OTHER leg (small changes from the authored values) so its sole
// lies flat on its own ground line too. Writes the result back into poses.json.
//   node tools/plant_feet.mjs <poseName ...>   (explicit list: some poses keep a lifted foot on purpose, e.g. dash, ko_*)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve, ap } from '../rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rig = JSON.parse(readFileSync(join(ROOT, 'rig.json'), 'utf8'));
const poses = JSON.parse(readFileSync(join(ROOT, 'poses.json'), 'utf8'));
const LEGS = { foot_near: ['thigh_near', 'shin_boot_near', 'foot_near'], foot_far: ['thigh_far', 'shin_boot_far', 'foot_far'] };

/** per foot: [mean lift above its rest ground, tilt spread] */
function footError(pose) {
  const sol = solve(rig, pose);
  const out = {};
  for (const [id, pts] of Object.entries(rig.contacts)) {
    const d = pts.map(([x, y]) => y - ap(sol.W[id], x, y)[1]); // + = above ground
    out[id] = [d.reduce((a, b) => a + b, 0) / d.length, Math.max(...d) - Math.min(...d)];
  }
  return out;
}

const names = process.argv.slice(2);
if (!names.length) { console.error('usage: node tools/plant_feet.mjs <poseName ...>'); process.exit(1); }
for (const name of names) {
  const pose = poses[name];
  pose.rot ||= {};
  const err = footError(pose);
  const foot = err.foot_near[0] > err.foot_far[0] ? 'foot_near' : 'foot_far'; // the floating one
  const other = foot === 'foot_near' ? 'foot_far' : 'foot_near';
  if (err[foot][0] < 4 && err[foot][1] < 8) { console.log(`${name}: ok`); continue; }
  const [hip, knee, ankle] = LEGS[foot];
  const base = [pose.rot[hip] || 0, pose.rot[knee] || 0, pose.rot[ankle] || 0];
  let best = null;
  for (let dh = -10; dh <= 30; dh += 2) for (let dk = -30; dk <= 30; dk += 2) {
    const k = base[1] + dk;
    if (k < -2 || k > 120) continue; // knees only bend one way
    for (let da = -40; da <= 40; da += 4) {
      const trial = { ...pose, rot: { ...pose.rot, [hip]: base[0] + dh, [knee]: k, [ankle]: base[2] + da } };
      const e = footError(trial);
      const cost = Math.abs(e[foot][0]) * 3 + e[foot][1] + 0.15 * (Math.abs(dh) + Math.abs(dk) + 0.5 * Math.abs(da)) + Math.max(0, -e[other][0]) * 5;
      if (!best || cost < best.cost) best = { cost, rot: trial.rot, e };
    }
  }
  pose.rot = best.rot;
  console.log(`${name}: ${foot} lift ${err[foot][0].toFixed(1)} -> ${best.e[foot][0].toFixed(1)}, tilt ${best.e[foot][1].toFixed(1)}  (${hip} ${best.rot[hip]}, ${knee} ${best.rot[knee]}, ${ankle} ${best.rot[ankle]})`);
}
writeFileSync(join(ROOT, 'poses.json'), JSON.stringify(poses, null, 1));
