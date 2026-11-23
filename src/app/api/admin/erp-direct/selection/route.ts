/**
 * /api/admin/erp-direct/selection — WHICH godowns (warehouses) sync to the site.
 *   GET   → { codes: string[], warehouses: [{id, code, name, active, stockRows}] }
 *           codes = currently selected godown codes (empty = ALL, legacy default)
 *           warehouses = the ERP-mirrored warehouses stored in Neon (the picker)
 *   POST  { codes: string[] } → save the selection. Products + stock syncs only
 *           pull the selected godowns. ERP stays read-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { getSelectedWarehouseCodes, saveSelectedWarehouseCodes } from "@/lib/erp-direct-sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const codes = await getSelectedWarehouseCodes();
  const warehouses = await db.warehouse.findMany({
    where: { source: "ERP" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, active: true, _count: { select: { stocks: true } } },
  });
  return NextResponse.json({
    codes,
    warehouses: warehouses.map((w) => ({
      id: w.id, code: w.code, name: w.name, active: w.active, stockRows: w._count.stocks,
    })),
  });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = (await req.json()) as { codes?: unknown };
    if (!Array.isArray(body.codes)) return jsonError("codes must be an array of godown codes");
    await saveSelectedWarehouseCodes(body.codes.map(String));
    return NextResponse.json({ ok: true, codes: await getSelectedWarehouseCodes() });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Save failed", 500);
  }
}
