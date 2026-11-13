/**
 * GET/POST /api/cron/erp-delta — daily delta pull from the Universal Inventory API.
 *
 * This is the safety net of the sync contract: if the ERP's signed pushes ever fail
 * (network, bad signature, B2B downtime), nothing is lost — once a day the B2B site
 * pulls everything with ?since=<watermark> and catches up. The watermark only advances
 * to erpUpdatedAt values that were actually applied, so no change can slip through.
 *
 * Auth (same policy as /api/cron/erp-sync):
 *   - Authorization: Bearer $CRON_SECRET        (Vercel Cron sends this automatically)
 *   - ?key=$CRON_SECRET                          (external cron services)
 *   - the admin-manageable `cron_secret` Setting
 *   - admin Bearer token                         (manual run)
 *
 * Skips itself when: no API key configured / daily pull toggled off / nothing new.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/erp";
import { getUniversalConfig, runUniversalSync } from "@/lib/erp-universal";
import { logSyncEvent } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET || "";
  const key = req.nextUrl.searchParams.get("key") || "";
  const auth = req.headers.get("authorization") || "";
  if (secret && (key === secret || auth === `Bearer ${secret}` || req.headers.get("x-cron-secret") === secret)) return true;
  if (key || auth.startsWith("Bearer ")) {
    try {
      const s = await db.setting.findUnique({ where: { key: "cron_secret" } });
      const dbSecret = s?.value?.trim() || "";
      if (dbSecret && (key === dbSecret || auth === `Bearer ${dbSecret}`)) return true;
    } catch { /* ignore */ }
  }
  return requireAdmin(req) === null;
}

async function handle(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const config = await getUniversalConfig();
    if (!config.configured) {
      return NextResponse.json({ ok: true, skipped: "universal api key not configured" });
    }
    if ((await getSetting("erp_universal_daily_enabled", "true")) !== "true") {
      return NextResponse.json({ ok: true, skipped: "daily delta pull toggled off in admin" });
    }
    const result = await runUniversalSync("DELTA");
    await logSyncEvent({
      direction: "PULL_ERP",
      action: "UNIVERSAL_DELTA",
      status: "OK",
      message: `Daily delta pull (${result.mode.toLowerCase()}): ${result.pages} page(s) · seen ${result.seen} · created ${result.created} · updated ${result.updated}${result.mode === "FULL" ? ` · de-listed ${result.delisted}` : ""}`,
      seen: result.seen, created: result.created, updated: result.updated, skipped: result.skipped, durationMs: result.durationMs,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : String(e);
    await logSyncEvent({ direction: "PULL_ERP", action: "UNIVERSAL_DELTA", status: "ERROR", message }).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
