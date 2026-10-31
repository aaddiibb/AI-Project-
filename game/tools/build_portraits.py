"""Character-select / VS-screen art cut from the character sheets (docs/<char>/char_sheet.*).
   python game/tools/build_portraits.py

For each character: the CLOSE-UP panel -> game/assets/ui/<char>_face.png, the HERO STANCE panel -> <char>_full.png.
Background removal, in three passes:
  1. paper connected to the panel border (flood fill, generous threshold: also takes the soft floor shadow)
  2. paper ENCLOSED by the art (the gaps between hair strands, between the legs): every connected region of
     paper-coloured pixels larger than MIN_HOLE px, wherever it is (eye whites are smaller, or inside a protect box;
     on the Samurai sheet a region must also have the paper's warm tint on average, so white hair highlights stay)
  3. soft edges: in a thin band around the removed paper, alpha comes from how far a pixel's colour is from the
     nearest paper colour, and the colour is un-mixed from that paper ("decontaminated"), so no white halo is left
Paper tests per sheet: the Samurai sheet's paper is a warm off-white (blue <= red) while his silver hair is cool and
darker; the Shinobi sheet's paper is a light grey gradient while her hair is near-black.
Boxes are in sheet pixels; protect boxes in panel pixels.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, '..', '..')
OUT = os.path.join(HERE, '..', 'assets', 'ui')

SHEETS = {
    'samurai': dict(src='docs/samurai/char_sheet.jpg', face=(2160, 100, 2762, 1086), full=(50, 100, 812, 1086), kind='warm',
                    protect={'face': [(180, 280, 420, 350)], 'full': []}),
    'shinobi': dict(src='docs/shinobi/char_sheet.png', face=(1094, 44, 1534, 602), full=(10, 40, 360, 596), kind='grey',
                    protect={'face': [(170, 120, 350, 185)], 'full': [(150, 60, 200, 80)]}),
}
MIN_HOLE = 40     # px: enclosed paper regions at least this big are removed
BAND = 3          # px: soft-matte band around the removed paper
SOFT = 70.0       # colour distance (sum of |dRGB|) that counts as fully opaque in the band


def masks(f, kind):
    mx, mn = f.max(axis=2), f.min(axis=2)
    if kind == 'warm':
        edge = np.concatenate([f[2, :], f[-3, :], f[:, 2], f[:, -3]])
        bg = np.median(edge[edge.min(axis=1) > 200], axis=0)
        dist = np.abs(f - bg).sum(axis=2)
        border = (dist < 34) & (mx - mn < 22) & (mn > 185)
        inner = (dist < 24) & (mn > 214) & (f[..., 2] - f[..., 0] <= 1)   # warm paper; the hair is cool and darker
        tint = f[..., 2] - f[..., 0]   # per region: paper averages about -5 (warm), his white hair highlights about +1
    else:
        border = (mx - mn < 28) & (mn > 150)                              # paper gradient + the floor shadow
        inner = (mx - mn < 24) & (mn > 200)
        tint = None
    return border, inner, tint


def cutout(rgb, kind, protect):
    f = rgb.astype(float)
    h, w, _ = f.shape
    border, inner, tint = masks(f, kind)
    # 1. border-connected paper
    lab, n = ndimage.label(border)
    edge_ids = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge_ids[edge_ids > 0])
    # 2. enclosed paper
    lab, n = ndimage.label(inner)
    sizes = ndimage.sum(inner, lab, np.arange(n + 1))
    big = sizes >= MIN_HOLE
    if tint is not None: big &= ndimage.mean(tint, lab, np.arange(n + 1)) <= -2.5
    for x0, y0, x1, y1 in protect:
        for i in np.unique(lab[y0:y1, x0:x1]): big[i] = False
    big[0] = False
    bg |= big[lab]
    # 3. soft matte + decontamination in a band around the paper
    band = ndimage.binary_dilation(bg, iterations=BAND) & ~bg
    _, idx = ndimage.distance_transform_edt(~bg, return_indices=True)   # nearest paper pixel for every pixel
    paper = f[idx[0], idx[1]]
    alpha = np.ones((h, w))
    alpha[bg] = 0
    d = np.abs(f - paper).sum(axis=2)
    alpha[band] = np.clip(d[band] / SOFT, 0, 1)
    a = np.maximum(alpha, 1e-3)[..., None]
    out = np.where(band[..., None] & (alpha[..., None] > 0), (f - (1 - a) * paper) / a, f)
    out = np.clip(out, 0, 255)
    alpha = ndimage.gaussian_filter(alpha, 0.6)
    return np.dstack([out, alpha * 255]).astype(np.uint8)


os.makedirs(OUT, exist_ok=True)
for char, s in SHEETS.items():
    sheet = np.array(Image.open(os.path.join(P, s['src'])).convert('RGB'))
    for part in ('face', 'full'):
        x0, y0, x1, y1 = s[part]
        img = Image.fromarray(cutout(sheet[y0:y1, x0:x1], s['kind'], s['protect'][part]), 'RGBA')
        img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
        if img.height > 1100: img = img.resize((round(img.width * 1100 / img.height), 1100), Image.LANCZOS)
        img.save(os.path.join(OUT, f'{char}_{part}.png'), optimize=True)
        print(char, part, img.size)
