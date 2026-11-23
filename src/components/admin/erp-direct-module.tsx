"use client";

/**
 * ERP Data (MySQL) module — the owner's ERP database is shared with the site
 * over the network (remote MySQL). Everything here is READ-ONLY toward the ERP:
 *
 *  1. Connection — paste host/port/db/user/password (or env), Test Connection.
 *  2. Tick system — pick the ERP tables, tick which columns to share. Ticked
 *     columns appear on the admin panel (Data tab) and flow to the website.
 *  3. Mandatory mappings — products (SKU/name/pricing/stock), warehouses
 *     (godowns), per-godown stock. Brand = ERP company name (auto-upserted).
 *  4. Re-sync now — chunked full pull (one page per request, persisted cursor)
 *     so a 2k+ catalog never hits the serverless timeout. A daily cron (Hobby plan) loops pages within its time budget
 *     keeps it fresh; ERP stock is read-only — orders are entered in the ERP
 *     software by the team, the next sync reads the reduced stock.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Database, Link2, Loader2, PlugZap, RefreshCcw, Save, Search, Table2, Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ErpStatus = { configured: boolean; connected: boolean; error?: string; version?: string; database?: string; host?: string; tables?: number };
type ColumnInfo = { field: string; type: string; null: string; key: string };
type Mapping = Record<string, string | string[] | undefined> & { table: string; columns?: string[] };

type Status = {
  mappings: { products: { table: string; ticked: number } | null; warehouses: { table: string; ticked: number } | null; stock: { table: string; ticked: number } | null };
  counts: { mirror: number; erpProducts: number; erpWarehouses: number; erpStockRows: number; brands: number };
  cursor: { productsOffset: number; lastFullAt: string; lastWarehousesAt: string; lastStockAt: string; lastTickAt: string };
  history: { id: string; direction: string; action: string; status: string; message: string; productsSeen: number; created: number; updated: number; skipped: number; durationMs: number; createdAt: string }[];
};

const ENTITIES = [
  { id: "products", label: "Products", icon: Table2, hint: "SKU, name, pricing (MRP + rate), stock, image — the catalog" },
  { id: "warehouses", label: "Warehouses", icon: WarehouseIcon, hint: "ERP godowns — mandatory, syncs with codes" },
  { id: "stock", label: "Godown Stock", icon: Database, hint: "per-warehouse quantities — buyers' orderable stock" },
] as const;
type EntityId = (typeof ENTITIES)[number]["id"];

const MAPPING_FIELDS: Record<EntityId, { key: string; label: string; required?: boolean }[]> = {
  products: [
    { key: "skuCol", label: "SKU column", required: true },
    { key: "nameCol", label: "Name column", required: true },
    { key: "companyCol", label: "Company column (becomes Brand)" },
    { key: "mrpCol", label: "MRP column" },
    { key: "rateCol", label: "Rate column (selling price)" },
    { key: "costCol", label: "Cost column (admin-only)" },
    { key: "deliveryRateCol", label: "Delivery rate column" },
    { key: "stockCol", label: "Stock column" },
    { key: "imageCol", label: "Image column" },
    { key: "activeCol", label: "Active/status column" },
    { key: "unitCol", label: "Unit column" },
    { key: "packQtyCol", label: "Pack qty column" },
    { key: "tier1Col", label: "Tier 1 column" },
    { key: "tier2Col", label: "Tier 2 column" },
    { key: "tier3Col", label: "Tier 3 column" },
    { key: "tier4Col", label: "Tier 4 column" },
    { key: "tier5Col", label: "Tier 5 column" },
  ],
  warehouses: [
    { key: "codeCol", label: "Godown code column", required: true },
    { key: "nameCol", label: "Godown name column", required: true },
    { key: "activeCol", label: "Active column" },
  ],
  stock: [
    { key: "skuCol", label: "SKU column", required: true },
    { key: "warehouseCodeCol", label: "Godown code column", required: true },
    { key: "qtyCol", label: "Quantity column", required: true },
  ],
};

const slimScroll = "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300";

export function ErpDirectModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [status, setStatus] = useState<Status | null>(null);
  const [conn, setConn] = useState<ErpStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const [entity, setEntity] = useState<EntityId>("products");
  const [tables, setTables] = useState<{ name: string; rows: number | null }[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [savingMapping, setSavingMapping] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);

  const [browser, setBrowser] = useState<{ columns: string[]; rows: Record<string, unknown>[]; total: number; page: number; table: string } | null>(null);
  const [bq, setBq] = useState("");

  // ── loaders ──
  const loadStatus = useCallback(() => {
    call("/api/admin/erp-direct/status").then(setStatus).catch((e) => toast.error(e instanceof Error ? e.message : "Status failed"));
  }, [call]);
  const loadTables = useCallback(() => {
    call("/api/admin/erp-direct/tables")
      .then((d) => setTables(d.tables ?? []))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not list ERP tables"));
  }, [call]);

  useEffect(() => { loadStatus(); loadTables(); }, [loadStatus, loadTables]);

  const loadEntityMapping = useCallback((ent: EntityId, suggestTable?: string) => {
    const qs = suggestTable ? `&suggestTable=${encodeURIComponent(suggestTable)}` : "";
    call(`/api/admin/erp-direct/mapping?entity=${ent}${qs}`)
      .then((d) => {
        if (d.current) { setMapping(d.current); setColumns([]); }
        else if (d.suggestion) { setMapping(d.suggestion); setColumns([]); toast.info(`Auto-detected mapping for ${suggestTable} — verify the highlighted columns, then Save`); }
        else setMapping(null);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Mapping load failed"));
    if (suggestTable) {
      call(`/api/admin/erp-direct/columns?table=${encodeURIComponent(suggestTable)}`)
        .then((d) => setColumns(d.columns ?? []))
        .catch(() => setColumns([]));
    }
  }, [call]);

  useEffect(() => { loadEntityMapping(entity); }, [entity, loadEntityMapping]);

  // ── actions ──
  const testConnection = async () => {
    setTesting(true);
    try {
      const s = await call("/api/admin/erp-direct/test");
      setConn(s);
      if (s.connected) { toast.success(`ERP connected — ${s.database} (${s.tables} tables, ${s.version})`); loadTables(); }
      else toast.error(s.error ?? "Connection failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection test failed");
    } finally { setTesting(false); }
  };

  const pickTable = async (t: string) => {
    if (!mapping) {
      loadEntityMapping(entity, t);
      return;
    }
    setMapping({ ...mapping, table: t });
    try {
      const d = await call(`/api/admin/erp-direct/columns?table=${encodeURIComponent(t)}`);
      setColumns(d.columns ?? []);
    } catch { setColumns([]); }
  };

  const saveMapping = async () => {
    if (!mapping) return;
    setSavingMapping(true);
    try {
      await call("/api/admin/erp-direct/mapping", { method: "POST", body: JSON.stringify({ entity, mapping }) });
      toast.success(`${entity} mapping saved — ticked columns now show in the Data tab`);
      loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSavingMapping(false); }
  };

  const toggleTick = (col: string) => {
    if (!mapping) return;
    const cur = new Set(mapping.columns ?? []);
    if (cur.has(col)) cur.delete(col); else cur.add(col);
    setMapping({ ...mapping, columns: [...cur] });
  };

  const resyncNow = async () => {
    setSyncing(true);
    setSyncLog([]);
    const log: string[] = [];
    try {
      for (let i = 0; i < 100; i++) {
        const r = await call("/api/admin/erp-direct/sync", { method: "POST", body: JSON.stringify({ action: "resync" }) });
        const parts: string[] = [];
        if (r.warehouses) parts.push(`godowns +${r.warehouses.created}/~${r.warehouses.updated}`);
        if (r.stock) parts.push(`stock ${r.stock.stocksUpserted} rows / ${r.stock.productsUpdated} skus`);
        if (r.products) parts.push(`products page@${r.products.offset}: ${r.products.created} new, ${r.products.updated} updated`);
        if (r.errors?.length) parts.push(`errors: ${r.errors.slice(0, 2).join("; ")}`);
        log.push(`Pass ${i + 1}: ${parts.join(" · ") || "nothing configured"}`);
        setSyncLog([...log]);
        if (!r.products || r.products.done) { log.push(r.products ? "FULL PULL COMPLETE" : "Products not configured — skipped"); setSyncLog([...log]); break; }
      }
      toast.success("Re-sync finished");
      loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-sync failed");
      setSyncLog([...log, `FAILED: ${e instanceof Error ? e.message : "error"}`]);
    } finally { setSyncing(false); }
  };

  const loadBrowser = useCallback((page = 1, q = "") => {
    call(`/api/admin/erp-direct/data?entity=${entity}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`)
      .then(setBrowser)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Data load failed"));
  }, [call, entity]);

  useEffect(() => { setBrowser(null); }, [entity]);
  const openBrowser = () => loadBrowser(1, bq);

  const pages = browser ? Math.max(1, Math.ceil(browser.total / 50)) : 1;

  return (
    <div>
      <ModuleHeader title="ERP Data (MySQL)" sub="Read-only link into the ERP database — tick what to share, map the mandatory pieces, keep stock honest">
        <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Test Connection
        </Button>
        <Button size="sm" className="bg-black text-white hover:bg-gray-800" onClick={resyncNow} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Re-sync now
        </Button>
      </ModuleHeader>

      {/* connection + counts */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border bg-white p-3 sm:col-span-2 lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Link2 className="h-4 w-4" /> ERP link
            {conn?.connected ? <Badge className="bg-green-100 text-green-800">connected</Badge>
              : conn && !conn.connected ? <Badge className="bg-red-100 text-red-700">error</Badge>
              : <Badge variant="secondary">not tested</Badge>}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {conn?.connected ? `${conn.host} · ${conn.database} · MySQL ${conn.version} · ${conn.tables} tables`
              : conn?.error ? conn.error
              : "Credentials come from env (ERP_MYSQL_*) or the Settings table — the connection is strictly read-only."}
          </p>
        </div>
        {[
          { label: "ERP products", value: status?.counts.erpProducts ?? "—", sub: `${status?.counts.mirror ?? "—"} mirrored rows` },
          { label: "ERP godowns", value: status?.counts.erpWarehouses ?? "—", sub: `${status?.counts.erpStockRows ?? "—"} stock rows` },
          { label: "Brands (=companies)", value: status?.counts.brands ?? "—", sub: "auto-upserted from ERP" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-white p-3">
            <p className="text-[12px] font-medium text-gray-500">{s.label}</p>
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="text-[11px] text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {status?.cursor.lastFullAt && (
        <p className="mb-4 text-xs text-gray-500">
          Last full product pull: {new Date(status.cursor.lastFullAt).toLocaleString()} · last tick: {status.cursor.lastTickAt ? new Date(status.cursor.lastTickAt).toLocaleString() : "—"}
        </p>
      )}

      {/* entity tabs */}
      <div className="mb-3 flex flex-wrap gap-2">
        {ENTITIES.map((e) => (
          <button
            key={e.id}
            onClick={() => setEntity(e.id)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              entity === e.id ? "bg-black text-white" : "border bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <e.icon className="h-3.5 w-3.5" /> {e.label}
            {status?.mappings[e.id] && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${entity === e.id ? "bg-white/20" : "bg-green-100 text-green-700"}`}>{status.mappings[e.id]!.ticked} ticked</span>}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-gray-500">{ENTITIES.find((e) => e.id === entity)!.hint}</p>

      {/* mapping editor */}
      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="min-w-56">
            <Label className="text-[12px] font-medium text-gray-500">ERP table</Label>
            <select
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
              value={mapping?.table ?? ""}
              onChange={(e) => pickTable(e.target.value)}
            >
              <option value="">— pick an ERP table —</option>
              {tables.map((t) => (
                <option key={t.name} value={t.name}>{t.name}{t.rows !== null ? ` (~${t.rows} rows)` : ""}</option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={saveMapping} disabled={savingMapping || !mapping}>
            {savingMapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save mapping
          </Button>
          {mapping && (
            <Button size="sm" variant="outline" onClick={openBrowser}>
              <Table2 className="h-4 w-4" /> View data ({mapping.columns?.length ?? 0} ticked cols)
            </Button>
          )}
        </div>

        {mapping ? (
          <>
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MAPPING_FIELDS[entity].map((f) => (
                <div key={f.key}>
                  <Label className="text-[12px] font-medium text-gray-500">
                    {f.label}{f.required && <span className="text-red-500"> *</span>}
                  </Label>
                  <select
                    className="mt-0.5 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
                    value={(mapping[f.key] as string) ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}
                  >
                    <option value="">— none —</option>
                    {(columns.length ? columns.map((c) => c.field) : [...new Set([...(mapping.columns ?? []), ...Object.keys(mapping)])]).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <p className="mb-1.5 text-[12px] font-medium text-gray-500">
              Tick columns to share ({mapping.columns?.length ?? 0} ticked) — ticked columns appear in the Data tab and flow to the website
            </p>
            <div className={`grid max-h-40 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-3 lg:grid-cols-5 ${slimScroll}`}>
              {(columns.length ? columns : (mapping.columns ?? []).map((f) => ({ field: f, type: "", null: "", key: "" }))).map((c) => (
                <label key={c.field} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-gray-50">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-black"
                    checked={(mapping.columns ?? []).includes(c.field)}
                    onChange={() => toggleTick(c.field)}
                  />
                  <span className="truncate" title={`${c.field} · ${c.type}`}>{c.field}</span>
                  {c.type && <span className="ml-auto shrink-0 text-[9px] text-gray-400">{c.type.split("(")[0]}</span>}
                </label>
              ))}
              {!columns.length && !mapping.columns?.length && <p className="col-span-full p-2 text-center text-xs text-gray-400">Pick a table to load its columns</p>}
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-gray-400">
            No mapping yet — pick an ERP table above and the auto-detected suggestion will fill in (verify, tick extra columns, Save).
          </p>
        )}
      </div>

      {/* sync log */}
      {syncLog.length > 0 && (
        <div className={`mb-4 max-h-36 overflow-y-auto rounded-xl border bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-600 ${slimScroll}`}>
          {syncLog.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}

      {/* data browser — the ticked columns, live */}
      {browser && (
        <div className="mb-4 rounded-xl border bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <Table2 className="h-4 w-4 text-gray-400" />
            <p className="text-sm font-bold">{browser.table} <span className="font-normal text-gray-400">· {browser.total} rows · ticked columns</span></p>
            <div className="ml-auto flex items-center gap-2">
              <Input className="h-8 w-44 text-xs" placeholder="Search SKU…" value={bq} onChange={(e) => setBq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadBrowser(1, bq)} />
              <Button size="sm" variant="outline" onClick={() => loadBrowser(1, bq)}><Search className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="outline" disabled={browser.page <= 1} onClick={() => loadBrowser(browser.page - 1, bq)}>‹</Button>
              <span className="text-xs text-gray-500">{browser.page}/{pages}</span>
              <Button size="sm" variant="outline" disabled={browser.page >= pages} onClick={() => loadBrowser(browser.page + 1, bq)}>›</Button>
            </div>
          </div>
          <div className={`overflow-x-auto ${slimScroll}`}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  {browser.columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 font-bold text-gray-500">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {browser.rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    {browser.columns.map((c) => <td key={c} className="max-w-52 truncate whitespace-nowrap px-3 py-1.5">{r[c] === null || r[c] === undefined ? <span className="text-gray-300">—</span> : String(r[c])}</td>)}
                  </tr>
                ))}
                {!browser.rows.length && <tr><td colSpan={browser.columns.length} className="p-6 text-center text-gray-400">No rows</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* history */}
      {status?.history?.length ? (
        <div className="rounded-xl border bg-white">
          <p className="border-b p-3 text-sm font-bold">Sync history</p>
          <div className={`max-h-56 overflow-y-auto p-3 text-xs text-gray-600 ${slimScroll}`}>
            {status.history.map((h) => (
              <p key={h.id} className="border-b py-1 last:border-0">
                <span className="font-mono text-[10px] text-gray-400">{new Date(h.createdAt).toLocaleString()}</span>{" "}
                <Badge variant="secondary" className="mr-1 text-[9px]">{h.action}</Badge>
                <span className={h.status === "OK" ? "text-green-700" : "text-amber-700"}>{h.message}</span>{" "}
                <span className="text-gray-400">({h.durationMs}ms)</span>
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
