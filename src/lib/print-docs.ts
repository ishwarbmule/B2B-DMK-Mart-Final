/**
 * Shared helpers for the two print documents — A4 invoice & 80mm thermal estimate.
 *
 * Firm identity is hardcoded to the owner's real business data (exactly as in the
 * approved demo PDFs). Print stationery intentionally does NOT read the admin
 * Settings table, so the printed output always matches the real firm even if the
 * storefront settings hold older placeholder values.
 */
import QRCode from "qrcode";

export const FIRM = {
  name: "Jay Yogeshwar Enterprises",
  address: "Kolhar Bk Ahilyanagar Pin-413710",
  stateName: "Maharashtra",
  stateCode: "27",
  phone: "9309575173",
  bankHolder: "AMOL BALASAHEB WALKE",
  bankName: "HDFC Bank, KESNAND ROAD",
  bankAccount: "50100902797074",
  ifsc: "HDFC0001234",
  upi: "7219420014@hdfc",
} as const;

/** Demo date format — "29 Oct 2026". */
export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** 29710 → "29,710.00" — demo prints every number with 2 decimals, Indian grouping. */
export function num2(n: number): string {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const rest = n % 10;
  return TENS[Math.floor(n / 10)] + (rest ? ` ${ONES[rest]}` : "");
}

function upToThreeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let out = hundreds ? `${ONES[hundreds]} Hundred` : "";
  if (rest) out += (out ? " " : "") + twoDigits(rest);
  return out;
}

/** Indian-system words — 29710 → "Twenty Nine Thousand Seven Hundred Ten" (paise appended if any). */
export function amountInWords(amount: number): string {
  const abs = Math.abs(Number(amount) || 0);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero";

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${upToThreeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(upToThreeDigits(rest));

  let words = parts.join(" ");
  if (paise > 0) words += `${words ? " and " : ""}${twoDigits(paise)} Paise`;
  return words;
}

/** UPI intent QR as an inline SVG string (vector → crisp in print). */
export async function upiQrSvg(amount: number, note: string): Promise<string> {
  const uri =
    `upi://pay?pa=${encodeURIComponent(FIRM.upi)}` +
    `&pn=${encodeURIComponent(FIRM.name)}` +
    `&am=${Number(amount || 0).toFixed(2)}` +
    `&cu=INR` +
    (note ? `&tn=${encodeURIComponent(note)}` : "");
  return QRCode.toString(uri, { type: "svg", width: 240, margin: 0, errorCorrectionLevel: "M" });
}
