#!/usr/bin/env python3
"""IST day-key fixes for trend buckets and date-range parsing (server + client)."""
import pathlib, re

root = pathlib.Path("/home/z/my-project")

def patch(rel, subs, add_import=None):
    p = root / rel
    s = p.read_text()
    orig = s
    for old, new in subs:
        if old not in s:
            print(f"MISS in {rel}: {old[:60]!r}")
        s = s.replace(old, new)
    if add_import and "@/lib/ist\"" not in s and s != orig:
        lines = s.splitlines()
        last = max(i for i, l in enumerate(lines) if l.startswith("import "))
        lines.insert(last + 1, add_import)
        s = "\n".join(lines) + "\n"
    if s != orig:
        p.write_text(s)
        print(f"OK: {rel}")
    else:
        print(f"NO CHANGE: {rel}")

# 1. stats route — 14-day revenue trend keys in IST
patch("src/app/api/admin/stats/route.ts", [
    ("      byDay.set(d.toISOString().slice(0, 10), 0);", "      byDay.set(istDayKey(d), 0);"),
    ("      const k = o.createdAt.toISOString().slice(0, 10);", "      const k = istDayKey(o.createdAt);"),
], 'import { istDayKey } from "@/lib/ist";')

# 2. dashboard route — trend keys in IST
patch("src/app/api/admin/dashboard/route.ts", [
    ("    const d = daysAgo(i).toISOString().slice(0, 10);", "    const d = istDayKey(daysAgo(i));"),
    ("    const d = new Date(o.createdAt).toISOString().slice(0, 10);", "    const d = istDayKey(o.createdAt);"),
], 'import { istDayKey } from "@/lib/ist";')

# 3. financial route — day buckets + range labels + IST-day window parsing
patch("src/app/api/admin/financial/route.ts", [
    ("    const d = new Date(o.createdAt).toISOString().slice(0, 10);", "    const d = istDayKey(o.createdAt);"),
    ("  const fmt = (d: Date) => d.toISOString().slice(0, 10);", "  const fmt = (d: Date) => istDayKey(d);"),
], 'import { istDayKey } from "@/lib/ist";')

# 4. reports route — IST-day window parsing + range labels
patch("src/app/api/admin/reports/route.ts", [
    ('  const to = sp.get("to") ? new Date(sp.get("to") + "T23:59:59") : new Date();',
     '  const to = sp.get("to") ? new Date(sp.get("to") + "T23:59:59+05:30") : new Date();'),
    ('  const from = sp.get("from") ? new Date(sp.get("from")) : new Date(to.getTime() - 29 * 86400000);',
     '  const from = sp.get("from") ? new Date(sp.get("from") + "T00:00:00+05:30") : new Date(to.getTime() - 29 * 86400000);'),
    ("  const range = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };",
     "  const range = { from: istDayKey(from), to: istDayKey(to) };"),
], 'import { istDayKey } from "@/lib/ist";')

# 5. export route — IST-day window parsing + labels + sheet date cells
patch("src/app/api/admin/export/route.ts", [
    ('  const to = sp.get("to") ? new Date(sp.get("to") + "T23:59:59") : new Date();',
     '  const to = sp.get("to") ? new Date(sp.get("to") + "T23:59:59+05:30") : new Date();'),
    ('  const from = sp.get("from") ? new Date(sp.get("from")) : new Date(to.getTime() - 29 * 86400000);',
     '  const from = sp.get("from") ? new Date(sp.get("from") + "T00:00:00+05:30") : new Date(to.getTime() - 29 * 86400000);'),
    ("from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}", "from=${istDayKey(from)}&to=${istDayKey(to)}"),
    ("const filename = `dmk-${name}-${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}.xlsx`;",
     "const filename = `dmk-${name}-${istDayKey(from)}_to_${istDayKey(to)}.xlsx`;"),
    ("r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c))",
     "r.map((c) => (c instanceof Date ? istDayKey(c) : c))"),
], 'import { istDayKey } from "@/lib/ist";')

# 6. products export — date-only columns in IST
patch("src/app/api/admin/products/export/route.ts", [
    ('const dateOnly = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");',
     'const dateOnly = (d: Date | null) => (d ? istDayKey(d) : "");'),
], 'import { istDayKey } from "@/lib/ist";')

# 7. business-modules-2 — default date ranges on the client use IST calendar days
patch("src/components/admin/business-modules-2.tsx", [
    ('const today = () => new Date().toISOString().slice(0, 10);',
     'const today = () => istDayKey(new Date());'),
    ('const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);',
     'const daysAgo = (n: number) => istDayKey(new Date(Date.now() - n * 86400000));'),
    ('case "month": return [new Date(y, now.getMonth(), 1).toISOString().slice(0, 10), today()];',
     'case "month": return [istDayKey(new Date(y, now.getMonth(), 1)), today()];'),
    ('return [new Date(y, qm, 1).toISOString().slice(0, 10), today()];',
     'return [istDayKey(new Date(y, qm, 1)), today()];'),
    ('case "year": return [new Date(y, 0, 1).toISOString().slice(0, 10), today()];',
     'case "year": return [istDayKey(new Date(y, 0, 1)), today()];'),
], 'import { istDayKey } from "@/lib/ist";')
