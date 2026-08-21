"""One-off script to regenerate icon.ico (and the frontend's logo assets)
from the real TP brand mark supplied in reference/tp_logo.png (a flat white
"T" + accent-teal "P" monogram on a black canvas, no alpha channel). Not
part of the agent's runtime; run manually only when the mark changes.

Background removal: the source has a pure (0,0,0) background with the mark
in white/teal, so pixels near-black become transparent (threshold, not a
per-channel alpha ramp — teal's own peak channel value is ~177, well under
255, so a naive luminance-as-alpha computation would make genuine teal
pixels partially transparent). The source is 2000x2000 with generous
padding, so a hard threshold edge disappears once resized down to icon
sizes.
"""

from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "reference" / "tp_logo.png"
BLACK_THRESHOLD = 10
PAD_FRAC = 0.06  # breathing room around the glyph in the square master

img = Image.open(SRC).convert("RGBA")
pixels = img.load()
w, h = img.size
for y in range(h):
    for x in range(w):
        r, g, b, _ = pixels[x, y]
        if max(r, g, b) < BLACK_THRESHOLD:
            pixels[x, y] = (0, 0, 0, 0)

bbox = img.getbbox()
glyph = img.crop(bbox)
gw, gh = glyph.size
side = int(max(gw, gh) * (1 + 2 * PAD_FRAC))
canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
canvas.paste(glyph, ((side - gw) // 2, (side - gh) // 2), glyph)
master = canvas.resize((1024, 1024), Image.LANCZOS)

master.save(REPO_ROOT / "agent" / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("wrote agent/icon.ico")

frontend_public = REPO_ROOT / "frontend" / "public"
frontend_public.mkdir(exist_ok=True)
master.resize((512, 512), Image.LANCZOS).save(frontend_public / "tp-logo.png")
print("wrote frontend/public/tp-logo.png")
master.save(
    frontend_public / "favicon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("wrote frontend/public/favicon.ico")
