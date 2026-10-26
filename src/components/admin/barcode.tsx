"use client";

/** Minimal Code39 barcode SVG generator (self-contained, no deps) */
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
  "-": "100101011011", ".": "110010101101", " ": "100110101101", "*": "100101101101",
};

export function Code39Svg({ value, height = 44, moduleWidth = 1.6, showText = true }: {
  value: string; height?: number; moduleWidth?: number; showText?: boolean;
}) {
  const raw = `*${(value || "0000").toUpperCase().replace(/[^0-9A-Z\-. ]/g, "")}*`;
  const bits = raw.split("").map((c) => CODE39[c] || CODE39["-"]).join("0"); // inter-char gap
  const width = bits.length * moduleWidth;
  let x = 0;
  const bars: { x: number; w: number }[] = [];
  for (const b of bits) {
    if (b === "1") bars.push({ x, w: moduleWidth });
    x += moduleWidth;
  }
  return (
    <svg width={width} height={height + (showText ? 14 : 0)} viewBox={`0 0 ${width} ${height + (showText ? 14 : 0)}`} role="img" aria-label={`Barcode ${value}`}>
      <rect width={width} height={height + (showText ? 14 : 0)} fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#111" />
      ))}
      {showText && (
        <text x={width / 2} y={height + 11} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#111">
          {raw.replaceAll("*", "")}
        </text>
      )}
    </svg>
  );
}

const inr = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Task 15 — the DMK Mart product label, print-grade structure:
 *   ┌────────────────────────┐
 *   │      [ BARCODE ]       │  ← barcode at the TOP
 *   │   DMK0017-SP1          │  ← machine code, small mono
 *   │  Product Name Here     │  ← product name, larger & well-fonted
 *   │  MRP ₹199 · Sale ₹149  │  ← MRP + selling price, small
 *   │  DMK Mart · 98765 43210│  ← firm name + phone, tiny, bottom center
 *   └────────────────────────┘
 * Used by the Barcode Studio preview AND the order barcode print sheet.
 */
export function BarcodeLabel({
  value,
  name,
  mrp,
  price,
  firmName = "DMK Mart",
  firmPhone = "",
  qtyLabel = "",
  height = 34,
  moduleWidth = 1,
}: {
  value: string;
  name: string;
  mrp: number;
  price: number;
  firmName?: string;
  firmPhone?: string;
  qtyLabel?: string; // e.g. "×2 pcs" on order sheets
  height?: number;
  moduleWidth?: number;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-0.5 rounded-md border border-gray-300 bg-white px-1.5 py-1.5 text-center leading-tight">
      {/* barcode at the top */}
      <div className="flex w-full justify-center overflow-hidden">
        <Code39Svg value={value} height={height} moduleWidth={moduleWidth} showText />
      </div>
      {/* product name — larger, well-fonted */}
      <p className="line-clamp-2 min-h-[26px] w-full px-0.5 text-[11px] font-bold leading-snug text-gray-900">
        {name}
      </p>
      {/* MRP + selling price — small */}
      <p className="w-full text-[9px] font-semibold text-gray-700">
        MRP {inr(mrp)} <span className="mx-0.5 text-gray-400">·</span>{" "}
        <span className="font-black text-gray-900">Sale {inr(price)}</span>
        {qtyLabel ? <span className="ml-1 font-bold text-yellow-700">{qtyLabel}</span> : null}
      </p>
      {/* firm identity — tiny, bottom center */}
      <p className="w-full border-t border-dashed border-gray-300 pt-0.5 text-[7.5px] font-medium uppercase tracking-wide text-gray-500">
        {firmName}{firmPhone ? ` · ${firmPhone}` : ""}
      </p>
    </div>
  );
}
