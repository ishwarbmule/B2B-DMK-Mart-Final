"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, MapPin, Search, ShoppingCart, User, Phone, ShieldCheck, ChevronRight, X } from "lucide-react";
import { useCartStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import type { TopCategoryNode } from "@/lib/types";

interface Props {
  tops: TopCategoryNode[];
  announcement: string;
  onSearch: (q: string) => void;
  onNavigate: (v: "home" | "catalog" | "brands" | "stores") => void;
  onTopCategory: (topId: string) => void;
  onAdmin: () => void;
}

export function SiteHeader({ tops, announcement, onSearch, onNavigate, onTopCategory, onAdmin }: Props) {
  const hydrated = useHydrated();
  const count = useCartStore((s) => s.items.reduce((n, i) => n + i.cases, 0));
  const openCart = useCartStore((s) => s.openCart);
  const [q, setQ] = useState("");
  const [mega, setMega] = useState<string | null>(null);
  const [mobileMega, setMobileMega] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onSearch(q);
  };

  const onSearchInput = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(v), 400);
  };

  return (
    <header className="sticky top-0 z-40 w-full">
      {/* utility bar */}
      <div className="hidden items-center justify-between bg-black px-4 py-1.5 text-[11px] text-gray-300 md:flex">
        <p className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-yellow-400" />
          <span className="truncate">{announcement}</span>
        </p>
        <div className="flex items-center gap-4">
          <a href="tel:9765432100" className="flex items-center gap-1 hover:text-yellow-400">
            <Phone className="h-3 w-3" /> 97654 32100
          </a>
          <button onClick={onAdmin} className="font-semibold text-yellow-400 hover:underline">
            Admin Login
          </button>
        </div>
      </div>

      {/* main header */}
      <div className="flex items-center gap-2 border-b-2 border-yellow-400 bg-white px-3 py-2 md:gap-4 md:px-6">
        <button onClick={() => onNavigate("home")} className="flex shrink-0 items-center gap-2" aria-label="Go to DMK Mart home">
          <Image src="/dmk-logo.png" alt="DMK Mart" width={44} height={44} className="h-11 w-11 rounded-full" unoptimized />
          <div className="hidden sm:block">
            <p className="text-lg font-black leading-none tracking-tight text-black">
              DMK <span className="text-yellow-500">Mart</span>
            </p>
            <p className="text-[10px] font-semibold text-gray-500">Save More. Shop More.</p>
          </div>
        </button>

        <form onSubmit={submit} className="relative flex flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => onSearchInput(e.target.value)}
            placeholder='Search "planter", "bucket", "chair"…'
            className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-yellow-400 focus:bg-white"
            aria-label="Search products"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); onSearch(""); }} aria-label="Clear search" className="absolute right-2 text-gray-400 hover:text-black">
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        <nav className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onNavigate("catalog")}
            className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 lg:flex"
          >
            <User className="h-4 w-4" /> All Products
          </button>
          <button
            onClick={openCart}
            aria-label={`Open cart with ${count} cases`}
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

      {/* category nav */}
      <div className="relative hidden border-b border-gray-200 bg-black md:block">
        <div className="mx-auto flex max-w-[1400px] items-center gap-1 px-4">
          <button
            onMouseEnter={() => setMega("all")}
            onClick={() => setMobileMega((m) => !m)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-yellow-400"
          >
            All Departments <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {tops.slice(0, 7).map((t) => (
            <button
              key={t.id}
              onMouseEnter={() => setMega(t.id)}
              onClick={() => onTopCategory(t.id)}
              className={`whitespace-nowrap px-3 py-2.5 text-xs font-medium transition hover:text-yellow-400 ${mega === t.id ? "text-yellow-400" : "text-gray-200"}`}
            >
              {t.emoji} {t.name}
            </button>
          ))}
          <button onClick={() => onNavigate("brands")} className="whitespace-nowrap px-3 py-2.5 text-xs font-medium text-gray-200 hover:text-yellow-400">
            Brands
          </button>
          <button onClick={() => onNavigate("stores")} className="whitespace-nowrap px-3 py-2.5 text-xs font-medium text-gray-200 hover:text-yellow-400">
            Stores
          </button>
        </div>

        {/* mega menu */}
        {mega && (
          <div
            onMouseLeave={() => setMega(null)}
            className="absolute inset-x-0 top-full z-50 max-h-[70vh] overflow-y-auto border-t-2 border-yellow-400 bg-white shadow-xl"
          >
            <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-6 p-6 md:grid-cols-4 lg:grid-cols-5">
              {(mega === "all" ? tops : tops.filter((t) => t.id === mega)).map((t) => (
                <div key={t.id}>
                  <button
                    onClick={() => { onTopCategory(t.id); setMega(null); }}
                    className="mb-2 flex items-center gap-2 text-sm font-bold text-black hover:text-yellow-600"
                  >
                    <span>{t.emoji}</span> {t.name} <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <ul className="space-y-1">
                    {t.mids.slice(0, 6).map((m) => (
                      <li key={m.id} className="text-xs text-gray-600">
                        {m.name} <span className="text-gray-300">({m.ends.length})</span>
                      </li>
                    ))}
                    {t.mids.length > 6 && <li className="text-[11px] font-semibold text-yellow-600">+{t.mids.length - 6} more sub-departments</li>}
                  </ul>
                </div>
              ))}
              {mega === "all" && (
                <div className="rounded-xl bg-yellow-50 p-4">
                  <MapPin className="h-5 w-5 text-yellow-600" />
                  <p className="mt-1 text-sm font-bold">44+ Retail Stores</p>
                  <p className="mt-0.5 text-[11px] text-gray-600">Verified partners across Maharashtra — Pune, Ahmednagar, Kolhar, Supa.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* mobile category strip */}
      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 bg-black px-3 py-2 scrollbar-hide md:hidden">
        {tops.map((t) => (
          <button
            key={t.id}
            onClick={() => onTopCategory(t.id)}
            className="whitespace-nowrap rounded-full border border-gray-700 px-3 py-1 text-[11px] font-medium text-gray-200"
          >
            {t.emoji} {t.name}
          </button>
        ))}
      </div>
    </header>
  );
}
