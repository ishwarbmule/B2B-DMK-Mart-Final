/**
 * /api/admin/customers/locations — Store Map data (realtime via admin polling).
 *   GET  → every customer as a map-ready marker row (lean payload, no address text)
 *   PUT  { id, lat, lng }     → admin drops/moves a pin (geoSource = ADMIN)
 *   PUT  { id, clear: true }  → removes a wrong pin
 * New signups arrive pre-pinned (buyers drop their store pin on the signup map).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const rows = await db.customer.findMany({
    select: {
      id: true, name: true, shopName: true, phone: true,
      city: true, pincode: true, customerType: true, tier: true,
      status: true, orders: true, totalSpent: true,
      lat: true, lng: true, geoSource: true, geoUpdatedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const pinned = rows.filter((r) => r.lat != null && r.lng != null).length;
  return NextResponse.json({
    rows,
    stats: {
      total: rows.length,
      pinned,
      unpinned: rows.length - pinned,
      approved: rows.filter((r) => r.status === "APPROVED").length,
      pending: rows.filter((r) => r.status === "PENDING").length,
    },
    serverTime: new Date().toISOString(),
  });
}

export async function PUT(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = (await req.json()) as { id?: string; lat?: number; lng?: number; clear?: boolean };
    if (!body.id) return jsonError("Customer id required", 400);

    if (body.clear) {
      await db.customer.update({
        where: { id: body.id },
        data: { lat: null, lng: null, geoSource: "", geoUpdatedAt: null },
      });
      return NextResponse.json({ ok: true, cleared: true });
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return jsonError("Invalid coordinates", 400);
    }

    const updated = await db.customer.update({
      where: { id: body.id },
      data: { lat, lng, geoSource: "ADMIN", geoUpdatedAt: new Date() },
      select: { id: true, lat: true, lng: true, geoSource: true, geoUpdatedAt: true },
    });
    await db.activityLog.create({
      data: { action: "UPDATE", entity: "Customer", detail: `Store pin set (ADMIN) @ ${lat.toFixed(5)},${lng.toFixed(5)}` },
    }).catch(() => {});
    return NextResponse.json({ ok: true, row: updated });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Could not save location", 500);
  }
}
