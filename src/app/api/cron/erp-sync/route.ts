/**
 * GET/POST /api/cron/erp-sync — scheduled ERP inventory auto-sync trigger.
 *
 * Auth (any one):
 *   - Authorization: Bearer $CRON_SECRET          (Vercel Cron sends this automatically)
 *   - ?key=$CRON_SECRET                            (external cron services e.g. cron-job.org)
 *   - admin Bearer token                           (manual "Run now" from Admin → Data Sync)
 *
 * Interval: Setting `erp_auto_sync_minutes` (15 / 30 / 60) — the route self-gates,
 * so a 15-min cron still honours a 30/60-min configured interval. ?force=1 bypasses the gate.
 */
import { NextRequest, NextResponse } from "next/server";
import { runErpTick, getErpSyncStatus } from "@/lib/erp-tick";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET || "";
  const key = req.nextUrl.searchParams.get("key");
  if (secret && key === secret) return true;
  const auth = req.headers.get("authorization") || "";
  if (secret && auth === `Bearer ${secret}`) return true;
  if (secret && req.headers.get("x-cron-secret") === secret) return true;
  return requireAdmin(req) === null; // fall back to admin session token
}

async function handle(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1" || req.nextUrl.searchParams.get("force") === "true";
  try {
    const result = await runErpTick(force);
    const status = await getErpSyncStatus();
    return NextResponse.json({ ok: true, ...result, nextDueAt: status.nextDueAt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "tick failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
