// Drives tools/audio_render.html headless (Playwright + Chromium) and saves the rendered WAV + a JSON summary.
//   node game/tools/render_audio.mjs [--replay replays/demo_minimax_vs_mcts.json] [--file tools/out/audio_demo.wav] [--port 8767] [--seconds 0] [--only music|sfx]
// Needs the project served (npm run serve) and Playwright installed; without Playwright, open the HTML page in a browser instead.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './arena.mjs';

const a = parseArgs(process.argv.slice(2));
const HERE = dirname(fileURLToPath(import.meta.url));
const outBase = a.file ? a.file.replace(/\.wav$/, '') : join(HERE, 'out', 'audio_demo');
let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT || 'playwright')); }
catch { console.error('Playwright is not installed: open http://localhost:' + (a.port || 8767) + '/game/tools/audio_render.html in a browser instead.'); process.exit(1); }
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.error('page error:', e.message));
const qs = new URLSearchParams({ replay: '../' + (a.replay || 'replays/demo_minimax_vs_mcts.json'), seconds: a.seconds || 0, only: a.only || '' });
await p.goto(`http://localhost:${a.port || 8767}/game/tools/audio_render.html?${qs}`);
await p.waitForFunction(() => window.result, null, { timeout: 300000 });
const result = await p.evaluate(() => window.result);
if (result.error) { console.error(result.error); process.exit(1); }
const b64 = await p.evaluate(() => { let s = ''; const u = window.wavBytes; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); });
mkdirSync(dirname(outBase), { recursive: true });
writeFileSync(outBase + '.wav', Buffer.from(b64, 'base64'));
writeFileSync(outBase + '.json', JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
console.log('->', outBase + '.wav');
await b.close();
