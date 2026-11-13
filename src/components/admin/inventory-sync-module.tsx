"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, Check, Copy, KeyRound, RadioTower, RefreshCw, Save, ShieldCheck, Webhook, Zap } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";

type Health = { configured: boolean; up: boolean; httpStatus: number; message: string; url: string };
type SyncEvent = { id: string; direction: string; action: string; status: string; message: string; createdAt: string };
type Status = {
  config: { url: string; apiKey: string; pushSecret: string; apiKeySet: boolean; pushSecretSet: boolean };
  health: Health;
  webhookUrl: string;
  counts: { mirror: number; mirrorActive: number; catalogErp: number; sharedFields: { mrp: number; costPrice: number; deliveryRate: number; availableStock: number } };
  schedule: { dailyEnabled: boolean; watermark: string; lastPushAt: string; lastFullAt: string; lastDeltaAt: string };
  events: SyncEvent[];
};

const fmt = (iso: string) => (iso ? new Date(iso).toLocaleString("en-IN") : "never");

export function InventorySyncModule({ token }: { token: string }) {
  // stable identity — api(token) returns a fresh closure each call, and an unstable
  // `call` would recreate the load callback and re-trigger its effect every render (poll loop)
  const call = useMemo(() => api(token), [token]);
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState({ erp_universal_url: "https://dmkmarterp.in", erp_universal_api_key: "", erp_universal_push_secret: "" });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<"" | "full" | "delta">("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    call("/api/admin/universal-sync/settings").then((d: Status) => {
      setStatus(d);
      setForm((f) => ({ ...f, erp_universal_url: d.config.url || f.erp_universal_url }));
    }).catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load status"));
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const d = await call("/api/admin/universal-sync/settings", { method: "POST", body: JSON.stringify(form) });
      if (d.health?.up) toast.success(`Saved — inventory server is UP (${d.health.url})`);
      else toast.error(d.health?.message || "Saved, but the health check failed");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resync = async (mode: "full" | "delta") => {
    setSyncing(mode);
    try {
      const d = await call(`/api/admin/universal-sync/resync?mode=${mode}`, { method: "POST" });
      toast.success(`${mode === "full" ? "Full re-sync" : "Delta pull"} done — ${d.pages} page(s) · seen ${d.seen} · created ${d.created} · updated ${d.updated}${mode === "full" ? ` · de-listed ${d.delisted}` : ""} (${(d.durationMs / 1000).toFixed(1)}s)`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-sync failed");
    } finally {
      setSyncing("");
    }
  };

  const toggleDaily = async (enabled: boolean) => {
    try {
      await call("/api/admin/universal-sync/settings", { method: "POST", body: JSON.stringify({ erp_universal_daily_enabled: enabled }) });
      toast.success(enabled ? "Daily delta pull enabled — runs 09:00 IST every day" : "Daily delta pull disabled");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    }
  };

  const copyWebhook = async () => {
    if (!status?.webhookUrl) return;
    try { await navigator.clipboard.writeText(status.webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); toast.success("Webhook URL copied"); }
    catch { toast.error(status.webhookUrl); }
  };

  const dot = status?.health.up ? "bg-emerald-500" : status?.health.configured ? "bg-red-500" : "bg-gray-400";
  const healthText = !status ? "Loading…" : status.health.up
    ? `UP — ${status.health.url}`
    : status.health.configured ? `DOWN — ${status.health.message}` : status.health.message;
  const shared = status?.counts.sharedFields;
  const mirror = status?.counts.mirror ?? 0;
  const chip = (sharedCount: number, label: string) => (
    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${mirror && sharedCount ? "bg-emerald-500/20 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
      {label} {mirror ? `${sharedCount}/${mirror}` : "—"}
    </span>
  );

  return (
    <div>
      <ModuleHeader title="Inventory Sync (Universal API)" sub="Live product sync from your inventory server dmkmarterp.in — signed webhook pushes + delta pulls · SKU is the key · cost price never goes public · a field the ERP does not share stays hidden" />

      {/* status banner */}
      <div className="mb-4 rounded-xl border-2 border-gray-900 bg-gradient-to-r from-gray-900 to-gray-800 p-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`inline-block h-3 w-3 animate-pulse rounded-full ${dot}`} />
            <div>
              <p className="flex items-center gap-2 text-sm font-black"><ShieldCheck className="h-4 w-4 text-yellow-400" /> Inventory server health</p>
              <p className="mt-0.5 text-[11px] text-gray-300">{healthText}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider">
            <span className={`rounded-full px-2.5 py-1 ${status?.config.apiKeySet ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
              API key {status?.config.apiKeySet ? "saved" : "missing"}
            </span>
            <span className={`rounded-full px-2.5 py-1 ${status?.config.pushSecretSet ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
              Push secret {status?.config.pushSecretSet ? "saved" : "missing"}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-gray-200">Mirror: {mirror} SKUs ({status?.counts.mirrorActive ?? 0} active)</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {shared && <>{chip(shared.mrp, "MRP")}{chip(shared.costPrice, "Cost (admin-only)")}{chip(shared.deliveryRate, "Delivery rate")}{chip(shared.availableStock, "Stock")}</>}
        </div>
      </div>

      {/* credentials */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold"><KeyRound className="h-3.5 w-3.5 text-gray-500" /> Credentials <span className="font-normal text-gray-400">(stored in the app Setting table — masked after save)</span></p>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Inventory server URL</span>
            <input value={form.erp_universal_url} onChange={(e) => setForm((f) => ({ ...f, erp_universal_url: e.target.value }))} className="h-9 w-full rounded-lg border px-3 text-xs" placeholder="https://dmkmarterp.in" />
          </label>
          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">API key <span className="normal-case text-gray-400">(sent as X-API-Key on every pull)</span></span>
            <input value={form.erp_universal_api_key} onChange={(e) => setForm((f) => ({ ...f, erp_universal_api_key: e.target.value }))} type="password" className="h-9 w-full rounded-lg border px-3 font-mono text-xs" placeholder="paste the API key" />
          </label>
          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Push secret <span className="normal-case text-gray-400">(verifies X-DMK-Signature on incoming pushes)</span></span>
            <input value={form.erp_universal_push_secret} onChange={(e) => setForm((f) => ({ ...f, erp_universal_push_secret: e.target.value }))} type="password" className="h-9 w-full rounded-lg border px-3 font-mono text-xs" placeholder="paste the push secret" />
          </label>
          <button onClick={save} disabled={saving} className="mt-3 flex h-9 items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-bold text-yellow-400 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> {saving ? "Verifying…" : "Save & Verify Connection"}
          </button>
        </div>

        {/* webhook + actions */}
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold"><Webhook className="h-3.5 w-3.5 text-gray-500" /> Webhook for the ERP team <span className="font-normal text-gray-400">(send them this URL)</span></p>
          <div className="flex items-center gap-2">
            <input readOnly value={status?.webhookUrl ?? ""} className="h-9 min-w-0 flex-1 rounded-lg border bg-gray-50 px-3 font-mono text-[11px] text-gray-700" />
            <button onClick={copyWebhook} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border hover:bg-gray-50" title="Copy webhook URL">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-500">
            ERP pushes <code className="rounded bg-gray-100 px-1">{"{ type: \"CATALOG_DELTA\", products: […] }"}</code> with header
            <code className="mx-1 rounded bg-gray-100 px-1">X-DMK-Signature: sha256=HMAC-SHA256(body, push secret)</code> — wrong signature = rejected. Replies 200 within 5s.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => resync("full")} disabled={syncing !== ""} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-40">
              <RefreshCw className={`h-4 w-4 ${syncing === "full" ? "animate-spin" : ""}`} /> {syncing === "full" ? "Re-syncing…" : "Re-sync now"}
            </button>
            <button onClick={() => resync("delta")} disabled={syncing !== "" || !status?.schedule.watermark} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
              <ArrowDownToLine className={`h-4 w-4 ${syncing === "delta" ? "animate-pulse" : ""}`} /> {syncing === "delta" ? "Pulling…" : "Pull delta"}
            </button>
          </div>
        </div>
      </div>

      {/* schedule + rules */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
          <p className="flex items-center gap-2 text-sm font-black text-gray-900"><Zap className="h-4 w-4 text-blue-600" /> Daily delta pull — push-failure fallback</p>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
            Every day at <b>09:00 IST</b> the site pulls <code className="rounded bg-white px-1">/products?since=&lt;watermark&gt;</code> — everything the ERP changed since the last applied update.
            If a webhook push ever fails (bad signature, downtime, network), the daily pull still catches every missed change because the watermark only advances on applied rows.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
            <span>Delta since: <b>{fmt(status?.schedule.watermark ?? "")}</b></span>
            <span>Last push received: <b>{fmt(status?.schedule.lastPushAt ?? "")}</b></span>
            <span>Last full sync: <b>{fmt(status?.schedule.lastFullAt ?? "")}</b></span>
          </div>
          <button
            onClick={() => toggleDaily(!(status?.schedule.dailyEnabled ?? true))}
            className={`mt-2 rounded-full px-3 py-1.5 text-[11px] font-black ${status?.schedule.dailyEnabled ? "bg-emerald-600 text-white" : "bg-gray-300 text-gray-700"}`}
          >
            {status?.schedule.dailyEnabled ? "Daily pull ON — click to disable" : "Daily pull OFF — click to enable"}
          </button>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <p className="flex items-center gap-2 text-sm font-black text-gray-900"><RadioTower className="h-4 w-4 text-amber-600" /> Sync rules (as agreed with the ERP team)</p>
          <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-gray-600">
            <li>• <b>SKU</b> is the unique key — every push/pull upserts the mirror and the catalog by SKU.</li>
            <li>• <b>Cost price never goes public</b> — it lands in the admin-only purchase-cost column; no public API returns it.</li>
            <li>• <b>Missing field = not shared → hidden.</b> A price/stock the ERP did not tick is zeroed on ERP-controlled products, so the storefront hides it instead of showing stale data.</li>
            <li>• <b>De-listing:</b> a full re-sync switches ERP-controlled SKUs that vanished upstream to inactive (unless an admin pinned them).</li>
            <li>• <b>5-second reply:</b> pushes are ACKed immediately; batches over 10 items finish after the response — the daily delta pull covers any failure.</li>
          </ul>
        </div>
      </div>

      {/* history */}
      <div className="rounded-xl border bg-white p-4">
        <p className="mb-2 text-xs font-bold">Sync history (universal API + webhook)</p>
        <div className="max-h-52 overflow-y-auto rounded-lg border">
          <table className="w-full text-[10px]">
            <thead className="bg-gray-50 text-left uppercase text-gray-400">
              <tr><th className="px-2 py-1.5">When</th><th className="px-2 py-1.5">Direction</th><th className="px-2 py-1.5">Action</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Message</th></tr>
            </thead>
            <tbody>
              {(status?.events ?? []).map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-2 py-1">{new Date(e.createdAt).toLocaleString("en-IN")}</td>
                  <td className="px-2 py-1 font-bold">{e.direction}</td>
                  <td className="px-2 py-1 text-gray-500">{e.action}</td>
                  <td className={`px-2 py-1 font-bold ${e.status === "OK" ? "text-emerald-600" : e.status === "ERROR" ? "text-red-600" : "text-amber-600"}`}>{e.status}</td>
                  <td className="px-2 py-1 text-gray-500">{e.message}</td>
                </tr>
              ))}
              {!(status?.events ?? []).length && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No universal-sync events yet — save the credentials and press “Re-sync now”.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
