"use client";

/**
 * ERP Sync — the owner's guided sync surface (built for a non-technical user).
 *
 * The flow reads like plain language and never exposes source-system details:
 * no host/database/version, no table or column names, no firm names, no tax
 * statuses — only warehouses, cities and product details.
 *
 *   1 · Connect        — Test connection. Success says exactly one word more.
 *   2 · Warehouses     — tick the warehouses to show; products + stock follow.
 *   3 · Product details— tick what product information appears.
 *   4 · Update Products— applies everything: hides unticked data, pulls the
 *                        ticked warehouses, reconciles what is listed.
 *
 * Ticks are STAGED: nothing changes until "Update Products" is clicked.
 * The source system is strictly read-only — every write lands in this site's
 * own database only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, CircleDashed, Loader2, PlugZap, RefreshCcw, Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { Button } from "@/components/ui/button";

type Wh = { id: string; name: string; city: string; active: boolean; products: number };
type Group = { id: string; label: string; ticked: boolean; locked?: boolean };
type Sources = {
  configured: boolean; connected: boolean; error?: string;
  hasSelection: boolean; selectedIds: string[]; groups: Group[]; warehouses: Wh[];
};
type Preview = {
  counts: { productsTotal: number; productsShown: number; warehousesTotal: number; warehousesShown: number; stockRows: number };
  products: { name: string; sku: string; price: number; mrp: number | null; stock: number | null; company: string | null; active: boolean }[];
  warehouses: { name: string; city: string; active: boolean; stockRows: number }[];
};
type History = { id: string; action: string; status: string; message: string; createdAt: string }[];

const slimScroll = "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300";
const card = "rounded-xl border border-gray-200 bg-white";
const sectionTitle = "text-[15px] font-medium text-gray-900";
const sectionSub = "mt-1 text-[13px] leading-5 text-gray-500";
const quietChip = "rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500";

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
function sameGroups(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const ka = Object.keys(a).filter((k) => a[k] === false);
  const kb = Object.keys(b).filter((k) => b[k] === false);
  return sameSet(new Set(ka), new Set(kb));
}
const nf = (n: number) => n.toLocaleString("en-IN");

export function ErpDirectModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);

  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<Sources | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<History>([]);

  // staged ticks
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<Record<string, boolean>>({});
  const [savedGroups, setSavedGroups] = useState<Record<string, boolean>>({});

  const [connState, setConnState] = useState<"unknown" | "ok" | "fail">("unknown");
  const [testing, setTesting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [tab, setTab] = useState<"products" | "warehouses">("products");

  const load = useCallback(async () => {
    try {
      const [s, p, st] = await Promise.all([
        call("/api/admin/erp-direct/sources"),
        call("/api/admin/erp-direct/preview"),
        call("/api/admin/erp-direct/status"),
      ]);
      setSources(s);
      setPreview(p);
      setHistory((st.history ?? []) as History);
      const ids = new Set<string>((s.selectedIds ?? []) as string[]);
      setSavedIds(ids);
      setSelIds(new Set(ids));
      const g: Record<string, boolean> = {};
      for (const grp of (s.groups ?? []) as Group[]) g[grp.id] = grp.ticked;
      setSavedGroups({ ...g });
      setGroups({ ...g });
      setConnState(s.connected ? "ok" : s.configured ? "fail" : "unknown");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const dirty = !!sources && (!sameSet(selIds, savedIds) || !sameGroups(groups, savedGroups));
  const connected = connState === "ok";
  const stagedWhCount = selIds.size;
  const stagedSummary = useMemo(() => {
    if (!dirty || !sources) return "";
    const added = [...selIds].filter((id) => !savedIds.has(id)).length;
    const removed = [...savedIds].filter((id) => !selIds.has(id)).length;
    const parts: string[] = [];
    if (added) parts.push(`${added} warehouse${added > 1 ? "s" : ""} to show`);
    if (removed) parts.push(`${removed} to hide`);
    const detailChanges = Object.keys(groups).filter((k) => (savedGroups[k] !== false) !== (groups[k] !== false) && k !== "pricing");
    if (detailChanges.length) parts.push(`${detailChanges.length} detail change${detailChanges.length > 1 ? "s" : ""}`);
    return parts.join(" · ");
  }, [dirty, sources, selIds, savedIds, groups, savedGroups]);

  const testConnection = async () => {
    setTesting(true);
    try {
      const s = await call("/api/admin/erp-direct/test");
      if (s.connected) {
        setConnState("ok");
        toast.success("Connected");
        await load();
      } else {
        setConnState("fail");
        toast.error(s.error || "Connection failed");
      }
    } catch (e) {
      setConnState("fail");
      toast.error(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  const toggleWh = (id: string) => {
    setSelIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleGroup = (id: string) => {
    setGroups((cur) => ({ ...cur, [id]: cur[id] === false }));
  };

  /** The full pull, chunk by chunk — one page per request so a big catalog
   *  never hits the function timeout. Runs against the SAVED selection. */
  const runPullLoop = async (): Promise<boolean> => {
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      const r = await call("/api/admin/erp-direct/sync", { method: "POST", body: JSON.stringify({ action: "resync" }) });
      const parts: string[] = [];
      if (r.warehouses) parts.push(`warehouses ${r.warehouses.created + r.warehouses.updated} checked`);
      if (r.stock) parts.push(`stock ${nf(r.stock.stocksUpserted)} rows`);
      if (r.products) parts.push(`products page ${i + 1}: ${nf(r.products.created)} new, ${nf(r.products.updated)} updated`);
      lines.push(parts.join(" · ") || "nothing to pull yet");
      setLog([...lines]);
      if (!r.products || r.products.done) return true;
    }
    return false;
  };

  const updateProducts = async () => {
    if (!selIds.size) { toast.error("Tick at least one warehouse first"); return; }
    if (!confirm("Update products now? Unticked warehouses and details will be hidden from the site.")) return;
    setApplying(true);
    setLog([]);
    try {
      await call("/api/admin/erp-direct/apply", { method: "POST", body: JSON.stringify({ ids: [...selIds], groups }) });
      setLog(["Saving your choices… done"]);
      const done = await runPullLoop();
      if (done) {
        setLog((cur) => [...cur, "Reconciling what is listed…"]);
        const f = await call("/api/admin/erp-direct/apply", { method: "POST", body: JSON.stringify({ action: "finalize" }) });
        toast.success(`Products updated — ${nf(f.hiddenProducts ?? 0)} hidden, ${nf(f.shownProducts ?? 0)} shown`);
        setSavedIds(new Set(selIds));
        setSavedGroups({ ...groups });
      } else {
        toast.error("Pulled most products but did not finish — click Update Products again to continue");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
      setLog((cur) => [...cur, "Failed — your choices are saved; click Update Products again to retry"]);
    } finally {
      setApplying(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setLog([]);
    try {
      setLog(["Refreshing warehouses and stock…"]);
      const done = await runPullLoop();
      const f = await call("/api/admin/erp-direct/apply", { method: "POST", body: JSON.stringify({ action: "finalize" }) });
      if (done) toast.success(`Sync finished — ${nf(f.hiddenProducts ?? 0)} hidden, ${nf(f.shownProducts ?? 0)} shown`);
      else toast.error("Synced part of the catalog — click Sync again to continue");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading
      </div>
    );
  }

  const busy = applying || syncing;
  const mrpOn = groups["mrp"] !== false;
  const stockOn = groups["stock"] !== false;
  const brandOn = groups["brand"] !== false;

  return (
    <div>
      <ModuleHeader title="ERP Sync" sub="Keep products, warehouses and stock fresh — pick what to show, then update">
        <Button variant="outline" size="sm" onClick={syncNow} disabled={busy || !connected}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Sync now
        </Button>
      </ModuleHeader>

      {/* 1 · connection */}
      <section className={`${card} mb-4 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={sectionTitle}>1 · Connect</h2>
            <p className={sectionSub}>
              {connected
                ? "Connected — pick the warehouses below"
                : "Connect once to load the warehouse list"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {connected ? (
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-gray-700">
                <CheckCircle2 className="h-4 w-4" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[13px] text-gray-500">
                <CircleDashed className="h-4 w-4 text-gray-400" /> Not connected
              </span>
            )}
            <Button variant="outline" size="sm" onClick={testConnection} disabled={testing || busy}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Test connection
            </Button>
          </div>
        </div>
      </section>

      {/* 2 · warehouses */}
      <section className={`${card} mb-4 p-5`}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className={sectionTitle}>2 · Warehouses</h2>
            <p className={sectionSub}>Tick the warehouses to show on the site — their products and stock come with them. Unticked ones hide.</p>
          </div>
          <span className="text-[12px] tabular-nums text-gray-400">{stagedWhCount} of {sources?.warehouses.length ?? 0} ticked</span>
        </div>
        {connected && (sources?.warehouses.length ?? 0) > 0 ? (
          <div className={`mt-3 grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-gray-200 p-2 sm:grid-cols-2 lg:grid-cols-3 ${slimScroll}`}>
            {sources!.warehouses.map((w) => {
              const stagedOn = selIds.has(w.id);
              const savedOn = savedIds.has(w.id);
              const change = stagedOn !== savedOn;
              return (
                <label key={w.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${stagedOn ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50"}`}>
                  <input type="checkbox" className="h-4 w-4 accent-gray-900" checked={stagedOn} onChange={() => toggleWh(w.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-gray-900">{w.name}</span>
                    <span className="block truncate text-[12px] text-gray-500">{w.city || "—"} · {nf(w.products)} products</span>
                  </span>
                  {change && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${stagedOn ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-600"}`}>{stagedOn ? "Will show" : "Will hide"}</span>}
                </label>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-gray-50 p-3 text-[13px] text-gray-500">
            {connected ? "No warehouses are available right now — they will appear here once added." : "Test the connection first — the warehouse list loads from it."}
          </p>
        )}
      </section>

      {/* 3 · product details */}
      <section className={`${card} mb-4 p-5`}>
        <h2 className={sectionTitle}>3 · Product details</h2>
        <p className={sectionSub}>Choose which product details to show. Name, code and selling price are always on. Departments &amp; categories keep the shop tree true to the source.</p>
        <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {(sources?.groups ?? []).map((g) => {
            const stagedOn = groups[g.id] !== false;
            const change = (savedGroups[g.id] !== false) !== stagedOn && !g.locked;
            return (
              <label key={g.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${g.locked ? "cursor-default border-gray-200 bg-gray-50 opacity-80" : `cursor-pointer ${stagedOn ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50"}`}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-gray-900"
                  checked={stagedOn}
                  disabled={g.locked}
                  onChange={() => toggleGroup(g.id)}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-gray-900">{g.label}</span>
                {g.locked && <span className={quietChip}>always on</span>}
                {change && <span className={quietChip}>{stagedOn ? "Will show" : "Will hide"}</span>}
              </label>
            );
          })}
        </div>
      </section>

      {/* 4 · update */}
      <section className={`${card} mb-4 flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <h2 className={sectionTitle}>4 · Update</h2>
          <p className={sectionSub}>
            {dirty && stagedSummary
              ? `Staged: ${stagedSummary} — nothing changes until you update`
              : connected ? "No changes waiting — ticks above apply when you update" : "Connect first to make changes"}
          </p>
        </div>
        <Button size="sm" className="bg-black text-white hover:bg-gray-800" onClick={updateProducts} disabled={busy || !dirty || !connected}>
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Update Products
        </Button>
      </section>

      {/* progress */}
      {log.length > 0 && (
        <div className={`mb-4 max-h-36 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-600 ${slimScroll}`}>
          {log.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}

      {/* synced data preview */}
      {preview && (
        <section className={`${card} mb-4`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-4">
            <h2 className={sectionTitle}>Synced data</h2>
            <span className="text-[12px] tabular-nums text-gray-400">
              {nf(preview.counts.productsShown)} of {nf(preview.counts.productsTotal)} products listed · {nf(preview.counts.warehousesShown)} of {nf(preview.counts.warehousesTotal)} warehouses shown · {nf(preview.counts.stockRows)} stock rows
            </span>
            <div className="ml-auto flex gap-1">
              {(["products", "warehouses"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`h-8 rounded-lg px-3 text-[12px] font-medium capitalize transition-colors ${tab === t ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {tab === "products" ? (
            <div className={`overflow-x-auto ${slimScroll}`}>
              <table className="w-full text-left text-[13px] tabular-nums">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[12px] font-medium text-gray-500">
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Code</th>
                    {brandOn && <th className="px-4 py-2.5">Brand</th>}
                    <th className="px-4 py-2.5 text-right">Price</th>
                    {mrpOn && <th className="px-4 py-2.5 text-right">MRP</th>}
                    {stockOn && <th className="px-4 py-2.5 text-right">Stock</th>}
                    <th className="px-4 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.products.map((p, i) => (
                    <tr key={`${p.sku}-${i}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="max-w-[320px] truncate px-4 py-2 text-gray-900">{p.name}</td>
                      <td className="px-4 py-2 text-gray-500">{p.sku}</td>
                      {brandOn && <td className="max-w-[160px] truncate px-4 py-2 text-gray-500">{p.company || "—"}</td>}
                      <td className="px-4 py-2 text-right text-gray-900">{p.price ? `₹${p.price.toFixed(2)}` : "—"}</td>
                      {mrpOn && <td className="px-4 py-2 text-right text-gray-500">{p.mrp ? `₹${p.mrp.toFixed(2)}` : "—"}</td>}
                      {stockOn && <td className="px-4 py-2 text-right text-gray-500">{p.stock ?? "—"}</td>}
                      <td className="px-4 py-2 text-right"><span className={quietChip}>{p.active ? "listed" : "hidden"}</span></td>
                    </tr>
                  ))}
                  {!preview.products.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No products synced yet</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <table className="w-full text-left text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[12px] font-medium text-gray-500">
                  <th className="px-4 py-2.5">Warehouse</th>
                  <th className="px-4 py-2.5">City</th>
                  <th className="px-4 py-2.5 text-right">Stock rows</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.warehouses.map((w, i) => (
                  <tr key={`${w.name}-${i}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-900"><span className="flex items-center gap-2"><WarehouseIcon className="h-4 w-4 text-gray-400" />{w.name}</span></td>
                    <td className="px-4 py-2 text-gray-500">{w.city || "—"}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{nf(w.stockRows)}</td>
                    <td className="px-4 py-2 text-right"><span className={quietChip}>{w.active ? "shown" : "hidden"}</span></td>
                  </tr>
                ))}
                {!preview.warehouses.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No warehouses synced yet</td></tr>}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* history */}
      {history.length > 0 && (
        <section className={card}>
          <p className="border-b border-gray-200 p-4 text-[13px] font-medium text-gray-900">Sync history</p>
          <div className={`max-h-56 overflow-y-auto p-4 text-[12px] text-gray-600 ${slimScroll}`}>
            {history.map((h) => (
              <p key={h.id} className="border-b border-gray-100 py-1.5 last:border-0">
                <span className="mr-2 font-mono text-[10px] text-gray-400">{new Date(h.createdAt).toLocaleString()}</span>
                <span className={h.status === "OK" ? "text-gray-700" : "text-amber-700"}>{h.message}</span>
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
