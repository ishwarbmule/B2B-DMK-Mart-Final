/**
 * /admin/orders/[id]/barcodes?token=...&size=a4|50x25|50x38|40x30|30x20 —
 * printable barcode labels for a confirmed order, in STANDARD barcode-printer
 * formats:
 *  - a4   → A4 sticker sheet, 3-column grid (screen preview + full header)
 *  - 50x25 / 50x38 / 40x30 / 30x20 → THERMAL LABEL SIZES (one label per page,
 *    exact mm page size, zero margins) — prints edge-to-edge on a desktop
 *    barcode/label printer (50×25 mm is the standard one-hand label).
 * Each label: order serial no (SR, embedded in the scannable code) · product
 * name · qty · MRP/sale (roomy sizes) · Code39 barcode DMK<SR><invoice digits>
 * with proper quiet zones. Browser print → PDF or straight to the label roll.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/admin-auth";
import { PrintButton } from "@/components/admin/print-button";
import { istDate } from "@/lib/ist";

export const dynamic = "force-dynamic";

type LabelSize = "a4" | "50x25" | "50x38" | "40x30" | "30x20";

const SIZES: Record<Exclude<LabelSize, "a4">, { w: number; h: number; label: string }> = {
  "50x25": { w: 50, h: 25, label: "50 × 25 mm — standard dispatch label" },
  "50x38": { w: 50, h: 38, label: "50 × 38 mm — roomy label" },
  "40x30": { w: 40, h: 30, label: "40 × 30 mm — compact label" },
  "30x20": { w: 30, h: 20, label: "30 × 20 mm — micro label" },
};

const TOKEN_SIZES: LabelSize[] = ["a4", "50x25", "50x38", "40x30", "30x20"];

function inr(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default async function BarcodeSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; size?: string }>;
}) {
  const { token, size: sizeParam } = await searchParams;
  if (!verifyToken(token)) {
    return <p className="p-10 text-center text-sm text-red-500">Unauthorized — open from the admin Orders module.</p>;
  }
  const size: LabelSize = TOKEN_SIZES.includes(sizeParam as LabelSize) ? (sizeParam as LabelSize) : "a4";
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: { items: { orderBy: { serialNo: "asc" } } } });
  if (!order) notFound();

  const [firmName, firmPhone] = await Promise.all([
    db.setting.findUnique({ where: { key: "firm_name" } }),
    db.setting.findUnique({ where: { key: "firm_phone" } }),
  ]);
  const brand = firmName?.value || "DMK Mart";
  const phone = firmPhone?.value || "+91 93095 75173";
  const invoiceDigits = order.invoiceNo.replace(/[^0-9A-Z]/g, "").slice(-8);

  const thermal = size !== "a4";
  const dim = thermal ? SIZES[size as Exclude<LabelSize, "a4">] : null;

  const labels = order.items.map((it, i) => {
    const sr = it.serialNo || i + 1;
    const code = `DMK${String(sr).padStart(3, "0")}${invoiceDigits}`;
    return { it, sr, code };
  });

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
          <p className="text-[10px] text-gray-400">Thermal sizes print ONE label per page at exact mm — load the matching roll in your barcode printer. A4 = sticker sheet.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {TOKEN_SIZES.map((s) => (
            <Link
              key={s}
              href={`/admin/orders/${id}/barcodes?token=${encodeURIComponent(token || "")}&size=${s}`}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${s === size ? "bg-black text-yellow-400" : "border border-gray-300 bg-white text-gray-600 hover:border-yellow-400"}`}
            >
              {s === "a4" ? "A4 sheet" : `${SIZES[s as Exclude<LabelSize, "a4">].w}×${SIZES[s as Exclude<LabelSize, "a4">].h}`}
            </Link>
          ))}
          <PrintButton label="Print Labels" />
        </div>
      </div>

      {thermal ? (
        /* ── thermal labels — one per page, exact mm, edge-to-edge ── */
        <div>
          {labels.map(({ it, sr, code }) => (
            <div key={it.id} className="bc-label relative mx-auto flex flex-col justify-between overflow-hidden border border-dashed border-gray-300 print:border-0 print:border-none"
              style={{ width: `${dim!.w}mm`, height: `${dim!.h}mm`, padding: "1.2mm" }}>
              <div className="flex items-center justify-between" style={{ gap: "1mm" }}>
                <p className="font-black leading-tight" style={{ fontSize: dim!.w >= 50 ? "2.4mm" : "2.1mm", maxWidth: `${dim!.w - 14}mm` }}>
                  {it.name.length > 34 ? `${it.name.slice(0, 33)}…` : it.name}
                </p>
                <span className="shrink-0 rounded-sm bg-black font-black text-yellow-400" style={{ fontSize: "2mm", padding: "0.4mm 1mm" }}>
                  {String(sr).padStart(3, "0")}
                </span>
              </div>
              <div className="text-center" style={{ marginTop: "0.5mm" }}>
                <div style={{ width: `${dim!.w - 3}mm`, margin: "0 auto" }}>
                  <OrderBarcode value={code} height={dim!.h >= 30 ? 34 : 24} compact />
                </div>
                <p className="font-mono font-bold leading-none" style={{ fontSize: "1.9mm", marginTop: "0.4mm" }}>{code}</p>
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: "0.5mm" }}>
                <p className="font-semibold" style={{ fontSize: "1.9mm" }}>
                  {it.unitType === "SINGLE" ? "Pcs" : `Pack ${it.packQty}`} · Qty {it.qty}
                </p>
                {dim!.h >= 25 && (
                  <p className="font-bold" style={{ fontSize: "2mm" }}>MRP {inr(it.unitPrice)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── A4 sticker sheet ── */
        <>
          {/* order header label */}
          <div className="mb-4 rounded-xl border-2 border-black p-4 text-center">
            <p className="text-lg font-black">{brand} · {phone}</p>
            <p className="text-[11px] text-gray-600">ORDER {order.invoiceNo} · {order.customerName} · {order.phone} · {istDate(order.createdAt)}</p>
            <div className="mt-2 flex justify-center"><OrderBarcode value={`DMK${invoiceDigits}`} height={46} /></div>
            <p className="mt-1 font-mono text-[10px] font-bold">DMK{invoiceDigits}</p>
          </div>

          {/* per-line barcode cards — barcode TOP → name → qty/prices → firm footer */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 print:grid-cols-3 print:gap-2">
            {labels.map(({ it, sr, code }) => (
              <div key={it.id} className={`bc-card relative flex flex-col items-center justify-between gap-1 rounded-xl border-2 p-2.5 text-center ${it.lineStatus === "NEXT_PLAN" ? "border-dashed border-blue-400 bg-blue-50" : "border-black"}`}>
                {/* per-order serial number — prominent, one unique SR per product label */}
                <span className="absolute right-1.5 top-1.5 rounded bg-black px-1.5 py-0.5 text-[10px] font-black tracking-wide text-yellow-400">SR {String(sr).padStart(3, "0")}</span>
                {/* barcode at the top — code embeds the serial: DMK<SR 3-digit><invoice digits> */}
                <div className="mt-1 flex w-full justify-center px-2"><OrderBarcode value={code} height={44} /></div>
                {/* product name — larger, well-fonted */}
                <p className="line-clamp-2 min-h-[32px] text-[13px] font-black leading-tight">{it.name}</p>
                <p className="text-[9px] text-gray-500">{it.sku} · {it.unitType === "SINGLE" ? "Piece" : `Pack of ${it.packQty}`} · Qty {it.qty} · SR {sr}</p>
                {/* MRP + selling price — small */}
                <p className="text-[10px] font-semibold text-gray-700">
                  MRP <b>{inr(it.unitPrice > 0 ? it.unitPrice : 0)}</b>
                  <span className="mx-1 text-gray-400">·</span>
                  Sale <b className="text-[11px]">{inr(it.unitPrice)}</b>
                </p>
                {it.lineStatus === "NEXT_PLAN" && (
                  <p className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-black text-blue-700">NEXT DELIVERY{order.nextDeliveryAt ? ` · ${order.nextDeliveryAt}` : ""}</p>
                )}
                {/* firm identity — tiny, bottom center */}
                <p className="w-full border-t border-dashed border-gray-300 pt-1 text-[8px] font-bold uppercase tracking-wide text-gray-600">
                  {brand} · {phone}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-center text-[9px] text-gray-400">
            {brand} · {phone} · Scannable Code39 labels — order {order.invoiceNo} · generated {new Date().toLocaleString("en-IN")}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Inline Code39 SVG for the server component (self-contained, no deps).
 * `compact` drops the human-readable text (thermal labels print it separately),
 * `height` scales the bars; every label keeps a 10× module quiet zone per side
 * so real barcode scanners latch onto the symbol reliably.
 */
function OrderBarcode({ value, height = 44, compact = false }: { value: string; height?: number; compact?: boolean }) {
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
  const bits = raw.split("").map((c) => CODE39[c] || CODE39["-"]).join("0");
  const QUIET = 10; // quiet zone in modules (spec says ≥10)
  const mw = 1.7;
  const width = (bits.length + QUIET * 2) * mw;
  let x = QUIET * mw;
  const bars: Array<{ x: number; w: number }> = [];
  for (const b of bits) {
    if (b === "1") bars.push({ x, w: mw });
    x += mw;
  }
  const textH = compact ? 0 : 10;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height + textH}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Barcode ${value}`}>
      <rect width={width} height={height + textH} fill="#fff" />
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#111" />)}
      {!compact && (
        <text x={width / 2} y={height + textH - 1} textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#111">{raw.replaceAll("*", "")}</text>
      )}
    </svg>
  );
}
