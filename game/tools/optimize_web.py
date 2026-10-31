"""Shrink the raster art the live game downloads (run before deploying, and again after build_faces.py / build_palettes.py).
   python game/tools/optimize_web.py

- art/<char>/renders/parts/*.png (the face expressions, 16 per palette): drawn ~140 world units wide, i.e. at most
  ~250 px on a 3x phone during a cinematic zoom, so anything over MAX_FACE px on the long side is wasted download;
  they are also reduced to a 256-colour palette (flat anime shading: no visible difference, ~5x smaller).
- game/assets/ui/*.png: menu art is capped at MAX_UI px tall (the 1080-high frame never shows more).
The rig scales every part by its own size field, so a smaller PNG drops in without any other change. Idempotent.
"""
import glob
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
MAX_FACE, MAX_UI = 360, 1100


def shrink(path, limit, by_height=False, palette=False):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    k = limit / (h if by_height else max(w, h))
    before = os.path.getsize(path)
    if k < 1:
        im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    if palette:
        im = im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(path, optimize=True)
    return before, os.path.getsize(path)


total = [0, 0]
SHIPPED = ('samurai', 'shinobi')  # characters in the live game (the cyborg is still a work in progress)
for f in [g for c in SHIPPED for g in glob.glob(os.path.join(ROOT, 'art', c, 'renders', 'parts', '**', '*.png'), recursive=True)]:
    b, a = shrink(f, MAX_FACE, palette=True); total[0] += b; total[1] += a
for f in glob.glob(os.path.join(ROOT, 'game', 'assets', 'ui', '*.png')):
    if os.path.basename(f).startswith('icon-'): continue
    b, a = shrink(f, MAX_UI, by_height=True); total[0] += b; total[1] += a
print(f'{total[0] / 1e6:.1f} MB -> {total[1] / 1e6:.1f} MB')
