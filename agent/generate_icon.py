"""One-off script to regenerate icon.ico from the dashboard's actual brand
mark (a rounded teal square with a ">" chevron — see
frontend/src/components/layout/TopBar.jsx) so the packaged agent .exe looks
like it belongs to the same product instead of showing a generic default
icon. Not part of the agent's runtime; run manually only when the mark
changes.
"""

from PIL import Image, ImageDraw, ImageFont

ACCENT = "#0891b2"
DARK = "#0F1219"
SIZE = 256
RADIUS = 59  # matches the topbar mark's ~23% corner-radius ratio (7/30)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle([(0, 0), (SIZE - 1, SIZE - 1)], radius=RADIUS, fill=ACCENT)

font = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 150)
text = ">"
bbox = draw.textbbox((0, 0), text, font=font)
w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
draw.text(((SIZE - w) / 2 - bbox[0], (SIZE - h) / 2 - bbox[1] - 6), text, font=font, fill=DARK)

img.save("icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("wrote icon.ico")
