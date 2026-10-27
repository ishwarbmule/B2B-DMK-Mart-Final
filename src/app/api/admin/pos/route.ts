import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** POS Billing — search products by barcode / item code / name (fast, limit 8) */
export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (!q) return NextResponse.json({ rows: [] });
  const rows = await db.product.findMany({
    where: {
      active: true,
      OR: [
        { barcode: { contains: q } },
        { sku: { contains: q } },
        { name: { contains: q } },
      ],
    },
    take: 8,
    include: { brand: { select: { name: true } } },
  });
  return NextResponse.json({ rows });
}

/** POS Billing — create a POS sale order (unit-aware, OTP printed) */
export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const items: { id: string; unitType?: string; qty?: number; cases?: number }[] = body.items || [];
    if (!items.length) return jsonError("Cart is empty");
    const ids = items.map((i) => i.id);
    const products = await db.product.findMany({
      where: { id: { in: ids } },
      include: { brand: { select: { name: true } } },
    });
    const map = new Map(products.map((p) => [p.id, p]));
    const orderItems: {
      productId: string; sku: string; name: string; image: string; unitType: string; packQty: number;
      qty: number; pieces: number; unitPrice: number; gst: number; hsn: string; total: number; discount: number; barcode: string;
    }[] = [];
    for (const it of items) {
      const p = map.get(it.id);
      if (!p) continue;
      const unitType = it.unitType ?? "SINGLE";
      const ppu = unitType === "SINGLE" ? 1 : unitType === "PACK" ? Math.max(1, p.packQty) : Math.max(p.piecesPerBox || p.packQty * 4, 1);
      const qty = it.qty ?? it.cases ?? 1;
      const unitPrice = unitType === "SINGLE" ? p.dealerPrice : unitType === "PACK" ? Math.round(p.dealerPrice * ppu * 0.94 * 100) / 100 : Math.round(p.dealerPrice * ppu * 0.88 * 100) / 100;
      orderItems.push({
        productId: p.id, sku: p.sku, name: p.name, image: p.image, unitType, packQty: ppu,
        qty, pieces: qty * ppu, unitPrice, gst: p.gst, hsn: p.hsn,
        total: Math.round(unitPrice * qty * 100) / 100, discount: 0,
        barcode: `${p.sku}-${unitType === "SINGLE" ? "S" : unitType === "PACK" ? "P" : "B"}${ppu}`,
      });
    }
    const itemTotal = Math.round(orderItems.reduce((s, l) => s + l.total, 0) * 100) / 100;
    const discount = Math.min(itemTotal, Number(body.discount) || 0);
    const gstAmount = 0; // No GST — DMK Mart does not charge or provide GST.
    const grandTotal = Math.round((itemTotal - discount + gstAmount) * 100) / 100;
    const invoiceNo = `DMK/2026-27/INV/${2001 + (await db.order.count())}`;
    const otp = String(1000 + Math.floor(Math.random() * 9000));
    const order = await db.order.create({
      data: {
        invoiceNo,
        otp,
        otpSentAt: new Date(),
        totalPieces: orderItems.reduce((s, l) => s + l.pieces, 0),
        itemTotal, gstAmount, deliveryFee: 0, discount, grandTotal,
        customerName: body.customerName || "Walk-in Customer",
        phone: body.phone || "9999999999",
        addressLine: "POS Counter, Pune Warehouse", city: "Pune", pincode: "411019",
        slot: "Immediate", paymentMethod: body.paymentMethod || "CASH",
        paymentStatus: "PAID", status: "COMPLETED", shippingStatus: "DELIVERED",
        source: "POS",
      },
    });
    for (const l of orderItems) {
      await db.orderItem.create({ data: { ...l, orderId: order.id } });
      await db.product.update({ where: { id: l.productId }, data: { stock: { decrement: l.pieces } } });
    }
    await db.activityLog.create({ data: { action: "CREATE", entity: "order", entityId: order.id, detail: `POS sale ${invoiceNo} (₹${grandTotal}, OTP ${otp})` } });
    return NextResponse.json({ ok: true, invoiceNo, orderId: order.id, grandTotal, otp });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "POS sale failed", 500);
  }
}
