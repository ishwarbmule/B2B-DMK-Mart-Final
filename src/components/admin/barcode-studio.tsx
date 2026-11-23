"use client";

/**
 * Barcode Printing Studio — built for BARCODE PRINTERS (thermal label rolls),
 * with an A4 fallback for ordinary office printers.
 *
 *   · Label size presets: 50×25 / 50×38 / 40×30 / 30×20 mm (thermal rolls)
 *     and an A4 sheet grid for laser/inkjet.
 *   · Thermal mode emits one label per page at the exact roll dimensions
 *     (@page size in mm, no margins, 100 % scale) so the driver prints the
 *     roll correctly without scaling surprises.
 *   · Printer setup panel explains the 3 settings that matter: roll size,
 *     scale 100 %, margins none.
 */

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Check, Minus, Plus, Printer, RefreshCcw, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { BarcodeLabel } from "./barcode";

type Row = { id: string; sku: string; name: string; image: string; packQty: number; piecesPerBox: number; dealerPrice: number; mrp: number; brand: { name: string } };
type UnitType = "SINGLE" | "PACK" | "BULK";

type LabelPreset = {
  id: string;
  label: string;
  hint: string;
  mode: "THERMAL" | "A4";
  wMm: number; hMm: number;      // label size in mm
  cols: number;                   // grid columns (A4 only)
  barcodeHeight: number;          // svg height scaled for small labels
  moduleWidth: number;            // code39 module width — wide labels get wider bars
};

const LABEL_PRESETS: LabelPreset[] = [
  { id: "50x25", label: "50 × 25 mm", hint: "2\" × 1\" — the most common thermal roll", mode: "THERMAL", wMm: 50, hMm: 25, cols: 1, barcodeHeight: 22, moduleWidth: 0.9 },
  { id: "50x38", label: "50 × 38 mm", hint: "2\" × 1.5\" — roomy thermal label", mode: "THERMAL", wMm: 50, hMm: 38, cols: 1, barcodeHeight: 30, moduleWidth: 1 },
  { id: "40x30", label: "40 × 30 mm", hint: "compact thermal roll", mode: "THERMAL", wMm: 40, hMm: 30, cols: 1, barcodeHeight: 24, moduleWidth: 0.8 },
  { id: "30x20", label: "30 × 20 mm", hint: "small thermal roll — price-only spacing", mode: "THERMAL", wMm: 30, hMm: 20, cols: 1, barcodeHeight: 16, moduleWidth: 0.6 },
  { id: "a4", label: "A4 sheet (4 × 10)", hint: "office printer — 40 labels per A4 page", mode: "A4", wMm: 48, hMm: 27, cols: 4, barcodeHeight: 20, moduleWidth: 0.9 },
];

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
  const [firm, setFirm] = useState({ name: "DMK Mart", phone: "" });
  const [presetId, setPresetId] = useState("50x25");
  const [showSetup, setShowSetup] = useState(false);

  const preset = LABEL_PRESETS.find((p) => p.id === presetId) ?? LABEL_PRESETS[0];

  useEffect(() => {
    // label footer identity — firm name + phone from public site settings
    fetch("/api/site-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setFirm({ name: d.firmName || "DMK Mart", phone: d.firmPhone || "" }))
      .catch(() => {});
  }, []);

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
  const totalLabels = selCount * labelsPerProduct;

  /** Print CSS: thermal → one label per page at the roll's exact mm size;
   *  A4 → the grid as-is on plain paper. */
  const printCss = `
    @media print {
      body * { visibility: hidden; }
      #label-sheet, #label-sheet * { visibility: visible; }
      #label-sheet {
        position: absolute; left: 0; top: 0;
        max-height: none !important; overflow: visible !important;
        border: none !important;
        ${preset.mode === "THERMAL"
          ? `width: ${preset.wMm}mm; padding: 0; gap: 0; display: block;`
          : `width: 100%; padding: 4mm;`}
      }
      ${preset.mode === "THERMAL"
        ? `#label-sheet .label-cell { width: ${preset.wMm}mm; height: ${preset.hMm}mm; break-after: page; page-break-after: always; box-sizing: border-box; border: none !important; border-radius: 0 !important; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
           #label-sheet .label-cell:last-child { break-after: auto; page-break-after: auto; }
           @page { size: ${preset.wMm}mm ${preset.hMm}mm; margin: 0; }`
        : `#label-sheet .label-cell { box-sizing: border-box; }
           @page { size: A4; margin: 0; }`}
      .no-print { display: none !important; }
    }`;

  return (
    <div>
      <ModuleHeader title="Barcode Printing Studio" sub="Print product barcodes on a barcode (label) printer — pick the roll size, select products and print. A4 sheet mode works on office printers too.">
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
        <button onClick={() => setShowSetup((s) => !s)} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50">
          <Settings2 className="h-3.5 w-3.5" /> Printer setup
        </button>
      </ModuleHeader>

      {/* printer setup guidance — shown on demand */}
      {showSetup && (
        <div className="mb-4 rounded-xl border-2 border-yellow-300 bg-yellow-50 p-4 text-[12px] leading-relaxed text-gray-700">
          <p className="mb-2 text-sm font-bold text-gray-900">Barcode printer setup (one time)</p>
          <ol className="mb-2 list-decimal space-y-1 pl-5">
            <li><b>Connect the label printer</b> (USB) and install its driver — TSC TE244 / TDP-225, Zebra ZD220/230, Xprinter 365B all work. No driver needed for A4 mode.</li>
            <li><b>Load a label roll</b> that matches the size chosen below (e.g. 50 × 25 mm) — the size is printed on the roll box.</li>
            <li>Press <b>Print Labels</b> → in the browser print dialog pick your <b>label printer</b>.</li>
            <li>Set <b>Scale = 100 %</b> (never "fit to page"), <b>Margins = None</b>, <b>Headers/footers = Off</b>, and paper size = the same label size.</li>
            <li>Print one test label first; if it drifts sideways, run the printer's own <b>feed calibration</b> (hold the feed button ~3 s).</li>
          </ol>
          <p className="text-[11px] text-gray-500">Thermal sizes print one label per page at the exact roll dimensions, so whatever lands on the roll matches the preview. For A4 stickers choose the A4 sheet mode.</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
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
              <span className="w-8 text-center text-xs font-semibold">{labelsPerProduct}</span>
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
          {/* label size + printer mode */}
          <div className="mb-3 rounded-xl border bg-white p-4">
            <p className="text-xs font-bold text-gray-700">Label roll size</p>
            <p className="mb-2 text-[11px] text-gray-400">Match the roll loaded in your barcode printer (size is printed on the roll box)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {LABEL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  title={p.hint}
                  className={`rounded-lg border px-2 py-2 text-left text-[11px] font-bold transition-colors ${presetId === p.id ? "border-black bg-black text-yellow-400" : "border-gray-200 bg-white text-gray-700 hover:border-yellow-400"}`}
                >
                  {p.label}
                  <span className={`block text-[9px] font-medium ${presetId === p.id ? "text-yellow-200" : "text-gray-400"}`}>{p.mode === "THERMAL" ? "barcode printer" : "A4 office printer"}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-gray-500">{preset.hint}</p>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs font-bold text-gray-700">Label Sheet Preview</p>
            <p className="mb-3 text-[11px] text-gray-400">
              {totalLabels} labels · {preset.label} · Code39 · barcode top · name · MRP &amp; sale price · DMK Mart footer
            </p>
            {selCount === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-xs text-gray-400">Select products from the list to build the label sheet.</div>
            ) : (
              <div
                id="label-sheet"
                className={`grid max-h-[52vh] gap-2 overflow-y-auto rounded-lg border-2 border-dashed border-yellow-400 p-2 ${preset.mode === "THERMAL" ? "grid-cols-1" : `grid-cols-4`}`}
                style={preset.mode === "THERMAL" ? { width: `${preset.wMm + 8}mm`, margin: "0 auto" } : undefined}
              >
                {Object.values(selected).flatMap((r) =>
                  Array.from({ length: labelsPerProduct }).map((_, i) => (
                    <div key={`${r.id}-${i}`} className="label-cell">
                      <BarcodeLabel
                        value={`${r.sku}-${meta.suffix}${meta.pieces(r)}`}
                        name={r.name}
                        mrp={r.mrp}
                        price={meta.price(r)}
                        firmName={firm.name}
                        firmPhone={firm.phone}
                        height={preset.barcodeHeight}
                        moduleWidth={preset.moduleWidth}
                      />
                    </div>
                  ))
                )}
              </div>
            )}
            <button
              onClick={() => window.print()}
              disabled={selCount === 0}
              className="no-print mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-black py-2.5 text-xs font-bold uppercase text-yellow-400 hover:bg-gray-800 disabled:opacity-40"
            >
              <Printer className="h-4 w-4" /> Print {totalLabels} Labels — {preset.mode === "THERMAL" ? "barcode printer" : "A4 sheet"}
            </button>
            <style>{printCss}</style>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatINRmeta(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
