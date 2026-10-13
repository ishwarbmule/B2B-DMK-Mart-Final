"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Check, Minus, Plus, Printer, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { Code39Svg } from "./barcode";

type Row = { id: string; sku: string; name: string; image: string; packQty: number; piecesPerBox: number; dealerPrice: number; brand: { name: string } };
type UnitType = "SINGLE" | "PACK" | "BULK";

const UNIT_META: Record<UnitType, { label: string; suffix: string; pieces: (r: Row) => number; price: (r: Row) => number }> = {
  SINGLE: { label: "Single Piece", suffix: "S", pieces: () => 1, price: (r) => r.dealerPrice },
  PACK: { label: "Pack", suffix: "P", pieces: (r) => Math.max(1, r.packQty || 1), price: (r) => Math.round(r.dealerPrice * Math.max(1, r.packQty || 1) * 0.94 * 100) / 100 },
  BULK: { label: "Bulk Case", suffix: "B", pieces: (r) => Math.max(r.piecesPerBox || 0, (r.packQty || 1) * 4, 1), price: (r) => Math.round(r.dealerPrice * Math.max(r.piecesPerBox || 0, (r.packQty || 1) * 4, 1) * 0.88 * 100) / 100 },
};

export function BarcodeStudio({ token }: { token: string }) {
  const call = api(token);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Record<string, Row>>({});
  const [unit, setUnit] = useState<UnitType>("SINGLE");
  const [labelsPerProduct, setLabelsPerProduct] = useState(2);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20", q });
      const d = await call(`/api/admin/products?${params}`);
      setRows(d.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
     
  }, [token, q]);

  useEffect(() => {
    search();
  }, [search]);

  const selCount = Object.keys(selected).length;
  const meta = UNIT_META[unit];

  return (
    <div>
      <ModuleHeader title="Barcode Printing Studio" sub="Generate & print product barcodes per unit type — single piece, pack or bulk case">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search SKU or name…"
            className="h-9 w-56 rounded-lg border pl-8 text-xs outline-none focus:border-yellow-400"
          />
        </div>
        <button onClick={search} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50">
          <RefreshCcw className="h-3.5 w-3.5" /> Search
        </button>
      </ModuleHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* results */}
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="flex flex-wrap items-center gap-1.5 border-b bg-gray-50 px-3 py-2">
            {(["SINGLE", "PACK", "BULK"] as UnitType[]).map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${unit === u ? "bg-black text-yellow-400" : "border bg-white text-gray-600 hover:border-yellow-400"}`}
              >
                {UNIT_META[u].label}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-gray-500">{selCount} selected · labels per product</span>
            <div className="flex items-center rounded-lg border">
              <button onClick={() => setLabelsPerProduct((n) => Math.max(1, n - 1))} className="flex h-7 w-7 items-center justify-center"><Minus className="h-3 w-3" /></button>
              <span className="w-8 text-center text-xs font-black">{labelsPerProduct}</span>
              <button onClick={() => setLabelsPerProduct((n) => Math.min(24, n + 1))} className="flex h-7 w-7 items-center justify-center"><Plus className="h-3 w-3" /></button>
            </div>
          </div>
          <div className="max-h-[62vh] overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {loading && <tr><td className="px-4 py-10 text-center text-gray-400">Searching…</td></tr>}
                {!loading && rows.length === 0 && <tr><td className="px-4 py-10 text-center text-gray-400">No products found.</td></tr>}
                {rows.map((r) => {
                  const isSel = !!selected[r.id];
                  return (
                    <tr key={r.id} className={`border-t ${isSel ? "bg-yellow-50/60" : "hover:bg-gray-50"}`}>
                      <td className="w-12 px-3 py-2">
                        {r.image && <Image src={r.image} alt="" width={36} height={36} className="h-9 w-9 rounded object-cover" unoptimized />}
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-semibold">{r.name}</p>
                        <p className="text-[10px] text-gray-400">{r.sku} · {r.brand?.name} · pack {r.packQty}{r.piecesPerBox ? ` · box ${r.piecesPerBox}` : ""}</p>
                      </td>
                      <td className="px-2 py-2 text-right text-[11px] text-gray-500">{UNIT_META[unit].label}: {formatINRmeta(meta.price(r))} / {meta.pieces(r)} pcs</td>
                      <td className="w-24 px-3 py-2 text-right">
                        <button
                          onClick={() => setSelected((s) => { const n = { ...s }; if (n[r.id]) delete n[r.id]; else n[r.id] = r; return n; })}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${isSel ? "bg-black text-yellow-400" : "border hover:border-yellow-400"}`}
                        >
                          {isSel ? (<><Check className="h-3 w-3" /> Added</>) : "Add"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* label preview sheet */}
        <div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs font-bold text-gray-700">Label Sheet Preview</p>
            <p className="mb-3 text-[11px] text-gray-400">{selCount * labelsPerProduct} labels · Code39 · print on label rolls or A4 stickers</p>
            {selCount === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-xs text-gray-400">Select products from the list to build the label sheet.</div>
            ) : (
              <div id="label-sheet" className="grid max-h-[56vh] grid-cols-2 gap-2 overflow-y-auto rounded-lg border-2 border-dashed border-yellow-400 p-2">
                {Object.values(selected).flatMap((r) =>
                  Array.from({ length: labelsPerProduct }).map((_, i) => (
                    <div key={`${r.id}-${i}`} className="rounded-md border border-gray-200 p-1.5 text-center">
                      <p className="truncate text-[9px] font-bold text-black">{r.name}</p>
                      <p className="text-[8px] text-gray-500">{r.sku}-{meta.suffix}{meta.pieces(r)} · {r.brand?.name}</p>
                      <div className="flex justify-center overflow-hidden"><Code39Svg value={`${r.sku}-${meta.suffix}${meta.pieces(r)}`} height={30} moduleWidth={1} /></div>
                      <p className="text-[9px] font-black">{formatINRmeta(meta.price(r))} <span className="font-normal text-gray-400">/ {meta.label.replace("Single ", "").toLowerCase()}</span></p>
                    </div>
                  ))
                )}
              </div>
            )}
            <button
              onClick={() => window.print()}
              disabled={selCount === 0}
              className="no-print mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-black py-2.5 text-xs font-bold uppercase text-yellow-400 hover:bg-gray-800 disabled:opacity-40"
            >
              <Printer className="h-4 w-4" /> Print {selCount * labelsPerProduct} Labels
            </button>
            <style>{`@media print { body * { visibility: hidden; } #label-sheet, #label-sheet * { visibility: visible; } #label-sheet { position: absolute; left: 0; top: 0; width: 100%; max-height: none !important; overflow: visible !important; border: none !important; } .no-print { display: none !important; } }`}</style>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatINRmeta(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
