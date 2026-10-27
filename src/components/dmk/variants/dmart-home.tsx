"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BadgePercent, ChevronDown, MapPin, ReceiptIndianRupee, Search,
  ShieldCheck, ShoppingCart, User,
} from "lucide-react";
import { formatINR } from "@/lib/store";
import { discountPct, type DProduct, type VariantData } from "@/lib/types";
import { ProductDialog } from "../product-dialog";
import {
  DesignLinks, DesignSwitcher, VariantSearchDialog, useVariantCart,
} from "./variant-shared";

/* ------------------------------ deal tile ------------------------------ */

function DealTile({
  p, onOpen, onAdd, wide,
}: {
  p: DProduct; onOpen: (p: DProduct) => void; onAdd: (p: DProduct) => void; wide?: boolean;
}) {
  const disc = discountPct(p.mrp, p.basePrice);
  const out = p.stock <= 0;
  return (
    <div className={`group flex flex-col overflow-hidden rounded-lg border bg-white transition hover:shadow-md ${wide ? "w-[190px] shrink-0" : ""}`}>
      <button onClick={() => onOpen(p)} className="relative block aspect-square w-full overflow-hidden bg-gray-50">
        <Image src={p.image} alt={p.name} fill sizes="200px" className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
        {disc > 0 && (
          <span className="absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {disc}% OFF
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <button onClick={() => onOpen(p)} className="line-clamp-2 min-h-[32px] text-left text-xs font-medium leading-tight text-gray-800">
          {p.name}
        </button>
        <p className="text-[10px] text-gray-400">Pack of {p.packSize} units</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-gray-900">{formatINR(p.basePrice)}</span>
          {p.mrp > p.basePrice && <span className="text-[10px] text-gray-400 line-through">{formatINR(p.mrp)}</span>}
        </div>
        <button
          disabled={out}
          onClick={() => onAdd(p)}
          className="mt-auto w-full rounded-md bg-yellow-400 py-1.5 text-[11px] font-bold text-black transition hover:bg-yellow-300 disabled:bg-gray-100 disabled:text-gray-400"
        >
          {out ? "Out of stock" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------- page ---------------------------------- */

export function DmartHome({ data }: { data: VariantData }) {
  const { tops, sliders, deals, featured, hot, catProducts, stats } = data;
  const { count, add } = useVariantCart();
  const [detail, setDetail] = useState<DProduct | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);

  const n = Math.max(sliders.length, 1);
  const s = sliders[slide % n];
  const photoA = deals[0] ?? featured[0];
  const photoB = featured[1] ?? deals[1];

  const gridRow = useMemo(() => {
    if (cat && catProducts[cat]?.length) return catProducts[cat];
    return [...(hot.length ? hot : featured), ...deals].slice(0, 12);
  }, [cat, catProducts, hot, featured, deals]);
  const catName = tops.find((t) => t.id === cat)?.name;

  const onCat = (id: string) => {
    setCat(id === cat ? null : id);
    document.getElementById("shop-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (n <= 1) return;
    const t = setInterval(() => setSlide((i) => i + 1), 5000);
    return () => clearInterval(t);
  }, [n]);

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-gray-900">
      {/* ============================== header ============================== */}
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/home/dmart" className="flex items-center gap-2.5">
            <Image src="/dmk-logo.png" alt="DMK Mart" width={44} height={44} className="h-11 w-11 rounded-full" unoptimized />
            <span className="leading-tight">
              <span className="block text-lg font-extrabold tracking-tight">DMK Mart</span>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-yellow-600">
                Everyday Low Prices, Always.
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <button className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 md:flex">
              <MapPin className="h-4 w-4 text-yellow-600" /> Pune, MH
            </button>
            <button className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 md:flex">
              <User className="h-4 w-4" /> Sign in
            </button>
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white transition hover:bg-gray-800"
            >
              <ShoppingCart className="h-4 w-4 text-yellow-400" />
              {count} {count === 1 ? "case" : "cases"}
            </Link>
          </div>
        </div>
        {/* search */}
        <div className="mx-auto max-w-7xl px-4 pb-3">
          <form
            onSubmit={(e) => { e.preventDefault(); setSearchOpen(true); }}
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-3.5 py-2.5"
          >
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              onFocus={() => setSearchOpen(true)}
              placeholder="Search 2,400+ products — steel bottles, buckets, planters…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              readOnly
            />
            <button type="submit" className="hidden rounded-md bg-yellow-400 px-3 py-1 text-[11px] font-bold text-black sm:block">
              Search
            </button>
          </form>
        </div>
        {/* category nav */}
        <nav className="border-t bg-white">
          <div className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 py-2 text-[13px] font-semibold text-gray-700 scrollbar-hide">
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

      {/* =============================== hero ============================== */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-4">
        <div className="grid overflow-hidden rounded-xl bg-yellow-400 lg:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col justify-center gap-4 p-6 md:p-10">
            <span className="w-fit rounded-full bg-black px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-yellow-400">
              Wholesale Bazaar
            </span>
            <h1 className="text-3xl font-black leading-tight tracking-tight text-black md:text-4xl">
              {s?.heading ?? "Everyday Low Prices on 2,400+ SKUs"}
            </h1>
            <p className="max-w-md text-sm font-medium text-black/70">
              {s?.content ?? "Dealer rates across 14 departments and 21 trusted brands — one cart, one invoice, delivered across Maharashtra."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => document.getElementById("shop-grid")?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-lg bg-black px-6 py-3 text-xs font-black uppercase tracking-wide text-yellow-400 transition hover:bg-gray-800"
              >
                Shop All Products
              </button>
              <button
                onClick={() => document.getElementById("deals-row")?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-lg border-2 border-black px-6 py-3 text-xs font-black uppercase tracking-wide text-black transition hover:bg-black hover:text-yellow-400"
              >
                Today&apos;s Deals
              </button>
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-black/70">
              <span>✓ Dealer rates</span><span>✓ Itemised invoice</span><span>✓ Free delivery above ₹5,000</span>
            </p>
          </div>
          <div className="relative hidden min-h-[300px] lg:block">
            {photoA && (
              <div className="absolute left-6 top-8 w-[56%] overflow-hidden rounded-lg border-4 border-white bg-white shadow-lg">
                <div className="relative aspect-square">
                  <Image src={photoA.image} alt={photoA.name} fill sizes="320px" className="object-cover" priority unoptimized />
                </div>
                <p className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold">
                  <span className="line-clamp-1">{photoA.name}</span>
                  <span className="text-yellow-600">{formatINR(photoA.basePrice)}</span>
                </p>
              </div>
            )}
            {photoB && (
              <div className="absolute bottom-6 right-4 w-[42%] overflow-hidden rounded-lg border-4 border-white bg-white shadow-lg">
                <div className="relative aspect-square">
                  <Image src={photoB.image} alt={photoB.name} fill sizes="220px" className="object-cover" unoptimized />
                </div>
              </div>
            )}
          </div>
        </div>
        {n > 1 && (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {sliders.slice(0, 3).map((sl, i) => (
              <button
                key={sl.id}
                onClick={() => setSlide(i)}
                aria-label={`Slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === slide % n ? "w-6 bg-black" : "w-2 bg-gray-300"}`}
              />
            ))}
          </div>
        )}
      </section>

      {/* ======================= category circles ======================== */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-8">
        <h2 className="mb-3 text-base font-extrabold">Shop by Category</h2>
        <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide md:grid md:grid-cols-7 md:overflow-visible lg:grid-cols-[repeat(14,minmax(0,1fr))]">
          {tops.map((t) => (
            <button key={t.id} onClick={() => onCat(t.id)} className="group flex w-20 shrink-0 flex-col items-center gap-2 md:w-auto">
              <span className={`overflow-hidden rounded-full border transition ${cat === t.id ? "ring-2 ring-black ring-offset-2" : "group-hover:border-yellow-500"}`}>
                <span className="relative block h-20 w-20">
                  <Image src={t.image} alt={t.name} fill sizes="80px" className="object-cover" unoptimized />
                </span>
              </span>
              <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-gray-700 group-hover:text-black">
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ========================= deals of the day ======================= */}
      <section id="deals-row" className="mx-auto w-full max-w-7xl px-4 pt-8">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold">
              <BadgePercent className="h-5 w-5 text-red-600" /> Deals of the Day
            </h2>
            <p className="text-xs text-gray-500">Deepest dealer discounts — refresh daily at midnight</p>
          </div>
          <button
            onClick={() => document.getElementById("shop-grid")?.scrollIntoView({ behavior: "smooth" })}
            className="text-xs font-bold text-yellow-700 hover:underline"
          >
            View All →
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide md:grid md:grid-cols-6 md:overflow-visible">
          {deals.slice(0, 12).map((p) => (
            <DealTile key={p.id} p={p} onOpen={setDetail} onAdd={add} wide />
          ))}
        </div>
      </section>

      {/* =========================== value strip ========================== */}
      <section className="mt-8 border-y bg-gray-50">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-5 sm:grid-cols-3">
          {[
            { icon: BadgePercent, t: "Wholesale dealer rates", s: "Transparent pricing with slab discounts on large orders" },
            { icon: ShieldCheck, t: "100% genuine stock", s: "Direct from 21 verified brands — no middlemen" },
            { icon: ReceiptIndianRupee, t: "Itemised invoice on every order", s: "Clear per-line billing for business buyers" },
          ].map((v) => (
            <div key={v.t} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-400/30">
                <v.icon className="h-5 w-5 text-black" />
              </span>
              <div>
                <p className="text-sm font-bold">{v.t}</p>
                <p className="text-[11px] text-gray-500">{v.s}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================ shop grid =========================== */}
      <section id="shop-grid" className="mx-auto w-full max-w-7xl px-4 pt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-extrabold">{catName ? `Best of ${catName}` : "Best Sellers"}</h2>
          {catName && (
            <button
              onClick={() => setCat(null)}
              className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-200"
            >
              Clear filter <ChevronDown className="h-3 w-3 rotate-180" />
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{stats.products.toLocaleString("en-IN")} active SKUs</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {gridRow.map((p) => (
            <DealTile key={p.id} p={p} onOpen={setDetail} onAdd={add} />
          ))}
        </div>
      </section>

      {/* ============================== footer ============================ */}
      <footer className="mt-auto bg-black text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Image src="/dmk-logo.png" alt="DMK Mart" width={40} height={40} className="h-10 w-10 rounded-full" unoptimized />
              <p className="text-lg font-extrabold">DMK Mart</p>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-400">
              Maharashtra&apos;s everyday wholesale bazaar for retailers, resellers and institutional buyers.
            </p>
          </div>
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-wider text-yellow-400">Shop</p>
            <ul className="space-y-2 text-xs text-gray-300">
              <li><Link href="/" className="hover:underline">All Products</Link></li>
              <li><Link href="/" className="hover:underline">Brands</Link></li>
              <li><Link href="/" className="hover:underline">Partner Stores</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-wider text-yellow-400">Company</p>
            <ul className="space-y-2 text-xs text-gray-300">
              <li><Link href="/" className="hover:underline">Bulk Enquiry</Link></li>
              <li><Link href="/" className="hover:underline">About DMK</Link></li>
              <li><Link href="/admin" className="hover:underline">Admin Portal</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-wider text-yellow-400">Support</p>
            <ul className="space-y-2 text-xs text-gray-300">
              <li>Track order</li>
              <li>Returns &amp; replacement</li>
              <li>care@dmkmart.in</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4">
            <p className="text-[11px] text-gray-500">© 2026 DMK Mart · Everyday low prices for business buyers</p>
            <DesignLinks dark />
          </div>
        </div>
      </footer>

      <ProductDialog p={detail} onClose={() => setDetail(null)} />
      <VariantSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <DesignSwitcher current="/home/dmart" />
    </div>
  );
}
