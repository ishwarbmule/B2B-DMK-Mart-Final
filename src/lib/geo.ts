/**
 * Task 15 — nearest-warehouse ranking from the buyer's profile location.
 * No GPS required: city match beats pincode-region match beats the rest.
 * Score 0 = same city · 1 = same pincode region (first 2 digits) · 2 = elsewhere.
 */
export interface RankableWarehouse {
  city?: string | null;
  address?: string | null;
  isDefault?: boolean;
  sortOrder?: number;
}

export function warehouseScore(wh: RankableWarehouse, city?: string | null, pincode?: string | null): number {
  const whCity = (wh.city || "").trim().toLowerCase();
  const cCity = (city || "").trim().toLowerCase();
  if (cCity && whCity && whCity === cCity) return 0;
  const pin = (pincode || "").replace(/\D/g, "");
  // address often ends with the pincode — try to read it from there
  const whPin = ((wh.address || "").match(/\b(\d{6})\b/) || [])[1] || "";
  if (pin.length === 6 && whPin.length === 6 && pin.slice(0, 2) === whPin.slice(0, 2)) return 1;
  return 2;
}

/** warehouses ordered nearest-first for a buyer (default warehouse wins ties) */
export function rankWarehouses<T extends RankableWarehouse>(whs: T[], city?: string | null, pincode?: string | null): T[] {
  return [...whs].sort((a, b) => {
    const sa = warehouseScore(a, city, pincode);
    const sb = warehouseScore(b, city, pincode);
    if (sa !== sb) return sa - sb;
    if (!!b.isDefault !== !!a.isDefault) return b.isDefault ? 1 : -1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

/** true when the buyer's profile location is close enough to badge "Nearest" */
export function isNearestForBuyer(wh: RankableWarehouse, city?: string | null, pincode?: string | null): boolean {
  return warehouseScore(wh, city, pincode) < 2;
}
