/** SMS gateway abstraction — pluggable providers configured from Admin → Settings (stored in Setting table).
 *
 *  Supported providers: TWILIO (intl, easy trial) · MSG91 (India) · FAST2SMS (India, cheapest) · TWOFACTOR (India OTP only)
 *  With no gateway configured everything runs in DEMO mode: messages are logged to the server
 *  console and (for OTPs) shown in the UI banner, so the whole product stays testable for free.
 */

import { db } from "@/lib/db";

export type SmsProvider = "OFF" | "TWILIO" | "MSG91" | "FAST2SMS" | "TWOFACTOR";

export type SmsConfig = {
  enabled: boolean;
  provider: SmsProvider;
  apiKey: string;
  apiSecret: string; // Twilio Auth Token
  senderId: string;  // 6-char DLT sender ID or Twilio phone/MSID
  supportPhone: string;
};

export type SmsResult = { ok: boolean; demo: boolean; provider: SmsProvider; error?: string; providerId?: string };

export async function getSmsConfig(): Promise<SmsConfig> {
  const rows = await db.setting.findMany({
    where: { key: { in: ["sms_enabled", "sms_provider", "sms_api_key", "sms_api_secret", "sms_sender_id", "support_phone"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const provider = (map.sms_provider as SmsProvider) || "OFF";
  return {
    enabled: map.sms_enabled === "true" && provider !== "OFF" && Boolean(map.sms_api_key),
    provider,
    apiKey: map.sms_api_key || "",
    apiSecret: map.sms_api_secret || "",
    senderId: map.sms_sender_id || "",
    supportPhone: map.support_phone || "",
  };
}

/** Keep the last 10 digits of an Indian mobile (strips +91, spaces, dashes). */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw || "").replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const smsTemplates = {
  otp: (code: string) => `${code} is your DMK Mart B2B login code. Do not share it with anyone.`,
  orderPlaced: (invoice: string, total: number, deliveryOtp: string) =>
    `Order ${invoice} placed at DMK Mart B2B. Amount Rs.${total.toLocaleString("en-IN")}. Delivery OTP: ${deliveryOtp}. Share OTP only at handover.`,
  orderStatus: (invoice: string, status: string, support: string) =>
    `DMK Mart B2B: Order ${invoice} is now ${status}. Query? Call ${support || "+91 98220 12345"}. Thank you for your business.`,
  test: () => `DMK Mart B2B SMS gateway is live. You will receive login codes, order status and delivery OTPs on this number.`,
};

/** Send an SMS. Never throws — always resolves with a result so callers don't need try/catch. */
export async function sendSms(phone: string, text: string): Promise<SmsResult> {
  let config: SmsConfig;
  try {
    config = await getSmsConfig();
  } catch {
    config = { enabled: false, provider: "OFF", apiKey: "", apiSecret: "", senderId: "", supportPhone: "" };
  }

  const to = normalizePhone(phone);
  if (!to) return { ok: false, demo: true, provider: config.provider, error: "invalid phone" };

  // DEMO mode — gateway not configured. Log visibly so flows can still be verified.
  if (!config.enabled) {
    console.log(`[SMS:DEMO] +91${to} ← ${text}`);
    return { ok: true, demo: true, provider: "OFF" };
  }

  try {
    switch (config.provider) {
      case "TWILIO": {
        const sid = config.apiKey;
        const body = new URLSearchParams({
          From: config.senderId || "+15005550006",
          To: `+91${to}`,
          Body: text,
        });
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${config.apiSecret}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
        });
        const d = (await res.json()) as { sid?: string; message?: string };
        if (!res.ok) return { ok: false, demo: false, provider: "TWILIO", error: d.message || `Twilio ${res.status}` };
        return { ok: true, demo: false, provider: "TWILIO", providerId: d.sid };
      }

      case "MSG91": {
        const res = await fetch("https://control.msg91.com/api/v2/sendsms", {
          method: "POST",
          headers: { authkey: config.apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            sender: config.senderId || "DMKMRT",
            route: 4, // transactional
            country: "91",
            sms: [{ message: text, to: [to] }],
          }),
        });
        const d = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
        if (!res.ok || d.type === "error") return { ok: false, demo: false, provider: "MSG91", error: d.message || `MSG91 ${res.status}` };
        return { ok: true, demo: false, provider: "MSG91" };
      }

      case "FAST2SMS": {
        const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
          method: "POST",
          headers: { authorization: config.apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            route: "q", // quick transactional (no DLT template needed for testing)
            numbers: to,
            message: text,
            flash: "0",
          }),
        });
        const d = (await res.json().catch(() => ({}))) as { return?: boolean; message?: string | string[] };
        const msg = Array.isArray(d.message) ? d.message.join(", ") : d.message;
        if (!res.ok || d.return !== true) return { ok: false, demo: false, provider: "FAST2SMS", error: msg || `Fast2SMS ${res.status}` };
        return { ok: true, demo: false, provider: "FAST2SMS" };
      }

      case "TWOFACTOR": {
        // 2Factor delivers OTPs through its fixed template — extract the 6-digit code.
        const code = text.match(/\b(\d{6})\b/)?.[1];
        if (!code) return { ok: false, demo: false, provider: "TWOFACTOR", error: "2Factor adapter supports 6-digit OTP messages only" };
        const res = await fetch(`https://2factor.in/API/V1/${config.apiKey}/SMS/${to}/${code}`);
        const d = (await res.json().catch(() => ({}))) as { Status?: string };
        if (!res.ok || d.Status !== "Success") return { ok: false, demo: false, provider: "TWOFACTOR", error: d.Status || `2Factor ${res.status}` };
        return { ok: true, demo: false, provider: "TWOFACTOR" };
      }

      default:
        console.log(`[SMS:DEMO] +91${to} ← ${text}`);
        return { ok: true, demo: true, provider: "OFF" };
    }
  } catch (e) {
    console.error(`[SMS:${config.provider}] send failed:`, e instanceof Error ? e.message : e);
    return { ok: false, demo: false, provider: config.provider, error: e instanceof Error ? e.message : "send failed" };
  }
}
