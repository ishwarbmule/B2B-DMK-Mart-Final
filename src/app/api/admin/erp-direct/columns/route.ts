import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { describeErpTable, countErpTable } from "@/lib/erp-mysql";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET ?table= — DESCRIBE one ERP table (columns + types) — the tick list source. */
export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const table = new URL(req.url).searchParams.get("table") ?? "";
  if (!table) return jsonError("table parameter required");
  try {
    const [columns, rows] = await Promise.all([describeErpTable(table), countErpTable(table)]);
    return Response.json({ table, columns, rows });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Describe failed", 500);
  }
}
