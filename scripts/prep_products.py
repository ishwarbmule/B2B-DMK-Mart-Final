#!/usr/bin/env python3
"""Preprocess DMK Mart products xlsx -> clean JSON for seeding."""
import hashlib
import json

import pandas as pd

SRC = "/home/z/my-project/upload/dmk-products-2026-10-07.xlsx"
OUT = "/home/z/my-project/scripts/dmk-products.json"

# Category group mapping: (group_name, emoji, color, bgFrom, bgTo)
GROUPS = {
    "Planters & Garden": ("Planter", "Garden Tool", "Pot"),
    "Buckets & Tubs": ("Bucket", "Tub"),
    "Storage & Organization": ("Container", "Storage Box", "Basket", "Drum", "Lunch Box", "Bread Box", "Hot Pot"),
    "Jars & Bottles": ("Jar", "Bottle", "Jug"),
    "Cookware & Kitchenware": ("Kadhai", "Pan", "Fryer", "Bowl", "Thali", "Juicer"),
    "Kitchen Tools": ("Knife/Cutter", "Spoon"),
    "Dining & Serveware": ("Tray", "Glass/Tumbler"),
    "Cleaning Tools": ("Mop", "Wiper", "Broom", "Brush", "Dustpan", "Broom/Mop Accessory", "Bucketmop", "Bucket Pipe Set"),
    "Furniture & Seating": ("Chair", "Table", "Stool", "Baby Furniture", "Baby Walker"),
    "Racks & Stands": ("Rack", "Stand"),
    "Appliances & Machines": ("Machine", "Pulveriser", "Mixer Grinder", "Oven"),
    "Dustbins & Waste": ("Dustbin",),
    "Bath & Utility": ("Basin", "Mug", "Soap Dispenser"),
    "Household Essentials": ("General", "Other", "Jali"),
}

GROUP_STYLE = {
    "Planters & Garden": ("🪴", "#16a34a", "#dcfce7", "#86efac"),
    "Buckets & Tubs": ("🪣", "#0284c7", "#e0f2fe", "#7dd3fc"),
    "Storage & Organization": ("📦", "#7c3aed", "#f3e8ff", "#c084fc"),
    "Jars & Bottles": ("🫙", "#0891b2", "#ecfeff", "#a5f3fc"),
    "Cookware & Kitchenware": ("🍳", "#ea580c", "#ffedd5", "#fdba74"),
    "Kitchen Tools": ("🔪", "#dc2626", "#fee2e2", "#fca5a5"),
    "Dining & Serveware": ("🍽️", "#db2777", "#fce7f3", "#f9a8d4"),
    "Cleaning Tools": ("🧹", "#0d9488", "#ccfbf1", "#5eead4"),
    "Furniture & Seating": ("🪑", "#9333ea", "#f3e8ff", "#d8b4fe"),
    "Racks & Stands": ("🗄️", "#b45309", "#fef3c7", "#fcd34d"),
    "Appliances & Machines": ("⚙️", "#475569", "#e2e8f0", "#cbd5e1"),
    "Dustbins & Waste": ("🗑️", "#65a30d", "#ecfccb", "#bef264"),
    "Bath & Utility": ("🚿", "#06b6d4", "#cffafe", "#67e8f9"),
    "Household Essentials": ("🏠", "#525252", "#f5f5f4", "#e7e5e4"),
}

cat_to_group = {}
for g, cats in GROUPS.items():
    for c in cats:
        cat_to_group[c.strip().lower()] = g

SORT_ORDER = {g: i + 1 for i, (g, *_rest) in enumerate(GROUP_STYLE.items())}


def pick_price(*vals):
    for v in vals:
        v = float(v or 0)
        if v > 0:
            return round(v, 2)
    return 0.0


def rating_for(sku: str) -> float:
    h = int(hashlib.md5(sku.encode()).hexdigest(), 16)
    return round(3.8 + (h % 12) / 10.0, 1)


def main():
    df = pd.read_excel(SRC, sheet_name="Products")
    df.columns = [c.strip() for c in df.columns]

    products = []
    for _, r in df.iterrows():
        raw_cat = str(r["Category"]).strip()
        group = cat_to_group.get(raw_cat.lower(), "Household Essentials")
        emoji, _color, bg_from, bg_to = GROUP_STYLE[group]

        tier1 = pick_price(r["Tier 1 Distributor"])
        tier2 = pick_price(r["Tier 2 Wholesale"])
        tier3 = pick_price(r["Tier 3 Semi-Wholesale"])
        tier4 = pick_price(r["Tier 4 Retailer"])
        mrp_raw = pick_price(r["Tier 5 MRP"])
        cost = pick_price(r["Cost Price"])

        price = pick_price(tier4, tier3, tier2, tier1, mrp_raw, cost)
        mrp = mrp_raw if mrp_raw >= price else price

        pack_qty = int(float(r["Pack Qty"])) if pd.notna(r["Pack Qty"]) and float(r["Pack Qty"]) > 0 else 1
        unit = str(r["Unit"]).strip() or "Pcs"
        pack_size = f"Pack of {pack_qty}" if pack_qty > 1 else f"1 {unit}"

        stock = int(float(r["Sellable Stock"] or 0))
        status = str(r["Status"]).strip().upper()
        active = status == "ACTIVE"

        disc = round(((mrp - price) / mrp) * 100) if mrp > price else 0

        products.append(
            {
                "sku": str(r["SKU"]).strip(),
                "name": str(r["Product Name"]).strip(),
                "brand": (str(r["Brand"]).strip() if pd.notna(r["Brand"]) and str(r["Brand"]).strip() else (str(r["Company"]).strip() if pd.notna(r["Company"]) else "DMK Mart")),
                "company": str(r["Company"]).strip() if pd.notna(r["Company"]) else "",
                "group": group,
                "rawCategory": raw_cat,
                "unit": unit,
                "hsn": str(r["HSN"]).strip() if pd.notna(r["HSN"]) else "",
                "gst": float(r["GST %"] or 0),
                "costPrice": cost,
                "tier1": tier1,
                "tier2": tier2,
                "tier3": tier3,
                "tier4": tier4,
                "mrp": round(mrp, 2),
                "price": price,
                "discount": disc,
                "packQty": pack_qty,
                "packSize": pack_size,
                "stock": stock,
                "damaged": int(float(r["Damaged Stock"] or 0)),
                "reserved": int(float(r["Reserved"] or 0)),
                "lowStock": int(float(r["Low Stock Threshold"] or 10)),
                "barcode": str(r["Barcode"]).strip() if pd.notna(r["Barcode"]) else "",
                "active": active,
                "emoji": emoji,
                "bgFrom": bg_from,
                "bgTo": bg_to,
                "rating": rating_for(str(r["SKU"])),
                "isDeal": bool(active and disc >= 35 and stock > 0),
            }
        )

    with open(OUT, "w") as f:
        json.dump(products, f, indent=1, ensure_ascii=False)

    active = [p for p in products if p["active"]]
    print(f"Total: {len(products)} | Active: {len(active)} | Inactive: {len(products) - len(active)}")
    print(f"Deals: {sum(1 for p in products if p['isDeal'])}")
    groups = {}
    for p in products:
        groups[p["group"]] = groups.get(p["group"], 0) + 1
    for g, n in sorted(groups.items(), key=lambda kv: SORT_ORDER[kv[0]]):
        print(f"  {g}: {n}")
    print(f"Saved -> {OUT}")


if __name__ == "__main__":
    main()
