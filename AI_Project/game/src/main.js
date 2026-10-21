// Boot + main loop: fixed 60 Hz simulation, title menu, game modes, effects, HUD and the AI thinking overlay.
//
// Modes (menu.js):
//   Human vs AI   P1 keyboard, P2 an agent at a difficulty level            -> Match (best of 3, 99 s rounds)
//   AI vs AI      both sides agents (the mirror-match showcase)            -> Match
//   Training      P1 keyboard vs the training dummy (the original test bed) -> bare Sim with the old KO auto-reset
//   Replay        an arena input log played back bit-identically            -> Match + ReplayController, hashes verified
// Every fighter uses its own character's rig, P2 rig, poses, anims and move data (prompt 05 §4.1). In a mirror match P1
// uses rig.json and P2 rig_p2.json, so the two Samurai are always distinguishable. Rendering never affects the sim.
// Sound (prompt 06, src/audio/): cues are read from the live sim once per step, next to the effects; audio never writes
// to the sim, and nothing headless imports it.
import { Sim } from './sim.js';
import { Keyboard } from './input.js';
import { dummyInput, DUMMY_MODES } from './dummy.js';
import { Puppet, Camera, loadRig, loadPoses, VIEW_W, VIEW_H } from './render.js';
import { Stage } from './stage.js';
import { Fx } from './fx.js';
import { Hud } from './hud.js';
import { Overlay } from './overlay.js';
import { Menu } from './menu.js';
import { getChar } from './characters/index.js';
import { Match, AgentController, ReplayController, FnController } from './ai/match.js';
import { makeAgent, AGENTS } from './ai/registry.js';
import { LEVELS, levelOptions } from './ai/difficulty.js';
import { WorkerAgent } from './ai/remote.js';
import { Sound } from './audio/index.js';

const PIXI = window.PIXI;
const $ = (id) => document.getElementById(id);
const rnd32 = () => crypto.getRandomValues(new Uint32Array(1))[0];

(async () => {
  const app = new PIXI.Application();
  await app.init({ resizeTo: window, background: 0x14121c, antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true });
  $('app').appendChild(app.canvas);

  const root = new PIXI.Container();
  app.stage.addChild(root);
  const mask = new PIXI.Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(0xffffff);
  root.addChild(mask); root.mask = mask;
  const world = new PIXI.Container();
  root.addChild(world);
  const back = new PIXI.Container(), dim = new PIXI.Graphics(), shadows = new PIXI.Graphics(), fighterLayer = new PIXI.Container(), fxLayer = new PIXI.Container(), front = new PIXI.Container();
  world.addChild(back, dim, shadows, fighterLayer, fxLayer, front);
  const layout = () => { const s = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H); root.scale.set(s); root.position.set((innerWidth - VIEW_W * s) / 2, (innerHeight - VIEW_H * s) / 2); };
  layout(); addEventListener('resize', layout);

  const stage = new Stage(PIXI, back, front);
  await stage.load();
  const fx = new Fx(PIXI, fxLayer, null, null);
  const kb = new Keyboard();
  const hud = new Hud();
  const overlay = new Overlay();
  const camera = new Camera();
  const sound = new Sound();

  // ------------------------------------------------------------------ game state
  const G = { cfg: null, mode: null, sim: null, match: null, puppets: [null, null], agents: [null, null], phase: 'fight', lastPhase: null, round: -1, data: null };
  const S = { dummy: 'stand', paused: false, stepOnce: false, speed: 1, debug: false, stepEvery: 1, infMeter: false, superFx: null, flash: [0, 0], first: true, prevT: [0, 0] };

  function labelOf(i) {
    const c = G.cfg;
    if (c.mode === 'replay') { const m = c.log.meta || {}; return `P${i + 1} · REPLAY ${(m.names?.[i] || '').toUpperCase()}`; }
    if (!c.agents[i]) return c.mode === 'train' && i === 1 ? 'DUMMY' : `P${i + 1} · YOU`;
    return `P${i + 1} · ${AGENTS[c.agents[i]].label} · ${LEVELS[c.levels[i]].label}`;
  }

  function makeAi(i) {
    const name = G.cfg.agents[i], level = G.cfg.levels[i];
    const opts = { ...levelOptions(name, level, 'time'), side: i, seed: rnd32(), level };
    return LEVELS[level].worker && (name === 'minimax' || name === 'mcts') ? new WorkerAgent(name, opts) : makeAgent(name, opts);
  }

  async function startGame(cfg) {
    G.cfg = cfg; G.mode = cfg.mode;
    for (const a of G.agents) a?.dispose?.();
    for (const p of G.puppets) p?.destroy();
    const chars = cfg.chars.map(getChar);
    // per-fighter rigs: P1 = character rig, P2 = character rig_p2 (mirror palettes)
    const [r0, r1, p0, p1] = await Promise.all([loadRig(PIXI, chars[0].rig), loadRig(PIXI, chars[1].rigP2), loadPoses(chars[0]), loadPoses(chars[1])]);
    const shin = chars.find((c) => c.id === 'shinobi');
    if (shin) { const k = await loadRig(PIXI, shin.rig); fx.kunaiTex = k.textures.kunai; fx.kunaiPart = k.rig.parts.find((p) => p.id === 'kunai'); }
    G.puppets = [null, null];
    G.puppets[1] = new Puppet(PIXI, r1.rig, r1.textures, fighterLayer, chars[1], p1); // P2 first so P1 is in front
    G.puppets[0] = new Puppet(PIXI, r0.rig, r0.textures, fighterLayer, chars[0], p0);
    G.agents = [null, null];
    if (cfg.mode === 'train') {
      G.match = null; G.sim = new Sim({ chars: cfg.chars, autoReset: true });
    } else {
      const ctrl = [0, 1].map((i) => {
        if (cfg.mode === 'replay') return new ReplayController(cfg.log);
        if (cfg.agents[i]) { G.agents[i] = makeAi(i); return new AgentController(G.agents[i]); }
        return new FnController(() => kb.bits);
      });
      G.match = cfg.mode === 'replay'
        ? new Match({ chars: cfg.log.chars, controllers: ctrl, bestOf: cfg.log.bestOf, roundFrames: cfg.log.roundFrames, koFrames: 150, introFrames: 90, verify: cfg.log })
        : new Match({ chars: cfg.chars, controllers: ctrl, koFrames: 150, introFrames: 90, record: true, meta: { mode: cfg.mode, agents: cfg.agents, levels: cfg.levels } });
      G.sim = G.match.sim;
    }
    overlay.setAgents(G.agents, [labelOf(0), labelOf(1)]);
    overlay.toggle(cfg.think);
    const sub = cfg.mode === 'train' ? `${chars[0].name} · TEST ARENA` : chars[0].id === chars[1].id ? `${chars[0].name} MIRROR` : `${chars[0].name} vs ${chars[1].name}`;
    hud.setup(G.sim, { names: [labelOf(0).replace(/^P1 · /, ''), labelOf(1).replace(/^P2 · /, '')], title: cfg.mode === 'train' ? 'TRAINING' : cfg.mode === 'replay' ? 'REPLAY' : '', subtitle: sub, inputs: cfg.mode !== 'ava' && cfg.mode !== 'replay' });
    $('dummyRow').classList.toggle('hide', cfg.mode !== 'train'); $('meterRow').classList.toggle('hide', cfg.mode !== 'train');
    $('hotTraining').classList.toggle('hide', cfg.mode !== 'train'); $('hotMatch').classList.toggle('hide', cfg.mode === 'train');
    $('panelTitle').textContent = { train: 'TRAINING', hva: 'HUMAN vs AI', ava: 'AI vs AI', replay: 'REPLAY' }[cfg.mode];
    $('helpSamurai').classList.toggle('hide', chars[0].id !== 'samurai'); $('helpShinobi').classList.toggle('hide', chars[0].id === 'samurai');
    $('help').classList.toggle('hide', cfg.mode === 'ava' || cfg.mode === 'replay');
    if (cfg.mode !== 'ava' && cfg.mode !== 'replay') { clearTimeout(G.helpT); G.helpT = setTimeout(() => $('help').classList.add('hide'), 12000); }
    G.phase = G.match ? G.match.phase : 'fight'; G.lastPhase = null; G.round = -1;
    S.paused = false; S.first = true; S.flash = [0, 0]; S.prevT = [0, 0]; camera.cx = 2600;
    sound.newGame(); sound.setPaused(false);
    hud.banner('');
  }

  // ------------------------------------------------------------------ menu + hotkeys
  const menu = new Menu((cfg) => startGame(cfg).catch((e) => { console.error(e); hud.banner('ERROR'); }), sound);
  for (const m of DUMMY_MODES) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; $('dummy').appendChild(o); }
  $('dummy').onchange = (e) => { S.dummy = e.target.value; e.target.blur(); };
  $('step').onchange = (e) => { S.stepEvery = +e.target.value; e.target.blur(); };
  $('speed').onchange = (e) => { S.speed = +e.target.value; sound.setSpeed(S.speed); e.target.blur(); };
  // sound settings (side panel + menu); M toggles mute anywhere
  const syncSound = (st) => {
    for (const k of ['master', 'music', 'sfx']) $('vol_' + k).value = Math.round(st[k] * 100);
    $('mute').checked = st.muted; $('optSound').checked = !st.muted;
  };
  for (const k of ['master', 'music', 'sfx']) $('vol_' + k).oninput = (e) => sound.set(k, +e.target.value / 100);
  $('mute').onchange = (e) => { sound.set('muted', e.target.checked); e.target.blur(); };
  $('optSound').onchange = (e) => sound.set('muted', !e.target.checked);
  sound.onChange = syncSound; syncSound(sound.settings);
  $('meter').onchange = (e) => { S.infMeter = e.target.value === 'inf'; e.target.blur(); };
  $('toggle').onclick = () => { $('panel').classList.toggle('min'); $('toggle').textContent = $('panel').classList.contains('min') ? '[ show ]' : '[ hide ]'; };
  const setDummy = (id) => { S.dummy = id; $('dummy').value = id; };
  kb.onHotkey = (e) => {
    if (e.code === 'Escape') { if (menu.visible) { if (G.cfg) menu.hide(); } else menu.show(); return; }
    if (e.code === 'KeyM') { const m = sound.toggleMute(); if (!menu.visible) hud.banner(m ? 'SOUND OFF' : 'SOUND ON', 700); return; }
    if (menu.visible) return;
    const train = G.mode === 'train';
    switch (e.code) {
      case 'KeyR': if (train) { G.sim.resetPositions(); camera.cx = 2600; S.first = true; } else startGame(G.cfg); break;
      case 'KeyT': if (train) G.sim.resetHealth(); break;
      case 'KeyH': if (train) S.debug = !S.debug; else overlay.toggle(); break;
      case 'KeyG': S.debug = !S.debug; break;
      case 'KeyP': S.paused = !S.paused; sound.setPaused(S.paused); hud.banner(S.paused ? 'PAUSED' : '', S.paused ? 1e9 : 0); break;
      case 'KeyN': S.paused = true; S.stepOnce = true; sound.setPaused(true); break;
      case 'F1': e.preventDefault(); $('help').classList.toggle('hide'); break;
      case 'Tab': if (train) { e.preventDefault(); const i = DUMMY_MODES.findIndex((m) => m.id === S.dummy); setDummy(DUMMY_MODES[(i + 1) % DUMMY_MODES.length].id); } break;
      default: if (train && /^Digit[1-6]$/.test(e.code)) setDummy(DUMMY_MODES[+e.code.slice(5) - 1].id);
    }
  };

  // ------------------------------------------------------------------ match phase banners
  function phaseBanners() {
    const m = G.match; if (!m) return;
    if (m.phase === G.lastPhase && m.round === G.round) return;
    if (m.phase === 'intro') hud.banner(`ROUND ${m.round + 1}`, 1400);
    else if (m.phase === 'fight' && G.lastPhase === 'intro') hud.banner('FIGHT!', 700);
    else if (m.phase === 'fight' && G.lastPhase === null) hud.banner(`ROUND ${m.round + 1}`, 900);
    else if (m.phase === 'ko') hud.banner(m.pending?.reason === 'time' ? 'TIME' : m.pending?.reason === 'double' ? 'DOUBLE K.O.' : 'K.O.', 2000);
    else if (m.phase === 'over') hud.banner(m.winner === null ? 'DRAW' : `P${m.winner + 1} WINS`, 1e9);
    G.lastPhase = m.phase; G.round = m.round;
  }

  // ------------------------------------------------------------------ simulation step (+ effects)
  const dt = 1 / 60;
  function simStep() {
    if (!G.sim) return;
    let sim = G.sim;
    if (G.match) {
      G.phase = G.match.step(); sim = G.sim = G.match.sim;
      phaseBanners();
    } else {
      if (S.infMeter) sim.f[0].meter = 100;
      sim.step([kb.bits, dummyInput(S.dummy, sim, sim.frame)]);
    }
    for (const e of sim.events) {
      if (e.kind === 'hit') { fx.hit(e); const t = e.target; if (t !== undefined) S.flash[t] = 5; if (e.ko && !G.match) hud.banner('K.O.'); }
      else if (e.kind === 'block') { fx.block(e); if (e.chip) fx.popup(String(e.chip), e.x, 1300 - e.h - 90, '#c9c3b8', 30, true); }
      else if (e.kind === 'land') fx.dust(e.x, e.down ? 12 : 5, 0, e.down ? 1.6 : 1);
      else if (e.kind === 'pland') fx.spark(e.x, e.h);
      else if (e.kind === 'super') { S.superFx = e.id; if (!G.match || G.mode !== 'replay') hud.banner('ULTIMATE', 900); }
      else if (e.kind === 'dash') fx.dust(e.x, 7, e.dir, 1.2);
      else if (e.kind === 'jump') fx.dust(e.x, 4, 0, 0.7);
      else if (e.kind === 'crescent') { fx.dust(e.x, 14, -e.dir, 1.8); fx.shake = Math.max(fx.shake, 12); }
      else if (e.kind === 'reset') { camera.cx = 2600; S.first = true; }
    }
    sound.onStep(sim, G.match); // sound reads the same step (read-only)
    sim.f.forEach((f, i) => {
      if (f.state === 'attack') {
        const m = sim.C(f).moves[f.move], at = m.active ? m.active[0] : m.spawnAt;
        if (m.arc && f.t === at && S.prevT[i] !== f.t) fx.arc(G.puppets[i].arcPoints(m.arc, f));
      }
      S.prevT[i] = f.t;
    });
    sim.f.forEach((f) => { if (f.state === 'run' && sim.frame % 5 === 0) fx.dust(f.x - f.facing * 80, 1, f.facing, 0.6); });
    const time = sim.frame / 60;
    const redraw = sim.frame % S.stepEvery === 0;
    sim.f.forEach((f, i) => {
      const shake = sim.hitstop > 0 && (f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'knock') ? (sim.frame % 2 ? 7 : -7) * f.facing * -1 : 0;
      G.puppets[i].tint = S.flash[i] > 0 ? 0xff9090 : 0xffffff;
      if (S.flash[i] > 0 && sim.hitstop === 0) S.flash[i]--;
      G.puppets[i].update(f, time, dt, redraw, shake);
    });
    // ultimate showpieces: the Shinobi fans kunai in both hands; the Samurai's blade glows crimson until the release
    sim.f.forEach((f, i) => {
      if (f.state !== 'attack' || f.move !== 'ult') return;
      const ult = sim.C(f).moves.ult;
      if (f.flash <= 0 && f.t > ult.spawnAt) return;
      const pup = G.puppets[i];
      if (sim.C(f).id === 'shinobi') {
        const hands = ['hand_near_grip', 'hand_far_grip'].map((a) => pup.anchorWorld(a, f)).filter(Boolean);
        if (S.superFx === i) { fx.superFlash(hands); S.superFx = null; }
        const open = f.flash > 0 ? 0.6 + 0.4 * Math.sin(Math.min(1, (ult.freeze - f.flash) / 14) * Math.PI / 2) : 1;
        for (const [x, y] of hands) fx.fan(x, y, f.facing, open, f.flash > 0 ? 0.7 : 0.5 + 0.5 * Math.min(1, f.t / ult.spawnAt));
      } else {
        const pts = ['sword_tip', 'hand_near_grip', 'saya_mouth'].map((a) => pup.anchorWorld(a, f)).filter(Boolean);
        if (S.superFx === i) { fx.superFlash(pts.slice(1, 2)); S.superFx = null; }
        const heat = f.flash > 0 ? 0.6 : 0.4 + 0.6 * Math.min(1, f.t / ult.spawnAt);
        for (const [x, y] of pts.slice(0, 2)) fx.glows.push({ x, y, heat });
      }
    });
    fx.tick(1, sim, S.debug);
  }

  // ------------------------------------------------------------------ frame loop
  let acc = 0;
  app.ticker.add((tk) => {
    if (!G.sim) return;
    const running = !menu.visible;
    acc += Math.min(60, tk.deltaMS) * S.speed;
    let n = 0;
    while (acc >= 1000 / 60 && n < 8) { acc -= 1000 / 60; if (running && !S.paused) simStep(); n++; }
    if (S.stepOnce) { simStep(); S.stepOnce = false; }
    const sim = G.sim;
    const cs = camera.update(sim.f[0], sim.f[1], S.first); S.first = false;
    sound.update(Math.min(0.1, tk.deltaMS / 1000), cs, sim, G.match);
    const sx = (Math.random() - 0.5) * fx.shake * cs.s * 2, sy = (Math.random() - 0.5) * fx.shake * cs.s * 2; // screen shake is cosmetic (not the sim)
    world.scale.set(cs.s); world.position.set(cs.tx + sx, cs.ty + sy);
    stage.update(cs, n || 1);
    dim.clear();
    if (sim.superFreeze > 0) dim.rect(-1000, -2000, 8000, 5000).fill({ color: 0x120a1c, alpha: 0.62 * Math.min(1, sim.superFreeze / 6) });
    shadows.clear();
    for (const f of sim.f) {
      const k = Math.max(0.35, 1 - f.h / 1100), lying = f.state === 'down' || f.state === 'knock';
      shadows.ellipse(f.x, 1306, (lying ? 330 : 190) * k, (lying ? 30 : 24) * k).fill({ color: 0x3a2a1c, alpha: 0.3 * k });
    }
    hud.match(G.match);
    overlay.update(sim, cs, G.match ? G.match.phase : 'fight');
    const last = sim.lastHit;
    let info;
    if (G.mode === 'train') info = `dummy: ${DUMMY_MODES.find((m) => m.id === S.dummy).label}${last ? ` · last hit ${last.dmg}${last.counter ? ' (counter)' : ''}` : ''}`;
    else if (G.mode === 'replay') { const v = G.match.verify; info = `replay check: ${v.ok} / ${v.ok + v.bad} checkpoints identical to the arena run${v.bad ? ` · MISMATCH at frame ${v.firstBad}` : ''}`; }
    else info = `round ${G.match.round + 1} · ${G.match.wins.join(' - ')}${G.match.over ? ' · R rematch · Esc menu' : ''}`;
    $('matchInfo').textContent = G.match ? info : '';
    hud.update(sim, G.mode === 'hva' || G.mode === 'train' ? kb.bits : G.match ? G.match.lastBits[0] : 0, info);
  });

  window.game = { G, S, fx, camera, kb, stage, overlay, sound, stepSim: simStep, startGame };
  $('loading').classList.add('done');
  await menu.init();
})().catch((err) => { console.error(err); document.getElementById('loading').textContent = 'ERROR: ' + err.message; });
