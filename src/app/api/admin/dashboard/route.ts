/** GET /api/admin/dashboard?window=7|30|90 — KPIs with window deltas, sales trend,
 *  order pipeline, recent orders, payment mix, top products, offers & coupons,
 *  low stock, ERP sync. Window falls back to all-time when no orders are recent,
 *  so the dashboard never shows an empty "last 30 days" after a quiet month. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaff(req, "dashboard");
  if (unauthorized) return unauthorized;
  const sp = req.nextUrl.searchParams;
  const winParam = parseInt(sp.get("window") || "90", 10);
  const winDays = [7, 30, 90].includes(winParam) ? winParam : 90;

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
  const winFrom = daysAgo(winDays - 1);
  const prevFrom = daysAgo(2 * winDays - 1);

  // smart extension: a quiet window switches the dashboard to all-time data
  const winCount = await db.order.count({ where: { createdAt: { gte: winFrom } } });
  const smartExtended = winCount === 0;
  const from = smartExtended ? daysAgo(365 * 2) : winFrom;
  const usedWindow = smartExtended ? 0 : winDays; // 0 = all-time

  const [orderAgg, winAgg, prevAgg, dayCount, productCount, brandCount, customerCount, pendingCustomers, lowStock, topProducts, trendRaw, offers, coupons, lastSync, offerOrders, couponOrders, statusCounts, recentOrders, paymentRaw, windowItems] = await Promise.all([
    db.order.aggregate({ _sum: { grandTotal: true, itemTotal: true, gstAmount: true, discount: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { createdAt: { gte: from } }, _sum: { grandTotal: true, gstAmount: true, discount: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { createdAt: { gte: prevFrom, lt: winFrom } }, _sum: { grandTotal: true }, _count: { _all: true } }),
    db.order.count({ where: { createdAt: { gte: daysAgo(1) } } }),
    db.product.count(),
    db.brand.count({ where: { active: true } }),
    db.customer.count({ where: { source: "WEB" } }),
    db.customer.count({ where: { source: "WEB", status: "PENDING" } }),
    db.product.findMany({ where: { active: true, stock: { lte: 25 } }, orderBy: { stock: "asc" }, take: 8, select: { id: true, sku: true, name: true, stock: true, image: true, brand: { select: { name: true } } } }),
    db.orderItem.groupBy({ by: ["productId"], _sum: { pieces: true, total: true }, _count: { _all: true }, orderBy: { _count: { productId: "desc" } }, take: 8 }),
    db.order.findMany({ where: { createdAt: { gte: from } }, select: { grandTotal: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    db.offer.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    db.coupon.findMany({ orderBy: { usedCount: "desc" }, take: 6, select: { code: true, headline: true, usedCount: true, usageLimit: true, active: true } }),
    db.syncEvent.findFirst({ orderBy: { createdAt: "desc" } }),
    db.order.count({ where: { offerId: { not: "" } } }),
    db.order.count({ where: { couponCode: { not: "" } } }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, invoiceNo: true, customerName: true, grandTotal: true, status: true, createdAt: true, source: true, paymentMethod: true } }),
    db.order.findMany({ where: { createdAt: { gte: from } }, select: { grandTotal: true, paymentMethod: true } }),
    db.orderItem.findMany({
      where: { order: { createdAt: { gte: from } } },
      select: { productId: true, pieces: true, total: true },
    }),
  ]);

  const topIds = topProducts.map((t) => t.productId);
  const topRows = topIds.length ? await db.product.findMany({ where: { id: { in: topIds } }, select: { id: true, sku: true, name: true, image: true, dealerPrice: true, brand: { select: { name: true } } } }) : [];
  const topById = new Map(topRows.map((r) => [r.id, r]));

  // COGS estimate for the window
  const pcRows = await db.product.findMany({ where: { id: { in: [...new Set(windowItems.map((i) => i.productId))] } }, select: { id: true, purchaseCost: true } });
  const pcById = new Map(pcRows.map((r) => [r.id, r.purchaseCost]));
  let cogsWin = 0;
  let revenueWinItems = 0;
  for (const it of windowItems) {
    revenueWinItems += it.total;
    cogsWin += (pcById.get(it.productId) ?? 0) * it.pieces;
  }
  cogsWin = Math.round(cogsWin);
  revenueWinItems = Math.round(revenueWinItems);

  // daily trend (last ~120 buckets max)
  const trendDays = Math.min(usedWindow || 120, 120);
  const trendMap = new Map<string, { revenue: number; orders: number }>();
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = daysAgo(i).toISOString().slice(0, 10);
    trendMap.set(d, { revenue: 0, orders: 0 });
  }
  for (const o of trendRaw) {
    const d = new Date(o.createdAt).toISOString().slice(0, 10);
    const t = trendMap.get(d);
    if (t) { t.revenue += o.grandTotal; t.orders += 1; }
  }
  const trend = [...trendMap.entries()].map(([date, v]) => ({ date, revenue: Math.round(v.revenue), orders: v.orders }));

  const winRevenue = Math.round(winAgg._sum.grandTotal ?? 0);
  const winOrders = winAgg._count._all;
  const prevRevenue = Math.round(prevAgg._sum.grandTotal ?? 0);
  const prevOrders = prevAgg._count._all;
  const deltaPct = (curr: number, prev: number) => (prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : curr > 0 ? 100 : 0);
  const profitMargin = winRevenue > 0 ? Math.round(((winRevenue - cogsWin) / winRevenue) * 1000) / 10 : 0;

  const statusMap: Record<string, number> = { PENDING: 0, CONFIRMED: 0, PACKED: 0, DELIVERED: 0, CANCELLED: 0 };
  for (const s of statusCounts) statusMap[s.status] = s._count._all;

  const payMap = new Map<string, number>();
  for (const o of paymentRaw) payMap.set(o.paymentMethod, (payMap.get(o.paymentMethod) ?? 0) + o.grandTotal);
  const paymentMix = [...payMap.entries()].map(([mode, amount]) => ({ mode, amount: Math.round(amount) })).sort((a, b) => b.amount - a.amount);

  return NextResponse.json({
    window: { requested: winDays, used: usedWindow, smartExtended, label: smartExtended ? "All time" : `Last ${winDays} days` },
    kpis: {
      revenue: Math.round(orderAgg._sum.grandTotal ?? 0),
      orders: orderAgg._count._all,
      itemTotal: Math.round(orderAgg._sum.itemTotal ?? 0),
      gstCollected: Math.round(orderAgg._sum.gstAmount ?? 0),
      discounts: Math.round(orderAgg._sum.discount ?? 0),
      winRevenue,
      winOrders,
      winGst: Math.round(winAgg._sum.gstAmount ?? 0),
      winDiscounts: Math.round(winAgg._sum.discount ?? 0),
      revenueDelta: deltaPct(winRevenue, prevRevenue),
      ordersDelta: deltaPct(winOrders, prevOrders),
      winCogs: cogsWin,
      profitMargin,
      ordersToday: dayCount,
      products: productCount,
      brands: brandCount,
      customers: customerCount,
      pendingCustomers,
      offerOrders,
      couponOrders,
    },
    statusCounts: statusMap,
    paymentMix,
    recentOrders: recentOrders.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
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
