"""Generate PWA icon set for Thrive Lens web install.

Source art is RGBA, so every icon is flattened onto the app background
(#0C0B09). Maskable art is inset to ~78% and centred so Android's circular
and squircle masks cannot clip the logo.
"""
from pathlib import Path

from PIL import Image

SRC = Path("assets/images/297b11a4-1998-4a78-8749-65a9fd0d3ba0.png")
# Must live in public/ so Expo copies it to the export root at a stable URL.
# Files under assets/ are content-hashed by Metro and are not addressable.
OUT = Path("public/pwa")
BG = (12, 11, 9, 255)  # #0C0B09
SIZE = 1024
INSET = 0.78  # keeps art inside the maskable safe zone

OUT.mkdir(parents=True, exist_ok=True)
art = Image.open(SRC).convert("RGBA")


def flatten(size: int, maskable: bool = False) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BG)
    if maskable:
        inner = int(size * INSET)
        art_size = art.resize((inner, inner), Image.LANCZOS)
        offset = (size - inner) // 2
    else:
        art_size = art.resize((size, size), Image.LANCZOS)
        offset = 0
    canvas.alpha_composite(art_size, (offset, offset))
    return canvas.convert("RGB")


targets = {
    "icon-192.png": (192, False),
    "icon-512.png": (512, False),
    "icon-maskable-192.png": (192, True),
    "icon-maskable-512.png": (512, True),
    "apple-touch-icon.png": (180, False),
    "favicon-32.png": (32, False),
}
for name, (size, maskable) in targets.items():
    path = OUT / name
    flatten(size, maskable).save(path, "PNG", optimize=True)
    print(f"{name:26} {size}x{size}  {path.stat().st_size / 1024:.1f} KB")
