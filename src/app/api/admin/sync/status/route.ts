/** GET /api/admin/sync/status — sync history + ERP portal registration (read-only). */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { pullErpPortal } from "@/lib/erp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const [events, portal] = await Promise.all([
    db.syncEvent.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    pullErpPortal().catch(() => null),
  ]);
  return NextResponse.json({ ok: true, events, portal });
}
