/**
 * DMK Mart pricing engine (shared by server routes and client UI).
 *
 * Business slabs (Customer.customerType → Product tier column):
 *   tier1 = Distributor · tier2 = Wholesale · tier3 = Semi-Wholesale · tier4 = Retailer
 *
 * Owner rules:
 *   - Logged-out visitors see WHOLESALE (tier2) piece prices.
 *   - Logged-in buyers see their own slab's piece price.
 *   - TWO rates on every product:
 *       Delivery = SINGLE-PIECE pricing (the flat slab piece rate — no pack economics)
 *       Pickup   = PACK rate (packPrice when the admin set one, else piece × packQty × 0.94 —
 *                  the buyer saves DMK Mart the delivery, wholesale pack economics is the promise)
 *   - Delivery orders bill the flat piece rate; pickup orders use pack pricing.
 *   - No GST anywhere: DMK Mart does not charge or provide GST.
 */

export const GUEST_TIER = "tier2"; // wholesale prices for logged-out visitors (owner rule)

export const TIER_LABEL: Record<string, string> = {
  tier1: "Distributor",
  tier2: "Wholesale",
  tier3: "Semi-Wholesale",
  tier4: "Retailer",
};

export type Fulfillment = "PICKUP" | "DELIVERY";

export interface TieredProduct {
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
  dealerPrice: number;
  packPrice?: number;
  packQty?: number;
  piecesPerBox?: number;
}

/** per-piece price for a slab (falls back to dealerPrice → tier4) */
export function piecePriceOf(p: TieredProduct, tier: string): number {
  if (tier === "tier1" && p.tier1 > 0) return p.tier1;
  if (tier === "tier2" && p.tier2 > 0) return p.tier2;
  if (tier === "tier3" && p.tier3 > 0) return p.tier3;
  if (tier === "tier4" && p.tier4 > 0) return p.tier4;
  return p.dealerPrice || p.tier4 || 0;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** pieces in one PACK / case unit */
export function piecesForUnit(unitType: string, packQty = 1, piecesPerBox = 0): number {
  if (unitType === "SINGLE") return 1;
  if (unitType === "PACK") return Math.max(1, packQty || 1);
  return Math.max(piecesPerBox || 0, (packQty || 1) * 4, 1);
}

/**
 * PICKUP rate — PACK pricing (wholesale economics; the buyer collects from the warehouse):
 *   SINGLE → per-piece pack rate: packPrice ÷ packQty when admin set one, else piece × 0.94
 *   PACK   → packPrice when admin set one, else piece × packQty × 0.94
 *   BULK   → piece × casePieces × 0.88 (legacy rows only — bulk cases are no longer offered)
 */
export function pickupUnitPrice(p: TieredProduct, tier: string, unitType: string): number {
  const piece = piecePriceOf(p, tier);
  if (unitType === "SINGLE") {
    if (p.packPrice && p.packPrice > 0 && (p.packQty || 0) > 0) return round2(p.packPrice / Math.max(1, p.packQty || 1));
    return round2(piece * 0.94);
  }
  if (unitType === "PACK") {
    if (p.packPrice && p.packPrice > 0) return round2(p.packPrice);
    return round2(piece * Math.max(1, p.packQty || 1) * 0.94);
  }
  const casePieces = piecesForUnit("BULK", p.packQty, p.piecesPerBox);
  return round2(piece * casePieces * 0.88);
}

/**
 * DELIVERY rate — SINGLE-PIECE pricing (flat slab piece rate, no pack economics):
 *   SINGLE → per-piece slab price (deal override handled by the caller)
 *   PACK   → piece × packQty
 *   BULK   → piece × casePieces (legacy rows only — bulk cases are no longer offered)
 */
export function deliveryUnitPrice(p: TieredProduct, tier: string, unitType: string): number {
  const piece = piecePriceOf(p, tier);
  if (unitType === "SINGLE") return round2(piece);
  if (unitType === "PACK") return round2(piece * Math.max(1, p.packQty || 1));
  const casePieces = piecesForUnit("BULK", p.packQty, p.piecesPerBox);
  return round2(piece * casePieces);
}

/** unit price for a line under a fulfillment mode */
export function unitPriceForLine(
  p: TieredProduct,
  tier: string,
  unitType: string,
  fulfillment: Fulfillment = "DELIVERY"
): number {
  return fulfillment === "PICKUP"
    ? pickupUnitPrice(p, tier, unitType)
    : deliveryUnitPrice(p, tier, unitType);
}

export const isFulfillment = (v: unknown): v is Fulfillment => v === "PICKUP" || v === "DELIVERY";
