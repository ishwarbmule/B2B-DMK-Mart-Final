export { discountPct } from "@/lib/types";

/** Format a free-delivery threshold setting into a readable string. */
export function formatFree(v?: string): string {
  const n = Number(v);
  if (!v || Number.isNaN(n) || n <= 0) return "₹5,000";
  return `₹${n.toLocaleString("en-IN")}`;
}
