#!/usr/bin/env python3
"""Fix the 2 unmatched top-category variants by mapping them to the site's exact names."""
import json, re, subprocess, os, tempfile

BASE = "https://b2b-dmk-mart.vercel.app"
SECRET = open("/home/z/my-project/.cron-secret").read().strip()

MAP = {
    "Kitchen Equipments Commercial": "Commercial Kitchen Equipments",
    "WATER JAR  & BOTTLE": "Water Jar & Bottles",
}

xl = json.load(open("/home/z/my-project/scripts/excel-products.json"))["rows"]
updates = []
for r in xl:
    top = str(r.get("Top Level Category") or "").strip()
    if top in MAP:
        sku = str(r.get("SKU") or "").strip()
        if sku:
            updates.append({"sku": sku, "set": {"topCategoryText": MAP[top]}})
print(f"rows to patch: {len(updates)}")

def post(payload):
    fd, path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w") as f: json.dump(payload, f)
    out = subprocess.run(["curl", "-s", "--max-time", "180", "-X", "POST",
        f"{BASE}/api/admin/sync/migrate-inventory?key={SECRET}",
        "-H", "content-type: application/json", "--data-binary", f"@{path}"],
        capture_output=True, text=True).stdout
    os.unlink(path)
    return json.loads(out)

for i in range(0, len(updates), 400):
    d = post({"mode": "apply-plan", "updates": updates[i:i+400], "creates": []})
    print(f"  chunk {i}: rows={d.get('updatedRows')} unmatched={d.get('unmatchedCategories')}")
print("done")
