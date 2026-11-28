#!/usr/bin/env python3
"""Extract all rows of the customer master Excel to JSON for the sync script."""
import json, re
from openpyxl import load_workbook

SRC = "/home/z/my-project/upload/custsomer data.xlsx"
OUT = "/home/z/my-project/scripts/customer-master-rows.json"

wb = load_workbook(SRC, data_only=True)
print("Sheets:", wb.sheetnames)
ws = wb[wb.sheetnames[0]]
print("Dims:", ws.dimensions, "max_row:", ws.max_row, "max_col:", ws.max_column)

rows = list(ws.iter_rows(values_only=True))
header = [str(h).strip() if h is not None else "" for h in rows[0]]
print("Header cols:", len(header))
for i, h in enumerate(header):
    print(i, "|", h)

records = []
for r in rows[1:]:
    if r is None or all(v is None or str(v).strip() == "" for v in r):
        continue
    rec = {}
    for i, h in enumerate(header):
        if not h:
            continue
        v = r[i] if i < len(r) else None
        if v is None:
            rec[h] = ""
        elif isinstance(v, (int, float)):
            # keep phones as plain digits, avoid float artifacts
            if float(v).is_integer():
                rec[h] = str(int(v))
            else:
                rec[h] = str(v)
        else:
            rec[h] = str(v).strip()
    records.append(rec)

print("Total data rows:", len(records))

def norm_phone(p):
    digits = re.sub(r"\D", "", p or "")
    if len(digits) > 10:
        digits = digits[-10:]
    return digits

summary = []
for rec in records:
    phone_raw = rec.get("Mobile Phone", "")
    summary.append({
        "sr": rec.get("Sr No"),
        "name": rec.get("Full Name"),
        "shop": rec.get("Company / Shop Name"),
        "phone_raw": phone_raw,
        "phone": norm_phone(phone_raw),
        "email": rec.get("Email Address"),
        "status": rec.get("Account Status"),
        "store": rec.get("Store Name (Store DB)"),
        "approval": rec.get("Store Approval Status"),
        "sp_id": rec.get("Salesperson ID"),
        "sp_name": rec.get("Salesperson Name"),
        "gst": rec.get("GST Detail / Tax ID"),
        "map": rec.get("Google Maps Pinned Link"),
        "addr": rec.get("Street / Store Address"),
        "city": rec.get("City / Locality"),
        "state": rec.get("State / Area"),
    })

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=1)

# print compact overview
for s in summary:
    print(s["sr"], "|", s["phone_raw"], "->", s["phone"], "|", s["name"], "|", s["shop"], "|", s["approval"], "| sp:", s["sp_id"], s["sp_name"], "| map:", (s["map"][:45] + "...") if s["map"] and len(s["map"]) > 45 else s["map"])

# phone duplicate check
from collections import Counter
c = Counter(s["phone"] for s in summary)
dups = {k: v for k, v in c.items() if v > 1}
print("Duplicate normalized phones in Excel:", dups)
