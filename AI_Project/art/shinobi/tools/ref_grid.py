"""Map the side-view reference into master coordinates (1000x1400) and draw a labelled grid.

Usage: python ref_grid.py  -> writes renders/ref_master.png and zoomed crops.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT.parents[1] / "references" / "shinobi_2.png"
OUT = ROOT / "renders"

# reference px -> master units
S, TX, TY = 0.76, 120.0, 165.8


def to_master(img):
    w, h = img.size
    canvas = Image.new("RGB", (1000, 1400), (225, 225, 228))
    scaled = img.resize((round(w * S), round(h * S)), Image.LANCZOS)
    canvas.paste(scaled, (round(TX), round(TY)))
    return canvas


def grid(img, step=50):
    d = ImageDraw.Draw(img)
    w, h = img.size
    for v in range(0, 1401, step):
        major = v % 100 == 0
        col = (255, 0, 160) if major else (0, 170, 255)
        if v <= w:
            d.line([(v, 0), (v, h)], fill=col, width=1)
        if v <= h:
            d.line([(0, v), (w, v)], fill=col, width=1)
        if major:
            d.text((v + 2, 2), str(v), fill=(255, 0, 160))
            d.text((2, v + 2), str(v), fill=(255, 0, 160))
    return img


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    base = to_master(Image.open(REF).convert("RGB"))
    base.save(OUT / "ref_master_clean.png")
    grid(base.copy()).save(OUT / "ref_master.png")
    # zoomed crops (x0, y0, x1, y1) in master coords, rendered at 2x with grid
    crops = {
        "head": (330, 150, 680, 450),
        "torso": (250, 350, 750, 800),
        "legs": (200, 750, 750, 1340),
    }
    for name, (x0, y0, x1, y1) in crops.items():
        c = base.crop((x0, y0, x1, y1)).resize(((x1 - x0) * 2, (y1 - y0) * 2), Image.LANCZOS)
        d = ImageDraw.Draw(c)
        for v in range(0, 1401, 25):
            major = v % 50 == 0
            col = (255, 0, 160) if major else (0, 200, 255)
            if x0 <= v <= x1:
                p = (v - x0) * 2
                d.line([(p, 0), (p, c.size[1])], fill=col, width=1)
                if major:
                    d.text((p + 2, 2), str(v), fill=col)
            if y0 <= v <= y1:
                p = (v - y0) * 2
                d.line([(0, p), (c.size[0], p)], fill=col, width=1)
                if major:
                    d.text((2, p + 2), str(v), fill=col)
        c.save(OUT / f"ref_crop_{name}.png")
    print("ok")
