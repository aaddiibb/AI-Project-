// DOM HUD: health bars, combo counters, live input display, readout, frame-data table, round timer and round pips.
// Reads the simulator (and the match runner), never writes them. Per character (prompt 05 §4.1): names, max HP, the
// frame-data table and the key hints come from each fighter's character.
import { BTN } from './sim.js';

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
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    const box = $('hudbox');
    box.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
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
      const startup = m.spawnAt !== undefined ? m.spawnAt + 1 : m.active ? m.active[0] + 1 : '-';
      const active = m.active ? m.active[1] - m.active[0] : '-';
      const recovery = m.active ? m.total - m.active[1] : m.total - (m.spawnAt || 0);
      const dmg = m.projectile ? m.projectile.dmg : m.fan ? `${m.fan.dmg}×${m.fan.angles.length}` : m.dmg;
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
      const c = sim.comboShow[i], on = c.t > 0 && c.hits >= 1;
      $('combo' + i).classList.toggle('on', on);
      if (on) { $('cn' + i).textContent = c.hits; $('cd' + i).textContent = `${c.dmg} DAMAGE`; }
    }
    for (const k of this.keys) k.classList.toggle('on', !!(bits & BTN[k.dataset.b]));
    const p = sim.f[0];
    const mv = p.state === 'attack' ? sim.C(p).moves[p.move].name.replace(/ \(.*\)/, '') : '';
    $('readout').innerHTML = `<b>${p.state.toUpperCase()}</b>${mv ? ' · ' + mv : ''} <span class="sm">frame ${Math.max(0, p.t)}</span><br><span class="sm">${info}</span>`;
  }

  banner(text, ms = 1300) { const b = $('banner'); b.textContent = text; b.classList.toggle('on', !!text); clearTimeout(this._bt); if (text) this._bt = setTimeout(() => b.classList.remove('on'), ms); }
}
