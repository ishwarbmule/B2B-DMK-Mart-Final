#!/usr/bin/env python3
"""Generate temporary SVG product/company/category images for DMK Mart."""
import pandas as pd, os, re, html, json

BASE = "/home/z/my-project/public"
os.makedirs(f"{BASE}/products", exist_ok=True)
os.makedirs(f"{BASE}/companies", exist_ok=True)
os.makedirs(f"{BASE}/categories", exist_ok=True)
os.makedirs(f"{BASE}/cms", exist_ok=True)

PALETTES = [
    ("#fef3c7", "#fbbf24"), ("#dbeafe", "#60a5fa"), ("#dcfce7", "#4ade80"),
    ("#fae8ff", "#c084fc"), ("#ffe4e6", "#fb7185"), ("#ccfbf1", "#2dd4bf"),
    ("#ffedd5", "#fb923c"), ("#e0e7ff", "#818cf8"), ("#fef9c3", "#facc15"),
    ("#cffafe", "#22d3ee"), ("#fce7f3", "#f472b6"), ("#e2e8f0", "#94a3b8"),
]
EMOJIS = {
    "Furniture": "🪑", "Gardening Tools & Planters": "🪴", "Clening & HouseHolds": "🧹",
    "Home Decor": "🖼️", "HouseHold Unbreakable": "🛡️", "KITCHEN WARE": "🍳",
    "Kitchen Equipments Commercial": "🍽️", "NV PRODUCTS-FERIWALA": "🧺",
    "WATER JAR  & BOTTLE": "🫙", "WATER JAR & BOTTLE": "🫙",
}
EMOJI_FALLBACK = ["📦", "🛒", "🏺", "🪣", "🧴", "🥤", "🪥", "🧽", "🪟", "🔧", "🌟"]

def esc(s): return html.escape(str(s), quote=True)

def wrap(name, maxlen=16, maxlines=3):
    words, lines, cur = str(name).split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if len(t) <= maxlen: cur = t
        else:
            if cur: lines.append(cur)
            cur = w[:maxlen]
            if len(lines) == maxlines - 1: break
    if cur and len(lines) < maxlines: lines.append(cur)
    if len(words) and len(lines) == maxlines and sum(len(l) for l in lines) < len(" ".join(words)) - 1:
        lines[-1] = lines[-1][:maxlen-1] + "…"
    return lines[:maxlines]

def product_svg(name, brand, top, pack, idx):
    c1, c2 = PALETTES[idx % len(PALETTES)]
    emoji = EMOJIS.get(top, EMOJI_FALLBACK[idx % len(EMOJI_FALLBACK)])
    lines = wrap(name, 18, 3)
    tspans = "".join(
        f'<tspan x="300" dy="{0 if i==0 else 30}">{esc(l)}</tspan>' for i, l in enumerate(lines))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs>
<rect width="600" height="600" rx="48" fill="url(#g)"/>
<circle cx="520" cy="90" r="140" fill="#ffffff" opacity="0.18"/>
<circle cx="70" cy="540" r="110" fill="#000000" opacity="0.08"/>
<text x="300" y="235" font-size="150" text-anchor="middle">{emoji}</text>
<text x="300" y="380" font-size="34" font-weight="800" fill="#1c1917" text-anchor="middle" font-family="Arial, sans-serif">{tspans}</text>
<rect x="170" y="470" width="260" height="46" rx="23" fill="#111111"/>
<text x="300" y="501" font-size="24" font-weight="700" fill="#ffd200" text-anchor="middle" font-family="Arial, sans-serif">{esc(brand[:22])} · Pk {esc(pack)}</text>
<text x="300" y="560" font-size="20" font-weight="600" fill="#44403c" text-anchor="middle" letter-spacing="3" font-family="Arial, sans-serif">DMK MART · TEMP IMAGE</text>
</svg>'''

def brand_svg(name, idx):
    c1, c2 = PALETTES[(idx * 5 + 3) % len(PALETTES)]
    initials = "".join(w[0] for w in re.split(r"[\s&]+", name) if w)[:3].upper()
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs>
<rect width="400" height="400" rx="40" fill="url(#g)"/>
<rect x="30" y="30" width="340" height="340" rx="30" fill="none" stroke="#111" stroke-width="6" stroke-dasharray="2 0" opacity="0.25"/>
<text x="200" y="225" font-size="120" font-weight="900" fill="#111" text-anchor="middle" font-family="Arial Black, Arial, sans-serif">{esc(initials)}</text>
<text x="200" y="300" font-size="26" font-weight="700" fill="#1c1917" text-anchor="middle" font-family="Arial, sans-serif">{esc(name[:26])}</text>
</svg>'''

def category_svg(name, emoji, idx):
    c1, c2 = PALETTES[idx % len(PALETTES)]
    lines = wrap(name, 16, 2)
    tspans = "".join(
        f'<tspan x="300" dy="{0 if i==0 else 34}">{esc(l)}</tspan>' for i, l in enumerate(lines))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs>
<rect width="600" height="600" rx="48" fill="url(#g)"/>
<circle cx="300" cy="225" r="130" fill="#ffffff" opacity="0.55"/>
<text x="300" y="280" font-size="150" text-anchor="middle">{emoji}</text>
<text x="300" y="445" font-size="36" font-weight="800" fill="#1c1917" text-anchor="middle" font-family="Arial, sans-serif">{tspans}</text>
<text x="300" y="530" font-size="22" font-weight="700" fill="#44403c" text-anchor="middle" letter-spacing="4" font-family="Arial, sans-serif">DMK MART</text>
</svg>'''

def banner_svg(kind, i, heading, sub, emoji):
    bg = [("#111827", "#1f2937"), ("#713f12", "#a16207"), ("#1e3a5f", "#2563eb"), ("#14532d", "#16a34a")][i % 4]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="480" viewBox="0 0 1200 480">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="{bg[0]}"/><stop offset="1" stop-color="{bg[1]}"/></linearGradient></defs>
<rect width="1200" height="480" rx="0" fill="url(#g)"/>
<circle cx="1080" cy="100" r="220" fill="#ffd200" opacity="0.12"/>
<circle cx="120" cy="420" r="160" fill="#ffffff" opacity="0.06"/>
<text x="900" y="300" font-size="170" text-anchor="middle" opacity="0.9">{emoji}</text>
<text x="80" y="185" font-size="58" font-weight="900" fill="#ffd200" font-family="Arial Black, Arial, sans-serif">{esc(heading[:30])}</text>
<text x="80" y="255" font-size="30" font-weight="600" fill="#f5f5f4" font-family="Arial, sans-serif">{esc(sub[:52])}</text>
<rect x="80" y="300" width="240" height="64" rx="12" fill="#ffd200"/>
<text x="200" y="342" font-size="26" font-weight="800" fill="#111" text-anchor="middle" font-family="Arial, sans-serif">SHOP NOW →</text>
<text x="80" y="430" font-size="22" font-weight="700" fill="#fbbf24" letter-spacing="4" font-family="Arial, sans-serif">DMK MART B2B WHOLESALE · {esc(kind.upper())}</text>
</svg>'''

def main():
    xl = pd.ExcelFile("/home/z/my-project/upload/DMK_Mart_All_Products_Brands_and_Categories.xlsx")
    df = xl.parse("All Products & Brands")
    count = 0
    for i, r in df.iterrows():
        sku = str(r["Item Code / SKU"]).strip()
        svg = product_svg(r["Product Name"], r["Brand Name"], r["Top Category"],
                          r["Pack Size (Units)"], i)
        with open(f"{BASE}/products/{sku}.svg", "w") as f:
            f.write(svg)
        count += 1
    print("product svgs:", count)

    brands = df["Brand Name"].unique().tolist()
    for i, b in enumerate(brands):
        slug = re.sub(r"[^a-z0-9]+", "-", b.lower()).strip("-")
        with open(f"{BASE}/companies/{slug}.svg", "w") as f:
            f.write(brand_svg(b, i))
    print("brand svgs:", len(brands))
    with open("/home/z/my-project/scripts/brand-slugs.json", "w") as f:
        json.dump({b: re.sub(r"[^a-z0-9]+", "-", b.lower()).strip("-") for b in brands}, f)

    tops = df["Top Category"].unique().tolist()
    for i, t in enumerate(tops):
        emoji = EMOJIS.get(t, "🧺")
        with open(f"{BASE}/categories/top-{i}.svg", "w") as f:
            f.write(category_svg(t, emoji, i))
    print("top category svgs:", len(tops))
    with open("/home/z/my-project/scripts/top-index.json", "w") as f:
        json.dump({t: i for i, t in enumerate(tops)}, f)

    cms = [
        ("slider", "Maha Wholesale Savings", "Up to 60% off on bulk packs across 21 brands", "🛒"),
        ("slider", "New Season Planters", "500+ pots & planters ready to dispatch", "🪴"),
        ("slider", "Kitchen Ware Carnival", "Borosil & kitchen essentials at dealer rates", "🍳"),
        ("slider", "Unbreakable Quality", "Virgin plastic household — built to last", "🛡️"),
        ("ad", "Sponsored Ad Space 1", "Promote your brand to 44+ retail partners", "📣"),
        ("ad", "Falcon Garden Tools", "Professional grade tools at dealer price", "🪓"),
    ]
    for i, (kind, h, s, e) in enumerate(cms):
        with open(f"{BASE}/cms/{kind}-{i}.svg", "w") as f:
            f.write(banner_svg(kind, i, h, s, e))
    print("cms svgs:", len(cms))

if __name__ == "__main__":
    main()
