/**
 * /admin/orders/[id]/barcodes?token=...&size=a4|50x25|50x38|40x30|30x20&xd=0.25|0.375|0.5 —
 * printable barcode labels for a confirmed order, in STANDARD barcode-printer
 * formats:
 *  - a4   → A4 sticker sheet, 3-column grid (order header + per-line labels)
 *  - 50x25 / 50x38 / 40x30 / 30x20 → THERMAL LABEL SIZES (one label per page,
 *    exact mm page size, zero margins) — prints edge-to-edge on a desktop
 *    barcode/label printer (50×25 mm is the standard one-hand label).
 *  - xd   → X-DIMENSION (narrow bar width) in mm: 0.25mm = 300dpi printers,
 *    0.375mm = 203dpi desktop printers (3 printer dots), 0.5mm = coarse/handheld
 *    scans. The SVG is drawn 1:1 in REAL millimetres (no browser scaling) and
 *    auto-shrinks its X-dimension to fit narrow labels while staying crisp.
 *
 * OWNER'S LABEL SPEC — identical layout on every printer size, all centered:
 *   1. "DMK Mart"                       (brand at top)
 *   2. the barcode
 *   3. SKU + order serial no (SR)       (printed SIDEWAYS in a right-edge strip)
 *   4. selling price (big) beside MRP   (smaller, strikethrough)
 *   5. "DMK Mart" phone number          (bottom)
 * Browser print → PDF or straight to the label roll.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/admin-auth";
import { PrintButton } from "@/components/admin/print-button";
import { istDateTime } from "@/lib/ist";

export const dynamic = "force-dynamic";

type LabelSize = "a4" | "50x25" | "50x38" | "40x30" | "30x20";

const SIZES: Record<Exclude<LabelSize, "a4">, { w: number; h: number; label: string }> = {
  "50x25": { w: 50, h: 25, label: "50 × 25 mm — standard dispatch label" },
  "50x38": { w: 50, h: 38, label: "50 × 38 mm — roomy label" },
  "40x30": { w: 40, h: 30, label: "40 × 30 mm — compact label" },
  "30x20": { w: 30, h: 20, label: "30 × 20 mm — micro label" },
};

const TOKEN_SIZES: LabelSize[] = ["a4", "50x25", "50x38", "40x30", "30x20"];

/** X-dimension (narrow bar width) options in mm — thermal-printer dots friendly */
const XD_OPTIONS = [0.25, 0.375, 0.5] as const;
type XD = (typeof XD_OPTIONS)[number];
function parseXD(raw?: string): XD {
  const v = Number(raw);
  return (XD_OPTIONS as readonly number[]).includes(v) ? (v as XD) : 0.375;
}

function inr(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** per-size type scale so the SAME layout works from 30×20 micro to 50×38 roomy */
const THERMAL_STYLE: Record<Exclude<LabelSize, "a4">, { brand: number; bar: number; sale: number; mrp: number; phone: number; strip: number }> = {
  "50x25": { brand: 2.7, bar: 8, sale: 3.2, mrp: 2.1, phone: 1.9, strip: 1.7 },
  "50x38": { brand: 3.3, bar: 12, sale: 4.2, mrp: 2.6, phone: 2.3, strip: 1.9 },
  "40x30": { brand: 2.8, bar: 10, sale: 3.6, mrp: 2.3, phone: 2.0, strip: 1.8 },
  "30x20": { brand: 2.3, bar: 6, sale: 2.7, mrp: 1.8, phone: 1.6, strip: 1.5 },
};

export default async function BarcodeSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; size?: string; xd?: string }>;
}) {
  const { token, size: sizeParam, xd: xdParam } = await searchParams;
  if (!verifyToken(token)) {
    return <p className="p-10 text-center text-sm text-red-500">Unauthorized — open from the admin Orders module.</p>;
  }
  const size: LabelSize = TOKEN_SIZES.includes(sizeParam as LabelSize) ? (sizeParam as LabelSize) : "a4";
  const xd = parseXD(xdParam);
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: { items: { orderBy: { serialNo: "asc" } } } });
  if (!order) notFound();

  const firmPhoneSetting = await db.setting.findUnique({ where: { key: "firm_phone" } });
  // OWNER RULE: barcode labels always carry the DMK Mart brand + DMK Mart phone
  // (never any ERP firm name)
  const brand = "DMK Mart";
  const phone = firmPhoneSetting?.value || "+91 93095 75173";
  const invoiceDigits = order.invoiceNo.replace(/[^0-9A-Z]/g, "").slice(-8);

  // MRP for the strikethrough price — snapshotted from the product catalog
  const productIds = [...new Set(order.items.map((it) => it.productId))];
  const mrpRows = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, mrp: true } });
  const mrpById = new Map(mrpRows.map((p) => [p.id, p.mrp]));

  const thermal = size !== "a4";
  const dim = thermal ? SIZES[size as Exclude<LabelSize, "a4">] : null;
  const ts = thermal ? THERMAL_STYLE[size as Exclude<LabelSize, "a4">] : null;

  const labels = order.items.map((it, i) => {
    const sr = it.serialNo || i + 1;
    const code = `DMK${String(sr).padStart(3, "0")}${invoiceDigits}`;
    return { it, sr, code, mrp: mrpById.get(it.productId) ?? 0 };
  });

  /** width available for the barcode inside a thermal label (mm):
   *  label − padding − right sideways strip − small gaps */
  const barFitMm = thermal ? dim!.w - 2 * 1.2 - 6.2 - 1.2 : 60;

  return (
    <div className={thermal ? "bg-white" : "mx-auto max-w-[900px] bg-white p-5 print:p-0"}>
      <style>{`
        ${thermal
          ? `@page { size: ${dim!.w}mm ${dim!.h}mm; margin: 0; }
             @media print {
               html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
               .no-print { display: none !important; }
               .bc-label { break-after: page; width: ${dim!.w}mm; height: ${dim!.h}mm; overflow: hidden; }
               .bc-label:last-child { break-after: auto; }
             }`
          : `@page { size: A4; margin: 10mm; }
             @media print {
               .no-print { display: none !important; }
               body { background: #fff; }
               .bc-card { page-break-inside: avoid; }
             }
             @media screen { body { background: #e5e7eb; padding: 20px 0; } }`}
      `}</style>

      {/* size switcher + print (screen only) */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
        <div>
          <p className="text-xs font-bold text-gray-700">Barcode labels · {order.invoiceNo} · {order.items.length} labels · format <b>{size === "a4" ? "A4 sheet" : `${dim!.w}×${dim!.h} mm thermal`}</b></p>
          <p className="text-[10px] text-gray-400">Every label: DMK Mart → barcode → SKU + SR (sideways) → selling price + MRP → DMK Mart phone. Same layout on all sizes, centered.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {TOKEN_SIZES.map((s) => (
            <Link
              key={s}
              href={`/admin/orders/${id}/barcodes?token=${encodeURIComponent(token || "")}&size=${s}&xd=${xd}`}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${s === size ? "bg-black text-yellow-400" : "border border-gray-300 bg-white text-gray-600 hover:border-yellow-400"}`}
            >
              {s === "a4" ? "A4 sheet" : `${SIZES[s as Exclude<LabelSize, "a4">].w}×${SIZES[s as Exclude<LabelSize, "a4">].h}`}
            </Link>
          ))}
          {thermal && (
            <>
              <span className="ml-1 text-[10px] font-bold text-gray-400">X-dim:</span>
              {XD_OPTIONS.map((x) => (
                <Link
                  key={x}
                  href={`/admin/orders/${id}/barcodes?token=${encodeURIComponent(token || "")}&size=${size}&xd=${x}`}
                  title={x === 0.25 ? "300 dpi printers" : x === 0.375 ? "203 dpi desktop thermal (3 dots)" : "coarse / handheld scans"}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${x === xd ? "bg-yellow-400 text-black" : "border border-gray-300 bg-white text-gray-600 hover:border-yellow-400"}`}
                >
                  {x}mm
                </Link>
              ))}
            </>
          )}
          <PrintButton label="Print Labels" />
        </div>
      </div>

      {thermal ? (
        /* ── thermal labels — one per page, exact mm, edge-to-edge, all centered ── */
        <div>
          {labels.map(({ it, sr, code, mrp }) => (
            <div key={it.id} className="bc-label relative mx-auto flex overflow-hidden border border-dashed border-gray-300 print:border-0 print:border-none"
              style={{ width: `${dim!.w}mm`, height: `${dim!.h}mm`, padding: "1.2mm", gap: "0.8mm" }}>
              {/* main centered column: brand → barcode → price+MRP → phone */}
              <div className="flex min-w-0 flex-1 flex-col items-center justify-between text-center">
                <p className="font-black uppercase leading-none tracking-wide" style={{ fontSize: `${ts!.brand}mm` }}>{brand}</p>
                <div className="flex justify-center" style={{ marginTop: "0.4mm" }}>
                  <OrderBarcode value={code} xd={xd} barHeightMm={ts!.bar} compact fitMm={barFitMm} />
                </div>
                {/* selling price big · MRP smaller with strikethrough */}
                <p className="flex items-baseline justify-center gap-1 leading-none" style={{ marginTop: "0.4mm" }}>
                  <span className="font-black" style={{ fontSize: `${ts!.sale}mm` }}>{inr(it.unitPrice)}</span>
                  {mrp > it.unitPrice && (
                    <span className="font-medium text-gray-500 line-through" style={{ fontSize: `${ts!.mrp}mm` }}>{inr(mrp)}</span>
                  )}
                </p>
                <p className="font-semibold leading-none" style={{ fontSize: `${ts!.phone}mm`, marginTop: "0.4mm" }}>{brand} {phone}</p>
              </div>
              {/* sideways strip: SKU + order serial number (SR) — reads top→bottom */}
              <div className="flex shrink-0 items-center justify-center border-l border-dashed border-gray-400 print:border-gray-400" style={{ width: "5.4mm" }}>
                <span
                  className="whitespace-nowrap font-mono font-bold leading-none text-gray-800"
                  style={{ writingMode: "vertical-rl", fontSize: `${ts!.strip}mm` }}
                >
                  SR {String(sr).padStart(3, "0")} · {it.sku}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── A4 sticker sheet — order header + per-line labels in the SAME layout ── */
        <>
          {/* order header label */}
          <div className="mb-4 rounded-xl border-2 border-black p-4 text-center">
            <p className="text-lg font-black uppercase">{brand} · {phone}</p>
            <p className="text-[11px] text-gray-600">ORDER {order.invoiceNo} · {order.customerName} · {order.phone} · {order.items.length} labels</p>
            <div className="mt-2 flex justify-center"><OrderBarcode value={`DMK${invoiceDigits}`} xd={xd} barHeightMm={12} /></div>
          </div>

          {/* per-line labels — identical layout to the thermal rolls, centered */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 print:grid-cols-3 print:gap-2">
            {labels.map(({ it, sr, code, mrp }) => (
              <div key={it.id} className={`bc-card relative flex overflow-hidden rounded-xl border-2 ${it.lineStatus === "NEXT_PLAN" ? "border-dashed border-blue-400 bg-blue-50" : "border-black"}`}>
                <div className="flex min-w-0 flex-1 flex-col items-center justify-between gap-0.5 p-2 text-center">
                  <p className="text-[13px] font-black uppercase tracking-wide">{brand}</p>
                  <div className="flex w-full justify-center px-1"><OrderBarcode value={code} xd={xd} barHeightMm={10} compact fitMm={54} /></div>
                  <p className="flex items-baseline justify-center gap-1.5 leading-none">
                    <span className="text-[15px] font-black">{inr(it.unitPrice)}</span>
                    {mrp > it.unitPrice && <span className="text-[10px] font-medium text-gray-500 line-through">{inr(mrp)}</span>}
                  </p>
                  <p className="text-[9px] font-semibold">{brand} {phone}</p>
                  {it.lineStatus === "NEXT_PLAN" && (
                    <p className="rounded bg-blue-100 px-1.5 py-0.5 text-[8px] font-black text-blue-700">NEXT DELIVERY{order.nextDeliveryAt ? ` · ${order.nextDeliveryAt}` : ""}</p>
                  )}
                </div>
                {/* sideways strip: SKU + order serial (SR) */}
                <div className="flex w-[9mm] shrink-0 items-center justify-center border-l border-dashed border-gray-400">
                  <span className="whitespace-nowrap font-mono text-[9px] font-bold leading-none text-gray-800" style={{ writingMode: "vertical-rl" }}>
                    SR {String(sr).padStart(3, "0")} · {it.sku}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-center text-[9px] text-gray-400">
            {brand} · {phone} · Scannable Code39 labels — order {order.invoiceNo} · generated {istDateTime(new Date())}
          </p>
        </>
      )}
    </div>
  );
}


/**
 * Inline Code39 SVG for the server component (self-contained, no deps) —
 * THERMAL-PRINTER SPEC: the symbol is drawn 1:1 in REAL millimetres.
 *   xd          X-dimension (narrow bar width) in mm — 0.25 / 0.375 / 0.5.
 *               0.375mm = exactly 3 dots on a 203dpi desktop thermal printer,
 *               0.25mm = 3 dots at 300dpi — bars land on whole printer dots.
 *   barHeightMm bar height in mm (>=6mm so handheld laser scanners read it).
 *   fitMm       optional max width in mm — when the symbol would overflow the
 *               label the X-dimension shrinks so the WHOLE symbol still prints
 *               1:1 crisp (no browser px scaling).
 * The 12-bit per-char patterns are run-length encodings ("11" = wide element,
 * 2 modules -> 2:1 wide:narrow, inside the Code39 spec's 2:1-3:1 ratio range).
 * Every label keeps a >=10x module quiet zone per side.
 */
function OrderBarcode({ value, xd, barHeightMm = 10, compact = false, fitMm }: { value: string; xd: number; barHeightMm?: number; compact?: boolean; fitMm?: number }) {
  const CODE39: Record<string, string> = {
    "0": "101001101101", "1": "110100101011", "2": "101100101011", "3": "110110010101",
    "4": "101001101011", "5": "110100110101", "6": "101100110101", "7": "101001011011",
    "8": "110100101101", "9": "101100101101", A: "110101001011", B: "101101001011",
    C: "110110100101", D: "101011001011", E: "110101100101", F: "101101100101",
    G: "101010011011", H: "110101001101", I: "101101001101", J: "101011001101",
    K: "110101010011", L: "101101010011", M: "110110101001", N: "101011010011",
    O: "110101101001", P: "101101101001", Q: "101010110011", R: "110101011001",
    S: "101101011001", T: "101011011001", U: "110010101011", V: "100110101011",
    W: "110011010101", X: "100101101011", Y: "110010110101", Z: "100110110101",
    "-": "100101011011",
  };
  const raw = `*${value.replace(/[^0-9A-Z-]/g, "")}*`;
  // whole symbol as a run-length stream: char patterns joined by a 1-module
  // inter-character gap; runs of identical bits = elements (width = run length)
  const bits = raw.split("").map((c) => CODE39[c] || CODE39["-"]).join("0");
  const QUIET = 10; // quiet zone in modules (spec: >=10x)
  const totalModules = QUIET * 2 + bits.length;
  // auto-fit: shrink the X-dimension so the full symbol (quiet zones included)
  // fits the available label width while every bar stays 1:1 mm on paper
  const effXd = fitMm && totalModules * xd > fitMm ? fitMm / totalModules : xd;
  const runs: Array<{ x: number; w: number }> = [];
  let cursor = QUIET;
  let i = 0;
  while (i < bits.length) {
    let j = i;
    while (j < bits.length && bits[j] === bits[i]) j++;
    if (bits[i] === "1") runs.push({ x: cursor, w: j - i });
    cursor += j - i;
    i = j;
  }
  const widthMm = totalModules * effXd;
  const textMm = compact ? 0 : 3.2;
  const heightMm = barHeightMm + textMm;
  return (
    <svg
      width={`${widthMm}mm`}
      height={`${heightMm}mm`}
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      role="img"
      aria-label={`Barcode ${value}`}
      style={{ display: "block" }}
    >
      <rect width={widthMm} height={heightMm} fill="#fff" />
      {runs.map((r, k) => (
        <rect key={k} x={r.x * effXd} y={0} width={r.w * effXd} height={barHeightMm} fill="#000" />
      ))}
      {!compact && (
        <text
          x={widthMm / 2}
          y={heightMm - 0.4}
          textAnchor="middle"
          fontSize="2.4"
          fontFamily="monospace"
          fill="#000"
        >
          {raw.replaceAll("*", "")}
        </text>
      )}
    </svg>
  );
}
