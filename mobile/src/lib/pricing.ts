/**
 * Client pricing engine — a direct port of the website's src/lib/pricing.ts
 * so the app shows the exact same prices as the website (server re-checks
 * every line at order time; the response `bill` is authoritative).
 */
import type { ApiProduct } from "./api";

export type TieredProduct = {
  tier1?: number;
  tier2?: number;
  tier3?: number;
  tier4?: number;
  tier5?: number;
  dealerPrice?: number;
  deliveryRate?: number;
  packPrice?: number;
  packQty?: number;
  piecesPerBox?: number;
  locPrice?: { dealerPrice?: number; deliveryRate?: number } | null;
};

export type Fulfillment = "PICKUP" | "DELIVERY";

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const formatINR = (n: number) => {
  const v = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

/** per-piece price for a slab; a buyer-city override (locPrice) wins over every slab */
export function piecePriceOf(p: TieredProduct, tier: string): number {
  if (p.locPrice?.dealerPrice && p.locPrice.dealerPrice > 0) return p.locPrice.dealerPrice;
  if (tier === "tier1" && (p.tier1 ?? 0) > 0) return p.tier1 as number;
  if (tier === "tier2" && (p.tier2 ?? 0) > 0) return p.tier2 as number;
  if (tier === "tier3" && (p.tier3 ?? 0) > 0) return p.tier3 as number;
  if (tier === "tier4" && (p.tier4 ?? 0) > 0) return p.tier4 as number;
  if (tier === "tier5" && (p.tier5 ?? 0) > 0) return p.tier5 as number;
  return p.dealerPrice || (p.tier4 ?? 0) || 0;
}

/** pieces in one PACK / case unit */
export function piecesForUnit(unitType: string, packQty = 1, piecesPerBox = 0): number {
  if (unitType === "SINGLE") return 1;
  if (unitType === "PACK") return Math.max(1, packQty || 1);
  return Math.max(piecesPerBox || 0, (packQty || 1) * 4, 1);
}

/** PICKUP rate — PACK pricing (the buyer collects from the warehouse) */
export function pickupUnitPrice(p: TieredProduct, tier: string, unitType: string): number {
  const piece = piecePriceOf(p, tier);
  if (unitType === "SINGLE") {
    if ((p.packPrice ?? 0) > 0 && (p.packQty ?? 0) > 0) return round2((p.packPrice as number) / Math.max(1, p.packQty || 1));
    return round2(piece * 0.94);
  }
  if (unitType === "PACK") {
    if ((p.packPrice ?? 0) > 0) return round2(p.packPrice as number);
    return round2(piece * Math.max(1, p.packQty || 1) * 0.94);
  }
  const casePieces = piecesForUnit("BULK", p.packQty, p.piecesPerBox);
  return round2(piece * casePieces * 0.88);
}

/** DELIVERY rate — SINGLE-PIECE pricing (flat slab piece rate) */
export function deliveryUnitPrice(p: TieredProduct, tier: string, unitType: string): number {
  const cityRate = p.locPrice?.deliveryRate;
  const base = cityRate && cityRate > 0 ? cityRate : (p.deliveryRate ?? 0) > 0 ? (p.deliveryRate as number) : piecePriceOf(p, tier);
  if (unitType === "SINGLE") return round2(base);
  if (unitType === "PACK") return round2(base * Math.max(1, p.packQty || 1));
  const casePieces = piecesForUnit("BULK", p.packQty, p.piecesPerBox);
  return round2(base * casePieces);
}

export function unitPriceForLine(p: TieredProduct, tier: string, unitType: string, fulfillment: Fulfillment): number {
  return fulfillment === "PICKUP" ? pickupUnitPrice(p, tier, unitType) : deliveryUnitPrice(p, tier, unitType);
}

/** card display price — deal price wins when active (mirrors ProductCard on the site) */
export function displayPrice(p: ApiProduct, tier: string, fulfillment: Fulfillment, unitType: "SINGLE" | "PACK"): number {
  const piece = piecePriceOf(p, tier);
  if (unitType === "SINGLE") {
    if (p.isDeal && (p.dealPrice ?? 0) > 0 && fulfillment === "DELIVERY") return p.dealPrice;
    return fulfillment === "PICKUP" ? pickupUnitPrice(p, tier, "SINGLE") : piece;
  }
  return pickupUnitPrice(p, tier, "PACK");
}

export const DELIVERY_FEE = 250; // flat delivery charge — matches the server
