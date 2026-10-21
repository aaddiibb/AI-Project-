// Split the master art into per-part SVGs, write rig.json, and render part previews.
//   node tools/split.mjs [--palette p2]
// Outputs (under art/shinobi/):
//   parts[/<palette>]/<id>.svg   tightly cropped part files (viewBox = master-space bbox)
//   rig.json                     skeleton, pivots, z-order, offsets, slots, attachments
//   renders/parts/<id>.png       each part alone, cropped
//   renders/part_sheet.png       contact sheet of all parts
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildParts, META } from '../src/shinobi.art.mjs';
import { PALETTES, styleBlock } from '../src/palette.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const palName = process.argv.includes('--palette') ? process.argv[process.argv.indexOf('--palette') + 1] : 'default';
const PART_DIR = palName === 'default' ? 'parts' : `parts/${palName}`;
const PAD = 6;
const style = `<defs><style>${styleBlock(PALETTES[palName])}</style></defs>`;
const [, , VW, VH] = META.viewBox;

mkdirSync(join(ROOT, PART_DIR), { recursive: true });
mkdirSync(join(ROOT, 'renders/parts'), { recursive: true });

const parts = buildParts();

/** alpha bounding box of a part rendered alone on the full master canvas (1 px = 1 unit) */
function bbox(svgBody) {
  const img = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}">${style}${svgBody}</svg>`).render();
  const { width, height, pixels } = img;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (pixels[row + x * 4 + 3] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('empty part');
  const x = Math.max(0, x0 - PAD), y = Math.max(0, y0 - PAD);
  return { png: img.asPng(), x, y, w: Math.min(VW, x1 + PAD + 1) - x, h: Math.min(VH, y1 + PAD + 1) - y };
}

const b64 = (buf) => 'data:image/png;base64,' + buf.toString('base64');
const cropPng = (png, { x, y, w, h }) =>
  new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}"><image href="${b64(png)}" width="${VW}" height="${VH}"/></svg>`, { fitTo: { mode: 'width', value: w } }).render().asPng();

const rigParts = [];
const crops = {};
parts.forEach((p, z) => {
  const body = `<g id="part-${p.id}">${p.svg}</g>`;
  const bb = bbox(body);
  const file = `${PART_DIR}/${p.id}.svg`;
  writeFileSync(join(ROOT, file), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}" width="${bb.w}" height="${bb.h}">${style}${body}</svg>`);
  if (palName === 'default') {
    crops[p.id] = cropPng(bb.png, bb);
    writeFileSync(join(ROOT, `renders/parts/${p.id}.png`), crops[p.id]);
  }
  rigParts.push({
    id: p.id,
    parent: p.parent,
    pivot: { x: p.pivot[0], y: p.pivot[1] },
    zIndex: z,
    file,
    offset: { x: bb.x, y: bb.y },
    size: { w: bb.w, h: bb.h },
    ...(p.slot ? { slot: p.slot } : {}),
    ...(p.hidden ? { hidden: true } : {}),
    ...(p.rotKey || (p.slot && p.slot.startsWith('hand_') && !p.id.endsWith('_open')) ? { rotKey: p.rotKey || p.slot + '_open' } : {}),
    ...(p.grip ? { grip: { x: p.grip.point[0], y: p.grip.point[1], axisDeg: p.grip.axisDeg } } : {}),
    ...(p.notes ? { notes: p.notes } : {}),
  });
});

// sanity: every parent exists, no cycles
const byId = Object.fromEntries(rigParts.map((p) => [p.id, p]));
for (const p of rigParts) {
  if (p.parent && !byId[p.parent]) throw new Error(`${p.id}: unknown parent ${p.parent}`);
  let q = p, n = 0;
  while (q.parent) { q = byId[q.parent]; if (++n > 50) throw new Error(`cycle at ${p.id}`); }
}

const slots = {};
for (const p of rigParts) if (p.slot) (slots[p.slot] ||= { options: [], default: null }).options.push(p.id);
for (const s of Object.values(slots)) s.default = s.options.find((id) => !byId[id].hidden);

const rig = {
  name: META.name,
  palette: palName,
  units: 'master (viewBox 0 0 1000 1400); +x = facing direction (right); rotations in degrees, clockwise positive',
  viewBox: META.viewBox,
  height: META.height,
  groundY: META.groundY,
  root: 'pelvis',
  recommendedScreenHeightPx: META.recommendedScreenHeightPx,
  recommendedScale: +(META.recommendedScreenHeightPx / META.height).toFixed(4),
  slots,
  contacts: {
    foot_near: [[302, 1314], [322, 1319], [341, 1318], [362, 1316], [373, 1306]],
    foot_far: [[538, 1290], [552, 1296], [600, 1298], [650, 1301], [686, 1292]],
    foot_near_side: [[305, 1308], [319, 1314], [367, 1316], [417, 1319], [453, 1310]],
  },
  // named effect anchors (master coords, on the given part): slash arcs, projectile spawns, hit sparks
  anchors: {
    sword_tip: { part: 'sword', x: 483.3, y: 587.2 },
    sword_guard: { part: 'sword', x: 362.3, y: 336.6 },
    kunai_tip: { part: 'kunai', x: 860, y: 322 },
    hand_near_grip: { part: 'hand_near_grip_kunai', x: 393.79, y: 748.76 },
    hand_far_grip: { part: 'hand_far_grip_kunai', x: 655.84, y: 745.43 },
    fist_near: { part: 'hand_near_fist', x: 396, y: 752 },
    hand_near: { part: 'hand_near_open', x: 397, y: 742 },
    head: { part: 'head_base', x: 528, y: 262 },
    chest: { part: 'torso_upper', x: 545, y: 440 },
    foot_far_toe: { part: 'foot_far', x: 684, y: 1290 },
    foot_near_toe: { part: 'foot_near', x: 341, y: 1318 },
  },
  contactNotes: 'Sole points in master coords per foot. The near foot sits lower on screen (closer to camera); a pose is grounded by moving the root so the lowest contact returns to its own rest height.',
  attachments: {
    sword: { rest: 'sheath_back', grips: ['hand_near_grip_sword', 'hand_far_grip_sword'] },
    kunai: { rest: null, grips: ['hand_near_grip_kunai', 'hand_far_grip_kunai'] },
  },
  attachNotes: 'An attached item is placed so its grip point lands on the hand grip point and its grip axis aligns with the hand grip axis (+x of the hand = forward); it draws just below the hand in z.',
  defaultPose: {
    root: { x: 0, y: 0 },
    rot: Object.fromEntries(rigParts.map((p) => [p.id, 0])),
    slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, v.default])),
    attach: { sword: 'sheath_back', kunai: null },
  },
  parts: rigParts,
};
writeFileSync(join(ROOT, palName === 'default' ? 'rig.json' : `rig_${palName}.json`), JSON.stringify(rig, null, 1));

// part sheet
if (palName === 'default') {
  const cell = 210, cols = 8, rows = Math.ceil(rigParts.length / cols);
  let cells = '';
  rigParts.forEach((p, i) => {
    const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
    const k = Math.min((cell - 20) / p.size.w, (cell - 40) / p.size.h, 1);
    const w = p.size.w * k, h = p.size.h * k;
    cells += `<rect x="${cx + 2}" y="${cy + 2}" width="${cell - 4}" height="${cell - 4}" fill="#f4f1ea" stroke="#c9c2b2"/>`;
    cells += `<image href="${b64(crops[p.id])}" x="${cx + (cell - w) / 2}" y="${cy + 8 + (cell - 40 - h) / 2}" width="${w}" height="${h}"/>`;
    cells += `<text x="${cx + cell / 2}" y="${cy + cell - 12}" font-family="Arial" font-size="12" text-anchor="middle" fill="#333">${p.id}</text>`;
  });
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * cell} ${rows * cell}">${cells}</svg>`;
  writeFileSync(join(ROOT, 'renders/part_sheet.png'), new Resvg(sheet, { fitTo: { mode: 'width', value: cols * cell }, background: '#ffffff', font: { loadSystemFonts: true } }).render().asPng());
}
console.log(`split ${rigParts.length} parts -> ${PART_DIR}/, rig written (palette=${palName})`);
