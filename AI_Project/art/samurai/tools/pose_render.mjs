// Offline pose renderer: assembles part PNGs with the same solver as preview.html.
//   node tools/pose_render.mjs          -> renders/poses/<pose>.png, renders/poses_sheet.png, renders/stress_sheet.png
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { solve, mul, T, stressOf } from '../../shinobi/rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rig = JSON.parse(readFileSync(join(ROOT, 'rig.json'), 'utf8'));
const poses = JSON.parse(readFileSync(join(ROOT, 'poses.json'), 'utf8'));
const png = Object.fromEntries(rig.parts.map((p) => [p.id, 'data:image/png;base64,' + readFileSync(join(ROOT, 'renders/parts', p.id + '.png')).toString('base64')]));
mkdirSync(join(ROOT, 'renders/poses'), { recursive: true });
const STRESS = stressOf(rig); // rig.stress (data-driven), written by split.mjs

const VB = [-200, 40, 1440, 1320];
const f = (n) => +n.toFixed(4);

function composeSvg(pose, opts = {}) {
  const sol = solve(rig, pose, { springs: {}, ...opts });
  const items = rig.parts
    .filter((p) => sol.visible[p.id])
    .map((p) => ({ p, z: sol.zOverride[p.id] ?? p.zIndex, m: mul(sol.W[p.id], T(p.offset.x, p.offset.y)) }))
    .sort((a, b) => a.z - b.z);
  return items.map(({ p, m }) => `<image href="${png[p.id]}" width="${p.size.w}" height="${p.size.h}" transform="matrix(${m.map(f).join(' ')})"/>`).join('');
}

const ground = `<rect x="${VB[0]}" y="${rig.groundY}" width="${VB[2]}" height="${VB[1] + VB[3] - rig.groundY}" fill="#d6bd8a"/><line x1="${VB[0]}" y1="${rig.groundY}" x2="${VB[0] + VB[2]}" y2="${rig.groundY}" stroke="#a88a55" stroke-width="3"/>`;
const render = (svg, w) => new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: true } }).render().asPng();
const frameSvg = (inner, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB.join(' ')}"><rect x="${VB[0]}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}" fill="#eef3f2"/>${ground}${inner}<text x="${VB[0] + 20}" y="${VB[1] + 50}" font-family="Arial" font-size="40" fill="#333">${label}</text></svg>`;

const names = Object.keys(poses).filter((n) => !n.startsWith('_'));
const tiles = [];
for (const n of names) {
  const out = render(frameSvg(composeSvg(poses[n]), n.replace(/_/g, ' ')), 900);
  writeFileSync(join(ROOT, `renders/poses/${n}.png`), out);
  tiles.push(out);
}

function sheet(tilePngs, cols, file) {
  const tw = VB[2], th = VB[3], rows = Math.ceil(tilePngs.length / cols);
  const imgs = tilePngs.map((b, i) => `<image href="data:image/png;base64,${b.toString('base64')}" x="${(i % cols) * tw}" y="${Math.floor(i / cols) * th}" width="${tw}" height="${th}"/>`).join('');
  writeFileSync(join(ROOT, file), render(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * tw} ${rows * th}">${imgs}</svg>`, Math.min(2400, cols * 600)));
}
sheet(tiles, 4, 'renders/poses_sheet.png');

// joint stress: every listed joint at its min, then its max (gaps at joints show up here)
const ext = (k) => ({ rot: Object.fromEntries(Object.entries(STRESS).map(([id, r]) => [id, r[k]])) });
const mid = { rot: Object.fromEntries(Object.entries(STRESS).map(([id, [lo, hi]]) => [id, lo * 0.5 + hi * 0.5])) };
// Samurai extremes: overhead cleave raise, deep lunge (iai / cleave), guard fold, back-leg push
const DRAWN = { attach: { sword: 'hand_near_grip_sword' }, slots: { hand_near: 'hand_near_grip_sword', hand_far: 'hand_far_grip_sword' } };
const cleaveRaise = { ...DRAWN, rot: { upper_arm_near: -165, forearm_near: -60, upper_arm_far: -120, forearm_far: -60, torso_upper: -18, waist: -10, head_base: 18 } };
const lunge = { ...DRAWN, rot: { upper_arm_near: -95, forearm_near: 0, thigh_far: -70, shin_boot_far: 100, foot_far: -30, thigh_near: 45, shin_boot_near: 60, foot_near: -30, torso_upper: 24, waist: 14, head_base: -20 } };
const guardFold = { slots: { hand_near: 'hand_near_fist', hand_far: 'hand_far_fist' }, rot: { upper_arm_near: -80, forearm_near: -130, upper_arm_far: -60, forearm_far: -110, thigh_near: -30, shin_boot_near: 100, thigh_far: -60, shin_boot_far: 100, neck: 14 } };
const st = [['all joints at min', ext(0)], ['all joints at max', ext(1)], ['all joints mid', mid], ['cleave raise', cleaveRaise], ['deep lunge', lunge], ['guard fold', guardFold]]
  .map(([label, pose]) => render(frameSvg(composeSvg(pose), label), 900));
sheet(st, 3, 'renders/stress_sheet.png');
console.log(`rendered ${names.length} poses + ${st.length} stress frames`);
