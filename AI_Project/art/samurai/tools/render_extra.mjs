// Pose workbench.
//   node tools/render_extra.mjs                 -> renders/extra_sheet.png (every pose in poses.json)
//   node tools/render_extra.mjs a b c           -> only those poses, renders/extra_pick.png
//   node tools/render_extra.mjs --anchors a b   -> also prints anchor positions as forward offset from the centre line (x 520,
//                                                  root motion included) and height above ground (for hitbox calibration)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { solve, mul, T, anchor } from '../../shinobi/rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rig = JSON.parse(readFileSync(join(ROOT, 'rig.json'), 'utf8'));
const poses = JSON.parse(readFileSync(join(ROOT, 'poses.json'), 'utf8'));
const png = Object.fromEntries(rig.parts.map((p) => [p.id, 'data:image/png;base64,' + readFileSync(join(ROOT, 'renders/parts', p.id + '.png')).toString('base64')]));
const f = (n) => +n.toFixed(3);

const args = process.argv.slice(2);
const wantAnchors = args.includes('--anchors');
const names = args.filter((a) => !a.startsWith('--'));
const list = names.length ? names : Object.keys(poses).filter((n) => !n.startsWith('_'));
export const ANCHOR_LIST = ['sword_tip', 'sword_guard', 'sword_grip2', 'saya_mouth', 'hand_near_grip', 'hand_far_grip', 'fist_near', 'hand_near', 'head', 'chest', 'foot_far_toe', 'foot_near_toe'];

const VB = [-200, 40, 1440, 1320];
const render = (svg, w) => new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: true } }).render().asPng();

function tile(name) {
  const pose = poses[name];
  if (!pose) throw new Error('unknown pose ' + name);
  const sol = solve(rig, pose, { springs: {} });
  const items = rig.parts.filter((p) => sol.visible[p.id])
    .map((p) => ({ p, z: sol.zOverride[p.id] ?? p.zIndex, m: mul(sol.W[p.id], T(p.offset.x, p.offset.y)) }))
    .sort((a, b) => a.z - b.z);
  const body = items.map(({ p, m }) => `<image href="${png[p.id]}" width="${p.size.w}" height="${p.size.h}" transform="matrix(${m.map(f).join(' ')})"/>`).join('');
  const ground = `<rect x="${VB[0]}" y="${rig.groundY}" width="${VB[2]}" height="400" fill="#d6bd8a"/><line x1="${VB[0]}" y1="${rig.groundY}" x2="${VB[0] + VB[2]}" y2="${rig.groundY}" stroke="#a88a55" stroke-width="3"/><line x1="520" y1="${VB[1]}" x2="520" y2="${rig.groundY}" stroke="#0003" stroke-width="2" stroke-dasharray="10 10"/>`;
  let marks = '';
  if (wantAnchors) {
    const out = [];
    for (const a of ANCHOR_LIST) {
      const q = anchor(rig, sol, a);
      if (!q) continue;
      out.push(`${a}: fwd ${Math.round(q[0] - 520)} up ${Math.round(rig.groundY - q[1])}`);
      marks += `<circle cx="${q[0]}" cy="${q[1]}" r="9" fill="#ff2d6a"/>`;
    }
    console.log(name.padEnd(15), out.join(' | '));
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB.join(' ')}"><rect x="${VB[0]}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}" fill="#eef3f2"/>${ground}${body}${marks}<text x="${VB[0] + 20}" y="${VB[1] + 56}" font-family="Arial" font-size="48" fill="#333">${name}</text></svg>`;
  return render(svg, 560);
}

const tiles = list.map(tile);
const cols = Math.min(6, tiles.length), rows = Math.ceil(tiles.length / cols);
const tw = VB[2], th = VB[3];
const imgs = tiles.map((b, i) => `<image href="data:image/png;base64,${b.toString('base64')}" x="${(i % cols) * tw}" y="${Math.floor(i / cols) * th}" width="${tw}" height="${th}"/>`).join('');
const out = names.length ? 'renders/extra_pick.png' : 'renders/extra_sheet.png';
writeFileSync(join(ROOT, out), render(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * tw} ${rows * th}">${imgs}</svg>`, Math.min(2400, cols * 420)));
console.log(`rendered ${tiles.length} poses -> ${out}`);
