#!/usr/bin/env python3
"""Pull the full live catalog (admin all=1) and compare SKUs/names with the Excel sheet."""
import json, re, subprocess, difflib

def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

# 1) fetch all live products
live = []
page = 1
while True:
    url = f"https://b2b-dmk-mart.vercel.app/api/products?all=1&limit=60&page={page}"
    out = subprocess.run(["curl", "-s", "--max-time", "90", url], capture_output=True, text=True).stdout
    d = json.loads(out)
    rows = d.get("products") or []
    if not rows: break
    for r in rows:
        live.append({"sku": str(r.get("sku") or ""), "name": str(r.get("name") or ""), "slug": str(r.get("slug") or "")})
    if page >= d.get("pages", 1): break
    page += 1
print("live products fetched:", len(live))

xl = json.load(open("/home/z/my-project/scripts/excel-products.json"))
xl_rows = xl["rows"]
print("excel rows:", len(xl_rows))

live_skus = {p["sku"] for p in live if p["sku"]}
xl_skus = {r["SKU"] for r in xl_rows if r.get("SKU")}
print("\n=== SKU overlap ===")
print("live unique SKUs:", len(live_skus), "| excel unique SKUs:", len(xl_skus))
print("exact SKU match:", len(live_skus & xl_skus))
live_only = live_skus - xl_skus
xl_only = xl_skus - live_skus
print("live-only (not in excel):", len(live_only))
print("excel-only (not live):", len(xl_only))

# prefix pattern comparison
def prefix(s): return re.sub(r"\d+$", "#", s)[:8]
from collections import Counter
print("\n=== live SKU prefixes (top 15) ===")
for p, c in Counter(prefix(s) for s in live_skus).most_common(15): print(f"  {p} x{c}")

# name-based matching for mismatches
live_by_name = {}
for p in live: live_by_name.setdefault(norm(p["name"]), []).append(p)
xl_only_named = [(r["SKU"], r["Product Name"]) for r in xl_rows if r.get("SKU") in xl_only and r.get("Product Name")]
matched_by_name = 0
examples = []
for sku, name in xl_only_named[:2000]:
    key = norm(name)
    if key in live_by_name:
        matched_by_name += 1
        if len(examples) < 12: examples.append((sku, name, live_by_name[key][0]["sku"]))
print("\n=== name-match for excel-only SKUs ===")
print("excel-only rows:", len(xl_only_named), "| matched by exact normalized name:", matched_by_name)
print("samples (excelSKU | name -> liveSKU):")
for e in examples: print("  ", e[0], "|", e[1][:45], "->", e[2])

# fuzzy sample for remaining
unmatched = [(s, n) for s, n in xl_only_named if norm(n) not in live_by_name]
print("\nexcel-only unmatched by name:", len(unmatched))
fuzzy_hits = 0
fu_examples = []
for sku, name in unmatched[:400]:
    key = norm(name)
    best = difflib.get_close_matches(key, list(live_by_name.keys()), n=1, cutoff=0.85)
    if best:
        fuzzy_hits += 1
        if len(fu_examples) < 10: fu_examples.append((sku, name, live_by_name[best[0]][0]["sku"], live_by_name[best[0]][0]["name"]))
print("fuzzy(0.85) hits in first 400:", fuzzy_hits)
for e in fu_examples: print("  ", e[0], "|", e[1][:40], "~~>", e[2], "|", e[3][:40])

live_only_named = [(p["sku"], p["name"]) for p in live if p["sku"] in live_only]
print("\n=== live-only samples (first 15) ===")
for s, n in live_only_named[:15]: print("  ", s, "|", n[:60])

json.dump({"live": live, "live_only": sorted(live_only), "xl_only": sorted(xl_only)}, open("/home/z/my-project/scripts/live-vs-excel.json", "w"))
print("\nSaved -> scripts/live-vs-excel.json")
