/** GET /api/auth/me — current customer session (via x-customer-token header).
 *  Task 15: also returns the nearest warehouse for the buyer's profile location. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerFromReq } from "@/lib/customer-auth";
import { rankWarehouses } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
  return NextResponse.json({
    customer: {
      id: customer.id, name: customer.name, shopName: customer.shopName, phone: customer.phone,
      email: customer.email, customerType: customer.customerType, tier: customer.tier,
      status: customer.status, city: customer.city, pincode: customer.pincode, gstin: customer.gstin,
      orders: customer.orders, totalSpent: customer.totalSpent,
    },
    nearestWarehouse: nearest
      ? { id: nearest.id, name: nearest.name, city: nearest.city, address: nearest.address, phone: nearest.phone, isDefault: nearest.isDefault }
      : null,
    warehouses: ranked.map((w) => ({ id: w.id, name: w.name, city: w.city, address: w.address, phone: w.phone, isDefault: w.isDefault })),
    recentOrders: orders,
  });
}
