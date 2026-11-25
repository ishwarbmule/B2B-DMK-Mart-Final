/**
 * GET  /api/admin/products/auto-dispatch → { enabled }
 * PUT  /api/admin/products/auto-dispatch { enabled: boolean }
 *
 * The owner's auto Ready-to-Dispatch switch: ON (default) means every real
 * stock change — ERP pull, Excel import, admin edit — moves products between
 * Ready to Dispatch / not automatically (stock ≥ 1 → on, 0 → off). OFF pauses
 * the automation; manual flag picks then stay exactly as set.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { autoDispatchEnabled, AUTO_DISPATCH_KEY } from "@/lib/stock-rules";
import { setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ enabled: await autoDispatchEnabled() });
}

export async function PUT(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const b = await req.json();
    const enabled = !!b.enabled;
    await setSetting(AUTO_DISPATCH_KEY, enabled ? "1" : "0");
    await db.activityLog.create({
      data: { action: "UPDATE", entity: "setting", entityId: AUTO_DISPATCH_KEY, detail: `Auto Ready-to-Dispatch turned ${enabled ? "ON" : "OFF"}` },
    }).catch(() => {});
    return NextResponse.json({ ok: true, enabled });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 200) : "Save failed", 400);
  }
}
