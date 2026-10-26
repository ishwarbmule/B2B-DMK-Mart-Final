#!/usr/bin/env python3
"""Diwali seed image prep — desktop hero (native ~16:9), mobile hero (3:4), offer banner (16:9)."""
from PIL import Image
import os

SRC = "/home/z/my-project/upload/Festive Diwali Homeware Display (1).png"
OUT = "/home/z/my-project/scripts/diwali"
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGB")
W, H = im.size
print("original:", W, "x", H, f"ratio {W/H:.3f}")

def save_jpg(img, name, quality=86):
    p = os.path.join(OUT, name)
    img.save(p, "JPEG", quality=quality, optimize=True, progressive=True)
    print(name, img.size, f"{os.path.getsize(p)//1024} KB")

# 1) Desktop hero — keep full frame, cap width at 1600
dw = min(1600, W)
desktop = im.resize((dw, round(H * dw / W)), Image.LANCZOS)
save_jpg(desktop, "diwali-desktop.jpg")

# 2) Mobile hero — 3:4 portrait crop from the product cluster (keeps some wall top-left)
mr = 3 / 4
mw = round(H * mr)  # width for full height
mx = max(0, min(W - mw, round(W * 0.20)))  # anchor 20% from left → wall + products
mobile = im.crop((mx, 0, mx + mw, H))
if mobile.width > 1000:
    mobile = mobile.resize((1000, round(1000 * mr)), Image.LANCZOS)
save_jpg(mobile, "diwali-mobile.jpg")

# 3) Offer banner — exact 16:9 crop, slightly biased down to keep the product line
br = 16 / 9
bh = round(W / br)
by = max(0, min(H - bh, round((H - bh) * 0.62)))  # bias toward products
banner = im.crop((0, by, W, by + bh))
if banner.width > 1600:
    banner = banner.resize((1600, 900), Image.LANCZOS)
save_jpg(banner, "diwali-banner.jpg", quality=88)

print("done →", OUT)
