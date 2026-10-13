/** GET /api/admin/reports?type=&from=&to= — report datasets for view + export. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") || "sales";
  const to = sp.get("to") ? new Date(sp.get("to") + "T23:59:59") : new Date();
  const from = sp.get("from") ? new Date(sp.get("from")) : new Date(to.getTime() - 29 * 86400000);
  const range = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };

  if (type === "sales") {
    const orders = await db.order.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "desc" },
      select: { invoiceNo: true, createdAt: true, customerName: true, customerType: true, phone: true, city: true, paymentMethod: true, paymentStatus: true, status: true, itemTotal: true, gstAmount: true, discount: true, grandTotal: true, couponCode: true, otp: true },
    });
    return NextResponse.json({ range, type, columns: ["Invoice", "Date", "Customer", "Type", "Phone", "City", "Payment", "PayStatus", "OrderStatus", "ItemTotal", "GST", "Discount", "GrandTotal", "Coupon", "OTP"], rows: orders.map((o) => [o.invoiceNo, new Date(o.createdAt).toLocaleDateString("en-IN"), o.customerName, o.customerType, o.phone, o.city, o.paymentMethod, o.paymentStatus, o.status, o.itemTotal, o.gstAmount, o.discount, o.grandTotal, o.couponCode, o.otp]) });
  }

  if (type === "products") {
    const items = await db.orderItem.findMany({
      where: { order: { createdAt: { gte: from, lte: to } } },
      select: { sku: true, name: true, unitType: true, qty: true, pieces: true, unitPrice: true, total: true, productId: true },
    });
    const agg = new Map<string, { sku: string; name: string; qty: number; pieces: number; revenue: number }>();
    for (const it of items) {
      const a = agg.get(it.sku) ?? { sku: it.sku, name: it.name, qty: 0, pieces: 0, revenue: 0 };
      a.qty += it.qty; a.pieces += it.pieces; a.revenue += it.total;
      agg.set(it.sku, a);
    }
    const rows = [...agg.values()].sort((a, b) => b.revenue - a.revenue);
    return NextResponse.json({ range, type, columns: ["SKU", "Product", "Lines", "Pieces", "Revenue"], rows: rows.map((r) => [r.sku, r.name, r.qty, r.pieces, Math.round(r.revenue)]) });
  }

  if (type === "inventory") {
    const products = await db.product.findMany({
      orderBy: { stock: "asc" },
      select: { sku: true, name: true, stock: true, damagedStock: true, reservedQty: true, lowStockThreshold: true, purchaseCost: true, dealerPrice: true, brand: { select: { name: true } }, active: true },
    });
    return NextResponse.json({ range, type, columns: ["SKU", "Product", "Brand", "Stock", "Damaged", "Reserved", "LowThreshold", "PurchaseCost", "DealerPrice", "Value", "Active"], rows: products.map((p) => [p.sku, p.name, p.brand.name, p.stock, p.damagedStock, p.reservedQty, p.lowStockThreshold, p.purchaseCost, p.dealerPrice, Math.round(p.stock * p.purchaseCost), p.active]) });
  }

  if (type === "customers") {
    const customers = await db.customer.findMany({
      where: { createdAt: { lte: to } },
      orderBy: { totalSpent: "desc" },
      select: { name: true, shopName: true, phone: true, customerType: true, tier: true, city: true, status: true, orders: true, totalSpent: true, createdAt: true },
    });
    return NextResponse.json({ range, type, columns: ["Customer", "Shop", "Phone", "Type", "Tier", "City", "Status", "Orders", "LifetimeValue", "Joined"], rows: customers.map((c) => [c.name, c.shopName, c.phone, c.customerType, c.tier, c.city, c.status, c.orders, c.totalSpent, new Date(c.createdAt).toLocaleDateString("en-IN")]) });
  }

  if (type === "offers") {
    const [offers, coupons] = await Promise.all([
      db.offer.findMany({ select: { name: true, type: true, headline: true, discountType: true, discountValue: true, scopeType: true, heroSlot: true, active: true, startAt: true, endAt: true } }),
      db.coupon.findMany({ select: { code: true, headline: true, type: true, value: true, minOrder: true, usedCount: true, usageLimit: true, scopeType: true, showOnHome: true, active: true } }),
    ]);
    const rows = [
      ...offers.map((o) => ["OFFER", o.name, o.headline, o.type, `${o.discountType} ${o.discountValue}`, o.scopeType, o.heroSlot ? "Hero" : "-", o.active ? "Active" : "Inactive", `${new Date(o.startAt ?? 0).toLocaleDateString("en-IN")} → ${new Date(o.endAt ?? 0).toLocaleDateString("en-IN")}`, ""]),
      ...coupons.map((c) => ["COUPON", c.code, c.headline, c.type, `${c.type} ${c.value}`, c.scopeType, c.showOnHome ? "Homepage" : "-", c.active ? "Active" : "Inactive", "-", `${c.usedCount}/${c.usageLimit || "∞"} used`]),
    ];
    return NextResponse.json({ range, type, columns: ["Kind", "Name/Code", "Headline", "Type", "Value", "Scope", "Placement", "Status", "Dates", "Usage"], rows });
  }

  if (type === "gst") {
    const orders = await db.order.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { invoiceNo: true, createdAt: true, customerName: true, itemTotal: true, gstAmount: true, grandTotal: true },
    });
    const rows = orders.map((o) => {
      const taxable = o.itemTotal - o.discount;
      return [o.invoiceNo, new Date(o.createdAt).toLocaleDateString("en-IN"), o.customerName, Math.round(taxable * 100) / 100, "18%", Math.round(taxable * 0.09 * 100) / 100, Math.round(taxable * 0.09 * 100) / 100, Math.round(taxable * 0.18 * 100) / 100, o.grandTotal];
    });
    return NextResponse.json({ range, type, columns: ["Invoice", "Date", "Party", "Taxable", "Rate", "CGST", "SGST", "TotalGST", "InvoiceTotal"], rows });
  }

  return jsonError("Unknown report type", 400);
}
