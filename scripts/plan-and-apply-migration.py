#!/usr/bin/env python3
"""Compute the SKU-renumber migration plan locally (fast, precise) and push it to
/api/admin/sync/migrate-inventory?mode=apply-plan in chunks.

Matching (per sheet row, in order):
  1. sheet SKU == live SKU → update in place
  2. unique normalized-name match → rename + update
  3. inside duplicate-name groups: prefer same company (legacy brand name), then
     pair by SKU numeric-suffix order, each live product used at most once
  4. no match → CREATE as a new product
Blank sheet cells → field omitted from the plan → current DB value kept.
"""
import json, re, subprocess, sys
from collections import defaultdict

BASE = "https://b2b-dmk-mart.vercel.app"
SECRET = open("/home/z/my-project/.cron-secret").read().strip()

def norm(s):
    s = str(s or "").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def num(v):
    s = str(v or "").strip()
    if not s: return None
    try: return float(s)
    except ValueError: return None

def strv(v): 
    s = str(v or "").strip()
    return "" if s in ("*", "-", "NULL") else s

def suffix(sku):
    m = re.search(r"(\d+)$", sku)
    return int(m.group(1)) if m else 1 << 60

# ── 1) fetch live catalog (sku, name, brand.name ≈ backfilled company, active) ──
live = []
page = 1
while True:
    out = subprocess.run(["curl", "-s", "--max-time", "90",
        f"{BASE}/api/products?all=1&limit=60&page={page}"], capture_output=True, text=True).stdout
    d = json.loads(out)
    rows = d.get("products") or []
    if not rows: break
    for r in rows:
        live.append({
            "sku": r.get("sku") or "", "name": r.get("name") or "",
            "company": ((r.get("brand") or {}).get("name")) or "",
            "active": bool(r.get("active")),
        })
    if page >= d.get("pages", 1): break
    page += 1
print(f"live catalog: {len(live)}")

by_sku = {p["sku"]: p for p in live}
used = set()
by_name = defaultdict(list)
for p in live:
    by_name[norm(p["name"])].append(p)

# ── 2) build the plan ──
xl = json.load(open("/home/z/my-project/scripts/excel-products.json"))["rows"]
updates, creates = [], []
renames, plan_created = [], []
match_stats = defaultdict(int)

FIELD_MAP = {  # sheet column -> plan set key
    "Product Name": "name", "Company": "company", "Unit": "unit", "HSN": "hsn",
    "GST %": "gst", "Delivery Rate": "deliveryRate", "Cost Price": "purchaseCost",
    "Pack Qty": "packQty", "Tier 1 Distributor": "tier1", "Tier 2 Wholesale": "tier2",
    "Tier 3 Semi-Wholesale": "tier3", "Tier 4 Retailer": "tier4", "Tier 5 MRP": "tier5",
    "Sellable Stock": "stock", "Damaged Stock": "damagedStock", "Reserved": "reservedQty",
    "Low Stock Threshold": "lowStockThreshold", "Barcode": "barcode",
    "Weight (g)": "weightGrams", "Pieces/Box": "piecesPerBox", "Image URL": "image",
}
NUMERIC = {"gst", "deliveryRate", "purchaseCost", "packQty", "tier1", "tier2", "tier3",
           "tier4", "tier5", "stock", "damagedStock", "reservedQty", "lowStockThreshold",
           "weightGrams", "piecesPerBox"}

for r in xl:
    new_sku = strv(r.get("SKU"))
    name = strv(r.get("Product Name"))
    company = strv(r.get("Company"))
    if not new_sku or not name:
        continue
    status = strv(r.get("Status")).upper()

    target = None
    if new_sku in by_sku and new_sku not in used:
        target = by_sku[new_sku]; match_stats["by-sku"] += 1
    else:
        group = [p for p in by_name.get(norm(name), []) if p["sku"] not in used]
        if len(group) == 1:
            target = group[0]; match_stats["by-name"] += 1
        elif len(group) > 1:
            ck = norm(company)
            pool = [p for p in group if norm(p["company"]) == ck] or group
            pool.sort(key=lambda p: suffix(p["sku"]))
            target = pool[0]; match_stats["by-group-order"] += 1

    st = {}
    if target:
        used.add(target["sku"])
        if target["sku"] != new_sku:
            renames.append([target["sku"], new_sku])
        st["sku"] = new_sku
        for col, key in FIELD_MAP.items():
            v = strv(r.get(col))
            if not v: continue
            st[key] = num(v) if key in NUMERIC else v
        if company: st["company"] = company
        st["topCategoryText"] = strv(r.get("Top Level Category"))
        st["endCategoryText"] = strv(r.get("End Level Category"))
        if status in ("ACTIVE", "INACTIVE"):
            st["active"] = status == "ACTIVE"
            st["activeSource"] = "ERP"
        st["syncSource"] = "ERP"
        co = strv(r.get("Created On"))
        if re.match(r"^\d{4}-\d{2}-\d{2}", co): st["createdAt"] = co
        # derived selling prices from tiers (same rule as the ERP sync)
        t4, t5, t3 = num(r.get("Tier 4 Retailer")), num(r.get("Tier 5 MRP")), num(r.get("Tier 3 Semi-Wholesale"))
        dealer = t4 if (t4 or 0) > 0 else (t5 if (t5 or 0) > 0 else (t3 or 0))
        mrp = t5 if (t5 or 0) > 0 else dealer
        base = t3 if (t3 or 0) > 0 else dealer
        if dealer is not None: st["dealerPrice"] = dealer
        if base is not None: st["basePrice"] = base
        if mrp is not None: st["mrp"] = mrp
        updates.append({"sku": target["sku"], "set": st})
    else:
        match_stats["create"] += 1
        t4, t5, t3 = num(r.get("Tier 4 Retailer")) or 0, num(r.get("Tier 5 MRP")) or 0, num(r.get("Tier 3 Semi-Wholesale")) or 0
        dealer = t4 if t4 > 0 else (t5 if t5 > 0 else t3)
        mrp = t5 if t5 > 0 else dealer
        base = t3 if t3 > 0 else dealer
        comp = company or "DMK Mart"
        slug = re.sub(r"[^a-z0-9]+", "-", f"{comp}-{name}".lower()).strip("-")[:60]
        slug = f"{slug}-{new_sku[-6:].lower()}"
        img = strv(r.get("Image URL"))
        creates.append({
            "sku": new_sku, "slug": slug, "name": name, "company": comp,
            "unit": strv(r.get("Unit")) or "Pcs", "hsn": strv(r.get("HSN")),
            "gst": num(r.get("GST %")) or 18, "deliveryRate": num(r.get("Delivery Rate")) or 0,
            "purchaseCost": num(r.get("Cost Price")) or 0,
            "packQty": max(1, round(num(r.get("Pack Qty")) or 1)),
            "tier1": num(r.get("Tier 1 Distributor")) or 0, "tier2": num(r.get("Tier 2 Wholesale")) or 0,
            "tier3": t3, "tier4": t4, "tier5": t5,
            "dealerPrice": dealer, "basePrice": base, "mrp": mrp,
            "stock": num(r.get("Sellable Stock")) or 0,
            "damagedStock": num(r.get("Damaged Stock")) or 0,
            "reservedQty": num(r.get("Reserved")) or 0,
            "lowStockThreshold": round(num(r.get("Low Stock Threshold")) or 10),
            "barcode": strv(r.get("Barcode")) or new_sku,
            "weightGrams": num(r.get("Weight (g)")) or 0,
            "piecesPerBox": max(1, round(num(r.get("Pieces/Box")) or 1)),
            "image": img or "/dmk-logo.png",
            "gallery": json.dumps([img]) if img.startswith("http") else "[]",
            "description": f"{name} — {comp}.",
            "seoTitle": f"{name} | DMK Mart B2B",
            "seoDesc": f"Buy {name} at wholesale price on DMK Mart.",
            "keywords": f"{name}, {comp}, wholesale",
            "active": status != "INACTIVE",
            "createdAt": strv(r.get("Created On")) or None,
            "topCategoryText": strv(r.get("Top Level Category")),
            "endCategoryText": strv(r.get("End Level Category")),
        })

print("match stats:", dict(match_stats))
print(f"updates: {len(updates)}  creates: {len(creates)}  renames: {len(renames)}")
json.dump({"renames": renames, "created": [c["sku"] for c in creates]},
          open("/home/z/my-project/scripts/migration-renames.json", "w"))

# creates need real category ids — resolve via a categories API? Not public.
# Send creates with category text; extend server to resolve for creates too.
# (apply-plan creates path maps topCategoryText/endCategoryText server-side.)

# ── 3) push in chunks ──
CHUNK = 400
tot_u = tot_c = 0
unmatched = set()
for i in range(0, max(len(updates), 1), CHUNK):
    u_chunk = updates[i:i + CHUNK]
    body = {"mode": "apply-plan", "updates": u_chunk, "creates": []}
    out = subprocess.run(["curl", "-s", "--max-time", "180", "-X", "POST",
        f"{BASE}/api/admin/sync/migrate-inventory?key={SECRET}",
        "-H", "content-type: application/json", "-d", json.dumps(body)], capture_output=True, text=True).stdout
    d = json.loads(out)
    if not d.get("ok"):
        print("UPDATE CHUNK FAILED:", json.dumps(d)[:400]); sys.exit(1)
    tot_u += d.get("updatedRows", 0)
    unmatched.update(d.get("unmatchedCategories") or [])
    print(f"  updates {i}+{len(u_chunk)}: rows={d.get('updatedRows')} ({d.get('durationMs')}ms)")

for i in range(0, len(creates), CHUNK):
    c_chunk = creates[i:i + CHUNK]
    body = {"mode": "apply-plan", "updates": [], "creates": c_chunk}
    out = subprocess.run(["curl", "-s", "--max-time", "180", "-X", "POST",
        f"{BASE}/api/admin/sync/migrate-inventory?key={SECRET}",
        "-H", "content-type: application/json", "-d", json.dumps(body)], capture_output=True, text=True).stdout
    d = json.loads(out)
    if not d.get("ok"):
        print("CREATE CHUNK FAILED:", json.dumps(d)[:400]); sys.exit(1)
    tot_c += d.get("createdRows", 0)
    unmatched.update(d.get("unmatchedCategories") or [])
    print(f"  creates {i}+{len(c_chunk)}: created={d.get('createdRows')}")

print("\n════ PLAN APPLIED ════")
print(f"DB rows updated: {tot_u} | products created: {tot_c}")
print(f"SKU renames: {len(renames)}")
print(f"unmatched categories ({len(unmatched)}):", sorted(unmatched)[:25])
