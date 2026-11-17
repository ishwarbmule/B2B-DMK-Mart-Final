/**
 * POST /api/admin/universal-sync/resync — the "Re-sync now" button.
 *
 *   ?mode=full   CHUNKED (504-proof): each call performs ONE page of work —
 *                products → warehouses → stock → finish (de-list + stale cleanup) —
 *                and returns live progress. The admin UI loops until done:true.
 *                The cursor persists in Setting erp_sync_full_cursor, so an interrupted
 *                run (closed tab, network drop, deploy) resumes exactly where it stopped.
 *                ?mode=full&reset=1 abandons a stuck cursor and starts over.
 *
 *   ?mode=delta  one-shot ?since=<watermark> pull (quick catch-up, small payloads).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { runUniversalSync, runFullSyncStep } from "@/lib/erp-universal";
import { logSyncEvent } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") === "delta" ? "DELTA" : "FULL";
  try {
    if (mode === "FULL") {
      // one chunked step per call — never runs long enough for a gateway timeout
      const step = await runFullSyncStep(sp.get("reset") === "1");
      return NextResponse.json({ ok: true, mode: "FULL", ...step });
    }
    const result = await runUniversalSync("DELTA");
    await logSyncEvent({
      direction: "PULL_ERP",
      action: "UNIVERSAL_DELTA",
      status: "OK",
      message: `Manual delta pull: ${result.pages} page(s) · seen ${result.seen} · created ${result.created} · updated ${result.updated} · skipped ${result.skipped}${result.warehouses.available ? ` · warehouses ${result.warehouses.created}+${result.warehouses.updated}${result.warehouses.deactivated ? ` (-${result.warehouses.deactivated})` : ""} · stock ${result.stock.upserted}` : " · warehouses: not exposed by ERP"}`,
      seen: result.seen, created: result.created, updated: result.updated, skipped: result.skipped, durationMs: result.durationMs,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await logSyncEvent({
      direction: "PULL_ERP",
      action: mode === "FULL" ? "UNIVERSAL_FULL" : "UNIVERSAL_DELTA",
      status: "ERROR",
      message: e instanceof Error ? e.message.slice(0, 400) : String(e),
    }).catch(() => {});
    const hint = mode === "FULL" ? " — the full sync stays resumable: press Re-sync now to retry the same page" : "";
    return jsonError((e instanceof Error ? e.message.slice(0, 300) : "Re-sync failed") + hint, 500);
  }
}
