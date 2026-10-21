// Build the master SVG from the art module and render review PNGs.
//   node tools/build.mjs [--palette p2]
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildParts, META } from '../src/shinobi.art.mjs';
import { PALETTES, styleBlock } from '../src/palette.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REN = join(ROOT, 'renders');
mkdirSync(REN, { recursive: true });

const palName = process.argv.includes('--palette') ? process.argv[process.argv.indexOf('--palette') + 1] : 'default';
const parts = buildParts();

export function masterSvg(viewBox = META.viewBox, { showHidden = false } = {}) {
  const body = parts
    .map((p) => `<g id="part-${p.id}"${p.hidden && !showHidden ? ' display="none"' : ''}>${p.svg}</g>`)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox.join(' ')}">
<defs><style id="palette">${styleBlock(PALETTES[palName])}</style></defs>
${body}
</svg>`;
}

const render = (svg, width, bg = '#e4e4e8') => new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: bg }).render().asPng();
const b64 = (buf) => 'data:image/png;base64,' + buf.toString('base64');

const master = masterSvg();
if (palName === 'default') writeFileSync(join(ROOT, 'shinobi_master.svg'), master);
const sfx = palName === 'default' ? '' : '_' + palName;

const full = render(master, 1000);
writeFileSync(join(REN, `master${sfx}.png`), full);
// game-size preview (~430 px tall character): 1000x1400 -> 380 wide
writeFileSync(join(REN, `master_small${sfx}.png`), render(master, 380, '#d8cfb8'));

// zoom crops (cropped from a 3x render: resvg panics on some offset viewBoxes)
const big = b64(render(master, 3000));
const crops = { face: [440, 160, 180, 180], torso: [360, 300, 300, 330], legs: [270, 760, 450, 580], hand: [350, 640, 340, 140] };
for (const [k, vb] of Object.entries(crops)) {
  const wrap = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}"><image href="${big}" x="0" y="0" width="1000" height="1400"/></svg>`;
  writeFileSync(join(REN, `zoom_${k}${sfx}.png`), render(wrap, 700));
}

// side-by-side comparison with the reference (mapped into master space by ref_grid.py)
try {
  const ref = readFileSync(join(REN, 'ref_master_clean.png'));
  const cmp = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 1400">
<image href="${b64(ref)}" x="0" y="0" width="1000" height="1400"/>
<image href="${b64(full)}" x="1000" y="0" width="1000" height="1400"/>
<image href="${b64(ref)}" x="2000" y="0" width="1000" height="1400"/>
<image href="${b64(full)}" x="2000" y="0" width="1000" height="1400" opacity="0.55"/>
</svg>`;
  writeFileSync(join(REN, `compare${sfx}.png`), render(cmp, 1800));
} catch (e) {
  console.warn('compare skipped:', e.message);
}
console.log(`built ${parts.length} parts, palette=${palName}`);
