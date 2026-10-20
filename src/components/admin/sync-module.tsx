"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, ArrowDownToLine, ArrowUpFromLine, Lock, Unlock, RefreshCw, Search, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";

type ErpStatus = { configured: boolean; connected: boolean; error?: string; version?: string; database?: string; host?: string; tables?: number };
type SyncEvent = { id: string; direction: string; status: string; message: string; createdAt: string };
type PushFieldDiff = { field: string; erpColumn: string; erpValue: number; webValue: number };
type PushRowDiff = { sku: string; name: string; diffs: PushFieldDiff[] };
type PushPreview = { writeEnabled: boolean; writeUnlockedAt: string; checkedErpRows: number; matchedSkus: number; rowsWithChanges: number; sample: PushRowDiff[] };
type TableInfo = { name: string; rows: number | null };

export function SyncModule({ token }: { token: string }) {
  const call = api(token);
  const [status, setStatus] = useState<ErpStatus>({ configured: false, connected: false });
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [productsTable, setProductsTable] = useState("products");

  // connection form
  const [form, setForm] = useState({ erp_db_host: "", erp_db_port: "3306", erp_db_user: "", erp_db_password: "", erp_db_name: "", erp_products_table: "products", erp_image_base_url: "", erp_product_aliases: "{}" });
  const [saving, setSaving] = useState(false);

  // sync actions
  const [pulling, setPulling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<PushPreview | null>(null);
  const [confirmText, setConfirmText] = useState("");

  // explorer
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selTable, setSelTable] = useState("");
  const [tableCols, setTableCols] = useState<{ field: string; type: string; null: string; key: string }[]>([]);
  const [tableCount, setTableCount] = useState<number | null>(null);
  const [exploring, setExploring] = useState(false);

  const load = useCallback(() => {
    call("/api/admin/sync/status").then((d) => {
      setStatus(d.status ?? { configured: false, connected: false });
      setEvents(d.events ?? []);
      setWriteEnabled(Boolean(d.writeEnabled));
      setProductsTable(d.productsTable ?? "products");
    }).catch(() => {});
    call("/api/admin/sync/settings").then((d) => {
      if (d.config) setForm((f) => ({ ...f, ...d.config, erp_db_password: d.config.erp_db_password || "" }));
    }).catch(() => {});
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const saveConn = async () => {
    setSaving(true);
    try {
      const d = await call("/api/admin/sync/settings", { method: "POST", body: JSON.stringify(form) });
      if (d.ok) toast.success(`Connected to ERP MySQL — ${d.status.database} @ ${d.status.host} (v${d.status.version}, ${d.status.tables} tables)`);
      else toast.error(d.error || "Connection failed — check credentials");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const pullNow = async () => {
    setPulling(true);
    try {
      const d = await call("/api/admin/sync/pull", { method: "POST" });
      toast.success(`Pull complete — seen ${d.seen} · created ${d.created} · updated ${d.updated} · skipped ${d.skipped}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pull failed");
    } finally {
      setPulling(false);
    }
  };

  const pushPreview = async () => {
    setPreviewing(true);
    try {
      const d = await call("/api/admin/sync/push?mode=preview", { method: "POST" });
      setPreview(d);
      toast.success(`Dry-run complete — ${d.rowsWithChanges} of ${d.matchedSkus} matched SKUs differ (ERP untouched)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const pushExecute = async () => {
    if (!window.confirm(`Write ${preview?.rowsWithChanges ?? ""} product updates into the ERP MySQL database "${status.database}"?\n\nOnly stock & price tier columns change, matched by SKU. This affects the live ERP.`)) return;
    setExecuting(true);
    try {
      const d = await call("/api/admin/sync/push?mode=execute", { method: "POST" });
      toast.success(`Pushed to ERP — updated ${d.updated} rows · skipped ${d.skipped}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Push failed");
    } finally {
      setExecuting(false);
    }
  };

  const toggleWrites = async (enable: boolean) => {
    if (enable && confirmText !== "UNLOCK ERP WRITES") return toast.error('Type "UNLOCK ERP WRITES" in the box to confirm');
    try {
      await call("/api/admin/sync/settings", { method: "POST", body: JSON.stringify({ erp_write_enabled: enable, confirmUnlock: confirmText }) });
      toast.success(enable ? "ERP writes UNLOCKED — the Push button can now update the ERP (stock & prices only)" : "ERP writes LOCKED — the ERP database is fully read-only again");
      setConfirmText("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    }
  };

  const explore = async (table?: string) => {
    setExploring(true);
    try {
      if (!table) {
        const d = await call("/api/admin/sync/explorer");
        setTables(d.tables ?? []);
        toast.success(`Found ${(d.tables ?? []).length} tables in ${status.database ?? "ERP"}`);
      } else {
        const d = await call(`/api/admin/sync/explorer?table=${encodeURIComponent(table)}`);
        setSelTable(table);
        setTableCols(d.columns ?? []);
        setTableCount(d.rowCount ?? null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Explorer failed");
    } finally {
      setExploring(false);
    }
  };

  const dot = status.connected ? "bg-emerald-500" : status.configured ? "bg-red-500" : "bg-gray-300";
  const statusText = status.connected ? `Connected — ${status.database} @ ${status.host} · MySQL ${status.version} · ${status.tables} tables` : status.configured ? `Connection FAILED: ${status.error ?? "unknown error"}` : "Not configured — paste credentials below";

  return (
    <div>
      <ModuleHeader title="Data Sync (ERP MySQL)" sub="Pull catalog from your ERP · Push website updates back · ERP is strictly READ-ONLY until you unlock writes" />

      {/* connection status */}
      <div className="mb-4 rounded-xl border-2 border-gray-900 bg-gradient-to-r from-gray-900 to-gray-800 p-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`inline-block h-3 w-3 animate-pulse rounded-full ${dot}`} />
            <div>
              <p className="flex items-center gap-2 text-sm font-black"><Database className="h-4 w-4 text-yellow-400" /> ERP MySQL Connection</p>
              <p className="mt-0.5 text-[11px] text-gray-300">{statusText}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
            <span className={`rounded-full px-2.5 py-1 ${writeEnabled ? "bg-red-500 text-white" : "bg-emerald-500/20 text-emerald-300"}`}>
              {writeEnabled ? "Push UNLOCKED" : "Push LOCKED (ERP safe)"}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-gray-200">Product table: {productsTable}</span>
          </div>
        </div>
      </div>

      {/* PULL / PUSH toggle buttons */}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-white p-4">
          <p className="flex items-center gap-2 text-sm font-black"><ArrowDownToLine className="h-4 w-4 text-emerald-600" /> Pull — ERP → Website</p>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
            Reads products from the ERP MySQL (strictly SELECT only) and refreshes the B2B catalog: names, categories, brands,
            all 5 price tiers, stock, barcodes, HSN &amp; images. New ERP items appear on the website automatically.
          </p>
          <button onClick={pullNow} disabled={pulling || !status.connected} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 ${pulling ? "animate-spin" : ""}`} /> {pulling ? "Pulling…" : "Pull from ERP Now"}
          </button>
        </div>

        <div className={`rounded-xl border-2 p-4 ${writeEnabled ? "border-red-300 bg-gradient-to-r from-red-50 to-white" : "border-amber-300 bg-gradient-to-r from-amber-50 to-white"}`}>
          <p className="flex items-center gap-2 text-sm font-black">
            <ArrowUpFromLine className={`h-4 w-4 ${writeEnabled ? "text-red-600" : "text-amber-600"}`} /> Push — Website → ERP
            {!writeEnabled && <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black uppercase text-white"><Lock className="h-2.5 w-2.5" /> Locked</span>}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
            Dry-run compares every SKU both sides and shows exactly what <i>would</i> change in the ERP (stock &amp; price tiers only).
            Executing real writes requires the unlock toggle below — your ERP data is never touched while locked.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={pushPreview} disabled={previewing || !status.connected} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-500 text-xs font-black uppercase tracking-wider text-white hover:bg-amber-600 disabled:opacity-40">
              <Search className={`h-4 w-4 ${previewing ? "animate-pulse" : ""}`} /> {previewing ? "Checking…" : "Dry-Run"}
            </button>
            <button onClick={pushExecute} disabled={!writeEnabled || executing || !preview?.rowsWithChanges} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 text-xs font-black uppercase tracking-wider text-white hover:bg-red-700 disabled:opacity-30">
              <ArrowUpFromLine className="h-4 w-4" /> {executing ? "Pushing…" : "Push to ERP"}
            </button>
          </div>
        </div>
      </div>

      {/* push preview table */}
      {preview && (
        <div className="mb-4 rounded-xl border bg-white p-4">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Push dry-run — {preview.rowsWithChanges} row(s) differ of {preview.matchedSkus} matched SKUs ({preview.checkedErpRows} ERP rows checked)
          </p>
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-gray-50 text-left uppercase text-gray-400">
                <tr><th className="px-2 py-1.5">SKU</th><th className="px-2 py-1.5">Product</th><th className="px-2 py-1.5">Field</th><th className="px-2 py-1.5">ERP now</th><th className="px-2 py-1.5">Website value</th></tr>
              </thead>
              <tbody>
                {preview.sample.flatMap((r) => r.diffs.map((d, i) => (
                  <tr key={`${r.sku}-${d.field}`} className="border-t">
                    <td className="px-2 py-1 font-mono">{i === 0 ? r.sku : ""}</td>
                    <td className="px-2 py-1">{i === 0 ? r.name : ""}</td>
                    <td className="px-2 py-1 font-bold">{d.field} <span className="font-normal text-gray-400">({d.erpColumn})</span></td>
                    <td className="px-2 py-1 text-gray-500">{d.erpValue}</td>
                    <td className="px-2 py-1 font-bold text-red-600">{d.webValue}</td>
                  </tr>
                )))}
                {!preview.sample.length && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No differences — website and ERP are in sync.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ERP write lock toggle */}
      <div className={`mb-4 rounded-xl border-2 p-4 ${writeEnabled ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50/50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-sm font-black">
              {writeEnabled ? <Unlock className="h-4 w-4 text-red-600" /> : <Lock className="h-4 w-4 text-emerald-600" />}
              ERP Writes {writeEnabled ? "UNLOCKED — the ERP can be modified" : "LOCKED — ERP is 100% read-only"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              Your ERP is the core of the business, so writes ship <b>disabled</b>. While locked, every ERP query is a SELECT/SHOW/DESCRIBE only — the Push button cannot modify anything.
              Unlocking allows the Push button to update <b>only</b> stock &amp; price-tier columns, matched by SKU. Orders, customers and names are never pushed.
            </p>
            {writeEnabled && <p className="mt-1 text-[10px] font-bold text-red-500"><TriangleAlert className="mr-1 inline h-3 w-3" />Unlocked since {preview?.writeUnlockedAt ? new Date(preview.writeUnlockedAt).toLocaleString("en-IN") : "earlier"}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            {writeEnabled ? (
              <button onClick={() => toggleWrites(false)} className="flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-black uppercase text-white hover:bg-emerald-700">
                <Lock className="h-4 w-4" /> Lock ERP Writes
              </button>
            ) : (
              <>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='type: UNLOCK ERP WRITES' className="h-9 w-52 rounded-lg border px-3 text-xs" />
                <button onClick={() => toggleWrites(true)} className="flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-xs font-black uppercase text-white hover:bg-red-700 disabled:opacity-40" disabled={confirmText !== "UNLOCK ERP WRITES"}>
                  <Unlock className="h-4 w-4" /> Unlock Writes
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* credentials + mapping */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-3 text-xs font-bold">ERP MySQL credentials <span className="font-normal text-gray-400">(stored in the app Setting table — password is masked)</span></p>
          <div className="grid gap-2 sm:grid-cols-2">
            {([["erp_db_host", "Host (e.g. 103.x.x.x or erp.mycompany.in)"], ["erp_db_port", "Port"], ["erp_db_user", "User"], ["erp_db_password", "Password"], ["erp_db_name", "Database name"]] as const).map(([k, label]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">{label}</span>
                <input
                  value={form[k] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  type={k === "erp_db_password" ? "password" : "text"}
                  className="h-9 w-full rounded-lg border px-3 text-xs"
                />
              </label>
            ))}
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Products table name</span>
              <input value={form.erp_products_table} onChange={(e) => setForm((f) => ({ ...f, erp_products_table: e.target.value }))} className="h-9 w-full rounded-lg border px-3 text-xs" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Image base URL (if ERP stores relative paths)</span>
              <input value={form.erp_image_base_url} onChange={(e) => setForm((f) => ({ ...f, erp_image_base_url: e.target.value }))} placeholder="https://erp.mycompany.in/uploads" className="h-9 w-full rounded-lg border px-3 text-xs" />
            </label>
          </div>
          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Column aliases (JSON) — map ERP columns, e.g. {"{"}&quot;sku&quot;: &quot;item_code&quot;, &quot;stock&quot;: &quot;qty_in_hand&quot;{"}"}</span>
            <textarea value={form.erp_product_aliases} onChange={(e) => setForm((f) => ({ ...f, erp_product_aliases: e.target.value }))} rows={2} className="w-full rounded-lg border px-3 py-2 font-mono text-[10px]" />
          </label>
          <button onClick={saveConn} disabled={saving} className="mt-3 flex h-9 items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-bold text-yellow-400 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> {saving ? "Testing…" : "Save & Test Connection"}
          </button>
        </div>

        {/* schema explorer */}
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-1 flex items-center gap-2 text-xs font-bold"><Database className="h-3.5 w-3.5 text-gray-500" /> ERP schema explorer <span className="font-normal text-gray-400">(read-only — verify tables &amp; columns before mapping)</span></p>
          <div className="mb-2 flex items-center gap-2">
            <button onClick={() => explore()} disabled={exploring || !status.connected} className="flex h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 text-xs font-bold text-white disabled:opacity-50">
              <Search className="h-3.5 w-3.5" /> Load tables
            </button>
            {Boolean(tables.length) && (
              <select value={selTable} onChange={(e) => explore(e.target.value)} className="h-9 max-w-[220px] rounded-lg border px-2 text-xs">
                <option value="">— pick a table —</option>
                {tables.map((t) => <option key={t.name} value={t.name}>{t.name}{t.rows !== null ? ` (~${t.rows})` : ""}</option>)}
              </select>
            )}
            {tableCount !== null && <span className="text-[10px] font-bold text-gray-500">{tableCount} rows</span>}
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border">
            <table className="w-full text-[10px]">
              <thead className="bg-gray-50 text-left uppercase text-gray-400">
                <tr><th className="px-2 py-1.5">Column</th><th className="px-2 py-1.5">Type</th><th className="px-2 py-1.5">Null</th><th className="px-2 py-1.5">Key</th></tr>
              </thead>
              <tbody>
                {tableCols.map((c) => (
                  <tr key={c.field} className="border-t">
                    <td className="px-2 py-1 font-mono font-bold">{c.field}</td>
                    <td className="px-2 py-1 text-gray-500">{c.type}</td>
                    <td className="px-2 py-1">{c.null}</td>
                    <td className="px-2 py-1">{c.key}</td>
                  </tr>
                ))}
                {!tableCols.length && <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Load tables, then pick one to inspect its columns.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* history */}
      <div className="rounded-xl border bg-white p-4">
        <p className="mb-2 text-xs font-bold">Sync history</p>
        <div className="max-h-52 overflow-y-auto rounded-lg border">
          <table className="w-full text-[10px]">
            <thead className="bg-gray-50 text-left uppercase text-gray-400">
              <tr><th className="px-2 py-1.5">When</th><th className="px-2 py-1.5">Direction</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Message</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-2 py-1">{new Date(e.createdAt).toLocaleString("en-IN")}</td>
                  <td className="px-2 py-1 font-bold">{e.direction}</td>
                  <td className={`px-2 py-1 font-bold ${e.status === "OK" ? "text-emerald-600" : e.status === "ERROR" ? "text-red-600" : "text-amber-600"}`}>{e.status}</td>
                  <td className="px-2 py-1 text-gray-500">{e.message}</td>
                </tr>
              ))}
              {!events.length && <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No sync events yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
