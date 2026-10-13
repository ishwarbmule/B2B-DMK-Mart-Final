"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BadgePercent, CreditCard, Layers, MapPin, ShoppingCart, Timer, Truck, Zap,
} from "lucide-react";
import { formatINR } from "@/lib/store";
import { discountPct, type DProduct, type VariantData } from "@/lib/types";
import { ProductDialog } from "../product-dialog";
import {
  DesignLinks, DesignSwitcher, useCountdown, useVariantCart,
} from "./variant-shared";

/* --------------------------- vs deal card ------------------------------ */

function VsDealCard({
  p, onOpen, onAdd, progress = true,
}: {
  p: DProduct; onOpen: (p: DProduct) => void; onAdd: (p: DProduct) => void; progress?: boolean;
}) {
  const disc = discountPct(p.mrp, p.basePrice);
  const out = p.stock <= 0;
  const save = Math.max(0, Math.round((p.mrp - p.basePrice) * 100) / 100);
  const claimed = Math.min(95, Math.max(35, 100 - p.stock));
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border bg-white transition hover:shadow-lg">
      {disc > 0 && (
        <span className="absolute left-0 top-2 z-10 rounded-r-full bg-red-600 px-2.5 py-1 text-[11px] font-black text-white shadow">
          {disc}% OFF
        </span>
      )}
      <button onClick={() => onOpen(p)} className="relative block aspect-square w-full overflow-hidden bg-gray-50">
        <Image src={p.image} alt={p.name} fill sizes="200px" className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
      </button>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <button onClick={() => onOpen(p)} className="line-clamp-2 min-h-[30px] text-left text-[11px] font-semibold leading-tight text-gray-900">
          {p.name}
        </button>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-black text-gray-900">{formatINR(p.basePrice)}</span>
          {p.mrp > p.basePrice && <span className="text-[10px] text-gray-400 line-through">{formatINR(p.mrp)}</span>}
        </div>
        {save > 0 && (
          <span className="w-fit rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">Save {formatINR(save)}</span>
        )}
        {progress && (
          <div className="mt-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-red-500" style={{ width: `${claimed}%` }} />
            </div>
            <p className="mt-0.5 text-[9px] font-semibold text-gray-400">{claimed}% claimed — hurry!</p>
          </div>
        )}
        <button
          disabled={out}
          onClick={() => onAdd(p)}
          className="mt-auto w-full rounded-lg bg-red-600 py-2 text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {out ? "Sold Out" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- page --------------------------------- */

const MARQUEE = [
  "WHOLESALE DAYS LIVE",
  "UP TO 65% OFF MRP",
  "EXTRA 10% ON 5+ CASES",
  "FREE DELIVERY ABOVE ₹5,000",
  "GST INVOICE ON EVERY ORDER",
];

export function VijaySalesHome({ data }: { data: VariantData }) {
  const { tops, companies, deals, hot, featured, top, sliders, catProducts } = data;
  const { count, add } = useVariantCart();
  const [detail, setDetail] = useState<DProduct | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const timeLeft = useCountdown();

  const hero = sliders[0];
  const sideA = hot[0] ?? deals[1];
  const sideB = featured[1] ?? top[0] ?? deals[2];

  const hotRow = (cat && catProducts[cat]?.length ? catProducts[cat] : [...deals, ...(hot.length ? hot : featured)]).slice(0, 12);
  const catName = tops.find((t) => t.id === cat)?.name;

  const onCat = (id: string) => {
    setCat(id === cat ? null : id);
    document.getElementById("hot-deals")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 font-sans text-gray-900">
      {/* ============================ announcement ========================= */}
      <div className="overflow-hidden bg-yellow-400 py-1.5">
        <div className="flex w-max animate-dmk-marquee gap-10">
          {[...MARQUEE, ...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={i} className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-black tracking-wide text-black">
              <Zap className="h-3 w-3" /> {m}
            </span>
          ))}
        </div>
      </div>

      {/* ============================== header ============================= */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/home/vijaysales" className="flex shrink-0 items-center gap-2">
            <Image src="/dmk-logo.png" alt="DMK Mart" width={40} height={40} className="h-10 w-10 rounded-full" unoptimized />
            <span className="text-xl font-black tracking-tight">DMK MART</span>
          </Link>
          <form onSubmit={(e) => e.preventDefault()} className="hidden flex-1 overflow-hidden rounded-lg border-2 border-black md:flex">
            <input
              placeholder="Search for bottles, cookware, storage…"
              className="w-full px-4 py-2.5 text-sm outline-none placeholder:text-gray-400"
              onFocus={() => document.getElementById("hot-deals")?.scrollIntoView({ behavior: "smooth" })}
              readOnly
            />
            <button type="submit" className="bg-red-600 px-5 text-xs font-black uppercase tracking-wide text-white hover:bg-red-700">
              Search
            </button>
          </form>
          <div className="ml-auto flex items-center gap-3">
            <button className="hidden items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold text-gray-700 md:flex">
              <MapPin className="h-4 w-4 text-red-600" /> Your Store
            </button>
            <Link href="/" className="relative flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Cart</span>
              {count > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[9px] font-black text-red-600">{count}</span>
              )}
            </Link>
          </div>
        </div>
        <nav className="border-t border-gray-100 bg-white">
          <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4 py-2 text-[13px] font-bold text-gray-800 scrollbar-hide">
            {tops.map((t) => (
              <button
                key={t.id}
                onClick={() => onCat(t.id)}
                className={`whitespace-nowrap transition hover:text-red-600 ${cat === t.id ? "text-red-600" : ""}`}
              >
                {t.name}
              </button>
            ))}
            <span className="ml-auto hidden shrink-0 text-[11px] font-black uppercase tracking-wide text-red-600 md:block">
              Bulk Order Form →
            </span>
          </div>
        </nav>
      </header>

      {/* ============================ hero banners ========================= */}
      <section className="mx-auto grid w-full max-w-7xl gap-3 px-4 pt-4 lg:grid-cols-3">
        <div className="relative min-h-[320px] overflow-hidden rounded-xl lg:col-span-2">
          {hero?.image ? (
            <Image src={hero.image} alt={hero.heading} fill sizes="700px" className="object-cover" priority unoptimized />
          ) : (
            <Image src={deals[0]?.image ?? ""} alt="Hero" fill sizes="700px" className="object-cover" unoptimized />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
          <div className="relative flex h-full flex-col items-start justify-center gap-3 p-8 md:p-10">
            <span className="rounded bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-black">
              Limited Time · Wholesale Days
            </span>
            <h1 className="max-w-sm text-3xl font-black leading-tight text-white md:text-4xl">
              {hero?.heading ?? "Maha Wholesale Savings"}
            </h1>
            <p className="max-w-sm text-sm text-gray-200">{hero?.content ?? "Dealer rates on 2,400+ SKUs — slab discounts stack on bulk cases."}</p>
            <button
              onClick={() => document.getElementById("deal-day")?.scrollIntoView({ behavior: "smooth" })}
              className="mt-1 rounded-lg bg-red-600 px-7 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-red-700"
            >
              Grab the Deal
            </button>
          </div>
        </div>
        <div className="grid gap-3">
          {[
            { p: sideA, label: sideA?.name ?? "Featured Stock" },
            { p: sideB, label: sideB?.name },
          ].map((b, i) =>
            b.p ? (
              <button key={i} onClick={() => setDetail(b.p!)} className="group relative min-h-[154px] flex-1 overflow-hidden rounded-xl bg-white text-left">
                <Image src={b.p.image} alt={b.p.name} fill sizes="320px" className="object-cover transition duration-500 group-hover:scale-105" unoptimized />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <p className="line-clamp-1 text-sm font-black text-white">{b.label ?? b.p.name}</p>
                  <p className="text-[11px] font-black uppercase tracking-wide text-yellow-400">Shop Now →</p>
                </div>
              </button>
            ) : null
          )}
        </div>
      </section>

      {/* =========================== bank offers ========================== */}
      <section className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-3 px-4 pt-4 md:grid-cols-4">
        {[
          { icon: CreditCard, t: "10% Off · HDFC Cards", s: "On orders above ₹5,000" },
          { icon: BadgePercent, t: "No-Cost EMI", s: "3–12 months on bulk carts" },
          { icon: Layers, t: "Extra 5% Slab", s: "On 25+ cases per order" },
          { icon: Truck, t: "Free Delivery", s: "Above ₹5,000 · Maharashtra" },
        ].map((o) => (
          <div key={o.t} className="flex items-center gap-3 rounded-xl border bg-white p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
              <o.icon className="h-5 w-5 text-red-600" />
            </span>
            <div>
              <p className="text-xs font-black">{o.t}</p>
              <p className="text-[10px] text-gray-500">{o.s}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ========================= deal of the day ======================== */}
      <section id="deal-day" className="mx-auto w-full max-w-7xl px-4 pt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-t-xl bg-red-600 px-4 py-3 text-white md:px-5">
          <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-wide">
            <Timer className="h-5 w-5" /> Deal of the Day
          </h2>
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-black px-3 py-1.5 font-mono text-sm font-black tracking-wider text-yellow-400">{timeLeft}</span>
            <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-white/85 sm:block">Ends at midnight</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-b-xl border border-t-0 bg-white p-3 md:grid-cols-4">
          {deals.slice(0, 8).map((p) => (
            <VsDealCard key={p.id} p={p} onOpen={setDetail} onAdd={add} />
          ))}
        </div>
      </section>

      {/* ======================= shop by department ======================= */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-8">
        <h2 className="mb-3 text-lg font-black">Shop by Department</h2>
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide md:grid md:grid-cols-7 md:overflow-visible">
          {tops.map((t) => {
            const min = (catProducts[t.id] ?? []).reduce((m, p) => Math.min(m, p.basePrice), Infinity);
            return (
              <button
                key={t.id}
                onClick={() => onCat(t.id)}
                className={`group relative aspect-[4/5] w-[150px] shrink-0 overflow-hidden rounded-xl md:w-auto ${cat === t.id ? "ring-2 ring-red-600" : ""}`}
              >
                <Image src={t.image} alt={t.name} fill sizes="170px" className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3 text-left">
                  <p className="line-clamp-2 text-xs font-black leading-tight text-white">{t.name}</p>
                  <p className="mt-0.5 text-[10px] font-bold text-yellow-400">
                    From {Number.isFinite(min) ? formatINR(min) : "₹—"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ============================ hot deals =========================== */}
      <section id="hot-deals" className="mx-auto w-full max-w-7xl px-4 pt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black">{catName ? `${catName} — Wholesale Zone` : "Hot Deals of the Week"}</h2>
          {catName && (
            <button onClick={() => setCat(null)} className="rounded-full bg-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-300">
              Clear
            </button>
          )}
          <span className="ml-auto text-xs font-bold text-red-600">New offers every Friday</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {hotRow.map((p) => (
            <VsDealCard key={p.id} p={p} onOpen={setDetail} onAdd={add} progress={false} />
          ))}
        </div>
      </section>

      {/* =========================== top brands =========================== */}
      <section className="mx-auto w-full max-w-7xl px-4 py-8">
        <h2 className="mb-3 text-lg font-black">Shop by Brand</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
          {companies.slice(0, 14).map((c) => (
            <div key={c.id} className="flex flex-col items-center gap-1.5 rounded-xl border bg-white p-3 transition hover:shadow-md">
              <span className="relative block h-10 w-10">
                <Image src={c.logo} alt={c.name} fill sizes="40px" className="object-contain" unoptimized />
              </span>
              <p className="line-clamp-1 text-center text-[10px] font-bold">{c.name}</p>
              <p className="text-[9px] text-gray-400">{c._count?.products ?? 0} SKUs</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================== footer ============================= */}
      <footer className="mt-auto bg-black text-gray-300">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
          <div>
            <p className="text-lg font-black text-white">DMK MART</p>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              Wholesale that moves fast — daily deals, slab pricing and same-week dispatch.
            </p>
            <p className="mt-3 text-xs">1800-DMK-MART · care@dmkmart.in</p>
          </div>
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-yellow-400">Shop</p>
            <ul className="space-y-2 text-xs">
              <li><Link href="/" className="hover:text-white">All Products</Link></li>
              <li><Link href="/" className="hover:text-white">Deal of the Day</Link></li>
              <li><Link href="/admin" className="hover:text-white">Admin Portal</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-yellow-400">Policies</p>
            <ul className="space-y-2 text-xs">
              <li>Shipping &amp; delivery</li>
              <li>Returns &amp; replacement</li>
              <li>Privacy policy</li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-yellow-400">We Accept</p>
            <p className="text-xs leading-relaxed">UPI · Visa · Mastercard · NetBanking · COD</p>
            <p className="mt-2 text-[10px] text-gray-500">EMI available on 9 leading bank cards</p>
          </div>
        </div>
        <div className="border-t border-white/10 py-4">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4">
            <p className="text-[11px] text-gray-500">© 2026 DMK Mart · Deals refresh daily at midnight</p>
            <DesignLinks dark />
          </div>
        </div>
      </footer>

      <ProductDialog p={detail} onClose={() => setDetail(null)} />
      <DesignSwitcher current="/home/vijaysales" />
    </div>
  );
}
