// Regression proof for the shared rig_runtime.js: renders the Shinobi's pose sheet (same code path as
// art/shinobi/tools/pose_render.mjs) and runs a 240-frame dynamic simulation (idle + springs + stress),
// writing everything under art/samurai/renders/proof/ (the Shinobi's own files are not touched).
//   node tools/shinobi_proof.mjs before|after      -> writes shinobi_<tag>.png + shinobi_<tag>_sim.json
//   node tools/shinobi_proof.mjs compare           -> pixel + matrix diff of before vs after (also proof.txt)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SH = join(ROOT, '../shinobi');
const OUT = join(ROOT, 'renders/proof');
mkdirSync(OUT, { recursive: true });
const tag = process.argv[2] || 'before';
const h = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

if (tag === 'compare') {
  const decode = (buf) => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1920"><image href="data:image/png;base64,${buf.toString('base64')}" width="2400" height="1920"/></svg>`).render().pixels;
  const pa = readFileSync(join(OUT, 'shinobi_before.png')), pb = readFileSync(join(OUT, 'shinobi_after.png'));
  const A = decode(pa), B = decode(pb);
  let diff = 0;
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) diff++;
  const sa = readFileSync(join(OUT, 'shinobi_before_sim.json')), sb = readFileSync(join(OUT, 'shinobi_after_sim.json'));
  const report = [
    `poses_sheet PNG bytes identical: ${pa.equals(pb)}  (sha256 ${h(pa)} vs ${h(pb)})`,
    `decoded pixel channels differing: ${diff} of ${A.length}`,
    `240-frame dynamic sim (idle + springs + wind + stress) world matrices identical: ${sa.equals(sb)}  (sha256 ${h(sa)} vs ${h(sb)})`,
  ].join('\n');
  writeFileSync(join(OUT, 'proof.txt'), report + '\n');
  console.log(report);
  process.exit(0);
}

const { solve, mul, T } = await import(pathToFileURL(join(SH, 'rig_runtime.js')).href);
const rig = JSON.parse(readFileSync(join(SH, 'rig.json'), 'utf8'));
const poses = JSON.parse(readFileSync(join(SH, 'poses.json'), 'utf8'));
const png = Object.fromEntries(rig.parts.map((p) => [p.id, 'data:image/png;base64,' + readFileSync(join(SH, 'renders/parts', p.id + '.png')).toString('base64')]));
const VB = [-60, 80, 1160, 1280];
const f = (n) => +n.toFixed(4);
function composeSvg(pose, opts = {}) {
  const sol = solve(rig, pose, { springs: {}, ...opts });
  return rig.parts
    .filter((p) => sol.visible[p.id])
    .map((p) => ({ p, z: sol.zOverride[p.id] ?? p.zIndex, m: mul(sol.W[p.id], T(p.offset.x, p.offset.y)) }))
    .sort((a, b) => a.z - b.z)
    .map(({ p, m }) => `<image href="${png[p.id]}" width="${p.size.w}" height="${p.size.h}" transform="matrix(${m.map(f).join(' ')})"/>`)
    .join('');
}
const ground = `<rect x="${VB[0]}" y="${rig.groundY}" width="${VB[2]}" height="${VB[1] + VB[3] - rig.groundY}" fill="#d6bd8a"/><line x1="${VB[0]}" y1="${rig.groundY}" x2="${VB[0] + VB[2]}" y2="${rig.groundY}" stroke="#a88a55" stroke-width="3"/>`;
const render = (svg, w) => new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: true } }).render().asPng();
const frameSvg = (inner, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB.join(' ')}"><rect x="${VB[0]}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}" fill="#eef3f2"/>${ground}${inner}<text x="${VB[0] + 20}" y="${VB[1] + 50}" font-family="Arial" font-size="40" fill="#333">${label}</text></svg>`;
const names = Object.keys(poses).filter((n) => !n.startsWith('_'));
const tiles = names.map((n) => render(frameSvg(composeSvg(poses[n]), n.replace(/_/g, ' ')), 900));
const cols = 4, tw = VB[2], th = VB[3], rows = Math.ceil(tiles.length / cols);
const imgs = tiles.map((b, i) => `<image href="data:image/png;base64,${b.toString('base64')}" x="${(i % cols) * tw}" y="${Math.floor(i / cols) * th}" width="${tw}" height="${th}"/>`).join('');
writeFileSync(join(OUT, `shinobi_${tag}.png`), new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * tw} ${rows * th}">${imgs}</svg>`, { fitTo: { mode: 'width', value: 2400 } }).render().asPng());

// dynamic: springs integrate over time with idle wind, a stress sweep and pose changes (exercises SPRINGS, WIND, STRESS)
const springs = {};
const sim = [];
for (let i = 0; i < 240; i++) {
  const pose = poses[names[Math.floor(i / 20) % names.length]];
  const sol = solve(rig, pose, { time: i / 60, dt: 1 / 60, idle: true, stress: i >= 120, springs });
  sim.push(Object.fromEntries(Object.entries(sol.W).map(([k, m]) => [k, m.map((v) => +v.toFixed(9))])));
}
writeFileSync(join(OUT, `shinobi_${tag}_sim.json`), JSON.stringify(sim));
console.log(`proof ${tag}: ${names.length} poses, 240 sim frames`);
