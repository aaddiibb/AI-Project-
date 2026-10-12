// Render an animation to video (60 fps game time -> 30 fps output) with springs, effects and a simple stage.
//   node tools/video_render.mjs [animName=showcase] [speed]  -> renders/<anim>.mp4 and renders/<anim>.gif (needs ffmpeg on PATH)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';
import { solve, mul, T, anchor, blendPoses } from '../rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2] || 'showcase';
const SPEED = +(process.argv[3] || (name === 'showcase' ? 0.75 : 1)); // playback speed (0.75 = slightly slowed showcase)
const rig = JSON.parse(readFileSync(join(ROOT, 'rig.json'), 'utf8'));
const poses = JSON.parse(readFileSync(join(ROOT, 'poses.json'), 'utf8'));
const anim = JSON.parse(readFileSync(join(ROOT, 'animations.json'), 'utf8'))[name];
if (!anim) throw new Error(`no animation "${name}"`);
const png = Object.fromEntries(rig.parts.map((p) => [p.id, 'data:image/png;base64,' + readFileSync(join(ROOT, 'renders/parts', p.id + '.png')).toString('base64')]));
const byId = Object.fromEntries(rig.parts.map((p) => [p.id, p]));
const f = (n) => +n.toFixed(3);
const W = 960, H = 540, SCALE = 0.36, GROUND_PX = 500;
const FRAMES_DIR = join(ROOT, 'renders', `${name}_frames`);
rmSync(FRAMES_DIR, { recursive: true, force: true });
mkdirSync(FRAMES_DIR, { recursive: true });

const withRoot = (p, dx) => ({ ...p, root: { x: (p.root?.x || 0) + dx, y: p.root?.y || 0 } });

// ---------------------------------------------------------------- stage (screen space, parallax by camera x)
function stage(camX) {
  const hill = (seed, base, amp, color, par) => {
    let d = `M0,${H}`;
    for (let x = 0; x <= W + 40; x += 40) {
      const wx = x + camX * par;
      d += ` L${x},${f(base - amp * (0.6 + 0.25 * Math.sin(wx * 0.006 + seed) + 0.15 * Math.sin(wx * 0.015 + seed * 3)))}`;
    }
    return `<path d="${d} L${W + 40},${H} Z" fill="${color}"/>`;
  };
  let planks = '';
  for (let k = -2; k < 26; k++) { const x = ((k * 90 - camX * SCALE) % (W + 180)) - 90; planks += `<line x1="${f(x)}" y1="${GROUND_PX}" x2="${f(x - 60)}" y2="${H}" stroke="#a7834f" stroke-width="2"/>`; }
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd0ec"/><stop offset="0.65" stop-color="#f3ead6"/><stop offset="1" stop-color="#f6dcb0"/></linearGradient>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7b277"/><stop offset="1" stop-color="#b98d55"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle cx="${f(760 - camX * 0.02)}" cy="110" r="46" fill="#fff6dc" opacity="0.85"/>
${hill(1.3, 380, 120, '#b8c9dc', 0.05)}${hill(4.1, 430, 90, '#9fb3c8', 0.12)}${hill(2.2, 470, 50, '#8aa48e', 0.25)}
<rect y="${GROUND_PX}" width="${W}" height="${H - GROUND_PX}" fill="url(#floor)"/>${planks}
<rect y="${GROUND_PX - 2}" width="${W}" height="4" fill="#8e6a3c"/>`;
}

// ---------------------------------------------------------------- simulate the animation exactly like preview.html
const springs = {};
let i = 0, t = 0, dx = anim.startX || 0, flash = 0;
let fx = [], projectiles = [];
let pose = withRoot(poses[anim.frames[0].pose], dx);
let camX = dx + 520;

function fire(ev) {
  if (ev.type === 'flash') flash = ev.frames;
  if (ev.type === 'slashArc') {
    const outer = [], inner = [];
    for (let k = 0; k <= ev.samples; k++) {
      const u = k / ev.samples;
      const sol = solve(rig, withRoot(blendPoses(poses[ev.from], poses[ev.to], u), dx));
      const a = anchor(rig, sol, ev.anchor), b = anchor(rig, sol, ev.inner);
      if (!a || !b) continue;
      const w = 0.45 + 0.35 * Math.sin(Math.PI * u);
      outer.push(a); inner.push([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]);
    }
    fx.push({ outer, inner, life: ev.life, max: ev.life });
  }
  if (ev.type === 'spawn') {
    const a = anchor(rig, solve(rig, pose), ev.anchor);
    if (a) projectiles.push({ it: byId[ev.item], pos: [...a], vel: [...ev.velocity], life: ev.life });
  }
}
function enter() {
  const fr = anim.frames[i];
  dx += fr.step || 0;
  pose = withRoot(poses[fr.pose], dx);
  for (const ev of fr.events || []) fire(ev);
}

const total = anim.frames.reduce((s, fr) => s + fr.hold, 0) + 20;
enter();
let out = 0;
for (let g = 0; g < total; g++) {
  const fr = anim.frames[i];
  dx += fr.dx || 0;
  if (++t >= fr.hold) {
    t = 0;
    if (i + 1 < anim.frames.length) { i++; enter(); } else if (anim.loop) { i = 0; enter(); } else t = fr.hold;
  }
  pose = withRoot(poses[anim.frames[i].pose], dx);
  const sol = solve(rig, pose, { time: g / 60, dt: 1 / 60, idle: true, springs });
  camX += (dx + 520 - camX) * 0.08;
  fx = fx.filter((e) => e.life-- > 0);
  projectiles = projectiles.filter((p) => p.life-- > 0);
  projectiles.forEach((p) => { p.pos[0] += p.vel[0]; p.pos[1] += p.vel[1]; });
  if (g % 2) continue; // 30 fps output

  const S = [SCALE, 0, 0, SCALE, W / 2 - SCALE * camX, GROUND_PX - SCALE * rig.groundY];
  const items = rig.parts.filter((p) => sol.visible[p.id])
    .map((p) => ({ p, z: sol.zOverride[p.id] ?? p.zIndex, m: mul(sol.W[p.id], T(p.offset.x, p.offset.y)) }))
    .sort((a, b) => a.z - b.z);
  const shadowX = sol.W.pelvis ? sol.W.pelvis[4] + 520 : dx + 520;
  let world = `<ellipse cx="${f(shadowX)}" cy="${rig.groundY + 6}" rx="190" ry="22" fill="#5a3f1c" opacity="0.25"/>`;
  world += items.map(({ p, m }) => `<image href="${png[p.id]}" width="${p.size.w}" height="${p.size.h}" transform="matrix(${m.map(f).join(' ')})"/>`).join('');
  for (const e of fx) {
    const a = e.life / e.max;
    const d = 'M' + e.outer.map((q) => q.map(f).join(',')).join('L') + 'L' + [...e.inner].reverse().map((q) => q.map(f).join(',')).join('L') + 'Z';
    world += `<path d="${d}" fill="#ffffff" fill-opacity="${f(0.85 * a)}" stroke="#d6464e" stroke-opacity="${f(a)}" stroke-width="6" stroke-linejoin="round"/>`;
  }
  for (const p of projectiles) {
    const ang = (Math.atan2(p.vel[1], p.vel[0]) * 180) / Math.PI - p.it.grip.axisDeg;
    world += `<g transform="translate(${f(p.pos[0])},${f(p.pos[1])}) rotate(${f(ang)}) translate(${-p.it.grip.x},${-p.it.grip.y})"><image href="${png[p.it.id]}" x="${p.it.offset.x}" y="${p.it.offset.y}" width="${p.it.size.w}" height="${p.it.size.h}"/></g>`;
    world += `<line x1="${f(p.pos[0] - p.vel[0] * 4)}" y1="${f(p.pos[1] - p.vel[1] * 4)}" x2="${f(p.pos[0] - 20)}" y2="${f(p.pos[1])}" stroke="#ffffff" stroke-width="5" stroke-opacity="0.7" stroke-linecap="round"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${stage(camX)}<g transform="matrix(${S.map(f).join(' ')})">${world}</g>${flash-- > 0 ? `<rect width="${W}" height="${H}" fill="#ff5060" opacity="0.15"/>` : ''}</svg>`;
  writeFileSync(join(FRAMES_DIR, `f_${String(out++).padStart(4, '0')}.png`), new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng());
}

const mp4 = join(ROOT, 'renders', `${name}.mp4`), gif = join(ROOT, 'renders', `${name}.gif`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(30 * SPEED), '-i', join(FRAMES_DIR, 'f_%04d.png'), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(30 * SPEED), '-i', join(FRAMES_DIR, 'f_%04d.png'), '-vf', 'fps=15,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif]);
rmSync(FRAMES_DIR, { recursive: true, force: true }); // keep only the encoded outputs
console.log(`${out} frames -> ${mp4}, ${gif}`);
