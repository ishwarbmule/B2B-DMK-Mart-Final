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
 * The DMK Mart product label — OWNER SPEC, identical layout on every printer size,
 * everything centered:
 *   ┌───────────────────────┬───┐
 *   │       DMK Mart        │ S │
 *   │     [ BARCODE ]       │ R │  ← SR + SKU printed SIDEWAYS in the right strip
 *   │  ₹499   ₹599 (strike) │ · │  ← selling price BIG · MRP smaller, struck
 *   │  DMK Mart · +91 93…   │ 1 │  ← brand + phone at the bottom
 *   └───────────────────────┴───┘
 * Used by the Barcode Studio preview AND the order barcode print sheet.
 */
export function BarcodeLabel({
  value,
  name,
  sku,
  serialNo,
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
  sku?: string; // printed sideways with the serial number
  serialNo?: number; // per-order SR — printed sideways
  mrp: number;
  price: number;
  firmName?: string;
  firmPhone?: string;
  qtyLabel?: string; // e.g. "×2 pcs" on order sheets
  height?: number;
  moduleWidth?: number;
}) {
  const firm = "DMK Mart"; // owner rule: labels always carry the DMK Mart brand
  const strip = [serialNo ? `SR ${String(serialNo).padStart(3, "0")}` : "", sku || ""].filter(Boolean).join(" · ");
  return (
    <div className="flex overflow-hidden rounded-md border border-gray-300 bg-white leading-tight">
      <div className="flex min-w-0 flex-1 flex-col items-center justify-between gap-0.5 px-1.5 py-1.5 text-center">
        <p className="text-[12px] font-black uppercase tracking-wide">{firm}</p>
        <div className="flex w-full justify-center overflow-hidden">
          <Code39Svg value={value} height={height} moduleWidth={moduleWidth} showText />
        </div>
        <p className="flex items-baseline justify-center gap-1.5 leading-none">
          <span className="text-[15px] font-black text-gray-900">{inr(price)}</span>
          {mrp > price && <span className="text-[10px] font-medium text-gray-500 line-through">{inr(mrp)}</span>}
          {qtyLabel ? <span className="text-[9px] font-bold text-yellow-700">{qtyLabel}</span> : null}
        </p>
        <p className="w-full border-t border-dashed border-gray-300 pt-0.5 text-[8px] font-semibold uppercase tracking-wide text-gray-600">
          {firm}{firmPhone ? ` · ${firmPhone}` : ""}
        </p>
      </div>
      {strip && (
        <div className="flex w-[22px] shrink-0 items-center justify-center border-l border-dashed border-gray-400">
          <span className="whitespace-nowrap font-mono text-[8px] font-bold leading-none text-gray-700" style={{ writingMode: "vertical-rl" }}>
            {strip}
          </span>
        </div>
      )}
      {/* name kept for accessibility/tooltip only — the owner's label spec is brand+code+price+phone */}
      <span className="hidden">{name}</span>
    </div>
  );
}
