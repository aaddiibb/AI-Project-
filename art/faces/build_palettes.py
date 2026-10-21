"""Extra colour schemes (character select): rig_p3.json / rig_p4.json for each character.
   python art/faces/build_palettes.py          (run after tools/split.mjs --palette p3|p4 and after build_faces.py)

split.mjs writes the vector parts of every palette (parts/p3, parts/p4) but only rig.json / rig_p2.json get the raster
faces (build_faces.py). This copies rig_p2.json (same geometry, faces, hidden parts, seam patches) to rig_pN.json with
the vector paths pointed at parts/pN/, and makes renders/parts/pN/face_*.png from the P1 faces with the hair and
ribbon recoloured to that palette (skin, eyes and ink untouched).
"""
import colorsys, json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..')

# per character + palette: source faces, hair target (h, s, v-scale, v-offset) or None = keep, ribbon target (h, s) or None
PLANS = {
    'samurai': {'p3': dict(src='', hair=None, red=None),          # silver hair kept: the P1 faces
                'p4': dict(src='p2/', hair=None, red=None)},       # black hair: the P2 faces already are
    'shinobi': {'p3': dict(src='', hair=(0.03, 0.55, 1.9, 0.05), red=(0.42, 0.6)),   # auburn hair, jade ribbon
                'p4': dict(src='', hair=None, red=(0.61, 0.62))},                     # black hair, ice-blue ribbon
}


def recolor(rgba, hair, red):
    out = rgba.copy()
    h, w, _ = out.shape
    for y in range(h):
        for x in range(w):
            r, g, b, a = out[y, x]
            if a == 0:
                continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            skin = 0.0 <= hh < 0.12 and s > 0.16 and v > 0.45
            is_red = (hh < 0.04 or hh > 0.93) and s > 0.45
            if is_red and red:
                r, g, b = (int(c * 255) for c in colorsys.hsv_to_rgb(red[0], min(1, s * red[1] / 0.75), min(1, v * 1.1)))
            elif not skin and not is_red and hair and v >= 0.09 and s < 0.5:
                h2, s2, k, o = hair
                r, g, b = (int(c * 255) for c in colorsys.hsv_to_rgb(h2, s2, min(1, o + v * k)))
            else:
                continue
            out[y, x] = (r, g, b, a)
    return out


for char, plans in PLANS.items():
    A = os.path.join(ART, char)
    base = json.load(open(os.path.join(A, 'rig_p2.json'), encoding='utf8'))
    for pal, plan in plans.items():
        rig = json.loads(json.dumps(base))
        rig['palette'] = pal
        dst = os.path.join(A, 'renders', 'parts', pal)
        os.makedirs(dst, exist_ok=True)
        for p in rig['parts']:
            f = p['file']
            if f.startswith('parts/p2/'):
                p['file'] = 'parts/' + pal + '/' + f[len('parts/p2/'):]
            elif f.startswith('renders/parts/p2/'):
                name = f[len('renders/parts/p2/'):]
                img = np.array(Image.open(os.path.join(A, 'renders', 'parts', plan['src'] + name)).convert('RGBA'))
                if plan['hair'] or plan['red']:
                    img = recolor(img, plan['hair'], plan['red'])
                Image.fromarray(img, 'RGBA').save(os.path.join(dst, name), optimize=True)
                p['file'] = 'renders/parts/' + pal + '/' + name
            assert os.path.exists(os.path.join(A, p['file'])), p['file']
        json.dump(rig, open(os.path.join(A, f'rig_{pal}.json'), 'w', encoding='utf8'), indent=1)
        print(char, pal, len(rig['parts']), 'parts')
