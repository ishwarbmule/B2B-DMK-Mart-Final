/** POST /api/admin/sms/test — fire a test message through the configured gateway so the
 *  admin can prove the SMS / WhatsApp setup works before customers depend on it.
 *  Body: { phone: "98xxxxxxxx", channel: "sms" | "whatsapp" }
 *  Response: { ok, demo, provider, logged? }
 *    demo=true  → gateway OFF, message only logged (demo mode) — the UI shows a warning
 *    demo=false → really sent via the named provider
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { normalizePhone, sendSms } from "@/lib/sms";
import { sendWhatsAppText } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body?.phone || ""));
  const channel = body?.channel === "whatsapp" ? "whatsapp" : "sms";
  if (!phone) return NextResponse.json({ error: "Valid 10-digit mobile number required" }, { status: 400 });

  const text =
    channel === "whatsapp"
      ? "DMK Mart test message — your WhatsApp notification channel is working."
      : "DMK Mart test SMS — your notification channel is working.";

  try {
    if (channel === "whatsapp") {
      const res = await sendWhatsAppText(`91${phone}`, text);
      return NextResponse.json({
        ok: res.ok,
        demo: Boolean(res.demo),
        provider: res.provider,
        channel: res.channel ?? "WHATSAPP",
        error: res.error,
        logged: res.demo ? `[DEMO] +91${phone} ← ${text}` : undefined,
      }, { status: res.ok ? 200 : 502 });
    }
    const res = await sendSms(phone, text);
    return NextResponse.json({
      ok: res.ok,
      demo: res.demo,
      provider: res.provider,
      channel: "SMS",
      error: res.error,
      logged: res.demo ? `[DEMO] +91${phone} ← ${text}` : undefined,
    }, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Test send failed" }, { status: 500 });
  }
}
