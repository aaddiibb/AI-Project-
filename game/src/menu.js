// Front end (DOM, 1920x1080 inside #hudbox): title -> main menu -> character select -> stage select -> VS -> fight,
// plus replay, options, exit, the in-game pause menu and the post-match menu. Keyboard (WASD / arrows, Enter / J to
// confirm, Esc / K / Backspace to go back) and mouse both work everywhere. The Pixi side (portraits, live models, hero
// art) is showcase.js. The human is always P1 on the keyboard.
// URL parameters preset (and with autostart=1 start) a game, skipping the front end, e.g.
//   index.html?mode=ava&p1=samurai&p2=samurai&a1=minimax&a2=mcts&l1=hard&l2=hard&autostart=1
//   index.html?mode=replay&replay=replays/demo_minimax_vs_mcts.json&autostart=1
import { AGENTS } from './ai/registry.js';
import { LEVELS } from './ai/difficulty.js';
import { STAGES } from './stage.js';
import { CONDITIONS, WEATHER_MODES, weatherLabel, rollConditions } from './atmosphere.js';
import { ROSTER, ROSTER_ORDER } from './roster.js';
import { getHpMult, setHpMult, touchInst } from './touch.js';
import { THINK_MODES, THINK_LABEL } from './overlay.js'; // HP setter (all devices) + touch button editor

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KEY = 'algo-fighter-menu';
const DESC = {
  minimax: 'Adversarial search: simultaneous-move maximin with alpha-beta, iterative deepening and a transposition table. Never gambles.',
  mcts: 'Monte Carlo tree search (decoupled UCT): samples thousands of rollouts and plays the most visited plan.',
  fuzzy: 'Mamdani fuzzy inference: 16 linguistic rules and centroid defuzzification. Pure instinct, no search.',
  scripted: 'Baseline: walks in, attacks in range, guards when you swing, punishes whiffs.',
  random: 'Baseline: a random legal action at every decision.',
};
const LEVEL_DESC = { easy: 'slow reactions, frequent mistakes', normal: 'human-like reactions', hard: 'fast and precise', master: 'full search budget, no mistakes' };
const MODES = {
  hva: { label: 'VERSUS CPU', desc: 'You against an AI. Choose your fighter, then its fighter, algorithm and difficulty.' },
  ava: { label: 'CPU vs CPU', desc: 'Watch two algorithms fight it out, with their thinking shown live.' },
  train: { label: 'TRAINING', desc: 'Free practice against a training dummy, with frame data, hit boxes and infinite meter.' },
  replay: { label: 'REPLAY', desc: 'Play back a recorded match, checked frame by frame against the original run.' },
  options: { label: 'OPTIONS', desc: 'Sound, match rules, time of day and weather, and the AI thinking overlay.' },
  exit: { label: 'EXIT', desc: 'Leave the game.' },
};
const DEMOS = [
  { file: 'replays/demo_samurai_vs_shinobi.json', label: 'SAMURAI vs SHINOBI', sub: 'MCTS vs MCTS · Crimson Tempest and Kage Bunshin both land' },
  { file: 'replays/demo_minimax_vs_mcts.json', label: 'SAMURAI MIRROR', sub: 'Minimax vs MCTS · the algorithm showcase, with a Crimson Tempest' },
];
const ROLE = { hva: ['human', 'ai'], ava: ['ai', 'ai'], train: ['human', 'dummy'] };
const NAV = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Enter: 'ok', NumpadEnter: 'ok', KeyJ: 'ok', Space: 'ok', Escape: 'back', KeyK: 'back', Backspace: 'back',
};
const wrap = (i, n) => ((i % n) + n) % n;
const HPS = [1, 2, 5]; // HP setter tiers: stock 1000, 2000, 5000
const touchHpLabel = (m) => `${1000 * (m || 1)} HP`;

export class Menu {
  /** hooks: { onStart(cfg) -> Promise (loads the game; the menu stays up until it resolves), onEnd() (drop the game),
   *  onResume(), onRestart(), sound, showcase } */
  constructor(hooks) {
    Object.assign(this, hooks);
    this.screen = null; this.focus = 0; this.log = null; this.mode = 'hva'; this.inTraining = false;
    this.opts = { think: 'auto', bestOf: 3, roundSecs: 99, weather: 'dynamic' };
    this.sel = { side: 0, row: 0, sides: [this.defSide('samurai', 0, 'minimax'), this.defSide('shinobi', 0, 'mcts')] };
    this.stageIx = 0;
    // the touch editor's DONE chip refreshes this screen (only when OPTIONS is showing)
    const t = touchInst();
    if (t) t.onEditEnd = () => { this.save(); if (this.screen === 'options') this.render(); };
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (s.opts) Object.assign(this.opts, s.opts);
      if (typeof this.opts.think === 'boolean') this.opts.think = this.opts.think ? 'auto' : 'off'; // (older saves: on / off)
      if (s.sides) s.sides.forEach((d, i) => Object.assign(this.sel.sides[i], d, { ready: false }));
    } catch { /* storage unavailable: defaults */ }
    this.el = $('menu');
    addEventListener('keydown', (e) => this.key(e), true);
    // URL presets (the capture tooling and the README links use these)
    const q = new URLSearchParams(location.search);
    this.preset = q.get('autostart') === '1' ? {
      mode: q.get('mode') || 'ava', chars: [q.get('p1') || 'samurai', q.get('p2') || 'samurai'], agents: [q.get('a1') || 'minimax', q.get('a2') || 'mcts'],
      levels: [q.get('l1') || 'hard', q.get('l2') || 'hard'], stage: q.get('stage') || 'auto', think: q.get('think') === '0' ? 'off' : THINK_MODES.includes(q.get('think')) ? q.get('think') : 'auto', replay: q.get('replay'), weather: q.get('weather') || 'dynamic',
    } : null;
  }
  defSide(char, pal, agent) { return { char, pal, agent, level: 'hard', ready: false }; }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ opts: this.opts, sides: this.sel.sides.map(({ char, pal, agent, level }) => ({ char, pal, agent, level })) })); } catch { /* storage unavailable */ } }

  async init() {
    if (!this.preset) return this.show('title');
    const p = this.preset;
    if (p.mode === 'replay' && !(await this.loadReplay(p.replay || DEMOS[0].file))) return this.show('title');
    this.mode = p.mode;
    const cfg = p.mode === 'replay' ? this.replayCfg() : {
      mode: p.mode, chars: p.chars, palettes: [0, 1], agents: [p.mode === 'ava' ? p.agents[0] : null, p.mode === 'train' ? null : p.agents[1]],
      levels: p.levels, stage: p.stage, think: p.think, bestOf: 3, roundSecs: 99,
    };
    cfg.conds = rollConditions(p.weather);
    this.cfg = cfg; this.hide(); await this.onStart(cfg);
  }

  // ------------------------------------------------------------------ screens
  get visible() { return !this.el.classList.contains('hide'); }
  /** the full-screen front end (no game behind it) vs an overlay on a running game (pause / result) */
  get overlay() { return this.screen === 'pause' || this.screen === 'result'; }
  show(screen, focus = 0) {
    if (screen !== 'options') touchInst()?.endEdit?.(); // leaving OPTIONS always leaves the button editor
    this.screen = screen; this.focus = focus;
    this.el.classList.remove('hide');
    this.el.dataset.screen = screen;
    document.body.classList.toggle('inmenu', !this.overlay);
    touchInst()?.setPaused?.(this.overlay || screen === 'vs'); // no controls over the pause / VS screens
    const sc = { title: 'title', main: 'title', options: 'title', replay: 'title', exit: 'title', bye: 'off', select: 'select', stage: 'stage', pause: 'off', result: 'off' }[screen];
    if (sc) this.showcase.setMode(sc);
    this.sound?.setScreen(this.overlay ? 'paused' : screen === 'select' || screen === 'stage' || screen === 'vs' ? 'select' : 'menu');
    this.render();
  }
  hide() { touchInst()?.endEdit?.(); touchInst()?.setPaused?.(false); this.el.classList.add('hide'); this.screen = null; document.body.classList.remove('inmenu'); this.showcase.setMode('off'); this.sound?.setScreen('battle'); touchInst()?.syncOrientation?.(); }
  pause() { this.show('pause'); }
  result(match) { this.lastWinner = match?.winner; this.show('result'); }

  render() {
    this.el.innerHTML = this['html_' + this.screen]();
    this.wire();
    if (this.screen === 'select') this.syncSelect();
  }
  ui(name) { this.sound?.ui(name); }

  // ------------------------------------------------------------------ list screens (main, pause, result, options, replay, exit)
  items() {
    switch (this.screen) {
      case 'main': return Object.keys(MODES).map((k) => ({ id: k, label: MODES[k].label, desc: MODES[k].desc }));
      case 'pause': return this.inTraining
        ? [{ id: 'resume', label: 'RESUME' }, { id: 'restart', label: 'RESET POSITIONS' }, { id: 'select', label: 'CHARACTER SELECT' }, { id: 'title', label: 'MAIN MENU' }]
        : [{ id: 'resume', label: 'RESUME' }, { id: 'restart', label: this.mode === 'replay' ? 'RESTART REPLAY' : 'RESTART MATCH' }, ...(this.mode === 'replay' ? [] : [{ id: 'select', label: 'CHARACTER SELECT' }]), { id: 'title', label: 'MAIN MENU' }];
      case 'result': return this.mode === 'replay' ? [{ id: 'restart', label: 'WATCH AGAIN' }, { id: 'replays', label: 'OTHER REPLAYS' }, { id: 'title', label: 'MAIN MENU' }]
        : [{ id: 'restart', label: 'REMATCH' }, { id: 'select', label: 'CHARACTER SELECT' }, { id: 'title', label: 'MAIN MENU' }];
      case 'exit': return [{ id: 'no', label: 'NO, KEEP FIGHTING' }, { id: 'yes', label: 'YES, QUIT' }];
      case 'replay': return [...DEMOS.map((d, i) => ({ id: 'demo' + i, label: d.label, desc: d.sub })), { id: 'file', label: 'LOAD A LOG FILE…', desc: 'An arena input log (node game/tools/arena.mjs … --replay N).' }, { id: 'back', label: 'BACK' }];
      case 'options': {
        const st = this.sound?.settings || {}, pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
        return [
          { id: 'master', label: 'MASTER VOLUME', value: pct(st.master), bar: st.master },
          { id: 'music', label: 'MUSIC', value: pct(st.music), bar: st.music },
          { id: 'sfx', label: 'EFFECTS', value: pct(st.sfx), bar: st.sfx },
          { id: 'muted', label: 'SOUND', value: st.muted ? 'OFF' : 'ON' },
          {
            id: 'think', label: 'AI THINKING OVERLAY', value: THINK_LABEL[this.opts.think] || 'AUTO',
            desc: 'How the CPU’s decisions are shown. Auto fits the screen (full cards on a desktop, a one-line ticker on a phone), Compact = the pick and top 3 only, Off = hidden. In a match: H, or the AI chip.',
          },
          { id: 'bestOf', label: 'ROUNDS', value: `BEST OF ${this.opts.bestOf}` },
          { id: 'roundSecs', label: 'ROUND TIME', value: `${this.opts.roundSecs} s` },
          {
            id: 'weather', label: 'TIME & WEATHER', value: weatherLabel(this.opts.weather),
            desc: 'Dynamic: the day turns as the match goes on (day, then dusk or night, then a storm, rain or snow). Random, or one fixed sky. Looks only: the fight plays the same.',
          },
          // HP works on PC and phone; the button editor only exists when the touch overlay is mounted
          ...(touchInst() ? [{
            id: 'moveBtns', label: 'MOVE BUTTONS', value: touchInst().edit ? 'EDITING' : 'OFF',
            desc: 'Opens the drag editor: move the D-pad, the buttons and the ☰ / ⛶ / AI chip row anywhere, then tap DONE. Positions are saved.',
          }] : []),
          {
            id: 'hp', label: 'HP SETTER', value: touchHpLabel(getHpMult()),
            desc: 'Fighter health on both sides: 1000 (stock), 2000 or 5000. Applies from the next game on.',
          },
          { id: 'back', label: 'BACK' },
        ];
      }
    }
    return [];
  }
  html_list(title, sub = '', cls = '') {
    const it = this.items();
    this.focus = Math.max(0, Math.min(this.focus, it.length - 1));
    const val = (x) => `<span class="val"><b class="arr" data-d="-1">◀</b>${x.bar !== undefined ? `<i class="vbar"><i style="width:${Math.round(x.bar * 100)}%"></i></i>` : ''}<em>${esc(x.value)}</em><b class="arr" data-d="1">▶</b></span>`;
    return `<div class="lscreen ${cls}">${title}${sub}
      <ul class="mlist">${it.map((x, i) => `<li data-i="${i}" class="${i === this.focus ? 'on' : ''}"><span class="lb">${esc(x.label)}</span>${x.value !== undefined ? val(x) : ''}</li>`).join('')}</ul>
      <div class="mdesc">${esc(it[this.focus]?.desc || '')}</div></div>`;
  }
  logo(small = false) { return `<div class="logo ${small ? 'small' : ''}"><div class="lk">剣</div><h1>ALGO<span>FIGHTER</span></h1><h2>DUEL OF ALGORITHMS</h2></div>`; }
  html_title() {
    const t = !!touchInst();
    return `<div class="tscreen">${this.logo()}<div class="press">${t ? 'TAP TO START' : 'PRESS ENTER'}</div><div class="foot">SAMURAI · SHINOBI · MINIMAX · MCTS · FUZZY LOGIC</div></div>`;
  }
  html_main() { return this.html_list(this.logo(true), '', 'main'); }
  html_pause() { return this.html_list('<h3 class="ltitle">PAUSED</h3>', '', 'pause'); }
  html_result() {
    const w = this.lastWinner;
    return this.html_list(`<h3 class="ltitle">${w === null || w === undefined ? 'DRAW' : `PLAYER ${w + 1} WINS`}</h3>`, '', 'pause result');
  }
  html_exit() { return this.html_list('<h3 class="ltitle">QUIT ALGO FIGHTER?</h3>', '', 'pause'); }
  html_bye() { return `<div class="tscreen bye">${this.logo()}<div class="press">THANKS FOR PLAYING</div><div class="foot">${touchInst() ? 'tap to return to the title' : 'you can close this tab now · any key returns to the title'}</div></div>`; }
  html_options() { return this.html_list('<h3 class="ltitle">OPTIONS</h3>', `<div class="lsub">${touchInst() ? 'tap a row or its ◀ ▶ arrows to change' : '◀ ▶ change the value'}</div>`, 'opts'); }
  html_replay() { return this.html_list('<h3 class="ltitle">REPLAY</h3>', `<div class="lsub">${esc(this.repStatus || 'choose a recorded match')}</div>`, 'opts'); }

  listAct(id, d = 0) {
    const st = this.sound?.settings;
    switch (this.screen) {
      case 'main':
        if (d) return;
        this.ui('ui_go');
        if (id === 'options' || id === 'exit' || id === 'replay') return this.show(id);
        this.mode = id; return this.enterSelect();
      case 'pause':
      case 'result':
        if (d) return;
        this.ui('ui_go');
        if (id === 'resume') { this.hide(); return this.onResume(); }
        if (id === 'restart') { this.hide(); return this.onRestart(); }
        this.onEnd();
        if (id === 'select') return this.enterSelect();
        if (id === 'replays') return this.show('replay');
        return this.show('main');
      case 'exit':
        if (d) return;
        if (id === 'no') { this.ui('ui_back'); return this.show('main', 5); }
        this.ui('ui_go'); try { window.close(); } catch { /* only script-opened windows can close */ }
        return this.show('bye');
      case 'replay':
        if (d) return;
        if (id === 'back') { this.ui('ui_back'); return this.show('main', 3); }
        if (id === 'file') { $('replayFile').click(); return; }
        this.ui('ui_go');
        return this.loadReplay(DEMOS[+id.slice(4)].file).then((ok) => ok && this.vs(this.replayCfg()));
      case 'options': {
        if (id === 'back') { if (d) return; this.ui('ui_back'); this.save(); return this.show('main', 4); }
        const step = d || 1;
        if (id === 'master' || id === 'music' || id === 'sfx') this.sound?.set(id, Math.max(0, Math.min(1, Math.round((st[id] + step * 0.1) * 10) / 10)));
        if (id === 'muted') this.sound?.set('muted', !st.muted);
        if (id === 'think') this.opts.think = THINK_MODES[wrap(THINK_MODES.indexOf(this.opts.think) + step, THINK_MODES.length)];
        if (id === 'bestOf') { const o = [1, 3, 5]; this.opts.bestOf = o[wrap(o.indexOf(this.opts.bestOf) + step, 3)]; }
        if (id === 'roundSecs') { const o = [45, 60, 99]; this.opts.roundSecs = o[wrap(o.indexOf(this.opts.roundSecs) + step, 3)]; }
        if (id === 'weather') this.opts.weather = WEATHER_MODES[wrap(WEATHER_MODES.indexOf(this.opts.weather) + step, WEATHER_MODES.length)];
        const t = touchInst();
        if (id === 'moveBtns' && t) { // toggle the drag editor (begin Edit shows the clusters over this menu)
          if (t.edit) t.endEdit(false); else t.beginEdit();
          this.ui('ui_tab'); return this.render();
        }
        if (id === 'hp') setHpMult(HPS[wrap(HPS.indexOf(getHpMult()) + step, HPS.length)]);
        this.ui('ui_tab'); this.save(); return this.render();
      }
    }
  }

  // ------------------------------------------------------------------ replay files
  async loadReplay(url) {
    try { const log = await (await fetch(url)).json(); this.setLog(log, url.split('/').pop()); return true; }
    catch { this.repStatus = 'could not load ' + url; if (this.screen) this.render(); return false; }
  }
  setLog(log, name) {
    if (!log?.inputs || !log.chars) throw new Error('not a replay log');
    this.log = log; this.mode = 'replay';
    const m = log.meta || {};
    this.repStatus = `${name}: ${m.names ? m.names.join(' vs ') : log.chars.join(' vs ')} · ${log.inputs.length} frames`;
  }
  replayCfg() {
    const log = this.log, m = log.meta || {};
    return { mode: 'replay', chars: log.chars, palettes: [0, 1], agents: [null, null], levels: m.levels || ['hard', 'hard'], stage: 'auto', think: this.opts.think, log, names: m.names || m.agents };
  }

  // ------------------------------------------------------------------ character select
  get roles() { return ROLE[this.mode]; }
  rows(i) { return ['char', 'pal', ...(this.roles[i] === 'ai' ? ['agent', 'level'] : []), 'ok']; }
  enterSelect() {
    const S = this.sel; S.side = 0; S.row = 0; S.sides.forEach((s) => { s.ready = false; });
    this.fixPal(1);
    this.show('select');
  }
  /** the second side may not wear the first side's colours in a mirror match */
  fixPal(i) {
    const a = this.sel.sides[1 - i], b = this.sel.sides[i];
    if (a.char === b.char && a.pal === b.pal && a.char !== 'random') b.pal = wrap(b.pal + 1, 4);
  }
  html_select() {
    const R = this.roles, lab = (i) => ({ human: 'PLAYER 1', ai: this.mode === 'ava' ? `CPU ${i + 1}` : 'CPU', dummy: 'DUMMY' })[R[i]];
    const tag = (i) => (R[i] === 'human' ? '1P' : R[i] === 'dummy' ? 'DMY' : this.mode === 'ava' ? `C${i + 1}` : 'CPU');
    const cells = [...ROSTER_ORDER, 'random'].map((id) => `<div class="cell" data-c="${id}">${id === 'random' ? '<div class="q">?</div>' : `<div class="cimg" style="background-image:url(${ROSTER[id].face})"></div>`}<span>${id === 'random' ? 'RANDOM' : ROSTER[id].name}</span><i class="cur c0">${tag(0)}</i><i class="cur c1">${tag(1)}</i></div>`).join('');
    const arrows = (id) => `<span class="v"><b class="arr" data-d="-1">◀</b><em id="${id}"></em><b class="arr" data-d="1">▶</b></span>`;
    const side = (i) => `<div class="plate p${i}"><div class="pk" id="pk${i}"></div><div class="who">${lab(i)}</div><div class="nm" id="nm${i}"></div><div class="tt" id="tt${i}"></div><div class="stats" id="st${i}"></div></div>
      <div class="sside s${i}" id="side${i}">
        <div class="srow" data-r="char"><span class="k">FIGHTER</span>${arrows('vc' + i)}</div>
        <div class="srow" data-r="pal"><span class="k">COLOR</span><span class="v pals" id="pals${i}"></span><em class="pl" id="vp${i}"></em></div>
        ${R[i] === 'ai' ? `<div class="srow" data-r="agent"><span class="k">ALGORITHM</span>${arrows('va' + i)}</div><div class="srow" data-r="level"><span class="k">DIFFICULTY</span>${arrows('vl' + i)}</div>` : ''}
        <div class="srow ok" data-r="ok"><span class="okb" id="ok${i}">READY</span></div>
        <div class="sdesc" id="sd${i}"></div>
      </div>`;
    return `<div class="sscreen"><div class="shead"><b>SELECT YOUR FIGHTER</b><span>${esc(MODES[this.mode].label)}</span></div>
      <div class="grid" id="grid">${cells}</div><div class="svs">VS</div>
      ${side(0)}${side(1)}
      <div class="hints">${touchInst() ? 'tap a fighter · tap a row to change it · tap READY' : '<kbd>W</kbd><kbd>S</kbd> row · <kbd>A</kbd><kbd>D</kbd> change · <kbd>Enter</kbd> next / ready · <kbd>Esc</kbd> back'}</div></div>`;
  }
  syncSelect() {
    const S = this.sel;
    for (const i of [0, 1]) {
      const sd = S.sides[i], rnd = sd.char === 'random' && !sd.ready, id = sd.ready ? sd.rolled : rnd ? this.randomShow(i) : sd.char, R = ROSTER[id];
      const active = S.side === i && !sd.ready;
      $('side' + i).classList.toggle('active', active); $('side' + i).classList.toggle('ready', sd.ready); $('side' + i).classList.toggle('wait', !active && !sd.ready);
      $('nm' + i).textContent = rnd ? '? ? ?' : R.name;
      $('tt' + i).textContent = rnd ? 'RANDOM FIGHTER' : R.title;
      $('pk' + i).textContent = rnd ? '?' : R.kanji;
      $('st' + i).innerHTML = rnd ? '' : R.style.map(([k, v]) => `<div><span>${k}</span><i>${'<b></b>'.repeat(v)}${'<u></u>'.repeat(5 - v)}</i></div>`).join('');
      $('vc' + i).textContent = sd.char === 'random' ? 'RANDOM' : R.name;
      const taken = i === 1 && S.sides[0].char === sd.char ? S.sides[0].pal : -1;
      $('pals' + i).innerHTML = R.palettes.map((p, k) => `<i class="chip ${k === sd.pal ? 'on' : ''} ${k === taken ? 'taken' : ''}" data-p="${k}" title="${p.label}" style="--a:${p.sw[0]};--b:${p.sw[1]};--c:${p.sw[2]}"></i>`).join('');
      $('vp' + i).textContent = R.palettes[sd.pal].label.toUpperCase();
      if ($('va' + i)) { $('va' + i).textContent = AGENTS[sd.agent].label; $('vl' + i).textContent = LEVELS[sd.level].label; }
      $('ok' + i).textContent = sd.ready ? 'READY ✓' : 'READY';
      const row = this.rows(i)[S.row];
      $('sd' + i).textContent = active && row === 'agent' ? DESC[sd.agent] : active && row === 'level' ? `${LEVELS[sd.level].label}: ${LEVEL_DESC[sd.level] || ''}`
        : rnd ? 'A fighter is drawn at random when you confirm.' : R.blurb;
      for (const r of $('side' + i).querySelectorAll('.srow')) r.classList.toggle('on', active && r.dataset.r === row);
      this.showcase.setSide(i, id, sd.pal);
    }
    for (const c of $('grid').querySelectorAll('.cell')) {
      for (const i of [0, 1]) c.querySelector('.c' + i).classList.toggle('show', S.sides[i].char === c.dataset.c);
      c.classList.toggle('hot', S.sides[S.side].char === c.dataset.c && !S.sides[S.side].ready);
    }
  }
  /** while RANDOM is highlighted the preview cycles through the roster */
  randomShow(i) { return ROSTER_ORDER[Math.floor(performance.now() / 600 + i) % ROSTER_ORDER.length]; }
  selNav(cmd) {
    const S = this.sel, i = S.side, sd = S.sides[i], rows = this.rows(i), row = rows[S.row];
    if (sd.ready) { // both ready, waiting for the stage screen: only "back" does anything
      if (cmd === 'back') { clearTimeout(this.nextT); sd.ready = false; this.ui('ui_back'); this.syncSelect(); }
      return;
    }
    if (cmd === 'up' || cmd === 'down') { S.row = wrap(S.row + (cmd === 'up' ? -1 : 1), rows.length); this.ui('ui_hover'); }
    else if (cmd === 'left' || cmd === 'right') this.selChange(i, row, cmd === 'left' ? -1 : 1);
    else if (cmd === 'ok') { if (row !== 'ok') { S.row++; this.ui('ui_tab'); } else return this.ready(i); }
    else if (cmd === 'back') {
      this.ui('ui_back');
      if (S.row > 0) S.row--;
      else if (i === 1) { S.side = 0; S.sides[0].ready = false; S.row = this.rows(0).length - 1; }
      else return this.show('main', Object.keys(MODES).indexOf(this.mode));
    }
    this.syncSelect();
  }
  selChange(i, row, d) {
    const sd = this.sel.sides[i], other = this.sel.sides[1 - i];
    if (row === 'char') { const ids = [...ROSTER_ORDER, 'random']; sd.char = ids[wrap(ids.indexOf(sd.char) + d, ids.length)]; if (i === 1) this.fixPal(1); }
    else if (row === 'pal') { sd.pal = wrap(sd.pal + d, 4); if (i === 1 && other.char === sd.char && sd.pal === other.pal) sd.pal = wrap(sd.pal + d, 4); }
    else if (row === 'agent') { const k = Object.keys(AGENTS); sd.agent = k[wrap(k.indexOf(sd.agent) + d, k.length)]; }
    else if (row === 'level') { const k = Object.keys(LEVELS); sd.level = k[wrap(k.indexOf(sd.level) + d, k.length)]; }
    else return;
    this.ui('ui_tab');
  }
  ready(i) {
    const S = this.sel, sd = S.sides[i];
    sd.rolled = sd.char === 'random' ? ROSTER_ORDER[Math.floor(Math.random() * ROSTER_ORDER.length)] : sd.char; // (UI only: Math.random is fine)
    if (i === 1 && sd.rolled === S.sides[0].rolled && sd.pal === S.sides[0].pal) sd.pal = wrap(sd.pal + 1, 4);
    sd.ready = true; this.ui('ui_pick');
    this.showcase.setSide(i, sd.rolled, sd.pal).then(() => this.showcase.pick(i));
    if (i === 0) { S.side = 1; S.row = 0; this.fixPal(1); this.syncSelect(); return; }
    this.syncSelect(); this.save();
    clearTimeout(this.nextT); this.nextT = setTimeout(() => { if (this.screen === 'select' && S.sides[1].ready) this.show('stage', this.stageIx); }, 1000);
  }

  // ------------------------------------------------------------------ stage select
  stageList() { return [...Object.entries(STAGES).map(([id, s]) => ({ id, label: s.label.toUpperCase(), img: s.base + 'preview.png' })), { id: 'random', label: 'RANDOM', img: null }]; }
  html_stage() {
    const L = this.stageList(), cur = L[this.focus];
    return `<div class="stscreen"><div class="shead"><b>SELECT STAGE</b><span>${esc(MODES[this.mode].label)}</span></div>
      <div class="sbig">${cur.img ? `<img src="${cur.img}" alt="">` : '<div class="q">?</div>'}<div class="sname">${esc(cur.label)}</div></div>
      <div class="sweather">TIME &amp; WEATHER · <b>${esc(weatherLabel(this.opts.weather))}</b>${this.opts.weather === 'dynamic' ? ' — the day turns round by round' : ''}</div>
      <div class="sthumbs">${L.map((s, i) => `<div class="th ${i === this.focus ? 'on' : ''}" data-i="${i}">${s.img ? `<img src="${s.img}" alt="">` : '<div class="q">?</div>'}<span>${esc(s.label)}</span></div>`).join('')}</div>
      <div class="hints">${touchInst() ? 'tap a stage to fight' : '<kbd>A</kbd><kbd>D</kbd> choose · <kbd>Enter</kbd> fight · <kbd>Esc</kbd> back'}</div></div>`;
  }
  stageNav(cmd) {
    const L = this.stageList();
    if (cmd === 'left' || cmd === 'right' || cmd === 'up' || cmd === 'down') { this.focus = wrap(this.focus + (cmd === 'left' || cmd === 'up' ? -1 : 1), L.length); this.ui('ui_hover'); return this.render(); }
    if (cmd === 'back') { this.ui('ui_back'); const S = this.sel; S.sides[1].ready = false; S.side = 1; S.row = 0; return this.show('select'); }
    if (cmd === 'ok') {
      this.stageIx = this.focus;
      let st = L[this.focus].id; if (st === 'random') st = L[Math.floor(Math.random() * (L.length - 1))].id;
      const S = this.sel.sides, R = this.roles;
      this.vs({
        mode: this.mode, chars: S.map((s) => s.rolled), palettes: S.map((s) => s.pal),
        agents: R.map((r, i) => (r === 'ai' ? S[i].agent : null)), levels: S.map((s) => s.level),
        stage: st, think: this.opts.think, bestOf: this.opts.bestOf, roundSecs: this.opts.roundSecs,
      });
    }
  }

  // ------------------------------------------------------------------ VS screen: shown while the game loads
  vs(cfg) {
    cfg.conds ||= rollConditions(this.opts.weather); // the rounds' time of day / weather, shown as a forecast
    this.cfg = cfg; this.inTraining = cfg.mode === 'train';
    this.show('vs');
    this.showcase.vs(cfg.chars);
    this.ui('vs_slam');
    const min = new Promise((r) => { this.vsSkip = r; setTimeout(r, 3000); });
    const load = this.onStart(cfg);
    Promise.all([min, load]).then(() => { if (this.screen === 'vs') this.hide(); });
  }
  html_vs() {
    const c = this.cfg, who = (i) => {
      if (c.mode === 'replay') return `REPLAY · ${esc(String(c.names?.[i] || '').toUpperCase())}`;
      if (c.agents[i]) return `${esc(AGENTS[c.agents[i]].label)} · ${esc(LEVELS[c.levels[i]].label.toUpperCase())}`;
      return c.mode === 'train' && i === 1 ? 'TRAINING DUMMY' : 'PLAYER 1';
    };
    const pal = (i) => ROSTER[c.chars[i]].palettes[c.palettes?.[i] ?? i].label.toUpperCase();
    const stage = STAGES[c.stage]?.label.toUpperCase() || '';
    return `<div class="vsscreen"><div class="vsn l"><b>${ROSTER[c.chars[0]].name}</b><span>${who(0)}</span><small>${pal(0)}</small></div>
      <div class="vsbig">VS</div>
      <div class="vsn r"><b>${ROSTER[c.chars[1]].name}</b><span>${who(1)}</span><small>${pal(1)}</small></div>
      <div class="vsstage">${esc(stage)}${stage ? ' · ' : ''}${c.mode === 'train' ? 'TRAINING' : `BEST OF ${c.bestOf || c.log?.bestOf || 3}`}</div>
      <div class="vsfore">${c.conds.slice(0, c.mode === 'train' ? 1 : Math.min(3, c.bestOf || c.log?.bestOf || 3)).map((k, i) => `<span><i>${CONDITIONS[k].icon}</i>${c.mode === 'train' ? '' : `R${i + 1} · `}${CONDITIONS[k].label}</span>`).join('<b>›</b>')}</div></div>`;
  }

  // ------------------------------------------------------------------ input
  key(e) {
    if (!this.visible || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyM' || e.code === 'F1' || e.code === 'F5' || e.code === 'F12') return; // mute / help / browser keys pass through
    const cmd = NAV[e.code];
    e.preventDefault(); e.stopPropagation();
    if (e.repeat && (cmd === 'ok' || cmd === 'back')) return;
    this.sound?.unlock();
    const s = this.screen;
    if (s === 'title' || s === 'bye') { this.ui('ui_go'); return this.show('main'); }
    if (s === 'vs') { if (cmd === 'ok') this.vsSkip?.(); return; }
    if (!cmd) return;
    if (s === 'select') return this.selNav(cmd);
    if (s === 'stage') return this.stageNav(cmd);
    // list screens
    const it = this.items();
    if (cmd === 'up' || cmd === 'down') { this.focus = wrap(this.focus + (cmd === 'up' ? -1 : 1), it.length); this.ui('ui_hover'); return this.render(); }
    if (cmd === 'left' || cmd === 'right') return it[this.focus]?.value !== undefined && this.listAct(it[this.focus].id, cmd === 'left' ? -1 : 1);
    if (cmd === 'ok') return this.listAct(it[this.focus].id);
    if (cmd === 'back') {
      if (s === 'pause') { this.ui('ui_back'); this.hide(); return this.onResume(); }
      if (s === 'result') return;
      this.ui('ui_back');
      if (s === 'options') this.save();
      return this.show(s === 'main' ? 'title' : 'main', { options: 4, replay: 3, exit: 5 }[s] || 0);
    }
  }
  /** mouse: hover focuses, click acts (bound after every render) */
  wire() {
    const s = this.screen, el = this.el;
    if (s === 'title' || s === 'bye') { el.querySelector('.tscreen').onclick = () => { this.sound?.unlock(); this.ui('ui_go'); this.show('main'); }; return; }
    if (s === 'vs') { el.querySelector('.vsscreen').onclick = () => this.vsSkip?.(); return; }
    if (s === 'stage') {
      for (const t of el.querySelectorAll('.th')) {
        t.onmouseenter = () => { if (this.focus !== +t.dataset.i) { this.focus = +t.dataset.i; this.ui('ui_hover'); this.render(); } };
        t.onclick = () => { this.focus = +t.dataset.i; this.stageNav('ok'); };
      }
      return;
    }
    if (s === 'select') {
      const S = this.sel;
      for (const c of el.querySelectorAll('.cell')) c.onclick = () => {
        const sd = S.sides[S.side]; if (sd.ready) return;
        sd.char = c.dataset.c; if (S.side === 1) this.fixPal(1); S.row = 0; this.ui('ui_tab'); this.syncSelect();
      };
      for (const i of [0, 1]) $('side' + i).onclick = (e) => {
        if (S.sides[i].ready || (i === 1 && !S.sides[0].ready) || (i === 0 && S.side === 1 && S.sides[0].ready)) return;
        const row = e.target.closest('.srow'); if (!row) return;
        S.side = i; S.row = this.rows(i).indexOf(row.dataset.r);
        const chip = e.target.closest('.chip'), arr = e.target.closest('.arr');
        if (chip && !chip.classList.contains('taken')) { S.sides[i].pal = +chip.dataset.p; this.ui('ui_tab'); }
        else if (arr) this.selChange(i, row.dataset.r, +arr.dataset.d);
        else if (row.dataset.r === 'ok') return this.ready(i);
        // a phone has no cursor: the whole row is the button (the arrows keep working for keyboard / mouse)
        else if (touchInst()) this.selChange(i, row.dataset.r, 1);
        this.syncSelect();
      };
      clearInterval(this.rndT); // RANDOM preview cycling
      this.rndT = setInterval(() => { if (this.screen !== 'select') return clearInterval(this.rndT); if (S.sides.some((x) => x.char === 'random' && !x.ready)) this.syncSelect(); }, 600);
      return;
    }
    for (const li of el.querySelectorAll('.mlist li')) {
      const i = +li.dataset.i;
      li.onmouseenter = () => {
        if (this.focus === i) return;
        this.focus = i; this.ui('ui_hover');
        for (const x of el.querySelectorAll('.mlist li')) x.classList.toggle('on', +x.dataset.i === i);
        el.querySelector('.mdesc').textContent = this.items()[i]?.desc || '';
      };
      li.onclick = (e) => { const a = e.target.closest('.arr'); this.focus = i; this.listAct(this.items()[i].id, a ? +a.dataset.d : 0); };
    }
    if (s === 'replay') {
      const inp = $('replayFile');
      inp.onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { this.setLog(JSON.parse(await f.text()), f.name); this.vs(this.replayCfg()); }
        catch { this.repStatus = 'not a replay log: ' + f.name; this.render(); }
        inp.value = '';
      };
    }
  }
}
