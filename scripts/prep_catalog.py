#!/usr/bin/env python3
"""Convert DMK Excel to seed JSON."""
import pandas as pd, json, re

xl = pd.ExcelFile("/home/z/my-project/upload/DMK_Mart_All_Products_Brands_and_Categories.xlsx")
df = xl.parse("All Products & Brands")

slugs = json.load(open("/home/z/my-project/scripts/brand-slugs.json"))
topidx = json.load(open("/home/z/my-project/scripts/top-index.json"))

EMOJIS = {
    "Furniture": "🪑", "Gardening Tools & Planters": "🪴", "Clening & HouseHolds": "🧹",
    "Home Decor": "🖼️", "HouseHold Unbreakable": "🛡️", "KITCHEN WARE": "🍳",
    "Kitchen Equipments Commercial": "🍽️", "NV PRODUCTS-FERIWALA": "🧺",
    "WATER JAR  & BOTTLE": "🫙", "WATER JAR & BOTTLE": "🫙",
}

tops, mids, ends = [], [], {}
seen_top, seen_mid, seen_end = set(), set(), set()
products, seen_sku = [], {}

for i, r in df.iterrows():
    top = str(r["Top Category"]).strip()
    mid = str(r["Mid Category"]).strip()
    end = str(r["End Category"]).strip()
    brand = str(r["Brand Name"]).strip()
    sku = str(r["Item Code / SKU"]).strip()

    if top not in seen_top:
        seen_top.add(top)
        tops.append({"name": top, "emoji": EMOJIS.get(top, "🧺"),
                     "image": f"/categories/top-{topidx[top]}.svg", "sortOrder": len(tops)})
    mk = (top, mid)
    if mk not in seen_mid:
        seen_mid.add(mk)
        mids.append({"name": mid, "top": top})
    ek = (mid, end)
    if ek not in seen_end:
        seen_end.add(ek)
        ends[ek] = len(ends)

    if sku in seen_sku:
        seen_sku[sku] += 1
        sku = f"{sku}-{seen_sku[sku]}"
    else:
        seen_sku[sku] = 1

    products.append({
        "sku": sku,
        "name": str(r["Product Name"]).strip(),
        "brand": brand,
        "logo": f"/companies/{slugs[brand]}.svg",
        "top": top, "mid": mid, "end": end,
        "dealerPrice": float(r["Wholesale Dealer Price (INR)"]),
        "basePrice": float(r["Base Price (INR)"]),
        "mrp": float(r["MRP / Old Price (INR)"]),
        "packSize": int(r["Pack Size (Units)"]),
        "stock": int(r["Stock Qty"]),
        "isFeatured": str(r["Is Featured"]).strip().lower() == "yes",
        "active": str(r["Status"]).strip().lower() == "active",
        "image": f"/products/{sku}.svg",
        "barcode": str(r["Item Code / SKU"]).strip(),
        "hsn": "",
        "gst": 18,
    })

# flag hot/top: hot = deep discount (>= p90); top = composite rank of stock & discount
ranked = sorted(products, key=lambda p: ((p["mrp"] - p["dealerPrice"]) / p["mrp"] if p["mrp"] else 0) * 100 + p["stock"] / 10, reverse=True)
top_set = {id(p) for p in ranked[:120]}
for p in products:
    disc = (p["mrp"] - p["dealerPrice"]) / p["mrp"] if p["mrp"] else 0
    p["isHot"] = p["active"] and disc >= 0.72
    p["isTop"] = p["active"] and id(p) in top_set

out = {"tops": tops, "mids": mids, "ends": [{"name": e[1], "mid": e[0]} for e in ends],
       "brands": [{"name": b, "logo": f"/companies/{slugs[b]}.svg"} for b in df["Brand Name"].unique()],
       "products": products}
with open("/home/z/my-project/scripts/dmk-catalog.json", "w") as f:
    json.dump(out, f)
print("tops:", len(tops), "mids:", len(mids), "ends:", len(ends), "brands:", len(out["brands"]), "products:", len(products))
print("hot:", sum(1 for p in products if p["isHot"]), "top:", sum(1 for p in products if p["isTop"]), "featured:", sum(1 for p in products if p["isFeatured"]))
