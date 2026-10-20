/**
 * POST /api/admin/sync/push?mode=preview (default) — dry-run diff B2B → ERP. READ-ONLY.
 * POST /api/admin/sync/push?mode=execute           — real writes; REFUSED unless the
 *   owner unlocked them via the Data Sync toggle (erp_write_enabled). Only whitelisted
 *   numeric columns (stock, tier1-5, purchaseCost) matched by SKU are ever updated.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { previewPushToErp, executePushToErp, logSyncEvent } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const mode = req.nextUrl.searchParams.get("mode") === "execute" ? "execute" : "preview";
  const started = Date.now();
  try {
    if (mode === "preview") {
      const preview = await previewPushToErp();
      return NextResponse.json({ ok: true, mode, ...preview });
    }
    const result = await executePushToErp();
    const durationMs = Date.now() - started;
    await logSyncEvent({
      direction: "PUSH_ERP",
      action: "PRODUCTS",
      status: result.errors.length ? "PARTIAL" : "OK",
      message: `Push to ERP MySQL: updated ${result.updated} rows · skipped ${result.skipped}${result.errors.length ? ` · errors ${result.errors.length}` : ""}`,
      seen: result.updated + result.skipped, updated: result.updated, skipped: result.skipped, durationMs,
    });
    return NextResponse.json({ ok: true, mode, ...result, durationMs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSyncEvent({ direction: "PUSH_ERP", action: "PRODUCTS", status: "ERROR", message: msg });
    // 423 Locked when ERP writes are disabled — makes the safety state explicit
    return jsonError(msg, msg.includes("LOCKED") ? 423 : 500);
  }
}
