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
import { TouchControls, getHpMult, touchStrip } from './touch.js';
import { dummyInput, DUMMY_MODES } from './dummy.js';
import { Puppet, Camera, loadRig, loadPoses, VIEW_W, VIEW_H, VIEW, fitView } from './render.js';
import { Stage, STAGES } from './stage.js';
import { Atmosphere, rollConditions, mulC } from './atmosphere.js';
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
import { UltFx } from './ultfx.js';
import { Showcase } from './showcase.js';
import { paletteRig } from './roster.js';

const PIXI = window.PIXI;
const $ = (id) => document.getElementById(id);
const rnd32 = () => crypto.getRandomValues(new Uint32Array(1))[0];

(async () => {
  const app = new PIXI.Application();
  const phone = matchMedia('(pointer: coarse)').matches; // phones: cap the pixel ratio (3x screens cost a lot of fill rate)
  await app.init({ resizeTo: window, background: 0x14121c, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, phone ? 2 : 3), autoDensity: true });
  $('app').appendChild(app.canvas);

  const root = new PIXI.Container();
  app.stage.addChild(root);
  const mask = new PIXI.Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(0xffffff);
  root.addChild(mask); root.mask = mask;
  const world = new PIXI.Container();
  root.addChild(world);
  const back = new PIXI.Container(), dim = new PIXI.Graphics(), shadows = new PIXI.Graphics(), fighterLayer = new PIXI.Container(), fxLayer = new PIXI.Container(), front = new PIXI.Container();
  const kanjiLayer = new PIXI.Container(), bars = new PIXI.Graphics(); // ultimate kanji (behind the fighters); cinema bars + white flash (screen space)
  world.addChild(back, dim, kanjiLayer, shadows, fighterLayer, fxLayer, front);
  const weatherLayer = new PIXI.Container(); // screen-space rain / snow / vignette / lightning flash (atmosphere.js)
  root.addChild(weatherLayer, bars);
  const menuLayer = new PIXI.Container(); root.addChild(menuLayer); // front end: portraits, models, hero art (showcase.js)
  // the 1920x1080 frame is centred; on screens that are not 16:9 the world fills the rest (sides on phones, above and
  // below on tablets) instead of black bars
  const layout = () => {
    const [l, r] = touchStrip(); const f = fitView(Math.max(0, innerWidth - l - r), innerHeight);
    root.scale.set(f.s); root.position.set(l + f.x, f.y);
    mask.clear().rect(-VIEW.ex, -VIEW.ey, VIEW_W + 2 * VIEW.ex, VIEW_H + 2 * VIEW.ey).fill(0xffffff);
    $('hudbox').style.setProperty('--ex', `${VIEW.ex}px`); $('hudbox').style.setProperty('--ey', `${VIEW.ey}px`);
  };
  layout(); addEventListener('resize', layout);

  const stage = new Stage(PIXI, back, front);
  await stage.load('temple');
  const fx = new Fx(PIXI, fxLayer, null, null);
  const ultfx = new UltFx(PIXI, { app, root, world, dim, kanjiLayer, fighterLayer, fxLayer }, fx); // ultimates: clones, cinematics
  const kb = new Keyboard();
  const touch = new TouchControls(); // mobile overlay: feeds the same BTN bits; hidden on non-touch devices (always truthy in operations below)
  const hud = new Hud();
  const overlay = new Overlay();
  const camera = new Camera();
  const sound = new Sound();
  const showcase = new Showcase(PIXI, menuLayer);
  const atmo = new Atmosphere(PIXI, stage, weatherLayer, sound, VIEW); // time of day + weather (cosmetic, per round)

  // ------------------------------------------------------------------ game state
  const G = { cfg: null, mode: null, sim: null, match: null, puppets: [null, null], agents: [null, null], phase: 'fight', lastPhase: null, round: -1, data: null };
  const S = { dummy: 'stand', paused: false, stepOnce: false, speed: 1, debug: false, stepEvery: 1, infMeter: false, superFx: null, flash: [0, 0], first: true, prevT: [0, 0], kanji: null };

  // ------------------------------------------------------------------ ultimate cinematic (render only; the sim runs sim.cine)
  // ink-wash amount 0..1 over the Samurai's cinematic (the poses, cuts and finale are drawn by ultfx.js)
  const cineSpec = (sim) => sim.C(sim.f[sim.cine.by]).moves.ult.cine;
  function inkAmount(sim) {
    const c = sim.cine; if (!c || cineSpec(sim).hits) return 0; // (the Shinobi's cinematic is moonlit, not ink)
    const t = c.t, L = cineSpec(sim).len;
    return t < 8 ? 0 : t < 18 ? (t - 8) / 10 : t < L - 12 ? 1 : Math.max(0, (L - 2 - t) / 10); // (paper holds under the finishing stroke)
  }
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
    G.sim = null; G.match = null; // the frame loop idles (it checks G.sim) while the old game is torn down and the new stage loads
    for (const a of G.agents) a?.dispose?.();
    for (const p of G.puppets) p?.destroy();
    const chars = cfg.chars.map((c) => ({ ...getChar(c) })); // shallow clones: per-game overrides stay per-game
    const hpMult = getHpMult(); // OPTIONS → HP SETTER, on PC and phone alike
    for (const c of chars) c.phys = { ...c.phys, hp: Math.round(c.phys.hp * hpMult) };
    touch.setCharacter(chars[0]); // the touch overlay adapts (REPEL / KAWARIMI label, kunai button, …)
    touch.setVisible(cfg.mode === 'hva' || cfg.mode === 'train');
    // stage: chosen in the menu, or 'auto' = P1's home stage (Samurai: cherry temple, Shinobi: bamboo mountain)
    const stageName = cfg.stage && cfg.stage !== 'auto' ? cfg.stage : (Object.entries(STAGES).find(([, s]) => s.home === chars[0].id)?.[0] || 'temple');
    await stage.load(stageName);
    // time of day / weather for every round (rolled by the menu for the VS screen's forecast, or here)
    G.conds = cfg.conds || rollConditions(cfg.weather || 'dynamic');
    atmo.set(G.conds[0], 0);
    // colour schemes: chosen on the character select (default P1 = palette 0, P2 = palette 1, the old mirror palettes)
    const pal = cfg.palettes || [0, 1];
    const [r0, r1, p0, p1] = await Promise.all([loadRig(PIXI, paletteRig(chars[0].id, pal[0])), loadRig(PIXI, paletteRig(chars[1].id, pal[1])), loadPoses(chars[0]), loadPoses(chars[1])]);
    const shin = chars.find((c) => c.id === 'shinobi');
    if (shin) { const k = await loadRig(PIXI, shin.rig); fx.kunaiTex = k.textures.kunai; fx.kunaiPart = k.rig.parts.find((p) => p.id === 'kunai'); }
    G.puppets = [null, null];
    G.puppets[1] = new Puppet(PIXI, r1.rig, r1.textures, fighterLayer, chars[1], p1); // P2 first so P1 is in front
    G.puppets[0] = new Puppet(PIXI, r0.rig, r0.textures, fighterLayer, chars[0], p0);
    ultfx.setup(chars, [r0, r1], [p0, p1]); // clone / afterimage puppets (behind the fighters)
    G.agents = [null, null];
    if (cfg.mode === 'train') {
      G.match = null; G.sim = new Sim({ chars, autoReset: true }); // chars = the per-game clones (HP setter applied)
    } else {
      const ctrl = [0, 1].map((i) => {
        if (cfg.mode === 'replay') return new ReplayController(cfg.log);
        if (cfg.agents[i]) { G.agents[i] = makeAi(i); return new AgentController(G.agents[i]); }
        return new FnController(() => kb.bits | touch.bits); // touch and keyboard feed the same controller
      });
      G.match = cfg.mode === 'replay'
        ? new Match({ chars: cfg.log.chars, controllers: ctrl, bestOf: cfg.log.bestOf, roundFrames: cfg.log.roundFrames, koFrames: 150, introFrames: 90, verify: cfg.log })
        : new Match({ chars, controllers: ctrl, bestOf: cfg.bestOf || 3, roundFrames: (cfg.roundSecs || 99) * 60, koFrames: 150, introFrames: 90, record: true, meta: { mode: cfg.mode, agents: cfg.agents, levels: cfg.levels } });
      G.sim = G.match.sim;
    }
    // AI cards: the badge names the algorithm, so the label is just side + difficulty
    const cardLabel = (i) => (cfg.mode === 'replay' ? `P${i + 1}` : `P${i + 1} · ${LEVELS[cfg.levels[i]]?.label.toUpperCase() || ''}`);
    overlay.setAgents(G.agents, [cardLabel(0), cardLabel(1)], { controls: cfg.mode === 'hva' || cfg.mode === 'train' });
    overlay.setMode(cfg.think === false ? 'off' : cfg.think === true ? 'auto' : cfg.think);
    touch.setGameActive(true, overlay.hasAI, overlay.visible); syncThinkBtn();
    const sub = cfg.mode === 'train' ? `${chars[0].name} · TEST ARENA` : chars[0].id === chars[1].id ? `${chars[0].name} MIRROR` : `${chars[0].name} vs ${chars[1].name}`;
    hud.setup(G.sim, { names: [labelOf(0).replace(/^P1 · /, ''), labelOf(1).replace(/^P2 · /, '')], title: cfg.mode === 'train' ? 'TRAINING' : cfg.mode === 'replay' ? 'REPLAY' : '', subtitle: sub, inputs: cfg.mode !== 'ava' && cfg.mode !== 'replay' });
    $('dummyRow').classList.toggle('hide', cfg.mode !== 'train'); $('meterRow').classList.toggle('hide', cfg.mode !== 'train');
    $('hotTraining').classList.toggle('hide', cfg.mode !== 'train'); $('hotMatch').classList.toggle('hide', cfg.mode === 'train');
    $('panelTitle').textContent = { train: 'TRAINING', hva: 'HUMAN vs AI', ava: 'AI vs AI', replay: 'REPLAY' }[cfg.mode];
    $('helpSamurai').classList.toggle('hide', chars[0].id !== 'samurai'); $('helpShinobi').classList.toggle('hide', chars[0].id === 'samurai');
    $('help').classList.toggle('hide', cfg.mode === 'ava' || cfg.mode === 'replay');
    if (cfg.mode !== 'ava' && cfg.mode !== 'replay') { clearTimeout(G.helpT); G.helpT = setTimeout(() => $('help').classList.add('hide'), 12000); }
    G.phase = G.match ? G.match.phase : 'fight'; G.lastPhase = null; G.round = -1;
    S.paused = false; S.rotPaused = false; S.first = true; S.flash = [0, 0]; S.prevT = [0, 0]; camera.cx = 2600;
    sound.newGame(); sound.setPaused(false);
    hud.banner(''); G.game = (G.game || 0) + 1;
    for (const l of [fighterLayer, fxLayer, kanjiLayer, shadows]) l.visible = true;
    touch.syncOrientation(); // started in portrait? hold the fight behind the rotate gate
  }
  /** back to the front end: drop the running game (agents, puppets, sim) so the menus show a clean stage */
  function endGame() {
    touch.setVisible(false); touch.setGameActive(false); // back to the menus: hide the clusters and the chip row
    $('thinkBtn').classList.add('hide');
    for (const a of G.agents) a?.dispose?.();
    for (const p of G.puppets) p?.destroy();
    G.agents = [null, null]; G.puppets = [null, null]; G.sim = null; G.match = null; G.cfg = null; G.game = (G.game || 0) + 1;
    ultfx.reset(); S.kanji?.text.destroy(); S.kanji = null; S.paused = false; fx.white = 0; fx.shake = 0;
    for (const l of [fighterLayer, fxLayer, kanjiLayer, shadows]) l.visible = false;
    hud.banner(''); sound.newGame(); sound.setPaused(false);
  }

  // ------------------------------------------------------------------ menu + hotkeys
  const menu = new Menu({
    sound, showcase,
    onStart: (cfg) => startGame(cfg).catch((e) => { console.error(e); hud.banner('ERROR'); }),
    onEnd: endGame,
    onResume: () => { S.paused = false; sound.setPaused(false); },
    onRestart: () => { if (G.mode === 'train') { G.sim.resetPositions(); camera.cx = 2600; S.first = true; } else startGame(G.cfg); },
  });
  // portrait: the rotate gate covers the game, so hold the sim + audio instead of letting the CPU keep swinging
  touch.onRotate = (portrait) => {
    if (menu.visible || !G.sim) return;
    if (portrait) { if (!S.paused) { S.rotPaused = true; S.paused = true; sound.setPaused(true); } }
    else if (S.rotPaused) { S.rotPaused = false; S.paused = false; sound.setPaused(false); }
  };
  // show / hide the AI thinking overlay mid-match: H, the desktop chip under the timer, the AI chip on touch
  const syncThinkBtn = () => {
    const b = $('thinkBtn'); b.classList.toggle('hide', !overlay.hasAI);
    b.textContent = `AI THINKING · ${overlay.visible && overlay.mode !== 'off' ? 'ON' : 'OFF'} (H)`;
  };
  $('thinkBtn').onclick = () => overlay.toggle();
  overlay.onChange = (on) => { touch.setAI(on); syncThinkBtn(); };
  touch.onToggleAI = () => overlay.toggle();
  for (const m of DUMMY_MODES) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; $('dummy').appendChild(o); }
  $('dummy').onchange = (e) => { S.dummy = e.target.value; e.target.blur(); };
  $('step').onchange = (e) => { S.stepEvery = +e.target.value; e.target.blur(); };
  $('speed').onchange = (e) => { S.speed = +e.target.value; sound.setSpeed(S.speed); e.target.blur(); };
  // sound settings (side panel + menu); M toggles mute anywhere
  const syncSound = (st) => {
    for (const k of ['master', 'music', 'sfx']) $('vol_' + k).value = Math.round(st[k] * 100);
    $('mute').checked = st.muted;
  };
  for (const k of ['master', 'music', 'sfx']) $('vol_' + k).oninput = (e) => sound.set(k, +e.target.value / 100);
  $('mute').onchange = (e) => { sound.set('muted', e.target.checked); e.target.blur(); };
  sound.onChange = syncSound; syncSound(sound.settings);
  $('meter').onchange = (e) => { S.infMeter = e.target.value === 'inf'; e.target.blur(); };
  $('toggle').onclick = () => { $('panel').classList.toggle('min'); $('toggle').textContent = $('panel').classList.contains('min') ? '[ show ]' : '[ hide ]'; };
  const setDummy = (id) => { S.dummy = id; $('dummy').value = id; };
  touch.onPause = () => kb.onHotkey?.({ code: 'Escape', repeat: false, preventDefault() {}, stopPropagation() {} }); // the ☰ touch chip reuses the Esc path
  kb.onHotkey = (e) => {
    if (e.code === 'Escape') { if (!menu.visible && G.sim) { sound.setPaused(true); menu.pause(); } return; } // (the menu handles its own keys)
    if (e.code === 'KeyM') { const m = sound.toggleMute(); if (!menu.visible) hud.banner(m ? 'SOUND OFF' : 'SOUND ON', 700); return; }
    if (menu.visible) return;
    const train = G.mode === 'train';
    switch (e.code) {
      case 'KeyR': if (train) { G.sim.resetPositions(); camera.cx = 2600; S.first = true; } else if (G.cfg) startGame(G.cfg); break;
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
    if (m.phase === 'intro') {
      const c = G.conds[m.round % G.conds.length];
      if (m.round > 0) atmo.set(c, 150); // the sky turns while the next round is announced
      hud.banner(`ROUND ${m.round + 1}`, 1400, `${atmo.condition.icon} ${atmo.condition.label}`);
    }
    else if (m.phase === 'fight' && G.lastPhase === 'intro') hud.banner('FIGHT!', 700);
    else if (m.phase === 'fight' && G.lastPhase === null) hud.banner(`ROUND ${m.round + 1}`, 900);
    else if (m.phase === 'ko') hud.banner(m.pending?.reason === 'time' ? 'TIME' : m.pending?.reason === 'double' ? 'DOUBLE K.O.' : 'K.O.', 2000);
    else if (m.phase === 'over') {
      hud.banner(m.winner === null ? 'DRAW' : `P${m.winner + 1} WINS`, 3200);
      const game = G.game; setTimeout(() => { if (G.game === game && !menu.visible) menu.result(G.match); }, 3400); // then the post-match menu
    }
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
      sim.step([(kb.bits | touch.bits), dummyInput(S.dummy, sim, sim.frame)]); // training: the merged P1 stream (keyboard + touch)
    }
    for (const e of sim.events) {
      if (e.kind === 'hit' && e.cine && sim.cine && sim.cine.t > 0) { // cinematic cuts: drawn by ultfx.js
        S.flash[e.target] = 3; if (e.ko && !G.match) hud.banner('K.O.');
      }
      else if (e.kind === 'hit') { fx.hit(e); const t = e.target; if (t !== undefined) S.flash[t] = 5; if (e.ko && !G.match) hud.banner('K.O.'); }
      else if (e.kind === 'cine') { fx.white = 0.9; fx.shake = 26; }
      else if (e.kind === 'clash') fx.clash(e);
      else if (e.kind === 'kawarimi') fx.kawarimi(e); // (also the escape version)
      else if (e.kind === 'repel') fx.repel(e);
      else if (e.kind === 'guardbreak') fx.guardBreak(e);
      else if (e.kind === 'seal') fx.smoke(e.x, 4, 0.5);
      else if (e.kind === 'wave') fx.waveBurst(e);
      else if (e.kind === 'parry') { fx.parry(e); fx.popup('PARRY', e.x, 1300 - e.h - 200, '#9fe3ff', 52); }
      else if (e.kind === 'block') { fx.block(e); if (e.chip) fx.popup(String(e.chip), e.x, 1300 - e.h - 90, '#c9c3b8', 30, true); }
      else if (e.kind === 'land') fx.dust(e.x, e.down ? 12 : 5, 0, e.down ? 1.6 : 1);
      else if (e.kind === 'pland') fx.spark(e.x, e.h);
      else if (e.kind === 'super') { S.superFx = e.id; if (!G.match || G.mode !== 'replay') hud.banner('ULTIMATE', 900); }
      else if (e.kind === 'dash') fx.dust(e.x, 7, e.dir, 1.2);
      else if (e.kind === 'jump') fx.dust(e.x, 4, 0, 0.7);
      else if (e.kind === 'crescent') { fx.dust(e.x, 14, -e.dir, 1.8); fx.shake = Math.max(fx.shake, 12); }
      else if (e.kind === 'reset') { camera.cx = 2600; S.first = true; ultfx.reset(); }
    }
    sound.onStep(sim, G.match); // sound reads the same step (read-only)
    sim.f.forEach((f, i) => {
      if (f.state === 'attack') {
        const m = sim.C(f).moves[f.move], at = m.active ? m.active[0] : m.spawnAt;
        if (m.arc && f.t === at && S.prevT[i] !== f.t) fx.arc(G.puppets[i].arcPoints(m.arc, f));
        if (m.arcs && S.prevT[i] !== f.t) for (const a of m.arcs) if (f.t === a.at) fx.arc(G.puppets[i].arcPoints(a, f));
      }
      S.prevT[i] = f.t;
    });
    sim.f.forEach((f) => { if (f.state === 'run' && sim.frame % 5 === 0) fx.dust(f.x - f.facing * 80, 1, f.facing, 0.6); });
    const time = sim.frame / 60;
    const redraw = sim.frame % S.stepEvery === 0;
    const ink = inkAmount(sim);
    sim.f.forEach((f, i) => {
      const shake = sim.hitstop > 0 && (f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'knock') ? (sim.frame % 2 ? 7 : -7) * f.facing * -1 : 0;
      G.puppets[i].tint = ink > 0.5 ? (S.flash[i] > 0 ? 0x5a0a16 : 0x17131c) : mulC(S.flash[i] > 0 ? 0xff9090 : 0xffffff, atmo.fighterTint()); // ink-wash: black silhouettes; else lit by the weather
      if (S.flash[i] > 0 && sim.hitstop === 0) S.flash[i]--;
      const v = ultfx.view(sim, f, i) || { f, visible: true }, pup = G.puppets[i];
      if (v.tint !== undefined) pup.tint = v.tint;
      pup.container.visible = v.visible;
      pup.update(v.f, time, dt, redraw, shake, { opp: sim.f[1 - i], freeze: sim.superFreeze > 0 });
    });
    // the Samurai's ultimate kanji, painted behind him during the super freeze
    if (S.kanji) {
      const k = S.kanji; k.t++;
      k.text.alpha = Math.min(1, k.t / 6) * Math.max(0, Math.min(1, (40 - k.t) / 12)) * 0.85;
      k.text.scale.set(0.92 + 0.08 * Math.min(1, k.t / 10));
      if (k.t > 40) { k.text.destroy(); S.kanji = null; }
    }
    // ultimate showpieces: the Shinobi fans kunai in both hands; the Samurai's blade glows crimson until the release
    sim.f.forEach((f, i) => {
      if (f.state !== 'attack' || f.move !== 'ult') return;
      const ult = sim.C(f).moves.ult;
      if (!ult.clones && f.flash <= 0 && f.t > (ult.spawnAt ?? ult.waves.at(-1).at)) return;
      const pup = G.puppets[i];
      if (ult.clones) { if (S.superFx === i) S.superFx = null; return; } // Kage Bunshin: drawn by ultfx.js
      {
        const pts = ['sword_tip', 'hand_near_grip', 'saya_mouth'].map((a) => pup.anchorWorld(a, f)).filter(Boolean);
        if (S.superFx === i) {
          fx.superFlash(pts.slice(1, 2)); S.superFx = null;
          S.kanji?.text.destroy();
          const text = new PIXI.Text({ text: '斬', style: { fontFamily: '"Yu Mincho", "MS Mincho", "Noto Serif JP", serif', fontWeight: '900', fontSize: 1100, fill: '#b3142a', stroke: { color: '#2a0610', width: 18 } } });
          text.anchor.set(0.5); text.position.set(f.x - f.facing * 120, 1300 - 720); text.alpha = 0; kanjiLayer.addChild(text);
          S.kanji = { text, t: 0 };
        }
        const last = ult.spawnAt ?? ult.waves.at(-1).at;
        if (f.flash <= 0 && f.t > last) return;
        const heat = f.flash > 0 ? 0.6 : 0.4 + 0.6 * Math.min(1, f.t / last);
        for (const [x, y] of pts.slice(0, 2)) fx.glows.push({ x, y, heat });
      }
    });
    ultfx.step(sim, G.puppets); // (before fx.tick: it hands the clone's kunai fans to fx)
    fx.tick(1, sim, S.debug);
  }

  // ------------------------------------------------------------------ frame loop
  let acc = 0;
  let menuT = 0;
  app.ticker.add((tk) => {
    showcase.update(performance.now() / 1000);
    if (!G.sim) { // front end with no game: the stage drifts slowly behind the menus
      const cx = 2600 + 1100 * Math.sin(++menuT / 1500), w = 4300, s = VIEW_W / w;
      const cs = { s, tx: VIEW_W / 2 - cx * s, ty: 940 - 1300 * s, cx, w };
      world.scale.set(s); world.position.set(cs.tx, cs.ty); stage.update(cs, 1);
      const fr = tk.deltaMS / (1000 / 60); atmo.cycle(fr); atmo.update(cs, fr, {});
      dim.clear(); bars.clear(); front.visible = true;
      return;
    }
    const running = !menu.visible;
    acc += Math.min(60, tk.deltaMS) * S.speed;
    let n = 0;
    while (acc >= 1000 / 60 && n < 8) { acc -= 1000 / 60; if (running && !S.paused) simStep(); n++; }
    if (S.stepOnce) { simStep(); S.stepOnce = false; }
    const sim = G.sim;
    const cine = sim.cine, cd = cine && sim.f[1 - cine.by];
    const cs = ultfx.camera(camera) || (cine ? camera.update({ x: cd.x - 820 }, { x: cd.x + 820 }, false) : camera.update(sim.f[0], sim.f[1], S.first)); S.first = false; // ultimates / the cinematic frame themselves
    sound.update(Math.min(0.1, tk.deltaMS / 1000), cs, sim, G.match);
    const sx = (Math.random() - 0.5) * fx.shake * cs.s * 2, sy = (Math.random() - 0.5) * fx.shake * cs.s * 2; // screen shake is cosmetic (not the sim)
    world.scale.set(cs.s); world.position.set(cs.tx + sx, cs.ty + sy);
    stage.update(cs, n || 1);
    atmo.update(cs, tk.deltaMS / (1000 / 60) * S.speed, { ink: inkAmount(sim), paused: S.paused || !running });
    dim.clear();
    if (sim.superFreeze > 0 && !ultfx.ownsDim) dim.rect(-1000, -2000, 8000, 5000).fill({ color: 0x120a1c, alpha: 0.62 * Math.min(1, sim.superFreeze / 6) });
    const ink = inkAmount(sim); // ultimate cinematic: the world drains to sumi-e paper
    if (ink > 0) dim.rect(-1000, -2000, 8000, 5000).fill({ color: 0xf1e8d4, alpha: ink }).rect(-1000, 1296, 8000, 18).fill({ color: 0x1a1418, alpha: 0.5 * ink });
    front.visible = ink < 0.5;
    bars.clear();
    const ownBars = ultfx.screen(world); // ultimates: bars, fades, glints, the screen split
    const bar = cine && !ownBars ? 118 * Math.min(1, cine.t / 10, Math.max(0, (cineSpec(sim).len - cine.t) / 10)) : 0;
    const bx = -VIEW.ex, bw = VIEW_W + 2 * VIEW.ex, by = -VIEW.ey, bh = VIEW_H + 2 * VIEW.ey;
    if (bar > 0) bars.rect(bx, by, bw, bar).fill(0x0b0a0e).rect(bx, by + bh - bar, bw, bar).fill(0x0b0a0e);
    if (fx.white > 0) bars.rect(bx, by, bw, bh).fill({ color: 0xffffff, alpha: fx.white });
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
    touch.tick?.(sim); // the special button glows while the meter covers kawarimi / repel
    hud.update(sim, G.mode === 'hva' || G.mode === 'train' ? kb.bits | touch.bits : G.match ? G.match.lastBits[0] : 0, info);
  });

  window.game = { G, S, fx, camera, kb, touch, stage, atmo, overlay, sound, menu, showcase, stepSim: simStep, startGame, app }; // (app: frame-exact capture tooling)
  $('loading').classList.add('done');
  await menu.init();
})().catch((err) => { console.error(err); document.getElementById('loading').textContent = 'ERROR: ' + err.message; });
