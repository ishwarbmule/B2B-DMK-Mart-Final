/**
 * GET /api/admin/sales-report — per-salesperson performance: which salesperson brings
 * orders to the business. Aggregate over Order.salesPerson (all-time + last 30 days).
 * Auth: Super Admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const group = await db.order.groupBy({
    by: ["salesPerson"],
    _count: { _all: true },
    _sum: { grandTotal: true, itemTotal: true },
    where: { salesPerson: { not: "" } },
  });

  const since = new Date(Date.now() - 30 * 86400000);
  const recent = await db.order.groupBy({
    by: ["salesPerson"],
    _count: { _all: true },
    _sum: { grandTotal: true },
    where: { salesPerson: { not: "" }, createdAt: { gte: since } },
  });

  const lasts = await db.order.findMany({
    where: { salesPerson: { not: "" } },
    orderBy: { createdAt: "desc" },
    select: { salesPerson: true, createdAt: true, invoiceNo: true },
    take: 400,
  });
  const lastBy = new Map<string, { at: Date; invoiceNo: string }>();
  for (const o of lasts) {
    if (!lastBy.has(o.salesPerson)) lastBy.set(o.salesPerson, { at: o.createdAt, invoiceNo: o.invoiceNo });
  }

  const team = await db.salesPerson.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, mobile: true, area: true, active: true, username: true, password: true } });
  const recentMap = new Map(recent.map((r) => [r.salesPerson, r]));

  const rows = group
    .map((g) => {
      const sp = team.find((t) => t.name === g.salesPerson);
      const r = recentMap.get(g.salesPerson);
      const last = lastBy.get(g.salesPerson);
      return {
        name: g.salesPerson,
        portalReady: Boolean(sp && sp.username && sp.password),
        area: sp?.area ?? "",
        mobile: sp?.mobile ?? "",
        active: sp?.active ?? true,
        orders: g._count._all,
        revenue: Math.round(g._sum.grandTotal ?? 0),
        orders30d: r?._count._all ?? 0,
        revenue30d: Math.round(r?._sum.grandTotal ?? 0),
        lastOrderAt: last?.at ?? null,
        lastInvoice: last?.invoiceNo ?? "",
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // salespeople with portal access but no orders yet
  for (const t of team) {
    if (!rows.some((r) => r.name === t.name)) {
      rows.push({ name: t.name, portalReady: Boolean(t.username && t.password), area: t.area, mobile: t.mobile, active: t.active, orders: 0, revenue: 0, orders30d: 0, revenue30d: 0, lastOrderAt: null, lastInvoice: "" });
    }
  }

  return NextResponse.json({ rows, teamSize: team.length, totalRevenue: rows.reduce((s, r) => s + r.revenue, 0) });
}
