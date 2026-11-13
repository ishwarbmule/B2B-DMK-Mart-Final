/**
 * POST /api/admin/universal-sync/resync — the "Re-sync now" button.
 *   ?mode=full  (default) — offset pagination from 0 over the whole shared catalog,
 *                           de-lists ERP-controlled SKUs that disappeared upstream.
 *   ?mode=delta           — one ?since=<watermark> pull (quick catch-up).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { runUniversalSync } from "@/lib/erp-universal";
import { logSyncEvent } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const mode = req.nextUrl.searchParams.get("mode") === "delta" ? "DELTA" : "FULL";
  try {
    const result = await runUniversalSync(mode);
    await logSyncEvent({
      direction: "PULL_ERP",
      action: mode === "FULL" ? "UNIVERSAL_FULL" : "UNIVERSAL_DELTA",
      status: "OK",
      message: `Manual ${result.mode.toLowerCase()} re-sync: ${result.pages} page(s) · seen ${result.seen} · created ${result.created} · updated ${result.updated} · skipped ${result.skipped}${mode === "FULL" ? ` · de-listed ${result.delisted}` : ""}`,
      seen: result.seen, created: result.created, updated: result.updated, skipped: result.skipped, durationMs: result.durationMs,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await logSyncEvent({
      direction: "PULL_ERP",
      action: mode === "FULL" ? "UNIVERSAL_FULL" : "UNIVERSAL_DELTA",
      status: "ERROR",
      message: e instanceof Error ? e.message.slice(0, 400) : String(e),
    });
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Re-sync failed", 500);
  }
}
