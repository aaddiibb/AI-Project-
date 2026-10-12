// Offline animation filmstrips: one row per animation, one tile per frame, with effect hooks drawn
// (slash arc, hitboxes, spawned projectile path).  node tools/anim_render.mjs -> renders/anim_sheet.png
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { solve, mul, T, anchor, blendPoses } from '../rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rig = JSON.parse(readFileSync(join(ROOT, 'rig.json'), 'utf8'));
const poses = JSON.parse(readFileSync(join(ROOT, 'poses.json'), 'utf8'));
const anims = JSON.parse(readFileSync(join(ROOT, 'animations.json'), 'utf8'));
const png = Object.fromEntries(rig.parts.map((p) => [p.id, 'data:image/png;base64,' + readFileSync(join(ROOT, 'renders/parts', p.id + '.png')).toString('base64')]));
const f = (n) => +n.toFixed(3);

const withRoot = (pose, dx) => ({ ...pose, root: { x: (pose.root?.x || 0) + dx, y: pose.root?.y || 0 } });

function body(pose) {
  const sol = solve(rig, pose, { springs: {} });
  const items = rig.parts.filter((p) => sol.visible[p.id])
    .map((p) => ({ p, z: sol.zOverride[p.id] ?? p.zIndex, m: mul(sol.W[p.id], T(p.offset.x, p.offset.y)) }))
    .sort((a, b) => a.z - b.z);
  return { sol, svg: items.map(({ p, m }) => `<image href="${png[p.id]}" width="${p.size.w}" height="${p.size.h}" transform="matrix(${m.map(f).join(' ')})"/>`).join('') };
}

/** blade trail: crescent between the inner (guard) path and the tip path */
function slashArcPoints(ev, dx) {
  const outer = [], inner = [];
  for (let i = 0; i <= ev.samples; i++) {
    const t = i / ev.samples;
    const sol = solve(rig, withRoot(blendPoses(poses[ev.from], poses[ev.to], t), dx));
    const a = anchor(rig, sol, ev.anchor), b = anchor(rig, sol, ev.inner);
    if (!a || !b) continue;
    outer.push(a);
    const k = 0.45 + 0.35 * Math.sin(Math.PI * t); // thick in the middle of the swing
    inner.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
  }
  return { outer, inner };
}

const VB = [-80, 80, 1280, 1280];
// the tile camera follows the root motion (cam); ground ticks are in world space so travel stays visible
const tileOf = (inner, label, cam = 0) => {
  const x0 = VB[0] + cam;
  let ticks = '';
  for (let t = Math.floor(x0 / 100) * 100; t < x0 + VB[2]; t += 100) ticks += `<rect x="${t}" y="${rig.groundY}" width="8" height="40" fill="#b89a62"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${VB[1]} ${VB[2]} ${VB[3]}"><rect x="${x0}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}" fill="#eef3f2"/><rect x="${x0}" y="${rig.groundY}" width="${VB[2]}" height="200" fill="#d6bd8a"/>${ticks}${inner}<text x="${x0 + 20}" y="${VB[1] + 56}" font-family="Arial" font-size="46" fill="#333">${label}</text></svg>`;
};

const rows = [];
for (const [name, anim] of Object.entries(anims)) {
  if (name.startsWith('_')) continue;
  let dx = 0;
  const tiles = anim.frames.map((fr, i) => {
    if (i > 0) dx += fr.step || 0; // stepped root motion lands with the new key
    const { sol, svg } = body(withRoot(poses[fr.pose], dx));
    const camX = anim.loop ? dx : 0; // looping locomotion: follow; one-shots: fixed camera
    let fx = '';
    for (const ev of fr.events || []) {
      if (ev.type === 'slashArc') {
        const { outer, inner } = slashArcPoints(ev, dx);
        const d = 'M' + outer.map((p) => p.map(f).join(',')).join('L') + 'L' + inner.reverse().map((p) => p.map(f).join(',')).join('L') + 'Z';
        fx += `<path d="${d}" fill="#ffffff" fill-opacity="0.75" stroke="#d6464e" stroke-width="6" stroke-linejoin="round"/>`;
      }
      if (ev.type === 'hitbox') {
        const a = anchor(rig, sol, ev.anchor);
        if (a) fx += `<circle cx="${f(a[0])}" cy="${f(a[1])}" r="${ev.radius}" fill="#ff2d6a" fill-opacity="0.18" stroke="#ff2d6a" stroke-width="4" stroke-dasharray="10 8"/>`;
      }
      if (ev.type === 'spawn') {
        const a = anchor(rig, sol, ev.anchor);
        const it = rig.parts.find((p) => p.id === ev.item);
        if (a && it) for (let k = 0; k < 4; k++) {
          const px = a[0] + ev.velocity[0] * k * 5, py = a[1] + ev.velocity[1] * k * 5;
          const ang = (Math.atan2(ev.velocity[1], ev.velocity[0]) * 180) / Math.PI - it.grip.axisDeg;
          fx += `<g opacity="${1 - k * 0.22}" transform="translate(${f(px)},${f(py)}) rotate(${f(ang)}) translate(${-it.grip.x},${-it.grip.y})"><image href="${png[it.id]}" x="${it.offset.x}" y="${it.offset.y}" width="${it.size.w}" height="${it.size.h}"/></g>`;
        }
      }
      if (ev.type === 'flash') fx += `<rect x="${VB[0]}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}" fill="#ff4050" fill-opacity="0.12"/>`;
    }
    dx += (fr.dx || 0) * fr.hold;
    const label = `${i === 0 ? name.replace(/_/g, ' ') + ' · ' : ''}${fr.pose} ×${fr.hold}`;
    return new Resvg(tileOf(svg + fx, label, camX), { fitTo: { mode: 'width', value: 400 }, font: { loadSystemFonts: true } }).render().asPng();
  });
  rows.push(tiles);
}
const cols = Math.max(...rows.map((r) => r.length)), tw = 400, th = 400;
const imgs = rows.flatMap((r, y) => r.map((b, x) => `<image href="data:image/png;base64,${b.toString('base64')}" x="${x * tw}" y="${y * th}" width="${tw}" height="${th}"/>`)).join('');
writeFileSync(join(ROOT, 'renders/anim_sheet.png'), new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * tw} ${rows.length * th}"><rect width="100%" height="100%" fill="#fff"/>${imgs}</svg>`, { fitTo: { mode: 'width', value: cols * tw } }).render().asPng());
console.log(`rendered ${rows.length} animations`);
