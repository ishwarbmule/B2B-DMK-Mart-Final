import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { requireStaff, staffIdentity } from "@/lib/staff-auth";
import { smsTemplates } from "@/lib/sms";
import { notifyCustomer } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Super Admin sees everything; a warehouse manager (permission "orders") is scoped
  // to the godown the order is routed to.
  const unauthorized = await requireStaff(req, "orders");
  if (unauthorized) return unauthorized;
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const status = sp.get("status") || "";
  const payment = sp.get("payment") || "";
  const shipping = sp.get("shipping") || "";
  const source = sp.get("source") || "";
  const warehouseId = sp.get("warehouseId") || "";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20")));

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { customerName: { contains: q } },
      { phone: { contains: q } },
      { invoiceNo: { contains: q } },
      { otp: { contains: q } },
    ];
  }
  if (status) where.status = status;
  if (payment) where.paymentStatus = payment;
  if (shipping) where.shippingStatus = shipping;
  if (source) where.source = source;
  if (warehouseId) where.warehouseId = warehouseId;
  // manager scope — a godown manager only ever sees orders routed to their warehouse
  const identity = await staffIdentity(req);
  if (identity?.role === "manager") where.warehouseId = identity.warehouseId;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to + "T23:59:59") } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit, include: { items: true } }),
  ]);
  const sumAgg = await db.order.aggregate({ where, _sum: { grandTotal: true } });
  return NextResponse.json({
    rows,
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
    revenue: Math.round(sumAgg._sum.grandTotal || 0),
  });
}

export async function PATCH(req: NextRequest) {
  // manager scope: a warehouse manager may only touch orders routed to their godown
  const identity = await staffIdentity(req);
  if (!identity || (identity.role !== "admin" && identity.role !== "manager")) {
    return jsonError("Unauthorized", 401);
  }
  const isManager = identity.role === "manager";
  if (isManager && !identity.permissions.includes("orders")) {
    return jsonError("This section is not enabled for your account", 403);
  }
  try {
    const { id, status, paymentStatus, shippingStatus, deliveryMan, regenerateOtp } = await req.json();
    if (!id) return jsonError("Missing id");
    if (isManager) {
      const scope = await db.order.findUnique({ where: { id: String(id) }, select: { warehouseId: true } });
      if (!scope || scope.warehouseId !== identity.warehouseId) {
        return jsonError("This order is not routed to your warehouse", 403);
      }
    }
    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (paymentStatus) data.paymentStatus = paymentStatus;
    if (shippingStatus) data.shippingStatus = shippingStatus;
    if (deliveryMan !== undefined) data.deliveryMan = deliveryMan;
    if (regenerateOtp) {
      data.otp = String(1000 + Math.floor(Math.random() * 9000));
      data.otpSentAt = new Date();
    }
    const row = await db.order.update({ where: { id: String(id) }, data, include: { items: true } });
    await db.activityLog.create({
      data: { action: "UPDATE", entity: "order", entityId: row.id, detail: `Order ${row.invoiceNo} updated (status: ${row.status}, shipping: ${row.shippingStatus}${regenerateOtp ? `, OTP regenerated: ${row.otp}` : ""})` },
    });

    // Auto-notify the customer when the order status changed — only if they opted in to
    // WhatsApp updates at checkout (checkout checkbox). Admin can always send manually
    // via the WhatsApp button in the orders module.
    if (status && status !== "PENDING" && row.waOptIn) {
      try {
        const cust = row.customerId ? await db.customer.findUnique({ where: { id: row.customerId } }) : null;
        const phone = cust?.phone || row.phone;
        if (phone) {
          const support = (await db.setting.findUnique({ where: { key: "support_phone" } }))?.value || "";
          notifyCustomer(phone, smsTemplates.orderStatus(row.invoiceNo, status, support), {
            templateKey: "wa_status_template",
            params: [row.invoiceNo, status, support || "-"],
          }).catch(() => {});
        }
      } catch { /* notification must never block the admin update */ }
    }

    return NextResponse.json({ row });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Update failed", 400);
  }
}
