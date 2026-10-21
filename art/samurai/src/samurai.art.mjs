// Samurai (Minimax fighter) - master art authored as code.
// All coordinates are MASTER coordinates (viewBox 0 0 1000 1400, ground y 1300, faces RIGHT, strict profile).
// buildParts() returns [{ id, parent, pivot:[x,y], svg, notes?, hidden?, slot?, grip? }] and the array order IS the z-order (back -> front).
// Near = camera side = his RIGHT side. Legs: near = back leg (screen left), far = front leg (screen right), as for the Shinobi.

import { S, Sseg, Pl, T, E, jag, F, C, shape, clipTo, sample } from '../tools/svglib.mjs';

const OL = 5; // outer silhouette line
const OM = 3.8; // medium parts / gear
const ink = (pts, w, prof = 'both') => F(T(pts, w, prof), 'f-ink');
const tf = (pts, w, cls, prof = 'both') => F(T(pts, w, prof), cls);
/** filled + thin-outlined element (straps, cords, small gear) */
const fo = (d, cls, w = 2) => `<path d="${d}" class="${cls} olf" stroke-width="${w}"/>`;
const band = (pts, w, cls, ow = 2, prof = 'flat') => fo(T(pts, w, prof), cls, ow);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ------------------------------------------------------------------ hair
// Locks are drawn twice: a thick ink underlay (bold outer silhouette) then the colored lock
// with a thin outline (inner strand separation).
function hairGroup(locks, extra = '', ow = 4.8) {
  const d = (l) => T(l.p, l.w, l.prof || 'strand');
  const under = locks.map((l) => `<path d="${d(l)}" class="f-ink olf" stroke-width="${ow}"/>`).join('');
  const over = locks.map((l) => `<path d="${d(l)}" class="${l.cls || 'f-hair'} olf" stroke-width="${l.ow || 1.1}"/>`).join('');
  return under + over + extra;
}
const sheen = (pts, w, cls = 'f-hair_hi', prof = 'both') => tf(pts, w, cls, prof);
/** lock that grows out of the scalp: pointed root, full body, long sharp tip */
const rooted = (t) => (t < 0.22 ? Math.sin((t / 0.22) * Math.PI / 2) : Math.pow((1 - t) / 0.78, 0.9));

// ------------------------------------------------------------------ cloth
/** ribbon polygon around a centerline with width fn and tattered end */
function ribbon(center, wfn, { n = 6, depth = 24, seed = 3, wr = null } = {}) {
  const s = sample(center, false, 10);
  const len = [0];
  for (let i = 1; i < s.length; i++) len.push(len[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
  const tot = len[len.length - 1];
  const Lf = [], R = [];
  let tan = [0, 1];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1;
    tx /= m; ty /= m; tan = [tx, ty];
    const hw = wfn(len[i] / tot) / 2;
    const hr = wr ? wr(len[i] / tot) / 2 : hw;
    Lf.push([s[i][0] - ty * hw, s[i][1] + tx * hw]);
    R.push([s[i][0] + ty * hr, s[i][1] - tx * hr]);
  }
  const end = jag(R[R.length - 1], Lf[Lf.length - 1], n, depth, seed, tan);
  return { poly: [...R, ...end.slice(1, -1), ...[...Lf].reverse()], left: Lf, right: R, center: s };
}
const twist = (t, at, k = 0.5, wid = 0.07) => 1 - k * Math.exp(-Math.pow((t - at) / wid, 2));

/** split one drawing into overlapping clipped segments (chain parts for spring motion) */
function segBands(cuts, ov = 16) {
  const far = 900;
  const off = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k];
  const bands = [];
  for (let i = 0; i <= cuts.length; i++) {
    const prev = cuts[i - 1], next = cuts[i];
    const top = prev ? [off(prev.a, prev.dir, -ov), off(prev.b, prev.dir, -ov)] : [off(next.a, next.dir, -far), off(next.b, next.dir, -far)];
    const bot = next ? [off(next.a, next.dir, ov), off(next.b, next.dir, ov)] : [off(prev.a, prev.dir, far), off(prev.b, prev.dir, far)];
    bands.push(Pl([top[0], top[1], bot[1], bot[0]]));
  }
  return bands;
}

/** pleat set: dark fold lines + lit fold edges inside a cloth panel. lines: [[top, bottom], ...] */
function pleats(lines, { hiOff = 7, w = 2.4, hiW = 6 } = {}) {
  return lines
    .map(([a, b], i) => {
      const m = lerp(a, b, 0.5);
      return tf([[a[0] + hiOff, a[1]], [m[0] + hiOff, m[1]], [b[0] + hiOff, b[1]]], hiW, i % 2 ? 'f-cloth_mid' : 'f-cloth_hi', 'even') + ink([a, m, b], w, 'even');
    })
    .join('');
}

// ================================================================== SWORD GEOMETRY
// Sheathed: tsuba at TSUBA, blade axis U points down-back (into the saya), V is the edge side (up when sheathed).
const TSUBA = [668, 594];
const AX = 136; // blade direction in master (deg, y down)
const U = [Math.cos((AX * Math.PI) / 180), Math.sin((AX * Math.PI) / 180)];
const V = [Math.cos(((AX + 90) * Math.PI) / 180), Math.sin(((AX + 90) * Math.PI) / 180)];
const BLADE = 470, HILT = 166, SAYA = 498;
/** point on the sword frame: s along the blade (+ = toward the tip, - = toward the pommel), t across (+ = edge side) */
const SP = (s, t = 0) => {
  const bend = s > 0 ? -15 * Math.pow(Math.min(s, SAYA) / BLADE, 2) : 0; // sori: the tip curls toward the back (mune)
  const tt = t + bend;
  return [+(TSUBA[0] + s * U[0] + tt * V[0]).toFixed(2), +(TSUBA[1] + s * U[1] + tt * V[1]).toFixed(2)];
};
const strip = (s0, s1, t0, t1, n = 8) => {
  const a = [], b = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    a.push(SP(s, typeof t0 === 'function' ? t0(s) : t0));
    b.push(SP(s, typeof t1 === 'function' ? t1(s) : t1));
  }
  return [...a, ...b.reverse()];
};
export const SWORD = { grip: SP(-44, 0), grip2: SP(-128, 0), tip: SP(BLADE, -2), guard: SP(0, 0), mouth: SP(8, 0), axisDeg: AX };

function swordArt() {
  // blade: edge side (+t) bright, mune side darker, wavy hamon along the edge
  const bw = (s) => (s < BLADE - 34 ? 9.5 - 1.6 * (s / BLADE) : 8 * Math.sqrt(Math.max(0, (BLADE - s) / 34)));
  const bladePts = [...strip(14, BLADE - 34, (s) => -bw(s), (s) => bw(s), 14).slice(0, 15), SP(BLADE - 14, 6.5), SP(BLADE, -2, 1), ...strip(14, BLADE - 34, (s) => -bw(s), (s) => bw(s), 14).slice(15)];
  const hamon = [];
  for (let s = 22; s <= BLADE - 24; s += 9) hamon.push(SP(s, 3.2 + 1.8 * Math.sin(s * 0.33)));
  const blade = shape('swb', S(bladePts.map((p, i) => (i === 15 ? [...p, 1] : p))), 'f-steel', {
    ol: 2.6,
    sh: [
      F(Pl(strip(10, BLADE, -12, -1.2, 14)), 'f-steel_sh'),
      F(T(hamon, 4.2, 'even'), 'f-steel_hi'),
      tf(hamon.map(([x, y]) => [x, y]), 1.2, 'f-hamon', 'even'),
      tf([SP(40, -4), SP(200, -4.2), SP(400, -3.6)], 1, 'f-steel_hi', 'even'),
    ],
  });
  const habaki = fo(Pl(strip(4, 17, -11, 11, 2)), 'f-bronze', 2) + tf([SP(7, -9), SP(7, 9)], 1.4, 'f-bronze_hi', 'even');
  // hilt: black wrap with ray-skin diamonds showing through, bronze fuchi and kashira
  const hiltBase = shape('swh', S(strip(-HILT + 6, -6, (s) => -10.5 - 0.8 * Math.sin((Math.PI * (s + HILT)) / HILT), (s) => 10.5 + 0.8 * Math.sin((Math.PI * (s + HILT)) / HILT), 6).map((p, i, a) => (i === 0 || i === 6 || i === 7 || i === a.length - 1 ? [...p, 1] : p))), 'f-lacq', {
    ol: 3,
    sh: [tf([SP(-HILT + 10, -5.5), SP(-10, -5.5)], 2.2, 'f-lacq_hi', 'even')],
  });
  const dia = [];
  for (let s = -HILT + 18; s < -18; s += 17) {
    dia.push(fo(Pl([SP(s, 0), SP(s + 6.5, -5.5), SP(s + 13, 0), SP(s + 6.5, 5.5)]), 'f-same', 0.9));
  }
  const cross = [];
  for (let s = -HILT + 18; s < -18; s += 17) {
    cross.push(tf([SP(s - 3, -10), SP(s + 9, 10)], 2.6, 'f-wrap_hi', 'even'));
  }
  const fuchi = fo(Pl(strip(-12, -4, -12, 12, 2)), 'f-bronze', 2);
  const kashira = fo(S([SP(-HILT - 4, -10.5, 1), SP(-HILT + 8, -11.5, 1), SP(-HILT + 8, 11.5, 1), SP(-HILT - 4, 10.5, 1), SP(-HILT - 9, 0)]), 'f-bronze', 2.2) + tf([SP(-HILT + 1, -8), SP(-HILT + 1, 8)], 1.4, 'f-bronze_hi', 'even');
  // tsuba: round guard seen almost edge-on (narrow ellipse across the blade)
  const tsubaD = (() => {
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(SP(8 * Math.cos(a), 28 * Math.sin(a)));
    }
    return S(pts);
  })();
  const tsuba = shape('tsb', tsubaD, 'f-bronze', {
    ol: 2.6,
    sh: [F(Pl(strip(-10, 10, -32, -8, 2)), 'f-bronze_sh'), tf([SP(-3.4, 8), SP(-3.4, 24)], 2.4, 'f-bronze_hi'), tf([SP(2, -22), SP(2, -8)], 1.4, 'f-bronze_hi'), F(E(...SP(0, 0), 3, 9, AX), 'f-bronze_sh')],
  });
  return blade + habaki + hiltBase + dia.join('') + cross.join('') + fuchi + kashira + tsuba;
}

function sayaArt() {
  const body = strip(9, SAYA - 12, -13, 13, 16);
  const saya = shape('sya', S(body.map((p, i) => (i === 0 || i === 16 || i === 17 || i === body.length - 1 ? [...p, 1] : p))), 'f-lacq', {
    ol: OM,
    sh: [
      tf([SP(24, 6.5), SP(200, 7), SP(SAYA - 20, 6.5)], 3.2, 'f-lacq_hi', 'even'),
      tf([SP(30, 9.6), SP(SAYA - 30, 9.8)], 1.2, 'f-lacq_hi', 'even'),
      F(Pl(strip(9, SAYA - 12, -14, -6, 10)), 'f-wrap_sh'),
    ],
  });
  const koiguchi = fo(Pl(strip(6, 16, -14, 14, 2)), 'f-lacq_hi', 2.2);
  const kojiri = fo(S([SP(SAYA - 14, -13.5, 1), SP(SAYA - 2, -12), SP(SAYA + 3, 0), SP(SAYA - 2, 12), SP(SAYA - 14, 13.5, 1)]), 'f-bronze', 2.4) + tf([SP(SAYA - 8, -9), SP(SAYA - 8, 9)], 1.4, 'f-bronze_hi', 'even');
  // red sageo cord: kurikata knob, criss-cross wraps near the mouth, then a long hanging loop
  const kuri = fo(S([SP(52, -12), SP(58, -21), SP(70, -21), SP(74, -12)]), 'f-lacq', 1.8);
  const wraps = [64, 82, 100].map((s) => band([SP(s, -14), SP(s + 12, 14)], 4.4, 'f-red', 1.2) + band([SP(s + 12, -14), SP(s, 14)], 4.4, 'f-red', 1.2)).join('');
  const loop = band([SP(110, 12), SP(200, 19), SP(300, 21), SP(372, 15), SP(392, 10)], 4.6, 'f-red', 1.4) + band([SP(330, 18), SP(338, 30), SP(342, 44)], 4.2, 'f-red', 1.3, 'tail') + tf([SP(180, 18), SP(260, 20)], 1.4, 'f-red_hi');
  return saya + koiguchi + kojiri + wraps + kuri + loop;
}

// ------------------------------------------------------------------ hands
// LOCAL coords: wrist at origin, fingers toward +y, thumb toward +x. Fingerless black wraps cover hand + palm.
function handOpenLocal(id, far) {
  const fingers = [
    { p: [[-12, 34], [-14, 45], [-13, 53], [-10, 58]], w: 9 },
    { p: [[-5, 37], [-6.4, 50], [-5.6, 60], [-2.6, 65]], w: 9.6 },
    { p: [[2.2, 38], [2.6, 52], [4, 63], [6.5, 68]], w: 9.8 },
    { p: [[9.6, 36], [11.8, 49], [13.6, 59], [15.4, 64]], w: 9.2 },
  ];
  const fing = fingers
    .map((fg, i) => {
      const [, p1, p2] = fg.p;
      const crease = [[p1[0] - fg.w * 0.42, p1[1] + 0.6], [p1[0] + fg.w * 0.42, p1[1] - 0.6]];
      return shape(`${id}-f${i}`, T(fg.p, fg.w, 'finger'), 'f-skin', {
        ol: 1.9, far,
        sh: [tf(fg.p.map(([x, y]) => [x - fg.w * 0.36, y]), fg.w * 0.42, 'f-skin_sh', 'flat'), tf(crease, 0.9, 'f-skin_sh2', 'even'), tf([[p2[0] + 1, p2[1] - 2], [p2[0] + 2, p2[1] + 2]], 1.6, 'f-skin_hi')],
      });
    })
    .join('');
  const thumb = shape(`${id}-t`, T([[14, 8], [21, 22], [24.5, 34], [24, 45]], 9.8, 'finger'), 'f-skin', {
    ol: 1.9, far, sh: [tf([[11, 8], [18, 22], [21.5, 34], [21, 45]], 4, 'f-skin_sh', 'flat')],
  });
  const glove = shape(`${id}-g`, S([[-16, -8], [15, -9], [19, 8], [20, 24], [17, 36], [9, 42], [-1, 44], [-10, 42], [-18, 33], [-19, 14]]), 'f-wrap', {
    ol: 2.8, far,
    sh: [
      F(S([[-24, -8], [-8, -8], [-10, 48], [-24, 48]]), 'f-wrap_sh'),
      tf([[11, -2], [15, 16], [13, 32]], 3.4, 'f-wrap_hi'),
      tf([[-18, 6], [18, 14]], 1.6, 'f-wrap_hi', 'flat'), tf([[-18, 18], [19, 24]], 1.6, 'f-wrap_hi', 'flat'), tf([[-17, 30], [17, 34]], 1.6, 'f-wrap_hi', 'flat'),
    ],
  });
  const thumbGlove = shape(`${id}-tg`, T([[12, 4], [18, 16], [21, 28]], 12, (t) => 1 - 0.2 * t), 'f-wrap', { ol: 2.2, far, sh: [tf([[18, 8], [21.5, 24]], 2.2, 'f-wrap_hi')] });
  return fing + thumb + glove + thumbGlove;
}

/** closed hand in LOCAL coords. variant: 'fist' | 'grip_sword' | 'grip_saya'. Held items pass behind the hand along local +x at GRIP_LOCAL. */
export const GRIP_LOCAL = [2, 44];
function handClosedLocal(id, far, variant) {
  const knuck = [-13, -5.5, 2, 9.5];
  const fing = knuck
    .map((x, i) => shape(`${id}-f${i}`, T([[x, 40], [x + 0.6, 50], [x + 1.4, 56 - (i === 0 ? 3 : 0)]], 9.2, 'finger'), 'f-skin', { ol: 1.9, far, sh: [tf([[x - 3, 40], [x - 2.6, 55]], 3.4, 'f-skin_sh', 'flat')] }))
    .join('');
  const glove = shape(`${id}-g`, S([[-17, -8], [15, -9], [20, 8], [22, 26], [20, 40], [12, 47], [-2, 49], [-13, 47], [-19, 38], [-20, 16]]), 'f-wrap', {
    ol: 2.8, far,
    sh: [
      F(S([[-24, -8], [-8, -8], [-10, 52], [-24, 52]]), 'f-wrap_sh'),
      tf([[11, -2], [15, 16], [14, 34]], 3.4, 'f-wrap_hi'),
      tf([[-15, 40], [-2, 44], [14, 40]], 2.4, 'f-wrap_hi'),
      tf([[-19, 6], [19, 14]], 1.6, 'f-wrap_hi', 'flat'), tf([[-19, 20], [21, 26]], 1.6, 'f-wrap_hi', 'flat'),
    ],
  });
  const tp = variant === 'fist' ? [[16, 12], [22, 26], [19, 40], [11, 48]] : variant === 'grip_saya' ? [[16, 10], [24, 18], [32, 22], [40, 24]] : [[16, 12], [22, 26], [25, 37], [28, 46]];
  const thumb = shape(`${id}-t`, T(tp, 9.6, 'finger'), 'f-skin', { ol: 1.9, far, sh: [tf(tp.map(([x, y]) => [x, y + 3]), 3.6, 'f-skin_sh', 'flat')] });
  const thumbGlove = shape(`${id}-tg`, T([[13, 4], [19, 15], [22, 25]], 12, (t) => 1 - 0.2 * t), 'f-wrap', { ol: 2.2, far, sh: [tf([[19, 8], [22, 22]], 2.2, 'f-wrap_hi')] });
  return fing + glove + (variant === 'grip_saya' ? thumbGlove + thumb : thumb + thumbGlove);
}

/** apply translate(tx,ty) rotate(deg) scale(k) to a local point */
export const xf = ([x, y], tx, ty, deg, k) => {
  const r = (deg * Math.PI) / 180;
  return [+(tx + k * (x * Math.cos(r) - y * Math.sin(r))).toFixed(2), +(ty + k * (x * Math.sin(r) + y * Math.cos(r))).toFixed(2)];
};

/** all swappable hands for one side; grip anchors recorded in master coords. The first visible variant is the slot default. */
function handSet(add, side, parent, pivot, [tx, ty, deg, k], far, variants, def) {
  const tr = `translate(${tx},${ty}) rotate(${deg}) scale(${k})`;
  const grip = { point: xf(GRIP_LOCAL, tx, ty, deg, k), axisDeg: deg };
  const slot = `hand_${side}`;
  for (const v of variants) {
    const art = v === 'open' ? handOpenLocal(`h${side}o`, far) : handClosedLocal(`h${side}${v}`, far, v);
    add(`hand_${side}_${v}`, parent, pivot, `<g transform="${tr}">${art}</g>`, {
      slot, hidden: v !== def, grip: v.startsWith('grip_') ? grip : undefined, rotKey: v === 'open' ? undefined : `hand_${side}_open`, notes: `swappable hand: ${v}`,
    });
  }
  return { tr, xf: (p) => xf(p, tx, ty, deg, k) };
}

// ------------------------------------------------------------------ feet (profile tabi + straw sandal, toe toward +x)
function footArt(id, x0, far) {
  const m = (pts) => pts.map(([x, y, k]) => (k ? [x + x0, y, k] : [x + x0, y]));
  const footP = m([[-26, 1226], [20, 1224], [30, 1246], [50, 1262], [80, 1272], [106, 1279], [120, 1287], [121, 1293, 1], [60, 1294], [-30, 1294, 1], [-36, 1282], [-34, 1256]]);
  const sandal = fo(S(m([[-40, 1291, 1], [124, 1289, 1], [128, 1295], [124, 1301, 1], [-40, 1301, 1], [-44, 1296]])), 'f-straw', 2.6) + tf(m([[-34, 1297], [40, 1297.5], [118, 1296.5]]), 1.6, 'f-straw_sh', 'even');
  const tabi = shape(id, S(footP), 'f-wrap', {
    ol: OL, far,
    sh: [
      F(S(m([[-44, 1216], [-6, 1218], [-6, 1300], [-44, 1300]])), 'f-wrap_sh'),
      tf(m([[40, 1252], [70, 1264], [100, 1272]]), 3.4, 'f-wrap_hi'),
      ink(m([[92, 1276], [96, 1285], [98, 1292]]), 2),
      tf(m([[-28, 1236], [6, 1232], [22, 1236]]), 2, 'f-wrap_hi'),
    ],
  });
  // straw thong: from the toe gap back to the ankle, wrapped once around
  const strap = band(m([[94, 1288], [76, 1268], [44, 1250], [16, 1238]]), 4.6, 'f-straw', 1.4) + band(m([[-30, 1262], [-6, 1250], [16, 1238]]), 4.6, 'f-straw', 1.4) + tf(m([[80, 1270], [50, 1252]]), 1.2, 'f-straw_sh');
  return sandal + tabi + strap;
}

/** shin wrapped in black cloth bands with crimson cord criss-cross and a tie */
function shinArt(id, kx, ax, far) {
  // kx = knee x (y 965), ax = ankle x (y 1245)
  const xl = (y, o) => kx + (ax - kx) * ((y - 965) / 280) + o;
  const P = [[xl(930, -30), 930], [xl(930, 30), 930], [xl(1010, 31), 1010], [xl(1100, 28), 1100], [xl(1180, 24), 1180], [xl(1250, 25), 1250], [xl(1250, -25), 1250], [xl(1180, -24), 1180], [xl(1100, -28), 1100], [xl(1010, -30), 1010]];
  const wr = [1140, 1158, 1176, 1194, 1212, 1230].map((y) => tf([[xl(y, -25), y + 3], [xl(y, 0), y - 1], [xl(y, 25), y + 3]], 1.6, 'f-wrap_hi', 'even')).join('');
  const cords = [1168, 1180, 1222].map((y) => band([[xl(y, -25), y + 3], [xl(y, 0), y - 1], [xl(y, 25), y + 3]], 4.6, 'f-red', 1.4)).join('') ;
  return shape(id, S(P), 'f-wrap', {
    ol: OL, far, olD: Sseg(P, 1, 0),
    sh: [F(S([[xl(930, -40), 930], [xl(930, -12), 930], [xl(1250, -10), 1250], [xl(1250, -40), 1250]]), 'f-wrap_sh'), tf([[xl(1000, 18), 1000], [xl(1120, 16), 1120], [xl(1230, 15), 1230]], 4, 'f-wrap_hi'), wr, cords],
    top: [band([[xl(1180, -22), 1182], [xl(1186, -32), 1196], [xl(1192, -30), 1212]], 3.6, 'f-red', 1.3, 'tail'), fo(E(xl(1180, -24), 1181, 5, 4), 'f-red', 1.3)],
  });
}

// hand placements [tx, ty, deg, scale] (wrist at tx,ty) and ankle x of each foot, shared with the rig build
export const HANDS = { near: [562, 712, -12, 1.25], far: [590, 581, -44, 1.25] };
export const FEET = { near: 470, far: 585 };

// ================================================================== PARTS
export function buildParts() {
  const parts = [];
  const add = (id, parent, pivot, svg, extra = {}) => parts.push({ id, parent, pivot, svg, ...extra });

  // ---------------------------------------------------------------- SWORD + SAYA (far hip, behind the body)
  add('sword', 'saya', [...TSUBA], swordArt(), { grip: { point: SWORD.grip, axisDeg: AX }, grip2: SWORD.grip2, notes: 'katana (blade + hilt + tsuba). Rests in the saya; attach to hand_*_grip_sword when drawn' });
  add('saya', 'pelvis', [...TSUBA], sayaArt(), { notes: 'black lacquer scabbard through the obi at the left (far) hip, red sageo' });

  // ---------------------------------------------------------------- HAIR BACK (volume behind the skull / nape)
  // nape hair behind the neck, hanging from the cord tie to the collar (the raster head covers the skull above it;
  // the old spiky crown locks are gone: the reference head has none)
  add('hair_back', 'head_base', [470, 230], hairGroup([
    { p: [[470, 214], [462, 244], [460, 280], [466, 318], [472, 338]], w: 48, cls: 'f-hair_sh', prof: 'both' },
    { p: [[492, 222], [488, 254], [490, 292], [496, 326]], w: 30, cls: 'f-hair_sh' },
    { p: [[482, 236], [478, 270], [480, 306], [486, 334]], w: 14, cls: 'f-hair_sh2' },
    { p: [[504, 232], [502, 262], [506, 300]], w: 12, cls: 'f-hair' },
  ]), { notes: 'hair mass behind head / nape' });

  // ---------------------------------------------------------------- HAORI TAIL (back hem of the jacket)
  {
    const hem = jag([492, 704], [404, 716], 8, 26, 41);
    const P = [[440, 506], [496, 512], [500, 600], [494, 690], ...hem, [408, 640], [420, 560]];
    add('haori_tail_back', 'torso_upper', [452, 540], shape('htb', S(P), 'f-cloth', {
      ol: OM, far: true,
      sh: [F(S([[430, 500], [452, 500], [446, 720], [400, 720]]), 'f-cloth_sh'), ink([[470, 560], [466, 640], [460, 700]], 1.8), tf([[486, 560], [484, 650]], 4, 'f-cloth_hi')],
    }), { notes: 'cloth: secondary motion' });
  }

  // ---------------------------------------------------------------- FAR ARM (left; mostly behind the body, hand on the saya)
  const FAR_SH = [530, 350], FAR_EL = [432, 552], FAR_WR = [590, 581];
  {
    const hem = jag([590, 610], [418, 668], 9, 30, 52);
    const P = [[470, 336], [532, 322], [578, 346], [592, 420], [594, 520], ...hem, [414, 560], [420, 420], [440, 360]];
    add('sleeve_far', 'upper_arm_far', [...FAR_SH], shape('slf', S(P), 'f-cloth', {
      ol: OL, far: true,
      sh: [F(S([[410, 330], [460, 330], [446, 680], [400, 680]]), 'f-cloth_sh'), ink([[520, 400], [508, 520], [500, 620]], 1.8), tf([[574, 380], [580, 500], [578, 590]], 5, 'f-cloth_hi')],
    }), { notes: 'wide haori sleeve (spring)' });

    // upper arm in the kimono sleeve: shoulder -> elbow (angled back)
    const ua = [[506, 326], [550, 334], [552, 372], [500, 470], [452, 566], [420, 572], [412, 540], [460, 440], [500, 360]];
    add('upper_arm_far', 'torso_upper', [...FAR_SH], shape('uaf', S(ua), 'f-cloth', { ol: OL, far: true, sh: [ink([[530, 360], [480, 460], [440, 540]], 1.6)] }), { notes: 'kimono-sleeved upper arm' });

    // forearm: elbow -> wrist (forward to the hilt), black wraps + crimson cord
    const fa = [[420, 536], [452, 528], [500, 548], [560, 562], [598, 566], [600, 598], [560, 598], [500, 590], [440, 582], [418, 566]];
    add('forearm_far', 'upper_arm_far', [...FAR_EL], shape('faf', S(fa), 'f-wrap', {
      ol: OL, far: true,
      sh: [
        F(S([[410, 572], [600, 586], [600, 604], [410, 604]]), 'f-wrap_sh'),
        band([[510, 548], [520, 594]], 4.4, 'f-red', 1.2), band([[540, 554], [532, 596]], 4.4, 'f-red', 1.2),
        band([[566, 560], [574, 600]], 4.4, 'f-red', 1.2), band([[580, 562], [588, 600]], 4.4, 'f-red', 1.2),
      ],
    }), { notes: 'wrapped forearm' });
    handSet(add, 'far', 'forearm_far', [...FAR_WR], HANDS.far, true, ['open', 'fist', 'grip_sword', 'grip_saya'], 'grip_saya');
  }

  // ---------------------------------------------------------------- HAKAMA BACK PANEL
  {
    const hem = jag([486, 1166], [366, 1162], 9, 30, 7);
    const P = [[448, 612], [520, 616], [516, 700], [504, 820], [492, 960], [488, 1080], ...hem, [372, 1080], [398, 940], [424, 800], [440, 690]];
    add('hakama_back_panel', 'thigh_near', [516, 665], shape('hkb', S(P), 'f-cloth', {
      ol: OL, far: true,
      sh: [
        F(S([[360, 600], [436, 610], [410, 900], [380, 1180], [340, 1180]]), 'f-cloth_sh'),
        pleats([[[492, 660], [450, 1150]], [[470, 680], [410, 1150]], [[506, 700], [478, 1150]]]),
      ],
    }), { notes: 'cloth: rear pleats, hangs from the back hip (spring lags it toward vertical)' });
  }

  // ---------------------------------------------------------------- FAR LEG (front leg, screen right)
  const FAR_HIP = [538, 665], FAR_KNEE = [566, 962], FAR_ANK = [585, 1245];
  {
    add('foot_far', 'shin_boot_far', [...FAR_ANK], footArt('ftf', FAR_ANK[0], true), { notes: 'tabi + straw sandal (profile)' });
    add('shin_boot_far', 'thigh_far', [...FAR_KNEE], shinArt('shf', FAR_KNEE[0], FAR_ANK[0], true), { notes: 'shin wrap, crimson cord' });
    const P = [[500, 612], [638, 614], [646, 700], [650, 820], [652, 1000, 1], [490, 1000, 1], [494, 860], [496, 720]];
    add('thigh_far', 'pelvis', [...FAR_HIP], shape('thf', S(P), 'f-cloth', {
      ol: OL, far: true, olD: Sseg(P, 5, 4),
      sh: [F(Pl([[480, 600], [522, 600], [516, 1010], [470, 1010]]), 'f-cloth_sh'), pleats([[[560, 640], [560, 1000]], [[598, 640], [606, 1000]], [[624, 650], [634, 1000]]])],
    }), { notes: 'hakama trouser leg (upper)' });
    const hem = jag([672, 1160], [470, 1166], 11, 32, 19);
    const L = [[494, 900, 1], [650, 900, 1], [656, 1000], [664, 1100], ...hem, [478, 1080], [488, 980]];
    add('hakama_side_far', 'shin_boot_far', [...FAR_KNEE], shape('hsf', S(L), 'f-cloth', {
      ol: OL, far: true, olD: Sseg(L, 1, 0),
      sh: [F(Pl([[470, 880], [517, 880], [500, 1190], [440, 1190]]), 'f-cloth_sh'), pleats([[[560, 900], [556, 1160]], [[604, 900], [614, 1160]], [[632, 900], [648, 1160]], [[530, 930], [516, 1160]]])],
    }), { notes: 'hakama trouser leg (lower, torn hem): spring' });
  }

  // ---------------------------------------------------------------- HAKAMA FRONT PANEL
  {
    const hem = jag([672, 1158], [584, 1166], 6, 30, 23);
    const P = [[566, 614], [642, 616], [650, 720], [656, 860], [664, 1000], [670, 1100], ...hem, [580, 1060], [576, 900], [570, 760]];
    add('hakama_front_panel', 'thigh_far', [538, 665], shape('hkf', S(P), 'f-cloth', {
      ol: OL,
      sh: [pleats([[[586, 640], [600, 1150]], [[612, 640], [632, 1150]], [[636, 650], [658, 1150]]]), F(S([[560, 610], [584, 610], [596, 1170], [570, 1170]]), 'f-cloth_sh')],
    }), { notes: 'cloth: front pleats, hangs from the front hip (spring lags it toward vertical)' });
  }

  // ---------------------------------------------------------------- NEAR LEG (back leg, screen left)
  const NEAR_HIP = [516, 665], NEAR_KNEE = [492, 965], NEAR_ANK = [470, 1245];
  {
    add('foot_near', 'shin_boot_near', [...NEAR_ANK], footArt('ftn', NEAR_ANK[0], false), { slot: 'foot_near', notes: 'tabi + straw sandal (profile): stances' });
    add('foot_near_side', 'shin_boot_near', [...NEAR_ANK], footArt('fns', NEAR_ANK[0], false), { slot: 'foot_near', rotKey: 'foot_near', hidden: true, notes: 'same profile foot; kept so walk tools that swap foot_near_side keep working' });
    add('shin_boot_near', 'thigh_near', [...NEAR_KNEE], shinArt('shn', NEAR_KNEE[0], NEAR_ANK[0], false), { notes: 'shin wrap, crimson cord' });
    const P = [[446, 612], [588, 614], [590, 720], [586, 860], [582, 1000, 1], [420, 1000, 1], [428, 860], [438, 720]];
    add('thigh_near', 'pelvis', [...NEAR_HIP], shape('thn', S(P), 'f-cloth', {
      ol: OL, olD: Sseg(P, 5, 4),
      sh: [F(Pl([[410, 600], [460, 600], [452, 1010], [400, 1010]]), 'f-cloth_sh'), pleats([[[540, 640], [536, 1000]], [[506, 650], [496, 1000]], [[570, 650], [566, 1000]], [[478, 660], [462, 1000]]])],
    }), { notes: 'hakama trouser leg (upper)' });
    const hem = jag([602, 1164], [370, 1168], 12, 34, 5);
    const L = [[424, 900, 1], [584, 900, 1], [590, 1000], [596, 1100], ...hem, [384, 1080], [404, 980]];
    add('hakama_side_near', 'shin_boot_near', [...NEAR_KNEE], shape('hsn', S(L), 'f-cloth', {
      ol: OL, olD: Sseg(L, 1, 0),
      sh: [F(Pl([[400, 880], [454, 880], [418, 1190], [350, 1190]]), 'f-cloth_sh'), pleats([[[537, 900], [546, 1160]], [[499, 900], [494, 1160]], [[464, 900], [440, 1160]], [[567, 900], [584, 1160]]])],
    }), { notes: 'hakama trouser leg (lower, torn hem): spring' });
  }

  // ---------------------------------------------------------------- NECK / WAIST / TORSO / PELVIS
  const neckP = [[506, 250], [548, 258], [566, 276], [574, 300], [578, 328], [524, 332], [500, 312], [498, 280]];
  add('neck', 'torso_upper', [538, 312], shape('nck', S(neckP), 'f-skin', {
    ol: OM,
    sh: [F(S([[496, 248], [540, 256], [560, 290], [520, 300], [496, 300]]), 'f-skin_sh'), tf([[562, 290], [568, 304], [570, 318]], 2, 'f-skin_sh2'), tf([[570, 296], [575, 316]], 2.4, 'f-skin_hi')],
  }), { notes: 'neck' });

  add('waist', 'pelvis', [535, 590], shape('wst', S([[436, 466], [600, 470], [630, 500], [636, 560], [634, 600], [440, 600], [432, 530]]), 'f-cloth', {
    ol: OL,
    sh: [F(Pl([[600, 470], [640, 470], [640, 600], [612, 600]]), 'f-inner'), tf([[606, 470], [616, 540], [620, 600]], 3, 'f-inner_sh'), F(S([[420, 466], [470, 466], [466, 604], [420, 604]]), 'f-cloth_sh')],
  }), { notes: 'kimono midsection (tucked under the obi)' });

  add('torso_upper', 'waist', [530, 505], (() => {
    // haori body + kimono: rounded back, broad chest
    const bodyP = [[504, 296], [470, 310], [446, 330], [432, 362], [426, 420], [428, 480], [434, 548], [520, 560], [626, 556], [630, 510], [628, 462], [620, 418], [606, 374], [590, 338], [572, 312], [548, 302]];
    // grey inner collar band: around the neck then down the chest front
    const inner = T([[506, 300], [540, 306], [570, 316], [592, 340], [606, 380], [616, 430], [624, 490], [628, 560]], 24, (t) => (t < 0.25 ? 0.7 + t : 1));
    // black outer (kimono) collar beside it, toward the back
    const outer = T([[500, 308], [532, 316], [560, 330], [580, 356], [592, 400], [600, 450], [606, 510], [610, 562]], 22, 'flat');
    const skin = S([[560, 312], [582, 324], [596, 352], [592, 372], [578, 352], [566, 334]]);
    const body = shape('tor', S(bodyP), 'f-cloth', {
      ol: OL,
      sh: [
        F(S([[420, 300], [480, 300], [470, 420], [462, 560], [420, 560]]), 'f-cloth_sh'),
        tf([[612, 400], [622, 460], [626, 530]], 6, 'f-cloth_hi'),
        F(skin, 'f-skin'), tf([[574, 332], [588, 352], [592, 366]], 3, 'f-skin_sh'),
        `<path d="${inner}" class="f-inner olf" stroke-width="2.2"/>`,
        tf([[530, 312], [580, 330], [604, 380], [618, 450], [624, 530]], 4, 'f-inner_hi'),
        `<path d="${outer}" class="f-cloth olf" stroke-width="2"/>`,
        tf([[528, 320], [574, 346], [592, 406], [600, 480]], 3, 'f-cloth_hi'),
        ink([[470, 400], [500, 470], [520, 540]], 1.8), ink([[560, 420], [570, 490], [574, 550]], 1.6),
        // torn spots on the haori
        fo(Pl([[452, 470], [460, 462], [462, 476], [470, 470], [466, 484], [456, 482]]), 'f-cloth_sh', 1.2),
      ],
    });
    // collar standing up behind the neck: black haori collar with the grey inner edge
    const collarP = [[462, 326], [480, 298], [504, 280], [528, 274], [544, 280], [540, 298], [516, 302], [494, 314], [478, 332]];
    const collar = shape('col', S(collarP), 'f-cloth', {
      ol: OL, olD: Sseg(collarP, 0, 5),
      sh: [tf([[492, 296], [512, 284], [534, 280]], 7, 'f-inner'), tf([[476, 312], [496, 296]], 3, 'f-cloth_hi')],
    });
    return body + collar;
  })(), { notes: 'haori body, kimono, open collar with grey inner layer' });

  add('pelvis', null, [530, 640], (() => {
    const yoke = [[444, 560], [644, 566], [648, 640], [648, 700], [440, 700], [442, 640]];
    const yk = shape('yok', S(yoke), 'f-cloth', {
      ol: OL, olD: Sseg(yoke, 5, 3),
      sh: [F(S([[430, 600], [470, 600], [466, 712], [430, 712]]), 'f-cloth_sh'), pleats([[[480, 624], [478, 700]], [[540, 624], [540, 700]], [[600, 624], [602, 700]]])],
    });
    // koshiita: stiff back plate of the hakama, just above the obi at the back
    const koshi = fo(S([[440, 532, 1], [470, 528, 1], [474, 572], [442, 574]]), 'f-cloth', 3.2) + tf([[448, 540], [450, 568]], 3, 'f-cloth_hi');
    const obi = shape('obi', S([[442, 562], [644, 568], [648, 596], [646, 624], [444, 618], [440, 592]]), 'f-obi', {
      ol: OL,
      sh: [F(S([[440, 604], [648, 610], [648, 630], [440, 630]]), 'f-obi_sh'), tf([[452, 571], [550, 574], [638, 576]], 3, 'f-obi_hi'), ink([[446, 590], [546, 594], [646, 598]], 1.4)],
    });
    // crimson strip wrapped around the obi (upper half)
    const wrap = shape('owr', S([[443, 574], [644, 580], [646, 600], [445, 595]]), 'f-red', {
      ol: 2.4, sh: [F(S([[440, 588], [648, 594], [648, 604], [440, 604]]), 'f-red_sh'), tf([[460, 578], [560, 582], [630, 584]], 2.2, 'f-red_hi')],
    });
    return koshi + yk + obi + wrap;
  })(), { notes: 'ROOT. grey obi with crimson wrap + hakama hip yoke' });

  // ---------------------------------------------------------------- OBI TAILS (crimson strip, behind the knot)
  {
    const c2 = [[632, 616], [648, 660], [662, 716], [670, 776], [680, 836], [690, 880]];
    const t2 = ribbon(c2, (t) => (25 - 3 * t) * twist(t, 0.55, 0.45, 0.05), { n: 5, depth: 28, seed: 33 });
    const art2 = (p) => shape(p, Pl(t2.poly), 'f-red', { ol: OM, far: true, sh: [tf(t2.left.map(([x, y]) => [x + 4, y]), 9, 'f-red_sh', 'flat'), tf([[646, 656], [658, 712], [664, 760]], 3, 'f-red_hi')] });
    const b2 = segBands([{ a: [610, 740], b: [720, 750], dir: [0.15, 0.99] }]);
    add('obi_tail_2b', 'obi_tail_2a', [666, 745], clipTo('ot2b-clip', b2[1], art2('ot2b')), { notes: 'chain_segment: spring' });
    add('obi_tail_2a', 'obi_knot', [632, 616], clipTo('ot2a-clip', b2[0], art2('ot2a')), { notes: 'chain_segment: spring' });

    const c1 = [[618, 618], [626, 676], [626, 736], [634, 800], [646, 866], [654, 920], [664, 968]];
    const t1 = ribbon(c1, (t) => (30 - 4 * t) * (1 + 0.08 * Math.sin(t * 11)) * twist(t, 0.42, 0.5, 0.05) * twist(t, 0.82, 0.35, 0.03), { n: 6, depth: 34, seed: 12 });
    const art1 = (p) =>
      shape(p, Pl(t1.poly), 'f-red', {
        ol: OM,
        sh: [tf(t1.left.map(([x, y]) => [x + 5, y]), 11, 'f-red_sh', 'flat'), tf([[630, 640], [632, 690]], 4, 'f-red_hi'), tf([[634, 760], [644, 830], [652, 890]], 4, 'f-red_hi'), tf([[626, 700], [636, 780], [646, 860], [654, 930]], 1.4, 'f-red_sh')],
      });
    const b1 = segBands([{ a: [590, 790], b: [700, 800], dir: [0.15, 0.99] }]);
    add('obi_tail_1b', 'obi_tail_1a', [632, 794], clipTo('ot1b-clip', b1[1], art1('ot1b')), { notes: 'chain_segment: spring' });
    add('obi_tail_1a', 'obi_knot', [620, 618], clipTo('ot1a-clip', b1[0], art1('ot1a')), { notes: 'chain_segment: spring' });
  }

  // ---------------------------------------------------------------- OBI KNOT
  add('obi_knot', 'pelvis', [622, 604], (() => {
    const knot = shape('okn', S([[604, 586, 1], [626, 582], [640, 590, 1], [638, 612], [632, 628, 1], [612, 630], [602, 622, 1], [606, 604]]), 'f-red', {
      ol: OM,
      sh: [F(S([[600, 610], [640, 606], [640, 634], [600, 634]]), 'f-red_sh'), tf([[612, 590], [628, 588]], 3, 'f-red_hi'), ink([[616, 588], [618, 608], [614, 626]], 1.3), ink([[630, 590], [628, 610]], 1.1)],
    });
    const loop = shape('olp', S([[600, 592], [586, 584], [578, 592], [586, 604], [602, 606]]), 'f-red', { ol: 2.8, sh: [F(S([[576, 598], [604, 598], [604, 610], [576, 610]]), 'f-red_sh')] });
    return loop + knot;
  })(), { notes: 'crimson knot' });

  // ---------------------------------------------------------------- HEAD (profile)
  add('head_base', 'neck', [534, 272], (() => {
    const headP = [[456, 196], [470, 150], [506, 128], [546, 132], [574, 150], [586, 172], [591, 192], [589, 203, 1], [596, 214], [605, 230, 1], [596, 236], [592, 240], [594, 246], [590, 250, 1], [593, 254], [588, 259], [591, 268], [583, 281, 1], [560, 285], [532, 268], [514, 250], [484, 252], [462, 236]];
    const head = shape('hed', S(headP), 'f-skin', {
      ol: 3,
      sh: [
        // side plane under the cheekbone + jaw shadow
        F(S([[520, 236], [546, 226], [562, 236], [560, 258], [548, 276], [530, 268]]), 'f-skin_sh'),
        F(S([[540, 196], [576, 194], [586, 206], [576, 212], [552, 212]]), 'f-skin_sh'),
        F(S([[456, 180], [500, 180], [512, 250], [470, 250]]), 'f-skin_sh'),
        tf([[556, 234], [562, 248]], 1.4, 'f-skin_sh2'),
        tf([[592, 216], [598, 226]], 2, 'f-skin_hi'),
      ],
    });
    const ear = shape('ear', S([[506, 200], [520, 200], [528, 212], [527, 228], [519, 240], [508, 238], [503, 224]]), 'f-skin', {
      ol: 2.4,
      sh: [F(S([[500, 200], [510, 200], [508, 240], [500, 240]]), 'f-skin_sh'), tf([[514, 208], [520, 218], [517, 230]], 2.2, 'f-skin_sh2'), tf([[516, 214], [522, 212]], 1.4, 'f-skin_sh2')],
    });
    return head + ear;
  })(), { notes: 'profile skull, nose, lips, jaw, ear (no eye/mouth details)' });

  // ---------------------------------------------------------------- HAIR FRONT (scalp, swept-back crown, side locks in front of the ear)
  add('hair_front', 'head_base', [520, 190], (() => {
    const capP = [[592, 166], [580, 136], [552, 112], [512, 104], [474, 112], [448, 136], [436, 172], [436, 214], [442, 248], [448, 264], [466, 262], [482, 250], [494, 232], [500, 206], [512, 194], [532, 192], [550, 184], [566, 174], [580, 172]];
    const cap = shape('cap', S(capP), 'f-hair', {
      ol: 5, olD: Sseg(capP, 0, 9) ,
      sh: [
        // hair swept back from the hairline, converging on the tie at the nape
        tf([[436, 186], [438, 226], [450, 256]], 26, 'f-hair_sh'),
        tf([[586, 150], [556, 122], [512, 114], [474, 128], [450, 166], [446, 218], [452, 256]], 1.5, 'f-hair_sh'),
        tf([[578, 166], [544, 140], [504, 136], [472, 156], [458, 200], [456, 244]], 1.4, 'f-hair_sh2'),
        tf([[560, 178], [526, 162], [494, 168], [474, 200], [466, 246]], 1.3, 'f-hair_sh'),
        tf([[530, 190], [502, 190], [484, 216], [474, 252]], 1.2, 'f-hair_sh2'),
        tf([[592, 160], [574, 130], [540, 110]], 1.2, 'f-hair_sh'),
        // broken crown shine
        F(T([[566, 124], [540, 112], [506, 110], [478, 120]], 6, 'both'), 'f-hair_hi'),
        tf([[574, 140], [548, 126], [516, 124]], 2.2, 'f-hair_hi'), tf([[500, 128], [480, 140]], 2, 'f-hair_hi'),
      ],
    });
    // side curtain: long locks from the temple, hanging behind the eye and in front of the ear, past the jaw
    const sideL = [
      { p: [[540, 166], [538, 210], [534, 252], [538, 294], [532, 326]], w: 15, cls: 'f-hair_sh' },
      { p: [[556, 160], [550, 202], [546, 240], [548, 282], [556, 318]], w: 16 },
      { p: [[570, 158], [562, 190], [556, 220], [556, 252]], w: 10 },
    ];
    const lockD = (l, prof = rooted) => T(l.p, l.w, prof);
    const sideUnder = sideL.map((l) => `<path d="${lockD(l)}" class="f-ink olf" stroke-width="4.4"/>`).join('');
    const side = sideL.map((l) => `<path d="${lockD(l)}" class="${l.cls || 'f-hair'} olf" stroke-width="0.9"/>`).join('') + sheen([[552, 204], [548, 240], [550, 276]], 2.2) + sheen([[537, 230], [538, 270]], 1.4, 'f-hair_sh2');
    // bangs: locks from the crown falling over the forehead to the brow
    const bang = rooted;
    const bl = [
      { p: [[540, 140], [566, 156], [580, 182], [582, 210]], w: 16, cls: 'f-hair_sh' },
      { p: [[552, 132], [580, 146], [594, 170], [598, 198]], w: 19 },
      { p: [[566, 128], [592, 140], [606, 162], [610, 184]], w: 13 },
    ];
    const bd = (l) => T(l.p, l.w, bang);
    const bangUnder = bl.map((l) => `<path d="${bd(l)}" class="f-ink olf" stroke-width="4.4"/>`).join('');
    const bangs =
      bl.map((l) => `<path d="${bd(l)}" class="${l.cls || 'f-hair'} olf" stroke-width="0.9"/>`).join('') +
      sheen([[556, 132], [576, 150], [588, 170]], 2.2);
    // tie: dark cord wrapped at the nape + small loop
    const tie =
      band([[452, 252], [440, 266]], 16, 'f-cord', 1.8) + band([[456, 260], [444, 274]], 14, 'f-cord', 1.6) +
      tf([[450, 254], [442, 264]], 1.6, 'f-cord_hi') +
      fo(S([[440, 262], [424, 250], [418, 262], [432, 270]]), 'f-cord', 1.8) + fo(S([[440, 270], [428, 282], [438, 290], [446, 278]]), 'f-cord', 1.8);
    return sideUnder + bangUnder + cap + side + bangs + tie;
  })(), { notes: 'scalp, swept-back crown, side locks, bangs, hair tie' });

  // ---------------------------------------------------------------- FACE LAYERS (swappable, profile)
  const lid = (t) => Math.min(1, 0.45 + t * 2.4) * (1 - t * 0.35);
  const browP = (t) => Math.min(1, 0.35 + t * 1.6) * Math.min(1, (1 - t) * 4);
  const scar = tf([[598, 206], [584, 218], [568, 230], [554, 240]], 2.2, 'f-scar', 'both') + ink([[597, 207], [586, 216]], 0.8);
  const eyeN = () => {
    const white = [[565, 203], [572, 200.5], [580, 201], [584, 204.5], [578, 208], [570, 208]];
    const iris = shape('irsN', E(578.5, 204.5, 4, 4.6), 'f-iris', { ol: 0, sh: [F(E(579.4, 204.6, 1.8, 2.6), 'f-iris_dk'), F(Pl([[573, 199], [585, 199], [585, 202.4], [573, 202.4]]), 'f-iris_dk'), C(577.6, 203, 1, 'f-iris_hi')] });
    return shape('eyN', S(white), 'f-sclera', { ol: 0, sh: [iris] });
  };
  add('face_neutral', 'head_base', [576, 210], (() =>
    eyeN() +
    ink([[561, 205], [567, 200.6], [575, 199], [582, 200], [586, 203.6]], 4, lid) +
    ink([[566, 208.6], [574, 209.4], [581, 208]], 1.2) +
    // heavy straight brow, slightly lowered toward the nose (stern)
    ink([[556, 192], [566, 189.6], [578, 190], [589, 193.4]], 4.2, browP) +
    ink([[580, 214], [576, 222]], 1, 'tail') + // eye-bag line
    ink([[584, 247.6], [590, 247.4], [592.6, 247.8]], 1.6) + // closed mouth
    ink([[583, 254], [587, 255]], 0.9) +
    scar
  )(), { slot: 'face', notes: 'swappable expression: calm hard stare' });

  add('face_intense', 'head_base', [576, 210], (() =>
    shape('eyI', S([[566, 204], [573, 201.6], [581, 202], [584.6, 204.6], [579, 207.2], [570, 207.4]]), 'f-sclera', { ol: 0, sh: [F(E(579, 204.6, 3.4, 3.6), 'f-iris'), F(E(579.6, 204.6, 1.6, 2.2), 'f-iris_dk')] }) +
    ink([[561, 206], [567, 202], [575, 200.6], [582, 201.4], [586, 204]], 4.2, lid) +
    ink([[567, 208.6], [575, 209.2], [582, 207.8]], 1.3) +
    ink([[556, 188], [567, 189], [578, 193], [590, 198]], 4.6, browP) + // brow pulled down hard
    ink([[584, 192], [588, 186]], 1.1) + ink([[588, 196], [594, 191]], 1) + // glabella creases
    ink([[566, 214], [574, 220]], 1) +
    // open shouting mouth: dropped jaw overlay + dark mouth + teeth
    shape('jawI', S([[554, 250], [576, 244], [590, 252], [592, 266], [594, 276], [586, 290, 1], [562, 292], [548, 278]]), 'f-skin', {
      ol: 0,
      sh: [F(S([[548, 262], [574, 270], [586, 288], [560, 294]]), 'f-skin_sh')],
    }) +
    `<path d="${Sseg([[592, 266], [594, 276], [586, 290], [562, 292], [548, 278], [548, 262]], 0, 3)}" class="ol" stroke-width="3"/>` +
    shape('mthI', S([[594, 244, 1], [584, 247], [578, 254], [582, 266], [592, 266, 1], [588, 256]]), 'f-ink', {
      ol: 1.2,
      sh: [F(S([[582, 244], [596, 244], [594, 249], [584, 250]]), 'f-sclera'), F(S([[582, 262], [592, 262], [592, 268], [582, 268]]), 'f-sclera'), F(E(584, 258, 4, 3), 'f-lip')],
    }) +
    scar
  )(), { slot: 'face', notes: 'attack shout', hidden: true });

  add('face_hurt', 'head_base', [576, 210], (() =>
    ink([[562, 205], [569, 207.6], [577, 208.2], [585, 205]], 3.4, (t) => Math.min(1, 0.5 + t)) + // squeezed shut
    ink([[566, 211], [574, 212.4], [581, 211]], 1.1) +
    ink([[558, 200], [568, 196], [578, 192], [588, 194]], 3.8, browP) + // brow bunched up
    ink([[574, 196], [578, 190]], 1) + ink([[580, 198], [586, 193]], 1) +
    ink([[566, 216], [572, 222]], 1) + ink([[570, 222], [578, 228]], 0.9) +
    shape('mthH', S([[592, 244, 1], [580, 246], [578, 252], [592, 254, 1]]), 'f-sclera', { ol: 1.6, sh: [ink([[579, 249.6], [592, 249.4]], 0.9), ink([[584, 245], [584, 254]], 0.7), ink([[588, 245], [588, 254]], 0.7)] }) +
    scar
  )(), { slot: 'face', notes: 'hit reaction', hidden: true });

  add('strand_far', 'head_base', [588, 168], hairGroup([
    { p: [[584, 164], [598, 186], [603, 214], [603, 244], [598, 268]], w: 7 },
    { p: [[590, 172], [599, 194], [602, 216]], w: 4, cls: 'f-hair_sh' },
  ], '', 3.6), { notes: 'loose lock falling past the face front (spring)' });

  // ---------------------------------------------------------------- NEAR ARM (right; front-most)
  const NEAR_SH = [505, 352], NEAR_EL = [478, 575], NEAR_WR = [562, 712];
  {
    const ua = [[468, 330], [530, 332], [546, 380], [530, 470], [508, 560], [500, 596], [456, 598], [450, 540], [458, 460], [462, 380]];
    add('upper_arm_near', 'torso_upper', [...NEAR_SH], shape('uan', S(ua), 'f-cloth', { ol: OL, sh: [ink([[500, 380], [492, 480], [484, 570]], 1.6), F(S([[440, 330], [470, 330], [462, 600], [440, 600]]), 'f-cloth_sh')] }), { notes: 'kimono-sleeved upper arm (under the haori sleeve)' });

    const fa = [[456, 560], [500, 556], [522, 600], [546, 648], [576, 700], [574, 722], [550, 726], [520, 690], [488, 640], [462, 596]];
    add('forearm_near', 'upper_arm_near', [...NEAR_EL], shape('fan', S(fa), 'f-wrap', {
      ol: OL,
      sh: [
        F(S([[450, 570], [470, 580], [500, 640], [536, 700], [550, 730], [520, 730], [460, 640]]), 'f-wrap_sh'),
        tf([[504, 574], [530, 626], [560, 676]], 4, 'f-wrap_hi'),
        // bandage turns
        ...[0.15, 0.3, 0.45, 0.6, 0.75, 0.88].map((t) => {
          const c = lerp([480, 578], [562, 710], t);
          return tf([[c[0] - 22, c[1] + 12], [c[0], c[1] + 2], [c[0] + 20, c[1] - 10]], 1.5, 'f-wrap_hi', 'even');
        }),
        // crimson cord criss-cross
        ...[0.38, 0.55, 0.72].map((t) => {
          const c = lerp([480, 578], [562, 710], t);
          return band([[c[0] - 24, c[1] + 4], [c[0] + 22, c[1] - 2]], 4.4, 'f-red', 1.3) + band([[c[0] - 20, c[1] + 18], [c[0] + 24, c[1] - 16]], 4.4, 'f-red', 1.3);
        }),
      ],
    }), { notes: 'black wrist/forearm wrap, crimson cord' });

    handSet(add, 'near', 'forearm_near', [...NEAR_WR], HANDS.near, false, ['open', 'fist', 'grip_sword'], 'open');

    const hem = jag([570, 640], [402, 694], 10, 34, 77);
    const P = [[452, 336], [506, 318], [552, 332], [566, 372], [568, 460], [570, 560], ...hem, [404, 600], [406, 470], [414, 390], [428, 352]];
    add('sleeve_near', 'upper_arm_near', [...NEAR_SH], shape('sln', S(P), 'f-cloth', {
      ol: OL,
      sh: [
        F(S([[396, 340], [436, 340], [432, 700], [396, 700]]), 'f-cloth_sh'),
        tf([[548, 352], [558, 420], [560, 520], [560, 600]], 6, 'f-cloth_hi'),
        tf([[530, 336], [550, 350]], 3, 'f-cloth_rim'),
        ink([[500, 380], [496, 480], [494, 600]], 2), ink([[452, 410], [446, 520], [444, 640]], 1.8),
        tf([[508, 384], [506, 480], [504, 590]], 4, 'f-cloth_mid'),
        // inside of the sleeve showing at the hem
        F(S([[480, 650], [540, 640], [560, 652], [500, 668]]), 'f-cloth_sh'),
        // rips
        fo(Pl([[430, 600], [440, 590], [444, 606], [452, 600], [448, 618], [436, 616]]), 'f-cloth_sh', 1.2),
      ],
    }), { notes: 'wide haori sleeve (spring)' });
  }

  // ---------------------------------------------------------------- PONYTAIL (tied tail: 4 spring segments; drapes over the back and the near sleeve, as in the reference)
  // root raised 12 units so it starts under the raster head's cord tie (art/faces/build_faces.py adds the tie on top)
  {
    const spine = sample([[452, 254], [442, 282], [430, 328], [420, 388], [410, 448], [400, 508], [392, 554]], false, 10);
    const N = spine.length;
    const nrm = spine.map((p, i) => {
      const a = spine[Math.max(0, i - 1)], b = spine[Math.min(N - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], m = Math.hypot(tx, ty) || 1;
      return [-ty / m, tx / m];
    });
    const ss = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
    const env = (t) => 5 + 21 * ss(0.03, 0.4, t) + 6 * ss(0.6, 1, t); // narrow root: hidden under the tie
    const off = (i, o) => [spine[i][0] + nrm[i][0] * o, spine[i][1] + nrm[i][1] * o];
    const at = (t) => Math.round(t * (N - 1));
    // [spread -1..1, width, end t, wiggle phase, cls]
    const spec = [
      [0.85, 11, 0.95, 0.3, 'f-hair_sh'], [-0.85, 10, 0.86, 1.7, 'f-hair_sh'], [0.45, 14, 1.0, 2.2, 'f-hair'], [-0.45, 13, 0.97, 0.9, 'f-hair'], [0.05, 15, 1.04, 1.1, 'f-hair'],
      [0.65, 7, 0.9, 2.9, 'f-hair'], [-0.2, 8, 0.93, 0.2, 'f-hair_sh'], [1.3, 6, 0.8, 0.7, 'f-hair'], [-1.3, 5, 0.72, 0.5, 'f-hair'], [1.05, 5, 1.0, 1.4, 'f-hair_sh2'],
    ];
    const locks = spec.map(([sp, w, end, ph, cls]) => {
      const pts = [];
      const last = Math.max(3, Math.round((N - 1) * Math.min(1, end)));
      for (let i = 0; i <= last; i += 2) {
        const t = i / (N - 1);
        const o = sp * env(t) + 7 * Math.sin(t * 7 + ph) * t;
        pts.push(off(i, o));
      }
      if (end > 1) pts.push(off(N - 1, sp * 4 + 6));
      return { p: pts, w, cls };
    });
    const Lside = [], Rside = [];
    for (let i = 0; i <= at(0.55); i += 2) {
      const t = i / (N - 1);
      Lside.push(off(i, env(t) + 6 + 2 * Math.sin(t * 9)));
      Rside.push(off(i, -(env(t) + 5 + 2 * Math.sin(t * 8 + 1))));
    }
    const tips = [off(at(0.7), 14, 1), off(at(0.66), 4), off(at(0.74), 0), off(at(0.66), -6), off(at(0.68), -16)];
    tips[0].push(1); tips[2].push(1); tips[4].push(1);
    const massD = S([...Lside, ...tips, ...Rside.reverse()]);
    const thin = (l) => `<path d="${T(l.p, l.w, 'strand')}" class="${l.cls} olf" stroke-width="1"/>`;
    const art =
      `<path d="${massD}" class="ol" stroke-width="9" style="fill:none"/>` +
      locks.map((l) => `<path d="${T(l.p, l.w, 'strand')}" class="f-ink olf" stroke-width="4.4"/>`).join('') +
      `<path d="${massD}" class="f-hair_sh"/>` +
      locks.map(thin).join('') +
      sheen([[444, 266], [436, 298], [428, 338]], 4) + sheen([[424, 368], [416, 418], [410, 458]], 3) + sheen([[404, 488], [398, 518]], 2.2) +
      tf([[452, 288], [446, 328], [440, 368]], 1.2, 'f-hair_sh2') + tf([[410, 408], [402, 458], [396, 508]], 1.2, 'f-hair_sh2');
    const cuts = [
      { a: [400, 322], b: [470, 332], dir: [-0.2, 0.98] },
      { a: [384, 386], b: [456, 396], dir: [-0.17, 0.98] },
      { a: [372, 450], b: [446, 458], dir: [-0.16, 0.99] },
    ];
    const bands = segBands(cuts, 16);
    const piv = [[447, 252], [432, 326], [420, 390], [410, 454]];
    for (let i = 3; i >= 0; i--) add(`hair_${i + 1}`, i === 0 ? 'head_base' : `hair_${i}`, piv[i], clipTo(`hr${i + 1}-clip`, bands[i], art), { notes: 'chain_segment: spring (tied tail)' });
  }

  // loose lock falling in front of the near shoulder
  add('strand_near', 'head_base', [544, 196], hairGroup([
    { p: [[544, 190], [540, 240], [544, 300], [552, 360], [558, 420], [556, 452]], w: 15 },
    { p: [[550, 200], [548, 260], [554, 320], [562, 380]], w: 7, cls: 'f-hair_sh' },
  ], sheen([[543, 240], [546, 300], [553, 360]], 2), 4.4), { notes: 'loose lock over the near shoulder (spring)' });

  // anime convention: facial features read on top of the side locks / bangs, the face strand on top of them
  const faces = parts.filter((q) => q.id.startsWith('face_'));
  const rest = parts.filter((q) => !q.id.startsWith('face_'));
  rest.splice(rest.findIndex((q) => q.id === 'hair_front') + 1, 0, ...faces);
  return rest;
}

export const META = {
  name: 'samurai',
  viewBox: [0, 0, 1000, 1400],
  groundY: 1300,
  height: 1180,
  recommendedScreenHeightPx: 448,
};
