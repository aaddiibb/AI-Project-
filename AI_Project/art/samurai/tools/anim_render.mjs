// Animation filmstrips from samurai.moves.js: one row per action, one tile per key (hold shown), with the effect hooks drawn:
// blade arc (move.arc) and the measured hit box (move.box) on the first active key, the ultimate's crescent at spawnAt,
// root motion (walk steps, dash / backdash velocity, pose root.x) shown against world-space ground ticks.
//   node tools/anim_render.mjs -> renders/anim_sheet.png  (+ renders/anim_<row>.png per row)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { solve, mul, T, anchor, blendPoses } from '../../shinobi/rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rig = JSON.parse(readFileSync(join(ROOT, 'rig.json'), 'utf8'));
const poses = JSON.parse(readFileSync(join(ROOT, 'poses.json'), 'utf8'));
const { SAMURAI: S } = await import(pathToFileURL(join(ROOT, 'samurai.moves.js')).href);
const png = Object.fromEntries(rig.parts.map((p) => [p.id, 'data:image/png;base64,' + readFileSync(join(ROOT, 'renders/parts', p.id + '.png')).toString('base64')]));
const f = (n) => +n.toFixed(2);
const CENTER = 520, G = rig.groundY;
const withRoot = (pose, dx) => ({ ...pose, root: { x: (pose.root?.x || 0) + dx, y: pose.root?.y || 0 } });

function body(pose) {
  const sol = solve(rig, pose, { springs: {} });
  const items = rig.parts.filter((p) => sol.visible[p.id])
    .map((p) => ({ p, z: sol.zOverride[p.id] ?? p.zIndex, m: mul(sol.W[p.id], T(p.offset.x, p.offset.y)) }))
    .sort((a, b) => a.z - b.z);
  return { sol, svg: items.map(({ p, m }) => `<image href="${png[p.id]}" width="${p.size.w}" height="${p.size.h}" transform="matrix(${m.map(f).join(' ')})"/>`).join('') };
}
function arcPath(arc, dx) {
  const outer = [], inner = [];
  for (let i = 0; i <= arc.samples; i++) {
    const t = i / arc.samples;
    const sol = solve(rig, withRoot(blendPoses(poses[arc.from], poses[arc.to], t), dx));
    const a = anchor(rig, sol, arc.anchor), b = anchor(rig, sol, arc.inner);
    if (!a || !b) continue;
    const k = 0.45 + 0.35 * Math.sin(Math.PI * t);
    outer.push(a); inner.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
  }
  return 'M' + outer.map((p) => p.map(f).join(',')).join('L') + 'L' + inner.reverse().map((p) => p.map(f).join(',')).join('L') + 'Z';
}
const boxRect = (b, dx, label) => `<rect x="${CENTER + dx + b.x0}" y="${G - b.y1}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="#ff2d6a" fill-opacity="0.13" stroke="#ff2d6a" stroke-width="5" stroke-dasharray="14 9"/><text x="${CENTER + dx + b.x0 + 8}" y="${G - b.y1 - 10}" font-family="Arial" font-size="30" fill="#c0144a">${label}</text>`;
const hurtRect = (dx) => { const h = S.hurt.stand; return `<rect x="${CENTER + dx + h.x0}" y="${G - h.y1}" width="${h.x1 - h.x0}" height="${h.y1 - h.y0}" fill="none" stroke="#1d6fd8" stroke-width="3" stroke-dasharray="6 8" opacity="0.6"/>`; };
function crescent(cx, h, w, hgt) {
  const top = G - h - hgt / 2, bot = G - h + hgt / 2;
  return `<path d="M${cx - w * 0.2},${top} Q${cx + w * 0.9},${G - h} ${cx - w * 0.2},${bot} Q${cx + w * 0.25},${G - h} ${cx - w * 0.2},${top}Z" fill="#c8243a" fill-opacity="0.85" stroke="#fff" stroke-width="6"/>`;
}

const VB = [-300, 0, 1900, 1400];
const tileSvg = (inner, label, cam = 0) => {
  const x0 = VB[0] + cam;
  let ticks = '';
  for (let t = Math.floor(x0 / 100) * 100; t < x0 + VB[2]; t += 100) ticks += `<rect x="${t}" y="${G}" width="8" height="40" fill="#b89a62"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${VB[1]} ${VB[2]} ${VB[3]}"><rect x="${x0}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}" fill="#eef3f2"/><rect x="${x0}" y="${G}" width="${VB[2]}" height="200" fill="#d6bd8a"/>${ticks}${inner}<text x="${x0 + 24}" y="${VB[1] + 64}" font-family="Arial" font-size="52" fill="#333">${label}</text></svg>`;
};
const TW = 390, TH = Math.round((TW * VB[3]) / VB[2]);
const rasterize = (svg) => new Resvg(svg, { fitTo: { mode: 'width', value: TW }, font: { loadSystemFonts: true } }).render().asPng();

/** rows: { name, frames, motion(i, frame) -> dx at the key start, overlay(i, dx, sol) -> svg, follow } */
function rowTiles({ name, frames, dxAt, overlay = () => '', follow = false }) {
  let t = 0;
  return frames.map((fr, i) => {
    const dx = dxAt(i, t);
    const { sol, svg } = body(withRoot(poses[fr.pose], dx));
    const label = `${i === 0 ? name + ' · ' : ''}${fr.pose} ×${fr.hold} (f${t})`;
    const out = rasterize(tileSvg(svg + overlay(i, dx, sol, t), label, follow ? dx : 0));
    t += fr.hold;
    return out;
  });
}

const W = S.walk;
const cum = (arr) => arr.reduce((acc, s) => (acc.push((acc.at(-1) || 0) + s), acc), [0]);
const walkCum = cum(W.steps);
// forward position of key k (walk_{k+1}): steps[j] is the travel from key j-1 to key j
const walkPos = (k) => walkCum[k + 1] - W.steps[0];
const rows = [
  { name: 'idle', frames: S.anims.idle.frames, dxAt: () => 0, overlay: (i, dx) => (i === 0 ? hurtRect(dx) : '') },
  // forward: key i is reached after walking steps[1..i]; backward: the same keys descending
  { name: 'walk forward', frames: W.poses.map((p) => ({ pose: p, hold: 6 })), dxAt: (i) => walkPos(i), follow: true },
  { name: 'walk back', frames: [...W.poses].reverse().map((p) => ({ pose: p, hold: 7 })), dxAt: (i) => walkPos(W.poses.length - 1 - i) - walkPos(W.poses.length - 1), follow: true },
  { name: 'dash fwd', frames: S.anims.dash.frames, dxAt: (i, t) => S.phys.dashV * Math.max(0, Math.min(S.phys.dashFrames, t - S.anims.dash.frames[0].hold)) },
  { name: 'dash back', frames: S.anims.backdash.frames, dxAt: (i, t) => -S.phys.backdashV * Math.max(0, Math.min(S.phys.backdashFrames, t - S.anims.backdash.frames[0].hold)) },
  { name: 'guard', frames: S.anims.guard.frames, dxAt: () => 0, overlay: (i, dx) => hurtRect(dx) },
];
const atk = (name, m) => ({
  name, frames: m.frames, dxAt: () => 0,
  overlay: (i, dx, sol, t) => {
    let o = '';
    if (m.arc && m.frames[i].pose === m.arc.to) o += `<path d="${arcPath(m.arc, dx)}" fill="#ffffff" fill-opacity="0.75" stroke="#d6464e" stroke-width="6" stroke-linejoin="round"/>`;
    if (m.box && t >= m.active[0] && t <= m.active[1]) o += boxRect(m.box, dx, `active ${m.active[0]}-${m.active[1]}`);
    if (m.spawnAt !== undefined && t <= m.spawnAt && t + m.frames[i].hold > m.spawnAt) {
      const p = m.projectile;
      for (let k = 0; k < 3; k++) o += `<g opacity="${1 - k * 0.3}">${crescent(CENTER + dx + p.ox + k * p.vx * 6, p.h, p.w * 1.6, p.hgt)}</g>`;
      o += boxRect({ x0: p.ox - p.w / 2, x1: p.ox + p.w / 2, y0: p.h - p.hgt / 2, y1: p.h + p.hgt / 2 }, dx, 'crescent');
    }
    return o;
  },
});
rows.push(atk('light (iai)', S.moves.light), atk('heavy (cleave)', S.moves.heavy), atk('ultimate', S.moves.ult));
rows.push({ name: 'ult flash (freeze)', frames: S.moves.ult.flash, dxAt: () => 0, overlay: () => `<rect x="${VB[0]}" y="0" width="${VB[2]}" height="${VB[3]}" fill="#ff4050" fill-opacity="0.08"/>` });
rows.push({ name: 'hit', frames: S.anims.hit.frames, dxAt: () => 0 }, { name: 'down', frames: S.anims.down.frames, dxAt: () => 0 }, { name: 'wake', frames: S.anims.wake.frames, dxAt: () => 0 }, { name: 'knock air', frames: S.anims.knock_air.frames, dxAt: () => 0 });

const rendered = rows.map((r) => ({ name: r.name, tiles: rowTiles(r) }));
const sheet = (list, file) => {
  const cols = Math.max(...list.map((r) => r.tiles.length));
  const imgs = list.flatMap((r, y) => r.tiles.map((b, x) => `<image href="data:image/png;base64,${b.toString('base64')}" x="${x * TW}" y="${y * TH}" width="${TW}" height="${TH}"/>`)).join('');
  writeFileSync(join(ROOT, file), new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * TW} ${list.length * TH}"><rect width="100%" height="100%" fill="#fff"/>${imgs}</svg>`, { fitTo: { mode: 'width', value: cols * TW } }).render().asPng());
};
sheet(rendered, 'renders/anim_sheet.png');
for (const r of rendered) sheet([r], `renders/anim_${r.name.replace(/[^a-z]+/gi, '_').replace(/_$/, '')}.png`);
console.log(`rendered ${rendered.length} animation rows`);
