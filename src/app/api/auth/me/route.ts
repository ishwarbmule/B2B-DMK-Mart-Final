/** GET  /api/auth/me — current customer session (via x-customer-token header).
 *  Also returns the nearest warehouse for the buyer's profile location.
 *  Recent orders are redacted until the admin confirms them (no bill before confirmation).
 *  PATCH /api/auth/me — customer updates their own profile: name, shopName, email,
 *  gstin, address, city, pincode (location drives the nearest-warehouse catalog).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { customerFromReq, isHttpsReq } from "@/lib/customer-auth";
import { rankWarehouses } from "@/lib/geo";

export const dynamic = "force-dynamic";

/** Re-issue the storefront-gate cookie (dmk_sess) on EVERY successful /me call.
 *  The page gate (proxy.ts) trusts ONLY that httpOnly cookie while the login token
 *  lives in localStorage — without this happy-path refresh the 30-day cookie dies
 *  while the token lives on, and every gated page bounced the buyer to /login
 *  (the "already logged in but asked to sign in again" bug). */
function withFreshGateCookie(res: NextResponse, token: string, req: NextRequest): NextResponse {
  if (token) {
    res.cookies.set("dmk_sess", token, {
      httpOnly: true, sameSite: "lax", secure: isHttpsReq(req),
      path: "/", maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-customer-token") || "";
  const customerId = customerFromReq(req);
  if (!customerId) return NextResponse.json({ customer: null }, { status: 401 });
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return NextResponse.json({ customer: null }, { status: 401 });

  const warehouses = await db.warehouse.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
    select: { id: true, name: true, code: true, city: true, address: true, phone: true, isDefault: true, sortOrder: true },
  });
  const ranked = rankWarehouses(warehouses, customer.city, customer.pincode);
  const nearest = ranked[0] ?? null;

  const orders = await db.order.findMany({
    where: { customerId }, orderBy: { createdAt: "desc" }, take: 10, include: { items: true },
  });
  // hide the bill until the admin confirms the order
  const safeOrders = orders.map((o) =>
    o.confirmedAt
      ? o
      : {
          ...o,
          itemTotal: 0, deliveryFee: 0, discount: 0, gstAmount: 0, grandTotal: 0, totalSavings: 0,
          items: o.items.map((i) => ({ ...i, unitPrice: 0, total: 0, discount: 0 })),
        },
  );
  return withFreshGateCookie(NextResponse.json({
    customer: {
      id: customer.id, name: customer.name, shopName: customer.shopName, phone: customer.phone,
      email: customer.email, customerType: customer.customerType, tier: customer.tier,
      status: customer.status, city: customer.city, pincode: customer.pincode, gstin: customer.gstin,
      address: customer.address, orders: customer.orders, totalSpent: customer.totalSpent,
      mustChangePassword: customer.mustChangePassword,
    },
    nearestWarehouse: nearest
      ? { id: nearest.id, name: nearest.name, city: nearest.city, address: nearest.address, phone: nearest.phone, isDefault: nearest.isDefault }
      : null,
    warehouses: ranked.map((w) => ({ id: w.id, name: w.name, city: w.city, address: w.address, phone: w.phone, isDefault: w.isDefault })),
    recentOrders: safeOrders,
  }), token, req);
}

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  shopName: z.string().min(2).max(160).optional(),
  email: z.string().email().or(z.literal("")).optional(),
  gstin: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(80).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
});

export async function PATCH(req: NextRequest) {
  const customerId = customerFromReq(req);
  if (!customerId) return NextResponse.json({ error: "Please login first" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  const d = parsed.data;
  const customer = await db.customer.update({
    where: { id: customerId },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.shopName !== undefined ? { shopName: d.shopName } : {}),
      ...(d.email !== undefined ? { email: d.email } : {}),
      ...(d.gstin !== undefined ? { gstin: d.gstin } : {}),
      ...(d.address !== undefined ? { address: d.address } : {}),
      ...(d.city !== undefined ? { city: d.city } : {}),
      ...(d.pincode !== undefined ? { pincode: d.pincode } : {}),
    },
  });
  return NextResponse.json({
    ok: true,
    customer: {
      id: customer.id, name: customer.name, shopName: customer.shopName, phone: customer.phone,
      email: customer.email, customerType: customer.customerType, tier: customer.tier,
      status: customer.status, city: customer.city, pincode: customer.pincode, gstin: customer.gstin,
      address: customer.address, orders: customer.orders, totalSpent: customer.totalSpent,
    },
  });
}
