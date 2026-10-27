/**
 * /admin/orders/[id]/barcodes?token=... — printable barcode sheet for a confirmed order.
 * Each card: order serial no (SR badge + embedded in the scannable code) · product name · MRP ·
 * selling price · Code39 barcode (DMK-<serial>-<invoice digits>) · qty. Browser print → PDF.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/admin-auth";
import { PrintButton } from "@/components/admin/print-button";

export const dynamic = "force-dynamic";

function inr(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default async function BarcodeSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!verifyToken(token)) {
    return <p className="p-10 text-center text-sm text-red-500">Unauthorized — open from the admin Orders module.</p>;
  }
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: { items: { orderBy: { serialNo: "asc" } } } });
  if (!order) notFound();

  const [firmName, firmPhone] = await Promise.all([
    db.setting.findUnique({ where: { key: "firm_name" } }),
    db.setting.findUnique({ where: { key: "firm_phone" } }),
  ]);
  const brand = firmName?.value || "DMK Mart";
  const phone = firmPhone?.value || "+91 98220 12345";
  const invoiceDigits = order.invoiceNo.replace(/[^0-9A-Z]/g, "").slice(-8);

  return (
    <div className="mx-auto max-w-[900px] bg-white p-5 print:p-0">
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .bc-card { page-break-inside: avoid; }
        }
        @media screen { body { background: #e5e7eb; padding: 20px 0; } }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-gray-500">Order barcode sheet · {order.invoiceNo} · {order.items.length} labels</p>
          <p className="text-[10px] text-gray-400">Print → PDF or label sheets. Scan format: Code39 (works with any barcode scanner / AI scanner tool).</p>
        </div>
        <PrintButton label="Print Barcode Sheet" />
      </div>

      {/* order header label */}
      <div className="mb-4 rounded-xl border-2 border-black p-4 text-center">
        <p className="text-lg font-black">{brand} · {phone}</p>
        <p className="text-[11px] text-gray-600">ORDER {order.invoiceNo} · {order.customerName} · {order.phone} · {new Date(order.createdAt).toLocaleDateString("en-IN")}</p>
        <div className="mt-2 flex justify-center"><OrderBarcode value={`DMK${invoiceDigits}`} /></div>
        <p className="mt-1 font-mono text-[10px] font-bold">DMK{invoiceDigits}</p>
      </div>

      {/* per-line barcode cards — Task 15 structure: barcode TOP → name → MRP & sale → firm footer */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 print:grid-cols-3 print:gap-2">
        {order.items.map((it, i) => {
          const sr = it.serialNo || i + 1;
          const code = `DMK${String(sr).padStart(3, "0")}${invoiceDigits}`;
          return (
            <div key={it.id} className={`bc-card relative flex flex-col items-center justify-between gap-1 rounded-xl border-2 p-2.5 text-center ${it.lineStatus === "NEXT_PLAN" ? "border-dashed border-blue-400 bg-blue-50" : "border-black"}`}>
              {/* per-order serial number — prominent, one unique SR per product label */}
              <span className="absolute right-1.5 top-1.5 rounded bg-black px-1.5 py-0.5 text-[10px] font-black tracking-wide text-yellow-400">SR {String(sr).padStart(3, "0")}</span>
              {/* barcode at the top — code embeds the serial: DMK<SR 3-digit><invoice digits> */}
              <div className="flex justify-center"><OrderBarcode value={code} /></div>
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
          );
        })}
      </div>

      <p className="mt-4 text-center text-[9px] text-gray-400">
        {brand} · {phone} · Scannable Code39 labels — order {order.invoiceNo} · generated {new Date().toLocaleString("en-IN")}
      </p>
    </div>
  );
}

/** Inline Code39 SVG for the server component (self-contained, no deps). */
function OrderBarcode({ value }: { value: string }) {
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
  const mw = 1.7;
  const width = bits.length * mw;
  let x = 0;
  const bars: Array<{ x: number; w: number }> = [];
  for (const b of bits) {
    if (b === "1") bars.push({ x, w: mw });
    x += mw;
  }
  return (
    <svg width={width} height={46} viewBox={`0 0 ${width} 46`} role="img" aria-label={`Barcode ${value}`}>
      <rect width={width} height={46} fill="#fff" />
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="#111" />)}
      <text x={width / 2} y={45} textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#111">{raw.replaceAll("*", "")}</text>
    </svg>
  );
}
