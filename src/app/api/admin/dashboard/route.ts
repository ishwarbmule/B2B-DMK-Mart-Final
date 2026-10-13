/** GET /api/admin/dashboard — KPIs, sales trend, top products, offers & coupon activity, low stock, ERP sync. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  const [orderAgg, monthAgg, dayCount, productCount, brandCount, customerCount, pendingCustomers, lowStock, topProducts, salesTrendRaw, offers, coupons, lastSync, offerOrders, couponOrders] = await Promise.all([
    db.order.aggregate({ _sum: { grandTotal: true, itemTotal: true, gstAmount: true, discount: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { createdAt: { gte: daysAgo(30) } }, _sum: { grandTotal: true }, _count: { _all: true } }),
    db.order.count({ where: { createdAt: { gte: daysAgo(1) } } }),
    db.product.count(),
    db.brand.count({ where: { active: true } }),
    db.customer.count({ where: { source: "WEB" } }),
    db.customer.count({ where: { source: "WEB", status: "PENDING" } }),
    db.product.findMany({ where: { active: true, stock: { lte: 25 } }, orderBy: { stock: "asc" }, take: 8, select: { id: true, sku: true, name: true, stock: true, image: true, brand: { select: { name: true } } } }),
    db.orderItem.groupBy({ by: ["productId"], _sum: { pieces: true, total: true }, _count: { _all: true }, orderBy: { _count: { productId: "desc" } }, take: 8 }),
    db.order.findMany({ where: { createdAt: { gte: daysAgo(30) } }, select: { grandTotal: true, createdAt: true, itemTotal: true } }),
    db.offer.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    db.coupon.findMany({ orderBy: { usedCount: "desc" }, take: 6, select: { code: true, headline: true, usedCount: true, usageLimit: true, active: true } }),
    db.syncEvent.findFirst({ orderBy: { createdAt: "desc" } }),
    db.order.count({ where: { offerId: { not: "" } } }),
    db.order.count({ where: { couponCode: { not: "" } } }),
  ]);

  const topIds = topProducts.map((t) => t.productId);
  const topRows = topIds.length ? await db.product.findMany({ where: { id: { in: topIds } }, select: { id: true, sku: true, name: true, image: true, dealerPrice: true, brand: { select: { name: true } } } }) : [];
  const topById = new Map(topRows.map((r) => [r.id, r]));

  // COGS estimate: purchaseCost of ordered pieces — approximate from items
  const items = await db.orderItem.findMany({
    where: { order: { createdAt: { gte: daysAgo(30) } } },
    select: { productId: true, pieces: true, total: true },
  });
  const pcRows = await db.product.findMany({ where: { id: { in: [...new Set(items.map((i) => i.productId))] }, }, select: { id: true, purchaseCost: true } });
  const pcById = new Map(pcRows.map((r) => [r.id, r.purchaseCost]));
  let cogs30 = 0;
  let revenue30 = 0;
  for (const it of items) {
    revenue30 += it.total;
    cogs30 += (pcById.get(it.productId) ?? 0) * it.pieces;
  }
  cogs30 = Math.round(cogs30);
  revenue30 = Math.round(revenue30);

  // sales trend by day
  const trendMap = new Map<string, { revenue: number; orders: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i).toISOString().slice(0, 10);
    trendMap.set(d, { revenue: 0, orders: 0 });
  }
  for (const o of salesTrendRaw) {
    const d = new Date(o.createdAt).toISOString().slice(0, 10);
    const t = trendMap.get(d);
    if (t) { t.revenue += o.grandTotal; t.orders += 1; }
  }
  const trend = [...trendMap.entries()].map(([date, v]) => ({ date, revenue: Math.round(v.revenue), orders: v.orders }));

  const profitMargin = revenue30 > 0 ? Math.round(((revenue30 - cogs30) / revenue30) * 1000) / 10 : 0;

  return NextResponse.json({
    kpis: {
      revenue: Math.round(orderAgg._sum.grandTotal ?? 0),
      orders: orderAgg._count._all,
      itemTotal: Math.round(orderAgg._sum.itemTotal ?? 0),
      gstCollected: Math.round(orderAgg._sum.gstAmount ?? 0),
      discounts: Math.round(orderAgg._sum.discount ?? 0),
      revenue30: Math.round(monthAgg._sum.grandTotal ?? 0),
      orders30: monthAgg._count._all,
      ordersToday: dayCount,
      revenue30, cogs30, profitMargin,
      products: productCount,
      brands: brandCount,
      customers: customerCount,
      pendingCustomers,
      offerOrders,
      couponOrders,
    },
    trend,
    topProducts: topProducts.map((t) => {
      const p = topById.get(t.productId);
      return { id: t.productId, sku: p?.sku ?? "", name: p?.name ?? "—", image: p?.image ?? "", brand: p?.brand?.name ?? "", pieces: Math.round(t._sum.pieces ?? 0), revenue: Math.round(t._sum.total ?? 0), orders: t._count._all };
    }),
    lowStock,
    offers,
    coupons,
    lastSync,
  });
}
