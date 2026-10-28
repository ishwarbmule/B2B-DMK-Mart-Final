"use client";

/**
 * Task 15 — client-side customer session (tier-aware pricing + nearest warehouse).
 * Fetches /api/auth/me once per page load; every pricing surface reads the slab
 * from here. Logged-out buyers automatically fall back to the WHOLESALE (tier2)
 * slab — the owner's rule for "no one logged in".
 */
import { create } from "zustand";
import { getCustomerToken } from "@/lib/customer-session";
import { GUEST_TIER, type Fulfillment } from "@/lib/pricing";

export interface SessionCustomer {
  id: string;
  name: string;
  shopName: string;
  phone: string;
  email?: string;
  customerType: string;
  tier: string;
  status: string;
  city: string;
  pincode: string;
  gstin?: string;
}

export interface SessionWarehouse {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  isDefault: boolean;
}

interface CustomerSessionState {
  customer: SessionCustomer | null;
  nearestWarehouse: SessionWarehouse | null;
  warehouses: SessionWarehouse[]; // nearest-first for the logged-in buyer
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useCustomerSession = create<CustomerSessionState>()((set, get) => ({
  customer: null,
  nearestWarehouse: null,
  warehouses: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const token = getCustomerToken();
      if (!token) {
        set({ customer: null, nearestWarehouse: null, warehouses: [], loaded: true, loading: false });
        return;
      }
      const r = await fetch("/api/auth/me", { headers: { "x-customer-token": token }, cache: "no-store" });
      if (!r.ok) {
        set({ customer: null, nearestWarehouse: null, warehouses: [], loaded: true, loading: false });
        return;
      }
      const d = await r.json();
      set({
        customer: d.customer ?? null,
        nearestWarehouse: d.nearestWarehouse ?? null,
        warehouses: d.warehouses ?? [],
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loaded: true, loading: false });
    }
  },
  refresh: async () => {
    set({ loaded: false });
    await get().load();
  },
}));

/** the pricing slab that applies right now (guests → wholesale tier2) */
export function currentTier(): string {
  return useCustomerSession.getState().customer?.tier || GUEST_TIER;
}

/** business-type label for badges */
export function customerTypeLabel(t: string | undefined): string {
  switch (t) {
    case "RETAILER": return "Retailer";
    case "SEMI_WHOLESALE": return "Semi-Wholesaler";
    case "WHOLESALE": return "Wholesaler";
    case "DISTRIBUTOR": return "Distributor";
    default: return "Guest";
  }
}

export type { Fulfillment };
