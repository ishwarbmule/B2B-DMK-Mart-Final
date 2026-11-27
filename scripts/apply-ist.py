#!/usr/bin/env python3
"""Batch-apply IST date formatting to the listed files."""
import re, sys, pathlib

FILES = [
    "src/app/admin/orders/[id]/barcodes/page.tsx",
    "src/app/account/orders/page.tsx",
    "src/app/account/page.tsx",
    "src/components/admin/orders-module.tsx",
    "src/components/admin/staff-modules.tsx",
    "src/components/admin/logs-module.tsx",
    "src/app/api/admin/export/route.ts",
    "src/components/admin/salesteam-panel.tsx",
    "src/components/admin/pos-module.tsx",
    "src/components/admin/business-modules-1.tsx",
    "src/components/admin/approvals-module.tsx",
    "src/components/admin/store-map-module.tsx",
    "src/app/api/admin/reports/route.ts",
    "src/components/admin/warehouse-stock-module.tsx",
]

DATE_RE = re.compile(r'new Date\(([^()]+)\)\.toLocaleDateString\("en-IN"(?:\s*,\s*\{[^{}]*\})?\)')
TIME_RE = re.compile(r'new Date\(([^()]+)\)\.toLocaleString\("en-IN"(?:\s*,\s*\{[^{}]*\})?\)')

def fix_call(m, fn):
    expr = m.group(1).strip()
    if not expr:  # new Date() → keep an explicit now
        return f"{fn}(new Date())"
    return f"{fn}({expr})"

root = pathlib.Path("/home/z/my-project")
for rel in FILES:
    p = root / rel
    src = p.read_text()
    orig = src
    src = DATE_RE.sub(lambda m: fix_call(m, "istDate"), src)
    src = TIME_RE.sub(lambda m: fix_call(m, "istDateTime"), src)
    if src == orig:
        print(f"SKIP (no change): {rel}")
        continue
    needs = []
    if "istDate(" in src and "import" not in [l for l in src.splitlines() if "from \"@/lib/ist\"" in l] or "istDate" not in src.split("export")[0] if False else True:
        pass
    has_import = '@/lib/ist"' in src
    if not has_import:
        uses_date = re.search(r'(?<![\w.])istDate\(', src) is not None
        uses_time = re.search(r'(?<![\w.])istDateTime\(', src) is not None
        names = "istDateTime, istDate" if (uses_date and uses_time) else ("istDate" if uses_date else "istDateTime")
        lines = src.splitlines()
        last_import = max(i for i, l in enumerate(lines) if l.startswith("import "))
        lines.insert(last_import + 1, f'import {{ {names} }} from "@/lib/ist";')
        src = "\n".join(lines) + ("\n" if orig.endswith("\n") else "")
    p.write_text(src)
    print(f"OK: {rel}  (import added: {not has_import})")
