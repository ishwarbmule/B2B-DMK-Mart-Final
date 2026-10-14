/** POST /api/auth/otp/send — 6-digit login/reset OTP (10-min validity, 45s resend cooldown). */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeIdentifier, maskIdentifier } from "@/lib/customer-auth";
import { smsTemplates } from "@/lib/sms";
import { notifyCustomer } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;

export async function POST(req: NextRequest) {
  const { identifier, purpose } = await req.json().catch(() => ({ identifier: "", purpose: "LOGIN" }));
  const norm = normalizeIdentifier(identifier);
  if (!norm) return NextResponse.json({ error: "Enter a valid 10-digit mobile number or email address." }, { status: 400 });
  const cleanPurpose = purpose === "RESET" ? "RESET" : "LOGIN";

  const customer = await db.customer.findFirst({
    where: norm.kind === "phone"
      ? { phone: norm.value, source: "WEB" }
      : { email: norm.value, source: "WEB", password: { not: "" } },
  });
  if (!customer) {
    return NextResponse.json({ error: "We couldn't find an account linked to this mobile number or email." }, { status: 404 });
  }
  if (customer.status === "SUSPENDED") {
    return NextResponse.json({ error: "Account suspended. Contact DMK Mart support." }, { status: 403 });
  }

  // Resend cooldown — check most recent OTP (consumed or not) for this identifier+purpose.
  const last = await db.otpCode.findFirst({
    where: { identifier: norm.value, purpose: cleanPurpose },
    orderBy: { createdAt: "desc" },
  });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - last.createdAt.getTime())) / 1000);
    return NextResponse.json({ error: `Please wait ${waitSec}s before requesting a new code.`, retryAfter: waitSec }, { status: 429 });
  }

  // Invalidate previous unconsumed codes, then issue a fresh 6-digit code.
  await db.otpCode.updateMany({
    where: { identifier: norm.value, purpose: cleanPurpose, consumed: false },
    data: { consumed: true },
  });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db.otpCode.create({
    data: { identifier: norm.value, code, purpose: cleanPurpose, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  // Deliver via WhatsApp (free-first) → SMS gateway → demo mode (phone identifiers only):
  // the code is returned for the on-screen banner so flows stay testable. Once a channel is
  // connected, real customers receive the code and devOtp is no longer exposed.
  let devOtp: string | null = code;
  if (norm.kind === "phone") {
    const note = await notifyCustomer(norm.value, smsTemplates.otp(code), { useOtpTemplate: true, otpCode: code });
    if (note.ok && !note.demo) devOtp = null; // delivered for real — don't show on screen
  }

  return NextResponse.json({
    ok: true,
    masked: maskIdentifier(norm.kind, norm.value),
    kind: norm.kind,
    devOtp,
    expiresInSec: OTP_TTL_MS / 1000,
    cooldownSec: RESEND_COOLDOWN_MS / 1000,
  });
}
