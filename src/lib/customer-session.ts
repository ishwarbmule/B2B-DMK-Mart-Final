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
