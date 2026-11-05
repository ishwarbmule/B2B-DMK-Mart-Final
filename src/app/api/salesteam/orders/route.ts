/**
 * /api/salesteam/orders — the salesperson ordering system (portal: /salesteam).
 *   POST — place an order for a retailer/shop the salesperson is visiting:
 *          customer details (find-or-create by phone) + product lines, verified in
 *          the panel before confirming. The order lands in the admin Orders section
 *          with the salesperson's name and is routed to the nearest serving warehouse.
 *   GET  — the salesperson's own order book (orders they brought to the business).
 * Auth: SLS staff token (lib/staff-auth.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { staffIdentity } from "@/lib/staff-auth";
import { piecesForUnit, unitPriceForLine, round2, isFulfillment, type Fulfillment } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const lineSchema = z.object({
  id: z.string(),
  unitType: z.enum(["SINGLE", "PACK", "BULK"]),
  qty: z.number().positive(),
});

const orderSchema = z.object({
  customerName: z.string().min(2),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  shopName: z.string().optional().or(z.literal("")),
  gstin: z.string().optional().or(z.literal("")),
  addressLine: z.string().min(6),
  city: z.string().min(2),
  pincode: z.string().regex(/^\d{6}$/),
  customerType: z.enum(["RETAILER", "WHOLESALE", "SEMI_WHOLESALE", "DISTRIBUTOR"]).optional(),
  fulfillment: z.enum(["PICKUP", "DELIVERY"]).optional(),
  pickupWarehouseId: z.string().optional().or(z.literal("")),
  paymentMethod: z.enum(["UPI", "CARD", "COD", "CREDIT"]).optional(),
  note: z.string().optional().or(z.literal("")),
  items: z.array(lineSchema).min(1),
});

async function salespersonFromReq(req: NextRequest): Promise<{ id: string; name: string } | null> {
  const identity = await staffIdentity(req);
  if (!identity || identity.role !== "salesperson") return null;
  return { id: identity.salesPersonId, name: identity.name };
}

/** Serving warehouse — pickup warehouse for PICKUP, nearest-by-city / default godown for DELIVERY. */
async function resolveWarehouse(fulfillment: Fulfillment, pickupWarehouseId: string, city: string) {
  if (fulfillment === "PICKUP") {
    const wh = pickupWarehouseId
      ? await db.warehouse.findFirst({ where: { id: pickupWarehouseId, active: true } })
      : null;
    if (!wh) return null;
    return { id: wh.id, name: wh.name };
  }
  const warehouses = await db.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] });
  const c = (city || "").trim().toLowerCase();
  const byCity = c ? warehouses.find((w) => (w.city || "").trim().toLowerCase() === c) : undefined;
  const chosen = byCity ?? warehouses.find((w) => w.isDefault) ?? warehouses[0];
  return chosen ? { id: chosen.id, name: chosen.name } : null;
}

export async function POST(req: NextRequest) {
  const sp = await salespersonFromReq(req);
  if (!sp) return NextResponse.json({ error: "Salesperson login required" }, { status: 401 });

  try {
    const parsed = orderSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid order data", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const d = parsed.data;
    const fulfillment: Fulfillment = isFulfillment(d.fulfillment) ? d.fulfillment : "DELIVERY";

    // customer — find by phone, else create the shop on the spot (createdBy = salesperson)
    let cust = await db.customer.findUnique({ where: { phone: d.phone } });
    if (!cust) {
      cust = await db.customer.create({
        data: {
          name: d.customerName,
          shopName: d.shopName || "",
          phone: d.phone,
          gstin: d.gstin || "",
          address: d.addressLine,
          city: d.city,
          pincode: d.pincode,
          customerType: d.customerType || "RETAILER",
          tier: "tier2",
          status: "PENDING",
          source: "WEB",
          createdBy: sp.name,
        },
      });
    }

    // products + tier pricing (same engine as web checkout)
    const priceTier = cust.status === "APPROVED" ? cust.tier : "tier2"; // logged-in B2B baseline
    const ids = d.items.map((i) => i.id);
    const products = await db.product.findMany({ where: { id: { in: ids }, active: true } });
    const map = new Map(products.map((p) => [p.id, p]));

    const lines: Array<{
      productId: string; sku: string; name: string; image: string; unitType: string; packQty: number;
      qty: number; pieces: number; unitPrice: number; gst: number; hsn: string; total: number; discount: number; barcode: string;
    }> = [];
    for (const it of d.items) {
      const p = map.get(it.id);
      if (!p) continue;
      const ppu = piecesForUnit(it.unitType, p.packQty, p.piecesPerBox);
      const unitPrice = unitPriceForLine(p, priceTier, it.unitType, fulfillment);
      lines.push({
        productId: p.id, sku: p.sku, name: p.name, image: p.image, unitType: it.unitType,
        packQty: ppu, qty: it.qty, pieces: it.qty * ppu, unitPrice, gst: p.gst, hsn: p.hsn,
        total: round2(unitPrice * it.qty), discount: 0,
        barcode: `${p.sku}-${it.unitType === "SINGLE" ? "S" : it.unitType === "PACK" ? "P" : "B"}${ppu}`,
      });
    }
    if (!lines.length) return NextResponse.json({ error: "No valid items in order" }, { status: 400 });

    const itemTotal = round2(lines.reduce((s, l) => s + l.total, 0));
    const totalPieces = lines.reduce((s, l) => s + l.pieces, 0);

    // slab discount — identical slabs to web checkout
    let slabPct = 0;
    if (itemTotal >= 100000) slabPct = 10;
    else if (itemTotal >= 50000) slabPct = 7;
    else if (itemTotal >= 25000) slabPct = 4;
    else if (itemTotal >= 5000) slabPct = 2;
    const slabDisc = round2((itemTotal * slabPct) / 100);
    const discount = slabDisc;

    const serving = await resolveWarehouse(fulfillment, d.pickupWarehouseId || "", d.city);
    if (!serving) return NextResponse.json({ error: "Choose a pickup warehouse" }, { status: 400 });

    const deliveryFee = fulfillment === "PICKUP" ? 0 : 250;
    const grandTotal = round2(itemTotal - discount + deliveryFee);
    const invoiceNo = `DMK/2026-27/INV/${2001 + (await db.order.count())}`;
    const otp = String(1000 + Math.floor(Math.random() * 9000));
    const paymentMethod = d.paymentMethod || "COD";

    const order = await db.order.create({
      data: {
        invoiceNo, otp, otpSentAt: new Date(),
        totalUnits: Math.round(totalPieces),
        itemTotal, gstAmount: 0, deliveryFee, discount, grandTotal,
        couponCode: "", offerId: "",
        customerId: cust.id,
        customerName: d.customerName,
        customerType: cust.status === "APPROVED" ? cust.customerType : (d.customerType || "RETAILER"),
        priceTier,
        phone: d.phone,
        email: cust.email || "",
        addressLine: fulfillment === "PICKUP" ? `Warehouse pickup — ${serving.name}` : d.addressLine,
        city: fulfillment === "PICKUP" ? "" : d.city,
        pincode: fulfillment === "PICKUP" ? "" : d.pincode,
        fulfillment,
        pickupWarehouseId: fulfillment === "PICKUP" ? serving.id : "",
        pickupWarehouseName: fulfillment === "PICKUP" ? serving.name : "",
        warehouseId: serving.id,
        warehouseName: serving.name,
        slot: "Sales team booking",
        paymentMethod,
        paymentStatus: paymentMethod === "CREDIT" ? "PENDING" : "PENDING",
        waOptIn: false,
        status: "PENDING",
        source: "SALESTEAM",
        salesPerson: sp.name,
        note: d.note || "",
      },
    });
    for (const l of lines) {
      await db.orderItem.create({ data: { ...l, orderId: order.id } });
    }

    await db.customer.update({ where: { id: cust.id }, data: { orders: { increment: 1 }, totalSpent: { increment: grandTotal } } }).catch(() => {});
    await db.activityLog.create({
      data: { action: "CREATE", entity: "order", entityId: order.id, detail: `Sales-team order ${invoiceNo} placed by ${sp.name} for ${d.customerName} (${d.phone}) — ₹${grandTotal} — warehouse ${serving.name}` },
    });

    return NextResponse.json({
      ok: true, orderId: order.id, invoiceNo,
      customer: { id: cust.id, name: cust.name, created: cust.createdAt === undefined },
      bill: { itemTotal, slabPct, slabDisc, deliveryFee, grandTotal, totalPieces, priceTier, fulfillment, warehouseName: serving.name },
    });
  } catch (e) {
    console.error("[salesteam/orders] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to place the order" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sp = await salespersonFromReq(req);
  if (!sp) return NextResponse.json({ error: "Salesperson login required" }, { status: 401 });

  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "50")));
  const orders = await db.order.findMany({
    where: { salesPerson: sp.name },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { items: true },
  });
  const brought = orders.reduce((s, o) => s + o.grandTotal, 0);
  return NextResponse.json({ orders, summary: { count: orders.length, brought: Math.round(brought) } });
}
