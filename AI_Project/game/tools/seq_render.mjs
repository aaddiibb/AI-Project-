// Offline review renderer: drives the REAL simulator + animator with scripted inputs and renders what the game shows.
//   node tools/seq_render.mjs [scenario ...] [--video] [--every N]
//     -> renders/seq_<scenario>.png (filmstrip of every Nth frame, default 3) and with --video renders/seq_<scenario>.mp4
// Scenarios are input scripts (see SCENARIOS). Requires `npm install` in art/shinobi (resvg) and ffmpeg for --video.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { Sim, BTN } from '../src/sim.js';
import { Animator } from '../src/animator.js';
import { MOVES } from '../src/moves.js';
import { solve, mul, T, anchor } from '../../art/shinobi/rig_runtime.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(GAME, '..', 'art', 'shinobi');
const { Resvg } = createRequire(join(ART, 'package.json'))('@resvg/resvg-js');
const OUT = join(GAME, 'renders');
mkdirSync(OUT, { recursive: true });

const rig = JSON.parse(readFileSync(join(ART, 'rig.json'), 'utf8'));
const poses = { ...JSON.parse(readFileSync(join(ART, 'poses.json'), 'utf8')), ...JSON.parse(readFileSync(join(ART, 'poses_extra.json'), 'utf8')) };
const png = Object.fromEntries(rig.parts.map((p) => [p.id, 'data:image/png;base64,' + readFileSync(join(ART, 'renders/parts', p.id + '.png')).toString('base64')]));
const kunai = rig.parts.find((p) => p.id === 'kunai');
const CENTER = 520, GROUND = 1300;
const f2 = (n) => +n.toFixed(2);

const { L, R: RT, U, D, P, K, S, B, ULT } = BTN;
// [from, to, bits] input spans for P1 (P2 holds `p2` bits); `x` = start positions
export const SCENARIOS = {
  crouch: { len: 150, spans: [[20, 70, D], [95, 140, D]] },
  crouch_attacks: { len: 170, x: [2350, 2900], spans: [[10, 160, D], [24, 26, D | P], [70, 72, D | K], [128, 130, D | P]] },
  jumps: { len: 210, x: [2000, 4200], spans: [[10, 26, U], [80, 96, U | RT], [150, 166, U | L]] },
  fjump: { len: 70, x: [2000, 4200], spans: [[5, 21, U | RT]] },
  air_stab: { len: 90, x: [2100, 2900], spans: [[5, 21, U | RT], [22, 24, U | RT | P]] },
  air_kick: { len: 90, x: [2100, 2900], spans: [[5, 21, U | RT], [24, 26, RT | K]] },
  standing: { len: 150, x: [2450, 2900], spans: [[10, 12, P], [24, 26, K], [38, 40, S]] },
  // demo reel of the new moves (rendered with --video --fps60)
  reel: { len: 660, x: [2450, 2950], meter: true, wide: true, spans: [
    [20, 70, D], [32, 34, D | P],               // crouch, crouch light sword
    [70, 110, D], [80, 82, D | K],              // crouch kick (sweep, knockdown)
    [190, 206, U | L],                          // back flip
    [240, 268, RT], [272, 288, U | RT], [300, 302, U | RT | P], // walk in, forward jump + dive stab
    [376, 392, U], [394, 396, K],               // neutral jump + flying kick
    [462, 464, ULT],                            // ultimate
  ] },
  ult: { len: 175, x: [2100, 3000], meter: true, spans: [[10, 12, ULT]] },
  ult_block: { len: 175, x: [2100, 3000], meter: true, spans: [[10, 12, ULT]], p2: B },
};

function inputAt(spans, fr) { let b = 0; for (const [a, z, bits] of spans) if (fr >= a && fr < z) b |= bits; return b; }

function drawFighter(f, sol, tint) {
  const F = [f.facing, 0, 0, 1, f.x - f.facing * CENTER, -f.h];
  const items = rig.parts.filter((p) => sol.visible[p.id])
    .map((p) => ({ p, z: sol.zOverride[p.id] ?? p.zIndex, m: mul(F, mul(sol.W[p.id], T(p.offset.x, p.offset.y))) }))
    .sort((a, b) => a.z - b.z);
  return `<g${tint ? ' filter="url(#p2)"' : ''}>` + items.map(({ p, m }) => `<image href="${png[p.id]}" width="${p.size.w}" height="${p.size.h}" transform="matrix(${m.map(f2).join(' ')})"/>`).join('') + '</g>';
}
const world = (f, q) => [f.x + f.facing * (q[0] - CENTER), q[1] - f.h];

export function run(name, { every = 3, video = false, fps60 = false } = {}) {
  const sc = SCENARIOS[name];
  const sim = new Sim();
  if (sc.x) { sim.f[0].x = sc.x[0]; sim.f[1].x = sc.x[1]; }
  if (sc.meter) sim.f[0].meter = 100;
  const anims = [new Animator(rig, poses), new Animator(rig, poses)];
  const springs = [{}, {}], facing = [1, -1];
  const frames = [];
  let freezeFx = 0;
  const sparks = [];
  for (let fr = 0; fr < sc.len; fr++) {
    sim.step([inputAt(sc.spans, fr), sc.p2 || 0]);
    for (const e of sim.events) { if (e.kind === 'super') freezeFx = MOVES.ult.freeze; if (e.kind === 'hit' || e.kind === 'block') sparks.push({ x: e.x, h: e.h, t: 0, block: e.kind === 'block' }); }
    const sols = sim.f.map((f, i) => {
      if (f.facing !== facing[i]) { for (const s of Object.values(springs[i])) { s.pos = null; s.vel = [0, 0]; } facing[i] = f.facing; }
      const pose = anims[i].step(f);
      pose.root = { x: pose.root.x + f.facing * f.x, y: pose.root.y }; // springs feel the fighter's motion (as in render.js)
      const idle = f.state === 'idle' || f.state === 'crouch' || f.state === 'guard';
      const sol = solve(rig, pose, { time: fr / 60, dt: 1 / 60, idle, springs: springs[i] });
      for (const id in sol.W) sol.W[id] = mul(T(-f.facing * f.x, 0), sol.W[id]);
      return sol;
    });
    if (fr % (video ? (fps60 ? 1 : 2) : every) === 0 || fr === sc.len - 1) frames.push(svgFrame(sim, sols, fr, freezeFx > 0, sparks));
    for (const sp of sparks) sp.t++;
    while (sparks.length && sparks[0].t > 10) sparks.shift();
    if (freezeFx > 0) freezeFx--;
  }
  return frames;
}

function svgFrame(sim, sols, fr, freeze, sparks = []) {
  const [a, b] = sim.f;
  const wide = sim.projectiles.length > 0 || CAM.wide;
  const cx = wide ? (a.x + b.x) / 2 : a.x + a.facing * 120, W = wide ? 3400 : 1500, H = wide ? 1912 : 1500, x0 = cx - W / 2, y0 = GROUND + 160 - H - (wide ? 0 : Math.max(0, a.h - 150));
  let fx = '';
  // ultimate: fan of kunai in both hands during the charge + windup
  sim.f.forEach((f, i) => {
    if (f.state !== 'attack' || f.move !== 'ult' || f.t > MOVES.ult.spawnAt) return;
    for (const an of ['hand_near_grip', 'hand_far_grip']) {
      const q = anchor(rig, sols[i], an); if (!q) continue;
      const [wx, wy] = world(f, q);
      for (const d of [-34, -12, 12, 34]) {
        const ang = (f.facing > 0 ? -60 : -120) + d;
        fx += `<g transform="translate(${f2(wx)},${f2(wy)}) rotate(${ang}) scale(0.95) translate(${-kunai.grip.x},${-kunai.grip.y})"><image href="${png.kunai}" x="${kunai.offset.x}" y="${kunai.offset.y}" width="${kunai.size.w}" height="${kunai.size.h}"/></g>`;
      }
      fx += `<circle cx="${f2(wx)}" cy="${f2(wy)}" r="70" fill="#ff7a1a" opacity="${freeze ? 0.55 : 0.3}"/>`;
    }
  });
  for (const p of sim.projectiles) {
    const X = p.x, Y = GROUND - p.h, ang = (Math.atan2(-(p.vy || 0), p.vx) * 180) / Math.PI;
    if (p.fan) fx += `<path d="M${f2(X)},${f2(Y)} L${f2(X - p.vx * 7)},${f2(Y + (p.vy || 0) * 7)}" stroke="#ff8a1e" stroke-width="22" stroke-linecap="round" opacity="0.75"/><path d="M${f2(X)},${f2(Y)} L${f2(X - p.vx * 4)},${f2(Y + (p.vy || 0) * 4)}" stroke="#ffe27a" stroke-width="9" stroke-linecap="round"/>`;
    fx += `<g transform="translate(${f2(X)},${f2(Y)}) rotate(${f2(ang)}) rotate(${-kunai.grip.axisDeg}) translate(${-kunai.grip.x},${-kunai.grip.y})"><image href="${png.kunai}" x="${kunai.offset.x}" y="${kunai.offset.y}" width="${kunai.size.w}" height="${kunai.size.h}"/></g>`;
  }
  for (const sp of sparks) {
    const k = sp.t / 10, r = (sp.block ? 110 : 170) * (0.4 + 0.6 * k), X = sp.x, Y = GROUND - sp.h;
    const pts = Array.from({ length: 20 }, (_, i) => { const ang = (i / 20) * Math.PI * 2, rr = i % 2 ? r * 0.35 : r; return `${f2(X + Math.cos(ang) * rr)},${f2(Y + Math.sin(ang) * rr)}`; }).join(' ');
    fx += `<polygon points="${pts}" fill="${sp.block ? '#cfe9ff' : '#ffffff'}" stroke="${sp.block ? '#7fb6e6' : '#d6263a'}" stroke-width="9" opacity="${f2(1 - k)}"/>`;
  }
  const body = drawFighter(b, sols[1], true) + drawFighter(a, sols[0], false);
  const label = `${fr} ${a.state === 'attack' ? a.move : a.state} t${a.t}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(x0)} ${f2(y0)} ${W} ${H}">
<defs><filter id="p2" filterUnits="userSpaceOnUse" x="-5000" y="-3000" width="20000" height="8000"><feColorMatrix type="matrix" values="0.55 0.2 0.2 0 0.05  0.2 0.55 0.2 0 0.05  0.25 0.25 0.7 0 0.08  0 0 0 1 0"/></filter></defs>
<rect x="${f2(x0)}" y="${f2(y0)}" width="${W}" height="${H}" fill="${freeze ? '#2b2236' : '#e9eef0'}"/>
<rect x="${f2(x0)}" y="${GROUND}" width="${W}" height="400" fill="#d6bd8a"/>
${Array.from({ length: 30 }, (_, i) => Math.floor(x0 / 200) * 200 + i * 200).map((x) => `<rect x="${x}" y="${GROUND}" width="10" height="40" fill="#b89a62"/>`).join('')}
${body}${fx}
<text x="${f2(x0 + 30)}" y="${f2(y0 + 90)}" font-family="Arial" font-size="${W / 18}" fill="${freeze ? '#fff' : '#333'}">${label}</text></svg>`;
}

const CAM = { wide: false };
const render = (svg, w) => new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: true } }).render().asPng();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const video = args.includes('--video'), fps60 = args.includes('--fps60');
  const everyIdx = args.indexOf('--every');
  const every = everyIdx >= 0 ? +args[everyIdx + 1] : 3;
  const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--every');
  for (const name of names.length ? names : Object.keys(SCENARIOS)) {
    if (video) CAM.wide = !!SCENARIOS[name].wide;
    const frames = run(name, { every, video, fps60 });
    if (video) {
      const dir = join(OUT, `_${name}_frames`);
      rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
      frames.forEach((svg, i) => writeFileSync(join(dir, `f_${String(i).padStart(4, '0')}.png`), render(svg, 1280)));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', fps60 ? '60' : '30', '-i', join(dir, 'f_%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', join(OUT, `seq_${name}.mp4`)]);
      rmSync(dir, { recursive: true, force: true });
      console.log(`${name}: ${frames.length} frames -> renders/seq_${name}.mp4`);
    } else {
      CAM.wide = !!SCENARIOS[name].wide;
      const cols = 8, tw = 300, th = 300;
      const tiles = frames.map((svg) => render(svg, tw * 2));
      const rows = Math.ceil(tiles.length / cols);
      const imgs = tiles.map((b, i) => `<image href="data:image/png;base64,${b.toString('base64')}" x="${(i % cols) * tw}" y="${Math.floor(i / cols) * th}" width="${tw}" height="${th}"/>`).join('');
      writeFileSync(join(OUT, `seq_${name}.png`), render(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * tw} ${rows * th}">${imgs}</svg>`, cols * tw * 2));
      console.log(`${name}: ${frames.length} frames -> renders/seq_${name}.png`);
    }
  }
}
