"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, ShoppingCart, User, Phone, ShieldCheck, ChevronRight, X, Building2, Zap } from "lucide-react";
import { useCartStore, useSiteStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import type { CatalogPayload } from "@/lib/types";

let cachedCatalog: CatalogPayload | null = null;

export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(cachedCatalog);
  useEffect(() => {
    if (cachedCatalog) return;
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d: CatalogPayload) => {
        cachedCatalog = d;
        setCatalog(d);
      })
      .catch(() => {});
  }, []);
  return catalog;
}

export function SiteHeaderV2() {
  const hydrated = useHydrated();
  const router = useRouter();
  const catalog = useCatalog();
  const count = useCartStore((s) => s.items.reduce((n, i) => n + i.qty, 0));
  const openCart = useCartStore((s) => s.openCart);
  const [q, setQ] = useState("");
  const [mega, setMega] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gst = useSiteStore((s) => s.gstEnabled);
  useEffect(() => { useSiteStore.getState().load(); }, []);

  const tops = catalog?.tops ?? [];
  const brands = catalog?.brands ?? [];
  const announcement = catalog?.activeOffer
    ? `${catalog.activeOffer.headline} — ${catalog.activeOffer.subText}`
    : gst
      ? "B2B wholesale rates on 2,200+ SKUs · GST invoice on every order · Delivery OTP verified handover"
      : "B2B wholesale rates on 2,200+ SKUs · Itemised invoice on every order · Delivery OTP verified handover";

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    router.push(q.trim() ? `/catalog?q=${encodeURIComponent(q.trim())}` : "/catalog");
  };

  const onInput = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (v.trim()) router.push(`/catalog?q=${encodeURIComponent(v.trim())}`);
    }, 700);
  };

  return (
    <header className="sticky top-0 z-40 w-full">
      {/* utility bar */}
      <div className="hidden items-center justify-between bg-black px-4 py-1.5 text-[11px] text-gray-300 md:flex">
        <p className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
          <span className="truncate">{announcement}</span>
        </p>
        <div className="flex items-center gap-4">
          <a href="tel:+919822012345" className="flex items-center gap-1 hover:text-yellow-400">
            <Phone className="h-3 w-3" /> +91 98220 12345
          </a>
          <Link href="/account" className="hover:text-yellow-400">B2B Account</Link>
          <Link href="/admin" className="font-semibold text-yellow-400 hover:underline">
            Admin Login
          </Link>
        </div>
      </div>

      {/* main header */}
      <div className="flex items-center gap-2 border-b-2 border-yellow-400 bg-white px-3 py-2 md:gap-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="DMK Mart home">
          <Image src="/dmk-logo.png" alt="DMK Mart" width={44} height={44} className="h-11 w-11 rounded-full" unoptimized />
          <div className="hidden sm:block">
            <p className="text-lg font-black leading-none tracking-tight text-black">
              DMK <span className="text-yellow-500">Mart</span>
            </p>
            <p className="text-[10px] font-semibold text-gray-500">B2B Wholesale Marketplace</p>
          </div>
        </Link>

        <form onSubmit={submit} className="relative flex flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => onInput(e.target.value)}
            placeholder='Search "planter", "bucket", "pulveriser"…'
            className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-yellow-400 focus:bg-white"
            aria-label="Search products"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 text-gray-400 hover:text-black">
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        <nav className="flex shrink-0 items-center gap-1">
          <Link
            href="/account"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 lg:flex"
          >
            <User className="h-4 w-4" /> Account
          </Link>
          <button
            onClick={openCart}
            aria-label={`Open cart with ${count} items`}
            className="relative flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-white"
          >
            <ShoppingCart className="h-5 w-5 text-yellow-400" />
            <span className="hidden text-xs font-bold sm:block">Cart</span>
            {hydrated && count > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-400 px-1 text-[10px] font-black text-black">
                {count}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* nav row */}
      <div className="relative hidden border-b border-gray-200 bg-black md:block">
        <div className="mx-auto flex max-w-[1400px] items-center gap-1 px-4">
          <button
            onMouseEnter={() => setMega("depts")}
            onClick={() => setMega(mobileOpen ? null : "depts")}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-yellow-400"
          >
            All Departments <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onMouseEnter={() => setMega("brands")}
            onClick={() => setMega(mobileOpen ? null : "brands")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold ${mega === "brands" ? "text-yellow-400" : "text-gray-200"}`}
          >
            <Building2 className="h-3.5 w-3.5" /> Brands <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <Link href="/catalog?flag=deal" className="flex items-center gap-1 whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-red-400 hover:text-red-300">
            <Zap className="h-3.5 w-3.5" /> Deals of the Day
          </Link>
          {tops.slice(0, 6).map((t) => (
            <Link
              key={t.id}
              href={`/catalog?top=${t.id}`}
              onMouseEnter={() => setMega(t.id)}
              onClick={() => setMega(mobileOpen ? mega === t.id ? null : t.id : null)}
              className={`flex items-center gap-1 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition ${mega === t.id ? "rounded-t bg-white text-yellow-600" : "text-gray-200 hover:text-yellow-400"}`}
            >
              {t.emoji} {t.name} <ChevronDown className="h-3 w-3 opacity-60" />
            </Link>
          ))}
          <Link href="/page/contact-us" className="ml-auto whitespace-nowrap px-3 py-2.5 text-xs font-medium text-gray-200 hover:text-yellow-400">
            Contact
          </Link>
        </div>

        {/* departments mega — image cards */}
        {mega === "depts" && (
          <div onMouseLeave={() => setMega(null)} className="absolute inset-x-0 top-full z-50 max-h-[75vh] overflow-y-auto border-t-2 border-yellow-400 bg-white shadow-xl">
            <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-4 p-6 sm:grid-cols-3 lg:grid-cols-5">
              {tops.map((t) => (
                <div key={t.id} className="group overflow-hidden rounded-xl border border-gray-100 bg-white transition hover:border-yellow-400 hover:shadow-md">
                  <Link href={`/catalog?top=${t.id}`} onClick={() => setMega(null)} className="relative block aspect-[16/10] w-full overflow-hidden bg-gray-50">
                    {t.image ? (
                      <Image src={t.image} alt={t.name} fill sizes="260px" className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
                    ) : (
                      <span className="flex h-full items-center justify-center text-4xl">{t.emoji}</span>
                    )}
                    <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-yellow-400">{t.productCount ?? 0} SKUs</span>
                  </Link>
                  <div className="p-3">
                    <Link href={`/catalog?top=${t.id}`} onClick={() => setMega(null)} className="line-clamp-1 text-[13px] font-bold text-black hover:text-yellow-600">
                      {t.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      {t.mids.slice(0, 3).map((m) => (
                        <Link key={m.id} href={`/catalog?top=${t.id}`} onClick={() => setMega(null)} className="line-clamp-1 text-[11px] text-gray-500 hover:text-yellow-600">
                          {m.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* per-department mega panel (hover a top-level category) */}
        {tops.filter((t) => t.id === mega).map((t) => (
          <div key={t.id} onMouseLeave={() => setMega(null)} className="absolute inset-x-0 top-full z-50 border-t-2 border-yellow-400 bg-white shadow-xl">
            <div className="mx-auto flex max-w-[1400px] gap-6 p-6">
              <div className="hidden w-60 shrink-0 md:block">
                <Link href={`/catalog?top=${t.id}`} onClick={() => setMega(null)} className="group relative block overflow-hidden rounded-xl border border-gray-100 bg-gray-50" aria-label={`Shop all ${t.name}`}>
                  <div className="relative aspect-[4/5] w-full">
                    {t.image ? (
                      <Image src={t.image} alt={t.name} fill sizes="240px" className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
                    ) : (
                      <span className="flex h-full items-center justify-center text-5xl">{t.emoji}</span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-8 text-xs font-bold text-white">
                      Shop all {t.productCount ?? 0} SKUs <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-black">{t.emoji} {t.name}</h3>
                  <Link href={`/catalog?top=${t.id}`} onClick={() => setMega(null)} className="text-xs font-bold text-yellow-600 hover:underline">
                    View department →
                  </Link>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 lg:grid-cols-3">
                  {t.mids.map((m) => (
                    <Link key={m.id} href={`/catalog?top=${t.id}`} onClick={() => setMega(null)} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-yellow-50 hover:text-black">
                      <ChevronRight className="h-3 w-3 shrink-0 text-yellow-500" />
                      <span className="truncate">{m.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* brands mega */}
        {mega === "brands" && (
          <div onMouseLeave={() => setMega(null)} className="absolute inset-x-0 top-full z-50 max-h-[70vh] overflow-y-auto border-t-2 border-yellow-400 bg-white shadow-xl">
            <div className="mx-auto max-w-[1400px] p-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold text-black">Shop by Brand — {brands.length} brands</p>
                <Link href="/brands" onClick={() => setMega(null)} className="text-xs font-bold text-yellow-600 hover:underline">
                  View all →
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
                {brands.map((b) => (
                  <Link
                    key={b.id}
                    href={`/brand/${b.slug}`}
                    onClick={() => setMega(null)}
                    className="group flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-white p-3 text-center transition hover:border-yellow-400 hover:shadow-md"
                  >
                    <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-white">
                      {b.logo ? (
                        <Image src={b.logo} alt={b.name} width={56} height={56} className="h-14 w-14 object-contain" unoptimized />
                      ) : (
                        <span className="text-lg font-black text-gray-300">{b.name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-gray-800 group-hover:text-black">{b.name}</span>
                    <span className="text-[10px] text-gray-400">{b._count?.products ?? 0} SKUs</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* mobile strip */}
      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 bg-black px-3 py-2 scrollbar-hide md:hidden">
        <Link href="/brands" className="whitespace-nowrap rounded-full bg-yellow-400 px-3 py-1 text-[11px] font-bold text-black">
          All Brands
        </Link>
        {tops.map((t) => (
          <Link
            key={t.id}
            href={`/catalog?top=${t.id}`}
            className="whitespace-nowrap rounded-full border border-gray-700 px-3 py-1 text-[11px] font-medium text-gray-200"
          >
            {t.emoji} {t.name}
          </Link>
        ))}
      </div>
    </header>
  );
}
