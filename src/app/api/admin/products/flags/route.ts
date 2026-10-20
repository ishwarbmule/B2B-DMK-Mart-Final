/** POST /api/admin/products/flags — bulk-set product flags (Active / Top Selling / Featured / Hot / Deals). */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const { ids, flag, value } = (await req.json()) as { ids: string[]; flag: string; value: boolean };
    if (!Array.isArray(ids) || !ids.length) return jsonError("No products selected");
    if (!["active", "isTop", "isFeatured", "isHot", "isDeal"].includes(flag)) return jsonError("Invalid flag");
    // Manual admin activation/deactivation is recorded as activeSource="ADMIN" so ERP pulls never undo it.
    const data: Record<string, unknown> = { [flag]: !!value };
    if (flag === "active") data.activeSource = "ADMIN";
    const res = await db.product.updateMany({ where: { id: { in: ids } }, data });
    await db.activityLog.create({
      data: { action: "UPDATE", entity: "product", detail: `Bulk ${flag}=${!!value} applied to ${res.count} products` },
    });
    return NextResponse.json({ ok: true, count: res.count });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Bulk update failed", 400);
  }
}
