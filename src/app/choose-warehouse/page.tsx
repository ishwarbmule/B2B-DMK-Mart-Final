"use client";

/**
 * /choose-warehouse — the post-login location gate. The owner's rule: ask every
 * buyer WHICH warehouse they order from (Kolhar / Pune) BEFORE they see any
 * products; the cart then never asks again. The pick is stored in the dmk_wh
 * cookie — every product list on the site is scoped to that godown.
 *
 * The owner's second rule: if the buyer picks a warehouse in a DIFFERENT area
 * than their registered shop (e.g. a Pune shop ordering from Kolhar), a clear
 * warning appears before the pick is applied — and again at order-confirm time
 * in checkout. Heading, subtext and captions are admin-editable (Website
 * Management → Warehouse Page), photos live in Admin → Warehouses.
 */
import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Loader2, MapPin, Package, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { getCustomerToken, clearCustomerToken, ensureGateCookie } from "@/lib/customer-session";
import { useCustomerSession } from "@/lib/customer-client";
import { LIVE_DEFAULTS } from "@/lib/live-content";

const BTN = "flex h-13 min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-black text-[13px] font-bold uppercase tracking-wide text-yellow-400 transition group-hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_DONE = "flex h-13 min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-[13px] font-bold text-emerald-600";

/** Demo godown artwork per location — used only until the admin uploads a
 *  Warehouse Image (Admin → Warehouses → edit → Image field, Cloudinary). */
const WH_IMAGE: Record<string, string> = {
  PUNE: "/wh-pune.png",
  KOLHAR: "/wh-kolhar.png",
};
const whImage = (w: { city: string; image?: string | null }) =>
  (w.image || "").trim() || WH_IMAGE[(w.city || "").toUpperCase()] || "/dmk-logo.png";

interface WhRow { id: string; name: string; city: string; image?: string | null; isDefault: boolean }

export default function ChooseWarehousePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-yellow-500" /></div>}>
      <Chooser />
    </Suspense>
  );
}

function Chooser() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [whs, setWhs] = useState<WhRow[]>([]);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<Record<string, string>>({});
  const ct = (key: string) => (content[key] ?? "").trim() || LIVE_DEFAULTS[key] || "";

  // mismatch warning state — picked warehouse vs the buyer's registered area
  const [warnPick, setWarnPick] = useState<WhRow | null>(null);

  // the buyer's home warehouse (nearest to their registered shop) from /api/auth/me
  const nearest = useCustomerSession((s) => s.nearestWarehouse);
  const loadSession = useCustomerSession((s) => s.load);

  useEffect(() => {
    loadSession();
    // self-heal the storefront-gate cookie on this gated page too — a drifted/
    // evicted dmk_sess cookie would otherwise bounce the NEXT navigation to /login
    ensureGateCookie().catch(() => {});
    fetch("/api/site-content")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setContent(d?.overrides ?? {}))
      .catch(() => {});
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => setWhs(d.warehouses ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadSession]);

  const applyPick = async (w: WhRow) => {
    setBusy(w.id);
    try {
      const token = getCustomerToken();
      const res = await fetch("/api/auth/select-warehouse", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { "x-customer-token": token } : {}) },
        body: JSON.stringify({ warehouseId: w.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not set your warehouse");
      useCustomerSession.getState().refresh();
      toast.success(`Ordering from ${w.name} — happy shopping!`);
      router.push(next && next.startsWith("/") ? next : "/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set your warehouse");
      setBusy("");
    }
  };

  const pick = (w: WhRow) => {
    // WARNING AREA 1 — choosing a warehouse in a different area than the
    // registered shop (e.g. Pune shop → Kolhar godown) asks for confirmation
    if (nearest && w.id !== nearest.id) {
      setWarnPick(w);
      return;
    }
    void applyPick(w);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearCustomerToken();
    router.push("/login");
  };

  const mismatchText = (w: WhRow) =>
    (ct("wh.mismatch.text") || "")
      .replace(/\{home\}/g, `${nearest?.name || nearest?.city || "your registered area"}`)
      .replace(/\{chosen\}/g, `${w.name}${w.city ? ` (${w.city})` : ""}`);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="border-b-2 border-yellow-400 bg-black py-4">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Image src="/dmk-logo.png" alt="DMK Mart" width={40} height={40} className="h-10 w-10 rounded-full" unoptimized />
            <div>
              <p className="text-base font-black leading-tight text-white">DMK <span className="text-yellow-400">Mart</span></p>
              <p className="text-[10px] text-gray-400">B2B Wholesale Marketplace</p>
            </div>
          </div>
          <button onClick={logout} className="text-xs font-semibold text-gray-400 hover:text-yellow-400">Logout</button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-yellow-800">
            <MapPin className="h-3 w-3" /> One quick question
          </span>
          <h1 className="mt-3 text-2xl font-black text-gray-900">{ct("wh.title")}</h1>
          <p className="mt-1.5 text-sm text-gray-500">{ct("wh.subtitle")}</p>
        </div>

        {loading ? (
          <div className="mt-10 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-yellow-500" /></div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {whs.map((w) => (
              <button
                key={w.id}
                onClick={() => pick(w)}
                disabled={!!busy}
                className="group flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:border-yellow-400 hover:shadow-lg disabled:opacity-60"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                  <Image src={whImage(w)} alt={`${w.name} godown`} fill sizes="(max-width: 640px) 100vw, 380px"
                    className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
                  <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-yellow-400">
                    <Warehouse className="mr-1 inline h-3 w-3" /> {ct("wh.badge")}
                  </span>
                  {nearest?.id === w.id && (
                    <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      <CheckCircle2 className="mr-1 inline h-3 w-3" /> Recommended
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-base font-black text-gray-900">{w.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3 w-3 text-yellow-500" /> {w.city}
                  </p>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-gray-400">
                    <Package className="h-3 w-3" /> {ct("wh.cardcaption")}
                  </p>
                  <div className="mt-auto pt-3">
                    {busy === w.id ? (
                      <span className={BTN}><Loader2 className="h-4 w-4 animate-spin" /> Opening…</span>
                    ) : busy ? (
                      <span className={BTN_DONE}><CheckCircle2 className="h-4 w-4" /> Selected</span>
                    ) : (
                      <span className={BTN}>Order from here <ArrowRight className="h-4 w-4" /></span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {!whs.length && (
              <div className="col-span-full rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-gray-400">
                <Building2 className="mx-auto mb-2 h-8 w-8" /> No warehouses are open for ordering right now — please check back soon.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── LOCATION-MISMATCH WARNING (area 1 — right after picking a different-area warehouse) ── */}
      {warnPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-black text-gray-900">{ct("wh.mismatch.title")}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{mismatchText(warnPick)}</p>
              </div>
              <button onClick={() => setWarnPick(null)} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setWarnPick(null)} className="flex-1 rounded-xl border px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Reconsider
              </button>
              <button
                onClick={() => { const w = warnPick; setWarnPick(null); void applyPick(w); }}
                className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white hover:bg-amber-600"
              >
                Yes, order from {warnPick.city || warnPick.name}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
