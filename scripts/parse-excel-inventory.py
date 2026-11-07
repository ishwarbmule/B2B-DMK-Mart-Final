#!/usr/bin/env python3
"""Parse the uploaded inventory Excel fully: columns, rows, SKUs, companies, categories, stats."""
import json, re
from collections import Counter

try:
    import openpyxl
except ImportError:
    import subprocess, sys
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "openpyxl"], check=True)
    import openpyxl

SRC = "/home/z/my-project/upload/dmk-products-all-2026-11-07_gst_delivery.xlsx"
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
print("SHEETS:", wb.sheetnames)
ws = wb[wb.sheetnames[0]]

rows = list(ws.iter_rows(values_only=True))
header = [str(h).strip() if h is not None else "" for h in rows[0]]
data = rows[1:]
print("COLUMNS:", json.dumps(header, ensure_ascii=False))
print("DATA ROWS:", len(data))

def cell(v):
    if v is None: return ""
    s = str(v).strip()
    return "" if s in ("*", "-", "NULL", "null") else s

recs = []
for r in data:
    rec = {header[i]: cell(r[i]) if i < len(r) else "" for i in range(len(header))}
    recs.append(rec)

# stats
skus = [r.get("SKU", "") for r in recs]
names = [r.get("Product Name", "") for r in recs]
print("\n=== SKU stats ===")
print("non-empty SKUs:", sum(1 for s in skus if s))
print("unique SKUs:", len(set(s for s in skus if s)))
dupes = [s for s, c in Counter(skus).items() if c > 1 and s]
print("duplicate SKUs:", len(dupes), dupes[:10])
print("empty-SKU rows:", sum(1 for s in skus if not s))
print("empty-name rows:", sum(1 for n in names if not n))

print("\n=== SKU format patterns (first 12 distinct prefixes) ===")
pat = Counter(re.sub(r"\d+$", "#", s)[:10] for s in skus if s)
for p, c in pat.most_common(12): print(f"  {p}  x{c}")

print("\n=== Companies ===")
for comp, c in Counter(r.get("Company", "") or "(blank)" for r in recs).most_common(40):
    print(f"  {comp}  x{c}")

print("\n=== Top Level Category values ===")
for t, c in Counter(r.get("Top Level Category", "") or "(blank)" for r in recs).most_common(30):
    print(f"  {t}  x{c}")

print("\n=== End Level Category values (top 30) ===")
for t, c in Counter(r.get("End Level Category", "") or "(blank)" for r in recs).most_common(30):
    print(f"  {t}  x{c}")

print("\n=== Units ===", dict(Counter(r.get("Unit", "") or "(blank)" for r in recs).most_common(12)))
print("=== Status ===", dict(Counter(r.get("Status", "") or "(blank)" for r in recs).most_common(8)))
print("=== GST % ===", dict(Counter(r.get("GST %", "") or "(blank)" for r in recs).most_common(8)))
print("=== HSN ===", dict(Counter(r.get("HSN", "") or "(blank)" for r in recs).most_common(8)))

# Delivery Rate stats
dr = [r.get("Delivery Rate", "") for r in recs]
print("\n=== Delivery Rate === non-empty:", sum(1 for v in dr if v), "distinct:", sorted(set(dr))[:10])

# numeric sanity: tier columns
import statistics
def nums(col):
    out = []
    for r in recs:
        v = r.get(col, "")
        try: out.append(float(v))
        except: pass
    return out
for col in ["Cost Price", "Tier 1 Distributor", "Tier 2 Wholesale", "Tier 3 Semi-Wholesale", "Tier 4 Retailer", "Tier 5 MRP", "Sellable Stock", "Damaged Stock", "Reserved", "Low Stock Threshold", "Pack Qty", "Weight (g)", "Pieces/Box"]:
    ns = nums(col)
    print(f"  {col}: n={len(ns)} min={min(ns) if ns else '-'} max={max(ns) if ns else '-'} mean={round(statistics.mean(ns),2) if ns else '-'}")

# created-on range
co = sorted(set(r.get("Created On", "") for r in recs if r.get("Created On")))
print("\n=== Created On range ===", co[:3], "…", co[-3:] if len(co) > 3 else "")

# image urls
img = [r.get("Image URL", "") for r in recs]
print("Image URL non-empty:", sum(1 for v in img if v), "| cloudinary:", sum(1 for v in img if "cloudinary" in v), "| local /api/v1:", sum(1 for v in img if v.startswith("/api")))

# save full json for later steps
with open("/home/z/my-project/scripts/excel-products.json", "w", encoding="utf-8") as f:
    json.dump({"header": header, "rows": recs}, f, ensure_ascii=False)
print("\nSaved -> scripts/excel-products.json")
