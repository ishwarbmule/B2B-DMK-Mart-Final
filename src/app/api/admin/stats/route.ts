import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [revenueAgg, ordersTotal, ordersToday, pendingOrders, completedOrders, cancelled, shipped, products, companies, tops, mids, ends, customers, salespersons, stores, hotProducts, topSelling, featured, lowStock, pendingReturns, purchaseAgg] = await Promise.all([
    db.order.aggregate({ where: { status: { not: "CANCELLED" } }, _sum: { grandTotal: true, itemTotal: true } }),
    db.order.count(),
    db.order.count({ where: { createdAt: { gte: startOfDay } } }),
    db.order.count({ where: { status: "PENDING" } }),
    db.order.count({ where: { status: "COMPLETED" } }),
    db.order.count({ where: { status: "CANCELLED" } }),
    db.order.count({ where: { shippingStatus: "DELIVERED" } }),
    db.product.count(),
    db.company.count(),
    db.topCategory.count(),
    db.midCategory.count(),
    db.endCategory.count(),
    db.customer.count(),
    db.salesPerson.count(),
    db.store.count(),
    db.product.count({ where: { isHot: true } }),
    db.product.count({ where: { isTop: true } }),
    db.product.count({ where: { isFeatured: true } }),
    db.product.count({ where: { stock: { lte: 10 } } }),
    db.returnRequest.count({ where: { status: "REQUESTED" } }),
    db.purchase.aggregate({ _sum: { amount: true } }),
  ]);

  // revenue by day (last 14 days) for chart
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const recent = await db.order.findMany({
    where: { createdAt: { gte: since }, status: { not: "CANCELLED" } },
    select: { grandTotal: true, createdAt: true },
  });
  const byDay = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of recent) {
    const k = o.createdAt.toISOString().slice(0, 10);
    if (byDay.has(k)) byDay.set(k, (byDay.get(k) || 0) + o.grandTotal);
  }
  const revenueSeries = Array.from(byDay.entries()).map(([date, total]) => ({ date, total: Math.round(total) }));

  // top companies by revenue (from order items)
  const ordersForCompanies = await db.order.findMany({
    where: { status: { not: "CANCELLED" } },
    select: { items: true },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  const companyRev = new Map<string, { orders: number; items: number; revenue: number }>();
  for (const o of ordersForCompanies) {
    const lines = JSON.parse(o.items) as { company: string; units: number; lineTotal: number }[];
    for (const l of lines) {
      const cur = companyRev.get(l.company) || { orders: 0, items: 0, revenue: 0 };
      cur.items += l.units;
      cur.revenue += l.lineTotal;
      companyRev.set(l.company, cur);
    }
  }
  // count orders per company separately
  const topCompanies = Array.from(companyRev.entries())
    .map(([name, v]) => ({ name, ...v, revenue: Math.round(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // department distribution
  const topsRows = await db.topCategory.findMany({ select: { name: true, _count: { select: { products: true } } } });
  const departments = topsRows.map((t) => ({ name: t.name, products: t._count.products })).sort((a, b) => b.products - a.products);

  return NextResponse.json({
    revenue: Math.round(revenueAgg._sum.grandTotal || 0),
    purchaseValue: Math.round(purchaseAgg._sum.amount || 0),
    ordersToday, ordersTotal, pendingOrders, completedOrders, cancelled,
    delivered: shipped, products, companies, tops, mids, ends,
    customers, salespersons, stores,
    hotProducts, topSelling, featured, lowStock, pendingReturns,
    revenueSeries, topCompanies, departments,
  });
}
