// "Thinking" overlay (prompt 05 §6.2): one card per AI fighter in that fighter's palette colour, plus a small intent
// bubble above the fighter's head for half a second after each decision. It reads ONLY agent.thinking() / agent.intent and
// never touches the simulation. The DOM is rebuilt only when a new decision arrives (a new thinking object), so the cost
// per frame is a couple of style writes.
//
// Every card is built from the same sections (header, pick, ranking, details, one-line ticker); the display mode on #think
// decides which of them show and where the cards sit:
//   full     desktop: cards under the health bars, everything (ranking + search details)
//   compact  small / touch screens without player controls: header, pick and the top 3 only
//   mini     phones with on-screen controls (their corners are taken): a one-line ticker under the timer
//   off      hidden (OPTIONS → AI THINKING, H on the keyboard, the AI chip / button in a match)
// 'auto' (the default) picks one of the first three from the device and the mode.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const NAMES = { wait: 'wait', walk_fwd: 'walk ▸', walk_back: '◂ walk', dash_fwd: 'dash ▸▸', dash_back: '◂◂ dash', guard: 'guard', light: 'iai cut', thrust: 'thrust', parry: 'PARRY', heavy: 'cleave', ult: 'TEMPEST',
  crouch_guard: 'low guard', kick: 'kick', throw: 'kunai', low_light: 'low stab', sweep: 'sweep', jump_in: 'jump in', '…': '…', '·': '·',
  chain: 'iai→thrust→cleave', kawarimi: 'KAWARIMI', repel: 'REPEL', wait_short: 'wait 3f', crouch: 'duck', jump_up: 'jump ↑',
  parry_0: 'parry now', parry_3: 'parry +3f', parry_6: 'parry +6f', parry_thrust_0: 'parry→thrust', parry_thrust_3: 'parry→thrust +3f', parry_thrust_6: 'parry→thrust +6f' };
const ICON = { kawarimi: '❖', chain: '⟋⤓', wait_short: '·', crouch: '▁', jump_up: '⤒', parry_0: '⟂', parry_3: '⟂', parry_6: '⟂', parry_thrust_0: '⟂»', parry_thrust_3: '⟂»', parry_thrust_6: '⟂»', thrust: '»', wait: '·', walk_fwd: '▸', walk_back: '◂', dash_fwd: '»', dash_back: '«', guard: '▮', light: '⟋', heavy: '⤓', ult: '☾', crouch_guard: '▂', kick: 'K', throw: '✦', low_light: '⟍', sweep: '⌇', jump_in: '⤴', '…': '…', '·': '·' };
const BADGE = { minimax: 'MINIMAX', mcts: 'MCTS', fuzzy: 'FUZZY', scripted: 'SCRIPTED', random: 'RANDOM' };
export const THINK_MODES = ['auto', 'full', 'compact', 'off'];
export const THINK_LABEL = { auto: 'AUTO', full: 'FULL', compact: 'COMPACT', mini: 'MINI', off: 'OFF' };
const nm = (id) => NAMES[id] || id;
const k = (n) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function bars(rows, { value, label, fmt, chosen, bound }) {
  const vals = rows.map(value), lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  return rows.map((r) => {
    const w = 8 + 92 * ((value(r) - lo) / span);
    return `<div class="tb${label(r) === chosen ? ' on' : ''}"><span class="tl">${esc(nm(label(r)))}</span><span class="tbar"><i style="width:${w.toFixed(1)}%"></i></span><span class="tv">${bound && bound(r) ? '≤' : ''}${fmt(r)}</span></div>`;
  }).join('');
}
function memb(label, sets) {
  return `<div class="mrow"><span class="ml">${label}</span>${sets.map(([key, v]) => `<span class="mset"><b>${key}</b><span class="mbar"><i style="width:${(100 * v).toFixed(0)}%"></i></span></span>`).join('')}</div>`;
}
const meter = (label, v) => `<div class="tb"><span class="tl">${label}</span><span class="tbar"><i style="width:${(100 * v).toFixed(0)}%"></i></span><span class="tv">${v.toFixed(2)}</span></div>`;

export class Overlay {
  constructor() {
    this.root = $('think'); this.panels = [$('think0'), $('think1')]; this.bubbles = [$('intent0'), $('intent1')];
    this.last = [null, null]; this.visible = true; this.agents = [null, null]; this.labels = ['', ''];
    this.pref = 'auto'; this.controls = false; this.onChange = null;
    addEventListener('resize', () => this.layout());
  }
  /** controls: the human has on-screen touch controls this game (their corners are taken) */
  setAgents(agents, labels, { controls = false } = {}) {
    this.agents = agents; this.labels = labels; this.last = [null, null]; this.controls = controls;
    agents.forEach((a, i) => {
      this.panels[i].classList.toggle('off', !a); this.bubbles[i].classList.remove('on');
      this.panels[i].innerHTML = a ? `<div class="thd"><span class="badge">AI</span><span class="who">${esc(labels[i])}</span></div><div class="pick"><b>thinking…</b></div>` : '';
    });
    this.layout();
  }
  get hasAI() { return this.agents.some(Boolean); }
  /** OPTIONS preference: auto / full / compact / off */
  setMode(pref) { this.pref = THINK_MODES.includes(pref) ? pref : 'auto'; this.visible = this.pref !== 'off'; this.layout(); }
  /** H / the AI chip: hide or show without forgetting the preferred layout */
  toggle(on = !this.visible) {
    this.visible = on;
    if (on && this.pref === 'off') this.pref = 'auto';
    this.layout(); this.onChange?.(this.visible);
  }
  /** the effective display mode for this device and game */
  get mode() {
    if (!this.visible || this.pref === 'off') return 'off';
    if (this.pref !== 'auto') return this.pref;
    const touch = document.body.classList.contains('touchDevice'), s = Math.min(innerWidth / 1920, innerHeight / 1080);
    if (touch) return this.controls ? 'mini' : 'compact';
    return s < 0.6 ? 'compact' : 'full'; // (under ~1150 px wide the full card's text gets too small)
  }
  layout() {
    const m = this.mode;
    this.root.className = `m-${m}${m === 'off' ? ' hide' : ''}`;
  }

  /** cs = camera transform from Camera.update (world -> 1920x1080 HUD space) */
  update(sim, cs, phase) {
    const on = this.mode !== 'off';
    for (let i = 0; i < 2; i++) {
      const a = this.agents[i];
      const bub = this.bubbles[i];
      if (!a) { bub.classList.remove('on'); continue; }
      const t = a.thinking();
      if (on && t && t !== this.last[i]) { this.last[i] = t; this.render(i, t); }
      // intent label above the head for 0.5 s after each decision
      const it = a.intent, f = sim.f[i];
      const show = on && phase === 'fight' && it && sim.frame - it.frame < 30 && it.frame <= sim.frame;
      bub.classList.toggle('on', !!show);
      if (show) {
        if (bub.textContent !== it.text) bub.textContent = it.text;
        const head = sim.C(f).id === 'samurai' ? 1260 : 1180;
        bub.style.transform = `translate(${(cs.tx + f.x * cs.s).toFixed(1)}px, ${(cs.ty + (1300 - head - f.h) * cs.s).toFixed(1)}px) translate(-50%, -100%)`;
      }
    }
  }

  render(i, t) {
    const el = this.panels[i], badge = BADGE[t.algo] || 'AI', chosen = nm(t.chosen), icon = ICON[t.chosen] || '→';
    let stat = '', conf = '', rank = '', more = '';
    if (t.algo === 'minimax') {
      const best = t.rows.find((r) => r.id === t.chosen);
      stat = `depth ${t.depth} · ${k(t.nodes)} nodes`; conf = best ? `value ${best.v.toFixed(0)}` : '';
      rank = bars(t.rows.slice(0, 6), { value: (r) => r.v, label: (r) => r.id, fmt: (r) => r.v.toFixed(0), chosen: t.chosen, bound: (r) => r.bound });
      more = `<div class="tcap">${t.cutoffs} α-β cutoffs${t.ms !== undefined ? ` · ${t.ms.toFixed(1)} ms` : ''} · worst-case value per macro (≤ = pruned bound)</div>`;
      more += `<div class="pv"><span class="tcap">principal variation (me / reply)</span>${t.pv.map(([m, o]) => `<span class="pvs"><b title="${esc(nm(m))}">${ICON[m] || m}</b><i title="${esc(nm(o))}">${ICON[o] || o}</i></span>`).join('<span class="arr">›</span>')}</div>`;
    } else if (t.algo === 'mcts') {
      stat = `${k(t.rollouts)} rollouts`; conf = `win ${(100 * t.winProb).toFixed(0)}%`;
      rank = bars(t.rows.slice(0, 6), { value: (r) => r.visits, label: (r) => r.id, fmt: (r) => `${k(r.visits)} · ${(100 * r.mean).toFixed(0)}%`, chosen: t.chosen });
      more = `<div class="tcap">root visits (bar) and mean result per macro (DUCT)${t.ms !== undefined ? ` · ${t.ms.toFixed(1)} ms` : ''}</div>`;
      if (t.opRows?.length) more += `<div class="tcap">opponent model: ${t.opRows.map((r) => `${esc(nm(r.id))} ${k(r.visits)}`).join(' · ')}</div>`;
    } else if (t.algo === 'fuzzy') {
      const m = t.mu;
      stat = 'Mamdani inference'; conf = `aggr ${t.aggression.toFixed(2)}`;
      rank = meter('aggression', t.aggression) + meter('defence', t.defence);
      more = memb('distance', [['close', m['d.close']], ['mid', m['d.mid']], ['far', m['d.far']]]) + memb('my HP', [['low', m['me.low']], ['mid', m['me.mid']], ['high', m['me.high']]])
        + memb('their HP', [['low', m['op.low']], ['mid', m['op.mid']], ['high', m['op.high']]]) + memb('meter', [['empty', m['m.empty']], ['part', m['m.partial']], ['full', m['m.full']]])
        + memb('they are', [['attack', m['o.attacking']], ['recover', m['o.recovering']], ['neutral', m['o.neutral']]]);
      if (t.reflex) more += `<div class="rule"><b>reflex</b> ${esc(t.reflex)}</div>`;
      more += `<div class="tcap">strongest rules</div>${t.top.map((r) => `<div class="rule"><b>${r.w.toFixed(2)}</b> ${esc(r.label)}</div>`).join('')}`;
    } else {
      more = `<div class="rule">${esc(t.rule || 'uniform over legal macros: ' + (t.legal || []).map(nm).join(', '))}</div>`;
    }
    if (t.worker) more += `<div class="tcap">searched in a Web Worker${t.waited ? `, reply after ${t.waited} frame(s)` : ''}</div>`;
    const mist = t.mistake ? `<span class="mist">slip → ${esc(nm(t.mistake))}</span>` : '';
    el.innerHTML = `<div class="thd"><span class="badge">${badge}</span><span class="who">${esc(this.labels[i])}</span><span class="stat">${esc(stat)}</span></div>`
      + `<div class="pick"><i>${esc(icon)}</i><b>${esc(chosen)}</b>${conf ? `<span class="conf">${esc(conf)}</span>` : ''}${mist}</div>`
      + (rank ? `<div class="rank">${rank}</div>` : '') + `<div class="more">${more}</div>`
      + `<div class="mini"><span class="badge">${badge}</span><i>${esc(icon)}</i><b>${esc(chosen)}</b>${conf ? `<span>${esc(conf)}</span>` : ''}</div>`;
  }
}
