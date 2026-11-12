/** GET /api/admin/financial — monetary summary: sales, COGS, profit, GST, payment split, daily table.
 *  Date windows: preset=7|30|90|month|lastMonth|all or custom from&to.
 *  Smart default (no params): last 90 days; if no orders in that window the range
 *  auto-extends to all time, so the section never looks "broken" just because the
 *  latest orders are older than the window. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaff(req, "financial");
  if (unauthorized) return unauthorized;
  const sp = req.nextUrl.searchParams;

  const preset = sp.get("preset") || (sp.get("from") || sp.get("to") ? "custom" : "smart");
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const earliest = await db.order.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const allFrom = earliest ? startOfDay(earliest.createdAt) : now;

  let from: Date;
  let to: Date = now;
  let used = preset;

  switch (preset) {
    case "7": from = new Date(now.getTime() - 6 * 86400000); break;
    case "30": from = new Date(now.getTime() - 29 * 86400000); break;
    case "90": from = new Date(now.getTime() - 89 * 86400000); break;
    case "month": from = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "lastMonth":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case "all": from = allFrom; break;
    case "custom": {
      const toRaw = sp.get("to");
      const fromRaw = sp.get("from");
      to = toRaw ? new Date(`${toRaw}T23:59:59`) : now;
      from = fromRaw ? new Date(`${fromRaw}T00:00:00`) : new Date(to.getTime() - 29 * 86400000);
      used = "custom";
      break;
    }
    default: {
      // smart: prefer last 90 days; fall back to all time when the window is empty
      from = new Date(now.getTime() - 89 * 86400000);
      const count90 = await db.order.count({ where: { createdAt: { gte: from } } });
      if (count90 === 0) { from = allFrom; used = "all"; }
      else used = "90";
    }
  }

  const orders = await db.order.findMany({
    where: { createdAt: { gte: from, lte: to } },
    include: { items: { select: { pieces: true, total: true, productId: true, gst: true } } },
    orderBy: { createdAt: "asc" },
  });

  const productIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productId)))];
  const pcRows = productIds.length ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, purchaseCost: true } }) : [];
  const pcById = new Map(pcRows.map((r) => [r.id, r.purchaseCost]));

  let gross = 0, discounts = 0, gst = 0, cogs = 0, delivery = 0, net = 0;
  const byDay = new Map<string, { revenue: number; orders: number; profit: number }>();
  const byPayment = new Map<string, { amount: number; count: number }>();
  const bySource = new Map<string, { amount: number; count: number }>();

  for (const o of orders) {
    gross += o.itemTotal;
    discounts += o.discount;
    gst += o.gstAmount;
    delivery += o.deliveryFee;
    net += o.grandTotal;
    for (const it of o.items) {
      cogs += (pcById.get(it.productId) ?? 0) * it.pieces;
    }
    const d = new Date(o.createdAt).toISOString().slice(0, 10);
    const profit = o.grandTotal - o.gstAmount - o.deliveryFee - o.items.reduce((s, i) => s + (pcById.get(i.productId) ?? 0) * i.pieces, 0);
    const day = byDay.get(d) ?? { revenue: 0, orders: 0, profit: 0 };
    day.revenue += o.grandTotal; day.orders += 1; day.profit += Math.max(0, profit);
    byDay.set(d, day);
    const pm = byPayment.get(o.paymentMethod) ?? { amount: 0, count: 0 };
    pm.amount += o.grandTotal; pm.count += 1;
    byPayment.set(o.paymentMethod, pm);
    const src = bySource.get(o.source) ?? { amount: 0, count: 0 };
    src.amount += o.grandTotal; src.count += 1;
    bySource.set(o.source, src);
  }

  const grossR = Math.round(gross), cogsR = Math.round(cogs);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return NextResponse.json({
    range: { from: fmt(from), to: fmt(to) },
    presetUsed: used,
    smartExtended: preset === "smart" && used === "all",
    summary: {
      orders: orders.length,
      gross: grossR,
      discounts: Math.round(discounts),
      gst: Math.round(gst),
      delivery: Math.round(delivery),
      net: Math.round(net),
      cogs: cogsR,
      grossProfit: Math.round(grossR - cogsR),
      profitMargin: grossR > 0 ? Math.round(((grossR - cogsR) / grossR) * 1000) / 10 : 0,
    },
    daily: [...byDay.entries()].map(([date, v]) => ({ date, revenue: Math.round(v.revenue), orders: v.orders, profit: Math.round(v.profit) })),
    byPayment: [...byPayment.entries()].map(([mode, v]) => ({ mode, amount: Math.round(v.amount), count: v.count })),
    bySource: [...bySource.entries()].map(([source, v]) => ({ source, amount: Math.round(v.amount), count: v.count })),
  });
}
