/**
 * POST /api/auth/select-warehouse — the post-login warehouse choice.
 * Body: { warehouseId }. Only ACTIVE warehouses are selectable; the choice is
 * stored in a JS-readable cookie (no secret — just the shopping scope) that
 * middleware requires on every page and the products API uses to scope the
 * catalog to that warehouse's products.
 * Auth: customer token (header or the session cookie the gate set).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerFromReq, verifyCustomerToken } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // header token first, then the httpOnly session cookie (middleware path)
  const customerId = customerFromReq(req) || verifyCustomerToken(req.cookies.get("dmk_sess")?.value);
  if (!customerId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { warehouseId?: string };
  const warehouseId = String(body.warehouseId || "");
  if (!warehouseId) return NextResponse.json({ error: "Pick a warehouse" }, { status: 400 });

  const warehouse = await db.warehouse.findFirst({
    where: { id: warehouseId, active: true },
    select: { id: true, name: true, city: true },
  });
  if (!warehouse) return NextResponse.json({ error: "That warehouse is not available" }, { status: 404 });

  const res = NextResponse.json({ ok: true, warehouse });
  res.cookies.set("dmk_wh", warehouse.id, {
    httpOnly: false, // JS-readable so the checkout/header can show the chosen location
    sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 24 * 180,
  });
  return res;
}
