"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Returns false during SSR and the hydration pass, true after hydration.
 * Used to gate rendering of persisted client-only state (e.g. zustand cart)
 * so that server HTML matches the first client render.
 */
export function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
