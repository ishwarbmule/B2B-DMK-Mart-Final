/** GET /api/admin/sync/status — ERP MySQL connection state + sync history (read-only). */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { testErpConnection, getSetting } from "@/lib/erp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const [events, status, writeEnabled, productsTable] = await Promise.all([
    db.syncEvent.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    testErpConnection().catch((e) => ({ configured: false, connected: false, error: String(e) })),
    getSetting("erp_write_enabled", "false"),
    getSetting("erp_products_table", "products"),
  ]);
  return NextResponse.json({ ok: true, events, status, writeEnabled: writeEnabled === "true", productsTable });
}
