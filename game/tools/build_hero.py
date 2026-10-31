"""Shinobi hero-stance cut-out (docs/shinobi/hero.jfif -> game/assets/ui/shinobi_full.png), used by the main menu,
character select and VS screen.
   python game/tools/build_hero.py

Same three passes as build_portraits.py, tuned for this sheet: warm cream paper + a warm-grey floor shadow (both have
red >= blue and low chroma, while her outfit is cool navy and her skin is far more saturated), the "HERO STANCE"
caption is cropped away, enclosed paper between hair strands is removed, and the edge band is decontaminated.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'docs', 'shinobi', 'hero.jfif')
OUT = os.path.join(HERE, '..', 'assets', 'ui', 'shinobi_full.png')
CROP = (620, 0, 1720, 1696)   # sheet px: the figure without the caption
MIN_HOLE = 60
BAND = 3
SOFT = 80.0
HEIGHT = 1100

f = np.asarray(Image.open(SRC).convert('RGB'))[CROP[1]:CROP[3], CROP[0]:CROP[2]].astype(float)
h, w, _ = f.shape
r, g, b = f[..., 0], f[..., 1], f[..., 2]
mx, mn = f.max(axis=2), f.min(axis=2)
warm = r >= b - 3
border = warm & (mn > 95) & (mx - mn < 42)              # paper + floor shadow
inner = warm & (mn > 212) & (mx - mn < 32)              # paper showing between hair strands / legs

lab, _ = ndimage.label(border)
ids = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
bg = np.isin(lab, ids[ids > 0])
lab, n = ndimage.label(inner)
sizes = ndimage.sum(inner, lab, np.arange(n + 1))
big = sizes >= MIN_HOLE
big[0] = False
bg |= big[lab]

band = ndimage.binary_dilation(bg, iterations=BAND) & ~bg
_, idx = ndimage.distance_transform_edt(~bg, return_indices=True)
paper = f[idx[0], idx[1]]
alpha = np.ones((h, w))
alpha[bg] = 0
d = np.abs(f - paper).sum(axis=2)
alpha[band] = np.clip(d[band] / SOFT, 0, 1)
a = np.maximum(alpha, 1e-3)[..., None]
rgb = np.where(band[..., None] & (alpha[..., None] > 0), (f - (1 - a) * paper) / a, f)
alpha = ndimage.gaussian_filter(alpha, 0.6)
img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA')
img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
if img.height > HEIGHT: img = img.resize((round(img.width * HEIGHT / img.height), HEIGHT), Image.LANCZOS)
img.save(OUT, optimize=True)
print('shinobi_full', img.size)
