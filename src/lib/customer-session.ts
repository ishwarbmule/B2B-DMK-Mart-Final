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

/**
 * Make sure the storefront-gate cookie (dmk_sess, httpOnly) exists for this
 * buyer. The page gate (proxy.ts) trusts ONLY that cookie, while the login
 * token lives in localStorage — if they drift apart (OTP login on /account,
 * pre-gate buyers, cleared cookies), every gated page would bounce to /login.
 * Callers fire this once per page mount: cheap, idempotent, self-healing.
 * Returns true when the visitor holds a valid customer token.
 */
let gateSync: Promise<boolean> | null = null;
export async function ensureGateCookie(): Promise<boolean> {
  const token = getCustomerToken();
  if (!token) return false;
  if (gateSync) return gateSync;
  // single in-flight promise — concurrent callers (page mount + store chrome)
  // share one fetch AND get the real result (the old pre-set flag reported
  // "cookie OK" before the request ever resolved)
  const attempt = (async () => {
    try {
      const res = await fetch("/api/auth/session", { method: "POST", headers: { "x-customer-token": token } });
      return res.ok;
    } catch {
      return false;
    }
  })();
  gateSync = attempt;
  const ok = await attempt;
  if (!ok) gateSync = null; // failure → allow a later retry; success stays cached
  return ok;
}

/** Reset after logout so a fresh sign-in re-syncs the gate cookie. */
export function resetGateSync() {
  gateSync = null;
}
