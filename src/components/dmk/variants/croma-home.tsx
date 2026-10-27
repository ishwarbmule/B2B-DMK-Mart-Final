"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, ChevronDown, Headphones, Heart, ReceiptIndianRupee,
  ShieldCheck, ShoppingCart, Star, Truck, User,
} from "lucide-react";
import { formatINR } from "@/lib/store";
import { discountPct, type DProduct, type VariantData } from "@/lib/types";
import { ProductDialog } from "../product-dialog";
import {
  DesignLinks, DesignSwitcher, VariantSearchDialog, useCountdown, useVariantCart,
} from "./variant-shared";

/* ---------------------------- croma tiles ------------------------------ */

function DealCardDark({ p, onOpen, onAdd }: { p: DProduct; onOpen: (p: DProduct) => void; onAdd: (p: DProduct) => void }) {
  const disc = discountPct(p.mrp, p.basePrice);
  const out = p.stock <= 0;
  return (
    <div className="flex w-[210px] shrink-0 flex-col rounded-xl border border-white/10 bg-[#141414] p-3 transition hover:border-yellow-400/40">
      <button onClick={() => onOpen(p)} className="relative block aspect-square w-full overflow-hidden rounded-lg bg-white">
        <Image src={p.image} alt={p.name} fill sizes="200px" className="object-cover" unoptimized />
        {disc > 0 && (
          <span className="absolute left-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">{disc}% OFF</span>
        )}
      </button>
      <button onClick={() => onOpen(p)} className="mt-2 line-clamp-2 min-h-[30px] text-left text-[11px] font-medium leading-tight text-gray-200">
        {p.name}
      </button>
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-yellow-400/90">10% off with HDFC Cards</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-sm font-black text-yellow-400">{formatINR(p.basePrice)}</span>
        {p.mrp > p.basePrice && <span className="text-[10px] text-gray-500 line-through">{formatINR(p.mrp)}</span>}
      </div>
      <button
        disabled={out}
        onClick={() => onAdd(p)}
        className="mt-2 w-full rounded-lg bg-yellow-400 py-1.5 text-[11px] font-black text-black transition hover:bg-yellow-300 disabled:bg-white/10 disabled:text-gray-500"
      >
        {out ? "Sold Out" : "Add to Cart"}
      </button>
    </div>
  );
}

function RateCard({ p, onOpen, onAdd }: { p: DProduct; onOpen: (p: DProduct) => void; onAdd: (p: DProduct) => void }) {
  const disc = discountPct(p.mrp, p.basePrice);
  const out = p.stock <= 0;
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-white transition hover:shadow-md">
      <button onClick={() => onOpen(p)} className="relative block aspect-square w-full overflow-hidden bg-gray-50">
        <Image src={p.image} alt={p.name} fill sizes="220px" className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
      </button>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{p.company?.name}</p>
        <button onClick={() => onOpen(p)} className="line-clamp-2 min-h-[30px] text-left text-xs font-medium leading-tight text-gray-900">
          {p.name}
        </button>
        <p className="flex items-center gap-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className={`h-2.5 w-2.5 ${i < 4 ? "fill-amber-400 text-amber-400" : "fill-amber-400/50 text-amber-400"}`} />
          ))}
          <span className="ml-1 text-[9px] text-gray-400">4.{(p.packSize % 6) + 3}</span>
        </p>
        <div className="mt-auto flex items-baseline gap-1.5 pt-1">
          <span className="text-sm font-bold text-gray-900">{formatINR(p.basePrice)}</span>
          {p.mrp > p.basePrice && <span className="text-[10px] text-gray-400 line-through">{formatINR(p.mrp)}</span>}
        </div>
        <button
          disabled={out}
          onClick={() => onAdd(p)}
          className="mt-1.5 w-full rounded-lg bg-black py-1.5 text-[11px] font-bold text-white transition hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400"
        >
          {out ? "Sold Out" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- page --------------------------------- */

export function CromaHome({ data }: { data: VariantData }) {
  const { tops, companies, deals, hot, featured, top, catProducts, sliders, stats } = data;
  const { count, add } = useVariantCart();
  const [detail, setDetail] = useState<DProduct | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const timeLeft = useCountdown();

  const hero = deals[0] ?? featured[0];
  const sideA = hot[0] ?? deals[1];
  const sideB = featured[1] ?? top[0] ?? deals[2];

  const rated = (cat && catProducts[cat]?.length ? catProducts[cat] : [...(hot.length ? hot : featured), ...deals]).slice(0, 12);
  const catName = tops.find((t) => t.id === cat)?.name;

  const onCat = (id: string) => {
    setCat(id === cat ? null : id);
    document.getElementById("rated")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 font-sans text-gray-900">
      {/* ============================ utility bar =========================== */}
      <div className="bg-black text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 text-[11px]">
          <p className="flex items-center gap-1.5">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            India&apos;s Trusted B2B Wholesale Partner
          </p>
          <div className="hidden gap-5 md:flex">
            <Link href="/" className="hover:text-yellow-400">Bulk Enquiry</Link>
            <Link href="/" className="hover:text-yellow-400">Track Order</Link>
            <Link href="/admin" className="hover:text-yellow-400">Admin</Link>
          </div>
        </div>
      </div>

      {/* ============================== header ============================= */}
      <header className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-3">
          <Link href="/home/croma" className="flex shrink-0 items-center gap-2">
            <Image src="/dmk-logo.png" alt="DMK Mart" width={38} height={38} className="h-10 w-10 rounded-full" unoptimized />
            <span className="text-lg font-black tracking-tight">DMK<span className="text-yellow-500">Mart</span></span>
          </Link>
          <form
            onSubmit={(e) => { e.preventDefault(); setSearchOpen(true); }}
            className="hidden flex-1 items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5 md:flex"
          >
            <button type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
            </button>
            <input
              onFocus={() => setSearchOpen(true)}
              readOnly
              placeholder="Search wholesale products — bottles, cookers, planters…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </form>
          <div className="ml-auto flex items-center gap-4">
            <User className="hidden h-5 w-5 text-gray-700 md:block" />
            <Heart className="hidden h-5 w-5 text-gray-700 md:block" />
            <Link href="/" className="relative flex items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-bold text-white">
              <ShoppingCart className="h-4 w-4 text-yellow-400" />
              <span className="hidden sm:inline">Cart</span>
              {count > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-400 px-1 text-[9px] font-black text-black">{count}</span>
              )}
            </Link>
          </div>
        </div>
        <nav className="border-t border-gray-100">
          <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 py-2 text-[13px] font-semibold text-gray-700 scrollbar-hide">
            <button onClick={() => onCat("")} className="flex items-center gap-1 whitespace-nowrap text-black">
              All Menu <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {tops.map((t) => (
              <button
                key={t.id}
                onClick={() => onCat(t.id)}
                className={`whitespace-nowrap transition hover:text-black ${cat === t.id ? "text-black underline decoration-yellow-400 decoration-2 underline-offset-8" : ""}`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* =============================== hero ============================= */}
      <section className="mx-auto grid w-full max-w-7xl gap-3 px-4 pt-4 lg:grid-cols-3">
        <div className="relative min-h-[300px] overflow-hidden rounded-xl bg-black lg:col-span-2">
          {hero && (
            <Image src={hero.image} alt={hero.name} fill sizes="700px" className="object-cover opacity-70" priority unoptimized />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
          <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-yellow-400/20 blur-3xl" />
          <div className="relative flex h-full flex-col justify-center gap-3 p-8 md:p-10">
            <span className="w-fit rounded bg-yellow-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-black">
              {sliders[0]?.heading ? "Limited Period" : "Mega Wholesale Days"}
            </span>
            <h1 className="max-w-md text-3xl font-black leading-tight text-white md:text-4xl">
              {sliders[0]?.heading ?? "Mega Wholesale Days are live"}
            </h1>
            <p className="max-w-sm text-sm text-gray-300">
              {sliders[0]?.content ?? "Dealer pricing on 2,400+ SKUs. Extra slab discounts stack automatically on large orders."}
            </p>
            <div className="mt-2 flex gap-3">
              <button
                onClick={() => document.getElementById("deals-dark")?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-lg bg-yellow-400 px-6 py-3 text-xs font-black uppercase tracking-wide text-black transition hover:bg-yellow-300"
              >
                Shop Deals
              </button>
              <button
                onClick={() => document.getElementById("rated")?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-lg border border-white/30 px-6 py-3 text-xs font-bold uppercase tracking-wide text-white transition hover:border-yellow-400 hover:text-yellow-400"
              >
                Best Rated
              </button>
            </div>
          </div>
        </div>
        <div className="grid gap-3">
          {[sideA, sideB].map((p) =>
            p ? (
              <button
                key={p.id}
                onClick={() => setDetail(p)}
                className="group relative min-h-[142px] flex-1 overflow-hidden rounded-xl bg-white"
              >
                <Image src={p.image} alt={p.name} fill sizes="320px" className="object-cover transition duration-500 group-hover:scale-105" unoptimized />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-3 left-3 text-left">
                  <p className="line-clamp-1 max-w-[200px] text-xs font-bold text-white">{p.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-yellow-400">
                    Shop now <ArrowRight className="h-3 w-3" />
                  </p>
                </div>
              </button>
            ) : null
          )}
        </div>
      </section>

      {/* ========================= deals of the day ======================== */}
      <section id="deals-dark" className="mx-auto w-full max-w-7xl px-4 pt-6">
        <div className="rounded-2xl bg-black p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-black text-white">Deals of the Day</h2>
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-3 py-1.5 font-mono text-sm font-black tracking-wider text-yellow-400">
                {timeLeft}
              </span>
              <button onClick={() => onCat("")} className="text-xs font-black uppercase tracking-wide text-yellow-400 hover:underline">
                View All
              </button>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {deals.slice(0, 10).map((p) => (
              <DealCardDark key={p.id} p={p} onOpen={setDetail} onAdd={add} />
            ))}
          </div>
        </div>
      </section>

      {/* ========================= shop by category ======================== */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-8">
        <h2 className="mb-3 text-lg font-black">Shop by Category</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {tops.map((t) => (
            <button
              key={t.id}
              onClick={() => onCat(t.id)}
              className={`rounded-xl bg-white p-3 text-center transition hover:shadow-md ${cat === t.id ? "ring-2 ring-black" : ""}`}
            >
              <span className="relative mx-auto block h-20 w-full max-w-[100px]">
                <Image src={t.image} alt={t.name} fill sizes="110px" className="object-contain" unoptimized />
              </span>
              <p className="mt-2 line-clamp-1 text-xs font-bold">{t.name}</p>
              <p className="text-[10px] text-gray-400">{t.productCount ?? 0} SKUs</p>
            </button>
          ))}
        </div>
      </section>

      {/* ============================ top brands ========================== */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-8">
        <div className="rounded-2xl border bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">Top Brands</h2>
            <Link href="/" className="text-xs font-bold text-gray-500 hover:text-black">View all {stats.companies} →</Link>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
            {companies.slice(0, 14).map((c) => (
              <div key={c.id} className="flex flex-col items-center gap-1.5 rounded-xl bg-gray-50 p-3 transition hover:bg-yellow-50">
                <span className="relative block h-10 w-10">
                  <Image src={c.logo} alt={c.name} fill sizes="40px" className="object-contain" unoptimized />
                </span>
                <p className="line-clamp-1 text-[10px] font-semibold">{c.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================== best rated =========================== */}
      <section id="rated" className="mx-auto w-full max-w-7xl px-4 pt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black">{catName ? `Top ${catName} Picks` : "Best Rated by Retailers"}</h2>
          {catName && (
            <button onClick={() => setCat(null)} className="rounded-full bg-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-300">
              Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {rated.map((p) => (
            <RateCard key={p.id} p={p} onOpen={setDetail} onAdd={add} />
          ))}
        </div>
      </section>

      {/* ========================== service strip ========================== */}
      <section className="mt-10 border-y bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-7 md:grid-cols-4">
          {[
            { icon: Truck, t: "Express Dispatch", s: "48-hour dispatch across Maharashtra" },
            { icon: ShieldCheck, t: "100% Genuine", s: "Sourced direct from brands" },
            { icon: ReceiptIndianRupee, t: "Itemised Invoice", s: "Clear per-line billing on every order" },
            { icon: Headphones, t: "Dedicated B2B Support", s: "Key-account managers on call" },
          ].map((x) => (
            <div key={x.t} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-yellow-400">
                <x.icon className="h-5 w-5 text-black" />
              </span>
              <div>
                <p className="text-sm font-bold">{x.t}</p>
                <p className="text-[11px] text-gray-500">{x.s}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================== footer ============================= */}
      <footer className="mt-auto bg-black text-gray-300">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
          <div>
            <p className="text-lg font-black text-white">DMK<span className="text-yellow-400">Mart</span></p>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              Wholesale technology for the next generation of Indian retailers.
            </p>
          </div>
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-yellow-400">Shop</p>
            <ul className="space-y-2 text-xs">
              <li><Link href="/" className="hover:text-white">All Products</Link></li>
              <li><Link href="/" className="hover:text-white">Deals of the Day</Link></li>
              <li><Link href="/" className="hover:text-white">Brands</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-yellow-400">Support</p>
            <ul className="space-y-2 text-xs">
              <li>Bulk Enquiry</li>
              <li>Shipping &amp; Returns</li>
              <li><Link href="/admin" className="hover:text-white">Admin Portal</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-yellow-400">Reach Us</p>
            <ul className="space-y-2 text-xs">
              <li>1800-DMK-MART (toll free)</li>
              <li>care@dmkmart.in</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4">
            <p className="text-[11px] text-gray-500">© 2026 DMK Mart · Wholesale prices as marked</p>
            <DesignLinks dark />
          </div>
        </div>
      </footer>

      <ProductDialog p={detail} onClose={() => setDetail(null)} />
      <VariantSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <DesignSwitcher current="/home/croma" />
    </div>
  );
}
