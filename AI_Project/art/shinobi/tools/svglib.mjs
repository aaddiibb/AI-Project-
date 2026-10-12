// Small vector-drawing helpers used to author the master SVG as code.
// Point lists are [x, y] or [x, y, 1] (1 = sharp corner).

export const f = (n) => +n.toFixed(2);

function crSegments(pts, closed) {
  const n = pts.length;
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const k = 1 / 6;
  const segs = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    let c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    let c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    if (p1[2]) c1 = [p1[0] + (p2[0] - p1[0]) * 0.3, p1[1] + (p2[1] - p1[1]) * 0.3];
    if (p2[2]) c2 = [p2[0] + (p1[0] - p2[0]) * 0.3, p2[1] + (p1[1] - p2[1]) * 0.3];
    segs.push([p1, c1, c2, p2]);
  }
  return segs;
}

/** Smooth Catmull-Rom curve through points -> path d */
export function S(pts, closed = true) {
  const segs = crSegments(pts, closed);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (const [, c1, c2, p2] of segs) d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  return closed ? d + 'Z' : d;
}

/** Open sub-path of the CLOSED smooth curve through pts, from point i0 to point i1 (wrapping).
 *  Used for limb outlines that skip the joint end (so knees/ankles don't show an overlap line). */
export function Sseg(pts, i0, i1) {
  const segs = crSegments(pts, true);
  const n = pts.length;
  let d = `M${f(pts[i0][0])},${f(pts[i0][1])}`;
  for (let i = i0; i !== i1; i = (i + 1) % n) {
    const [, c1, c2, p2] = segs[i];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** Straight polygon / polyline -> path d */
export function Pl(pts, closed = true) {
  return 'M' + pts.map((p) => `${f(p[0])},${f(p[1])}`).join('L') + (closed ? 'Z' : '');
}

function bez([p0, c1, c2, p1], t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]];
}

/** Sample the smooth curve through pts */
export function sample(pts, closed = false, per = 14) {
  const out = [];
  const segs = crSegments(pts, closed);
  segs.forEach((s, i) => {
    for (let j = 0; j < per; j++) out.push(bez(s, j / per));
    if (i === segs.length - 1 && !closed) out.push(bez(s, 1));
  });
  return out;
}

export const PROFILES = {
  both: (t) => Math.pow(Math.sin(Math.PI * t), 0.6),
  tail: (t) => Math.pow(1 - t, 0.85),
  head: (t) => Math.pow(t, 0.85),
  // hair lock: starts fairly wide, swells, tapers to a point
  lock: (t) => (t < 0.25 ? 0.75 + t : Math.pow((1 - t) / 0.75, 0.75)),
  // hair lock rooted at a tie/scalp: rounded narrow root, full body, long sharp tip
  strand: (t) => (t < 0.18 ? 0.35 + 0.65 * Math.sin((t / 0.18) * Math.PI / 2) : Math.pow((1 - t) / 0.82, 0.9)),
  // finger: flat root, rounded tip
  finger: (t) => (t > 0.8 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.8) / 0.2, 2))) * 0.92 + 0.08 : 1 - t * 0.12),
  // brush stroke: quick swell, long taper
  brush: (t) => Math.min(1, t * 5) * Math.pow(1 - t, 0.5),
  even: (t) => Math.min(1, t * 12, (1 - t) * 12),
  flat: () => 1,
  cloth: (t) => 1 - 0.25 * t,
};

/** Filled tapered stroke along a smooth curve -> path d (inked line look) */
export function T(pts, w, profile = 'both', per = 14) {
  const prof = typeof profile === 'function' ? profile : PROFILES[profile];
  const s = sample(pts, false, per);
  const len = [0];
  for (let i = 1; i < s.length; i++) len.push(len[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
  const total = len[len.length - 1] || 1;
  const Lf = [], R = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1;
    tx /= m; ty /= m;
    const hw = (w * prof(len[i] / total)) / 2;
    Lf.push([s[i][0] - ty * hw, s[i][1] + tx * hw]);
    R.push([s[i][0] + ty * hw, s[i][1] - tx * hw]);
  }
  return Pl(Lf.concat(R.reverse()), true);
}

/** Ellipse as path d (optionally rotated, degrees) */
export function E(cx, cy, rx, ry, rot = 0) {
  const n = 28, pts = [];
  const r = (rot * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return S(pts, true);
}

/** Deterministic pseudo random */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Tattered edge from a to b: points with sharp tips pushed toward dir (default down) */
export function jag(a, b, n, depth, seed = 1, dir = [0, 1]) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    if (i === 0 || i === n) { out.push([x, y, 1]); continue; }
    const tip = i % 2 === 1;
    const d = tip ? depth * (0.25 + Math.pow(r(), 1.6) * 1.1) : -depth * (0.05 + r() * 0.25);
    out.push([x + dir[0] * d + (r() - 0.5) * 4, y + dir[1] * d, 1]);
  }
  return out;
}

/** Transform point list: scale, rotate (deg) about origin, then translate */
export function X(pts, tx = 0, ty = 0, deg = 0, sx = 1, sy = 1) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return pts.map(([x, y, k]) => {
    const X0 = x * sx, Y0 = y * sy;
    const p = [X0 * c - Y0 * s + tx, X0 * s + Y0 * c + ty];
    if (k) p.push(k);
    return p;
  });
}

// ---------------------------------------------------------------- SVG element helpers
/** filled path */
export const F = (d, cls) => `<path d="${d}" class="${cls}"/>`;
/** stroked path (line) */
export const L = (d, w, cls = 'ln') => `<path d="${d}" class="${cls}" stroke-width="${w}"/>`;
/** circle */
export const C = (cx, cy, r, cls) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" class="${cls}"/>`;
/** group with optional transform */
export const G = (inner, transform) => (transform ? `<g transform="${transform}">${inner}</g>` : `<g>${inner}</g>`);

/**
 * Self-contained shaded shape: base fill + shading clipped to base + outline on top.
 *   sh:  svg strings drawn clipped inside the shape
 *   top: svg strings drawn after the outline (unclipped)
 *   ol:  outline width (0 = none); far: darken for far-side limbs
 */
export function shape(id, d, cls, { sh = [], top = [], ol = 5, olCls = 'ol', far = false, olD = null } = {}) {
  const inner = sh.join('') + (far ? `<use href="#${id}-s" class="f-far"/>` : '');
  const outline = !ol ? '' : olD ? `<path d="${olD}" class="${olCls}" stroke-width="${ol}"/>` : `<use href="#${id}-s" class="${olCls}" stroke-width="${ol}"/>`;
  return (
    `<defs><path id="${id}-s" d="${d}"/><clipPath id="${id}-c"><use href="#${id}-s"/></clipPath></defs>` +
    `<use href="#${id}-s" class="${cls}"/>` +
    (inner ? `<g clip-path="url(#${id}-c)">${inner}</g>` : '') +
    outline +
    top.join('')
  );
}

/** Clip arbitrary content to a path */
export function clipTo(id, d, inner) {
  return `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${id})">${inner}</g>`;
}
