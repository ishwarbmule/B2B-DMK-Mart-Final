/** GET /api/admin/sync/auto-status — auto-sync interval + last run state for the admin UI. */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getErpSyncStatus } from "@/lib/erp-tick";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const s = await getErpSyncStatus();
  return NextResponse.json({ ok: true, minutes: s.minutes, lastRunAt: s.lastRunAt, nextDueAt: s.nextDueAt, state: s.state });
}
