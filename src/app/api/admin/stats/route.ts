import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [revenueAgg, ordersTotal, ordersToday, pendingOrders, completedOrders, cancelled, shipped, products, activeProducts, brands, tops, mids, ends, customers, salespersons, stores, hotProducts, topSelling, featured, lowStock, pendingReturns, purchaseAgg, unitsAgg] = await Promise.all([
      db.order.aggregate({ where: { status: { not: "CANCELLED" } }, _sum: { grandTotal: true, itemTotal: true } }),
      db.order.count(),
      db.order.count({ where: { createdAt: { gte: startOfDay } } }),
      db.order.count({ where: { status: "PENDING" } }),
      db.order.count({ where: { status: "COMPLETED" } }),
      db.order.count({ where: { status: "CANCELLED" } }),
      db.order.count({ where: { shippingStatus: "DELIVERED" } }),
      db.product.count(),
      db.product.count({ where: { active: true } }),
      db.brand.count(),
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
      db.orderItem.aggregate({ _sum: { pieces: true } }),
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

    // top companies by revenue (group orders by customer name, items from relation)
    const ordersForCompanies = await db.order.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { customerName: true, items: { select: { pieces: true, total: true } } },
      take: 200,
      orderBy: { createdAt: "desc" },
    });
    const companyRev = new Map<string, { orders: number; items: number; revenue: number }>();
    for (const o of ordersForCompanies) {
      const name = o.customerName || "—";
      const cur = companyRev.get(name) || { orders: 0, items: 0, revenue: 0 };
      cur.orders += 1;
      for (const l of o.items) {
        cur.items += l.pieces ?? 0;
        cur.revenue += l.total ?? 0;
      }
      companyRev.set(name, cur);
    }
    // count orders per company separately
    const topCompanies = Array.from(companyRev.entries())
      .map(([name, v]) => ({ name, ...v, revenue: Math.round(v.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // department distribution
    const topsRows = await db.topCategory.findMany({ select: { name: true, _count: { select: { products: true } } } });
    const departments = topsRows.map((t) => ({ name: t.name, products: t._count.products })).sort((a, b) => b.products - a.products);

    const inactiveProducts = Math.max(0, products - activeProducts);
    return NextResponse.json({
      revenue: Math.round(revenueAgg._sum.grandTotal || 0),
      purchaseValue: Math.round(purchaseAgg._sum.amount || 0),
      ordersToday, ordersTotal, pendingOrders, completedOrders, cancelled,
      delivered: shipped, products, companies: brands, tops, mids, ends,
      customers, salespersons, stores,
      hotProducts, topSelling, featured, lowStock, pendingReturns,
      revenueSeries, topCompanies, departments,
      // legacy fields consumed by the classic dmart admin dashboard
      totalProducts: products,
      activeProducts,
      inactiveProducts,
      totalOrders: ordersTotal,
      unitsSold: Math.round(unitsAgg._sum.pieces || 0),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Stats failed", 500);
  }
}
