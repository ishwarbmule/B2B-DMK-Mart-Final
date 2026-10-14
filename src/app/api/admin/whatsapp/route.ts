/** POST/GET /api/admin/whatsapp — admin manual WhatsApp sending (user request: small customer base for now,
 *  admin sends messages by hand — free via wa.me deep link, or through the gateway when configured).
 *
 *  POST body by action:
 *  - ORDER_STATUS  { orderId, status, message? }   → status-aware message, gateway send attempt, wa.me URL back
 *  - CUSTOMER_OTP  { customerId, purpose: LOGIN|RESET } → generate 6-digit OTP (10 min), gateway attempt, wa.me URL
 *  - CUSTOM        { phone, message }              → free-form send attempt, wa.me URL
 *
 *  GET ?action=order-preview&orderId=&status= → { message } (no send — used to prefill the admin editor)
 *
 *  Every response: { ok, mode: "GATEWAY"|"MANUAL", sent, waUrl, message?, code? }
 *  GATEWAY = delivered through the configured WhatsApp/SMS gateway; MANUAL = admin clicks wa.me to send free.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { normalizePhone } from "@/lib/sms";
import { notifyCustomer, getWhatsAppConfig } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const OTP_TTL_MS = 10 * 60 * 1000;

async function supportPhone(): Promise<string> {
  return (await db.setting.findUnique({ where: { key: "support_phone" } }))?.value || "";
}

function waUrlFor(phone: string, message: string): string {
  const to = normalizePhone(phone) || "0000000000";
  return `https://wa.me/91${to}?text=${encodeURIComponent(message)}`;
}

type OrderLike = { customerName: string; invoiceNo: string; grandTotal: number; otp: string; status: string };

function orderMessage(o: OrderLike, support: string, override?: string): string {
  if (override && override.trim()) return override.trim();
  const total = `₹${Number(o.grandTotal).toLocaleString("en-IN")}`;
  const help = support ? ` Help: ${support}` : "";
  switch (o.status) {
    case "PENDING":
      return `Namaste ${o.customerName}! Your DMK Mart order ${o.invoiceNo} (${total}) is received and awaiting confirmation. We will update you shortly.${help} — DMK Mart B2B`;
    case "CONFIRMED":
      return `Namaste ${o.customerName}! Order ${o.invoiceNo} (${total}) is CONFIRMED and being prepared at our warehouse. Thank you for your business.${help} — DMK Mart B2B`;
    case "PACKED":
      return `Namaste ${o.customerName}! Order ${o.invoiceNo} is PACKED and ready for dispatch. You will receive the delivery OTP soon.${help} — DMK Mart B2B`;
    case "DISPATCHED":
      return `Namaste ${o.customerName}! Order ${o.invoiceNo} is ON THE WAY. Delivery OTP: ${o.otp || "—"} (share only with our delivery staff at handover). Amount ${total}.${help} — DMK Mart B2B`;
    case "DELIVERED":
      return `Namaste ${o.customerName}! Order ${o.invoiceNo} has been DELIVERED. Thank you for ordering from DMK Mart B2B — we look forward to serving you again.${help}`;
    case "CANCELLED":
      return `Namaste ${o.customerName}, your DMK Mart order ${o.invoiceNo} has been CANCELLED as requested. Any payment made will be refunded in 3-5 working days.${help} — DMK Mart B2B`;
    default:
      return `DMK Mart order ${o.invoiceNo}: status ${o.status}. (${total})${help}`;
  }
}

async function attemptSend(phone: string, message: string, opts?: { useOtpTemplate?: boolean; otpCode?: string }) {
  const cfg = await getWhatsAppConfig().catch(() => null);
  if (!cfg?.enabled) return { mode: "MANUAL" as const, sent: false };
  const res = await notifyCustomer(phone, message, opts ?? {});
  return { mode: (res.ok && !res.demo ? "GATEWAY" : "MANUAL") as "GATEWAY" | "MANUAL", sent: res.ok && !res.demo, error: res.error };
}

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const sp = req.nextUrl.searchParams;
  if (sp.get("action") !== "order-preview") return jsonError("Unknown action", 400);
  const orderId = sp.get("orderId") || "";
  const status = sp.get("status") || "PENDING";
  const o = await db.order.findUnique({ where: { id: orderId }, select: { customerName: true, invoiceNo: true, grandTotal: true, otp: true } });
  if (!o) return jsonError("Order not found", 404);
  const support = await supportPhone();
  return NextResponse.json({ message: orderMessage({ ...o, status }, support) });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  try {
    /* ── Order status message ── */
    if (action === "ORDER_STATUS") {
      const o = await db.order.findUnique({ where: { id: String(body.orderId || "") } });
      if (!o) return jsonError("Order not found", 404);
      const status = String(body.status || o.status);
      const support = await supportPhone();
      const message = orderMessage(o, support, typeof body.message === "string" ? body.message : undefined);
      const send = await attemptSend(o.phone, message);
      await db.activityLog.create({
        data: { action: "UPDATE", entity: "whatsapp", entityId: o.id, detail: `Order ${o.invoiceNo} WhatsApp (${status}) via ${send.mode}${send.sent ? "" : " — admin opens wa.me link"}`, user: "Super Admin" },
      });
      return NextResponse.json({ ok: true, mode: send.mode, sent: send.sent, error: send.error, waUrl: waUrlFor(o.phone, message), message });
    }

    /* ── Customer OTP (login help / password reset) ── */
    if (action === "CUSTOMER_OTP") {
      const c = await db.customer.findUnique({ where: { id: String(body.customerId || "") } });
      if (!c) return jsonError("Customer not found", 404);
      const purpose = body.purpose === "RESET" ? "RESET" : "LOGIN";
      const identifier = c.phone; // OTPs go to the registered mobile
      if (!normalizePhone(identifier)) return jsonError("Customer has no valid mobile number", 400);

      await db.otpCode.updateMany({ where: { identifier, purpose, consumed: false }, data: { consumed: true } });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await db.otpCode.create({ data: { identifier, code, purpose, expiresAt: new Date(Date.now() + OTP_TTL_MS) } });

      const support = await supportPhone();
      const what = purpose === "RESET" ? "reset your password" : "log in";
      const message = `Namaste ${c.shopName || c.name}! Your DMK Mart code to ${what} is ${code}. Valid 10 minutes — do not share it with anyone.${support ? ` Help: ${support}` : ""} — DMK Mart B2B`;
      const send = await attemptSend(identifier, message, { useOtpTemplate: true, otpCode: code });
      await db.activityLog.create({
        data: { action: "UPDATE", entity: "whatsapp", entityId: c.id, detail: `${purpose} OTP generated for ${c.phone} — admin WhatsApp send (${send.mode})`, user: "Super Admin" },
      });
      return NextResponse.json({ ok: true, mode: send.mode, sent: send.sent, error: send.error, waUrl: waUrlFor(identifier, message), code });
    }

    /* ── Free-form custom message ── */
    if (action === "CUSTOM") {
      const phone = String(body.phone || "");
      const message = String(body.message || "").trim();
      if (!normalizePhone(phone)) return jsonError("Invalid mobile number", 400);
      if (!message) return jsonError("Message is empty", 400);
      const send = await attemptSend(phone, message);
      await db.activityLog.create({
        data: { action: "UPDATE", entity: "whatsapp", detail: `Custom WhatsApp to +91${normalizePhone(phone)} via ${send.mode}`, user: "Super Admin" },
      });
      return NextResponse.json({ ok: true, mode: send.mode, sent: send.sent, error: send.error, waUrl: waUrlFor(phone, message), message });
    }

    return jsonError("Unknown action", 400);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "WhatsApp send failed", 500);
  }
}
