"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Warehouse as WarehouseIcon, RefreshCcw, Search, Save, Database } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { formatINR } from "@/lib/store";

type WRow = { id: string; sku: string; name: string; image: string; stock: number; unit: string; packQty: number; qty: number };

export function WarehouseStockModule({ token }: { token: string }) {
  const call = api(token);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; isDefault: boolean; city?: string }>>([]);
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
      setWarehouses(d.warehouses ?? []);
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
    call("/api/admin/warehouse-stock").then((d) => {
      setWarehouses(d.warehouses ?? []);
      if (!wh && (d.warehouses ?? []).length) setWh(d.warehouses[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <p className="text-xs text-gray-400">Create your first warehouse in Website & System → Warehouses, then come back here.</p>
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
