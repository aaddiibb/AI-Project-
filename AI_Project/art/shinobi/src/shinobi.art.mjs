// Shinobi (MCTS fighter) - master art authored as code.
// All coordinates are MASTER coordinates (viewBox 0 0 1000 1400, ground y ~1300, faces RIGHT).
// buildParts() returns [{ id, parent, pivot:[x,y], svg, notes?, hidden? }] and the array order IS the z-order (back -> front).

import { S, Sseg, Pl, T, E, jag, F, C, shape, clipTo, sample } from '../tools/svglib.mjs';

const OL = 5; // outer silhouette line
const OM = 3.8; // medium parts / gear
const ink = (pts, w, prof = 'both') => F(T(pts, w, prof), 'f-ink');
const tf = (pts, w, cls, prof = 'both') => F(T(pts, w, prof), cls);
/** filled + thin-outlined element (straps, cords, small gear) */
const fo = (d, cls, w = 2) => `<path d="${d}" class="${cls} olf" stroke-width="${w}"/>`;
const band = (pts, w, cls, ow = 2, prof = 'flat') => fo(T(pts, w, prof), cls, ow);

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

/** Ponytail: locks fanned around a spine (narrow at the tie, voluminous mid, split ends). */
function ponyLocks() {
  const spine = sample([[482, 200], [462, 181], [436, 184], [414, 214], [398, 262], [384, 322], [368, 392], [350, 462], [334, 532], [320, 604]], false, 10);
  const N = spine.length;
  const nrm = spine.map((p, i) => {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(N - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], m = Math.hypot(tx, ty) || 1;
    return [-ty / m, tx / m];
  });
  const ss = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  const env = (t) => 9 + 32 * ss(0.04, 0.5, t) - 6 * ss(0.7, 1, t);
  const clumpTip = { 0: 30, 1: 4, 2: -26 }; // clumps converge to pointed tips
  // [spread -1..1 (+ = outer/left side), width, end t, wiggle phase, layer]
  const spec = [
    [0.95, 14, 0.9, 0.3, 0], [-0.9, 14, 0.88, 1.7, 0], [0.6, 24, 1.0, 2.2, 0], [-0.55, 22, 0.97, 0.9, 0], [0.1, 30, 1.0, 1.1, 0],
    [0.75, 16, 0.94, 2.9, 1], [-0.3, 24, 0.99, 0.2, 1], [0.35, 22, 0.96, 1.5, 1], [-0.75, 13, 0.85, 2.4, 1],
    [1.15, 9, 0.8, 0.7, 2], [0.5, 10, 0.92, 2.6, 2], [-0.1, 11, 1.02, 1.9, 2], [-1.05, 8, 0.74, 0.5, 2], [0.85, 7, 0.98, 1.2, 2],
  ];
  // solid mass silhouette: fills the gaps between locks, ends in three pointed clumps
  const off = (i, o) => [spine[i][0] + nrm[i][0] * o, spine[i][1] + nrm[i][1] * o];
  const at = (t) => Math.round(t * (N - 1));
  const Lside = [], Rside = [];
  for (let i = 0; i <= at(0.8); i += 2) {
    const t = i / (N - 1);
    Lside.push(off(i, env(t) + 10 + 3 * Math.sin(t * 9)));
    Rside.push(off(i, -(env(t) + 8 + 3 * Math.sin(t * 8 + 1))));
  }
  const tips = [off(N - 1, 40, 1), off(at(0.88), 14), off(N - 1, 6), off(at(0.9), -12), off(at(0.97), -30)];
  tips[0].push(1); tips[2].push(1); tips[4].push(1);
  const mass = [...Lside, ...tips, ...Rside.reverse()];
  const locks = spec.map(([sp, w, end, ph, layer]) => {
    const pts = [];
    const last = Math.max(3, Math.round((N - 1) * Math.min(1, end)));
    const tip = Math.abs(sp) > 1 ? sp * 34 : sp > 0.45 ? clumpTip[0] : sp < -0.4 ? clumpTip[2] : clumpTip[1];
    for (let i = 0; i <= last; i += 2) {
      const t = i / (N - 1);
      const k = ss(0.62, 1, t);
      const o = (sp * env(t)) * (1 - k) + (tip + sp * 6) * k + 5 * Math.sin(t * 7 + ph) * t * (1 - k);
      pts.push([spine[i][0] + nrm[i][0] * o, spine[i][1] + nrm[i][1] * o]);
    }
    return { p: pts, w, cls: layer === 0 ? 'f-hair_sh' : 'f-hair', layer, fly: Math.abs(sp) > 1 };
  });
  return { locks, mass };
}

// ================================================================== GEAR (local drawings)
/** kunai pointing down (+y), ring at origin. length ~122*scale */
export function kunaiLocal(id, scale = 1) {
  const s = (p) => p.map(([x, y, k]) => (k ? [x * scale, y * scale, k] : [x * scale, y * scale]));
  const ring = `<circle cx="0" cy="0" r="${6 * scale}" class="ol" stroke-width="${3.4 * scale}"/><circle cx="0" cy="0" r="${6 * scale}" class="s-metal" stroke-width="${1.6 * scale}"/>`;
  const handle = fo(Pl(s([[-3.2, 5], [3.2, 5], [3.4, 40], [-3.4, 40]])), 'f-cloth', 1.4 * scale);
  const wraps = [10, 17, 24, 31].map((y) => band(s([[-3.6, y], [3.6, y + 4]]), 2.2 * scale, 'f-red', 0.8 * scale)).join('');
  const bladeD = S(s([[0, 38, 1], [9, 52], [6.5, 86], [0, 122, 1], [-6.5, 86], [-9, 52]]));
  const blade = shape(id + '-bl', bladeD, 'f-metal', {
    ol: 2.2 * scale,
    sh: [F(S(s([[0, 38, 1], [9, 52], [6.5, 86], [0, 122, 1], [0, 60]])), 'f-metal_sh'), tf(s([[-4, 56], [-2.5, 90], [0, 116]]), 1.6 * scale, 'f-metal_br')],
  });
  return ring + handle + wraps + blade;
}

// ------------------------------------------------------------------ hands
/** relaxed hanging hand in LOCAL coords: wrist at origin, fingers toward +y, thumb toward +x.
 *  Fingerless glove: glove covers the back of the hand and the first finger segment. */
function handOpenLocal(id, far) {
  const fingers = [
    { p: [[-12, 34], [-14, 44], [-13, 51], [-10, 55]], w: 8.4 },
    { p: [[-5, 37], [-6.4, 49], [-5.6, 58], [-2.6, 62]], w: 9.2 },
    { p: [[2.2, 38], [2.6, 52], [4, 62], [7, 67]], w: 9.4 },
    { p: [[9.6, 36], [11.8, 49], [14, 59], [16, 64]], w: 9 },
  ];
  const fing = fingers
    .map((fg, i) => {
      const [, p1, p2] = fg.p;
      const crease = [[p1[0] - fg.w * 0.42, p1[1] + 0.6], [p1[0] + fg.w * 0.42, p1[1] - 0.6]];
      const tip = [p2[0] + (p2[0] - p1[0]) * -0.12, p2[1] - 3.2];
      return shape(`${id}-f${i}`, T(fg.p, fg.w, 'finger'), 'f-skin', {
        ol: 1.8, far,
        sh: [
          tf(fg.p.map(([x, y]) => [x - fg.w * 0.36, y]), fg.w * 0.42, 'f-skin_sh', 'flat'),
          tf(crease, 0.9, 'f-skin_sh2', 'even'),
          F(E(tip[0] + 1, tip[1], fg.w * 0.16, 1.5), 'f-skin_hi'),
        ],
      });
    })
    .join('');
  // glove finger-hole cuffs over each finger root
  const cuffs = fingers.map((fg, i) => shape(`${id}-c${i}`, T([fg.p[0], [fg.p[0][0] + (fg.p[1][0] - fg.p[0][0]) * 0.45, fg.p[0][1] + 7]], fg.w + 2.2, 'flat'), 'f-cloth', { ol: 1.4, far })).join('');
  const thumb = shape(`${id}-t`, T([[14, 8], [21, 22], [24.5, 34], [24, 45]], 9.4, 'finger'), 'f-skin', {
    ol: 1.8, far, sh: [tf([[11, 8], [18, 22], [21.5, 34], [21, 45]], 4, 'f-skin_sh', 'flat'), F(E(25, 41, 2.2, 2.4), 'f-skin_hi')],
  });
  const glove = shape(`${id}-g`, S([[-16, -6], [15, -7], [19, 8], [20, 24], [17, 36], [9, 42], [-1, 44], [-10, 42], [-18, 33], [-19, 14]]), 'f-cloth', {
    ol: 2.8, far,
    sh: [
      F(S([[-24, -8], [-8, -8], [-10, 48], [-24, 48]]), 'f-cloth_sh'),
      tf([[11, -2], [15, 16], [13, 32]], 3.4, 'f-cloth_hi'),
      // knuckle ridge
      tf([[-14, 31], [-2, 33], [12, 30]], 2.4, 'f-cloth_mid'),
      tf([[-6, 4], [-4, 20]], 1.2, 'f-cloth_hi'), tf([[3, 2], [4, 20]], 1.2, 'f-cloth_hi'),
    ],
  });
  const thumbGlove = shape(`${id}-tg`, T([[12, 4], [18, 16], [21, 28]], 11.6, (t) => 1 - 0.2 * t), 'f-cloth', { ol: 2.2, far, sh: [tf([[18, 8], [21.5, 24]], 2.2, 'f-cloth_hi')] });
  return fing + thumb + glove + cuffs + thumbGlove;
}

/** closed hand (fist / grips) in LOCAL coords. variant: 'fist' | 'grip_sword' | 'grip_kunai'.
 *  Held items pass behind the hand along local +x at GRIP_LOCAL. */
const GRIP_LOCAL = [2, 44];
function handClosedLocal(id, far, variant) {
  const knuck = [-13, -5.5, 2, 9.5];
  const fing = knuck
    .map((x, i) => shape(`${id}-f${i}`, T([[x, 40], [x + 0.6, 50], [x + 1.4, 56 - (i === 0 ? 3 : 0)]], 8.8, 'finger'), 'f-skin', { ol: 1.8, far, sh: [tf([[x - 3, 40], [x - 2.6, 55]], 3.4, 'f-skin_sh', 'flat')] }))
    .join('');
  const glove = shape(`${id}-g`, S([[-17, -6], [15, -7], [20, 8], [22, 26], [20, 40], [12, 47], [-2, 49], [-13, 47], [-19, 38], [-20, 16]]), 'f-cloth', {
    ol: 2.8, far,
    sh: [
      F(S([[-24, -8], [-8, -8], [-10, 52], [-24, 52]]), 'f-cloth_sh'),
      tf([[11, -2], [15, 16], [14, 34]], 3.4, 'f-cloth_hi'),
      tf([[-15, 40], [-2, 44], [14, 40]], 2.4, 'f-cloth_mid'),
      tf([[-12, 10], [-10, 30]], 1.2, 'f-cloth_hi'), tf([[2, 6], [3, 30]], 1.2, 'f-cloth_hi'),
    ],
  });
  const tp = variant === 'fist' ? [[16, 12], [22, 26], [19, 40], [11, 48]] : variant === 'grip_kunai' ? [[16, 12], [22, 26], [22, 38], [17, 47]] : [[16, 12], [22, 26], [25, 37], [28, 46]];
  const thumb = shape(`${id}-t`, T(tp, 9.2, 'finger'), 'f-skin', { ol: 1.8, far, sh: [tf(tp.map(([x, y]) => [x - 3, y]), 3.6, 'f-skin_sh', 'flat')] });
  const thumbGlove = shape(`${id}-tg`, T([[13, 4], [19, 15], [22, 25]], 11.6, (t) => 1 - 0.2 * t), 'f-cloth', { ol: 2.2, far, sh: [tf([[19, 8], [22, 22]], 2.2, 'f-cloth_hi')] });
  return fing + glove + thumb + thumbGlove;
}

/** apply translate(tx,ty) rotate(deg) scale(k) to a local point */
const xf = ([x, y], tx, ty, deg, k) => {
  const r = (deg * Math.PI) / 180;
  return [+(tx + k * (x * Math.cos(r) - y * Math.sin(r))).toFixed(2), +(ty + k * (x * Math.sin(r) + y * Math.cos(r))).toFixed(2)];
};

/** all four swappable hands for one side; grip anchors are recorded in master coords */
function handSet(add, side, parent, pivot, [tx, ty, deg, k], far) {
  const tr = `translate(${tx},${ty}) rotate(${deg}) scale(${k})`;
  const grip = { point: xf(GRIP_LOCAL, tx, ty, deg, k), axisDeg: deg };
  const slot = `hand_${side}`;
  add(`hand_${side}_open`, parent, pivot, `<g transform="${tr}">${handOpenLocal(`h${side}o`, far)}</g>`, { slot, notes: 'swappable hand: open/relaxed' });
  for (const v of ['fist', 'grip_sword', 'grip_kunai']) {
    add(`hand_${side}_${v}`, parent, pivot, `<g transform="${tr}">${handClosedLocal(`h${side}${v}`, far, v)}</g>`, { slot, hidden: true, grip: v === 'fist' ? undefined : grip, notes: `swappable hand: ${v}` });
  }
}

/** side-on tabi boot (toe toward +x), drawn for the far ankle and shifted by (dx, dy) */
function profileFoot(id, dx, dy, far) {
  const m = (pts) => pts.map(([x, y, k]) => (k ? [x + dx, y + dy, k] : [x + dx, y + dy]));
  const footP = m([[540, 1222], [606, 1224], [618, 1246], [640, 1260], [662, 1270], [680, 1279], [689, 1290, 1], [682, 1299, 1], [650, 1302], [600, 1298], [570, 1295], [548, 1295, 1], [537, 1280], [536, 1248]]);
  return shape(id, S(footP), 'f-cloth', {
    ol: OL, far,
    sh: [
      F(S(m([[530, 1290], [570, 1292], [600, 1294], [650, 1297], [692, 1291], [694, 1312], [526, 1312]])), 'f-sole'),
      F(S(m([[532, 1236], [553, 1238], [558, 1264], [554, 1292], [532, 1292]])), 'f-leather'),
      tf(m([[556, 1240], [558, 1266], [554, 1290]]), 1.6, 'f-leather_hi'),
      fo(T(m([[590, 1222], [604, 1256], [614, 1294]]), 11, 'flat'), 'f-cloth_sh', 1.6),
      fo(T(m([[616, 1240], [628, 1268], [636, 1298]]), 10, 'flat'), 'f-cloth_sh', 1.6),
      tf(m([[640, 1268], [660, 1276], [680, 1286]]), 3, 'f-cloth_hi'),
      ink(m([[664, 1271], [668, 1283], [671, 1297]]), 2),
    ],
  });
}

// ================================================================== PARTS
export function buildParts() {
  const parts = [];
  const add = (id, parent, pivot, svg, extra = {}) => parts.push({ id, parent, pivot, svg, ...extra });

  // ---------------------------------------------------------------- SASH TAIL 2 (back-most, sweeping outward)
  {
    const c = [[618, 556], [646, 612], [670, 676], [708, 740], [734, 806], [766, 870], [778, 922], [796, 960]];
    const t2 = ribbon(c, (t) => (38 - 4 * t) * (1 + 0.12 * Math.sin(t * 13)) * twist(t, 0.84, 0.4, 0.025), { n: 7, depth: 42, seed: 31, wr: (t) => (38 - 4 * t) * (1 + 0.1 * Math.sin(t * 9 + 2)) * twist(t, 0.76, 0.35, 0.03) });
    const half = Math.floor(t2.left.length * 0.5);
    const t2art = (p) =>
      shape(p, Pl(t2.poly), 'f-red', {
        ol: OM, far: true,
        sh: [
          tf(t2.left.slice(0, half + 2).map(([x, y]) => [x + 4, y]), 11, 'f-red_sh', 'flat'),
          tf(t2.right.slice(half - 1).map(([x, y]) => [x - 6, y]), 16, 'f-red_sh', 'flat'),
          tf([[636, 596], [660, 660], [688, 726]], 5, 'f-red_hi'),
          tf([[716, 804], [740, 866], [760, 920]], 4, 'f-red_hi'),
          tf([[648, 640], [676, 706], [704, 770], [732, 840], [756, 904]], 1.6, 'f-red_sh'),
          tf([[640, 650], [664, 716], [698, 784], [726, 850], [756, 920]], 7, 'f-red_sh'),
        ],
      });
    const b2 = segBands([{ a: [600, 820], b: [800, 745], dir: [0.36, 0.93] }]);
    add('sash_tail_2b', 'sash_tail_2a', [698, 772], clipTo('st2b-clip', b2[1], t2art('st2b')), { notes: 'chain_segment: spring' });
    add('sash_tail_2a', 'sash_knot', [620, 560], clipTo('st2a-clip', b2[0], t2art('st2a')), { notes: 'chain_segment: spring' });
  }

  // ---------------------------------------------------------------- SKIRT BACK PANEL
  {
    const bottom = jag([522, 950], [300, 950], 17, 38, 7);
    const pts = [[462, 538], [500, 536], [538, 544], [542, 620], [536, 720], [528, 820], [522, 900], ...bottom, [306, 900], [328, 842], [368, 764], [408, 694], [436, 624], [452, 576]];
    add('skirt_back_panel', 'pelvis', [500, 545], shape('skb', S(pts), 'f-indigo', {
      ol: OM, far: true,
      sh: [
        F(S([[440, 528], [548, 528], [548, 590], [500, 606], [446, 596]]), 'f-indigo_sh'),
        tf([[505, 585], [478, 700], [438, 820], [396, 950]], 30, 'f-indigo_sh'),
        tf([[468, 610], [418, 726], [360, 846], [330, 950]], 20, 'f-indigo_sh'),
        tf([[488, 606], [454, 722], [410, 842], [372, 930]], 8, 'f-indigo_hi'),
        tf([[452, 630], [398, 748], [342, 870]], 5, 'f-indigo_hi'),
        ink([[497, 610], [466, 724], [424, 846]], 1.8),
        ink([[470, 640], [420, 760], [370, 880]], 1.6),
        tf([[350, 900], [362, 880], [372, 902]], 3, 'f-emb'), tf([[380, 914], [392, 890], [404, 906]], 2.6, 'f-emb'),
      ],
    }), { notes: 'cloth: secondary motion' });
  }

  // ---------------------------------------------------------------- FAR LEG (front leg, screen right)
  {
    add('foot_far', 'shin_boot_far', [574, 1246], profileFoot('ftf', 0, 0, true), { notes: 'tabi boot, split toe' });

    const shinP = [[530, 990], [592, 994], [594, 1030], [598, 1065], [597, 1095], [599, 1108], [604, 1112, 1], [602, 1130, 1], [598, 1134], [599, 1170], [601, 1210], [605, 1254], [540, 1256], [541, 1215], [544, 1172], [546, 1136], [538, 1131, 1], [537, 1113, 1], [543, 1108], [537, 1090], [528, 1060], [526, 1025]];
    add('shin_boot_far', 'thigh_far', [562, 1018], shape('shf', S(shinP), 'f-stock', {
      ol: OL, far: true, olD: Sseg(shinP, 12, 11),
      sh: [
        F(S([[524, 1044], [548, 1044], [552, 1070], [558, 1106], [528, 1106], [524, 1070]]), 'f-stock_sh'),
        tf([[590, 1005], [592, 1050], [590, 1100]], 8, 'f-stock_hi'),
        F(Pl([[520, 1107], [620, 1107], [620, 1270], [520, 1270]]), 'f-cloth'),
        F(S([[528, 1108], [556, 1112], [556, 1262], [528, 1262]]), 'f-cloth_sh'),
        tf([[536, 1112], [570, 1108], [604, 1112]], 3, 'f-cloth_hi'),
        ink([[538, 1132], [570, 1128], [603, 1132]], 2),
        tf([[586, 1140], [588, 1180], [590, 1240]], 3, 'f-cloth_hi'),
        ink([[548, 1222], [572, 1226], [600, 1220]], 1.8),
        band([[540, 1146], [606, 1166]], 4.6, 'f-red', 1.6), band([[540, 1168], [606, 1148]], 4.6, 'f-red', 1.6),
        band([[541, 1182], [606, 1202]], 4.6, 'f-red', 1.6), band([[541, 1204], [606, 1184]], 4.6, 'f-red', 1.6),
      ],
      top: [band([[541, 1160], [536, 1178], [536, 1194]], 3.6, 'f-red', 1.4, 'tail'), fo(Pl([[530, 1188], [543, 1188], [546, 1210], [528, 1210]]), 'f-red', 1.5), tf([[535, 1192], [535, 1206]], 1, 'f-red_sh')],
    }), { notes: 'stocking shin + boot shaft with red cord ties' });

    const thigh = [[530, 640], [576, 622], [622, 646], [624, 700], [620, 780], [610, 860], [600, 940], [597, 1000], [593, 1036], [564, 1050], [534, 1036], [523, 990], [521, 920], [523, 840], [527, 760], [529, 700]];
    const top = [[516, 783], [560, 791], [600, 793], [632, 787]];
    add('thigh_far', 'pelvis', [566, 664], shape('thf', S(thigh), 'f-skin', {
      ol: OL, far: true, olD: Sseg(thigh, 10, 8),
      sh: [
        F(S([[526, 650], [552, 650], [548, 720], [544, 790], [520, 790], [522, 700]]), 'f-skin_sh'),
        F(S([[524, 680], [580, 700], [630, 696], [630, 716], [580, 718], [524, 704]]), 'f-skin_sh'),
        tf([[606, 712], [604, 750], [600, 778]], 8, 'f-skin_hi'),
        F(S(top, false) + 'L640,1100L500,1100Z', 'f-stock'),
        F(S([[515, 790], [545, 794], [550, 900], [544, 1060], [515, 1060]]), 'f-stock_sh'),
        tf([[598, 812], [594, 900], [588, 990]], 12, 'f-stock_hi'),
        tf([[600, 830], [597, 890]], 3.5, 'f-stock_br'),
        tf(top.map(([x, y]) => [x, y + 6]), 9, 'f-stock_sh', 'flat'),
        ink(top, 2.2, 'even'),
        band([[514, 774], [560, 782], [600, 784], [634, 778]], 10, 'f-leather'),
      ],
      top: [fo(Pl([[594, 774], [609, 774], [609, 791], [594, 791]]), 'f-metal_sh', 2), fo(Pl([[598, 778], [605, 778], [605, 787], [598, 787]]), 'f-leather_sh', 1)],
    }), { notes: 'stocking + garter strap' });
  }

  // ---------------------------------------------------------------- SASH TAIL 1
  {
    const c = [[606, 552], [614, 620], [622, 690], [636, 760], [642, 830], [654, 900], [660, 960], [676, 1012]];
    const t1 = ribbon(c, (t) => (42 - 4 * t) * (1 + 0.1 * Math.sin(t * 11 + 1)) * twist(t, 0.82, 0.4, 0.025), { n: 7, depth: 48, seed: 12, wr: (t) => (42 - 4 * t) * (1 + 0.09 * Math.sin(t * 8)) * twist(t, 0.9, 0.35, 0.025) });
    const half = Math.floor(t1.left.length * 0.6);
    const t1art = (p) =>
      shape(p, Pl(t1.poly), 'f-red', {
        ol: OM,
        sh: [
          tf(t1.left.slice(0, half + 2).map(([x, y]) => [x + 5, y]), 12, 'f-red_sh', 'flat'),
          tf(t1.right.slice(half - 1).map(([x, y]) => [x - 7, y]), 18, 'f-red_sh', 'flat'),
          tf([[626, 588], [634, 660], [642, 736]], 6, 'f-red_hi'),
          tf([[652, 870], [656, 926], [660, 968]], 4, 'f-red_hi'),
          tf([[616, 600], [624, 680], [632, 760], [638, 840], [644, 920]], 1.6, 'f-red_sh'),
          tf([[612, 640], [620, 720], [630, 800], [640, 880], [650, 960]], 7, 'f-red_sh'),
          tf([[630, 700], [640, 780], [648, 860]], 2.6, 'f-red_hi'),
        ],
      });
    const b1 = segBands([{ a: [560, 790], b: [720, 770], dir: [0.12, 0.99] }]);
    add('sash_tail_1b', 'sash_tail_1a', [641, 782], clipTo('st1b-clip', b1[1], t1art('st1b')), { notes: 'chain_segment: spring' });
    add('sash_tail_1a', 'sash_knot', [610, 556], clipTo('st1a-clip', b1[0], t1art('st1a')), { notes: 'chain_segment: spring' });
  }

  // ---------------------------------------------------------------- FAR ARM (mostly hidden behind body)
  {
    add('upper_arm_far', 'torso_upper', [574, 396], shape('uaf', S([[556, 374], [584, 372], [602, 388], [608, 416], [614, 462], [621, 512], [621, 548], [598, 560], [586, 524], [575, 476], [563, 428], [553, 398]]), 'f-skin', {
      ol: OL, far: true,
      sh: [
        F(S([[548, 392], [563, 428], [575, 476], [586, 524], [598, 562], [608, 562], [600, 506], [588, 446], [572, 394]]), 'f-skin_sh'),
        tf([[604, 412], [588, 424], [570, 428]], 1.4, 'f-skin_sh2'),
        tf([[592, 380], [604, 398], [608, 420]], 4, 'f-skin_hi'),
        tf([[612, 470], [616, 506], [614, 536]], 3.4, 'f-skin_hi'),
      ],
    }));
    add('forearm_far', 'upper_arm_far', [602, 548], shape('faf', S([[582, 530], [626, 526], [640, 574], [652, 636], [662, 698], [648, 718], [624, 714], [612, 656], [596, 600]]), 'f-cloth', {
      ol: OL, far: true,
      sh: [
        F(S([[578, 530], [600, 532], [614, 600], [630, 716], [616, 716], [596, 600]]), 'f-cloth_sh'),
        tf([[630, 556], [642, 618], [652, 690]], 4.6, 'f-cloth_hi'),
        tf([[584, 542], [608, 539], [632, 536]], 2, 'f-cloth_hi'),
        band([[588, 564], [614, 567], [642, 560]], 4.8, 'f-red'),
        band([[611, 650], [633, 656], [656, 650]], 4.6, 'f-red'),
        band([[612, 662], [634, 668], [658, 662]], 4.6, 'f-red'),
        band([[613, 674], [636, 680], [659, 674]], 4.6, 'f-red'),
      ],
    }), { notes: 'fingerless glove, red cord wraps' });
    handSet(add, 'far', 'forearm_far', [643, 704], [643, 701, -14, 1.16], true);
  }

  // ---------------------------------------------------------------- SWORD + SHEATH (back mount)
  {
    const tr = 'translate(322,252) rotate(-25.7)';
    const diamonds = [14, 26, 38, 50, 62, 74]
      .map((y) => fo(Pl([[-7.5, y], [7.5, y + 11], [7.5, y + 15], [-7.5, y + 4]]), 'f-cloth_hi', 1) + fo(Pl([[7.5, y], [-7.5, y + 11], [-7.5, y + 15], [7.5, y + 4]]), 'f-cloth_hi', 1))
      .join('');
    const blade = shape('swb', Pl([[-6, 92], [6, 92], [6.5, 345], [0, 372], [-6, 352]]), 'f-metal_hi', {
      ol: 2.4,
      sh: [F(Pl([[-6, 92], [0, 92], [0, 372], [-6, 352]]), 'f-metal'), tf([[5, 100], [5.4, 340]], 1.6, 'f-metal_br', 'even'), tf([[1, 110], [3, 160], [1, 210], [3, 260], [1, 310], [2.5, 345]], 1.2, 'f-metal_br')],
    });
    const hilt =
      shape('swt', Pl([[-7.5, 6], [7.5, 6], [7.5, 88], [-7.5, 88]]), 'f-cloth', { ol: 3, sh: [diamonds, tf([[-4.5, 10], [-4.5, 84]], 2, 'f-cloth_rim', 'even')] }) +
      fo(S([[-9, -1], [9, -1], [10, 9, 1], [-10, 9, 1]]), 'f-metal_sh', 2.6) +
      fo(Pl([[-16, 86], [16, 86], [16, 94], [-16, 94]]), 'f-metal_sh', 2.6) +
      tf([[-14, 87.5], [14, 87.5]], 1.4, 'f-metal_hi', 'even');
    const tassel = band([[319, 258], [315, 282], [317, 300]], 3, 'f-red', 1.4) + fo(S([[311, 298, 1], [323, 298, 1], [328, 342, 1], [318, 338], [306, 342, 1]]), 'f-red', 1.8) + tf([[316, 302], [315, 336]], 1.4, 'f-red_sh');
    add('sword', 'sheath_back', [322, 252], `<g transform="${tr}">${blade}${hilt}</g>` + tassel, { grip: { point: xf([0, 72], 322, 252, -25.7, 1), axisDeg: 64.3 }, notes: 'chokuto; attach to *_grip_sword when drawn' });

    const sageo = [106, 122, 138].map((y) => band([[-10, y], [10, y + 12]], 3.4, 'f-red', 1.2) + band([[10, y], [-10, y + 12]], 3.4, 'f-red', 1.2)).join('');
    const saya =
      shape('sya', Pl([[-9.5, 94], [9.5, 94], [8.5, 362], [-8.5, 362]]), 'f-cloth_sh', {
        ol: OM,
        sh: [tf([[-4.5, 104], [-4, 350]], 2.6, 'f-cloth_rim', 'both'), tf([[4, 160], [4, 350]], 1.4, 'f-cloth_hi'), sageo],
      }) +
      fo(Pl([[-10.5, 92], [10.5, 92], [10.5, 103], [-10.5, 103]]), 'f-metal_sh', 2.4) +
      fo(S([[-9.5, 350], [9.5, 350], [9, 368, 1], [-9, 368, 1]]), 'f-metal_sh', 2.4) +
      fo(S([[9, 154], [15, 156], [15, 164], [9, 166]]), 'f-cloth', 1.6);
    add('sheath_back', 'torso_upper', [400, 410], `<g transform="${tr}">${saya}</g>`, { notes: 'sheath strapped to back' });
  }

  // ---------------------------------------------------------------- HAIR BACK + PONYTAIL
  {
    add('hair_back', 'head_base', [480, 280], hairGroup([
      { p: [[478, 206], [470, 250], [472, 300], [480, 344]], w: 24, cls: 'f-hair_sh' },
      { p: [[492, 210], [490, 260], [494, 310], [500, 350]], w: 16, cls: 'f-hair_sh' },
      { p: [[466, 214], [458, 262], [462, 312], [466, 340]], w: 14, cls: 'f-hair_sh' },
    ]), { notes: 'hair mass behind head/neck' });

    // Ponytail drawn whole, then sliced into 4 overlapping chain segments.
    const pony = ponyLocks();
    const locks = [
      ...pony.locks.filter((l) => !l.fly),
      { p: [[456, 184], [430, 208], [412, 262], [398, 330], [386, 400], [374, 460]], w: 6, cls: 'f-hair_hi' },
      { p: [[472, 181], [448, 192], [430, 236], [420, 296], [414, 356]], w: 5, cls: 'f-hair_hi' },
      { p: [[396, 300], [376, 370], [356, 442], [338, 500], [322, 552]], w: 5, cls: 'f-hair_hi' },
    ];
    const pSheen = [
      sheen([[478, 186], [456, 180], [434, 192], [418, 222]], 7),
      sheen([[468, 182], [448, 182], [432, 194]], 2.4, 'f-hair_br'),
      sheen([[414, 238], [402, 280], [392, 330]], 3.4),
      sheen([[424, 236], [410, 280]], 1.8, 'f-hair_br'),
      sheen([[384, 352], [376, 400], [368, 450]], 2.6),
      sheen([[402, 380], [396, 430], [394, 480]], 2),
      sheen([[352, 470], [340, 520], [332, 570]], 2.2),
    ];
    const massD = S(pony.mass);
    const thin = (l) => `<path d="${T(l.p, l.w, 'strand')}" class="${l.cls} olf" stroke-width="1"/>`;
    const art =
      hairGroup(pony.locks.filter((l) => l.fly)) +
      `<path d="${massD}" class="f-hair_sh ol" stroke-width="9.6" style="fill:none"/>` +
      `<path d="${massD}" class="f-hair_sh"/>` +
      locks.map(thin).join('') +
      pSheen.join('');
    const bands = segBands([
      { a: [330, 212], b: [500, 290], dir: [-0.41, 0.91] },
      { a: [300, 316], b: [470, 374], dir: [-0.32, 0.95] },
      { a: [260, 440], b: [440, 470], dir: [-0.18, 0.98] },
    ], 18);
    const piv = [[482, 200], [416, 254], [380, 344], [352, 455]];
    for (let i = 3; i >= 0; i--) {
      add(`pony_${i + 1}`, i === 0 ? 'head_base' : `pony_${i}`, piv[i], clipTo(`pony${i + 1}-clip`, bands[i], art), { notes: 'chain_segment: spring' });
    }
  }

  // ---------------------------------------------------------------- NEAR LEG (back leg, screen left)
  {
    const footP = [[312, 1224], [368, 1226], [372, 1252], [375, 1280], [373, 1302], [364, 1318], [347, 1321, 1], [341, 1306, 1], [335, 1321, 1], [314, 1320], [302, 1306], [301, 1282], [305, 1252]];
    add('foot_near', 'shin_boot_near', [340, 1240], shape('ftn', S(footP), 'f-cloth', {
      ol: OL,
      sh: [
        F(S([[296, 1307], [314, 1315], [335, 1315], [341, 1305], [347, 1315], [364, 1313], [378, 1300], [380, 1332], [296, 1332]]), 'f-sole'),
        F(S([[296, 1230], [318, 1232], [316, 1300], [296, 1300]]), 'f-cloth_sh'),
        fo(S([[298, 1252], [340, 1260], [378, 1252], [378, 1264], [340, 1274], [298, 1266]]), 'f-cloth_sh', 1.6),
        tf([[352, 1280], [364, 1286], [368, 1298]], 3, 'f-cloth_hi'),
        tf([[316, 1282], [322, 1298]], 2.4, 'f-cloth_hi'),
        ink([[341, 1282], [341, 1296], [341, 1305]], 2),
      ],
    }), { slot: 'foot_near', notes: 'tabi boot (toe toward camera): standing / stance poses' });
    // side-on variant for walking / running so both feet travel in the direction of motion
    add('foot_near_side', 'shin_boot_near', [340, 1240], profileFoot('fns', -233, 18, false), { slot: 'foot_near', rotKey: 'foot_near', hidden: true, notes: 'tabi boot side-on: walk / dash' });

    const shinP = [[372, 986], [428, 988], [427, 1008], [415, 1040], [399, 1074], [386, 1100], [388, 1110, 1], [385, 1132, 1], [376, 1138], [369, 1172], [365, 1206], [367, 1250], [312, 1252], [312, 1214], [315, 1172], [320, 1139], [315, 1133, 1], [317, 1110, 1], [336, 1106], [338, 1088], [341, 1058], [349, 1028], [361, 1000]];
    add('shin_boot_near', 'thigh_near', [396, 1016], shape('shn', S(shinP), 'f-stock', {
      ol: OL, olD: Sseg(shinP, 12, 11),
      sh: [
        F(S([[340, 1044], [370, 1044], [362, 1076], [354, 1106], [330, 1106], [336, 1070]]), 'f-stock_sh'),
        tf([[420, 1006], [404, 1056], [390, 1098]], 8, 'f-stock_hi'),
        tf([[421, 1012], [408, 1048]], 3, 'f-stock_br'),
        F(Pl([[290, 1107], [400, 1107], [400, 1270], [290, 1270]]), 'f-cloth'),
        F(S([[300, 1110], [334, 1114], [330, 1262], [300, 1262]]), 'f-cloth_sh'),
        tf([[318, 1112], [350, 1108], [386, 1112]], 3, 'f-cloth_hi'),
        ink([[318, 1134], [350, 1129], [385, 1133]], 2),
        tf([[354, 1140], [357, 1190], [354, 1240]], 3, 'f-cloth_hi'),
        ink([[318, 1222], [342, 1227], [366, 1220]], 1.8),
        band([[313, 1146], [380, 1166]], 4.6, 'f-red', 1.6), band([[313, 1168], [380, 1148]], 4.6, 'f-red', 1.6),
        band([[313, 1182], [372, 1200]], 4.6, 'f-red', 1.6), band([[313, 1202], [372, 1184]], 4.6, 'f-red', 1.6),
      ],
      top: [band([[314, 1158], [308, 1176], [305, 1190]], 3.6, 'f-red', 1.4, 'tail'), fo(Pl([[298, 1184], [311, 1184], [313, 1208], [294, 1208]]), 'f-red', 1.5), tf([[303, 1190], [303, 1204]], 1, 'f-red_sh')],
    }), { notes: 'stocking shin + boot shaft with red cord ties' });

    const thigh = [[452, 612], [498, 598], [538, 626], [537, 690], [524, 760], [506, 830], [484, 898], [458, 960], [434, 1008], [418, 1038], [396, 1048], [374, 1028], [379, 962], [391, 882], [404, 802], [420, 722], [437, 660]];
    const top = [[378, 788], [420, 800], [456, 816], [494, 838]];
    add('thigh_near', 'pelvis', [490, 656], shape('thn', S(thigh), 'f-skin', {
      ol: OL, olD: Sseg(thigh, 11, 9),
      sh: [
        F(S([[452, 612], [437, 660], [420, 722], [404, 802], [428, 802], [442, 730], [458, 662], [472, 614]]), 'f-skin_sh'),
        F(S([[446, 638], [500, 652], [544, 690], [544, 708], [500, 676], [446, 660]]), 'f-skin_sh'),
        tf([[520, 704], [510, 760], [494, 812]], 10, 'f-skin_hi'),
        F(S(top, false) + 'L560,850L560,1100L340,1100Z', 'f-stock'),
        F(S([[395, 816], [414, 822], [402, 900], [388, 1000], [384, 1050], [366, 1050], [380, 940]]), 'f-stock_sh'),
        tf([[476, 856], [456, 924], [436, 990]], 12, 'f-stock_hi'),
        tf([[480, 862], [462, 920]], 3.5, 'f-stock_br'),
        tf(top.map(([x, y]) => [x, y + 6]), 9, 'f-stock_sh', 'flat'),
        ink(top, 2.2, 'even'),
        band([[414, 702], [460, 710], [500, 714], [544, 712]], 13, 'f-leather'),
        band([[404, 754], [448, 763], [488, 768], [532, 764]], 13, 'f-leather'),
        tf([[420, 698], [500, 709], [540, 707]], 1.5, 'f-leather_hi'),
        tf([[410, 750], [488, 763], [530, 759]], 1.5, 'f-leather_hi'),
      ],
      top: [
        fo(Pl([[490, 703], [505, 704], [505, 723], [490, 722]]), 'f-metal_sh', 2), fo(Pl([[494, 708], [501, 708], [501, 718], [494, 718]]), 'f-leather_sh', 1),
        fo(Pl([[478, 758], [493, 760], [493, 779], [478, 777]]), 'f-metal_sh', 2), fo(Pl([[482, 763], [489, 764], [489, 773], [482, 772]]), 'f-leather_sh', 1),
      ],
    }), { notes: 'stocking + leather strap armor' });

    const kn = [418, 433, 448].map((x, i) => `<g transform="translate(${x},${688 + (i === 1 ? -3 : 0)})">${kunaiLocal('khk' + i, 0.92)}</g>`).join('');
    const holster =
      shape('khs', S([[402, 712, 1], [470, 710, 1], [472, 790], [454, 836, 1], [422, 830, 1], [404, 792]]), 'f-leather', {
        ol: OM,
        sh: [F(S([[400, 712], [416, 712], [418, 834], [400, 800]]), 'f-leather_sh'), tf([[468, 716], [468, 790]], 2, 'f-leather_hi', 'even'), tf([[426, 720], [426, 820]], 1.2, 'f-leather_sh', 'even'), tf([[441, 720], [441, 826]], 1.2, 'f-leather_sh', 'even')],
      }) +
      kn +
      band([[396, 734], [436, 738], [476, 738]], 11, 'f-leather', 2) +
      band([[398, 780], [436, 784], [474, 782]], 11, 'f-leather', 2) +
      fo(Pl([[443, 730], [455, 730], [455, 746], [443, 746]]), 'f-metal_sh', 1.8) +
      `<circle cx="437" cy="846" r="5" class="ol" stroke-width="2.6"/><circle cx="437" cy="846" r="5" class="s-metal" stroke-width="1.2"/>`;
    add('kunai_holster_thigh', 'thigh_near', [436, 740], holster, { notes: '3 kunai in holster' });
  }

  // ---------------------------------------------------------------- WAIST / PELVIS
  add('waist', 'pelvis', [524, 548], shape('wst', S([[462, 470], [580, 470], [586, 492], [592, 520], [596, 542], [460, 547], [456, 510]]), 'f-skin', {
    ol: OL,
    sh: [
      F(S([[452, 470], [504, 470], [498, 548], [452, 548]]), 'f-skin_sh'),
      tf([[564, 500], [571, 512], [574, 524]], 1.5, 'f-skin_sh2'),
      tf([[578, 498], [586, 516]], 4, 'f-skin_hi'),
    ],
  }), { notes: 'midriff' });

  add('pelvis', null, [524, 600], shape('pel', S([[452, 520], [530, 514], [596, 518], [610, 548], [618, 595], [622, 645], [626, 694], [600, 704], [570, 707], [548, 701], [530, 690], [505, 670], [480, 656], [457, 646], [449, 610], [446, 566]]), 'f-cloth', {
    ol: OL,
    sh: [
      F(S([[440, 520], [492, 522], [490, 600], [500, 660], [446, 660]]), 'f-cloth_sh'),
      tf([[600, 560], [612, 620], [616, 680]], 4, 'f-cloth_hi'),
      tf([[458, 640], [500, 660], [530, 690]], 6, 'f-cloth_sh', 'flat'),
      tf([[550, 696], [590, 700], [626, 690]], 6, 'f-cloth_sh', 'flat'),
      band([[440, 559], [500, 566], [560, 575], [620, 586]], 13, 'f-leather'),
      tf([[446, 556], [520, 565], [612, 580]], 1.6, 'f-leather_hi'),
    ],
    top: [fo(S([[466, 566], [476, 566], [476, 580], [466, 580]]), 'f-metal_sh', 1.8)],
  }), { notes: 'ROOT. shorts + hips + belt' });

  // ---------------------------------------------------------------- HIP GEAR
  {
    const pouch =
      shape('pch', S([[456, 568, 1], [494, 570, 1], [497, 612], [490, 620, 1], [460, 620, 1], [453, 612]]), 'f-leather', {
        ol: OM,
        sh: [
          F(S([[450, 566], [470, 566], [466, 624], [450, 624]]), 'f-leather_sh'),
          fo(S([[452, 566, 1], [498, 568, 1], [498, 590], [476, 596], [452, 590]]), 'f-leather', 1.8),
          tf([[458, 588], [476, 593], [494, 588]], 1.2, 'f-leather_hi'),
          tf([[490, 574], [492, 610]], 1.6, 'f-leather_hi', 'even'),
        ],
        top: [fo(Pl([[472, 586], [481, 586], [481, 598], [472, 598]]), 'f-metal_sh', 1.6)],
      });
    add('pouch_hip', 'pelvis', [475, 570], pouch, { notes: 'utility pouch' });
    const bomb = (cx, cy, r, id) =>
      band([[cx, cy - r - 12], [cx, cy - r]], 2.4, 'f-leather', 1) +
      shape(id, E(cx, cy, r, r), 'f-cloth_sh', { ol: 2.8, sh: [F(E(cx + r * 0.25, cy + r * 0.3, r * 0.8, r * 0.75), 'f-cloth_sh'), F(E(cx - r * 0.35, cy - r * 0.35, r * 0.32, r * 0.25, -30), 'f-cloth_rim')] }) +
      fo(Pl([[cx - 4, cy - r - 3], [cx + 4, cy - r - 3], [cx + 4, cy - r + 2], [cx - 4, cy - r + 2]]), 'f-red', 1.2);
    add('smoke_bomb_cluster', 'pelvis', [446, 580], bomb(441, 604, 10, 'sb1') + bomb(455, 612, 9, 'sb2'), { notes: 'smoke bombs on belt' });
  }

  // ---------------------------------------------------------------- NECK / TORSO
  add('neck', 'torso_upper', [512, 366], shape('nck', S([[488, 284], [526, 298], [536, 320], [541, 344], [522, 362], [484, 360], [478, 322]]), 'f-skin', {
    ol: OM,
    sh: [
      F(S([[484, 284], [528, 298], [538, 324], [530, 333], [514, 321], [498, 313], [482, 313]]), 'f-skin_sh'),
      F(S([[476, 300], [494, 300], [496, 362], [476, 362]]), 'f-skin_sh'),
      tf([[531, 334], [537, 346]], 2.4, 'f-skin_hi'),
    ],
  }));

  add('torso_upper', 'waist', [522, 500], (() => {
    const shoulderN = shape('shN', S([[484, 356], [466, 356], [444, 355], [424, 361], [411, 378], [409, 404], [419, 432], [438, 452], [458, 464], [470, 440], [480, 405], [486, 376]]), 'f-skin', {
      ol: OL,
      sh: [
        F(S([[424, 361], [446, 357], [438, 380], [430, 420], [440, 452], [418, 432], [409, 404]]), 'f-skin_sh'),
        F(S([[450, 426], [470, 420], [468, 452], [458, 464], [444, 452]]), 'f-skin_sh'),
        tf([[452, 364], [470, 364], [482, 374]], 5, 'f-skin_hi'),
      ],
    });
    // fitted top: the upper chest slopes smoothly from the collar base into the bust
    const topP = [[478, 354], [504, 362], [532, 368], [552, 372], [562, 382], [575, 396], [593, 411], [608, 428], [616, 446], [614, 463], [604, 477], [591, 485], [584, 494], [581, 503], [545, 505], [500, 505], [460, 502], [454, 482], [455, 462], [468, 436], [478, 404], [482, 376]];
    const top = shape('top', S(topP), 'f-cloth', {
      ol: OL,
      sh: [
        F(S([[450, 440], [470, 420], [484, 380], [502, 388], [500, 430], [494, 480], [492, 510], [450, 510]]), 'f-cloth_sh'),
        // near breast: soft lit mass + lower contour; far breast: rim-lit upper curve, shadowed underside
        F(T([[526, 446], [532, 428], [548, 415], [568, 412], [586, 420]], 13, 'both'), 'f-cloth_mid'),
        tf([[536, 424], [552, 415], [572, 416]], 3.4, 'f-cloth_hi'),
        tf([[579, 399], [599, 414], [612, 436], [615, 452]], 6, 'f-cloth_hi'),
        tf([[590, 405], [606, 425]], 2, 'f-cloth_rim'),
        F(S([[526, 462], [548, 474], [574, 480], [598, 478], [615, 462], [611, 482], [594, 494], [530, 508]]), 'f-cloth_sh'),
        tf([[518, 450], [540, 472], [572, 481], [598, 478]], 2.2, 'f-cloth_sh'),
        tf([[552, 376], [566, 420], [578, 464], [580, 500]], 1.4, 'f-cloth_hi'),
        tf([[520, 372], [532, 410], [540, 456], [544, 500]], 1.2, 'f-cloth_hi'),
        tf([[486, 376], [516, 382], [548, 383]], 6, 'f-cloth_sh'),
        tf([[462, 492], [520, 494], [580, 492]], 5, 'f-cloth_sh', 'flat'),
      ],
    });
    const strap =
      band([[480, 354], [462, 356], [440, 363], [420, 374]], 9, 'f-leather', 2) +
      band([[478, 354], [489, 380], [497, 410], [503, 452], [507, 502]], 10, 'f-leather', 2) +
      tf([[482, 362], [491, 386], [499, 420]], 1.4, 'f-leather_hi') +
      fo(Pl([[496, 440], [510, 440], [510, 452], [496, 452]]), 'f-metal_sh', 1.6) +
      `<path d="${E(497, 410, 7, 8)}" class="ol" stroke-width="4.4"/><path d="${E(497, 410, 7, 8)}" class="s-metal_hi" stroke-width="2"/>`;
    // turtleneck: narrow cylinder leaning forward with the neck; top sits just below the chin
    const colP = [[474, 324], [492, 320], [512, 323], [528, 331], [538, 340], [546, 356], [552, 372], [530, 380], [500, 380], [478, 376], [472, 350]];
    const collar = shape('col', S(colP), 'f-cloth', {
      ol: OL, olD: Sseg(colP, 9, 6),
      sh: [
        F(S([[474, 324], [492, 320], [512, 323], [528, 331], [538, 340], [526, 338], [508, 332], [490, 329], [476, 332]]), 'f-cloth_sh'),
        F(S([[466, 320], [488, 326], [488, 384], [466, 384]]), 'f-cloth_sh'),
        tf([[478, 344], [502, 343], [526, 347], [542, 354]], 2, 'f-cloth_hi'),
        tf([[480, 360], [506, 362], [532, 366], [548, 368]], 1.8, 'f-cloth_sh'),
        tf([[536, 341], [544, 355], [550, 371]], 2.4, 'f-cloth_rim'),
      ],
    });
    const knot =
      [[-3.6, -3], [3.6, -3], [-3.6, 3.8], [3.6, 3.8]].map(([dx, dy]) => `<circle cx="${541 + dx}" cy="${362 + dy}" r="3.4" class="f-red olf" stroke-width="1.2"/>`).join('') +
      `<circle cx="541" cy="362.4" r="2.4" class="f-red_hi olf" stroke-width="1"/>` +
      band([[539, 367], [536, 377], [534, 386]], 2.6, 'f-red', 1, 'tail') + band([[543, 367], [545, 377], [548, 386]], 2.6, 'f-red', 1, 'tail');
    return shoulderN + top + strap + collar + knot;
  })(), { notes: 'sleeveless high-collar top, harness strap, red knot' });

  // ---------------------------------------------------------------- HEAD
  add('strand_far', 'head_base', [566, 236], hairGroup([
    { p: [[556, 224], [576, 256], [584, 296], [580, 336], [570, 376]], w: 12 },
    { p: [[560, 238], [574, 278], [576, 316]], w: 6, cls: 'f-hair_sh' },
    { p: [[566, 236], [584, 270], [590, 308], [586, 344]], w: 5 },
  ], sheen([[573, 262], [579, 296], [577, 326]], 1.8), 4.4), { notes: 'loose strand beyond the face (spring)' });

  add('head_base', 'neck', [512, 326], (() => {
    const headP = [[476, 216], [498, 196], [528, 190], [552, 202], [561, 228], [561, 254], [562.5, 265], [559.5, 276], [561, 285], [565, 293], [566.6, 297.6, 1], [561, 301.6], [557.6, 304], [557.8, 307.6], [554.2, 310.8], [554, 312.6], [555.2, 315], [553.2, 319.6], [551.6, 324.6], [547, 330.6], [539, 333.4], [527, 327], [512, 313], [500, 302], [486, 300], [474, 276], [471, 245]];
    const head = shape('hed', S(headP), 'f-skin', {
      ol: 2.8,
      sh: [
        F(S([[536, 226], [564, 230], [564, 258], [552, 258], [540, 250]]), 'f-skin_sh'),
        F(S([[470, 250], [506, 250], [516, 292], [512, 312], [494, 304], [470, 292]]), 'f-skin_sh'),
        F(S([[500, 302], [512, 313], [527, 327], [539, 333.4], [547, 330.6], [540, 338], [520, 334], [496, 314]]), 'f-skin_sh'),
        F(S([[557.6, 301.6], [564.6, 298], [566.6, 297.6], [561, 303.6]]), 'f-skin_sh'),
        tf([[536, 294], [546, 296.6]], 2, 'f-blush'),
        tf([[553, 306.4], [556.6, 308.2]], 1.4, 'f-skin_sh'),
        F(S([[549.6, 313.4], [554, 313.6], [553.2, 316], [550.2, 315.6]]), 'f-lip'),
      ],
    });
    const ear = shape('ear', S([[490, 261], [499, 261], [504, 270], [503, 282], [498, 292], [490, 295], [485, 286], [484, 272]]), 'f-skin', {
      ol: 2.4,
      sh: [F(S([[484, 262], [492, 262], [490, 294], [484, 290]]), 'f-skin_sh'), tf([[495, 268], [499, 276], [497, 285]], 2.2, 'f-skin_sh2'), tf([[490, 266], [497, 265], [500, 270]], 1.6, 'f-skin_sh2')],
      top: [C(493, 298, 1.9, 'f-metal_hi')],
    });
    return head + ear;
  })(), { notes: 'skull, face skin, ear (no features)' });

  // ---------------------------------------------------------------- FACE LAYERS (swappable)
  const lid = (t) => Math.min(1, 0.5 + t * 2.2) * (1 - t * 0.5);
  const browP = (t) => Math.min(1, 0.3 + t * 1.3) * Math.min(1, (1 - t) * 5);
  const eyeBase = (id, white, ic, irx, iry, pr) => {
    const iris = shape(`irs${id}`, E(ic[0], ic[1], irx, iry), 'f-iris', {
      ol: 0,
      sh: [
        F(S([[ic[0] - 7, ic[1] - 9], [ic[0] + 7, ic[1] - 9], [ic[0] + 7, ic[1] - 3], [ic[0], ic[1] - 3.8], [ic[0] - 7, ic[1] - 2.4]]), 'f-iris_dk'),
        F(E(ic[0] + 0.4, ic[1] + 0.6, pr[0], pr[1]), 'f-iris_dk'),
        tf([[ic[0] - 3.3, ic[1] + 4], [ic[0], ic[1] + 5.6], [ic[0] + 3.6, ic[1] + 4]], 1.6, 'f-iris_hi'),
        `<path d="${E(ic[0], ic[1], irx, iry)}" class="s-iris_dk" stroke-width="0.9"/>`,
      ],
    });
    return shape(`ey${id}`, S(white), 'f-sclera', { ol: 0, sh: [iris, tf([[white[0][0], white[0][1] - 0.2], [ic[0], 271], [white[4][0], white[4][1]]], 2.4, 'f-skin_sh')] });
  };

  add('face_neutral', 'head_base', [545, 280], (() =>
    eyeBase('N', [[530.5, 274.4], [536.6, 271], [544, 269.6], [551, 270.2], [556, 273.6], [553.6, 277.8], [547, 280], [539, 280], [533.6, 277.6]], [547.2, 275.4], 5, 6.2, [2, 3]) +
    C(545, 272.6, 1.45, 'f-sclera') + C(549.8, 278, 0.65, 'f-sclera') +
    ink([[525.6, 277.4], [530.6, 272.6], [537, 269.8], [544.4, 268.4], [551.4, 269.2], [556.8, 273.6]], 4.2, lid) +
    ink([[529.6, 275.6], [525, 274.6], [521.8, 272.2]], 2.2, 'tail') +
    ink([[532.4, 272.6], [529.6, 270.2]], 1.1, 'tail') +
    ink([[534, 278], [541, 280.4], [548, 280.4], [553.6, 278]], 1.1) +
    ink([[535.4, 267.2], [543.4, 265.6], [551.4, 266.6]], 0.85) +
    ink([[529.4, 263.6], [538, 262.2], [548, 262.6], [556, 264.6], [561.6, 267.8]], 3.3, browP) +
    ink([[545.6, 312], [549.6, 312.2], [553.6, 311.6]], 1.15) +
    ink([[557.8, 300.8], [559.8, 302.4]], 0.9)
  )(), { slot: 'face', notes: 'swappable expression' });

  add('face_intense', 'head_base', [545, 280], (() =>
    eyeBase('I', [[531, 275], [537, 273], [544, 272], [551, 272.4], [555.8, 274.6], [553.4, 277], [547, 278.4], [539, 278.4], [534, 276.8]], [548, 275.6], 4, 5, [1.2, 2.2]) +
    C(546.4, 274.2, 1.1, 'f-sclera') +
    ink([[526.5, 277.2], [531, 273.6], [537, 271.6], [544, 270.6], [551, 271.2], [556.4, 274]], 4, lid) +
    ink([[530, 275.6], [525.5, 274.4], [522.4, 271.8]], 2.1, 'tail') +
    ink([[533, 278], [539, 280], [547, 280.2], [552.6, 278]], 1.2) +
    ink([[529.5, 260.4], [539, 262.4], [549, 265.2], [561.5, 270.4]], 3.4, browP) +
    ink([[552, 262.6], [555.4, 266.8]], 1) +
    shape('mthI', S([[545, 309.6], [554, 308.8], [556, 313], [552, 318.6], [546.4, 316.6]]), 'f-ink', { ol: 0, sh: [F(S([[545, 309], [555, 308.2], [555, 311], [545, 311.4]]), 'f-sclera'), F(E(551, 318, 4, 2.4), 'f-lip')] })
  )(), { slot: 'face', notes: 'attack / shout', hidden: true });

  add('face_hurt', 'head_base', [545, 280], (() =>
    ink([[528.6, 274.4], [536, 277.4], [545, 278.4], [554.4, 275.2]], 3, (t) => Math.min(1, 0.6 + t)) +
    ink([[532, 280.6], [540, 281.2], [547, 280.8]], 1.1) +
    ink([[551, 270.8], [555, 268.4]], 1.1) + ink([[551.6, 273.8], [556.6, 272.8]], 1.1) +
    ink([[530, 264.4], [540, 263.4], [550, 260.8], [560, 256.8]], 2.8, browP) +
    shape('mthH', S([[545, 310], [553.5, 309.4], [554, 313.4], [545.5, 313.2]]), 'f-sclera', { ol: 1.4, sh: [ink([[545, 311.5], [554, 311.3]], 0.8)] })
  )(), { slot: 'face', notes: 'hit reaction', hidden: true });

  // ---------------------------------------------------------------- HAIR FRONT (scalp + bangs + ribbon)
  add('hair_front', 'head_base', [520, 230], (() => {
    const capP = [[466, 214], [475, 194], [496, 182], [523, 178], [548, 186], [562, 202], [566, 220], [556, 233], [536, 237], [518, 243], [505, 254], [492, 261], [485, 271], [483, 292], [481, 312], [468, 307], [461, 280], [459, 244]];
    const capD = S(capP);
    // anime "broken" crown shine: short ticks along an arc
    const arc = sample([[486, 199], [506, 189], [530, 187], [552, 196]], false, 4);
    const ticks = arc.filter((_, i) => i % 2 === 0).map(([x, y], i) => tf([[x, y - 3.5 - (i % 2) * 1.5], [x + 1.2, y + 4 + (i % 3)]], 2.2, 'f-hair_hi')).join('');
    const cap = shape('cap', capD, 'f-hair', {
      ol: 5, olD: Sseg(capP, 10, 6),
      sh: [
        F(S([[456, 230], [480, 236], [486, 270], [486, 316], [456, 316]]), 'f-hair_sh'),
        tf([[484, 304], [480, 264], [480, 226], [484, 204]], 1.6, 'f-hair_sh'),
        tf([[492, 262], [488, 232], [488, 206]], 1.4, 'f-hair_sh'),
        tf([[476, 302], [470, 262], [472, 224], [480, 204]], 1.4, 'f-hair_hi'),
        tf([[468, 290], [464, 256], [468, 222], [478, 204]], 1.2, 'f-hair_sh'),
        tf([[500, 254], [496, 228], [490, 206]], 1.2, 'f-hair_hi'),
        F(T([[486, 198], [508, 188], [532, 186], [554, 196]], 7, 'both'), 'f-hair_hi'),
        ticks,
        F(T([[498, 191], [516, 186], [534, 188]], 2.4, 'both'), 'f-hair_br'),
      ],
    });
    // bangs: overlapping locks (full width at the root so they read as one mass), sweeping forward
    const bang = (t) => (t < 0.15 ? 0.55 + 3 * t : Math.pow((1 - t) / 0.85, 0.85));
    const bl = [
      { p: [[504, 214], [512, 244], [519, 276], [521, 304], [517, 332]], w: 15 },
      { p: [[514, 208], [530, 228], [541, 248], [545, 264]], w: 19 },
      { p: [[524, 204], [543, 220], [556, 242], [560, 262], [561, 276]], w: 19 },
      { p: [[534, 202], [556, 214], [572, 236], [578, 262], [576, 288]], w: 19, cls: 'f-hair_sh' },
      { p: [[542, 200], [568, 208], [588, 228], [596, 256], [592, 284], [584, 304]], w: 19 },
      { p: [[530, 204], [550, 218], [562, 240], [566, 258]], w: 9 },
      { p: [[554, 202], [582, 215], [600, 238], [604, 262]], w: 6 },
    ];
    const bd = (l) => T(l.p, l.w, bang);
    const shine = bl.slice(0, 5).map((l) => {
      const q = sample(l.p, false, 8);
      const i = Math.floor(q.length * 0.16);
      return tf([q[i], q[i + 4], q[i + 9]], l.w * 0.18, 'f-hair_hi');
    }).join('');
    const bangs =
      bl.map((l) => `<path d="${bd(l)}" class="f-ink olf" stroke-width="4.4"/>`).join('') +
      bl.map((l) => `<path d="${bd(l)}" class="${l.cls || 'f-hair'} olf" stroke-width="0.9"/>`).join('') +
      shine +
      sheen([[552, 200], [574, 214], [588, 240]], 1.8, 'f-hair_br') +
      tf([[510, 222], [516, 254], [519, 284]], 1.4, 'f-hair_hi') +
      tf([[534, 214], [546, 238], [552, 258]], 1.1, 'f-hair_sh') + tf([[548, 210], [564, 234], [570, 262]], 1.1, 'f-hair_sh');
    // ribbon: thin wrap band + small loop + long tail along the ponytail
    const rib =
      band([[476, 214], [468, 236], [462, 260], [457, 284], [455, 304]], 7, 'f-red', 1.6, (t) => 1 - 0.2 * t) +
      tf([[472, 226], [465, 250], [459, 276]], 1.8, 'f-red_sh') +
      fo(Pl([[450, 302], [459, 302], [461, 314, 1], [455.5, 309], [449, 315, 1]]), 'f-red', 1.4) +
      fo(S([[486, 192], [494, 178], [503, 177], [503, 186], [492, 196]]), 'f-red', 1.8) +
      tf([[492, 188], [499, 180]], 1.6, 'f-red_hi') +
      fo(S([[466, 204, 1], [480, 188, 1], [494, 195, 1], [480, 214, 1]]), 'f-red', 1.8) +
      ink([[471, 205], [484, 194]], 1.1) + ink([[475, 210], [489, 198]], 1.1) +
      tf([[470, 200], [481, 190]], 1.6, 'f-red_hi');
    return cap + bangs + rib;
  })(), { notes: 'scalp, bangs, red ribbon' });

  // ---------------------------------------------------------------- FRONT CLOTH
  {
    const bottom = jag([576, 930], [478, 924], 9, 42, 11);
    const pts = [[505, 546], [560, 548], [613, 550], [612, 600], [600, 650], [583, 700], [574, 760], [568, 820], [572, 880], ...bottom, [490, 880], [508, 830], [522, 770], [527, 700], [520, 640], [507, 594]];
    const emb = [
      tf([[512, 872], [520, 850], [530, 872]], 3, 'f-emb'), tf([[536, 882], [540, 858], [554, 846]], 3, 'f-emb'),
      tf([[528, 892], [534, 906], [528, 920]], 2.6, 'f-emb'), tf([[548, 898], [556, 880], [566, 874]], 2.4, 'f-emb'),
      tf([[506, 896], [510, 912]], 2.2, 'f-emb'), tf([[552, 836], [560, 822]], 2, 'f-emb'),
    ].join('');
    add('skirt_front_panel', 'pelvis', [560, 552], shape('skf', S(pts), 'f-indigo', {
      ol: OM,
      sh: [
        F(S([[500, 546], [616, 546], [612, 590], [560, 600], [502, 592]]), 'f-indigo_sh'),
        tf([[586, 590], [566, 680], [552, 780], [548, 880], [552, 950]], 22, 'f-indigo_sh'),
        tf([[520, 620], [516, 720], [506, 820], [494, 920]], 14, 'f-indigo_sh'),
        tf([[600, 600], [584, 680], [576, 760]], 5, 'f-indigo_hi'),
        tf([[540, 610], [534, 720], [528, 830], [522, 920]], 6, 'f-indigo_hi'),
        tf([[598, 610], [588, 660]], 1.8, 'f-indigo_br'),
        ink([[566, 612], [552, 720], [546, 820], [544, 900]], 1.6),
        emb,
      ],
    }), { notes: 'cloth: secondary motion' });
  }

  // ---------------------------------------------------------------- SASH (band + bow)
  add('sash_knot', 'pelvis', [610, 532], (() => {
    const bandS = shape('sbd', S([[452, 512], [520, 508], [592, 507], [605, 514], [609, 534], [604, 552], [530, 556], [460, 548], [450, 530]]), 'f-red', {
      ol: OL,
      sh: [
        F(S([[446, 540], [530, 546], [612, 540], [612, 562], [446, 562]]), 'f-red_sh'),
        F(S([[446, 506], [476, 506], [472, 562], [446, 562]]), 'f-red_sh'),
        tf([[470, 513], [540, 511], [598, 512]], 3.4, 'f-red_hi'),
        tf([[490, 514], [504, 532], [516, 552]], 2.6, 'f-red_sh'),
        tf([[530, 511], [548, 530], [560, 554]], 2.8, 'f-red_sh'),
        tf([[568, 510], [584, 528], [592, 550]], 2.4, 'f-red_sh'),
        tf([[506, 513], [524, 534], [536, 554]], 2.2, 'f-red_hi'),
        tf([[548, 512], [566, 532], [578, 552]], 2, 'f-red_hi'),
      ],
    });
    const loopUp = shape('slu', S([[614, 522], [628, 506], [644, 503], [648, 514], [636, 526], [622, 532]]), 'f-red', {
      ol: OM,
      sh: [F(S([[612, 528], [636, 524], [652, 512], [654, 536], [612, 540]]), 'f-red_sh'), tf([[628, 510], [642, 506]], 2.4, 'f-red_hi')],
      top: [ink([[630, 516], [640, 511]], 1.6)],
    });
    const core = shape('skn', S([[596, 506, 1], [616, 502], [628, 510, 1], [626, 532], [630, 556, 1], [612, 564], [596, 560, 1], [600, 534]]), 'f-red', {
      ol: OM,
      sh: [
        F(S([[590, 500], [604, 504], [606, 566], [590, 566]]), 'f-red_sh'),
        tf([[614, 506], [618, 532], [620, 558]], 3.6, 'f-red_hi'),
        ink([[606, 508], [608, 534], [606, 560]], 1.3),
        ink([[621, 510], [618, 532], [624, 556]], 1.1),
        tf([[598, 532], [626, 534]], 3, 'f-red_sh'),
      ],
    });
    return bandS + loopUp + core;
  })(), { notes: 'sash band + bow knot' });

  // ---------------------------------------------------------------- NEAR ARM (front-most)
  // deltoid cap bulges past the arm, then biceps/triceps taper to a narrower elbow
  const uaP = [[428, 351], [450, 354], [464, 368], [467, 388], [460, 408], [455, 424], [452, 448], [446, 474], [438, 500], [431, 524], [424, 543], [408, 549], [396, 535], [395, 506], [397, 476], [401, 448], [403, 424], [400, 402], [404, 380], [413, 361]];
  add('upper_arm_near', 'torso_upper', [438, 386], shape('uan', S(uaP), 'f-skin', {
    ol: OL,
    sh: [
      // triceps / back plane
      F(S([[396, 360], [413, 361], [410, 392], [412, 424], [418, 452], [420, 490], [414, 530], [410, 552], [390, 552], [392, 480], [396, 420]]), 'f-skin_sh'),
      // shadow under the deltoid (insertion) sweeping back
      F(T([[462, 404], [446, 416], [428, 424], [410, 426]], 9, (t) => Math.sin(Math.PI * t) ** 0.7), 'f-skin_sh'),
      tf([[460, 406], [440, 419], [416, 425]], 1.3, 'f-skin_sh2'),
      // armpit hollow at the front
      F(S([[466, 392], [458, 418], [454, 444], [448, 436], [454, 404]]), 'f-skin_sh'),
      // deltoid highlight
      F(T([[422, 360], [442, 357], [458, 366], [463, 384]], 7, 'both'), 'f-skin_hi'),
      // biceps light + biceps/triceps split
      tf([[449, 440], [445, 468], [437, 498], [430, 520]], 4.4, 'f-skin_hi'),
      tf([[422, 446], [420, 476], [416, 506]], 1.2, 'f-skin_sh2'),
      tf([[406, 528], [414, 538]], 1.2, 'f-skin_sh2'),
    ],
  }), { notes: 'shoulder joint' });

  add('forearm_near', 'upper_arm_near', [413, 528], shape('fan', S([[378, 522], [432, 520], [432, 546], [427, 585], [423, 625], [418, 665], [412, 700], [406, 716], [385, 717], [380, 700], [376, 662], [374, 622], [374, 582], [376, 546]]), 'f-cloth', {
    ol: OL,
    sh: [
      F(S([[372, 520], [392, 520], [390, 600], [394, 680], [392, 722], [372, 722]]), 'f-cloth_sh'),
      tf([[422, 560], [419, 620], [413, 690]], 5, 'f-cloth_hi'),
      tf([[375, 560], [375, 640], [381, 700]], 2.2, 'f-cloth_rim'),
      tf([[376, 532], [404, 528], [432, 530]], 2, 'f-cloth_hi'),
      ink([[376, 544], [404, 547], [432, 543]], 1.8),
      band([[373, 556], [404, 561], [433, 556]], 4.8, 'f-red'),
      band([[374, 565], [404, 570], [431, 565]], 4.8, 'f-red'),
      band([[381, 585], [420, 613]], 2.6, 'f-red', 1), band([[421, 585], [381, 613]], 2.6, 'f-red', 1),
      band([[381, 612], [418, 638]], 2.6, 'f-red', 1), band([[419, 612], [381, 638]], 2.6, 'f-red', 1),
      band([[377, 652], [400, 657], [423, 652]], 4.6, 'f-red'),
      band([[378, 663], [400, 668], [421, 663]], 4.6, 'f-red'),
      band([[379, 674], [400, 679], [419, 674]], 4.6, 'f-red'),
    ],
    top: [fo(S([[377, 664], [371, 672], [373, 686], [379, 680]]), 'f-red', 1.4)],
  }), { notes: 'fingerless glove, red cord lacing' });

  handSet(add, 'near', 'forearm_near', [395, 702], [395, 699, 4, 1.13], false);

  // held kunai (hidden until attached to a grip hand). drawn off-body; grip = handle centre, axis = ring->tip (+y)
  add('kunai', 'hand_near_grip_kunai', [860, 222], `<g transform="translate(860,200)">${kunaiLocal('kun', 1)}</g>`, {
    hidden: true, grip: { point: [860, 222], axisDeg: 90 }, notes: 'held kunai; attach to *_grip_kunai',
  });

  add('strand_near', 'head_base', [502, 214], hairGroup([
    { p: [[500, 208], [507, 248], [512, 290], [515, 330], [510, 366]], w: 13 },
    { p: [[504, 214], [512, 256], [518, 298], [522, 334], [521, 356]], w: 7 },
    { p: [[506, 230], [513, 280], [517, 322]], w: 5, cls: 'f-hair_sh' },
  ], sheen([[505, 236], [511, 280], [514, 318]], 1.8), 4.4), { notes: 'loose side strand (spring)' });

  // anime convention: facial features (brows!) read on top of the bangs
  const faces = parts.filter((q) => q.id.startsWith('face_'));
  const rest = parts.filter((q) => !q.id.startsWith('face_'));
  rest.splice(rest.findIndex((q) => q.id === 'hair_front') + 1, 0, ...faces);
  return rest;
}

export const META = {
  name: 'shinobi',
  viewBox: [0, 0, 1000, 1400],
  groundY: 1300,
  height: 1130,
  recommendedScreenHeightPx: 430,
};
