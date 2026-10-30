"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Fulfillment } from "@/lib/pricing";

export type UnitType = "SINGLE" | "PACK" | "BULK";

export interface CartItem {
  id: string;
  sku: string;
  name: string;
  brand: string;
  image: string;
  slug: string;
  packQty: number;
  piecesPerBox: number;
  price: number; // per-SINGLE-piece price for the buyer's slab (client-adjusted when logged in)
  packPrice?: number; // Task 15: admin-set delivery pack rate (delivery PACK lines bill this)
  mrp: number;
  gst: number;
  unitType: UnitType;
  qty: number;
}

export const lineKey = (id: string, unitType: string) => `${id}::${unitType}`;

/** pieces per unit of the chosen unit type */
export function piecesPerUnit(item: Pick<CartItem, "unitType" | "packQty" | "piecesPerBox">): number {
  if (item.unitType === "SINGLE") return 1;
  if (item.unitType === "PACK") return Math.max(1, item.packQty || 1);
  return Math.max(item.piecesPerBox || 0, (item.packQty || 1) * 4, 1);
}

/** price per unit of the chosen unit type under the chosen fulfillment mode.
 *  DELIVERY→ SINGLE-PIECE pricing: flat slab piece rate (no pack economics)
 *  PICKUP  → PACK rate: packPrice when set, else piece × packQty × 0.94 (wholesale economics at the counter) */
export function unitPriceFor(
  item: Pick<CartItem, "unitType" | "packQty" | "piecesPerBox" | "price" | "packPrice">,
  fulfillment: Fulfillment = "DELIVERY"
): number {
  const ppu = piecesPerUnit(item);
  if (item.unitType === "SINGLE") {
    if (fulfillment === "PICKUP") {
      return item.packPrice && item.packPrice > 0 && item.packQty > 0
        ? Math.round((item.packPrice / item.packQty) * 100) / 100
        : Math.round(item.price * 0.94 * 100) / 100;
    }
    return item.price;
  }
  if (item.unitType === "PACK") {
    if (fulfillment === "PICKUP") {
      return item.packPrice && item.packPrice > 0
        ? item.packPrice
        : Math.round(item.price * ppu * 0.94 * 100) / 100;
    }
    return Math.round(item.price * ppu * 100) / 100;
  }
  return Math.round(item.price * ppu * (fulfillment === "PICKUP" ? 0.88 : 1) * 100) / 100;
}

export const DELIVERY_FEE = 250; // flat delivery charge on all delivery orders (no free-delivery threshold)

/** wholesale slab discount by order value */
export function slabFor(itemTotal: number): { pct: number; title: string } {
  if (itemTotal >= 100000) return { pct: 10, title: "Super Distributor · ₹1L+ order" };
  if (itemTotal >= 50000) return { pct: 7, title: "Distributor · ₹50k+ order" };
  if (itemTotal >= 25000) return { pct: 4, title: "Wholesale · ₹25k+ order" };
  if (itemTotal >= 5000) return { pct: 2, title: "Mini Bulk · ₹5k+ order" };
  return { pct: 0, title: "" };
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  /** fulfillment chosen in the cart drawer — drives every rate/total shown there and seeds checkout */
  fulfillment: Fulfillment;
  setFulfillment: (f: Fulfillment) => void;
  addItem: (item: CartItem, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false,
      fulfillment: "DELIVERY",
      setFulfillment: (f) => set({ fulfillment: f }),
      addItem: (item, qty = 1) =>
        set((state) => {
          const key = lineKey(item.id, item.unitType);
          const existing = state.items.find((i) => lineKey(i.id, i.unitType) === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                lineKey(i.id, i.unitType) === key ? { ...i, qty: i.qty + qty } : i
              ),
            };
          }
          return { items: [...state.items, { ...item, qty }] };
        }),
      setQty: (key, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? state.items.filter((i) => lineKey(i.id, i.unitType) !== key)
              : state.items.map((i) => (lineKey(i.id, i.unitType) === key ? { ...i, qty } : i)),
        })),
      remove: (key) => set((state) => ({ items: state.items.filter((i) => lineKey(i.id, i.unitType) !== key) })),
      clearCart: () => set({ items: [] }),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
    }),
    { name: "dmk-cart-v3",
      // persist ONLY cart data — isOpen must stay session-only, otherwise a drawer left open
      // when the tab closed re-opens the cart on the next visit (mobile reported this)
      partialize: (s) => ({ items: s.items, fulfillment: s.fulfillment }) as CartState,
    }
  )
);

export interface CartTotals {
  totalPieces: number;
  totalLines: number;
  itemTotal: number;
  slabPct: number;
  slabTitle: string;
  slabDisc: number;
  gstAmount: number;
  deliveryFee: number;
  grandTotal: number;
  totalSavings: number;
}

/** No GST anywhere — DMK Mart does not charge or provide GST. gstAmount is always 0. */
export function cartTotals(items: CartItem[], fulfillment: Fulfillment = "DELIVERY"): CartTotals {
  let itemTotal = 0;
  let totalPieces = 0;
  let totalSavings = 0;
  for (const i of items) {
    const up = unitPriceFor(i, fulfillment);
    const ppu = piecesPerUnit(i);
    itemTotal += up * i.qty;
    totalPieces += ppu * i.qty;
    const mrpPer = i.unitType === "SINGLE" ? i.mrp : i.mrp * ppu;
    totalSavings += Math.max(0, (mrpPer - up) * i.qty);
  }
  itemTotal = Math.round(itemTotal * 100) / 100;
  const slab = slabFor(itemTotal);
  const slabDisc = Math.round((itemTotal * slab.pct) / 100 * 100) / 100;
  const gstAmount = 0;
  // PICKUP never carries a delivery fee (buyer collects) · DELIVERY is a flat ₹250 — mirrors /api/orders
  const deliveryFee = fulfillment === "PICKUP" || itemTotal === 0 ? 0 : DELIVERY_FEE;
  const grandTotal = Math.round((itemTotal - slabDisc + gstAmount + deliveryFee) * 100) / 100;
  return {
    totalPieces,
    totalLines: items.length,
    itemTotal,
    slabPct: slab.pct,
    slabTitle: slab.title,
    slabDisc,
    gstAmount,
    deliveryFee,
    grandTotal,
    totalSavings: Math.round(totalSavings * 100) / 100,
  };
}

export function formatINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
