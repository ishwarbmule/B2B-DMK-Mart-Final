#!/usr/bin/env python3
"""Generate DMK Mart app launcher icons from the DMK logo into the RN android res folders."""
from PIL import Image
import os

SRC = "/home/z/my-project/upload/DMK 1.png"
APP = "/home/z/my-project/mobile"

src = Image.open(SRC).convert("RGBA")
print("logo source:", src.size)

def make(size):
    """square canvas, yellow background, logo centered with margin"""
    canvas = Image.new("RGBA", (size, size), (250, 204, 21, 255))  # DMK yellow
    inner = int(size * 0.78)
    logo = src.copy()
    logo.thumbnail((inner, inner), Image.LANCZOS)
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    return canvas

DENS = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
for d, s in DENS.items():
    folder = os.path.join(APP, "android/app/src/main/res", d)
    os.makedirs(folder, exist_ok=True)
    img = make(s)
    img.save(os.path.join(folder, "ic_launcher.png"))
    # round icon — circular mask
    mask = Image.new("L", (s, s), 0)
    from PIL import ImageDraw
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, s, s), fill=255)
    rnd = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    rnd.paste(img, (0, 0), mask)
    rnd.save(os.path.join(folder, "ic_launcher_round.png"))
    print(d, s, "ok")

# app icon used inside the app (login screen)
os.makedirs(os.path.join(APP, "assets"), exist_ok=True)
make(512).save(os.path.join(APP, "assets", "icon.png"))
print("assets/icon.png ok")
