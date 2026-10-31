// DOM HUD: health bars, combo counters, live input display, readout, frame-data table, round timer and round pips.
// Reads the simulator (and the match runner), never writes them. Per character (prompt 05 §4.1): names, max HP, the
// frame-data table and the key hints come from each fighter's character.
import { BTN } from './sim.js';
import { touchStrip } from './touch.js'; // mobile controls reserve horizontal strips outside the game view
import { fitView, VIEW } from './render.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.ghost = [1000, 1000];
    this.keys = [...document.querySelectorAll('.k[data-b]')];
    this.fit();
    addEventListener('resize', () => this.fit());
  }

  /** the HUD is authored at 1920x1080 and scaled/letterboxed exactly like the canvas */
  fit() {
    const [l, r] = touchStrip();
    const f = fitView(Math.max(0, innerWidth - l - r), innerHeight), s = f.s, ey = VIEW.ey;
    const box = $('hudbox');
    box.style.transform = `translate(${l + f.x}px, ${f.y}px) scale(${s})`;
    box.style.setProperty('--ey', `${ey}px`); // tall screens: the fight HUD moves to the real top / bottom edges
    // the touch overlay (screen px) parks its menu / fullscreen chips under the timer plaque: it needs the HUD transform
    document.documentElement.style.setProperty('--hudS', s);
    document.documentElement.style.setProperty('--hudY', `${f.y - ey * s}px`);
  }

  /** names, frame table, key hints for the fighters of a new game */
  setup(sim, { names = ['P1', 'P2'], title = 'TRAINING', subtitle = '', inputs = true } = {}) {
    const C = sim.chars;
    $('n0').innerHTML = `${C[0].name}<small>${names[0]}</small>`;
    $('n1').innerHTML = `<small>${names[1]}</small>${C[1].name}`;
    $('plaqueTitle').textContent = title; $('plaqueSub').textContent = subtitle;
    this.ghost = [C[0].phys.hp, C[1].phys.hp];
    this.buildFrameTable(C[0]);
    $('inputs').classList.toggle('hide', !inputs);
    // keys the P1 character does not have are dimmed (the sim masks them anyway)
    for (const k of this.keys) k.classList.toggle('na', !(C[0].inputMask & BTN[k.dataset.b]));
    $('pips0').innerHTML = $('pips1').innerHTML = '';
  }

  buildFrameTable(ch) {
    const rows = Object.entries(ch.moves).map(([, m]) => {
      const startup = m.waves ? m.waves[0].at : m.spawnAt !== undefined ? m.spawnAt + 1 : m.active ? m.active[0] + 1 : '-';
      const active = m.active ? m.active[1] - m.active[0] : '-';
      const recovery = m.active ? m.total - m.active[1] : m.waves ? m.total - m.waves.at(-1).at : m.total - (m.spawnAt || 0);
      const dmg = m.projectile ? m.projectile.dmg : m.fan ? `${m.fan.dmg}×${m.fan.angles.length}` : m.waves ? `${m.cine.impact + m.cine.slashes.length * m.cine.slashDmg + m.cine.x.length * m.cine.xDmg}` : m.clones ? `${m.cine.impact + m.cine.hits.reduce((s, h) => s + h.dmg, 0)}` : m.dmg ?? '-';
      const lvl = (m.level || '').slice(0, 1).toUpperCase();
      return `<tr><td>${m.name.replace(/ \(.*\)/, '').replace('Ultimate: ', 'Ult: ')}</td><td>${startup}</td><td>${active}</td><td>${recovery}</td><td>${dmg}</td><td>${lvl}</td></tr>`;
    });
    $('frames').innerHTML = `<tr><th>${ch.name.toLowerCase()} move</th><th>start</th><th>act</th><th>rec</th><th>dmg</th><th>lvl</th></tr>${rows.join('')}`;
  }

  /** match state: timer + round pips (null in training) */
  match(m) {
    if (!m) { $('timer').textContent = ''; return; }
    $('timer').textContent = m.timeLeft;
    const need = Math.floor(m.bestOf / 2) + 1;
    for (let i = 0; i < 2; i++) {
      const html = Array.from({ length: need }, (_, k) => `<i class="${k < m.wins[i] ? 'won' : ''}"></i>`).join('');
      if ($('pips' + i).innerHTML !== html) $('pips' + i).innerHTML = html;
    }
  }

  update(sim, bits, info) {
    for (let i = 0; i < 2; i++) {
      const f = sim.f[i], max = sim.C(f).phys.hp;
      this.ghost[i] += (f.hp - this.ghost[i]) * (f.hp < this.ghost[i] ? 0.04 : 1);
      $('f' + i).style.width = (f.hp / max) * 100 + '%';
      $('g' + i).style.width = (this.ghost[i] / max) * 100 + '%';
      $('hp' + i).textContent = `${Math.ceil(f.hp)} / ${max}`;
      $('mf' + i).style.width = f.meter + '%';
      $('m' + i).classList.toggle('full', f.meter >= 100);
      $('gf' + i).style.width = (f.guard || 0) + '%';
      $('g' + i).classList.toggle('warn', (f.guard || 0) > 65);
      $('g' + i).classList.toggle('broken', (f.gBreak || 0) > 0);
      const c = sim.comboShow[i], on = c.t > 0 && c.hits >= 1;
      $('combo' + i).classList.toggle('on', on);
      if (on) { $('cn' + i).textContent = c.hits; $('cd' + i).textContent = `${c.dmg} DAMAGE`; }
    }
    for (const k of this.keys) k.classList.toggle('on', !!(bits & BTN[k.dataset.b]));
    const p = sim.f[0];
    const mv = p.state === 'attack' ? sim.C(p).moves[p.move].name.replace(/ \(.*\)/, '') : '';
    $('readout').innerHTML = `<b>${p.state.toUpperCase()}</b>${mv ? ' · ' + mv : ''} <span class="sm">frame ${Math.max(0, p.t)}</span><br><span class="sm">${info}</span>`;
  }

  /** big centre banner; `sub` = a small caption under it (the round's time of day / weather) */
  banner(text, ms = 1300, sub = '') {
    const b = $('banner'); b.textContent = text; b.classList.toggle('on', !!text);
    if (sub) { const c = document.createElement('small'); c.textContent = sub; b.appendChild(c); }
    clearTimeout(this._bt); if (text) this._bt = setTimeout(() => b.classList.remove('on'), ms);
  }
}
