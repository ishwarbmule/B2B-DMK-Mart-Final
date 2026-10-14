/** POST /api/auth/identify — Amazon-style step 1: look up account by mobile or email. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeIdentifier, maskIdentifier } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { identifier } = await req.json().catch(() => ({ identifier: "" }));
  const norm = normalizeIdentifier(identifier);
  if (!norm) {
    return NextResponse.json(
      { found: false, error: "Enter a valid 10-digit mobile number or email address." },
      { status: 400 },
    );
  }

  const customer = await db.customer.findFirst({
    where: norm.kind === "phone"
      ? { phone: norm.value, source: "WEB" }
      : { email: norm.value, source: "WEB", password: { not: "" } },
  });

  if (!customer) {
    return NextResponse.json(
      { found: false, error: "We couldn't find an account linked to this mobile number or email." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    found: true,
    kind: norm.kind,
    masked: maskIdentifier(norm.kind, norm.value),
    name: customer.name,
    shopName: customer.shopName,
    hasPassword: Boolean(customer.password),
    customerType: customer.customerType,
  });
}
