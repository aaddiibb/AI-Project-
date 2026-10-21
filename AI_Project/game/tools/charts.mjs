// Charts for docs/ai_benchmark.md, rendered from the measured JSON / CSV in game/tools/out/ (no hand-entered numbers).
//   node game/tools/charts.mjs            -> docs/img/*.svg (+ *.png when @resvg/resvg-js is installed in art/shinobi)
// Charts: round-robin win-rate matrix, win rate with 95% Wilson intervals per pairing, decision time per agent,
// scaling curves (budget vs win rate), GA fitness per generation.
// Colours: one fixed categorical hue per agent (never by rank), a blue <-> red diverging scale around 50% for the matrix.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), OUT = join(HERE, 'out'), IMG = join(HERE, '..', '..', 'docs', 'img');
mkdirSync(IMG, { recursive: true });
let Resvg = null;
try { ({ Resvg } = createRequire(join(HERE, '..', '..', 'art', 'shinobi', 'package.json'))('@resvg/resvg-js')); } catch { /* SVG only */ }

const T = { surface: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', muted: '#8a8984', grid: '#e7e6e2', font: 'Georgia, "DejaVu Serif", serif' };
export const AGENT_COLOR = { minimax: '#2a78d6', mcts: '#eb6834', fuzzy: '#1baf7a', scripted: '#eda100', random: '#e87ba4', minimax_ga: '#4a3aa7' };
const LABEL = { minimax: 'Minimax', mcts: 'MCTS', fuzzy: 'Fuzzy', scripted: 'Scripted', random: 'Random', minimax_ga: 'GA-Minimax' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (x, y, s, { size = 14, fill = T.ink, anchor = 'start', weight = 400 } = {}) => `<text x="${x}" y="${y}" font-family='${T.font}' font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${T.surface}"/>${body}</svg>`;
function save(name, s) {
  writeFileSync(join(IMG, name + '.svg'), s);
  if (Resvg) writeFileSync(join(IMG, name + '.png'), new Resvg(s, { fitTo: { mode: 'zoom', value: 2 }, font: { loadSystemFonts: true } }).render().asPng());
  console.log('wrote docs/img/' + name + (Resvg ? '.png/.svg' : '.svg'));
}
// diverging blue <-> gray <-> red (win rate of the row agent, 0.5 = gray)
const BLUE = [0x2a, 0x78, 0xd6], RED = [0xe3, 0x49, 0x48], MID = [0xf0, 0xef, 0xec];
const mix = (a, b, t) => '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
const div = (p) => (p >= 0.5 ? mix(MID, BLUE, Math.min(1, (p - 0.5) * 2)) : mix(MID, RED, Math.min(1, (0.5 - p) * 2)));
const inkOn = (p) => (Math.abs(p - 0.5) > 0.32 ? '#ffffff' : T.ink);

// ------------------------------------------------------------------ round-robin matrix
function matrix(summ, name, title) {
  const agents = [...new Set(summ.flatMap((s) => [s.a, s.b]))];
  const cell = (r, c) => {
    const s = summ.find((x) => (x.a === r && x.b === c) || (x.a === c && x.b === r));
    if (!s) return null;
    return s.a === r ? { w: s.winRateA, d: s.drawRate } : { w: s.winRateB, d: s.drawRate };
  };
  const cw = 112, ch = 64, x0 = 150, y0 = 96, W = Math.max(820, x0 + cw * agents.length + 40), H = y0 + ch * agents.length + 70;
  let b = text(24, 34, title, { size: 20, weight: 700 }) + text(24, 58, 'row agent’s win rate vs column agent ; cell colour = score (wins + half the draws); 200 matches per cell, sides swapped', { size: 13, fill: T.ink2 });
  agents.forEach((a, j) => { b += text(x0 + cw * j + cw / 2, y0 - 12, LABEL[a] || a, { size: 14, anchor: 'middle', weight: 700 }); });
  agents.forEach((r, i) => {
    b += text(x0 - 14, y0 + ch * i + ch / 2 + 5, LABEL[r] || r, { size: 14, anchor: 'end', weight: 700 });
    b += `<rect x="${x0 - 10}" y="${y0 + ch * i + 14}" width="4" height="${ch - 28}" rx="2" fill="${AGENT_COLOR[r] || T.muted}"/>`;
    agents.forEach((c, j) => {
      const v = cell(r, c), x = x0 + cw * j, y = y0 + ch * i;
      if (!v) return;
      const sc = v.w + v.d / 2;
      b += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="4" fill="${div(sc)}"/>`;
      b += text(x + cw / 2, y + ch / 2 + 2, (100 * v.w).toFixed(0) + '%', { size: 19, anchor: 'middle', fill: inkOn(sc), weight: 700 });
      if (v.d > 0.005) b += text(x + cw / 2, y + ch / 2 + 20, `draws ${(100 * v.d).toFixed(0)}%`, { size: 11, anchor: 'middle', fill: inkOn(sc) });
    });
  });
  // legend
  const ly = y0 + ch * agents.length + 30;
  for (let k = 0; k <= 10; k++) b += `<rect x="${x0 + k * 26}" y="${ly}" width="24" height="12" fill="${div(k / 10)}"/>`;
  b += text(x0, ly + 30, '0%', { size: 12, fill: T.ink2 }) + text(x0 + 130, ly + 30, '50%', { size: 12, fill: T.ink2, anchor: 'middle' }) + text(x0 + 284, ly + 30, '100%', { size: 12, fill: T.ink2, anchor: 'end' });
  save(name, svg(W, H, b));
}

// ------------------------------------------------------------------ win rate with Wilson CI (dot + whisker)
function forest(summ, name, title) {
  const rows = summ.filter((s) => s.a !== s.b || true);
  const W = 900, rh = 34, x0 = 300, x1 = W - 60, y0 = 84, H = y0 + rh * rows.length + 60;
  const X = (p) => x0 + (x1 - x0) * p;
  let b = text(24, 34, title, { size: 20, weight: 700 }) + text(24, 58, 'win rate of the first agent, 95% Wilson interval; 200 matches each', { size: 13, fill: T.ink2 });
  for (const p of [0, 0.25, 0.5, 0.75, 1]) b += `<line x1="${X(p)}" x2="${X(p)}" y1="${y0 - 8}" y2="${y0 + rh * rows.length}" stroke="${p === 0.5 ? T.muted : T.grid}" stroke-width="${p === 0.5 ? 1.5 : 1}" ${p === 0.5 ? 'stroke-dasharray="4 4"' : ''}/>` + text(X(p), y0 + rh * rows.length + 22, (p * 100) + '%', { size: 12, anchor: 'middle', fill: T.ink2 });
  rows.forEach((s, i) => {
    const y = y0 + rh * i + rh / 2, c = AGENT_COLOR[s.a] || T.muted;
    b += text(x0 - 16, y + 5, `${LABEL[s.a] || s.a} vs ${LABEL[s.b] || s.b}`, { size: 14, anchor: 'end' });
    b += `<line x1="${X(s.ciA[0])}" x2="${X(s.ciA[1])}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
    b += `<circle cx="${X(s.winRateA)}" cy="${y}" r="5.5" fill="${c}" stroke="${T.surface}" stroke-width="2"/>`;
    const lab = `${(100 * s.winRateA).toFixed(1)}%${s.drawRate > 0.005 ? `  (${(100 * s.drawRate).toFixed(0)}% draws)` : ''}`;
    const right = X(s.ciA[1]) + 12 < x1 - 150;
    b += text(right ? X(s.ciA[1]) + 12 : X(s.ciA[0]) - 12, y + 4, lab, { size: 12, fill: T.ink2, anchor: right ? 'start' : 'end' });
  });
  save(name, svg(W, H, b));
}

// ------------------------------------------------------------------ decision time per agent (mean bar + p95 tick)
function timing(summ, name, title) {
  const by = {};
  for (const s of summ) for (const [k, ag] of [['A', s.a], ['B', s.b]]) { const x = s[k]; if (!x.decisions) continue; (by[ag] ||= []).push(x); }
  const agents = Object.keys(by).filter((a) => a === 'minimax' || a === 'mcts' || a === 'minimax_ga' || a === 'fuzzy');
  const rows = agents.map((a) => ({ a, mean: by[a].reduce((s, x) => s + x.msMean, 0) / by[a].length, p95: Math.max(...by[a].map((x) => x.msP95)), work: by[a].reduce((s, x) => s + x.work, 0) / by[a].length }));
  const W = 900, rh = 46, x0 = 170, x1 = W - 80, y0 = 84, H = y0 + rh * rows.length + 60, max = Math.max(...rows.map((r) => r.p95)) * 1.1;
  const X = (v) => x0 + (x1 - x0) * (v / max);
  let b = text(24, 34, title, { size: 20, weight: 700 }) + text(24, 58, 'mean milliseconds per decision (bar) and the worst pairing’s p95 (tick), Node 22, one thread per match', { size: 13, fill: T.ink2 });
  for (let v = 0; v <= max; v += max > 40 ? 10 : 5) b += `<line x1="${X(v)}" x2="${X(v)}" y1="${y0 - 6}" y2="${y0 + rh * rows.length}" stroke="${T.grid}"/>` + text(X(v), y0 + rh * rows.length + 20, v + ' ms', { size: 12, anchor: 'middle', fill: T.ink2 });
  rows.forEach((r, i) => {
    const y = y0 + rh * i + 10, c = AGENT_COLOR[r.a];
    b += text(x0 - 14, y + 18, LABEL[r.a], { size: 14, anchor: 'end', weight: 700 });
    b += `<rect x="${x0}" y="${y}" width="${Math.max(2, X(r.mean) - x0)}" height="24" rx="4" fill="${c}"/>`;
    b += `<line x1="${X(r.p95)}" x2="${X(r.p95)}" y1="${y - 3}" y2="${y + 27}" stroke="${T.ink2}" stroke-width="2"/>`;
    b += text(X(r.p95) + 8, y + 17, `${r.mean.toFixed(2)} ms mean · p95 ${r.p95.toFixed(1)}${r.work ? ` · ${r.work.toFixed(0)} ${r.a === 'mcts' ? 'rollouts' : 'nodes'}` : ''}`, { size: 12, fill: T.ink2 });
  });
  save(name, svg(W, H, b));
}

// ------------------------------------------------------------------ scaling curve (one line + CI band)
function scaling(sc, name, title) {
  const W = 900, H = 440, x0 = 80, x1 = W - 40, y0 = 80, y1 = H - 70;
  const xs = sc.rows.map((r) => Math.log2(r.budget)), lx = Math.min(...xs), hx = Math.max(...xs);
  const X = (b) => x0 + (x1 - x0) * ((Math.log2(b) - lx) / (hx - lx || 1)), Y = (p) => y1 - (y1 - y0) * p;
  const c = AGENT_COLOR[sc.agent];
  let b = text(24, 34, title, { size: 20, weight: 700 }) + text(24, 58, `${LABEL[sc.agent]} win rate vs ${LABEL[sc.vs] || sc.vs} (${sc.vsBudget || 'fixed'}), 95% Wilson band; budget on a log scale`, { size: 13, fill: T.ink2 });
  for (const p of [0, 0.25, 0.5, 0.75, 1]) b += `<line x1="${x0}" x2="${x1}" y1="${Y(p)}" y2="${Y(p)}" stroke="${p === 0.5 ? T.muted : T.grid}" ${p === 0.5 ? 'stroke-dasharray="4 4"' : ''}/>` + text(x0 - 10, Y(p) + 4, p * 100 + '%', { size: 12, anchor: 'end', fill: T.ink2 });
  const band = [...sc.rows.map((r) => `${X(r.budget)},${Y(r.ci[1])}`), ...sc.rows.slice().reverse().map((r) => `${X(r.budget)},${Y(r.ci[0])}`)].join(' ');
  b += `<polygon points="${band}" fill="${c}" opacity="0.14"/>`;
  b += `<polyline points="${sc.rows.map((r) => `${X(r.budget)},${Y(r.winRate)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2"/>`;
  for (const r of sc.rows) {
    b += `<circle cx="${X(r.budget)}" cy="${Y(r.winRate)}" r="5" fill="${c}" stroke="${T.surface}" stroke-width="2"/>`;
    b += text(X(r.budget), y1 + 22, `${r.budget}`, { size: 12, anchor: 'middle', fill: T.ink2 }) + text(X(r.budget), y1 + 38, `${r.msMean.toFixed(1)} ms`, { size: 11, anchor: 'middle', fill: T.muted });
    b += text(X(r.budget), Y(r.winRate) - 12, `${(100 * r.winRate).toFixed(0)}%`, { size: 12, anchor: 'middle', fill: T.ink });
  }
  b += text((x0 + x1) / 2, H - 8, `${sc.unit} per decision (and measured mean ms per decision)`, { size: 13, anchor: 'middle', fill: T.ink2 });
  save(name, svg(W, H, b));
}

// ------------------------------------------------------------------ GA fitness
function ga(csv, name, title) {
  const rows = csv.trim().split('\n').slice(1).map((l) => l.split(',').map(Number));
  const W = 900, H = 400, x0 = 80, x1 = W - 140, y0 = 80, y1 = H - 60;
  const ys = rows.flatMap((r) => [r[1], r[2], r[3]]), lo = Math.min(...ys) - 0.02, hi = Math.max(...ys) + 0.02;
  const X = (g) => x0 + (x1 - x0) * (g / Math.max(1, rows.length - 1)), Y = (v) => y1 - (y1 - y0) * ((v - lo) / (hi - lo));
  let b = text(24, 34, title, { size: 20, weight: 700 }) + text(24, 58, 'fitness = win score + 0.25 x HP margin vs the fixed panel (default Minimax, MCTS, Fuzzy)', { size: 13, fill: T.ink2 });
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; b += `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="${T.grid}"/>` + text(x0 - 10, Y(v) + 4, v.toFixed(2), { size: 12, anchor: 'end', fill: T.ink2 }); }
  const series = [[1, 'best', AGENT_COLOR.minimax_ga], [2, 'mean', '#8a8984'], [3, 'worst', '#c3c2b7']];
  for (const [i, lab, c] of series) {
    b += `<polyline points="${rows.map((r) => `${X(r[0])},${Y(r[i])}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2"/>`;
    const last = rows[rows.length - 1];
    b += text(X(last[0]) + 10, Y(last[i]) + 4, `${lab} ${last[i].toFixed(3)}`, { size: 12, fill: T.ink2 });
  }
  rows.forEach((r) => { b += text(X(r[0]), y1 + 22, String(r[0]), { size: 12, anchor: 'middle', fill: T.ink2 }); });
  b += text((x0 + x1) / 2, H - 12, 'generation', { size: 13, anchor: 'middle', fill: T.ink2 });
  save(name, svg(W, H, b));
}

const J = (f) => (existsSync(join(OUT, f)) ? JSON.parse(readFileSync(join(OUT, f), 'utf8')) : null);
const rr = J('rr_main_summary.json');
if (rr) {
  matrix(rr.summaries, 'rr_matrix', 'Samurai mirror round-robin (reaction 9 frames, ~8 ms per decision)');
  forest(rr.summaries.filter((s) => ['minimax', 'mcts', 'fuzzy'].includes(s.a)), 'rr_winrates', 'Win rates with 95% confidence intervals');
  timing(rr.summaries, 'decision_time', 'Decision time per agent');
}
const ga2 = J('rr_ga_summary.json');
if (ga2) forest(ga2.summaries, 'ga_winrates', 'GA-tuned Minimax vs the field');
for (const [f, n, t] of [['scale_minimax.json', 'scale_minimax', 'Minimax: more nodes, more wins?'], ['scale_mcts.json', 'scale_mcts', 'MCTS: more rollouts, more wins?']]) { const s = J(f); if (s) scaling(s, n, t); }
if (existsSync(join(OUT, 'ga_log.csv'))) ga(readFileSync(join(OUT, 'ga_log.csv'), 'utf8'), 'ga_fitness', 'Genetic algorithm: eval-weight tuning');
