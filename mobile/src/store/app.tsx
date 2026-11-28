/**
 * Global app state — session (token + customer), chosen warehouse, catalog
 * cache and the cart. Everything persists to AsyncStorage so the buyer
 * reopens the app exactly where they left off.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  api,
  endpoints,
  setAuth,
  getAuth,
  KEYS,
  type Catalog,
  type Customer,
  type ApiProduct,
  type Warehouse,
} from "../lib/api";

export type CartLine = { product: ApiProduct; unitType: "SINGLE" | "PACK"; qty: number };

type AppState = {
  booting: boolean;
  customer: Customer | null;
  warehouse: Warehouse | null;
  warehouses: Warehouse[];
  catalog: Catalog | null;
  cart: CartLine[];
  // actions
  loginDone: (token: string, customer: Customer) => Promise<void>;
  refreshMe: () => Promise<void>;
  chooseWarehouse: (w: Warehouse) => Promise<void>;
  loadCatalog: () => Promise<void>;
  addToCart: (p: ApiProduct, unitType: "SINGLE" | "PACK", qty: number) => void;
  setLineQty: (productId: string, unitType: string, qty: number) => void;
  clearCart: () => void;
  logout: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export const useApp = (): AppState => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);

  const persistCart = (lines: CartLine[]) => {
    setCart(lines);
    AsyncStorage.setItem(KEYS.cart, JSON.stringify(lines)).catch(() => {});
  };

  // boot — restore token → /me → warehouse → cart
  useEffect(() => {
    (async () => {
      try {
        const [token, whRaw, cartRaw] = await Promise.all([
          AsyncStorage.getItem(KEYS.token),
          AsyncStorage.getItem(KEYS.warehouse),
          AsyncStorage.getItem(KEYS.cart),
        ]);
        if (cartRaw) {
          try {
            setCart(JSON.parse(cartRaw) as CartLine[]);
          } catch { /* ignore */ }
        }
        if (token) {
          setAuth(token, "");
          try {
            const me = await endpoints.me();
            setCustomer(me.customer);
            setWarehouses(me.warehouses ?? []);
            if (whRaw) {
              const wh = (me.warehouses ?? []).find((w) => w.id === whRaw);
              if (wh) {
                setWarehouse(wh);
                setAuth(token, wh.id);
              }
            }
          } catch {
            // token expired/invalid → clean session
            setAuth("", "");
            await AsyncStorage.removeItem(KEYS.token).catch(() => {});
            setCustomer(null);
          }
        }
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const loginDone = async (token: string, cust: Customer) => {
    await AsyncStorage.setItem(KEYS.token, token).catch(() => {});
    setAuth(token, "");
    setCustomer(cust);
    try {
      const me = await endpoints.me();
      setWarehouses(me.warehouses ?? []);
    } catch { /* ignore */ }
  };

  const refreshMe = async () => {
    const me = await endpoints.me();
    setCustomer(me.customer);
    setWarehouses(me.warehouses ?? []);
    setWarehouse((cur) => (me.warehouses ?? []).find((w) => w.id === cur?.id) ?? cur);
  };

  const chooseWarehouse = async (w: Warehouse) => {
    const { token } = getAuth();
    setWarehouse(w);
    setAuth(token, w.id);
    await AsyncStorage.setItem(KEYS.warehouse, w.id).catch(() => {});
    if (token) await endpoints.selectWarehouse(w.id).catch(() => {});
  };

  const loadCatalog = async () => {
    const c = await endpoints.catalog();
    setCatalog(c);
  };

  const addToCart = (p: ApiProduct, unitType: "SINGLE" | "PACK", qty: number) => {
    const idx = cart.findIndex((l) => l.product.id === p.id && l.unitType === unitType);
    const lines = [...cart];
    if (idx >= 0) lines[idx] = { ...lines[idx], qty: lines[idx].qty + qty };
    else lines.push({ product: p, unitType, qty });
    persistCart(lines);
  };

  const setLineQty = (productId: string, unitType: string, qty: number) => {
    const lines = cart
      .map((l) => (l.product.id === productId && l.unitType === unitType ? { ...l, qty } : l))
      .filter((l) => l.qty > 0);
    persistCart(lines);
  };

  const clearCart = () => persistCart([]);

  const logout = async () => {
    setAuth("", "");
    setCustomer(null);
    setWarehouse(null);
    setCart([]);
    await Promise.all([
      AsyncStorage.removeItem(KEYS.token),
      AsyncStorage.removeItem(KEYS.warehouse),
      AsyncStorage.removeItem(KEYS.cart),
    ]).catch(() => {});
  };

  const value = useMemo<AppState>(
    () => ({
      booting, customer, warehouse, warehouses, catalog, cart,
      loginDone, refreshMe, chooseWarehouse, loadCatalog, addToCart, setLineQty, clearCart, logout,
    }),
    [booting, customer, warehouse, warehouses, catalog, cart],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const cartCount = (cart: CartLine[]) => cart.reduce((n, l) => n + l.qty, 0);
