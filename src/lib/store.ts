"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  price: number; // price per SINGLE piece (tier-adjusted client-side when known)
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

/** price per unit of the chosen unit type */
export function unitPriceFor(item: Pick<CartItem, "unitType" | "packQty" | "piecesPerBox" | "price">): number {
  const ppu = piecesPerUnit(item);
  if (item.unitType === "SINGLE") return item.price;
  if (item.unitType === "PACK") return Math.round(item.price * ppu * 0.94 * 100) / 100;
  return Math.round(item.price * ppu * 0.88 * 100) / 100;
}

export const GST_RATE = 0.18;
export const DELIVERY_FEE = 250;
export const FREE_DELIVERY_ABOVE = 5000;

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
    { name: "dmk-cart-v3" }
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

/** gstEnabled = admin GST master toggle (Settings → GST Mode). When false, no tax is added or shown anywhere. */
export function cartTotals(items: CartItem[], gstEnabled = true): CartTotals {
  let itemTotal = 0;
  let totalPieces = 0;
  let totalSavings = 0;
  for (const i of items) {
    const up = unitPriceFor(i);
    const ppu = piecesPerUnit(i);
    itemTotal += up * i.qty;
    totalPieces += ppu * i.qty;
    const mrpPer = i.unitType === "SINGLE" ? i.mrp : i.mrp * ppu;
    totalSavings += Math.max(0, (mrpPer - up) * i.qty);
  }
  itemTotal = Math.round(itemTotal * 100) / 100;
  const slab = slabFor(itemTotal);
  const slabDisc = Math.round((itemTotal * slab.pct) / 100 * 100) / 100;
  const gstAmount = gstEnabled ? Math.round((itemTotal - slabDisc) * GST_RATE * 100) / 100 : 0;
  const deliveryFee = itemTotal >= FREE_DELIVERY_ABOVE || itemTotal === 0 ? 0 : DELIVERY_FEE;
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

// ───────────────────────── SITE SETTINGS (GST master toggle etc.) ─────────────────────────

interface SiteState {
  gstEnabled: boolean;
  loaded: boolean;
  load: () => Promise<void>;
}

/** Client-side mirror of admin Settings (public, non-secret). GST off ⇒ the whole site renders without GST. */
export const useSiteStore = create<SiteState>()((set, get) => ({
  gstEnabled: true,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    set({ loaded: true });
    try {
      const r = await fetch("/api/site-settings", { cache: "no-store" });
      const d = await r.json();
      set({ gstEnabled: d.gstEnabled !== false });
    } catch {
      /* keep default (GST on) */
    }
  },
}));
