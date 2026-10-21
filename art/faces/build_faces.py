"""Raster faces: cut the 16 expressions of docs/<char>/face_expr.png (4x4 sheet) into face parts of the rig.
   python art/faces/build_faces.py [samurai|shinobi ...]      (run again after any rig rebuild: it patches rig.json)

The vector profile never looked like the character, so the head (skin, eye, mouth, front hair, side strands) is now a
raster cut-out of the reference sheet; the neck, back hair and the spring-animated ponytail stay vector. Per character:
  - every cell is aligned to cell 1 (template match on the hair/ear area, which does not change between expressions)
  - grey background removed by flood fill from the cell border, then a feathered keep-polygon cuts off the neck,
    collar and ponytail
  - landmarks map reference px -> master units: master = EYE_RIG + (ref - EYE_REF) * SCALE
  - P1 keeps the reference colours; P2 gets the mirror-palette hair (Samurai silver -> black, Shinobi black -> silver)
Output: art/<char>/renders/parts/face_*.png (+ p2/), rig.json / rig_p2.json: 16 parts in the `face` slot, the vector
head parts hidden. The old slot names stay (face_neutral = 1, face_intense = 4, face_hurt = 10) so existing poses work.
"""
import json, os, sys, colorsys
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.join(HERE, '..', '..')

# expression number (1..16, sheet order) -> part id; the three old slot names keep their meaning
NAMES = {1: 'face_neutral', 2: 'face_confident', 3: 'face_focus', 4: 'face_intense', 5: 'face_grit', 6: 'face_glare',
         7: 'face_surprised', 8: 'face_smirk', 9: 'face_wince', 10: 'face_hurt', 11: 'face_dazed', 12: 'face_tired',
         13: 'face_cry', 14: 'face_victory', 15: 'face_defeated', 16: 'face_blink'}

CHARS = {
    'samurai': dict(
        eye_ref=(205, 145), eye_rig=(585, 211), scale=0.72,  # head sits a bit forward / down of the old vector head: the raster neck meets the collar
        # keep-polygon in cell-1 px: head + front locks; no neck / collar, no ponytail tie or tail
        # down to the cord tie at the nape (the vector ponytail starts under it), the neck cut just under the jaw
        # bottom edge follows the sheet's own collar line (the raster neck runs down to the costume collar), front locks kept
        keep=[(20, 0), (313, 0), (313, 268), (246, 300), (196, 300), (172, 286), (150, 272), (124, 256), (104, 230), (92, 218), (80, 210), (60, 206), (34, 206), (16, 196), (16, 160)],  # under the tie the sheet shows background between tail and collar
        align=(95, 15, 200, 140),       # template region (hair top + ear), cell px
        bg_tol=40, p2='to_dark',
        hide=['head_base', 'hair_front', 'strand_near', 'strand_far'],
        # seam patch from cell 1 drawn ABOVE the ponytail root: the cord tie and the hair around it
        patches=[dict(id='hair_tie', keep=[(2, 190), (20, 180), (44, 176), (72, 182), (86, 196), (78, 210), (56, 216), (26, 216), (2, 210)], above='hair_1')],
    ),
    'shinobi': dict(
        eye_ref=(212, 140), eye_rig=(547, 275), scale=0.64,
        # hair behind the ear down to the nape (x 92); the front lock kept whole down to its tips (y 305)
        keep=[(112, 0), (313, 0), (313, 308), (212, 308), (208, 252), (196, 236), (182, 226), (156, 212), (130, 204), (98, 202), (92, 150), (96, 60), (112, 40)],
        clear_below=236,  # under the chin only hair is kept: light grey trapped between the lock strands is background
        align=(115, 10, 210, 130),
        bg_tol=40, light_bg=True, p2='to_silver', feather=1.6,
        hide=['head_base', 'hair_front', 'strand_near', 'strand_far'],
    ),
}
FEATHER = 3.0  # px, soft cut edges so the raster blends into the vector neck / back hair


def flood_bg(rgb, tol, light_bg=False):
    """alpha mask: 0 where the grey background is reachable from the border (stops at ink outlines)"""
    h, w, _ = rgb.shape
    I = 12  # seed ring inset: the sheet's light cell separators sit on the outer few px
    bg = np.median(np.concatenate([rgb[I, I:-I], rgb[-I, I:-I], rgb[I:-I, I], rgb[I:-I, -I]]), axis=0)
    near = np.abs(rgb.astype(int) - bg).sum(axis=2) < tol
    if light_bg:  # dark-haired sheet: any light, unsaturated pixel reached from the border is background (gradient bands)
        mx, mn = rgb.max(axis=2).astype(int), rgb.min(axis=2).astype(int)
        near |= (mn > 165) & (mx - mn < 22)
    near[:I, :] = near[-I:, :] = True; near[:, :I] = near[:, -I:] = True  # the separator margin counts as background
    seen = np.zeros((h, w), bool)
    q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y, x] or not near[y, x]:
            continue
        seen[y, x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    # erode by 1 px: the anti-aliased rim still carries the grey background (a light halo); the sheet's ink outline is thicker
    m = Image.fromarray((~seen).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3))
    return np.array(m) > 127


def cell(sheet, n):
    W = sheet.shape[1] / 4
    r, c = divmod(n - 1, 4)
    x0, y0 = round(c * W), round(r * W)
    return sheet[y0:y0 + 314, x0:x0 + 314]


def align(ref, img, box, R=14):
    """integer (dx, dy) that best maps img onto ref inside box (normalised cross-correlation)"""
    x0, y0, x1, y1 = box
    a = ref[y0:y1, x0:x1].astype(float).mean(axis=2); a = (a - a.mean()) / (a.std() + 1e-6)
    best = (-9, 0, 0)
    g = img.astype(float).mean(axis=2)
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            if y0 + dy < 0 or x0 + dx < 0 or y1 + dy > g.shape[0] or x1 + dx > g.shape[1]:
                continue
            b = g[y0 + dy:y1 + dy, x0 + dx:x1 + dx]; b = (b - b.mean()) / (b.std() + 1e-6)
            s = (a * b).mean()
            if s > best[0]:
                best = (s, dx, dy)
    return best[1], best[2], best[0]


def recolor(rgba, mode, eye_xy, eye_r=18):
    """P2 hair: silver -> near-black (Samurai) or black -> silver (Shinobi); skin, eyes, ribbon and ink untouched"""
    out = rgba.copy()
    h, w, _ = out.shape
    yy, xx = np.mgrid[0:h, 0:w]
    near_eye = (xx - eye_xy[0]) ** 2 + (yy - eye_xy[1]) ** 2 < eye_r ** 2
    for y in range(h):
        for x in range(w):
            r, g, b, a = out[y, x]
            if a == 0 or near_eye[y, x]:
                continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            skin = 0.0 <= hh < 0.12 and s > 0.16 and v > 0.45
            red = (hh < 0.04 or hh > 0.93) and s > 0.45
            if skin or red:
                continue
            if mode == 'to_dark':   # low-saturation silver -> blue-black, keep the shading order
                wgt = max(0.0, min(1.0, (0.28 - s) / 0.14))
                v2 = 0.04 + v * 0.20   # matches the P2 vector hair (#24242e)
                hh2, s2 = 0.67, 0.22
                r2, g2, b2 = colorsys.hsv_to_rgb(hh2, s2, v2)
                r, g, b = (int(255 * (c0 / 255 * (1 - wgt) + c1 * wgt)) for c0, c1 in ((r, r2), (g, g2), (b, b2)))
            else:                   # dark navy hair -> silver; pure ink stays black
                if v < 0.09:
                    continue
                v2 = min(1.0, 0.42 + v * 1.25)
                r, g, b = (int(c * 255) for c in colorsys.hsv_to_rgb(0.7, 0.07, v2))
            out[y, x] = (r, g, b, a)
    return out


def build(char):
    cfg = CHARS[char]
    A = os.path.join(PROJECT, 'art', char)
    sheet = np.array(Image.open(os.path.join(PROJECT, 'docs', char, 'face_expr.png')).convert('RGB'))
    S, (ex, ey), (rx, ry) = cfg['scale'], cfg['eye_ref'], cfg['eye_rig']
    xs, ys = [p[0] for p in cfg['keep']], [p[1] for p in cfg['keep']]
    bx0, by0, bx1, by1 = min(xs), min(ys), max(xs), max(ys)
    keep = Image.new('L', (314, 314), 0)
    ImageDraw.Draw(keep).polygon(cfg['keep'], fill=255)
    keep = np.array(keep.filter(ImageFilter.GaussianBlur(cfg.get('feather', FEATHER))), float) / 255
    ref1 = cell(sheet, 1)
    up = 2  # stored at 2 px per reference px (about 2.8 px per master unit)
    out_dirs = [os.path.join(A, 'renders', 'parts'), os.path.join(A, 'renders', 'parts', 'p2')]
    for d in out_dirs: os.makedirs(d, exist_ok=True)
    report = []
    for n in range(1, 17):
        c = cell(sheet, n)
        dx, dy, score = align(ref1, c, cfg['align']) if n > 1 else (0, 0, 1.0)
        # shift the cell so it lines up with cell 1 (pad with background)
        pad = np.pad(c, ((20, 20), (20, 20), (0, 0)), mode='edge')
        c = pad[20 + dy:20 + dy + 314, 20 + dx:20 + dx + 314]
        alpha = flood_bg(c, cfg['bg_tol'], cfg.get('light_bg', False)).astype(float) * keep
        if cfg.get('clear_below'):
            y0 = cfg['clear_below']; mx, mn = c.max(axis=2).astype(int), c.min(axis=2).astype(int)
            alpha[y0:][(mn[y0:] > 150) & (mx[y0:] - mn[y0:] < 30)] = 0
        crop = np.dstack([c, (alpha * 255).astype(np.uint8)])[by0:by1, bx0:bx1]
        img = Image.fromarray(crop, 'RGBA').resize(((bx1 - bx0) * up, (by1 - by0) * up), Image.LANCZOS)
        name = NAMES[n]
        img.save(os.path.join(out_dirs[0], name + '.png'), optimize=True)
        p2 = recolor(np.array(img), cfg['p2'], ((ex - bx0) * up, (ey - by0) * up), 18 * up)
        Image.fromarray(p2, 'RGBA').save(os.path.join(out_dirs[1], name + '.png'), optimize=True)
        report.append(f'{n:2d} {name:15s} shift ({dx:+d},{dy:+d}) match {score:.2f}')
    # seam patches (cell 1 only, same mapping), drawn above a given part
    patch_parts = []
    for pt in cfg.get('patches', []):
        pk = Image.new('L', (314, 314), 0); ImageDraw.Draw(pk).polygon(pt['keep'], fill=255)
        pk = np.array(pk.filter(ImageFilter.GaussianBlur(FEATHER)), float) / 255
        qx, qy = [q[0] for q in pt['keep']], [q[1] for q in pt['keep']]
        px0, py0, px1, py1 = max(0, min(qx) - 4), max(0, min(qy) - 4), min(314, max(qx) + 4), min(314, max(qy) + 4)
        a2 = flood_bg(ref1, cfg['bg_tol'], cfg.get('light_bg', False)).astype(float) * pk
        img = Image.fromarray(np.dstack([ref1, (a2 * 255).astype(np.uint8)])[py0:py1, px0:px1], 'RGBA').resize(((px1 - px0) * up, (py1 - py0) * up), Image.LANCZOS)
        img.save(os.path.join(out_dirs[0], pt['id'] + '.png'), optimize=True)
        Image.fromarray(recolor(np.array(img), cfg['p2'], (-999, -999)), 'RGBA').save(os.path.join(out_dirs[1], pt['id'] + '.png'), optimize=True)
        patch_parts.append((pt, {'x': round(rx + (px0 - ex) * S, 2), 'y': round(ry + (py0 - ey) * S, 2)}, {'w': round((px1 - px0) * S, 2), 'h': round((py1 - py0) * S, 2)}))
    # part geometry in master units
    off = {'x': round(rx + (bx0 - ex) * S, 2), 'y': round(ry + (by0 - ey) * S, 2)}
    size = {'w': round((bx1 - bx0) * S, 2), 'h': round((by1 - by0) * S, 2)}
    for rig_file, sub in (('rig.json', ''), ('rig_p2.json', 'p2/')):
        path = os.path.join(A, rig_file)
        rig = json.load(open(path, encoding='utf8'))
        hb = next(p for p in rig['parts'] if p['id'] == 'head_base')
        old = {p['id']: p for p in rig['parts'] if p.get('slot') == 'face'}
        z = min(p['zIndex'] for p in old.values()) if old else hb['zIndex'] + 2
        rig['parts'] = [p for p in rig['parts'] if p.get('slot') != 'face']
        at = next(i for i, p in enumerate(rig['parts']) if p['id'] == 'head_base') + 1
        new = [{'id': NAMES[n], 'parent': 'head_base', 'pivot': dict(hb['pivot']), 'zIndex': z, 'file': f'renders/parts/{sub}{NAMES[n]}.png',
                'offset': off, 'size': size, 'slot': 'face', 'raster': True, 'notes': f'raster expression {n} (art/faces/build_faces.py)'} for n in range(1, 17)]
        rig['parts'][at:at] = new
        for p in rig['parts']:
            if p['id'] in cfg['hide']: p['hidden'] = True
        rig['parts'] = [p for p in rig['parts'] if not p.get('patch')]
        for pt, poff, psize in patch_parts:
            ab = next(p for p in rig['parts'] if p['id'] == pt['above'])
            at2 = next(i for i, p in enumerate(rig['parts']) if p['id'] == pt['above']) + 1
            rig['parts'].insert(at2, {'id': pt['id'], 'parent': 'head_base', 'pivot': dict(hb['pivot']), 'zIndex': ab['zIndex'] + 0.5,
                                      'file': f'renders/parts/{sub}{pt["id"]}.png', 'offset': poff, 'size': psize, 'raster': True, 'patch': True,
                                      'notes': f'raster seam patch above {pt["above"]} (art/faces/build_faces.py)'})
        rig['slots']['face'] = {'options': [NAMES[n] for n in range(1, 17)], 'default': 'face_neutral'}
        json.dump(rig, open(path, 'w', encoding='utf8'), indent=1)
    print(char, 'offset', off, 'size', size)
    print('\n'.join(report))


if __name__ == '__main__':
    for ch in (sys.argv[1:] or list(CHARS)):
        build(ch)
