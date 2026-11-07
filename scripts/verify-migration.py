#!/usr/bin/env python3
"""Post-migration verification against production (minimal queries)."""
import json, subprocess, sys

BASE = "https://b2b-dmk-mart.vercel.app"

def get(path):
    out = subprocess.run(["curl", "-s", "--max-time", "90", f"{BASE}{path}"], capture_output=True, text=True).stdout
    try: return json.loads(out)
    except Exception: return {"_raw": out[:200]}

xl = json.load(open("/home/z/my-project/scripts/excel-products.json"))["rows"]

# 1) site health
health = get("/api/products?limit=1")
total = health.get("total")
print(f"catalog total (active): {total}")
if total is None:
    print("STILL DOWN:", health)
    sys.exit(1)

# 2) sample checks: 12 random sheet rows — SKU + name + company + price present
import random
random.seed(7)
samples = random.sample([r for r in xl if str(r.get("Status")) == "ACTIVE"], 12)
ok = 0
for r in samples:
    sku, name, t4 = str(r["SKU"]), str(r["Product Name"]), str(r.get("Tier 4 Retailer"))
    d = get(f"/api/products?limit=1&all=1&q={sku}")
    rows = d.get("products") or []
    if rows and rows[0]["sku"] == sku:
        p = rows[0]
        name_ok = p["name"] == name
        print(f"  ✓ {sku} | {p['name'][:38]:40} | company={p.get('company')} | tier4={p.get('tier4')} (sheet {t4}) | name_match={name_ok}")
        ok += 1 if name_ok else 0
    else:
        # try by name
        d2 = get(f"/api/products?limit=1&all=1&q={name[:30]}")
        rows2 = d2.get("products") or []
        print(f"  ✗ {sku} NOT FOUND by sku (name-search top: {rows2[0]['sku'] if rows2 else 'none'})")
print(f"sample name-match: {ok}/12")

# 3) old SKUs must be gone from active catalog (spot check)
old_skus = json.load(open("/home/z/my-project/scripts/live-vs-excel.json"))["live_only"][:8]
leftover = 0
for osku in old_skus:
    d = get(f"/api/products?limit=1&all=1&q={osku}")
    if (d.get("products") or []):
        leftover += 1
        print(f"  OLD SKU STILL PRESENT: {osku} -> {d['products'][0]['name'][:40]}")
print(f"old-SKU leftovers (of {len(old_skus)} sampled): {leftover}")
