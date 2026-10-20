"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, Percent, CircleOff, SendHorizontal, MessageSquareText, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Firm Profile (printed on invoices)",
    keys: [
      ["firm_name", "Firm name"], ["firm_gstin", "GSTIN"], ["firm_address", "Registered address"],
      ["firm_phone", "Phone"], ["firm_email", "Email"], ["gst_state", "State (code)"],
      ["firm_bank", "Bank"], ["firm_bank_account", "Bank A/c"], ["firm_ifsc", "IFSC"], ["firm_upi", "UPI ID"],
    ],
  },
  {
    title: "Storefront",
    keys: [
      ["site_title", "Site title"], ["site_tagline", "Tagline"], ["meta_description", "Meta description"],
      ["support_phone", "Support phone"], ["support_email", "Support email"], ["address", "Storefront address"],
      ["invoice_prefix", "Invoice prefix"], ["erp_sync_enabled", "ERP sync (true/false)"],
    ],
  },
];

const PROVIDERS = ["OFF", "TWILIO", "MSG91", "FAST2SMS", "TWOFACTOR"] as const;
const PROVIDER_HINTS: Record<string, string> = {
  OFF: "Demo mode — messages are logged in the server console and OTP codes show on screen. Everything works, no SMS is sent.",
  TWILIO: "International, easiest to start. Free trial ≈ $15 credit — BUT trial can only text up to 5 verified numbers (testing only, not 100 customers).",
  MSG91: "India transactional route (~₹0.20–0.30/SMS after DLT). Free trial credits on signup. Needs DLT + approved sender.",
  FAST2SMS: "India, cheapest (~₹0.11–0.22/SMS). Free signup credits for testing. Quick-Transactional route works without DLT templates.",
  TWOFACTOR: "India OTP specialist (login / reset codes only). Simple key-based API, no template setup.",
};

const WA_PROVIDERS = ["OFF", "META", "ULTRAMSG", "GREENAPI"] as const;
const WA_HINTS: Record<string, string> = {
  OFF: "Demo mode — messages are logged in the server console and OTP codes show on screen. Everything works, no WhatsApp is sent.",
  META: "OFFICIAL & FREE to set up — no monthly fee, pay Meta directly in INR. Utility/OTP templates ≈ ₹0.115/msg, FREE inside the 24h service window (when the customer messages you first — the storefront Chat button opens it for free). 1,000 free service msgs/month. Needs: Meta Business a/c, a number NOT on the WhatsApp app, one-time template approval (otp_login with copy-code button). No DLT needed.",
  ULTRAMSG: "Unofficial gateway — plain text anytime, no templates. Free trial 3 days only, then $39/mo. Number-ban risk on WhatsApp.",
  GREENAPI: "Unofficial gateway — free Developer plan limited to 3 chats/month (NOT enough for 100 customers); paid $24+/mo. Ban risk.",
};

export function SettingsModule({ token }: { token: string }) {
  const call = api(token);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [gstMode, setGstMode] = useState<"on" | "off">("on");
  const [gstSaving, setGstSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testWaPhone, setTestWaPhone] = useState("");
  const [waTesting, setWaTesting] = useState(false);

  const load = useCallback(() => {
    call("/api/admin/settings").then((d) => {
      setSettings(d.settings ?? {});
      setGstMode(d.settings?.gst_enabled === "off" ? "off" : "on");
    }).catch(() => {});
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const saveAll = async () => {
    setSaving(true);
    try {
      await call("/api/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const setGst = async (mode: "on" | "off") => {
    if (mode === gstMode) return;
    const prev = gstMode;
    setGstMode(mode);
    setGstSaving(true);
    try {
      await call("/api/admin/settings", { method: "PUT", body: JSON.stringify({ gst_enabled: mode }) });
      toast.success(mode === "on" ? "GST Mode ON — tax added & shown across the website" : "GST Mode OFF — website is now fully Without-GST", {
        description: "Takes effect on the storefront immediately (customers may need to refresh).",
      });
    } catch (e) {
      setGstMode(prev);
      toast.error(e instanceof Error ? e.message : "Failed to switch GST mode");
    } finally {
      setGstSaving(false);
    }
  };

  const sendTestSms = async () => {
    if (!/^[6-9]\d{9}$/.test(testPhone.trim())) return toast.error("Enter a valid 10-digit mobile number");
    setTesting(true);
    try {
      const res = await fetch("/api/admin/sms/test", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: testPhone.trim(), channel: "sms" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Test failed");
      if (d.demo) toast.warning("Gateway OFF — message logged in demo mode", { description: d.logged });
      else toast.success(`SMS sent via ${d.provider}!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test SMS failed");
    } finally {
      setTesting(false);
    }
  };

  const sendTestWa = async () => {
    if (!/^[6-9]\d{9}$/.test(testWaPhone.trim())) return toast.error("Enter a valid 10-digit mobile number");
    setWaTesting(true);
    try {
      const res = await fetch("/api/admin/sms/test", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: testWaPhone.trim(), channel: "whatsapp" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Test failed");
      if (d.demo) toast.warning("WhatsApp OFF — message logged in demo mode", { description: d.logged });
      else toast.success(`WhatsApp sent via ${d.provider}!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test WhatsApp failed");
    } finally {
      setWaTesting(false);
    }
  };

  return (
    <div>
      <ModuleHeader title="Settings" sub="DMK Mart standard settings — firm profile, storefront & legal pages">
        <button onClick={saveAll} disabled={saving} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-bold text-yellow-400 disabled:opacity-50">
          <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save All"}
        </button>
      </ModuleHeader>

      {/* GST MASTER TOGGLE */}
      <div className="mb-4 rounded-xl border-2 border-yellow-300 bg-gradient-to-r from-yellow-50 to-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black">GST Mode <span className="ml-1 rounded-full bg-black px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-yellow-400">Master Switch</span></p>
            <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-gray-500">
              One switch transforms the whole website. <b>With GST</b>: tax breakup in cart &amp; checkout, GSTIN + HSN + CGST/SGST on invoices, tax rows on thermal estimates.
              <b> Without GST</b>: no tax added or shown anywhere — product pages, cart, invoices, estimates &amp; order totals. Stored prices are never modified, so you can flip back anytime.
            </p>
          </div>
          <div className="flex overflow-hidden rounded-xl border-2 border-gray-900">
            <button
              onClick={() => setGst("on")}
              disabled={gstSaving}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase transition ${gstMode === "on" ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              <Percent className="h-3.5 w-3.5" /> With GST
            </button>
            <button
              onClick={() => setGst("off")}
              disabled={gstSaving}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase transition ${gstMode === "off" ? "bg-red-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              <CircleOff className="h-3.5 w-3.5" /> Without GST
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] font-semibold text-gray-400">
          Current: <b className={gstMode === "on" ? "text-emerald-600" : "text-red-600"}>{gstMode === "on" ? "WITH GST" : "WITHOUT GST"}</b>
          {gstSaving && " · saving…"} · applies to new orders &amp; the storefront instantly; each order keeps the mode it was placed under (old invoices reprint correctly).
        </p>
      </div>

      {/* WHATSAPP — FREE-FIRST CHANNEL */}
      <div className="mb-4 rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-white p-4">
        <p className="mb-1 flex items-center gap-2 text-sm font-black"><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp Notifications <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">Free-first · OTP · Orders · Care</span></p>
        <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
          Delivers login &amp; forgot-password OTPs, order confirmations and status updates over WhatsApp instead of paid SMS.
          Delivery chain: <b>WhatsApp → SMS gateway → demo log</b>. Customers reach you free via the green Chat button on the website (uses the Support phone below).
          <b> Save All</b> first, then send a test message.
        </p>
        <label className="mb-3 flex w-fit items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={settings.wa_enabled === "true"} onChange={(e) => setSettings((s) => ({ ...s, wa_enabled: e.target.checked ? "true" : "false" }))} className="h-4 w-4 accent-emerald-600" />
          Enable WhatsApp delivery
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Provider</span>
            <select
              value={settings.wa_provider ?? "OFF"}
              onChange={(e) => setSettings((s) => ({ ...s, wa_provider: e.target.value }))}
              className="h-9 w-full rounded-lg border px-2 text-xs"
            >
              {WA_PROVIDERS.map((p) => <option key={p} value={p}>{p === "OFF" ? "OFF — Demo mode (free)" : p === "META" ? "META Cloud API (official)" : p}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Token / Access Key</span>
            <input value={settings.wa_token ?? ""} onChange={(e) => setSettings((s) => ({ ...s, wa_token: e.target.value }))} placeholder="paste token…" className="h-9 w-full rounded-lg border px-3 text-xs" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">{settings.wa_provider === "META" ? "Phone Number ID" : "Instance ID"}</span>
            <input
              value={settings.wa_provider === "META" ? (settings.wa_phone_number_id ?? "") : (settings.wa_instance ?? "")}
              onChange={(e) => setSettings((s) => ({ ...s, [settings.wa_provider === "META" ? "wa_phone_number_id" : "wa_instance"]: e.target.value }))}
              placeholder={settings.wa_provider === "META" ? "Meta phone number ID…" : "e.g. 123456"} className="h-9 w-full rounded-lg border px-3 text-xs" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Template language</span>
            <input value={settings.wa_language ?? "en"} onChange={(e) => setSettings((s) => ({ ...s, wa_language: e.target.value }))} placeholder="en" className="h-9 w-full rounded-lg border px-3 text-xs" />
          </label>
        </div>
        {settings.wa_provider === "META" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">OTP template name</span>
              <input value={settings.wa_otp_template ?? "otp_login"} onChange={(e) => setSettings((s) => ({ ...s, wa_otp_template: e.target.value }))} className="h-9 w-full rounded-lg border px-3 text-xs" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Order-placed template</span>
              <input value={settings.wa_order_template ?? "order_placed"} onChange={(e) => setSettings((s) => ({ ...s, wa_order_template: e.target.value }))} className="h-9 w-full rounded-lg border px-3 text-xs" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Order-status template</span>
              <input value={settings.wa_status_template ?? "order_status"} onChange={(e) => setSettings((s) => ({ ...s, wa_status_template: e.target.value }))} className="h-9 w-full rounded-lg border px-3 text-xs" />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs font-bold">
              <input type="checkbox" checked={(settings.wa_otp_button ?? "true") === "true"} onChange={(e) => setSettings((s) => ({ ...s, wa_otp_button: e.target.checked ? "true" : "false" }))} className="h-4 w-4 accent-emerald-600" />
              OTP copy-code button
            </label>
          </div>
        )}
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[10px] leading-relaxed text-emerald-900">{WA_HINTS[settings.wa_provider ?? "OFF"] ?? WA_HINTS.OFF}</p>
        {settings.wa_provider === "META" && (
          <p className="mt-1.5 rounded-lg bg-gray-50 px-3 py-2 text-[10px] leading-relaxed text-gray-600">
            Meta templates to approve once in business.facebook.com → WhatsApp → Message templates —
            <b> otp_login</b>: body <code>&#123;&#123;1&#125;&#125; is your DMK Mart login code. Do not share it.&#8221;</code> + copy-code button ·
            <b> order_placed</b>: <code>Order &#123;&#123;1&#125;&#125; placed. Amount ₹&#123;&#123;2&#125;&#125;. Delivery OTP: &#123;&#123;3&#125;&#125;. Share only at handover.</code> ·
            <b> order_status</b>: <code>Order &#123;&#123;1&#125;&#125; is now &#123;&#123;2&#125;&#125;. Query? &#123;&#123;3&#125;&#125;</code>. Set a template name to <b>TEXT</b> to always send plain text (needs the customer to have messaged you in the last 24h).
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Test to (your mobile)</span>
            <input value={testWaPhone} onChange={(e) => setTestWaPhone(e.target.value)} placeholder="10-digit mobile" className="h-9 w-44 rounded-lg border px-3 text-xs" />
          </label>
          <button onClick={sendTestWa} disabled={waTesting} className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            <SendHorizontal className={`h-3.5 w-3.5 ${waTesting ? "animate-pulse" : ""}`} /> {waTesting ? "Sending…" : "Send Test WhatsApp"}
          </button>
          <span className="text-[10px] text-gray-400">
            Status: {settings.wa_enabled === "true" && settings.wa_provider !== "OFF" && settings.wa_token
              ? <b className="text-emerald-600">LIVE via {settings.wa_provider}</b>
              : <b className="text-gray-500">DEMO MODE</b>}
          </span>
        </div>
        <p className="mt-2 text-[10px] text-gray-400">
          100-customer math: anyone who messages you once gets order updates FREE for the next 24h; an OTP outside a window ≈ ₹0.115 — so 100 OTPs ≈ ₹11.50 total, and the storefront Chat button always opens conversations for free.
        </p>
      </div>

      {/* SMS GATEWAY */}
      <div className="mb-4 rounded-xl border bg-white p-4">
        <p className="mb-1 flex items-center gap-2 text-sm font-black"><MessageSquareText className="h-4 w-4 text-yellow-600" /> SMS Gateway <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-gray-500">OTP · Order Status · Customer Care</span></p>
        <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
          Powers: forgot-password &amp; login OTP codes, order-placed confirmation with delivery OTP, order status updates, and the support line shown in every message.
          <b> Save All</b> first to persist changes, then send a test SMS. WhatsApp is tried first when enabled above — SMS is the fallback.
        </p>
        <label className="mb-3 flex w-fit items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={settings.sms_enabled === "true"} onChange={(e) => setSettings((s) => ({ ...s, sms_enabled: e.target.checked ? "true" : "false" }))} className="h-4 w-4 accent-yellow-600" />
          Enable SMS delivery
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Provider</span>
            <select
              value={settings.sms_provider ?? "OFF"}
              onChange={(e) => setSettings((s) => ({ ...s, sms_provider: e.target.value }))}
              className="h-9 w-full rounded-lg border px-2 text-xs"
            >
              {PROVIDERS.map((p) => <option key={p} value={p}>{p === "OFF" ? "OFF — Demo mode (free)" : p}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">API Key {settings.sms_provider === "TWILIO" ? "(Account SID)" : ""}</span>
            <input value={settings.sms_api_key ?? ""} onChange={(e) => setSettings((s) => ({ ...s, sms_api_key: e.target.value }))} placeholder="paste key…" className="h-9 w-full rounded-lg border px-3 text-xs" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">{settings.sms_provider === "TWILIO" ? "Auth Token" : "Sender ID (6-char)"}</span>
            <input value={settings.sms_provider === "TWILIO" ? (settings.sms_api_secret ?? "") : (settings.sms_sender_id ?? "")} onChange={(e) => setSettings((s) => ({ ...s, [settings.sms_provider === "TWILIO" ? "sms_api_secret" : "sms_sender_id"]: e.target.value }))} placeholder={settings.sms_provider === "TWILIO" ? "paste token…" : "e.g. DMKMRT"} className="h-9 w-full rounded-lg border px-3 text-xs" />
          </label>
        </div>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-800">{PROVIDER_HINTS[settings.sms_provider ?? "OFF"] ?? PROVIDER_HINTS.OFF}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Test to (your mobile)</span>
            <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="10-digit mobile" className="h-9 w-44 rounded-lg border px-3 text-xs" />
          </label>
          <button onClick={sendTestSms} disabled={testing} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-bold text-yellow-400 hover:bg-gray-900 disabled:opacity-50">
            <SendHorizontal className={`h-3.5 w-3.5 ${testing ? "animate-pulse" : ""}`} /> {testing ? "Sending…" : "Send Test SMS"}
          </button>
          <span className="text-[10px] text-gray-400">
            Status: {settings.sms_enabled === "true" && settings.sms_provider !== "OFF" && settings.sms_api_key
              ? <b className="text-emerald-600">LIVE via {settings.sms_provider}</b>
              : <b className="text-gray-500">DEMO MODE</b>}
          </span>
        </div>
        <p className="mt-2 text-[10px] text-gray-400">
          100-customer tip: Fast2SMS free signup credits cover initial testing; beyond that SMS in India costs ₹0.11–0.30/message (DLT registered) — 100 updates ≈ ₹11–30.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title} className="rounded-xl border bg-white p-4">
            <p className="mb-3 text-xs font-bold">{g.title}</p>
            <div className="grid gap-2">
              {g.keys.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">{label}</span>
                  <input
                    value={settings[key] ?? ""}
                    onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
                    className="h-9 w-full rounded-lg border px-3 text-xs"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <p className="text-xs font-bold">Legal pages</p>
        <p className="mt-1 text-[11px] text-gray-500">Terms, Privacy, Refund & Shipping pages are managed under <b>Website Management → Pages</b>. Pages flagged LEGAL automatically appear in the storefront footer and sitemap.xml.</p>
      </div>
    </div>
  );
}
