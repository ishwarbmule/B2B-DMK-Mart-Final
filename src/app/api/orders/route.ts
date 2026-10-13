/**
 * POST /api/orders — place a B2B order (unit-aware lines, tier pricing, coupon validation, delivery OTP).
 * GET  /api/orders?id=|phone= — order lookup.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { customerFromReq } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const lineSchema = z.object({
  id: z.string(),
  unitType: z.enum(["SINGLE", "PACK", "BULK"]),
  qty: z.number().positive(),
});

const orderSchema = z.object({
  customerName: z.string().min(2),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  email: z.string().email().optional().or(z.literal("")),
  addressLine: z.string().min(6),
  city: z.string().min(2),
  pincode: z.string().regex(/^\d{6}$/),
  zone: z.string().optional(),
  slot: z.string().optional(),
  paymentMethod: z.enum(["UPI", "CARD", "COD", "CREDIT"]),
  couponCode: z.string().optional().or(z.literal("")),
  note: z.string().optional().or(z.literal("")),
  items: z.array(lineSchema).min(1),
});

function piecesFor(unitType: string, packQty: number, piecesPerBox: number) {
  if (unitType === "SINGLE") return 1;
  if (unitType === "PACK") return Math.max(1, packQty || 1);
  return Math.max(piecesPerBox || 0, (packQty || 1) * 4, 1);
}

function tierPriceOf(p: { tier1: number; tier2: number; tier3: number; tier4: number; dealerPrice: number }, tier: string) {
  if (tier === "tier1" && p.tier1 > 0) return p.tier1;
  if (tier === "tier2" && p.tier2 > 0) return p.tier2;
  if (tier === "tier3" && p.tier3 > 0) return p.tier3;
  return p.dealerPrice || p.tier4;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid order data", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const d = parsed.data;

    // authenticated customer → tier pricing
    const customerId = customerFromReq(req);
    let priceTier = "tier4";
    let customerType = "GUEST";
    if (customerId) {
      const cust = await db.customer.findUnique({ where: { id: customerId } });
      if (cust && cust.status === "APPROVED") {
        priceTier = cust.tier;
        customerType = cust.customerType;
      }
    }

    const ids = d.items.map((i) => i.id);
    const products = await db.product.findMany({
      where: { id: { in: ids }, active: true },
      include: { brand: { select: { name: true } } },
    });
    const map = new Map(products.map((p) => [p.id, p]));

    // active offers (for offer-linked pricing/badging)
    const now = new Date();
    const offers = await db.offer.findMany({
      where: { active: true, startAt: { lte: now }, endAt: { gte: now } },
    });
    const megaOffer = offers.find((o) => o.scopeType === "ALL") ?? null;

    const lines: Array<{
      productId: string; sku: string; name: string; image: string; unitType: string; packQty: number;
      qty: number; pieces: number; unitPrice: number; gst: number; hsn: string; total: number; discount: number;
      barcode: string;
    }> = [];

    for (const it of d.items) {
      const p = map.get(it.id);
      if (!p) continue;
      const ppu = piecesFor(it.unitType, p.packQty, p.piecesPerBox);
      const base = tierPriceOf(p, priceTier);
      const packFactor = it.unitType === "SINGLE" ? 1 : it.unitType === "PACK" ? 0.94 : 0.88;
      let unitPrice = Math.round(base * ppu * packFactor * 100) / 100;
      // deal price override
      if (p.isDeal && p.dealPrice > 0 && it.unitType === "SINGLE") unitPrice = p.dealPrice;
      // mega offer discount on eligible scope
      if (megaOffer) {
        const scopeOk =
          megaOffer.scopeType === "ALL" ||
          (megaOffer.scopeType === "BRAND" && (JSON.parse(megaOffer.scopeIds || "[]") as string[]).includes(p.brand.slug)) ||
          (megaOffer.scopeType === "PRODUCT" && (JSON.parse(megaOffer.scopeIds || "[]") as string[]).includes(p.id));
        if (scopeOk && megaOffer.discountType === "PERCENT") {
          unitPrice = Math.round(unitPrice * (1 - megaOffer.discountValue / 100) * 100) / 100;
        }
      }
      const total = Math.round(unitPrice * it.qty * 100) / 100;
      lines.push({
        productId: p.id, sku: p.sku, name: p.name, image: p.image, unitType: it.unitType,
        packQty: ppu, qty: it.qty, pieces: it.qty * ppu, unitPrice, gst: p.gst, hsn: p.hsn,
        total, discount: 0,
        barcode: `${p.sku}-${it.unitType === "SINGLE" ? "S" : it.unitType === "PACK" ? "P" : "B"}${ppu}`,
      });
    }
    if (!lines.length) return NextResponse.json({ error: "No valid items in order" }, { status: 400 });

    const itemTotal = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
    const totalPieces = lines.reduce((s, l) => s + l.pieces, 0);

    // slab discount
    let slabPct = 0;
    if (itemTotal >= 100000) slabPct = 10;
    else if (itemTotal >= 50000) slabPct = 7;
    else if (itemTotal >= 25000) slabPct = 4;
    else if (itemTotal >= 5000) slabPct = 2;
    const slabDisc = Math.round(itemTotal * slabPct / 100 * 100) / 100;

    // coupon validation (with scope)
    let couponDisc = 0;
    let appliedCoupon = "";
    if (d.couponCode) {
      const c = await db.coupon.findFirst({ where: { code: d.couponCode.toUpperCase(), active: true } });
      if (c && itemTotal >= c.minOrder) {
        const withinDates = (!c.startAt || c.startAt <= now) && (!c.endAt || c.endAt >= now);
        const underLimit = c.usageLimit === 0 || c.usedCount < c.usageLimit;
        let scopeOk = true;
        if (c.scopeType !== "ALL") {
          const scopeIds = JSON.parse(c.scopeIds || "[]") as string[];
          scopeOk = lines.some((l) => {
            const p = map.get(l.productId);
            if (!p) return false;
            if (c.scopeType === "BRAND") return scopeIds.includes(p.brand.slug);
            if (c.scopeType === "PRODUCT") return scopeIds.includes(p.id);
            if (c.scopeType === "CATEGORY") return scopeIds.includes(p.endId) || scopeIds.includes(p.midId) || scopeIds.includes(p.topId);
            return false;
          });
        }
        if (withinDates && underLimit && scopeOk) {
          const raw = c.type === "PERCENT" ? itemTotal * c.value / 100 : c.value;
          couponDisc = c.maxDiscount > 0 ? Math.min(raw, c.maxDiscount) : raw;
          couponDisc = Math.round(couponDisc * 100) / 100;
          appliedCoupon = c.code;
        }
      }
    }

    const discount = Math.min(itemTotal, Math.round((slabDisc + couponDisc) * 100) / 100);
    // GST Mode (admin Settings toggle): "off" ⇒ the order is billed WITHOUT GST (no tax added/shown).
    const gstSetting = await db.setting.findUnique({ where: { key: "gst_enabled" } });
    const gstEnabled = gstSetting?.value !== "off";
    // blended GST from lines
    const taxableBase = itemTotal - discount;
    const gstAmount = gstEnabled ? Math.round(taxableBase * 0.18 * 100) / 100 : 0;
    const deliveryFee = itemTotal >= 5000 ? 0 : 250;
    const grandTotal = Math.round((taxableBase + gstAmount + deliveryFee) * 100) / 100;
    const totalSavings = Math.round(
      lines.reduce((s, l) => {
        const p = map.get(l.productId)!;
        return s + Math.max(0, (p.mrp * l.pieces) - l.total);
      }, 0) * 100
    ) / 100;

    const invoiceNo = `DMK/2026-27/INV/${2001 + (await db.order.count())}`;
    const otp = String(1000 + Math.floor(Math.random() * 9000));

    const order = await db.order.create({
      data: {
        invoiceNo,
        otp,
        otpSentAt: new Date(),
        totalUnits: Math.round(totalPieces),
        itemTotal, gstAmount, deliveryFee, discount, grandTotal, totalSavings,
        couponCode: appliedCoupon,
        offerId: megaOffer?.id ?? "",
        customerId: customerId ?? "",
        customerName: d.customerName,
        customerType, priceTier,
        phone: d.phone,
        email: d.email || "",
        addressLine: d.addressLine,
        city: d.city,
        pincode: d.pincode,
        zone: d.zone || "",
        slot: d.slot || "Standard dispatch",
        paymentMethod: d.paymentMethod,
        paymentStatus: d.paymentMethod === "CREDIT" ? "PENDING" : "PAID",
        status: "PENDING",
        source: "WEB",
        note: d.note || "",
      },
    });
    for (const l of lines) {
      await db.orderItem.create({ data: { ...l, orderId: order.id } });
    }

    // customer stats + stock decrement + coupon usage
    if (customerId) {
      await db.customer.update({ where: { id: customerId }, data: { orders: { increment: 1 }, totalSpent: { increment: grandTotal } } }).catch(() => {});
    }
    for (const l of lines) {
      await db.product.update({ where: { id: l.productId }, data: { stock: { decrement: l.pieces } } }).catch(() => {});
    }
    if (appliedCoupon) {
      await db.coupon.updateMany({ where: { code: appliedCoupon }, data: { usedCount: { increment: 1 } } });
    }
    await db.activityLog.create({
      data: { action: "CREATE", entity: "order", entityId: order.id, detail: `Web order ${invoiceNo} placed by ${d.customerName} (₹${grandTotal}) — OTP ${otp}` },
    });

    return NextResponse.json({
      ok: true, orderId: order.id, invoiceNo, otp,
      bill: { itemTotal, slabPct, slabDisc, couponDisc, discount, gstAmount, deliveryFee, grandTotal, totalSavings, totalPieces, appliedCoupon, priceTier, customerType },
    });
  } catch (e) {
    console.error("[orders] place failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  const phone = sp.get("phone");
  if (id) {
    const order = await db.order.findFirst({
      where: { OR: [{ id }, { invoiceNo: id }] },
      include: { items: true },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ order });
  }
  if (phone) {
    const orders = await db.order.findMany({ where: { phone }, orderBy: { createdAt: "desc" }, take: 20, include: { items: true } });
    return NextResponse.json({ orders });
  }
  const orders = await db.order.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { items: true } });
  return NextResponse.json({ orders });
}
