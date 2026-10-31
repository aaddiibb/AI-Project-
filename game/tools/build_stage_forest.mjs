// The Shinobi's stage: a misty mountain bamboo forest at golden hour, as layered SVGs (world units: 5200 wide, ground line
// y = 1300, +y down; same layout contract as tools/build_stage.mjs).
//   node tools/build_stage_forest.mjs   -> assets/stage_forest/*.svg, stage.json, preview.png
// Every layer sits BEHIND the fighters (parallax factor <= 1): nothing is drawn in front of them. The ambient particles
// (drifting bamboo leaves) are drawn by stage.js, also behind the fighters.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '../../art/shinobi/node_modules/@resvg/resvg-js/index.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'stage_forest');
mkdirSync(OUT, { recursive: true });

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const f1 = (n) => +n.toFixed(1);
const svg = (x, y, w, h, inner, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${inner}</svg>`;
const grad = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
const rgrad = (id, stops) => `<radialGradient id="${id}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;
const INK = '#26313a';

const layers = [];
const add = (name, factor, x, y, w, h, scale, inner, defs = '') => {
  writeFileSync(join(OUT, name + '.svg'), svg(x, y, w, h, inner, defs));
  layers.push({ name, file: `${name}.svg`, factor, x, y, w, h, scale });
};

/** jagged mountain ridge polygon from x0..x1 around baseline yb with peaks up to yb - amp */
function ridge(r, x0, x1, yb, amp, step, floor) {
  const pts = [[x0, floor]];
  for (let x = x0; x <= x1; x += step * (0.6 + r() * 0.8)) pts.push([x, yb - amp * (0.25 + r() * 0.75)]);
  pts.push([x1, yb - amp * 0.4], [x1, floor]);
  return 'M' + pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' L') + ' Z';
}
/** smooth rolling silhouette (canopy) */
function rolling(r, x0, x1, yb, amp, step, floor) {
  let d = `M${x0},${floor} L${x0},${yb}`;
  let x = x0;
  while (x < x1) { const nx = x + step * (0.7 + r() * 0.6); d += ` Q${f1((x + nx) / 2)},${f1(yb - amp * (0.4 + r() * 0.8))} ${f1(nx)},${f1(yb - amp * r() * 0.3)}`; x = nx; }
  return d + ` L${x1},${floor} Z`;
}
/** one bamboo stalk: segmented, with node rings and a few leaf sprays */
function bamboo(r, x, top, bottom, w, col, colDark, leaf, leafAlpha = 1) {
  let o = `<rect x="${f1(x - w / 2)}" y="${top}" width="${w}" height="${bottom - top}" fill="${col}"/>`;
  o += `<rect x="${f1(x - w / 2)}" y="${top}" width="${f1(w * 0.28)}" height="${bottom - top}" fill="#ffffff" fill-opacity=".12"/>`;
  o += `<rect x="${f1(x + w * 0.22)}" y="${top}" width="${f1(w * 0.28)}" height="${bottom - top}" fill="${colDark}" fill-opacity=".45"/>`;
  for (let y = bottom - 120 - r() * 60; y > top + 40; y -= 150 + r() * 70) {
    o += `<rect x="${f1(x - w / 2 - 2)}" y="${f1(y)}" width="${w + 4}" height="${f1(Math.max(4, w * 0.16))}" fill="${colDark}" rx="2"/>`;
    if (r() < 0.45) { // leaf spray from the node
      const dir = r() < 0.5 ? -1 : 1;
      for (let k = 0; k < 3 + Math.floor(r() * 3); k++) {
        const len = 70 + r() * 90, ang = dir * (20 + r() * 50), rad = (ang * Math.PI) / 180;
        const ex = x + dir * len * Math.cos(Math.abs(rad)), ey = y + 20 + len * Math.sin(Math.abs(rad)) * 0.6 + k * 8;
        o += `<path d="M${f1(x)},${f1(y)} Q${f1((x + ex) / 2)},${f1(y - 10)} ${f1(ex)},${f1(ey)} Q${f1((x + ex) / 2)},${f1(y + 18)} ${f1(x)},${f1(y)} Z" fill="${leaf}" fill-opacity="${leafAlpha}"/>`;
      }
    }
  }
  return o;
}

// 1 sky: golden hour, sun and soft clouds -------------------------------
{
  const X = -700, Y = -2000, W = 6600, H = 3500, r = rng(1);
  let clouds = '';
  for (let i = 0; i < 9; i++) { const cx = X + r() * W, cy = -900 + r() * 900, w = 400 + r() * 700; clouds += `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(w)}" ry="${f1(w * 0.12)}" fill="#fff4dc" fill-opacity="${f1(0.25 + r() * 0.3)}"/>`; }
  add('sky', 0.03, X, Y, W, H, 0.25,
    `<rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#fsky)"/>
     <circle cx="3500" cy="180" r="900" fill="url(#sunglow)"/><circle cx="3500" cy="180" r="230" fill="#fff1c4"/>${clouds}`,
    grad('fsky', [[0, '#35577f'], [0.38, '#7b8fb0'], [0.6, '#f0b77e'], [0.75, '#ffd6a0'], [1, '#ffe7c2']]) + rgrad('sunglow', [[0, '#ffe2a6', 0.9], [1, '#ffb76b', 0]]));
}

// 2 far peaks + mist ----------------------------------------------------
{
  const X = -300, Y = -400, W = 5800, H = 1700, r = rng(2);
  add('peaks', 0.08, X, Y, W, H, 0.3,
    `<path d="${ridge(r, X, X + W, 700, 950, 260, 1300)}" fill="#a7b3cf"/>
     <path d="${ridge(r, X, X + W, 820, 700, 200, 1300)}" fill="#8f9dbd"/>
     <rect x="${X}" y="520" width="${W}" height="780" fill="url(#mist1)"/>`,
    grad('mist1', [[0, '#ffe2bd', 0], [0.5, '#ffe6c6', 0.55], [1, '#fff0d8', 0.9]]));
}

// 3 mid cliffs: waterfall (left) and a pagoda on a crag (right) ---------
{
  const X = -300, Y = -300, W = 5800, H = 1600, r = rng(3);
  const crag = (cx, top, w) => `<path d="M${cx - w},1300 L${cx - w * 0.6},${top + 260} L${cx - w * 0.35},${top + 40} L${cx - w * 0.1},${top} L${cx + w * 0.25},${top + 30} L${cx + w * 0.45},${top + 180} L${cx + w},1300 Z" fill="#5f7390"/><path d="M${cx - w * 0.35},${top + 40} L${cx - w * 0.1},${top} L${cx + w * 0.05},${top + 400} L${cx - w * 0.2},${top + 700} Z" fill="#738aa8" fill-opacity=".6"/>`;
  let pagoda = '';
  const px = 3900, py = 60;
  for (let i = 0; i < 4; i++) {
    const w = 240 - i * 42, y = py - i * 120;
    pagoda += `<rect x="${px - w * 0.55}" y="${y - 70}" width="${w * 1.1}" height="70" fill="#7a4a3a"/><path d="M${px - w - 40},${y - 64} Q${px - w},${y - 90} ${px - w * 0.6},${y - 110} L${px + w * 0.6},${y - 110} Q${px + w},${y - 90} ${px + w + 40},${y - 64} Z" fill="#3c4660"/>`;
  }
  pagoda += `<rect x="${px - 6}" y="${py - 620}" width="12" height="150" fill="#3c4660"/>`;
  let fall = `<path d="M1180,-40 C1190,300 1200,700 1230,1300 L1330,1300 C1300,700 1290,300 1290,-40 Z" fill="#e8f2f6" fill-opacity=".85"/>`;
  for (let i = 0; i < 9; i++) fall += `<path d="M${1195 + i * 11},${f1(-20 + r() * 80)} V1300" stroke="#ffffff" stroke-opacity="${f1(0.3 + r() * 0.5)}" stroke-width="4"/>`;
  fall += `<ellipse cx="1260" cy="1240" rx="260" ry="70" fill="#ffffff" fill-opacity=".55"/>`;
  add('cliffs', 0.18, X, Y, W, H, 0.35,
    `${crag(1100, -100, 700)}${fall}${crag(3900, 100, 760)}${pagoda}
     <path d="${ridge(r, X, X + W, 1050, 260, 180, 1300)}" fill="#55688a" fill-opacity=".9"/>
     <rect x="${X}" y="820" width="${W}" height="480" fill="url(#mist2)"/>`,
    grad('mist2', [[0, '#ffe9cf', 0], [1, '#fff2df', 0.8]]));
}

// 4 forest canopy band ---------------------------------------------------
{
  const X = -300, Y = 500, W = 5800, H = 820, r = rng(4);
  add('canopy', 0.35, X, Y, W, H, 0.4,
    `<path d="${rolling(r, X, X + W, 820, 220, 220, 1320)}" fill="#47705a"/>
     <path d="${rolling(r, X, X + W, 930, 180, 170, 1320)}" fill="#3b6150"/>
     <path d="${rolling(r, X, X + W, 1020, 120, 140, 1320)}" fill="#2f5244"/>
     <rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#cmist)"/>`,
    grad('cmist', [[0, '#ffe9cf', 0.35], [0.6, '#ffe9cf', 0.1], [1, '#ffe9cf', 0]]));
}

// 4b a small mountain shrine gate in the clearing (hazed by the back grove in front of it) ------------------
{
  const X = 2050, Y = 640, W = 1100, H = 680, cx = 2600, yb = 1240;
  const post = (x) => `<path d="M${x - 22},${yb} L${x - 18},${yb - 400} H${x + 18} L${x + 22},${yb} Z" fill="#c8483a" stroke="${INK}" stroke-opacity=".5" stroke-width="3"/><rect x="${x - 30}" y="${yb - 26}" width="60" height="26" fill="#2f2c3a"/>`;
  const lamp = (x) => `<path d="M${x},${yb - 318} v34" stroke="${INK}" stroke-width="3"/><ellipse cx="${x}" cy="${yb - 252}" rx="26" ry="36" fill="#f2e6c8" stroke="${INK}" stroke-opacity=".6" stroke-width="3"/><path d="M${x - 24},${yb - 262} q24,12 48,0 M${x - 24},${yb - 242} q24,12 48,0" stroke="#b9a37a" stroke-width="2" fill="none"/><rect x="${x - 14}" y="${yb - 292}" width="28" height="8" fill="${INK}"/>`;
  const steps = Array.from({ length: 4 }, (_, k) => `<rect x="${cx - 200 - k * 30}" y="${yb + k * 14 - 6}" width="${400 + k * 60}" height="14" fill="${k % 2 ? '#8e938a' : '#a3a89c'}"/>`).join('');
  add('shrine', 0.5, X, Y, W, H, 0.4,
    `${steps}${post(cx - 170)}${post(cx + 170)}<rect x="${cx - 190}" y="${yb - 330}" width="380" height="22" fill="#c8483a" stroke="${INK}" stroke-opacity=".5" stroke-width="3"/>
     <path d="M${cx - 270},${yb - 402} Q${cx - 210},${yb - 384} ${cx - 170},${yb - 400} H${cx + 170} Q${cx + 210},${yb - 384} ${cx + 270},${yb - 402} L${cx + 240},${yb - 428} H${cx - 240} Z" fill="#2f2c3a"/>
     <path d="M${cx - 280},${yb - 406} Q${cx - 220},${yb - 386} ${cx - 170},${yb - 406} H${cx + 170} Q${cx + 220},${yb - 386} ${cx + 280},${yb - 406} L${cx + 268},${yb - 420} Q${cx + 180},${yb - 408} ${cx + 140},${yb - 418} H${cx - 140} Q${cx - 180},${yb - 408} ${cx - 268},${yb - 420} Z" fill="#c8483a"/>
     <rect x="${cx - 16}" y="${yb - 400}" width="32" height="70" fill="#a73a2c"/>
     <path d="M${cx - 150},${yb - 300} Q${cx},${yb - 250} ${cx + 150},${yb - 300}" stroke="#e9dcb8" stroke-width="10" fill="none"/>${[-90, -30, 30, 90].map((d) => `<path d="M${cx + d},${yb - 280 + Math.abs(d) * 0.18} l-10,40 h20 Z" fill="#f6f0e0"/>`).join('')}
     ${lamp(cx - 110)}${lamp(cx + 110)}
     <ellipse cx="${cx}" cy="${yb + 40}" rx="420" ry="40" fill="#fff0d6" fill-opacity=".35"/>`);
}

// 5 back bamboo grove (hazy) --------------------------------------------
{
  const X = -500, Y = -1500, W = 6200, H = 2800, r = rng(5);
  let o = '';
  // clumps with gaps and a clearing in the middle (the waterfall and the pagoda stay visible), slight leans
  for (let c = X + 80; c < X + W; c += 380 + r() * 420) {
    if (c > 1500 && c < 3700 && r() < 0.75) continue; // clearing
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const x = c + (r() - 0.5) * 220, lean = (r() - 0.5) * 5;
      o += `<g transform="rotate(${f1(lean)} ${f1(x)} 1300)">${bamboo(r, x, Y, 1300, 24 + r() * 16, '#86a873', '#5f8455', '#7aa36a', 0.85)}</g>`;
    }
  }
  add('bamboo_back', 0.6, X, Y, W, H, 0.3, `${o}<rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#bhaze)"/>`,
    grad('bhaze', [[0, '#fff0d6', 0.25], [0.7, '#fff0d6', 0.35], [1, '#fff0d6', 0.15]]));
}

// 6 near bamboo + rocks, only at the sides (the middle stays open) -------
{
  const X = -500, Y = -1600, W = 6200, H = 2950, r = rng(6);
  let o = '';
  const side = (a, b) => { for (let x = a; x < b; x += 120 + r() * 140) o += bamboo(r, x, Y, 1300, 46 + r() * 22, '#5f8f4c', '#3f6a38', '#6c9e58'); };
  side(X + 60, 700); side(4500, X + W - 40);
  // leafy crowns along the top of the near grove: frames the scene from above (far above the fighters' heads)
  for (let i = 0; i < 70; i++) {
    const x = X + r() * W, y = Y + 200 + r() * 700, w = 160 + r() * 260;
    if (x > 900 && x < 4300 && y > -900) continue;
    o += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(w)}" ry="${f1(w * 0.35)}" fill="${r() < 0.5 ? '#4f7f42' : '#6c9e58'}" fill-opacity=".9" transform="rotate(${f1((r() - 0.5) * 30)} ${f1(x)} ${f1(y)})"/>`;
  }
  const rock = (cx, w, h) => `<path d="M${cx - w},1300 Q${cx - w * 0.9},${1300 - h} ${cx - w * 0.2},${1300 - h * 1.05} Q${cx + w * 0.7},${1300 - h * 0.9} ${cx + w},1300 Z" fill="#6d7a72" stroke="${INK}" stroke-opacity=".35" stroke-width="5"/><path d="M${cx - w * 0.5},${1300 - h * 0.8} Q${cx},${1300 - h} ${cx + w * 0.4},${1300 - h * 0.85}" stroke="#9fb0a2" stroke-width="8" fill="none" stroke-opacity=".6"/><ellipse cx="${cx - w * 0.2}" cy="${1300 - h * 0.95}" rx="${w * 0.35}" ry="${h * 0.12}" fill="#6f9c5a" fill-opacity=".7"/>`;
  o += rock(520, 220, 150) + rock(820, 120, 80) + rock(4650, 260, 170) + rock(4380, 110, 70);
  // a small stone shrine marker on the right, a moss-covered jizo on the left
  o += `<rect x="4040" y="1080" width="70" height="220" fill="#8e938a" stroke="${INK}" stroke-opacity=".4" stroke-width="4"/><path d="M4010,1084 L4140,1084 L4075,1030 Z" fill="#6e746d"/><rect x="4022" y="1180" width="106" height="16" fill="#c8483a"/>`;
  o += `<ellipse cx="1080" cy="1250" rx="60" ry="55" fill="#8e938a"/><circle cx="1080" cy="1170" r="38" fill="#9aa096"/><path d="M1032,1210 Q1080,1240 1128,1210 L1120,1232 Q1080,1252 1040,1232 Z" fill="#c8483a"/>`;
  add('bamboo_near', 0.85, X, Y, W, H, 0.3, o);
}

// 7 floor: mossy stone path through the grove ------------------------------
{
  const X = -700, Y = 1170, W = 6600, H = 760, r = rng(7);
  const rows = [1196, 1226, 1266, 1320, 1396, 1500, 1640, 1860];
  let o = `<rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#ffloor)"/>`;
  const spacing = (y) => 110 + (y - 1196) * 0.7;
  for (let i = 0; i < rows.length - 1; i++) {
    const y0 = rows[i], y1 = rows[i + 1], s0 = spacing(y0), s1 = spacing(y1);
    for (let k = -40; k < 40; k++) {
      const j = (r() - 0.5) * 0.25;
      const a0 = 2600 + (k + j) * s0, b0 = 2600 + (k + 1 + j) * s0, a1 = 2600 + (k + j) * s1, b1 = 2600 + (k + 1 + j) * s1;
      if (b1 < X || a1 > X + W) continue;
      const t = r();
      o += `<path d="M${f1(a0 + 4)},${y0 + 2} L${f1(b0 - 4)},${y0 + 2} L${f1(b1 - 6)},${y1 - 2} L${f1(a1 + 6)},${y1 - 2} Z" fill="${t < 0.3 ? '#a9a99a' : t < 0.65 ? '#b6b5a5' : '#c2c0ae'}" stroke="#6f7563" stroke-opacity=".55" stroke-width="${f1(2 + i * 0.6)}"/>`;
      if (r() < 0.3) { // irregular moss creeping along the stone edges
        const mx = (a1 + b1) / 2 + (r() - 0.5) * s1 * 0.6, my = y1 - 4, mw = s1 * (0.25 + r() * 0.35), mh = (y1 - y0) * (0.18 + r() * 0.2);
        o += `<path d="M${f1(mx - mw)},${f1(my)} Q${f1(mx - mw * 0.6)},${f1(my - mh)} ${f1(mx - mw * 0.1)},${f1(my - mh * 0.7)} Q${f1(mx + mw * 0.4)},${f1(my - mh * 1.2)} ${f1(mx + mw)},${f1(my)} Z" fill="#6f9c5a" fill-opacity=".35"/>`;
      }
    }
  }
  // grass tufts along the back edge of the path
  for (let i = 0; i < 260; i++) { const x = X + r() * W, y = 1188 + r() * 30, h = 18 + r() * 34; o += `<path d="M${f1(x)},${f1(y)} l${f1(-6 + r() * 4)},${f1(-h)} l6,${f1(h)} l${f1(4 + r() * 6)},${f1(-h * 0.8)} l2,${f1(h * 0.8)} Z" fill="${r() < 0.5 ? '#5f8f4c' : '#76a85d'}"/>`; }
  o += `<rect x="${X}" y="1190" width="${W}" height="42" fill="url(#fsh)"/><rect x="${X}" y="1700" width="${W}" height="230" fill="url(#fsh2)"/>`;
  add('floor', 1, X, Y, W, H, 0.5, o,
    grad('ffloor', [[0, '#7d8b6a'], [1, '#a2a48c']]) + grad('fsh', [[0, '#2b3a28', 0.45], [1, '#2b3a28', 0]]) + grad('fsh2', [[0, '#2a3326', 0], [1, '#2a3326', 0.6]]));
}

// 8 mossy stone lanterns (toro) at the extremes ----------------------------
{
  const X = 0, W = 5200, Y = 560, H = 760;
  const g = (d, fill) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-opacity=".55" stroke-width="4" stroke-linejoin="round"/>`;
  const moss = (x, y, w) => `<path d="M${x - w},${y} Q${x - w * 0.4},${y - 16} ${x},${y - 6} Q${x + w * 0.5},${y - 18} ${x + w},${y} Q${x},${y + 10} ${x - w},${y} Z" fill="#6f9c5a" fill-opacity=".85"/>`;
  const toro = (x, y) => `<g transform="translate(${x} ${y})">
    ${g('M-110,0 L110,0 L98,-40 L-98,-40 Z', '#7d8478')}${g('M-36,-40 L36,-40 L30,-300 L-30,-300 Z', '#959b8e')}<path d="M-36,-40 L-22,-40 L-16,-300 L-30,-300 Z" fill="#b8bdb0" fill-opacity=".6"/>
    ${g('M-88,-300 L88,-300 L80,-338 L-80,-338 Z', '#7d8478')}${g('M-60,-338 L60,-338 L60,-440 L-60,-440 Z', '#959b8e')}
    <rect x="-34" y="-410" width="68" height="56" rx="6" fill="#ffd36e" stroke="${INK}" stroke-opacity=".7" stroke-width="4"/><rect x="-34" y="-410" width="68" height="56" rx="6" fill="url(#tg)"/>
    ${g('M-156,-440 Q-56,-452 0,-514 Q56,-452 156,-440 Q136,-426 110,-430 L-110,-430 Q-136,-426 -156,-440 Z', '#7d8478')}
    ${g('M-44,-514 Q0,-582 44,-514 Z', '#959b8e')}${moss(-60, -440, 70)}${moss(70, -446, 60)}${moss(0, -300, 70)}${moss(-50, -2, 70)}${moss(60, 0, 50)}</g>`;
  add('lanterns', 1, X, Y, W, H, 0.5, toro(300, 1335) + toro(4900, 1335), rgrad('tg', [[0, '#fff3b0', 0.9], [1, '#ffb347', 0.2]]));
}

// light sources for the evening / night / storm looks (atmosphere.js), layer-local world coordinates
const lights = [
  ...[300, 4900].map((x) => ({ layer: 'lanterns', kind: 'point', x, y: 953, r: 250, color: '#ffb347', flicker: 1 })),
  ...[2490, 2710].map((x) => ({ layer: 'shrine', kind: 'point', x, y: 988, r: 120, color: '#ffbe6a', flicker: 1 })),
  ...[60, -60, -180].map((y, i) => ({ layer: 'cliffs', kind: 'point', x: 3900, y: y - 40, r: 70 - i * 10, color: '#ffb347', a: 0.75 })),
];
writeFileSync(join(OUT, 'stage.json'), JSON.stringify({ name: 'Bamboo mountain', worldW: 5200, groundY: 1300, ambient: 'leaves', layers, lights }, null, 1));

// review render at camera centre
const parts = layers.map((l) => `<image x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" href="data:image/svg+xml;base64,${Buffer.from(readFileSync(join(OUT, l.file))).toString('base64')}"/>`).join('');
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -900 5200 2925" width="5200" height="2925">${parts}</svg>`;
writeFileSync(join(OUT, 'preview.png'), new Resvg(full, { fitTo: { mode: 'width', value: 1920 } }).render().asPng());
console.log('forest stage built:', layers.map((l) => l.name).join(', '));
