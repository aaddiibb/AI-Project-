// Build the master SVG from the art module and render review PNGs.
//   node tools/build.mjs [--palette p2]
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildParts, META } from '../src/samurai.art.mjs';
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
if (palName === 'default') writeFileSync(join(ROOT, 'samurai_master.svg'), master);
const sfx = palName === 'default' ? '' : '_' + palName;

const full = render(master, 1000);
writeFileSync(join(REN, `master${sfx}.png`), full);
// game-size preview (~440 px tall character): 1000x1400 -> 373 wide, on a bright stage-like background
writeFileSync(join(REN, `master_small${sfx}.png`), render(master, 373, '#e9dcb8'));

// zoom crops (cropped from a 3x render: resvg panics on some offset viewBoxes)
const big = b64(render(master, 3000));
const crops = { face: [430, 90, 200, 220], torso: [380, 280, 300, 440], legs: [320, 860, 420, 460], hand: [470, 560, 240, 240], sword: [250, 440, 560, 560] };
for (const [k, vb] of Object.entries(crops)) {
  const wrap = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}"><image href="${big}" x="0" y="0" width="1000" height="1400"/></svg>`;
  writeFileSync(join(REN, `zoom_${k}${sfx}.png`), render(wrap, 700));
}

// side-by-side comparison with the game-view idle reference, mapped into master space
// (reference 1792x2400 -> scale 0.5463, offset 48,54.4: crown at y~120, ground line on y 1300)
const REF = join(ROOT, '../../references/samurai/02_samurai_game_view_idle.jpg');
try {
  const ref = 'data:image/jpeg;base64,' + readFileSync(REF).toString('base64');
  const refImg = (x) => `<image href="${ref}" x="${x + 48}" y="54.4" width="${1792 * 0.5463}" height="${2400 * 0.5463}"/>`;
  const cmp = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 1400"><rect width="3000" height="1400" fill="#e4e4e8"/>
${refImg(0)}
<image href="${b64(full)}" x="1000" y="0" width="1000" height="1400"/>
${refImg(2000)}
<image href="${b64(full)}" x="2000" y="0" width="1000" height="1400" opacity="0.55"/>
<line x1="0" y1="1300" x2="3000" y2="1300" stroke="#c03" stroke-width="2"/><line x1="0" y1="120" x2="3000" y2="120" stroke="#c03" stroke-width="2"/>
</svg>`;
  writeFileSync(join(REN, `compare${sfx}.png`), render(cmp, 2100));
} catch (e) {
  console.warn('compare skipped:', e.message);
}
console.log(`built ${parts.length} parts, palette=${palName}`);
