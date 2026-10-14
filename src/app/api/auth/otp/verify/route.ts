/** POST /api/auth/otp/verify — verify 6-digit code → login (LOGIN) or password-reset grant (RESET). */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeCustomerToken, normalizeIdentifier } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { identifier, code, purpose } = await req.json().catch(() => ({}) as Record<string, unknown>);
  const norm = normalizeIdentifier(String(identifier ?? ""));
  const otp = String(code ?? "").trim();
  const cleanPurpose = purpose === "RESET" ? "RESET" : "LOGIN";

  if (!norm || !/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: "Enter the 6-digit code we sent you." }, { status: 400 });
  }

  const record = await db.otpCode.findFirst({
    where: { identifier: norm.value, purpose: cleanPurpose, consumed: false, code: otp },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "That code is invalid or has expired. Request a new one." }, { status: 400 });
  }
  await db.otpCode.update({ where: { id: record.id }, data: { consumed: true } });

  const customer = await db.customer.findFirst({
    where: norm.kind === "phone"
      ? { phone: norm.value, source: "WEB" }
      : { email: norm.value, source: "WEB", password: { not: "" } },
  });
  if (!customer) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (customer.status === "SUSPENDED") {
    return NextResponse.json({ error: "Account suspended. Contact DMK Mart support." }, { status: 403 });
  }

  if (cleanPurpose === "RESET") {
    // Short-lived grant token (same HMAC scheme) used only by /api/auth/reset-password.
    return NextResponse.json({ ok: true, resetToken: makeCustomerToken(customer.id) });
  }

  return NextResponse.json({
    ok: true,
    token: makeCustomerToken(customer.id),
    customer: {
      id: customer.id, name: customer.name, shopName: customer.shopName, phone: customer.phone,
      customerType: customer.customerType, tier: customer.tier, status: customer.status,
      city: customer.city, orders: customer.orders, totalSpent: customer.totalSpent,
    },
  });
}
