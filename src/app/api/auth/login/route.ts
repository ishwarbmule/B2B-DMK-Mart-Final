/** POST /api/auth/login — B2B customer login (mobile or email + password). */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { makeCustomerToken, normalizeIdentifier } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const raw = (body.identifier ?? body.phone ?? "") as string;
  const password = String(body.password ?? "");
  if (!raw || !password) return NextResponse.json({ error: "Mobile/email and password are required" }, { status: 400 });

  const norm = normalizeIdentifier(raw);
  if (!norm) return NextResponse.json({ error: "Enter a valid 10-digit mobile number or email address." }, { status: 400 });

  const customer = await db.customer.findFirst({
    where: norm.kind === "phone"
      ? { phone: norm.value, source: "WEB" }
      : { email: norm.value, source: "WEB", password: { not: "" } },
  });
  if (!customer || customer.password !== sha(password)) {
    return NextResponse.json({ error: "The password you entered is incorrect. Please try again." }, { status: 401 });
  }
  if (customer.status === "PENDING") {
    return NextResponse.json({ error: "Your account is awaiting admin approval. The DMK Mart team verifies every B2B buyer — you will get a WhatsApp message as soon as it is approved." }, { status: 403 });
  }
  if (customer.status === "SUSPENDED") {
    return NextResponse.json({ error: "Account suspended. Contact DMK Mart support." }, { status: 403 });
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
