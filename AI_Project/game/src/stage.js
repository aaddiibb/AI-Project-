// Parallax stage: loads the SVG layers from assets/stage (rasterised once at a per-layer scale) and scrolls them against the camera.
// Also owns the ambient cherry-blossom petals.

async function rasterise(PIXI, url, w, h, scale) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  c.getContext('2d').drawImage(img, 0, 0, cw, ch);
  return PIXI.Texture.from(c);
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

export class Stage {
  constructor(PIXI, back, front) {
    this.PIXI = PIXI; this.back = back; this.front = front;
    this.layers = []; this.petals = []; this.t = 0;
  }

  async load(base = 'assets/stage/') {
    const { PIXI } = this;
    const meta = await (await fetch(base + 'stage.json')).json();
    const tex = await Promise.all(meta.layers.map((l) => rasterise(PIXI, base + l.file, l.w, l.h, l.scale)));
    meta.layers.forEach((l, i) => {
      const holder = new PIXI.Container();
      const s = new PIXI.Sprite(tex[i]);
      s.position.set(l.x, l.y); s.scale.set(1 / l.scale);
      holder.addChild(s);
      (l.factor > 1 ? this.front : this.back).addChild(holder);
      this.layers.push({ holder, factor: l.factor, name: l.name });
    });
    // petals live in the front container, in world units
    this.petalLayer = new PIXI.Container();
    this.front.addChildAt(this.petalLayer, 0);
    const texs = [petalTexture(PIXI, ['#fff1f5', '#f6b5c9']), petalTexture(PIXI, ['#fde0e8', '#f09ab6'])];
    for (let i = 0; i < 70; i++) {
      const s = new PIXI.Sprite(texs[i % 2]);
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
    for (const p of this.petals) {
      if (!p.init || p.y > 1560 || p.x < left - 400 || p.x > right + 400) {
        const first = !p.init;
        p.init = true;
        p.x = left - 300 + Math.random() * (cam.w + 600);
        p.y = first ? top + Math.random() * 1700 : top - 100;
        p.vx = 1.2 + Math.random() * 2.2; p.vy = 1.1 + Math.random() * 1.6;
        p.rs = (Math.random() - 0.5) * 0.08; p.size = 0.55 + Math.random() * 0.8; p.s.rotation = Math.random() * 6;
      }
      p.ph += 0.03 * frames;
      p.x += (p.vx + Math.sin(p.ph) * 1.4) * frames * 1.6;
      p.y += (p.vy + Math.cos(p.ph * 0.7) * 0.6) * frames * 1.6;
      p.s.position.set(p.x, p.y);
      p.s.rotation += p.rs * frames;
      p.s.scale.set(p.size * 1.5, p.size * 1.5 * (0.45 + 0.55 * Math.abs(Math.cos(p.ph))));
      p.s.alpha = 0.9;
    }
  }
}
