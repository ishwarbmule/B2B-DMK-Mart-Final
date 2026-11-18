import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { listErpTables } from "@/lib/erp-mysql";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET — list every ERP table with its approximate row count (read-only). */
export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const tables = await listErpTables();
    return Response.json({ tables });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Table listing failed", 500);
  }
}
