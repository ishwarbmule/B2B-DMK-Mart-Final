/**
 * Task 15 — DMK Mart pricing engine (shared by server routes and client UI).
 *
 * Business slabs (Customer.customerType → Product tier column):
 *   tier1 = Distributor · tier2 = Wholesale · tier3 = Semi-Wholesale · tier4 = Retailer
 *
 * Owner rules:
 *   - Logged-out visitors see WHOLESALE (tier2) piece prices.
 *   - Logged-in buyers see their own slab's piece price.
 *   - TWO rates on every product:
 *       Pickup   = actual per-PIECE slab price (buyer collects from nearest warehouse)
 *       Delivery = per-PACK price (packPrice when the admin set one, else piece × packQty × 0.94)
 *   - Pickup orders are billed at the flat piece rate (no pack discount),
 *     delivery orders use pack/case pricing.
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
 * PICKUP rate — flat per-piece slab price × pieces in the unit (no pack discount:
 * the buyer saves DMK Mart the delivery, the piece rate is the promise).
 */
export function pickupUnitPrice(p: TieredProduct, tier: string, unitType: string): number {
  const piece = piecePriceOf(p, tier);
  const ppu = piecesForUnit(unitType, p.packQty, p.piecesPerBox);
  return round2(piece * ppu);
}

/**
 * DELIVERY rate — pack-based pricing:
 *   SINGLE → per-piece slab price (deal override handled by the caller)
 *   PACK   → packPrice when admin set one, else piece × packQty × 0.94
 *   BULK   → piece × casePieces × 0.88
 */
export function deliveryUnitPrice(p: TieredProduct, tier: string, unitType: string): number {
  const piece = piecePriceOf(p, tier);
  if (unitType === "SINGLE") return round2(piece);
  if (unitType === "PACK") {
    if (p.packPrice && p.packPrice > 0) return round2(p.packPrice);
    return round2(piece * Math.max(1, p.packQty || 1) * 0.94);
  }
  const casePieces = piecesForUnit("BULK", p.packQty, p.piecesPerBox);
  return round2(piece * casePieces * 0.88);
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
