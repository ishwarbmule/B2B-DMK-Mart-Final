#!/usr/bin/env python3
"""
Match the uploaded DMK_Mart_Products_Categories.csv (name -> top + end) to live DB products
and emit scripts/new-category-payload.json { tops, assignments } for /api/admin/catalog/apply-categories.
Mid strategy: keep the product's current mid when its current top maps to the same new top, else "General".
Also writes scripts/new-category-report.json with match diagnostics.
"""
import csv, json, re, difflib
from collections import Counter, defaultdict

CSV_PATH = "/home/z/my-project/upload/DMK_Mart_Products_Categories.csv"
DB_PATH = "/home/z/my-project/scripts/db-products-dump-2.json"
OUT_PAYLOAD = "/home/z/my-project/scripts/new-category-payload.json"
OUT_REPORT = "/home/z/my-project/scripts/new-category-report.json"

# ── Excel top name -> storefront display name (must match existing DB top names) ──
TOP_MAP = {
    "NV PRODUCTS-FERIWALA": "NV Products & Feriwala",
    "KITCHEN WARE": "Kitchen Ware",
    "Gardening Tools & Planters": "Gardening Tools & Planters",
    "Clening & HouseHolds": "Cleaning & Households",
    "Kitchen Equipments Commercial": "Commercial Kitchen Equipments",
    "Furniture": "Furniture",
    "HouseHold Unbreakable": "Household Unbreakable",
    "Home Decor": "Home Decor",
    "WATER JAR  & BOTTLE": "Water Jar & Bottles",
    "WATER JAR & BOTTLE": "Water Jar & Bottles",
}

# ── Excel end name -> clean storefront end name (special cases first) ──
END_MAP = {
    "Table,Dining,Coffee,study,Hotel,many more !": "Tables & Dining",
    "DECORE PLANTERS BY-GARDEN NEEDS": "Decor Planters — Garden Needs",
    "Cleaning Liquid / Toilet Cleaner (Unassigned)": "Toilet Cleaners",
    "Bucketmop": "Bucket Mops",
}

def clean_end(s: str) -> str:
    t = s.strip().replace("’", "'").replace("'", "")
    t = re.sub(r"(?i)^stools?$", "Stools", t)
    t = re.sub(r"(?i)^tub's$", "Tubs", t)
    t = re.sub(r"(?i)^mug$", "Mugs", t)
    t = re.sub(r"Watter", "Water", t)
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r" !$", "", t).strip()
    # Title-case ALL-CAPS names longer than 4 chars (keep short acronyms)
    if re.fullmatch(r"[A-Z0-9 &()\/\-\.']+", t) and len(t) > 4:
        t = re.sub(r"(^|[\s(\/&\-])([a-z])", lambda m: m.group(1) + m.group(2).upper(), t.lower())
        t = re.sub(r"\bSs\b", "SS", t)
        t = re.sub(r"\bNv\b", "NV", t)
        t = re.sub(r"\bGn\b", "GN", t)
        t = re.sub(r"\bHd\b", "HD", t)
    return t

def norm(s: str) -> str:
    t = s.lower()
    t = t.replace("’", "'").replace("‘", "'")
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()

def main():
    db = json.load(open(DB_PATH))
    products = db["products"]

    rows = []
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        for r in csv.reader(f):
            if len(r) >= 4 and r[1].strip() and r[1].strip().lower() != "products name":
                rows.append({"sr": r[0].strip(), "name": r[1].strip(), "top": r[2].strip(), "end": r[3].strip()})
    print(f"csv rows: {len(rows)}, db products: {len(products)}")

    # index DB by several normalized keys: name, brand+name, first-brand-word+name
    # (CSV names carry the brand prefix — "Mango vanilla Chair" vs DB "vanilla Chair" [Mango Furniture])
    by_norm = defaultdict(list)
    key_of = {}
    for p in products:
        b = norm(p["brand"])
        bw = b.split(" ")[0] if b else ""
        keys = {norm(p["name"])}
        if b:
            keys.add(norm(f"{b} {p['name']}"))
        if bw and bw not in ("dmk",):
            keys.add(norm(f"{bw} {p['name']}"))
        for k in keys:
            if not k:
                continue
            by_norm[k].append(p)
            key_of.setdefault(id(p), set()).add(k)
    for k in list(by_norm):
        if not by_norm[k]:
            del by_norm[k]

    # exact pass
    matched, unmatched = {}, []
    for row in rows:
        key = norm(row["name"])
        hits = by_norm.get(key, [])
        if hits:
            matched[row["sr"]] = hits  # sr -> [db products]
        else:
            unmatched.append(row)

    # fuzzy pass on leftovers — number-aware (sizes must match) + brand-consistent
    # (CSV "SAMARTHYA …" may only match DB products of a samarthya brand; digits 3/6/16… must be identical)
    still = []
    uniq_keys = list(by_norm.keys())
    key_digits = {k: sorted(re.findall(r"\d+", k)) for k in uniq_keys}
    BRAND_WORDS = ["mango", "falcon", "samarthya", "garden needs", "gardening needs", "namo", "mahavir",
                   "mahananda", "steel king", "pariwar", "parivar", "goldex", "shradha", "sky", "mauli",
                   "kohinoor", "posai", "galaxy", "black", "himyalya", "himalaya", "shreeji", "novae"]
    for row in unmatched:
        key = norm(row["name"])
        digits = sorted(re.findall(r"\d+", key))
        brand_hint = next((b for b in BRAND_WORDS if key.startswith(b)), None)
        # candidate restriction: same digit signature (+ same brand family when CSV names a brand)
        cands = [k for k in uniq_keys if key_digits[k] == digits and (not brand_hint or brand_hint in k)]
        close = difflib.get_close_matches(key, cands, n=2, cutoff=0.86)
        if not close:
            still.append(row)
            continue
        best = by_norm[close[0]]
        if len(close) > 1:
            r1 = difflib.SequenceMatcher(None, key, close[0]).ratio()
            r2 = difflib.SequenceMatcher(None, key, close[1]).ratio()
            if r1 - r2 < 0.03 and {id(p) for p in best} != {id(p) for p in by_norm[close[1]]}:
                still.append(row)
                continue
        matched[row["sr"]] = best

    print(f"matched rows: {len(matched)} (fuzzy included), unmatched csv rows: {len(still)}")

    # tops payload (sortOrder by product volume, preserve existing names/images — no image key = untouched)
    top_count = Counter()
    seen = set()
    for sr, plist in matched.items():
        row = next(r for r in rows if r["sr"] == sr)
        top = TOP_MAP.get(row["top"])
        if not top:
            continue
        for p in plist:
            if p["sku"] in seen:
                continue
            seen.add(p["sku"])
            top_count[top] += 1
    tops = [
        {"name": name, "emoji": "🧺", "color": "#facc15", "sortOrder": (i + 1) * 10}
        for i, (name, _n) in enumerate(sorted(top_count.items(), key=lambda kv: -kv[1]))
    ]

    # assignments (deduped by sku — several CSV rows can map to the same DB product)
    assignments, used_skus = [], set()
    skipped_rows = []
    for sr, plist in matched.items():
        row = next(r for r in rows if r["sr"] == sr)
        top = TOP_MAP.get(row["top"])
        if not top:
            skipped_rows.append(row)
            continue
        end_raw = END_MAP.get(row["end"]) or clean_end(row["end"])
        for p in plist:
            if p["sku"] in used_skus:
                continue
            used_skus.add(p["sku"])
            mid = p["mid"].strip() if (p["top"] == top and p["mid"].strip()) else "General"
            assignments.append({"sku": p["sku"], "top": top, "mid": mid, "end": end_raw})

    # diagnostics
    db_skus = {p["sku"] for p in products}
    untouched = db_skus - used_skus
    end_pairs = sorted({(a["top"], a["end"]) for a in assignments})
    report = {
        "csv_rows": len(rows),
        "db_products": len(products),
        "matched_csv_rows": len(matched),
        "unmatched_csv_rows": [{"sr": r["sr"], "name": r["name"], "top": r["top"], "end": r["end"]} for r in still],
        "skipped_rows": skipped_rows,
        "db_products_untouched": sorted(untouched),
        "distinct_top_end_pairs": len(end_pairs),
    }
    json.dump({"tops": tops, "assignments": assignments}, open(OUT_PAYLOAD, "w"), ensure_ascii=False)
    json.dump(report, open(OUT_REPORT, "w"), ensure_ascii=False, indent=1)

    print(f"tops: {tops.__len__()} | assignments: {len(assignments)} | distinct (top,end): {len(end_pairs)}")
    print(f"db products touched: {len(used_skus)} / {len(products)} (untouched: {len(untouched)})")
    print("\ntop-level distribution:")
    for t in tops:
        n = sum(1 for a in assignments if a["top"] == t["name"])
        print(f"  {t['name']}: {n}")
    print("\nsample end categories per top:")
    by_top = defaultdict(set)
    for a in assignments:
        by_top[a["top"]].add(a["end"])
    for t, ends in by_top.items():
        print(f"  {t} ({len(ends)} ends): {sorted(ends)[:8]}{' …' if len(ends) > 8 else ''}")
    if still:
        print(f"\nUNMATCHED CSV rows ({len(still)}) — first 15:")
        for r in still[:15]:
            print(f"  [{r['sr']}] {r['name']}  →  {r['top']} / {r['end']}")

if __name__ == "__main__":
    main()
