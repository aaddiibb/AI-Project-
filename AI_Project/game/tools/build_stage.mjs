// Generates the stage background as layered SVGs (world units: 5200 wide, ground line y = 1300, +y is down).
//   node tools/build_stage.mjs   -> assets/stage/*.svg, assets/stage/stage.json, assets/stage/preview.png
// Each layer is positioned in world units; stage.js scrolls it with a parallax factor.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '../../art/shinobi/node_modules/@resvg/resvg-js/index.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'stage');
mkdirSync(OUT, { recursive: true });

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const f1 = (n) => +n.toFixed(1);
const pick = (r, a) => a[Math.floor(r() * a.length)];

// palette: bright daytime, warm paper tones
const C = {
  skyTop: '#6db6ea', skyMid: '#a8d8f2', skyLow: '#f5ecd2', skyHorizon: '#fde4bf',
  ink: '#2b2a3a', wood: '#6a4429', woodDark: '#4a2e1d', woodLight: '#9a6a43', plaster: '#f4efe1', plasterShade: '#e2dac4',
  tile: '#56648a', tileDark: '#3b4766', tileLight: '#7686ac', vermilion: '#d1503b', vermilionDark: '#a73a2c',
  stone: '#b9b4a7', stoneDark: '#8d887b', stoneLight: '#d9d4c6', gold: '#e2b857', pineDark: '#456e5a', pineMid: '#5d8a70', pineLight: '#7aa88a',
  pink: ['#f9cfda', '#f6b7c9', '#fde3ea', '#f1a3bb', '#ffffff'],
};

const svg = (x, y, w, h, inner, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${inner}</svg>`;
const grad = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
const rgrad = (id, stops) => `<radialGradient id="${id}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;

// ------------------------------------------------------------------ shared pieces
/** curved (hip) roof with upturned eaves; l..r at eave height ye, ridge at yr */
function roof(l, r, ye, yr, { fill = C.tile, dark = C.tileDark, light = C.tileLight, rafters = true, id = 'rf', ridgeW = 0.18 } = {}) {
  const w = r - l, rl = l + w * ridgeW, rr = r - w * ridgeW, ov = 90;
  const outline = `M${l - ov},${ye - 14} Q${l - 30},${ye + 62} ${l + 110},${ye + 62} L${r - 110},${ye + 62} Q${r + 30},${ye + 62} ${r + ov},${ye - 14} C${r - 30},${ye - 120} ${rr + 60},${yr + 160} ${rr},${yr} L${rl},${yr} C${rl - 60},${yr + 160} ${l + 30},${ye - 120} ${l - ov},${ye - 14} Z`;
  const tiles = Math.round((ye - yr) / 30);
  let lines = '';
  for (let k = 1; k < tiles; k++) { const y = yr + (k * (ye - yr + 60)) / tiles; lines += `<path d="M${l - ov},${f1(y)} H${r + ov}" stroke="${dark}" stroke-opacity=".38" stroke-width="3.2"/>`; }
  let cols = '';
  for (let k = 0; k <= Math.round((w + 2 * ov) / 38); k++) cols += `M${l - ov + k * 38},${yr} V${ye + 70} `;
  const eaves = Array.from({ length: Math.round(w / 34) }, (_, k) => `<path d="M${l + 60 + k * 34},${ye + 54} a15,15 0 0 0 30,0 Z" fill="${dark}" stroke="${light}" stroke-opacity=".5" stroke-width="2"/>`).join('');
  const raft = rafters ? `<rect x="${l - 20}" y="${ye + 62}" width="${w + 40}" height="52" fill="#3d2a20"/>${Array.from({ length: Math.round(w / 30) }, (_, k) => `<rect x="${l + 4 + k * 30}" y="${ye + 62}" width="14" height="52" fill="#5a3d2c"/>`).join('')}<rect x="${l - 20}" y="${ye + 110}" width="${w + 40}" height="10" fill="#2a1d17"/>` : '';
  return `<clipPath id="${id}c"><path d="${outline}"/></clipPath>
  <path d="${outline}" fill="url(#${id}g)"/>
  <g clip-path="url(#${id}c)">${lines}<path d="${cols}" stroke="${dark}" stroke-opacity=".16" stroke-width="2.4"/>
    <path d="M${l - ov},${ye + 20} Q${(l + r) / 2},${ye - 40} ${r + ov},${ye + 20} L${r + ov},${ye + 70} L${l - ov},${ye + 70} Z" fill="#1b2238" fill-opacity=".22"/>
    <rect x="${l - ov}" y="${yr - 6}" width="${w + 2 * ov}" height="${(ye - yr) * 0.2}" fill="#fff" fill-opacity=".10"/></g>
  <path d="${outline}" fill="none" stroke="${C.ink}" stroke-opacity=".55" stroke-width="5" stroke-linejoin="round"/>
  ${eaves}
  <rect x="${rl - 26}" y="${yr - 30}" width="${rr - rl + 52}" height="38" rx="10" fill="${dark}" stroke="${C.ink}" stroke-opacity=".6" stroke-width="4"/>
  <rect x="${rl - 20}" y="${yr - 30}" width="${rr - rl + 40}" height="10" rx="5" fill="${light}" fill-opacity=".55"/>
  <path d="M${rl - 26},${yr - 22} q-46,-58 -8,-110 q-4,50 34,70 Z" fill="${dark}" stroke="${C.ink}" stroke-opacity=".6" stroke-width="4"/>
  <path d="M${rr + 26},${yr - 22} q46,-58 8,-110 q4,50 -34,70 Z" fill="${dark}" stroke="${C.ink}" stroke-opacity=".6" stroke-width="4"/>
  ${raft}`;
}
const roofGrad = (id, a, b) => grad(id + 'g', [[0, a], [1, b]]);

function pine(x, y, s, r, cols = [C.pineDark, C.pineMid, C.pineLight]) {
  let o = `<rect x="${f1(x - 5 * s)}" y="${f1(y - 70 * s)}" width="${f1(10 * s)}" height="${f1(70 * s)}" fill="#5a4033"/>`;
  const tiers = 3 + Math.floor(r() * 2);
  for (let i = 0; i < tiers; i++) {
    const ty = y - 60 * s - i * 62 * s, w = (120 - i * 20) * s;
    o += `<path d="M${f1(x - w)},${f1(ty + 30 * s)} Q${f1(x)},${f1(ty - 26 * s)} ${f1(x + w)},${f1(ty + 30 * s)} Q${f1(x)},${f1(ty + 6 * s)} ${f1(x - w)},${f1(ty + 30 * s)} Z" fill="${cols[i % 3]}"/>`;
  }
  return o;
}

function blossomCrown(r, cx, cy, rx, ry, n = 150) {
  let o = '';
  const shade = ['#e68fa9', '#ee9fb6', '#f3b0c4'], mid = C.pink.slice(0, 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, rad = 55 + r() * 85;
    const low = (y - cy) / ry; // lower part of the crown is in shade
    const col = low > 0.2 ? pick(r, shade) : pick(r, mid);
    o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="${col}" fill-opacity=".93"/>`;
  }
  for (let i = 0; i < n * 2.2; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * 1.02 * d, y = cy + Math.sin(a) * ry * 1.02 * d;
    o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(7 + r() * 9)}" fill="${pick(r, ['#fff', '#fff0f4', '#fbd6e1'])}" fill-opacity=".9"/>`;
  }
  return o;
}

function lantern(x, y, s = 1) {
  const g = (d, fill) => `<path d="${d}" fill="${fill}" stroke="${C.ink}" stroke-opacity=".6" stroke-width="${f1(4 * s)}" stroke-linejoin="round"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    ${g('M-120,0 L120,0 L108,-42 L-108,-42 Z', C.stoneDark)}${g('M-84,-42 L84,-42 L72,-84 L-72,-84 Z', C.stone)}
    ${g('M-40,-84 L40,-84 L34,-330 L-34,-330 Z', C.stone)}<path d="M-40,-84 L-24,-84 L-18,-330 L-34,-330 Z" fill="${C.stoneLight}" fill-opacity=".7"/>
    ${g('M-98,-330 L98,-330 L90,-372 L-90,-372 Z', C.stoneDark)}
    ${g('M-66,-372 L66,-372 L66,-486 L-66,-486 Z', C.stone)}<rect x="-38" y="-452" width="76" height="62" rx="6" fill="#ffd36e" stroke="${C.ink}" stroke-opacity=".7" stroke-width="${f1(4 * s)}"/><rect x="-38" y="-452" width="76" height="62" rx="6" fill="url(#lg)"/>
    <path d="M-66,-452 H66 M0,-486 V-372" stroke="${C.ink}" stroke-opacity=".35" stroke-width="3"/>
    ${g('M-170,-486 Q-60,-500 0,-566 Q60,-500 170,-486 Q150,-470 120,-476 L-120,-476 Q-150,-470 -170,-486 Z', C.stoneDark)}
    ${g('M-48,-566 Q0,-640 48,-566 Z', C.stone)}<circle cx="0" cy="-640" r="14" fill="${C.stoneLight}" stroke="${C.ink}" stroke-opacity=".6" stroke-width="3"/></g>`;
}

// ------------------------------------------------------------------ layers
const layers = [];
const add = (name, factor, x, y, w, h, scale, inner, defs) => {
  writeFileSync(join(OUT, name + '.svg'), svg(x, y, w, h, inner, defs));
  layers.push({ name, file: `${name}.svg`, factor, x, y, w, h, scale });
};

// 0 sky ----------------------------------------------------------------
{
  const r = rng(11);
  const X = -700, W = 6600, Y = -2000, H = 3500;
  let cl = '';
  const cloud = (x, y, s, a = 0.95) => {
    const n = 5 + Math.floor(r() * 3); let top = '';
    for (let i = 0; i < n; i++) { const rad = (40 + r() * 70) * s; top += `<circle cx="${f1(x + (i - n / 2) * 78 * s)}" cy="${f1(y - rad * 0.45 + (r() - 0.5) * 20 * s)}" r="${f1(rad)}" fill="#fff" fill-opacity="${a}"/>`; }
    return `${top}<rect x="${f1(x - n * 40 * s)}" y="${f1(y - 20 * s)}" width="${f1(n * 80 * s)}" height="${f1(46 * s)}" rx="${f1(23 * s)}" fill="#fff" fill-opacity="${a}"/><rect x="${f1(x - n * 36 * s)}" y="${f1(y + 8 * s)}" width="${f1(n * 72 * s)}" height="${f1(20 * s)}" rx="${f1(10 * s)}" fill="#cfe0f0" fill-opacity=".55"/>`;
  };
  const spots = [[200, -700, 1.6], [1500, -1100, 1.2], [2700, -500, 1.9], [4200, -1000, 1.5], [5200, -400, 1.3], [800, 100, 1.1], [3400, 80, 1.0], [4800, 200, 1.2]];
  for (const [x, y, s] of spots) cl += cloud(x, y, s);
  // long golden mist bands (kasumi)
  let mist = '';
  for (const [y, op] of [[560, 0.55], [700, 0.5], [860, 0.6]]) mist += `<path d="M${X},${y} Q800,${y - 40} 1700,${y} T3500,${y} T5300,${y} T${X + W},${y} V${y + 70} H${X} Z" fill="#fff6dc" fill-opacity="${op}"/>`;
  add('sky', 0.03, X, Y, W, H, 0.25,
    `<rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#sky)"/><circle cx="3900" cy="-150" r="1100" fill="url(#sun)"/><circle cx="3900" cy="-150" r="150" fill="#fff8e1"/>${cl}${mist}`,
    grad('sky', [[0, C.skyTop], [0.35, C.skyMid], [0.7, C.skyLow], [1, C.skyHorizon]]) + rgrad('sun', [[0, '#fff6d8', 0.95], [0.3, '#fff0c4', 0.45], [1, '#fff0c4', 0]]));
}

// 1 far mountains ------------------------------------------------------
{
  const X = -300, W = 5800, Y = -200, H = 1500;
  const fuji = `M200,1200 Q1000,1130 1500,560 Q1640,380 1750,360 Q1860,380 2000,560 Q2500,1130 3300,1200 Z`;
  const snow = `M1440,640 Q1560,420 1750,360 Q1940,420 2060,640 L1990,600 L1930,690 L1860,590 L1790,730 L1730,610 L1660,700 L1600,600 L1530,680 Z`;
  const snowShade = `M1750,360 Q1940,420 2060,640 L1990,600 L1930,690 L1860,590 L1790,730 L1750,620 Z`;
  const ridge = (pts, fill) => `<path d="M${pts.map((p) => p.join(',')).join(' L')} V1250 H${pts[0][0]} Z" fill="${fill}"/>`;
  add('mountains', 0.1, X, Y, W, H, 0.35,
    `<path d="M-300,1250 L-300,760 Q200,560 700,800 T1300,840 L1300,1250 Z" fill="#b6c6e4"/>
     <path d="M3000,1250 L3000,820 Q3500,540 4100,760 Q4500,640 5000,820 L5500,900 V1250 Z" fill="#aebfe0"/>
     <path d="${fuji}" fill="url(#fuji)"/><path d="M1750,360 Q1860,380 2000,560 Q2500,1130 3300,1200 L1900,1200 Z" fill="#6f87b8" fill-opacity=".35"/>
     <path d="${snow}" fill="#fff"/><path d="${snowShade}" fill="#dbe6f7"/>
     <ellipse cx="1750" cy="1160" rx="2100" ry="120" fill="url(#mist)"/><ellipse cx="3900" cy="1130" rx="1500" ry="90" fill="url(#mist)"/><ellipse cx="400" cy="1150" rx="1100" ry="100" fill="url(#mist)"/>`,
    grad('fuji', [[0, '#8da6d3'], [0.55, '#a8bde0'], [1, '#c9d6ec']]) + grad('mist', [[0, '#fff6df', 0.95], [1, '#fff6df', 0]], 0.5, 0.5, 0.5, 0).replace('x1="0.5" y1="0.5" x2="0.5" y2="0"', 'x1="0" y1="0" x2="0" y2="1"').replace(/<linearGradient id="mist"[^>]*>/, '<linearGradient id="mist" x1="0" y1="1" x2="0" y2="0">'));
}

// 2 distant castle -----------------------------------------------------
{
  const X = 3300, W = 2100, Y = 150, H = 1100;
  const cx = 4450;
  const body = (w, y, h) => `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" fill="#f3efe4"/><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" fill="url(#cshade)"/>` +
    Array.from({ length: Math.floor(w / 90) }, (_, k) => `<rect x="${cx - w / 2 + 40 + k * 90}" y="${y + h * 0.3}" width="26" height="${h * 0.42}" rx="4" fill="#4a5470"/>`).join('') + `<path d="M${cx - w / 2},${y + h} h${w}" stroke="#7d86a0" stroke-width="5"/>`;
  const rf = (w, ye, h, id) => roof(cx - w / 2, cx + w / 2, ye, ye - h, { fill: '#6c7a9c', dark: '#4f5c7d', light: '#95a3c4', rafters: false, id, ridgeW: 0.22 });
  const defs = grad('cshade', [[0, '#fff', 0], [1, '#9aa5c0', 0.35]], 0, 0, 1, 0) + roofGrad('c1', '#8d9bbb', '#5a6786') + roofGrad('c2', '#8d9bbb', '#5a6786') + roofGrad('c3', '#8d9bbb', '#5a6786') + roofGrad('c4', '#8d9bbb', '#5a6786');
  const stone = `<path d="M${cx - 560},1150 L${cx + 560},1150 L${cx + 440},880 L${cx - 440},880 Z" fill="#a1a9bd"/><path d="M${cx - 560},1150 L${cx - 440},880 H${cx} L${cx - 100},1150 Z" fill="#b6bdcf" fill-opacity=".6"/>` +
    Array.from({ length: 6 }, (_, k) => `<path d="M${cx - 540 + k * 20},${1150 - k * 45} H${cx + 540 - k * 20}" stroke="#7e869c" stroke-opacity=".55" stroke-width="3"/>`).join('');
  let trees = ''; const r = rng(5);
  for (let i = 0; i < 20; i++) trees += pine(3400 + r() * 1900, 1180, 0.8 + r() * 0.7, r, ['#6d8d86', '#7b9c92', '#8aab9f']);
  add('castle', 0.2, X, Y, W, H, 0.4,
    `${trees}${stone}${body(640, 740, 150)}${rf(780, 760, 100, 'c1')}${body(480, 590, 130)}${rf(620, 600, 96, 'c2')}${body(330, 460, 120)}${rf(470, 470, 92, 'c3')}${rf(250, 370, 70, 'c4')}
     <ellipse cx="${cx}" cy="1180" rx="1100" ry="110" fill="url(#mist2)"/>`,
    defs + grad('mist2', [[0, '#fff6df', 0], [0.5, '#fff6df', 0.85], [1, '#fff6df', 0]]).replace('id="mist2"', 'id="mist2" gradientTransform="rotate(90)"'));
}

// 3 hills + pagoda -----------------------------------------------------
{
  const X = -300, W = 5800, Y = 450, H = 900, r = rng(21);
  let trees = '';
  for (let i = 0; i < 46; i++) { const x = -200 + r() * 5600; trees += pine(x, 1090 + Math.sin(x / 400) * 22 + r() * 40, 0.9 + r() * 0.9, r, ['#5c8d78', '#6d9d86', '#86b59a']); }
  const pagoda = (cx, yb) => {
    let o = `<rect x="${cx - 14}" y="${yb - 760}" width="28" height="80" fill="#3b3a47"/>`;
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const w = 330 - i * 48, y = yb - i * 118 - 30;
      o += `<rect x="${cx - w * 0.36}" y="${y - 100}" width="${w * 0.72}" height="100" fill="#d65a42"/><rect x="${cx - w * 0.36}" y="${y - 100}" width="${w * 0.72}" height="100" fill="url(#pshade)"/><rect x="${cx - w * 0.36}" y="${y - 62}" width="${w * 0.72}" height="10" fill="#f3e3b9" fill-opacity=".8"/>`;
      o += roof(cx - w / 2, cx + w / 2, y - 100, y - 168, { fill: '#5a6580', dark: '#454f68', light: '#7f8cab', rafters: false, id: 'pg' + i, ridgeW: 0.3 });
    }
    return o;
  };
  const defs = grad('pshade', [[0, '#fff', 0], [1, '#7a2f27', 0.35]], 0, 0, 1, 0) + Array.from({ length: 5 }, (_, i) => roofGrad('pg' + i, '#7684a3', '#4c5870')).join('');
  add('hills', 0.35, X, Y, W, H, 0.4,
    `<path d="M${X},1350 V1100 Q400,980 1000,1080 T2200,1060 T3400,1090 T4600,1050 T${X + W},1090 V1350 Z" fill="#9dc0ac"/>${pagoda(1150, 1060)}${trees}
     <path d="M${X},1350 V1160 Q600,1090 1400,1150 T3000,1140 T4700,1130 T${X + W},1150 V1350 Z" fill="#82ae96"/>
     <rect x="${X}" y="1020" width="${W}" height="330" fill="url(#hmist)"/>`,
    defs + grad('hmist', [[0, '#fff6df', 0], [0.7, '#fff6df', 0.35], [1, '#fff6df', 0.7]]));
}

// 4 torii in the mid-distance -----------------------------------------
{
  const X = 100, W = 1100, Y = 560, H = 700, cx = 650, yb = 1180;
  const post = (x) => `<path d="M${x - 34},${yb} L${x - 28},${yb - 560} H${x + 28} L${x + 34},${yb} Z" fill="url(#tp)" stroke="${C.ink}" stroke-opacity=".5" stroke-width="4"/><rect x="${x - 46}" y="${yb - 40}" width="92" height="40" fill="#2f2c3a"/>`;
  add('torii', 0.55, X, Y, W, H, 0.5,
    `${post(cx - 240)}${post(cx + 240)}<rect x="${cx - 270}" y="${yb - 470}" width="540" height="34" fill="#2f2c3a"/><rect x="${cx - 262}" y="${yb - 448}" width="524" height="38" fill="${C.vermilion}" stroke="${C.ink}" stroke-opacity=".5" stroke-width="4"/>
     <path d="M${cx - 380},${yb - 560} Q${cx - 300},${yb - 536} ${cx - 240},${yb - 560} H${cx + 240} Q${cx + 300},${yb - 536} ${cx + 380},${yb - 560} L${cx + 330},${yb - 596} H${cx - 330} Z" fill="#2f2c3a"/>
     <path d="M${cx - 396},${yb - 566} Q${cx - 320},${yb - 540} ${cx - 240},${yb - 566} H${cx + 240} Q${cx + 320},${yb - 540} ${cx + 396},${yb - 566} L${cx + 380},${yb - 584} Q${cx + 250},${yb - 566} ${cx + 200},${yb - 580} H${cx - 200} Q${cx - 250},${yb - 566} ${cx - 380},${yb - 584} Z" fill="${C.vermilion}" stroke="${C.ink}" stroke-opacity=".5" stroke-width="4"/>
     <rect x="${cx - 24}" y="${yb - 560}" width="48" height="90" fill="${C.vermilionDark}"/>
     <ellipse cx="${cx}" cy="${yb + 4}" rx="460" ry="40" fill="#fff6df" fill-opacity=".45"/>`,
    grad('tp', [[0, '#e9644b'], [0.5, C.vermilion], [1, C.vermilionDark]], 0, 0, 1, 0));
}

// 5 dojo hall ----------------------------------------------------------
{
  const L = 1350, R = 3850, YE = 330, YB = 1196;
  const X = L - 160, W = R - L + 320, Y = -420, H = YB - Y + 40;
  const yw0 = YE + 118; // wall top (under the rafters)
  let wall = `<rect x="${L}" y="${yw0}" width="${R - L}" height="${YB - yw0}" fill="${C.plaster}"/><rect x="${L}" y="${yw0}" width="${R - L}" height="60" fill="#c9bfa2" fill-opacity=".45"/>`;
  const bay = 500, n = (R - L) / bay;
  for (let i = 0; i < n; i++) {
    const bx = L + i * bay, mid = i === Math.floor(n / 2) || i === Math.floor(n / 2) - 1 + (n % 2 ? 0 : 1) && false;
    const center = i === 2;
    if (i === 0 || i === n - 1) { // plaster bays with a lattice window
      wall += `<rect x="${bx + 100}" y="${yw0 + 90}" width="300" height="260" rx="8" fill="#fbf1d6" stroke="${C.woodDark}" stroke-width="12"/>` +
        Array.from({ length: 6 }, (_, k) => `<path d="M${bx + 100 + k * 60},${yw0 + 90} v260" stroke="${C.woodDark}" stroke-width="6"/>`).join('') + `<path d="M${bx + 100},${yw0 + 220} h300" stroke="${C.woodDark}" stroke-width="6"/>`;
    } else { // shoji screens
      for (let k = 0; k < 2; k++) {
        const sx = bx + 12 + k * 238, sy = yw0 + 40, sw = 226, sh = YB - sy - 190;
        const lit = center ? '#ffe9a8' : '#fdf3d6';
        wall += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="${lit}"/><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="url(#shoji)"/>` +
          Array.from({ length: 4 }, (_, c) => `<path d="M${sx + (c + 1) * (sw / 5)},${sy} v${sh}" stroke="${C.woodDark}" stroke-width="5"/>`).join('') +
          Array.from({ length: 8 }, (_, c) => `<path d="M${sx},${sy + (c + 1) * (sh / 9)} h${sw}" stroke="${C.woodDark}" stroke-width="${c === 3 ? 10 : 4}"/>`).join('') +
          `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="none" stroke="${C.woodDark}" stroke-width="12"/>`;
      }
    }
  }
  // lower wainscot boards
  wall += `<rect x="${L}" y="${YB - 150}" width="${R - L}" height="150" fill="${C.woodDark}"/>` + Array.from({ length: Math.floor((R - L) / 62) }, (_, k) => `<path d="M${L + k * 62},${YB - 150} v150" stroke="#2c1a10" stroke-opacity=".55" stroke-width="3"/>`).join('') + `<rect x="${L}" y="${YB - 150}" width="${R - L}" height="12" fill="#7d5636"/>`;
  // posts and beams
  let posts = '';
  for (let i = 0; i <= n; i++) {
    const px = L + i * bay;
    posts += `<rect x="${px - 28}" y="${yw0 - 8}" width="56" height="${YB - yw0 + 8}" fill="${C.wood}" stroke="${C.ink}" stroke-opacity=".45" stroke-width="4"/><rect x="${px - 28}" y="${yw0 - 8}" width="16" height="${YB - yw0 + 8}" fill="${C.woodLight}" fill-opacity=".55"/><rect x="${px - 40}" y="${YB - 40}" width="80" height="40" rx="8" fill="${C.stoneDark}"/>`;
  }
  const beams = `<rect x="${L - 40}" y="${yw0 - 10}" width="${R - L + 80}" height="46" fill="${C.woodDark}" stroke="${C.ink}" stroke-opacity=".45" stroke-width="4"/><rect x="${L - 40}" y="${yw0 + 236}" width="${R - L + 80}" height="30" fill="${C.wood}" stroke="${C.ink}" stroke-opacity=".4" stroke-width="3"/>`;
  // veranda + steps
  const veranda = `<rect x="${L - 80}" y="${YB - 30}" width="${R - L + 160}" height="62" fill="#b98c5c" stroke="${C.ink}" stroke-opacity=".4" stroke-width="4"/>` + Array.from({ length: Math.floor((R - L + 160) / 120) }, (_, k) => `<path d="M${L - 80 + k * 120},${YB - 30} v62" stroke="#7d5636" stroke-width="3"/>`).join('') + `<rect x="${L - 80}" y="${YB - 30}" width="${R - L + 160}" height="10" fill="#d7ad7c"/>
    <path d="M2380,${YB + 32} H3020 L3060,${YB + 90} H2340 Z" fill="${C.stoneLight}" stroke="${C.ink}" stroke-opacity=".4" stroke-width="4"/><path d="M2340,${YB + 90} H3060 V${YB + 112} H2340 Z" fill="${C.stoneDark}"/>`;
  // hanging lanterns + banners
  let hang = '';
  for (const x of [L + 250, L + 750, R - 750, R - 250]) hang += `<path d="M${x},${yw0 + 40} V${yw0 + 100}" stroke="${C.ink}" stroke-width="4"/><ellipse cx="${x}" cy="${yw0 + 168}" rx="52" ry="70" fill="#e65a43" stroke="${C.ink}" stroke-opacity=".6" stroke-width="5"/><path d="M${x - 48},${yw0 + 150} q48,26 96,0 M${x - 48},${yw0 + 188} q48,26 96,0" stroke="#7a2418" stroke-width="4" fill="none"/><rect x="${x - 26}" y="${yw0 + 96}" width="52" height="14" fill="${C.ink}"/><rect x="${x - 26}" y="${yw0 + 232}" width="52" height="14" fill="${C.ink}"/><ellipse cx="${x - 14}" cy="${yw0 + 148}" rx="12" ry="26" fill="#fff" fill-opacity=".28"/>`;
  const defs = roofGrad('hall', '#7a8aae', '#44516e') + grad('shoji', [[0, '#fff', 0], [1, '#caa869', 0.28]]);
  add('hall', 0.85, X, Y, W, H, 0.5,
    `${wall}${beams}${posts}${veranda}${hang}
     <g>${roof(L - 20, R + 20, YE, -260, { id: 'hall', ridgeW: 0.2 })}</g>
     <rect x="${L - 60}" y="${YB - 8}" width="${R - L + 120}" height="40" fill="url(#hfoot)"/>`,
    defs + grad('hfoot', [[0, '#3a2a1c', 0.25], [1, '#3a2a1c', 0]]));
}

// 6 cherry trees flanking the hall ------------------------------------
{
  const X = 200, W = 4800, Y = -650, H = 1900, r = rng(31);
  const trunk = (bx, by, pts, w) => {
    let o = '';
    pts.forEach(([x, y, ww], i) => { if (i) o += `<path d="M${pts[i - 1][0]},${pts[i - 1][1]} Q${(pts[i - 1][0] + x) / 2 + 30},${(pts[i - 1][1] + y) / 2} ${x},${y}" stroke="#4a3329" stroke-width="${ww}" stroke-linecap="round" fill="none"/>`; });
    return o;
  };
  const tree = (bx, dir, cx, cy, rx, ry, seed) => {
    const rr = rng(seed);
    const t = `<path d="M${bx - 46},1210 C${bx - 30},900 ${bx + dir * 20},760 ${bx + dir * 60},560 L${bx + dir * 100},560 C${bx + dir * 70},780 ${bx + 50},940 ${bx + 54},1210 Z" fill="#4a3329" stroke="${C.ink}" stroke-opacity=".5" stroke-width="4"/>
      <path d="M${bx - 20},1210 C${bx - 10},900 ${bx + dir * 30},760 ${bx + dir * 70},560" stroke="#6b4b3a" stroke-width="12" fill="none"/>` +
      `<path d="M${bx + dir * 80},700 Q${bx + dir * 300},560 ${cx + dir * 220},${cy + 100}" stroke="#4a3329" stroke-width="30" stroke-linecap="round" fill="none"/><path d="M${bx + dir * 80},640 Q${bx - dir * 200},430 ${cx - dir * 260},${cy + 60}" stroke="#4a3329" stroke-width="26" stroke-linecap="round" fill="none"/><path d="M${bx + dir * 90},600 Q${bx + dir * 20},380 ${cx},${cy - 40}" stroke="#4a3329" stroke-width="24" stroke-linecap="round" fill="none"/>`;
    return t + blossomCrown(rr, cx, cy, rx, ry, 150);
  };
  add('trees', 0.92, X, Y, W, H,
    0.4, tree(1110, 1, 1010, 250, 700, 520, 3) + tree(4180, -1, 4290, 270, 740, 540, 8) +
    // fallen petals on the ground
    Array.from({ length: 160 }, () => { const x = 300 + r() * 4600, y = 1215 + r() * 40; return `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(7 + r() * 6)}" ry="${f1(3 + r() * 2)}" fill="${pick(r, C.pink)}" fill-opacity=".85" transform="rotate(${f1(r() * 180)} ${f1(x)} ${f1(y)})"/>`; }).join(''));
}

// 7 floor: stone plaza -------------------------------------------------
{
  const X = -700, W = 6600, Y = 1170, H = 760, r = rng(41);
  const rows = [1196, 1226, 1266, 1320, 1396, 1500, 1640, 1860];
  let o = `<rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#floor)"/>`;
  const spacing = (y) => 90 + (y - 1196) * 0.62;
  for (let i = 0; i < rows.length - 1; i++) {
    const y0 = rows[i], y1 = rows[i + 1], s0 = spacing(y0), s1 = spacing(y1);
    for (let k = -40; k < 40; k++) {
      const a0 = 2600 + k * s0, b0 = 2600 + (k + 1) * s0, a1 = 2600 + k * s1, b1 = 2600 + (k + 1) * s1;
      if (b1 < X || a1 > X + W) continue;
      const tone = r();
      o += `<path d="M${f1(a0)},${y0} L${f1(b0)},${y0} L${f1(b1)},${y1} L${f1(a1)},${y1} Z" fill="${tone < 0.3 ? '#d6d0c0' : tone < 0.65 ? '#e0dac9' : '#e8e2d2'}" stroke="#a79f8c" stroke-opacity=".6" stroke-width="${f1(2 + i * 0.7)}"/>`;
      if (r() < 0.2) o += `<ellipse cx="${f1((a0 + b0) / 2)}" cy="${f1((y0 + y1) / 2)}" rx="${f1(s0 * 0.25)}" ry="${f1((y1 - y0) * 0.12)}" fill="#8fae8a" fill-opacity=".25"/>`;
    }
  }
  o += `<rect x="${X}" y="1190" width="${W}" height="42" fill="url(#hshadow)"/>
        <rect x="${X}" y="1700" width="${W}" height="230" fill="url(#fshadow)"/>`;
  add('floor', 1, X, Y, W, H, 0.5, o,
    grad('floor', [[0, '#cfc8b6'], [1, '#e6dfcf']]) + grad('hshadow', [[0, '#4a3a2a', 0.38], [1, '#4a3a2a', 0]]) + grad('fshadow', [[0, '#3a3a4a', 0], [1, '#3a3a4a', 0.55]]));
}

// 8 stone lanterns at the extremes ------------------------------------
{
  const X = 0, W = 5200, Y = 520, H = 880;
  add('lanterns', 1, X, Y, W, H, 0.5, `${lantern(250, 1335, 1.05)}${lantern(4950, 1335, 1.05)}`, rgrad('lg', [[0, '#fff3b0', 0.9], [1, '#ffb347', 0.2]]));
}

// 9 foreground blossom branches (faster than the camera) ----------------
{
  const X = 0, W = 5200, Y = -800, H = 1500, r = rng(51);
  const branch = (x0, y0, dir) => {
    const pts = [[x0, y0], [x0 + dir * 520, y0 + 150], [x0 + dir * 980, y0 + 420], [x0 + dir * 1300, y0 + 700]];
    let o = `<path d="M${pts[0]} Q${pts[1]} ${pts[2]} T${pts[3]}" stroke="#3f2b22" stroke-width="46" stroke-linecap="round" fill="none"/><path d="M${x0 + dir * 700},${y0 + 260} Q${x0 + dir * 760},${y0 + 520} ${x0 + dir * 600},${y0 + 700}" stroke="#3f2b22" stroke-width="22" stroke-linecap="round" fill="none"/>`;
    for (const [bx, by, s] of [[pts[2][0], pts[2][1], 1], [pts[3][0], pts[3][1], 0.8], [x0 + dir * 300, y0 + 120, 0.9], [x0 + dir * 700, y0 + 700, 0.75]]) o += blossomCrown(r, bx, by, 340 * s, 240 * s, 28);
    return o;
  };
  add('foreground', 1.3, X, Y, W, H, 0.3, branch(-150, -420, 1) + branch(5350, -380, -1));
}

writeFileSync(join(OUT, 'stage.json'), JSON.stringify({ worldW: 5200, groundY: 1300, layers }, null, 1));

// review render: compose every layer at camera centre (parallax 0 offset) ------------------------------
const compose = layers.map((l) => `<image href="data:image/svg+xml;base64,${Buffer.from(svg(l.x, l.y, l.w, l.h, '', '')).toString('base64')}"/>`);
const parts = layers.map((l) => `<image x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" href="data:image/svg+xml;base64,${Buffer.from(require_svg(l.file)).toString('base64')}"/>`).join('');
function require_svg(file) { return readSvg(file); }
import { readFileSync } from 'node:fs';
function readSvg(file) { return readFileSync(join(OUT, file), 'utf8'); }
const view = [660, -420, 3880, 2183];
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.join(' ')}"><rect x="${view[0]}" y="${view[1]}" width="${view[2]}" height="${view[3]}" fill="#fde4bf"/>${parts}</svg>`;
writeFileSync(join(OUT, 'preview.png'), new Resvg(full, { fitTo: { mode: 'width', value: 1920 }, font: { loadSystemFonts: true } }).render().asPng());
console.log('stage built:', layers.map((l) => l.name).join(', '));
