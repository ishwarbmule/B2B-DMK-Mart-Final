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
