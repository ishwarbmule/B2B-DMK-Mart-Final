"""Create contact sheets of all brand logos with filename labels for identification."""
import os
from PIL import Image, ImageDraw, ImageFont

SRC = "/home/z/my-project/upload/brand-logos/All Brand Logos/original-filenames"
OUT = "/home/z/my-project/scripts"

files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))])
print(f"Total logos: {len(files)}")

THUMB, LABEL_H, COLS = 220, 26, 5
PER_SHEET = 25

try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
except Exception:
    font = ImageFont.load_default()

sheets = [files[i:i + PER_SHEET] for i in range(0, len(files), PER_SHEET)]

for si, batch in enumerate(sheets):
    rows = (len(batch) + COLS - 1) // COLS
    W = COLS * THUMB
    H = rows * (THUMB + LABEL_H)
    sheet = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(sheet)
    for i, fname in enumerate(batch):
        r, c = divmod(i, COLS)
        x, y = c * THUMB, r * (THUMB + LABEL_H)
        try:
            img = Image.open(os.path.join(SRC, fname)).convert("RGB")
            img.thumbnail((THUMB - 8, THUMB - 8))
            px = x + (THUMB - img.width) // 2
            py = y + (THUMB - img.height) // 2
            sheet.paste(img, (px, py))
        except Exception as e:
            d.text((x + 5, y + 5), f"ERR {e}", fill="red", font=font)
        d.rectangle([x, y + THUMB, x + THUMB, y + THUMB + LABEL_H], fill="#111")
        # short label
        label = fname.replace("company-", "c-").replace(".jpeg", ".jpg")
        d.text((x + 6, y + THUMB + 5), label[:30], fill="#ffe600", font=font)
    out = os.path.join(OUT, f"logos-sheet-{si+1}.png")
    sheet.save(out)
    print(f"Saved {out} ({len(batch)} logos)")
