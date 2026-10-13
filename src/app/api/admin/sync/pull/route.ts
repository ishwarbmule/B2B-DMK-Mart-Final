/** POST /api/admin/sync/pull — manual pull of ERP catalog from Neon (read-only) into local mirror. */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { pullErpProducts, pullErpPortal } from "@/lib/erp";
import { applyErpProducts, logSyncEvent } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const started = Date.now();
  try {
    const products = await pullErpProducts();
    const result = await applyErpProducts(products);
    const portal = await pullErpPortal().catch(() => null);
    const durationMs = Date.now() - started;
    await logSyncEvent({
      direction: "PULL_ERP",
      action: "PRODUCTS",
      status: result.errors.length ? "PARTIAL" : "OK",
      message: `Manual pull: seen ${result.seen} · created ${result.created} · updated ${result.updated} · skipped ${result.skipped}`,
      seen: result.seen, created: result.created, updated: result.updated, skipped: result.skipped, durationMs,
    });
    return NextResponse.json({ ok: true, ...result, durationMs, portal });
  } catch (e) {
    await logSyncEvent({ direction: "PULL_ERP", action: "PRODUCTS", status: "ERROR", message: e instanceof Error ? e.message : String(e) });
    return jsonError(e instanceof Error ? e.message : "Pull failed", 500);
  }
}
