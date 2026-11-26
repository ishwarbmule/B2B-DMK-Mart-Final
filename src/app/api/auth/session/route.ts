/**
 * POST /api/auth/session — sync an existing (legacy) customer token into the
 * storefront-gate cookie. Buyers who logged in before the login-first gate
 * carry their token in localStorage only; the /login page calls this on mount
 * so the middleware recognizes them instead of forcing a re-login.
 * Auth: x-customer-token header (same as every customer API).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerFromReq } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const customerId = customerFromReq(req);
  if (!customerId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, shopName: true, phone: true, status: true },
  });
  if (!customer || customer.status !== "APPROVED") {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true, customer });
  const token = req.headers.get("x-customer-token") || "";
  res.cookies.set("dmk_sess", token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
