"use client";

/**
 * /choose-warehouse — the post-login location gate. The owner's rule: ask every
 * buyer WHICH warehouse they order from (Kolhar / Pune) BEFORE they see any
 * products; the cart then never asks again. The pick is stored in the dmk_wh
 * cookie — every product list on the site is scoped to that godown.
 */
import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CheckCircle2, Loader2, MapPin, Package, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { getCustomerToken, clearCustomerToken } from "@/lib/customer-session";
import { useCustomerSession } from "@/lib/customer-client";

const BTN = "h-11 w-full rounded-full bg-black text-sm font-bold uppercase tracking-wide text-yellow-400 transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50";

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

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => setWhs(d.warehouses ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pick = async (w: WhRow) => {
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

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearCustomerToken();
    router.push("/login");
  };

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
          <h1 className="mt-3 text-2xl font-black text-gray-900">Which warehouse will you order from?</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            You will see that location&apos;s products and prices — you can change it anytime.
          </p>
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
                className="group overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:border-yellow-400 hover:shadow-lg disabled:opacity-60"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                  <Image src={whImage(w)} alt={`${w.name} godown`} fill sizes="(max-width: 640px) 100vw, 380px"
                    className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
                  <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-yellow-400">
                    <Warehouse className="mr-1 inline h-3 w-3" /> DMK Mart godown
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-base font-black text-gray-900">{w.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3 w-3 text-yellow-500" /> {w.city}, Maharashtra
                  </p>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-gray-400">
                    <Package className="h-3 w-3" /> Full catalog of this location · pickup & delivery
                  </p>
                  <div className="mt-3">
                    {busy === w.id ? (
                      <span className={BTN}><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Opening…</span>
                    ) : busy ? (
                      <span className="flex h-11 w-full items-center justify-center rounded-full border border-gray-200 text-sm font-bold text-gray-400"><CheckCircle2 className="mr-1 h-4 w-4" /> Selected</span>
                    ) : (
                      <span className={BTN}>Order from here</span>
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
    </div>
  );
}
