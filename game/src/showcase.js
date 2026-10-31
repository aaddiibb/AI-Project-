// Front-end Pixi layer (menu.js drives it): the sheet portraits and the live, palette-swapped fighter models on the
// character select, the hero art on the title and the VS screen. Drawn in screen space (1920x1080, under the DOM menu)
// above the dimmed stage. Render only: it builds its own throwaway puppets and never touches a sim.
import { ROSTER } from './roster.js';
import { Puppet, loadRig, loadPoses, VIEW } from './render.js';
import { getChar } from './characters/index.js';

const W = 1920, H = 1080;
const ease = (t) => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;
// the showcase move a fighter plays when chosen
const PICK = { samurai: 'light', shinobi: 'slash' };

export class Showcase {
  constructor(PIXI, parent) {
    this.PIXI = PIXI;
    this.root = new PIXI.Container(); parent.addChild(this.root);
    this.shade = new PIXI.Graphics(); this.root.addChild(this.shade);
    this.layer = new PIXI.Container(); this.root.addChild(this.layer);
    this.tex = {}; this.mode = 'off'; this.t = 0;
    this.sides = [0, 1].map(() => ({ id: null, pal: -1, portrait: null, pup: null, holder: null, ring: null, t: 0, pick: -1, token: 0 }));
    this.heroes = [];
    this.fadeMask = this.gradientTexture();
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; // soft aura behind the hero art
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); this.auraTex = PIXI.Texture.from(c);
    const f = document.createElement('canvas'); f.width = 4; f.height = 256; // the heroes' feet fade into the dark
    const fg = f.getContext('2d'), fgr = fg.createLinearGradient(0, 0, 0, 256);
    fgr.addColorStop(0, 'rgba(12,10,18,0)'); fgr.addColorStop(1, 'rgba(12,10,18,1)'); fg.fillStyle = fgr; fg.fillRect(0, 0, 4, 256);
    this.floorFade = PIXI.Texture.from(f);
    this.vsbg = new PIXI.Graphics(); this.root.addChildAt(this.vsbg, 1); // VS: the two coloured halves + speed lines
  }

  async texture(url) { return (this.tex[url] ||= this.PIXI.Assets.load(url)); }
  /** alpha mask for the portraits: fades the sheet crop's hard edges (top, bottom and the outer side) */
  gradientTexture() {
    const N = 256, c = document.createElement('canvas'); c.width = N; c.height = N;
    const g = c.getContext('2d'), v = g.createLinearGradient(0, 0, 0, N);
    v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.05, '#fff'); v.addColorStop(0.7, '#fff'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = 'destination-in';
    const h = g.createLinearGradient(0, 0, N, 0); h.addColorStop(0, 'rgba(255,255,255,0)'); h.addColorStop(0.1, '#fff'); h.addColorStop(1, '#fff');
    g.fillStyle = h; g.fillRect(0, 0, N, N);
    return this.PIXI.Texture.from(c);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode; this.t = 0;
    for (const s of this.sides) this.clearSide(s);
    for (const h of this.heroes) { h.sprite.destroy(); h.aura?.destroy(); } this.heroes = [];
    this.fade?.destroy(); this.fade = null;
    this.layer.removeChildren(); this.vsbg.clear();
    this.root.visible = mode !== 'off';
    if (mode === 'title') this.heroArt(['samurai', 'shinobi'], 'title');
  }
  clearSide(s) {
    s.portrait?.destroy(); s.portrait = null; s.mask?.destroy(); s.mask = null;
    s.pup?.destroy(); s.pup = null; s.holder?.destroy({ children: true }); s.holder = null; s.ring?.destroy(); s.ring = null;
    s.id = null; s.pal = -1; s.char = null; s.token++;
  }

  // ------------------------------------------------------------------ character select
  /** show character `id` in palette `pal` on side i (async: loads the portrait, rig and poses once) */
  async setSide(i, id, pal) {
    const s = this.sides[i];
    if (this.mode !== 'select' || (s.id === id && s.pal === pal)) return;
    const token = ++s.token;
    const R = ROSTER[id], char = getChar(id);
    const [tex, rig, poses] = await Promise.all([this.texture(R.face), loadRig(this.PIXI, R.palettes[pal].rig), loadPoses(char)]);
    if (token !== s.token || this.mode !== 'select') return;
    const { PIXI } = this, newChar = s.id !== id;
    if (newChar) {
      s.portrait?.destroy(); s.mask?.destroy();
      const sp = new PIXI.Sprite(tex), k = 820 / tex.height;
      sp.scale.set(i === 0 ? k : -k, k);
      const mask = new PIXI.Sprite(this.fadeMask); mask.width = tex.width * k; mask.height = 820; if (i === 1) mask.scale.x *= -1; // fade on the outer side
      s.baseX = i === 0 ? 36 : W - 36; s.pw = tex.width * k;
      sp.position.set(s.baseX, 96); mask.position.set(s.baseX, 96);
      sp.mask = mask;
      this.layer.addChildAt(sp, 0); this.layer.addChild(mask);
      s.portrait = sp; s.mask = mask; s.t = 0;
    }
    s.pup?.destroy();
    if (!s.holder) {
      s.holder = new PIXI.Container(); s.ring = new PIXI.Graphics();
      this.layer.addChild(s.ring, s.holder);
    }
    s.pup = new Puppet(PIXI, rig.rig, rig.textures, s.holder, char, poses);
    s.char = char; s.id = id; s.pal = pal; s.f = this.fighter(char, i); s.pick = -1;
  }
  fighter(char, i) { return { state: 'idle', t: 0, x: 0, h: 0, vy: 0, facing: i === 0 ? 1 : -1, hp: char.phys.hp, meter: 0, move: null, flash: 0 }; }
  /** play the side's showcase move (the fighter was chosen) */
  pick(i) {
    const s = this.sides[i]; if (!s.char) return;
    const mv = PICK[s.id] in s.char.moves ? PICK[s.id] : null;
    s.f = mv ? { ...s.f, state: 'attack', move: mv, t: 0, contact: true } : { ...s.f, state: 'win', t: 0 };
    s.pick = mv ? s.char.moves[mv].total : 60;
  }

  // ------------------------------------------------------------------ title / VS hero art
  async heroArt(ids, kind) {
    const mode = this.mode;
    const texs = await Promise.all(ids.map((id) => this.texture(ROSTER[id].full)));
    if (this.mode !== mode) return;
    const { PIXI } = this;
    texs.forEach((tex, i) => {
      const sp = new PIXI.Sprite(tex);
      const h = kind === 'title' ? 960 : 1000, k = h / tex.height;
      sp.anchor.set(0.5, 1); sp.scale.set(i === 0 ? k : -k, k);
      if (kind === 'vs' && ids[0] === ids[1] && i === 1) sp.tint = 0x9a90b8; // mirror match: the second one in shadow
      const aura = new PIXI.Sprite(this.auraTex); aura.anchor.set(0.5); aura.blendMode = 'add';
      aura.tint = i === 0 ? 0xd2283c : 0x6a4cd8; aura.width = 900; aura.height = 1100;
      this.layer.addChild(aura, sp);
      this.heroes.push({ sprite: sp, aura, i, kind });
    });
    this.fade = new PIXI.Sprite(this.floorFade); this.layer.addChild(this.fade); // over the heroes' feet
  }
  vs(ids) { this.setMode('vs'); this.heroArt(ids, 'vs'); }

  /** VS: crimson and indigo halves slam in along a diagonal, a hot seam between them, speed lines streaming out */
  vsBackground(t, ex, ey) {
    const g = this.vsbg.clear(), a = ease((t - 2) / 14), L = -ex - 20, R = W + ex + 20, T = -ey, B = H + ey;
    const seam = (y) => 1010 - (100 * y) / H, tx = seam(T), bx = seam(B); // the diagonal seam's x at the top / bottom edge
    const off = (1 - a) * 1500;
    g.poly([L - off, T, tx - off, T, bx - off, B, L - off, B]).fill({ color: 0x5c0d18, alpha: 0.9 });
    g.poly([tx + off, T, R + off, T, R + off, B, bx + off, B]).fill({ color: 0x15204e, alpha: 0.9 });
    for (let i = 0; i < 26; i++) { // speed lines: each side streams outwards from the seam
      const side = i % 2, y = T + ((i * 97) % (B - T)), sp = 26 + (i % 5) * 9, len = 220 + (i * 53) % 380;
      const x = ((t * sp + i * 311) % (W / 2 + ex + 400));
      const xx = side ? seam(y) + 60 + x : seam(y) - 60 - x - len;
      g.rect(xx + (side ? off : -off), y, len, 3 + (i % 3)).fill({ color: side ? 0x7e9cff : 0xff6a6a, alpha: 0.16 * a });
    }
    const glow = 0.6 + 0.4 * Math.sin(t / 6);
    g.moveTo(tx, T).lineTo(bx, B).stroke({ width: 46, color: 0xff3048, alpha: 0.18 * a * glow })
      .moveTo(tx, T).lineTo(bx, B).stroke({ width: 14, color: 0xffd6a0, alpha: 0.55 * a })
      .moveTo(tx, T).lineTo(bx, B).stroke({ width: 4, color: 0xffffff, alpha: a });
  }

  // ------------------------------------------------------------------ per frame
  update(time) {
    if (this.mode === 'off') return;
    const t = ++this.t;
    const ex = VIEW.ex, ey = VIEW.ey, Hb = H + ey; // Hb: the real bottom edge on tall screens
    this.shade.clear().rect(-ex, -ey, W + 2 * ex, H + 2 * ey).fill({ color: 0x0c0a12, alpha: { title: 0.3, select: 0.72, stage: 0.78, vs: 0.9 }[this.mode] ?? 0.6 });
    if (this.mode === 'vs') this.vsBackground(t, ex, ey);
    for (const h of this.heroes) {
      const sp = h.sprite, dir = h.i === 0 ? -1 : 1;
      if (h.kind === 'title') {
        const a = ease(t / 70);
        sp.position.set(W / 2 + dir * (650 + 12 * Math.sin(t / 90 + h.i)) + dir * (1 - a) * 200, Hb + 40);
        sp.alpha = 0.92 * a;
        h.aura.position.set(sp.x, Hb - 520); h.aura.alpha = 0.2 * a * (0.85 + 0.15 * Math.sin(t / 50 + h.i * 2));
      } else {
        const a = ease((t - 4) / 16);
        sp.position.set(W / 2 + dir * (440 + (1 - a) * 900) + dir * 30 * Math.min(1, t / 160), Hb + 20);
        sp.alpha = a;
        h.aura.position.set(sp.x, Hb - 560); h.aura.alpha = 0.32 * a;
      }
    }
    if (this.fade) { this.fade.position.set(-ex, Hb - 190); this.fade.width = W + 2 * ex; this.fade.height = 190; this.fade.alpha = this.mode === 'vs' ? 0.9 : 0.75; }
    for (let i = 0; i < 2; i++) {
      const s = this.sides[i];
      if (!s.pup) continue;
      s.t++;
      const a = ease(s.t / 14), dir = i === 0 ? -1 : 1;
      if (s.portrait) { s.portrait.x = s.baseX + dir * (1 - a) * 120; s.portrait.alpha = a; s.mask.x = s.baseX + dir * (1 - a) * 120; }
      // the model: in front of the portrait, standing on a glowing ring
      const gx = i === 0 ? 620 : W - 620, gy = 768, sc = 0.45;
      s.holder.scale.set(sc); s.holder.position.set(gx, gy - 1300 * sc);
      s.ring.clear().ellipse(gx, gy + 6, 190, 30).fill({ color: i === 0 ? 0xc8283a : 0x3a6fd8, alpha: 0.22 + 0.06 * Math.sin(t / 14) })
        .ellipse(gx, gy + 6, 120, 18).fill({ color: 0x000000, alpha: 0.35 });
      s.f.t++;
      if (s.pick > 0 && --s.pick === 0) s.f = { ...s.f, state: 'idle', move: null, t: 0 };
      s.pup.update(s.f, time, 1 / 60, true, 0, { opp: null, freeze: false });
    }
  }
}
