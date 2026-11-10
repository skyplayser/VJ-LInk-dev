"""Logo und App-Icon als SVG mit Pfaden statt Schrift erzeugen (Schrift: Inter Display ExtraBold, SIL OFL 1.1,
liegt in assets/fonts). Danach rendert scripts/logo/render.cjs daraus die PNGs und Icons.
Aufruf: python3 scripts/logo/make_svgs.py   (braucht fonttools)"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[2]
FONT = TTFont(ROOT / "assets/fonts/InterDisplay-ExtraBold.ttf")
GS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()
UPM = FONT["head"].unitsPerEm
COLORS = ["#FF3B3B", "#FFB020", "#3DDC84", "#22C8F0", "#B45CFF"]


def text_path(text: str, size: float, x: float, baseline: float, spacing: float = 0.0):
    """SVG-Pfad und Breite/Box eines Textes (einfaches Setzen mit Vorschub, ohne Shaping)."""
    s = size / UPM
    pen = SVGPathPen(GS)
    bp = BoundsPen(GS)
    cx = x
    for ch in text:
        g = CMAP[ord(ch)]
        t = (s, 0, 0, -s, cx, baseline)
        GS[g].draw(TransformPen(pen, t))
        GS[g].draw(TransformPen(bp, t))
        cx += GS[g].width * s + spacing
    return pen.getCommands(), bp.bounds  # bounds: xmin, ymin, xmax, ymax (SVG-Koordinaten)


def squares(x0: float, y: float, size: float, step: float, r: float) -> str:
    return "".join(f'<rect x="{x0 + i * step:g}" y="{y:g}" width="{size:g}" height="{size:g}" rx="{r:g}" fill="{c}"/>'
                   for i, c in enumerate(COLORS))


def logo(fill: str, pad: float = 0.0) -> str:
    d, (x0, y0, x1, y1) = text_path("VJ-Link", 92, 190, 80, -1)
    # mit Rand (pad) für die PNGs: wie bisher 585 × 144 Pixel
    vy, h = (-17, 144) if pad else (0, 110)
    w = round(x1 + 2 * pad, 3)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad:g} {vy} {w:g} {h}" width="{w:g}" height="{h}" role="img" aria-label="VJ-Link">'
            f'<g>{squares(0, 42, 26, 35, 6)}</g><path fill="{fill}" d="{d}"/></svg>\n')


def icon() -> str:
    # Maße wie bisher: abgerundetes Quadrat 100…924, Schriftzug „VJ“ mittig, fünf Farbfelder darunter
    d, (x0, y0, x1, y1) = text_path("VJ", 330, 0, 556, -4)
    dx = 512 - (x0 + x1) / 2
    d, _ = text_path("VJ", 330, dx, 556, -4)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
            '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
            '<stop offset="0" stop-color="#1A1E2A"/><stop offset="1" stop-color="#0D1016"/></linearGradient></defs>'
            '<rect x="101.5" y="101.5" width="821" height="821" rx="196" fill="url(#bg)" stroke="#2A2F3D" stroke-width="3"/>'
            f'<path fill="#F2F4F8" d="{d}"/>'
            f'{squares(230, 659, 92, 118, 18)}</svg>\n')


if __name__ == "__main__":
    (ROOT / "assets/logo.svg").write_text(logo("#8A93A6"))
    out = ROOT / "build/logo-src"
    out.mkdir(exist_ok=True)
    (out / "logo-for-dark.svg").write_text(logo("#F2F3F7", 28))
    (out / "logo-for-light.svg").write_text(logo("#141821", 28))
    (out / "icon.svg").write_text(icon())
    print("SVGs geschrieben")
