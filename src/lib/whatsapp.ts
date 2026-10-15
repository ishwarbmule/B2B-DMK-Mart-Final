/** WhatsApp notification layer — the FREE-first channel (user asked: SMS costs, prefer WhatsApp free options).
 *
 *  FREE REALITY (India, researched Oct 2026):
 *  • META (official WhatsApp Cloud API) — RECOMMENDED
 *      - Setup 100% free, no monthly platform fee, pay-as-you-go straight to Meta (INR billing).
 *      - India rates: Utility/Authentication ≈ ₹0.115 per delivered message, Marketing ≈ ₹0.86.
 *      - Utility templates sent inside an open 24-hour customer-service window = FREE.
 *      - 1,000 free service messages per phone number / month (2026 policy).
 *      - The free wa.me "Chat with us" button opens that service window → most order updates become free.
 *      - Needs: Meta Business a/c, a phone number NOT registered on the WhatsApp app, and one-time
 *        template approval (e.g. `otp_login` with a copy-code button). No DLT registration needed.
 *  • ULTRAMSG — unofficial: 3-day free trial, then $39/mo. Plain text anytime, no templates. Ban risk.
 *  • GREENAPI — unofficial: free Developer plan limited to 3 chats/month (not viable for 100 customers).
 *    Ban risk.
 *  With nothing configured everything runs in DEMO mode: messages are logged to the server console
 *  and (for OTPs) shown on screen — the whole product stays testable for free.
 *
 *  Delivery chain used by notifyCustomer(): WhatsApp (if enabled) → SMS gateway (if enabled) → demo log.
 */

import { db } from "@/lib/db";
import { normalizePhone, sendSms, getSmsConfig, type SmsProvider } from "./sms";

export type WaProvider = "OFF" | "META" | "ULTRAMSG" | "GREENAPI";

export type WaConfig = {
  enabled: boolean;
  provider: WaProvider;
  token: string;          // Meta permanent access token / UltraMsg token / Green API token
  phoneNumberId: string;  // Meta only — WhatsApp Business phone number ID
  instance: string;       // UltraMsg instance id / Green API idInstance
  otpTemplate: string;    // default otp_login  (body: {{1}} — one param, copy-code button)
  orderTemplate: string;  // default order_placed (body: {{1}} {{2}} {{3}} — invoice, amount, delivery OTP)
  statusTemplate: string; // default order_status (body: {{1}} {{2}} {{3}} — invoice, status, support)
  language: string;       // template language code, default en
  otpButton: boolean;     // OTP template uses a copy-code button (recommended)
};

export type NotifyResult = {
  ok: boolean;
  demo: boolean;
  channel: "WHATSAPP" | "SMS" | "DEMO";
  provider: string;
  error?: string;
};

export type NotifyOptions = {
  templateKey?: "wa_order_template" | "wa_status_template"; // OTP uses wa_otp_template via useOtpTemplate
  params?: string[];
  useOtpTemplate?: boolean;
  otpCode?: string;
};

export async function getWhatsAppConfig(): Promise<WaConfig> {
  const rows = await db.setting.findMany({
    where: { key: { in: ["wa_enabled", "wa_provider", "wa_token", "wa_phone_number_id", "wa_instance", "wa_otp_template", "wa_order_template", "wa_status_template", "wa_language", "wa_otp_button"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const provider = (map.wa_provider as WaProvider) || "OFF";
  const needsToken = Boolean(map.wa_token);
  const metaReady = provider !== "META" || Boolean(map.wa_phone_number_id);
  return {
    enabled: map.wa_enabled === "true" && provider !== "OFF" && needsToken && metaReady,
    provider,
    token: map.wa_token || "",
    phoneNumberId: map.wa_phone_number_id || "",
    instance: map.wa_instance || "",
    otpTemplate: map.wa_otp_template ?? "otp_login",
    orderTemplate: map.wa_order_template ?? "order_placed",
    statusTemplate: map.wa_status_template ?? "order_status",
    language: map.wa_language || "en",
    otpButton: (map.wa_otp_button ?? "true") === "true",
  };
}

/** Send a free-form WhatsApp text. Meta allows this ONLY inside a 24h customer-service window;
 *  UltraMsg / Green API send it anytime (unofficial). */
export async function sendWhatsAppText(phone: string, text: string): Promise<NotifyResult> {
  const cfg = await getWhatsAppConfig();
  return sendWhatsAppWith(cfg, phone, text, undefined);
}

/** Send a WhatsApp template message via the official Meta Cloud API.
 *  Unofficial providers have no template concept — returns an error for them. */
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  params: string[],
  opts?: { otpButton?: boolean; language?: string },
): Promise<NotifyResult> {
  const cfg = await getWhatsAppConfig();
  if (cfg.provider !== "META") {
    return { ok: false, demo: false, channel: "WHATSAPP", provider: cfg.provider, error: `Templates are only supported by the official META Cloud API (current provider: ${cfg.provider})` };
  }
  return sendWhatsAppWith(cfg, phone, "", { name: templateName, params, otpButton: opts?.otpButton });
}

async function sendWhatsAppWith(cfg: WaConfig, phone: string, text: string, template?: { name: string; params: string[]; otpButton?: boolean }): Promise<NotifyResult> {
  const to = normalizePhone(phone);
  if (!to) return { ok: false, demo: false, channel: "WHATSAPP", provider: cfg.provider, error: "invalid phone" };
  try {
    switch (cfg.provider) {
      case "META": {
        if (template) await metaTemplate(cfg, to, template.name, template.params, template.otpButton);
        else await metaText(cfg, to, text);
        return { ok: true, demo: false, channel: "WHATSAPP", provider: "META" };
      }
      case "ULTRAMSG": {
        const res = await fetch(`https://api.ultramsg.com/${encodeURIComponent(cfg.instance)}/messages/chat`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: cfg.token, to: `91${to}`, body: text }),
        });
        const d = (await res.json().catch(() => ({}))) as { sent?: boolean | string; error?: string };
        const sent = d.sent === true || d.sent === "true";
        if (!res.ok || !sent) return { ok: false, demo: false, channel: "WHATSAPP", provider: "ULTRAMSG", error: d.error || `UltraMsg ${res.status}` };
        return { ok: true, demo: false, channel: "WHATSAPP", provider: "ULTRAMSG" };
      }
      case "GREENAPI": {
        const res = await fetch(`https://api.green-api.com/waInstance/${encodeURIComponent(cfg.instance)}/sendMessage/${encodeURIComponent(cfg.token)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chatId: `91${to}@c.us`, message: text }),
        });
        const d = (await res.json().catch(() => ({}))) as { idMessage?: string };
        if (!res.ok || !d.idMessage) return { ok: false, demo: false, channel: "WHATSAPP", provider: "GREENAPI", error: `Green API ${res.status}` };
        return { ok: true, demo: false, channel: "WHATSAPP", provider: "GREENAPI" };
      }
      default:
        console.log(`[WA:DEMO] +91${to} ← ${text}`);
        return { ok: true, demo: true, channel: "DEMO", provider: "OFF" };
    }
  } catch (e) {
    console.error(`[WA:${cfg.provider}] send failed:`, e instanceof Error ? e.message : e);
    return { ok: false, demo: false, channel: "WHATSAPP", provider: cfg.provider, error: e instanceof Error ? e.message : "send failed" };
  }
}

/* ── Meta WhatsApp Cloud API (graph.facebook.com) ─────────────────────────── */

async function metaPost(cfg: WaConfig, to: string, payload: Record<string, unknown>): Promise<string | undefined> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: `91${to}`, ...payload }),
  });
  const d = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(d.error?.message || `Meta Cloud API ${res.status}`);
  return d.messages?.[0]?.id;
}

async function metaText(cfg: WaConfig, to: string, text: string) {
  return metaPost(cfg, to, { type: "text", text: { body: text.slice(0, 4000) } });
}

async function metaTemplate(cfg: WaConfig, to: string, name: string, params: string[], otpButton?: boolean) {
  const components: Record<string, unknown>[] = [];
  if (params.length > 0) {
    components.push({ type: "body", parameters: params.map((p) => ({ type: "text", text: String(p) })) });
  }
  if (otpButton) {
    // Copy-code button on authentication templates — last param carries the OTP.
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: params[params.length - 1] ?? "" }] });
  }
  return metaPost(cfg, to, { type: "template", template: { name, language: { code: cfg.language }, components } });
}

/* ── Unified notification: WhatsApp → SMS → demo ──────────────────────────── */

/** Preferred notification entry point for all hooks.
 *  Tries WhatsApp first (free-friendly), falls back to the configured SMS gateway, else demo-logs.
 *  - useOtpTemplate: deliver the OTP via the Meta auth template (wa_otp_setting) with copy-code button.
 *  - templateKey: pick wa_order_template / wa_status_template for order notifications.
 *  Unofficial providers (UltraMsg/GreenAPI) always receive plain text — they have no template concept.
 */
export async function notifyCustomer(phone: string, text: string, opts: NotifyOptions = {}): Promise<NotifyResult> {
  let cfg: WaConfig;
  try {
    cfg = await getWhatsAppConfig();
  } catch {
    cfg = { enabled: false, provider: "OFF", token: "", phoneNumberId: "", instance: "", otpTemplate: "otp_login", orderTemplate: "order_placed", statusTemplate: "order_status", language: "en", otpButton: true };
  }

  const templateName = opts.useOtpTemplate
    ? cfg.otpTemplate
    : opts.templateKey === "wa_order_template"
      ? cfg.orderTemplate
      : opts.templateKey === "wa_status_template"
        ? cfg.statusTemplate
        : undefined;

  if (cfg.enabled && cfg.provider !== "OFF") {
    // Official Meta supports approved templates + in-window text; unofficial providers: plain text only.
    const useMetaTemplate = cfg.provider === "META" && templateName && templateName !== "TEXT";

    let wa = useMetaTemplate
      ? await sendWhatsAppWith(cfg, phone, text, { name: templateName!, params: opts.params ?? [], otpButton: opts.useOtpTemplate ? cfg.otpButton : false })
      : await sendWhatsAppWith(cfg, phone, text);

    // Template rejected (missing/unapproved/wrong param count) → last try: free-form text (works in service window).
    if (!wa.ok && useMetaTemplate) wa = await sendWhatsAppWith(cfg, phone, text);

    if (wa.ok) return wa;
    console.warn(`[WA] delivery failed (${wa.error}) — falling back to SMS`);
  }

  // SMS fallback — only when the SMS gateway is actually live (sendSms demo mode would double-log).
  try {
    const smsCfg = await getSmsConfig();
    if (smsCfg.enabled) {
      const sms = await sendSms(phone, text);
      return { ok: sms.ok, demo: sms.demo, channel: "SMS", provider: sms.provider, error: sms.error };
    }
  } catch { /* fall through to demo */ }

  const to = normalizePhone(phone);
  if (to) console.log(`[NOTIFY:DEMO] +91${to} ← ${text}`);
  return { ok: true, demo: true, channel: "DEMO", provider: "OFF" };
}

export type { SmsProvider };
