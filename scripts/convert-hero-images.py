"""Convert uploaded hero PNGs to optimized JPGs in public/images/hero/."""
from PIL import Image
import os

os.makedirs("public/images/hero", exist_ok=True)

TARGETS = [
    # (source, destination, max_width) — order = slide order
    ("upload/file_00000000ef30820881e88d48518e04ad.png", "public/images/hero/hero-1.jpg", 1920),  # wide 2.73:1
    ("upload/file_0000000079208208b6d077ae4db6ed68.png", "public/images/hero/hero-2.jpg", 1400),  # square 1:1
    ("upload/file_000000007fb482088596fc462ccbf035.png", "public/images/hero/hero-3.jpg", 1200),  # portrait 3:4
]

for src, dst, maxw in TARGETS:
    im = Image.open(src).convert("RGB")
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"{dst}  {im.size}  {os.path.getsize(dst)//1024} KB")
