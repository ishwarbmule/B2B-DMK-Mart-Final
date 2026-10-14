/** POST /api/auth/reset-password — set a new password using the OTP-verified reset grant. */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { verifyCustomerToken } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(req: NextRequest) {
  const { resetToken, password } = await req.json().catch(() => ({}) as Record<string, unknown>);
  const customerId = verifyCustomerToken(typeof resetToken === "string" ? resetToken : null);
  if (!customerId) {
    return NextResponse.json({ error: "Reset session expired. Please start again." }, { status: 401 });
  }
  const pwd = String(password ?? "");
  if (pwd.length < 6) {
    return NextResponse.json({ error: "Passwords must be at least 6 characters." }, { status: 400 });
  }

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  await db.customer.update({ where: { id: customerId }, data: { password: sha(pwd) } });
  // Invalidate any lingering OTPs tied to this account's identifiers.
  const ids = [customer.phone, customer.email].filter(Boolean);
  await db.otpCode.updateMany({ where: { identifier: { in: ids }, consumed: false }, data: { consumed: true } });

  return NextResponse.json({ ok: true, message: "Password updated. Sign in with your new password." });
}
