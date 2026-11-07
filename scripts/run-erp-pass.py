#!/usr/bin/env python3
"""ERP pass (chunked): align the owner's ERP MySQL products table to the sheet via mode=erp-rows."""
import json, subprocess, os, tempfile, sys, time

BASE = "https://b2b-dmk-mart.vercel.app"
SECRET = open("/home/z/my-project/.cron-secret").read().strip()

xl = json.load(open("/home/z/my-project/scripts/excel-products.json"))["rows"]
mig = json.load(open("/home/z/my-project/scripts/migration-renames.json"))
renames = mig.get("renames") if isinstance(mig, dict) else mig
print(f"rows: {len(xl)}, renames: {len(renames)}")

def post(payload):
    fd, path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(payload, f)
    out = subprocess.run(["curl", "-s", "--max-time", "180", "-X", "POST",
        f"{BASE}/api/admin/sync/migrate-inventory?key={SECRET}",
        "-H", "content-type: application/json", "--data-binary", f"@{path}"],
        capture_output=True, text=True).stdout
    os.unlink(path)
    try:
        return json.loads(out)
    except Exception:
        return {"ok": False, "error": out[:200]}

CHUNK = 60
tot_u = tot_i = 0
errors = []
backup = ""
cols = {}
for i in range(0, len(xl), CHUNK):
    chunk = xl[i:i + CHUNK]
    d = post({"mode": "erp-rows", "rows": chunk, "renames": renames})
    if not d.get("ok"):
        print(f"CHUNK @{i} FAILED:", json.dumps(d)[:300]); sys.exit(1)
    tot_u += d.get("updated", 0)
    tot_i += d.get("inserted", 0)
    errors += d.get("errors") or []
    backup = d.get("backupTable") or backup
    cols = d.get("columns") or cols
    print(f"  erp {i}+{len(chunk)}: updated={d.get('updated')} inserted={d.get('inserted')}")
    time.sleep(2)

print("\n════ ERP ALIGNMENT DONE ════")
print(f"updated: {tot_u} | inserted: {tot_i} | backup: {backup}")
print("columns:", json.dumps(cols, indent=0)[:600])
if errors:
    print(f"errors ({len(errors)}):", errors[:8])
