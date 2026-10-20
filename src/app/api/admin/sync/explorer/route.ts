/**
 * GET /api/admin/sync/explorer          → list ERP tables (name + approx rows)
 * GET /api/admin/sync/explorer?table=x  → DESCRIBE + exact row count (read-only)
 * Lets the owner inspect the ERP MySQL schema safely before finalizing the mapping.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { listErpTables, describeErpTable, countErpTable } from "@/lib/erp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const table = req.nextUrl.searchParams.get("table");
  try {
    if (!table) {
      return NextResponse.json({ ok: true, tables: await listErpTables() });
    }
    const [columns, rowCount] = await Promise.all([describeErpTable(table), countErpTable(table)]);
    return NextResponse.json({ ok: true, table, columns, rowCount });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Explorer query failed", 500);
  }
}
