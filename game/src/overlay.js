// "Thinking" overlay (prompt 05 §6.2): one panel per AI fighter in that fighter's palette colour, plus a small intent
// label above the fighter's head for half a second after each decision. It reads ONLY agent.thinking() / agent.intent and
// never touches the simulation. The DOM is rebuilt only when a new decision arrives (a new thinking object), so the cost
// per frame is a couple of style writes.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const NAMES = { wait: 'wait', walk_fwd: 'walk ▸', walk_back: '◂ walk', dash_fwd: 'dash ▸▸', dash_back: '◂◂ dash', guard: 'guard', light: 'iai cut', thrust: 'thrust', parry: 'PARRY', heavy: 'cleave', ult: 'TEMPEST',
  crouch_guard: 'low guard', kick: 'kick', throw: 'kunai', low_light: 'low stab', sweep: 'sweep', jump_in: 'jump in', '…': '…', '·': '·',
  chain: 'iai→thrust→cleave', kawarimi: 'KAWARIMI', repel: 'REPEL', wait_short: 'wait 3f', crouch: 'duck', jump_up: 'jump ↑',
  parry_0: 'parry now', parry_3: 'parry +3f', parry_6: 'parry +6f', parry_thrust_0: 'parry→thrust', parry_thrust_3: 'parry→thrust +3f', parry_thrust_6: 'parry→thrust +6f' };
const ICON = { kawarimi: '❖', chain: '⟋⤓', wait_short: '·', crouch: '▁', jump_up: '⤒', parry_0: '⟂', parry_3: '⟂', parry_6: '⟂', parry_thrust_0: '⟂»', parry_thrust_3: '⟂»', parry_thrust_6: '⟂»', thrust: '»', wait: '·', walk_fwd: '▸', walk_back: '◂', dash_fwd: '»', dash_back: '«', guard: '▮', light: '⟋', heavy: '⤓', ult: '☾', crouch_guard: '▂', kick: 'K', throw: '✦', low_light: '⟍', sweep: '⌇', jump_in: '⤴', '…': '…', '·': '·' };
const nm = (id) => NAMES[id] || id;

function bars(rows, { value, label, fmt, chosen, bound }) {
  const vals = rows.map(value), lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  return rows.map((r) => {
    const w = 8 + 92 * ((value(r) - lo) / span);
    return `<div class="tb${label(r) === chosen ? ' on' : ''}"><span class="tl">${esc(nm(label(r)))}</span><span class="tbar"><i style="width:${w.toFixed(1)}%"></i></span><span class="tv">${bound && bound(r) ? '≤' : ''}${fmt(r)}</span></div>`;
  }).join('');
}
function memb(label, sets) {
  return `<div class="mrow"><span class="ml">${label}</span>${sets.map(([k, v]) => `<span class="mset"><b>${k}</b><span class="mbar"><i style="width:${(100 * v).toFixed(0)}%"></i></span></span>`).join('')}</div>`;
}

export class Overlay {
  constructor() {
    this.root = $('think'); this.panels = [$('think0'), $('think1')]; this.bubbles = [$('intent0'), $('intent1')];
    this.last = [null, null]; this.visible = true; this.agents = [null, null]; this.labels = ['', ''];
  }
  setAgents(agents, labels) {
    this.agents = agents; this.labels = labels; this.last = [null, null];
    agents.forEach((a, i) => { this.panels[i].classList.toggle('off', !a); this.panels[i].innerHTML = a ? `<h4>${esc(labels[i])}</h4><div class="tbody">waiting for the first decision…</div>` : ''; this.bubbles[i].classList.remove('on'); });
  }
  toggle(on = !this.visible) { this.visible = on; this.root.classList.toggle('hide', !on); }

  /** cs = camera transform from Camera.update (world -> 1920x1080 HUD space) */
  update(sim, cs, phase) {
    for (let i = 0; i < 2; i++) {
      const a = this.agents[i];
      const bub = this.bubbles[i];
      if (!a) { bub.classList.remove('on'); continue; }
      const t = a.thinking();
      if (this.visible && t && t !== this.last[i]) { this.last[i] = t; this.render(i, t); }
      // intent label above the head for 0.5 s after each decision
      const it = a.intent, f = sim.f[i];
      const show = this.visible && phase === 'fight' && it && sim.frame - it.frame < 30 && it.frame <= sim.frame;
      bub.classList.toggle('on', !!show);
      if (show) {
        if (bub.textContent !== it.text) bub.textContent = it.text;
        const head = sim.C(f).id === 'samurai' ? 1260 : 1180;
        bub.style.transform = `translate(${(cs.tx + f.x * cs.s).toFixed(1)}px, ${(cs.ty + (1300 - head - f.h) * cs.s).toFixed(1)}px) translate(-50%, -100%)`;
      }
    }
  }

  render(i, t) {
    const el = this.panels[i];
    let body = '';
    if (t.algo === 'minimax') {
      body = `<div class="ts">depth <b>${t.depth}</b> · ${t.nodes} nodes · ${t.cutoffs} α-β cutoffs${t.ms !== undefined ? ` · ${t.ms.toFixed(1)} ms` : ''}</div>`;
      body += `<div class="tcap">worst-case value of each macro (maximin; ≤ = pruned bound)</div>`;
      body += bars(t.rows.slice(0, 7), { value: (r) => r.v, label: (r) => r.id, fmt: (r) => r.v.toFixed(0), chosen: t.chosen, bound: (r) => r.bound });
      body += `<div class="pv"><span class="tcap">principal variation (me / reply)</span>${t.pv.map(([m, o]) => `<span class="pvs"><b title="${esc(nm(m))}">${ICON[m] || m}</b><i title="${esc(nm(o))}">${ICON[o] || o}</i></span>`).join('<span class="arr">›</span>')}</div>`;
    } else if (t.algo === 'mcts') {
      body = `<div class="ts"><b>${t.rollouts}</b> rollouts · win estimate <b>${(100 * t.winProb).toFixed(0)}%</b>${t.ms !== undefined ? ` · ${t.ms.toFixed(1)} ms` : ''}</div>`;
      body += `<div class="tcap">root visits (bar) and mean result per macro (DUCT, my statistics)</div>`;
      body += bars(t.rows.slice(0, 7), { value: (r) => r.visits, label: (r) => r.id, fmt: (r) => `${r.visits} · ${(100 * r.mean).toFixed(0)}%`, chosen: t.chosen });
      if (t.opRows?.length) body += `<div class="tcap">opponent model (their visits): ${t.opRows.map((r) => `${esc(nm(r.id))} ${r.visits}`).join(' · ')}</div>`;
    } else if (t.algo === 'fuzzy') {
      const m = t.mu;
      body = `<div class="ts">aggression <span class="agg"><i style="width:${(100 * t.aggression).toFixed(0)}%"></i></span> <b>${t.aggression.toFixed(2)}</b> · defence <b>${t.defence.toFixed(2)}</b></div>`;
      body += memb('distance', [['close', m['d.close']], ['mid', m['d.mid']], ['far', m['d.far']]]);
      body += memb('my HP', [['low', m['me.low']], ['mid', m['me.mid']], ['high', m['me.high']]]);
      body += memb('their HP', [['low', m['op.low']], ['mid', m['op.mid']], ['high', m['op.high']]]);
      body += memb('meter', [['empty', m['m.empty']], ['part', m['m.partial']], ['full', m['m.full']]]);
      body += memb('they are', [['attack', m['o.attacking']], ['recover', m['o.recovering']], ['neutral', m['o.neutral']]]);
      if (t.reflex) body += `<div class="rule"><b>reflex</b> ${esc(t.reflex)}</div>`;
      body += `<div class="tcap">strongest rules</div>${t.top.map((r) => `<div class="rule"><b>${r.w.toFixed(2)}</b> ${esc(r.label)}</div>`).join('')}`;
      body += `<div class="ts">→ <b>${esc(nm(t.chosen))}</b></div>`;
    } else {
      body = `<div class="ts">→ <b>${esc(nm(t.chosen))}</b></div><div class="rule">${esc(t.rule || 'uniform over legal macros: ' + (t.legal || []).map(nm).join(', '))}</div>`;
    }
    if (t.mistake) body += `<div class="mist">mistake! (difficulty) → ${esc(nm(t.mistake))}</div>`;
    if (t.worker) body += `<div class="tcap">searched in a Web Worker${t.waited ? `, reply after ${t.waited} frame(s)` : ''}</div>`;
    el.innerHTML = `<h4>${esc(this.labels[i])}</h4><div class="tbody">${body}</div>`;
  }
}
