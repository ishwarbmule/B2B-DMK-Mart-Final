/**
 * GET /api/warehouses — public list of active warehouses (pickup points).
 * Optional ?nearCity=&nearPin= → nearest-first ordering for the buyer's location.
 * Cached at the edge for 5 minutes (warehouse network changes rarely).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rankWarehouses } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const nearCity = sp.get("nearCity") || "";
  const nearPin = sp.get("nearPin") || "";
  const productId = sp.get("productId") || ""; // availability map for one product (qualitative UI use)
  const rows = await db.warehouse.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
    select: { id: true, name: true, code: true, city: true, address: true, phone: true, isDefault: true, sortOrder: true },
  });
  const warehouses = rankWarehouses(rows, nearCity, nearPin).map((w) => ({
    id: w.id, name: w.name, code: w.code, city: w.city, address: w.address, phone: w.phone, isDefault: w.isDefault,
  }));
  let availability: Record<string, "IN_STOCK" | "OUT"> | undefined;
  if (productId) {
    const stocks = await db.warehouseStock.findMany({ where: { productId }, select: { warehouseId: true, qty: true } });
    availability = {};
    for (const s of stocks) availability[s.warehouseId] = s.qty > 0 ? "IN_STOCK" : "OUT";
  }
  const res = NextResponse.json({ warehouses, ...(availability ? { availability } : {}) });
  res.headers.set("Cache-Control", productId ? "no-store" : "public, s-maxage=300, stale-while-revalidate=600");
  return res;
}
