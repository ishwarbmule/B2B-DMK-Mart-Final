"use client";

/**
 * Warehouse Stock module — Task 15 adds the Transfer tab:
 *   Stock Levels → per-warehouse quantity editing (unchanged)
 *   Transfer     → move stock warehouse → warehouse, single product or bulk list,
 *                  executed atomically server-side + full history ledger.
 */
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, ArrowRightLeft, Database, History, Plus, RefreshCcw, Save, Search, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { formatINR } from "@/lib/store";

type WRow = { id: string; sku: string; name: string; image: string; stock: number; unit: string; packQty: number; qty: number };
type Wh = { id: string; name: string; isDefault: boolean; city?: string };
type TransferRow = {
  id: string; code: string; note: string; itemCount: number; totalQty: number; createdAt: string;
  fromWarehouse: { name: string; city: string } | null;
  toWarehouse: { name: string; city: string } | null;
  items: { id: string; sku: string; name: string; qty: number }[];
};

export function WarehouseStockModule({ token }: { token: string }) {
  const call = api(token);
  const [tab, setTab] = useState<"levels" | "transfer">("levels");
  const [warehouses, setWarehouses] = useState<Wh[]>([]);

  useEffect(() => {
    call("/api/admin/warehouse-stock").then((d) => setWarehouses(d.warehouses ?? [])).catch(() => {});
  }, [call]);

  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        {([["levels", "Stock Levels", WarehouseIcon], ["transfer", "Transfer Stock", ArrowRightLeft]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition ${
              tab === k ? "bg-black text-yellow-400" : "border bg-white text-gray-600 hover:border-yellow-400"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      {tab === "levels" ? <StockLevels token={token} warehouses={warehouses} /> : <TransferStock token={token} warehouses={warehouses} />}
    </div>
  );
}

/* ─────────────────────────── Stock Levels (existing editing UI) ─────────────────────────── */

function StockLevels({ token, warehouses }: { token: string; warehouses: Wh[] }) {
  const call = api(token);
  const [wh, setWh] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<WRow[]>([]);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [whTotal, setWhTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!wh) { setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ warehouseId: wh, page: String(page) });
      if (q) params.set("q", q);
      const d = await call(`/api/admin/warehouse-stock?${params}`);
      setRows(d.rows ?? []);
      setPages(d.pages ?? 1);
      setTotal(d.total ?? 0);
      setWhTotal(d.warehouseTotal ?? 0);
      setEdits({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load warehouse stock");
    } finally { setLoading(false); }
  }, [token, wh, q, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!wh && warehouses.length) setWh(warehouses[0].id);
  }, [warehouses, wh]);

  const save = async () => {
    const changed = Object.entries(edits).filter(([, v]) => v !== undefined && !Number.isNaN(v));
    if (!changed.length) { toast.info("Nothing changed"); return; }
    setBusy(true);
    try {
      await call("/api/admin/warehouse-stock", {
        method: "POST",
        body: JSON.stringify({ warehouseId: wh, rows: changed.map(([productId, qty]) => ({ productId, qty })) }),
      });
      toast.success(`${changed.length} product quantities saved`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  };

  const seed = async () => {
    setBusy(true);
    try {
      const d = await call("/api/admin/warehouse-stock", { method: "POST", body: JSON.stringify({ warehouseId: wh, action: "seed" }) });
      toast.success(`Seeded ${d.seeded ?? 0} products from live stock`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Seed failed");
    } finally { setBusy(false); }
  };

  return (
    <div>
      <ModuleHeader title="Warehouse Stock" sub={`${warehouses.length} warehouses · ${wh ? `${total} products · ${whTotal} units allocated in this warehouse` : "select a warehouse"}`}>
        <select value={wh} onChange={(e) => { setWh(e.target.value); setPage(1); }} className="h-9 rounded-lg border px-2 text-xs font-semibold">
          <option value="">Select warehouse…</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.isDefault ? " (default)" : ""}</option>)}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search product / SKU…" className="h-9 w-52 rounded-lg border pl-8 text-xs outline-none focus:border-yellow-400" />
        </div>
        <button onClick={load} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50"><RefreshCcw className="h-3.5 w-3.5" /> Refresh</button>
        <button onClick={seed} disabled={busy || !wh} className="flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50" title="Create missing rows from live product stock">
          <Database className="h-3.5 w-3.5" /> Seed from stock
        </button>
        <button onClick={save} disabled={busy || !wh || Object.keys(edits).length === 0} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-black text-yellow-400 hover:bg-gray-800 disabled:opacity-40">
          <Save className="h-3.5 w-3.5" /> Save changes
        </button>
      </ModuleHeader>

      {!warehouses.length && !loading && (
        <div className="rounded-xl border bg-white p-10 text-center">
          <WarehouseIcon className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm font-bold text-gray-700">No warehouses yet</p>
          <p className="text-xs text-gray-400">Create your first warehouse in Website &amp; System → Warehouses, then come back here.</p>
        </div>
      )}

      {wh && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2.5">Product</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5 text-right">Live total stock (ERP)</th>
                <th className="px-3 py-2.5 text-right">Qty in this warehouse</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">No products match.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50/60">
                  <td className="flex items-center gap-2 px-3 py-2">
                    {r.image && <Image src={r.image} alt="" width={28} height={28} className="h-7 w-7 rounded object-cover" unoptimized />}
                    <span className="font-semibold">{r.name}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{r.sku}</td>
                  <td className="px-3 py-2 text-right font-bold">{Math.round(r.stock)} {formatINR(0).slice(0, 0)}{r.unit}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" min={0} step="1"
                      value={edits[r.id] !== undefined ? edits[r.id] : r.qty}
                      onChange={(e) => setEdits((m) => ({ ...m, [r.id]: Number(e.target.value) }))}
                      className="h-8 w-24 rounded border px-2 text-right text-xs font-bold focus:border-yellow-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40">Prev</button>
          <span className="font-semibold text-gray-600">Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Transfer Stock (Task 15) ─────────────────────────── */

type PickRow = { id: string; sku: string; name: string; image: string; qty: number };

function TransferStock({ token, warehouses }: { token: string; warehouses: Wh[] }) {
  const call = api(token);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickRow[]>([]);
  const [picked, setPicked] = useState<Record<string, { row: PickRow; qty: number }>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<TransferRow[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const d = await call("/api/admin/stock-transfers");
      setHistory(d.transfers ?? []);
    } catch { /* first run may be empty */ }
  }, [token]);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => {
    if (!from && warehouses.length) setFrom(warehouses[0].id);
    if (!to && warehouses.length > 1) setTo(warehouses[1].id);
  }, [warehouses, from, to]);

  // search products WITH their available qty in the source warehouse
  const search = useCallback(async () => {
    if (!from) { toast.info("Choose the source warehouse first"); return; }
    setBusy(true);
    try {
      const params = new URLSearchParams({ warehouseId: from, page: "1", limit: "40" });
      if (q) params.set("q", q);
      const d = await call(`/api/admin/warehouse-stock?${params}`);
      setResults((d.rows ?? []).filter((r: PickRow) => !picked[r.id]));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally { setBusy(false); }
  }, [token, from, q, picked]);

  const addRow = (r: PickRow) => {
    setPicked((m) => ({ ...m, [r.id]: { row: r, qty: 1 } }));
    setResults((rs) => rs.filter((x) => x.id !== r.id));
  };

  const removeRow = (id: string) => {
    setPicked((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
  };

  const execute = async () => {
    const items = Object.values(picked).filter((p) => p.qty > 0).map((p) => ({ productId: p.row.id, qty: p.qty }));
    if (!from || !to) { toast.error("Choose source and destination warehouses"); return; }
    if (from === to) { toast.error("Source and destination must be different"); return; }
    if (!items.length) { toast.error("Add at least one product"); return; }
    setBusy(true);
    try {
      const d = await call("/api/admin/stock-transfers", {
        method: "POST",
        body: JSON.stringify({ fromWarehouseId: from, toWarehouseId: to, note, items }),
      });
      toast.success(`${d.transfer?.code ?? "Transfer"} executed — ${d.transfer?.totalQty ?? 0} pcs moved`);
      setPicked({});
      setNote("");
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* picker */}
      <div className="space-y-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-600">Move stock — single product or bulk list</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-600">From warehouse *</label>
              <select value={from} onChange={(e) => { setFrom(e.target.value); setResults([]); }} className="h-10 w-full rounded-lg border px-2 text-xs font-semibold">
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.isDefault ? " (default)" : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-600">To warehouse *</label>
              <select value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-full rounded-lg border px-2 text-xs font-semibold">
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.isDefault ? " (default)" : ""}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="Search products in the source warehouse…"
                className="h-9 w-full rounded-lg border pl-8 text-xs outline-none focus:border-yellow-400"
              />
            </div>
            <button onClick={search} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">
              <Search className="h-3.5 w-3.5" /> Search
            </button>
          </div>

          {/* search results */}
          {results.length > 0 && (
            <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border">
              {results.map((r) => (
                <button key={r.id} onClick={() => addRow(r)} className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-xs last:border-0 hover:bg-yellow-50/60">
                  {r.image && <Image src={r.image} alt="" width={24} height={24} className="h-6 w-6 rounded object-cover" unoptimized />}
                  <span className="flex-1 font-semibold">{r.name}</span>
                  <span className="font-mono text-[10px] text-gray-400">{r.sku}</span>
                  <span className={`font-bold ${r.qty > 0 ? "text-emerald-600" : "text-red-500"}`}>{r.qty} in stock</span>
                  <Plus className="h-3.5 w-3.5 text-gray-400" />
                </button>
              ))}
            </div>
          )}

          {/* picked rows */}
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Transfer list ({Object.keys(picked).length})</p>
            {Object.keys(picked).length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-gray-400">Search and add products — set the quantity to move.</p>
            ) : (
              <div className="space-y-1.5">
                {Object.values(picked).map(({ row, qty }) => (
                  <div key={row.id} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs">
                    <span className="flex-1 truncate font-semibold">{row.name}</span>
                    <span className="text-[10px] text-gray-400">avail {row.qty}</span>
                    <ArrowRight className="h-3 w-3 text-gray-300" />
                    <input
                      type="number" min={1} max={row.qty}
                      value={qty}
                      onChange={(e) => setPicked((m) => ({ ...m, [row.id]: { row, qty: Math.max(1, Math.min(row.qty, Number(e.target.value) || 1)) } }))}
                      className="h-7 w-20 rounded border px-2 text-right font-bold focus:border-yellow-400"
                    />
                    <button onClick={() => removeRow(row.id)} aria-label="Remove" className="rounded p-1 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>
                  </div>
                ))}
              </div>
            )}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional) — e.g. refill Mumbai counter"
              className="mt-2 h-9 w-full rounded-lg border px-3 text-xs outline-none focus:border-yellow-400"
            />
            <button
              onClick={execute}
              disabled={busy || !Object.keys(picked).length}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-black py-2.5 text-xs font-black uppercase tracking-wide text-yellow-400 hover:bg-gray-800 disabled:opacity-40"
            >
              <ArrowRightLeft className="h-4 w-4" /> Execute transfer
            </button>
          </div>
        </div>
      </div>

      {/* history */}
      <div className="rounded-xl border bg-white">
        <p className="flex items-center gap-1.5 border-b bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-600">
          <History className="h-3.5 w-3.5" /> Transfer history
        </p>
        <div className="max-h-[64vh] overflow-y-auto">
          {history.length === 0 ? (
            <p className="p-6 text-center text-xs text-gray-400">No transfers yet — executed moves appear here with full product lists.</p>
          ) : (
            history.map((tr) => (
              <div key={tr.id} className="border-b px-4 py-3 text-xs last:border-0">
                <div className="flex items-center justify-between">
                  <p className="font-black text-gray-900">{tr.code}</p>
                  <p className="text-[10px] text-gray-400">{new Date(tr.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-gray-700">
                  {tr.fromWarehouse?.name ?? "?"} <ArrowRight className="h-3 w-3 text-yellow-500" /> {tr.toWarehouse?.name ?? "?"}
                  <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold">{tr.itemCount} items · {tr.totalQty} pcs</span>
                </p>
                {tr.note && <p className="mt-0.5 text-[10px] italic text-gray-500">{tr.note}</p>}
                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-gray-500">
                  {tr.items.map((i) => `${i.name} ×${i.qty}`).join(" · ")}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
