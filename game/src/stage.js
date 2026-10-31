// Parallax stages: each stage is a folder of SVG layers (assets/stage = Cherry temple, assets/stage_forest = Bamboo
// mountain) rasterised once at a per-layer scale and scrolled against the camera. Owns the ambient particles (cherry
// petals or bamboo leaves, from stage.json `ambient`). EVERYTHING here is drawn behind the fighters: nothing in front of them.

export const STAGES = {
  temple: { label: 'Cherry temple', base: 'assets/stage/', home: 'samurai' },
  forest: { label: 'Bamboo mountain', base: 'assets/stage_forest/', home: 'shinobi' },
};

async function rasterise(PIXI, url, w, h, scale) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  c.getContext('2d').drawImage(img, 0, 0, cw, ch);
  const tex = PIXI.Texture.from(c);
  tex.bottomRGB = bottomColour(c);
  return tex;
}
/** average colour of a canvas's bottom rows (the floor art's near edge, continued by the apron) */
function bottomColour(c) {
  const d = c.getContext('2d').getImageData(0, c.height - 3, c.width, 3).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return [r / n, g / n, b / n].map(Math.round);
}
/** tall screens (tablets) see below the floor art: a strip in its bottom colour, darkening towards the screen edge */
function apronTexture(PIXI, [r, g, b]) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, `rgb(${r},${g},${b})`); gr.addColorStop(1, `rgb(${Math.round(r * 0.4)},${Math.round(g * 0.4)},${Math.round(b * 0.42)})`);
  x.fillStyle = gr; x.fillRect(0, 0, 4, 256); return PIXI.Texture.from(c);
}

function petalTexture(PIXI, hue) {
  const c = document.createElement('canvas');
  c.width = 40; c.height = 28;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 40, 28);
  grd.addColorStop(0, hue[0]); grd.addColorStop(1, hue[1]);
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(2, 14); g.bezierCurveTo(8, -2, 30, -2, 38, 14); g.bezierCurveTo(30, 30, 8, 30, 2, 14); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(190,90,120,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(6, 14); g.lineTo(32, 14); g.stroke();
  return PIXI.Texture.from(c);
}
function leafTexture(PIXI, hue) { // long thin bamboo leaf
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, hue[0]); grd.addColorStop(1, hue[1]);
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(1, 8); g.quadraticCurveTo(26, -2, 63, 8); g.quadraticCurveTo(26, 18, 1, 8); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(40,70,30,.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(4, 8); g.lineTo(58, 8); g.stroke();
  return PIXI.Texture.from(c);
}

export class Stage {
  constructor(PIXI, back, front) {
    this.PIXI = PIXI; this.back = back; this.front = front;
    this.sets = {}; this.cur = null; this.layers = []; this.petals = []; this.t = 0; this.ambient = null;
    this.look = { wind: 0, alpha: 1, tint: 0xffffff }; // set by atmosphere.js: weather wind, petal density, light colour
  }

  /** load (once) and show a stage; `name` is a STAGES key */
  async load(name = 'temple') {
    const { PIXI } = this;
    if (!STAGES[name]) name = 'temple';
    const def = STAGES[name];
    if (!this.sets[name]) {
      const meta = await (await fetch(def.base + 'stage.json')).json();
      const tex = await Promise.all(meta.layers.map((l) => rasterise(PIXI, def.base + l.file, l.w, l.h, l.scale)));
      const root = new PIXI.Container(), layers = [];
      meta.layers.forEach((l, i) => {
        const holder = new PIXI.Container();
        const s = new PIXI.Sprite(tex[i]);
        s.position.set(l.x, l.y); s.scale.set(1 / l.scale);
        holder.addChild(s); root.addChild(holder);
        const extra = [];
        if (l.name === 'floor') { // continue the floor below its art for tall screens
          const a = new PIXI.Sprite(apronTexture(PIXI, tex[i].bottomRGB)); a.position.set(l.x, l.y + l.h - 2); a.width = l.w; a.height = 900;
          holder.addChildAt(a, 0); extra.push(a);
        }
        layers.push({ holder, sprite: s, extra, factor: Math.min(1, l.factor), name: l.name }); // never in front of the fighters
      });
      this.back.addChildAt(root, 0);
      this.sets[name] = { root, layers, ambient: meta.ambient || 'petals', meta };
    }
    for (const [k, set] of Object.entries(this.sets)) set.root.visible = k === name;
    const set = this.sets[name];
    this.cur = name; this.layers = set.layers;
    this.setAmbient(set.ambient);
  }

  /** ambient particles in the BACK container, above the stage layers (behind the fighters) */
  setAmbient(kind) {
    const { PIXI } = this;
    if (!this.petalLayer) { this.petalLayer = new PIXI.Container(); this.back.addChild(this.petalLayer); }
    if (this.ambient === kind && this.petals.length) { for (const p of this.petals) p.init = false; return; }
    this.ambient = kind;
    this.petalLayer.removeChildren().forEach((c) => c.destroy());
    this.petals = [];
    const texs = kind === 'leaves'
      ? [leafTexture(PIXI, ['#9cc47a', '#5f8f4c']), leafTexture(PIXI, ['#c9d98a', '#7aa36a']), leafTexture(PIXI, ['#e0c27a', '#a8894a'])]
      : [petalTexture(PIXI, ['#fff1f5', '#f6b5c9']), petalTexture(PIXI, ['#fde0e8', '#f09ab6'])];
    const n = kind === 'leaves' ? 40 : 60;
    for (let i = 0; i < n; i++) {
      const s = new PIXI.Sprite(texs[i % texs.length]);
      s.anchor.set(0.5);
      this.petals.push({ s, x: 0, y: 0, vx: 0, vy: 0, ph: Math.random() * 6, rs: 0, size: 0, init: false });
      this.petalLayer.addChild(s);
    }
  }

  /** cam: { cx, w, s } */
  update(cam, frames = 1) {
    this.t += frames;
    for (const l of this.layers) l.holder.x = (1 - l.factor) * (cam.cx - 2600);
    const left = cam.cx - cam.w / 2, right = cam.cx + cam.w / 2, top = 1300 - 940 / cam.s;
    const leaves = this.ambient === 'leaves', { wind, alpha, tint } = this.look;
    this.petalLayer.visible = alpha > 0.02;
    for (const p of this.petals) {
      if (!p.init || p.y > 1560 || p.x < left - 400 || p.x > right + 400) {
        const first = !p.init;
        p.init = true;
        p.x = left - 300 + Math.random() * (cam.w + 600);
        p.y = first ? top + Math.random() * 1700 : top - 100;
        p.vx = (leaves ? -0.8 : 1.2) + Math.random() * 2.2; p.vy = (leaves ? 1.5 : 1.1) + Math.random() * 1.6;
        p.rs = (Math.random() - 0.5) * (leaves ? 0.05 : 0.08); p.size = 0.55 + Math.random() * 0.8; p.s.rotation = Math.random() * 6;
      }
      p.ph += 0.03 * frames;
      p.x += (p.vx + wind * 6 + Math.sin(p.ph) * (leaves ? 2.2 : 1.4)) * frames * 1.6;
      p.y += (p.vy + Math.cos(p.ph * 0.7) * 0.6) * frames * 1.6;
      p.s.position.set(p.x, p.y);
      p.s.rotation += p.rs * frames;
      p.s.scale.set(p.size * 1.5, p.size * 1.5 * (0.45 + 0.55 * Math.abs(Math.cos(p.ph))));
      p.s.alpha = 0.85 * alpha; p.s.tint = tint;
    }
  }
}
