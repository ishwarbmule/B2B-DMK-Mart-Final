"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, RefreshCw, Percent, CircleOff } from "lucide-react";
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

export function SettingsModule({ token }: { token: string }) {
  const call = api(token);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [gstMode, setGstMode] = useState<"on" | "off">("on");
  const [gstSaving, setGstSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ events: { id: string; direction: string; status: string; message: string; createdAt: string }[]; portal: { name: string; baseUrl: string; webhookUrl: string; status: string; autoSync: boolean; lastSyncAt: string; lastSyncStatus: string; lastSyncMessage: string } | null }>({ events: [], portal: null });
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    call("/api/admin/settings").then((d) => {
      setSettings(d.settings ?? {});
      setGstMode(d.settings?.gst_enabled === "off" ? "off" : "on");
    }).catch(() => {});
    fetch("/api/admin/sync/status", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSyncStatus({ events: d.events ?? [], portal: d.portal ?? null }))
      .catch(() => {});
     
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

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/sync/pull", { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success(`Pull complete: +${d.created} / ~${d.updated} of ${d.seen}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
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

  return (
    <div>
      <ModuleHeader title="Settings" sub="DMK Mart standard settings — firm profile, storefront, ERP integration & legal pages">
        <button onClick={syncNow} disabled={syncing} className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Pull ERP Now
        </button>
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

      {/* ERP integration */}
      <div className="mb-4 rounded-xl border bg-white p-4">
        <p className="mb-2 text-xs font-bold">ERP Integration (Neon · read-only until you approve writes)</p>
        {syncStatus.portal ? (
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <p><b>Portal:</b> {syncStatus.portal.name} ({syncStatus.portal.status}{syncStatus.portal.autoSync ? ", autoSync" : ""})</p>
            <p><b>ERP → Webhook:</b> <code className="text-[10px]">{syncStatus.portal.webhookUrl}</code></p>
            <p><b>Last sync:</b> {syncStatus.portal.lastSyncAt ? new Date(syncStatus.portal.lastSyncAt).toLocaleString("en-IN") : "—"} · {syncStatus.portal.lastSyncStatus}</p>
            <p><b>Message:</b> {syncStatus.portal.lastSyncMessage}</p>
          </div>
        ) : (
          <p className="text-xs text-gray-400">ERP portal config unavailable (Neon not reachable from this environment).</p>
        )}
        <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border">
          <table className="w-full text-[10px]">
            <thead className="bg-gray-50 text-left uppercase text-gray-400">
              <tr><th className="px-2 py-1.5">When</th><th className="px-2 py-1.5">Direction</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Message</th></tr>
            </thead>
            <tbody>
              {syncStatus.events.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-2 py-1">{new Date(e.createdAt).toLocaleString("en-IN")}</td>
                  <td className="px-2 py-1 font-bold">{e.direction}</td>
                  <td className="px-2 py-1">{e.status}</td>
                  <td className="px-2 py-1 text-gray-500">{e.message}</td>
                </tr>
              ))}
              {!syncStatus.events.length && <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No sync events yet.</td></tr>}
            </tbody>
          </table>
        </div>
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
