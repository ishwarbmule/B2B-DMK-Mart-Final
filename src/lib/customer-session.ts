"use client";

/**
 * Customer session storage — Amazon-style "Keep me signed in".
 * remember=true  → localStorage (persists across browser restarts)
 * remember=false → sessionStorage (cleared when the browser closes)
 */

const KEY = "dmk-customer-token";

export function getCustomerToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY) ?? window.sessionStorage.getItem(KEY);
}

export function setCustomerToken(token: string, remember: boolean) {
  if (typeof window === "undefined") return;
  clearCustomerToken();
  (remember ? window.localStorage : window.sessionStorage).setItem(KEY, token);
}

export function clearCustomerToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.sessionStorage.removeItem(KEY);
}

/** Headers to attach to every storefront product fetch — rides the buyer's
 *  identity so tier pricing AND the location warehouse lock apply site-wide
 *  (home sections, search, brand pages, catalog), not just the catalog page. */
export function customerAuthHeaders(): Record<string, string> {
  const token = getCustomerToken();
  return token ? { "x-customer-token": token } : {};
}
