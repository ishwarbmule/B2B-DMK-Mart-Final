"""Convert uploaded hero PNGs to optimized JPGs in public/images/hero/."""
from PIL import Image
import os

os.makedirs("public/images/hero", exist_ok=True)

TARGETS = [
    # (source, destination, max_width) — slide 1 & 2, desktop wide + mobile portrait pairs
    ("upload/Earthy Homeware Sunlit Display.png", "public/images/hero/hero-d1.jpg", 1600),          # wide 1.78:1
    ("upload/Sunlit Sage Green Kitchen Corner.png", "public/images/hero/hero-m1.jpg", 1086),        # portrait 3:4
    ("upload/Sunlit Sage Green Kitchen Still Life.png", "public/images/hero/hero-d2.jpg", 1600),    # wide 1.78:1
    ("upload/Sunlit Modern Kitchen Still Life.png", "public/images/hero/hero-m2.jpg", 1086),        # portrait 3:4
]

for src, dst, maxw in TARGETS:
    im = Image.open(src).convert("RGB")
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"{dst}  {im.size}  {os.path.getsize(dst)//1024} KB")
