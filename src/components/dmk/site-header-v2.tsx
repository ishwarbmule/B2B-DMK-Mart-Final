"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, ShoppingCart, User, Phone, Mail, ChevronRight, X, Building2, Zap, LogOut, Package, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import { useCustomerSession, customerTypeLabel } from "@/lib/customer-client";
import { clearCustomerToken } from "@/lib/customer-session";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // auth-aware header: load the customer session once on mount; profile chip replaces
  // the Login / Signup button the moment a session is present.
  const customer = useCustomerSession((s) => s.customer);
  useEffect(() => { useCustomerSession.getState().load(); }, []);

  const logout = () => {
    clearCustomerToken();
    useCustomerSession.setState({ customer: null, nearestWarehouse: null, warehouses: [], loaded: true, loading: false });
    toast.success("Logged out — see you soon!");
  };

  const tops = catalog?.tops ?? [];
  const brands = catalog?.brands ?? [];
  // Top utility bar = business contact details ONLY (email + phone), nothing else.
  // Admin-editable settings win when set; fallbacks match the footer's business contact.
  const bizEmail = catalog?.settings?.support_email || catalog?.settings?.firm_email || "dmkmartdata@gmail.com";
  const bizPhone = catalog?.settings?.support_phone || catalog?.settings?.firm_phone || "+91 98220 12345";
  const bizPhoneRaw = bizPhone.replace(/[^\d+]/g, "");

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
      {/* utility bar — business contact details only (email + phone) */}
      <div className="hidden items-center justify-between bg-black px-4 py-1.5 text-[11px] text-gray-300 md:flex">
        <a href={`mailto:${bizEmail}`} className="flex items-center gap-1.5 hover:text-yellow-400">
          <Mail className="h-3 w-3 shrink-0 text-yellow-400" /> {bizEmail}
        </a>
        <a href={`tel:${bizPhoneRaw}`} className="flex items-center gap-1.5 hover:text-yellow-400">
          <Phone className="h-3 w-3 shrink-0 text-yellow-400" /> {bizPhone}
        </a>
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
          {hydrated && customer ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-yellow-50"
                  aria-label="Your account menu"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-sm font-black text-black">
                    {(customer.shopName || customer.name).trim().slice(0, 1).toUpperCase() || "U"}
                  </span>
                  <span className="hidden min-w-0 lg:block">
                    <span className="block text-[10px] leading-none text-gray-500">Hello,</span>
                    <span className="block max-w-[130px] truncate text-xs font-bold leading-tight text-black">
                      {customer.shopName || customer.name}
                    </span>
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-gray-500 lg:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-xl">
                <div className="px-3 py-2.5">
                  <p className="truncate text-sm font-black text-black">{customer.shopName || customer.name}</p>
                  <p className="truncate text-[11px] text-gray-500">{customer.name} · {customer.phone}</p>
                  <span className="mt-1.5 inline-block rounded bg-yellow-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-yellow-700">
                    {customerTypeLabel(customer.customerType)}
                  </span>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account" className="cursor-pointer">
                    <UserRound className="mr-2 h-4 w-4 text-gray-500" /> My Account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account#recent-orders" className="cursor-pointer">
                    <Package className="mr-2 h-4 w-4 text-gray-500" /> My Orders
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-600 focus:text-red-700">
                  <LogOut className="mr-2 h-4 w-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              href="/account"
              aria-label="Login or create account"
              className="flex items-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-yellow-500"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:block">Login / Signup</span>
            </Link>
          )}
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
        {/* click-away catcher — mega menus are click-driven now, tapping anywhere else closes them */}
        {mega && <button aria-label="Close menu" onClick={() => setMega(null)} className="fixed inset-0 z-30 cursor-default bg-black/25" tabIndex={-1} />}
        <div className="relative z-40 mx-auto flex max-w-[1400px] items-center gap-1 overflow-x-auto px-4 scrollbar-hide">
          <button
            onClick={() => setMega(mega === "depts" ? null : "depts")}
            aria-expanded={mega === "depts"}
            className="flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-yellow-400"
          >
            All Departments <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mega === "depts" ? "rotate-180" : ""}`} />
          </button>
          <span className="h-4 w-px shrink-0 bg-gray-700" aria-hidden />
          <button
            onClick={() => setMega(mega === "brands" ? null : "brands")}
            aria-expanded={mega === "brands"}
            className={`flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-bold ${mega === "brands" ? "text-yellow-400" : "text-gray-200"}`}
          >
            <Building2 className="h-3.5 w-3.5" /> Brands <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mega === "brands" ? "rotate-180" : ""}`} />
          </button>
          <Link href="/catalog?flag=deal" className="flex shrink-0 items-center gap-1 whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-red-400 hover:text-red-300">
            <Zap className="h-3.5 w-3.5" /> Deals of the Day
          </Link>
          <span className="h-4 w-px shrink-0 bg-gray-700" aria-hidden />
          {/* direct links only for categories with live inventory — everything stays under All Departments */}
          {tops.filter((t) => (t.productCount ?? 0) > 0).map((t) => (
            <Link
              key={t.id}
              href={`/catalog?top=${t.id}`}
              onClick={(e) => {
                // click toggles the mega panel; navigating happens via the panel links
                e.preventDefault();
                setMega(mega === t.id ? null : t.id);
              }}
              aria-expanded={mega === t.id}
              className={`flex shrink-0 items-center gap-1 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition ${mega === t.id ? "rounded-t bg-white text-yellow-600" : "text-gray-200 hover:text-yellow-400"}`}
            >
              <span aria-hidden>{t.emoji}</span> {t.name} <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${mega === t.id ? "rotate-180" : ""}`} />
            </Link>
          ))}
          <Link href="/page/contact-us" className="ml-auto flex shrink-0 whitespace-nowrap px-3 py-2.5 text-xs font-medium text-gray-200 hover:text-yellow-400">
            Contact
          </Link>
        </div>

        {/* departments mega — one compact row: small image + name + subcategory list per department */}
        {mega === "depts" && (
          <div className="absolute inset-x-0 top-full z-50 border-t-2 border-yellow-400 bg-white shadow-xl">
            <div className="mx-auto flex max-w-[1400px] items-stretch gap-1 overflow-x-auto p-4 scrollbar-hide lg:justify-between lg:overflow-visible">
              {tops.map((t) => (
                <div key={t.id} className="group w-[118px] shrink-0 px-1 lg:min-w-[104px] lg:flex-1">
                  <Link href={`/catalog?top=${t.id}`} onClick={() => setMega(null)} className="block">
                    <span className="relative mx-auto block h-16 w-16 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                      {t.image ? (
                        <Image src={t.image} alt={t.name} fill sizes="64px" className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
                      ) : (
                        <span className="flex h-full items-center justify-center text-2xl">{t.emoji}</span>
                      )}
                    </span>
                    <span className="mt-1.5 line-clamp-2 block text-center text-[11px] font-bold leading-tight text-gray-900 group-hover:text-yellow-600">
                      {t.name}
                    </span>
                    <span className="mt-0.5 block text-center text-[9px] font-semibold text-yellow-600">{t.productCount ?? 0} SKUs</span>
                  </Link>
                  <div className="mt-1.5 space-y-0.5 border-t border-gray-100 pt-1.5">
                    {t.mids.map((m) => (
                      <Link
                        key={m.id}
                        href={`/catalog?top=${t.id}`}
                        onClick={() => setMega(null)}
                        title={m.name}
                        className="block truncate text-[10px] leading-snug text-gray-500 hover:text-yellow-600"
                      >
                        · {m.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* per-department mega panel (hover a top-level category) — compact: small image + subcategory list */}
        {tops.filter((t) => t.id === mega).map((t) => (
          <div key={t.id} className="absolute inset-x-0 top-full z-50 border-t-2 border-yellow-400 bg-white shadow-xl">
            <div className="mx-auto flex max-w-[1400px] items-start gap-4 p-4">
              <Link
                href={`/catalog?top=${t.id}`}
                onClick={() => setMega(null)}
                aria-label={`Shop all ${t.name}`}
                className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50"
              >
                {t.image ? (
                  <Image src={t.image} alt={t.name} fill sizes="96px" className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
                ) : (
                  <span className="flex h-full items-center justify-center text-3xl">{t.emoji}</span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="truncate text-sm font-black text-black">{t.emoji} {t.name}</h3>
                  <Link href={`/catalog?top=${t.id}`} onClick={() => setMega(null)} className="shrink-0 text-xs font-bold text-yellow-600 hover:underline">
                    Shop all {t.productCount ?? 0} SKUs →
                  </Link>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">
                  {t.mids.map((m) => (
                    <Link
                      key={m.id}
                      href={`/catalog?top=${t.id}`}
                      onClick={() => setMega(null)}
                      className="flex items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-yellow-50 hover:text-black"
                    >
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
          <div className="absolute inset-x-0 top-full z-50 max-h-[70vh] overflow-y-auto border-t-2 border-yellow-400 bg-white shadow-xl">
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
