/** POST /api/auth/login — B2B customer login. */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { makeCustomerToken } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(req: NextRequest) {
  const { phone, password } = await req.json().catch(() => ({ phone: "", password: "" }));
  if (!phone || !password) return NextResponse.json({ error: "Phone and password required" }, { status: 400 });
  const customer = await db.customer.findFirst({ where: { phone: String(phone).trim(), source: "WEB" } });
  if (!customer || customer.password !== sha(String(password))) {
    return NextResponse.json({ error: "Invalid phone or password" }, { status: 401 });
  }
  if (customer.status === "SUSPENDED") return NextResponse.json({ error: "Account suspended. Contact DMK Mart support." }, { status: 403 });
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
