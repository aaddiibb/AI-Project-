// Title menu (prompt 05 §6.1): Human vs AI | AI vs AI | Training | Replay, character select per side, agent select,
// difficulty select, "show AI thinking". The human is always P1 on the keyboard.
// URL parameters preset (and with autostart=1 start) a game, e.g.
//   index.html?mode=ava&p1=samurai&p2=samurai&a1=minimax&a2=mcts&l1=hard&l2=hard&autostart=1
//   index.html?mode=replay&replay=replays/demo_minimax_vs_mcts.json&autostart=1
import { AGENTS } from './ai/registry.js';
import { LEVELS } from './ai/difficulty.js';

const $ = (id) => document.getElementById(id);
const DESC = {
  minimax: 'Adversarial search: simultaneous-move maximin with alpha-beta, iterative deepening, transposition table. Never gambles.',
  mcts: 'Monte Carlo tree search, decoupled UCT for simultaneous moves: samples rollouts, picks the most visited macro.',
  fuzzy: 'Mamdani fuzzy inference: 16 linguistic rules, centroid defuzzification. Instinct, no search.',
  scripted: 'Baseline: walk in, light in range, guard when the opponent swings, heavy on a whiff.',
  random: 'Baseline: a uniformly random legal macro at every decision.',
};

export class Menu {
  constructor(onStart, sound = null) {
    this.onStart = onStart; this.mode = 'ava'; this.log = null; this.sound = sound;
    for (const i of [0, 1]) {
      $('a' + i).innerHTML = Object.entries(AGENTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
      $('l' + i).innerHTML = Object.entries(LEVELS).map(([k, v]) => `<option value="${k}">${v.label} (${v.budgetMs} ms, ${v.reactionFrames} f, ${Math.round(v.mistakeRate * 100)}%)</option>`).join('');
      $('a' + i).onchange = () => this.desc();
    }
    $('a0').value = 'minimax'; $('a1').value = 'mcts'; $('l0').value = 'hard'; $('l1').value = 'hard';
    for (const b of document.querySelectorAll('#modes button')) b.onclick = () => { this.setMode(b.dataset.mode); this.sound?.ui('ui_tab'); };
    $('go').onclick = () => { this.sound?.unlock(); this.sound?.ui('ui_go'); this.start(); };
    for (const el of document.querySelectorAll('#menu button, #menu select')) el.addEventListener('mouseenter', () => this.sound?.ui('ui_hover'));
    for (const el of document.querySelectorAll('#menu select')) el.addEventListener('change', () => this.sound?.ui('ui_tab'));
    $('replayFile').onchange = async (e) => { const f = e.target.files[0]; if (f) this.setLog(JSON.parse(await f.text()), f.name); };
    $('demoReplay').onclick = () => this.loadReplay('replays/demo_minimax_vs_mcts.json');
    // URL presets
    const q = new URLSearchParams(location.search);
    if (q.get('p1')) $('c0').value = q.get('p1');
    if (q.get('p2')) $('c1').value = q.get('p2');
    if (q.get('a1')) $('a0').value = q.get('a1');
    if (q.get('a2')) $('a1').value = q.get('a2');
    if (q.get('l1')) $('l0').value = q.get('l1');
    if (q.get('l2')) $('l1').value = q.get('l2');
    if (q.get('think') === '0') $('optThink').checked = false;
    this.setMode(q.get('mode') || 'ava');
    this.autostart = q.get('autostart') === '1';
    this.replayUrl = q.get('replay');
  }
  async init() {
    if (this.replayUrl) await this.loadReplay(this.replayUrl);
    if (this.autostart) this.start(); else this.show();
  }
  async loadReplay(url) {
    try { const log = await (await fetch(url)).json(); this.setLog(log, url.split('/').pop()); }
    catch (e) { $('repStatus').textContent = 'could not load ' + url; }
  }
  setLog(log, name) {
    this.log = log; this.setMode('replay');
    const m = log.meta || {};
    $('repStatus').textContent = `${name}: ${m.names ? m.names.join(' vs ') : ''} · ${log.inputs.length} frames · ${log.checkpoints.length} checkpoints`;
  }
  setMode(m) {
    this.mode = m;
    for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.mode === m);
    for (const el of document.querySelectorAll('.ai-only')) el.classList.toggle('hide', m !== 'ava');
    for (const el of document.querySelectorAll('.ai2')) el.classList.toggle('hide', m === 'train' || m === 'replay');
    $('sides').classList.toggle('hide', m === 'replay');
    $('repRow').classList.toggle('hide', m !== 'replay');
    $('go').textContent = m === 'train' ? 'TRAIN' : m === 'replay' ? 'PLAY BACK' : 'FIGHT';
    this.desc();
  }
  desc() {
    $('d0').textContent = this.mode === 'ava' ? DESC[$('a0').value] : this.mode === 'train' || this.mode === 'hva' ? 'You (keyboard). F1 shows the controls.' : '';
    $('d1').textContent = this.mode === 'train' ? 'Training dummy (Tab / 1-6 change its behaviour).' : DESC[$('a1').value] || '';
  }
  show() { $('menu').classList.remove('hide'); this.sound?.setMenu(true); }
  hide() { $('menu').classList.add('hide'); this.sound?.setMenu(false); }
  get visible() { return !$('menu').classList.contains('hide'); }
  start() {
    if (this.mode === 'replay' && !this.log) { $('repStatus').textContent = 'choose a log file first'; return; }
    const cfg = {
      mode: this.mode,
      chars: this.mode === 'replay' ? this.log.chars : [$('c0').value, $('c1').value],
      agents: [this.mode === 'ava' ? $('a0').value : null, this.mode === 'ava' || this.mode === 'hva' ? $('a1').value : null],
      levels: [$('l0').value, $('l1').value],
      think: $('optThink').checked,
      log: this.mode === 'replay' ? this.log : null,
    };
    this.hide();
    this.onStart(cfg);
  }
}
