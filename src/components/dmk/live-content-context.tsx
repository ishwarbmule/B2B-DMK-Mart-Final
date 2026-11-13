"use client";

/**
 * Live Visual Editor — storefront content context.
 * Loads /api/site-content once per session and lets <LiveText> render overrides
 * over the bundled defaults. The admin overlay writes through /api/admin/site-content
 * and calls reload() so edited copy appears instantly.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LIVE_DEFAULTS } from "@/lib/live-content";

type Ctx = {
  /** resolved copy for a key (override → default) */
  t: (key: string) => string;
  overrides: Record<string, string>;
  reload: () => Promise<void>;
  ready: boolean;
};

const LiveCtx = createContext<Ctx>({ t: (k) => LIVE_DEFAULTS[k] ?? k, overrides: {}, reload: async () => {}, ready: false });

export function LiveContentProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/site-content", { cache: "no-store" });
      const data = await res.json();
      setOverrides(data.overrides ?? {});
    } catch {
      /* storefront must never break because of content overrides */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const t = useCallback((key: string) => overrides[key] ?? LIVE_DEFAULTS[key] ?? key, [overrides]);

  const value = useMemo(() => ({ t, overrides, reload, ready }), [t, overrides, reload, ready]);
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export function useLiveContent() {
  return useContext(LiveCtx);
}

/** Render a registry-editable text. The overlay hooks onto [data-live-key];
 *  data-live-default tells the overlay which value "unchanged" means for this element
 *  (registry default + override — or the DB value for slider:* keys set in hero-slider). */
export function LiveText({
  k,
  as: Tag = "span",
  className,
  style,
}: {
  k: string;
  as?: "span" | "p" | "h2" | "h3" | "div";
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t } = useLiveContent();
  return (
    <Tag data-live-key={k} data-live-label={k} data-live-default={t(k)} className={className} style={style}>
      {t(k)}
    </Tag>
  );
}
