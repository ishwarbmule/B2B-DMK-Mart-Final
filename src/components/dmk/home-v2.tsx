"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BadgePercent, Boxes, Building2, ChevronRight, ClipboardList,
  Clock3, Flame, Package2, Percent, ReceiptIndianRupee, Star, Truck, Warehouse,
} from "lucide-react";
import type { CompanyNode, DProduct, SliderRow, TopCategoryNode } from "@/lib/types";
import { discountPct, formatFree } from "@/lib/home-utils";
import { ProductCard } from "./product-card";
import { formatINR } from "@/lib/store";

/* ---------------------------------- Hero V2 ---------------------------------- */

export function HeroV2({
  sliders,
  hot,
  featured,
  stats,
  onShopAll,
  onDeals,
}: {
  sliders: SliderRow[];
  hot: DProduct[];
  featured: DProduct[];
  stats: { products: number; stores: number; companies: number };
  onShopAll: () => void;
  onDeals: () => void;
}) {
  const n = sliders.length;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (n <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 4500);
    return () => clearInterval(t);
  }, [n]);

  const withPhotos = useMemo(
    () => [...hot, ...featured].filter((p) => p.image.startsWith("http")).slice(0, 5),
    [hot, featured]
  );
  const main = withPhotos[0];
  const side = withPhotos.slice(1, 3);
  const chip = withPhotos[3] ?? withPhotos[0];
  const s = sliders[idx];

  return (
    <section className="relative overflow-hidden rounded-3xl bg-black text-white">
      {/* glow + dot texture */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-yellow-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-yellow-400/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{ backgroundImage: "radial-gradient(#fbbf24 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />

      <div className="relative grid gap-6 p-6 md:p-10 lg:grid-cols-[1.05fr_0.95fr] lg:p-12">
        {/* left — copy */}
        <div className="flex flex-col justify-center gap-5">
          <span className="w-fit rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-400">
            B2B Wholesale Marketplace
          </span>
          <h1 className="text-3xl font-black leading-[1.08] tracking-tight md:text-5xl">
            {s?.heading ?? "Maha Wholesale Savings"}
            <span className="text-yellow-400">.</span>
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-gray-300 md:text-base">
            {s?.content ?? "Dealer rates on 2,400+ SKUs across 21 trusted brands — delivered across Maharashtra."}
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onShopAll}
              className="group flex items-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 text-xs font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 md:text-sm"
            >
              Start Ordering
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={onDeals}
              className="flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-xs font-bold uppercase tracking-wide text-white transition hover:border-yellow-400 hover:text-yellow-400 md:text-sm"
            >
              <Flame className="h-4 w-4" /> Today&apos;s Deals
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4">
            {[
              { icon: Boxes, label: "Live SKUs", value: `${stats.products.toLocaleString("en-IN")}+` },
              { icon: Building2, label: "Brands", value: `${stats.companies}` },
              { icon: Warehouse, label: "Partner Stores", value: `${stats.stores}+` },
            ].map((st) => (
              <div key={st.label} className="flex items-center gap-2">
                <st.icon className="h-4 w-4 text-yellow-400" />
                <div>
                  <p className="text-sm font-black leading-none">{st.value}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400">{st.label}</p>
                </div>
              </div>
            ))}
          </div>

          {n > 1 && (
            <div className="flex gap-1.5">
              {sliders.map((sl, i) => (
                <button
                  key={sl.id}
                  onClick={() => setIdx(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? "w-7 bg-yellow-400" : "w-2 bg-white/25"}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* right — live product collage */}
        <div className="relative hidden min-h-[380px] lg:block">
          {main && (
            <button
              onClick={onDeals}
              className="group absolute left-2 top-6 w-[62%] rotate-[-3deg] overflow-hidden rounded-2xl border-4 border-yellow-400/90 bg-white shadow-2xl shadow-black/60 transition hover:rotate-0"
            >
              <div className="relative aspect-square">
                <Image src={main.image} alt={main.name} fill sizes="360px" className="object-cover" priority unoptimized />
              </div>
              <div className="flex items-center justify-between bg-black px-3 py-2">
                <p className="line-clamp-1 text-left text-[11px] font-bold text-white">{main.name}</p>
                <p className="shrink-0 text-[11px] font-black text-yellow-400">{formatINR(main.basePrice)}</p>
              </div>
            </button>
          )}
          {side[0] && (
            <button
              onClick={onDeals}
              className="group absolute bottom-4 right-2 w-[46%] rotate-[4deg] overflow-hidden rounded-2xl bg-white shadow-xl transition hover:rotate-0"
            >
              <div className="relative aspect-[4/3]">
                <Image src={side[0].image} alt={side[0].name} fill sizes="260px" className="object-cover" unoptimized />
              </div>
              <p className="line-clamp-1 px-2.5 py-1.5 text-left text-[10px] font-bold text-black">{side[0].name}</p>
            </button>
          )}
          {side[1] && (
            <button
              onClick={onDeals}
              className="absolute bottom-28 left-0 w-[34%] rotate-[-6deg] overflow-hidden rounded-2xl bg-white shadow-xl transition hover:rotate-0"
            >
              <div className="relative aspect-square">
                <Image src={side[1].image} alt={side[1].name} fill sizes="200px" className="object-cover" unoptimized />
              </div>
            </button>
          )}
          {chip && (
            <div className="absolute right-6 top-2 rotate-[6deg] rounded-xl bg-yellow-400 px-3 py-2 text-black shadow-lg">
              <p className="text-[9px] font-bold uppercase tracking-wide">Flat</p>
              <p className="-mt-0.5 text-xl font-black leading-none">
                {Math.max(...withPhotos.map((p) => discountPct(p.mrp, p.basePrice)), 0)}%
              </p>
              <p className="text-[9px] font-bold uppercase">Off MRP</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Category rail ------------------------------- */

export function CategoryRail({
  tops,
  onOpen,
}: {
  tops: TopCategoryNode[];
  onOpen: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-900 md:text-xl">Browse Departments</h2>
          <p className="text-xs text-gray-500">{tops.length} departments · 300+ end categories</p>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {tops.map((t) => (
          <button
            key={t.id}
            onClick={() => onOpen(t.id)}
            className="group flex shrink-0 items-center gap-2 rounded-full border bg-white py-2 pl-3 pr-4 transition hover:border-black hover:bg-black"
          >
            <span className="text-base leading-none">{t.emoji}</span>
            <span className="whitespace-nowrap text-xs font-bold text-gray-800 transition group-hover:text-yellow-400">
              {t.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------- Deals bento -------------------------------- */

function useCountdown() {
  const [left, setLeft] = useState("--:--:--");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const diff = Math.max(0, end.getTime() - now.getTime());
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const sec = Math.floor((diff % 60_000) / 1000);
      setLeft(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return left;
}

function DealCard({ p, onOpen, big }: { p: DProduct; onOpen: (p: DProduct) => void; big?: boolean }) {
  const disc = discountPct(p.mrp, p.basePrice);
  return (
    <button
      onClick={() => onOpen(p)}
      className={`group relative overflow-hidden rounded-2xl border bg-white text-left transition hover:shadow-lg ${big ? "row-span-2 min-h-[280px] md:min-h-[360px]" : "min-h-[150px]"}`}
    >
      <div className="relative h-full w-full">
        <Image src={p.image} alt={p.name} fill sizes={big ? "420px" : "240px"} className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">
          <BadgePercent className="h-3 w-3" /> {disc}% OFF
        </span>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className={`line-clamp-1 font-bold text-white ${big ? "text-sm md:text-base" : "text-xs"}`}>{p.name}</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className={`font-black text-yellow-400 ${big ? "text-lg md:text-xl" : "text-sm"}`}>{formatINR(p.basePrice)}</span>
            <span className="text-[10px] text-gray-300">/unit · MRP {formatINR(p.mrp)}</span>
          </div>
          {big && (
            <p className="mt-1 text-[11px] font-semibold text-yellow-400">
              Case of {p.packSize}: {formatINR(Math.round(p.basePrice * p.packSize * 100) / 100)}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export function DealsBento({
  hot,
  deals,
  stats,
  onOpen,
  onSeeAll,
}: {
  hot: DProduct[];
  deals: DProduct[];
  stats: { products: number; stores: number };
  onOpen: (p: DProduct) => void;
  onSeeAll: () => void;
}) {
  const timeLeft = useCountdown();
  const pool = useMemo(() => {
    const scored = [...hot, ...deals]
      .filter((p) => p.image.startsWith("http") && p.mrp > p.basePrice)
      .sort((a, b) => discountPct(b.mrp, b.basePrice) - discountPct(a.mrp, a.basePrice));
    return scored.slice(0, 4);
  }, [hot, deals]);

  if (pool.length < 2) return null;
  const [big, ...rest] = pool;

  return (
    <section id="deals">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-gray-900 md:text-xl">
            <Flame className="h-5 w-5 text-red-500" /> Today&apos;s Bulk Deals
          </h2>
          <p className="text-xs text-gray-500">Deepest dealer discounts — refreshes at midnight</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 font-mono text-sm font-black tracking-wider text-yellow-400">
            <Clock3 className="h-3.5 w-3.5" /> {timeLeft}
          </span>
          <Link
            href="#catalog"
            onClick={(e) => { e.preventDefault(); onSeeAll(); }}
            className="text-xs font-bold text-yellow-700 hover:underline"
          >
            View All →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:grid-rows-2">
        <DealCard p={big} onOpen={onOpen} big />
        {rest.slice(0, 2).map((p) => (
          <DealCard key={p.id} p={p} onOpen={onOpen} />
        ))}

        {/* promo tile */}
        <div className="flex flex-col justify-between rounded-2xl bg-yellow-400 p-4 text-black">
          <BadgePercent className="h-6 w-6" />
          <div>
            <p className="text-xl font-black leading-tight md:text-2xl">Up to {Math.max(...pool.map((p) => discountPct(p.mrp, p.basePrice)))}% off MRP</p>
            <p className="mt-1 text-[11px] font-semibold opacity-80">Slab discounts stack on dealer rates</p>
          </div>
        </div>

        {rest.slice(2, 3).map((p) => (
          <DealCard key={p.id} p={p} onOpen={onOpen} />
        ))}

        {/* stats tile */}
        <div className="flex flex-col justify-between rounded-2xl bg-black p-4 text-white">
          <Truck className="h-6 w-6 text-yellow-400" />
          <div>
            <p className="text-xl font-black leading-tight md:text-2xl">{stats.stores}+ partner stores</p>
            <p className="mt-1 text-[11px] font-semibold text-gray-400">Maharashtra-wide dispatch · GST invoice on every order</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Tabbed showcase ------------------------------ */

const TABS = [
  { key: "featured", label: "Featured" },
  { key: "top", label: "Top Selling" },
  { key: "hot", label: "Hot Deals" },
  { key: "deals", label: "Budget Bulk" },
] as const;

export function TabbedShowcase({
  rows,
  onOpen,
  onSeeAll,
}: {
  rows: { featured: DProduct[]; hot: DProduct[]; top: DProduct[]; deals: DProduct[] };
  onOpen: (p: DProduct) => void;
  onSeeAll: (tab: string) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("featured");
  const products = rows[tab];
  if (!products.length) return null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto rounded-xl bg-gray-100 p-1 scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition ${
                tab === t.key ? "bg-black text-yellow-400 shadow" : "text-gray-600 hover:text-black"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Link
          href="#catalog"
          onClick={(e) => { e.preventDefault(); onSeeAll(tab); }}
          className="text-xs font-bold text-yellow-700 hover:underline"
        >
          View All →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {products.slice(0, 12).map((p) => (
          <ProductCard key={p.id} p={p} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

/* ---------------------------- Department cards ------------------------------ */

export function DeptCards({
  tops,
  onOpen,
}: {
  tops: (TopCategoryNode & { count?: number })[];
  onOpen: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-black text-gray-900 md:text-xl">Wholesale Departments</h2>
        <p className="text-xs text-gray-500">Tap a department to see case-wise dealer pricing</p>
      </div>
      <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 scrollbar-hide md:mx-0 md:grid md:grid-cols-4 md:px-0 lg:grid-cols-5">
        {tops.map((t, i) => (
          <button
            key={t.id}
            onClick={() => onOpen(t.id)}
            className={`group relative w-[150px] shrink-0 snap-start overflow-hidden rounded-2xl border text-left transition hover:shadow-lg md:w-auto ${
              i % 5 === 0 ? "md:row-span-2 md:aspect-[3/4]" : "aspect-[4/5]"
            }`}
          >
            <Image src={t.image} alt={t.name} fill sizes="220px" className="object-cover transition duration-300 group-hover:scale-105" unoptimized />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className="line-clamp-2 text-xs font-bold leading-tight text-white">{t.name}</p>
              <p className="mt-0.5 text-[10px] font-semibold text-yellow-400">{t.count ?? 0} SKUs · Shop now →</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- How it works ------------------------------- */

export function HowItWorks({ freeAbove }: { freeAbove?: string }) {
  const steps = [
    { icon: ClipboardList, title: "Pick your cases", sub: "Browse 2,400+ SKUs with transparent dealer & slab rates" },
    { icon: Package2, title: "Add cases to cart", sub: `Order in case multiples · free delivery above ${formatFree(freeAbove)}` },
    { icon: ReceiptIndianRupee, title: "Get GST invoice", sub: "18% GST breakdown, dispatch tracking & credit support" },
  ];
  return (
    <section className="relative overflow-hidden rounded-3xl bg-black px-6 py-8 text-white md:px-10">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-400/15 blur-3xl" />
      <div className="relative">
        <h2 className="text-lg font-black md:text-xl">Ordering on DMK Mart is simple</h2>
        <p className="text-xs text-gray-400">Built for retailers, resellers & institutional buyers</p>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="relative flex gap-4">
              <span className="absolute -left-1 -top-3 text-4xl font-black text-yellow-400/20 md:text-5xl">{i + 1}</span>
              <div className="ml-4 flex flex-col gap-1.5">
                <s.icon className="h-5 w-5 text-yellow-400" />
                <p className="text-sm font-bold">{s.title}</p>
                <p className="text-xs leading-relaxed text-gray-400">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Brand marquee ------------------------------- */

export function BrandMarquee({
  companies,
  onBrand,
}: {
  companies: CompanyNode[];
  onBrand: (id: string) => void;
}) {
  const doubled = [...companies, ...companies];
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-gray-900 md:text-xl">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-500" /> 21 Trusted Brands
          </h2>
          <p className="text-xs text-gray-500">Direct-from-manufacturer dealer pricing · tap a brand to browse</p>
        </div>
      </div>
      <div className="group relative overflow-hidden rounded-2xl border bg-white py-4">
        <div className="flex w-max animate-dmk-marquee gap-3 group-hover:[animation-play-state:paused]">
          {doubled.map((c, i) => (
            <button
              key={`${c.id}-${i}`}
              onClick={() => onBrand(c.id)}
              className="flex w-36 shrink-0 flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition hover:bg-yellow-50"
            >
              <Image src={c.logo} alt={c.name} width={56} height={56} className="h-14 w-14 rounded-lg object-cover" unoptimized />
              <p className="line-clamp-1 text-[11px] font-bold text-gray-800">{c.name}</p>
              <p className="text-[10px] text-gray-400">{c._count?.products ?? 0} SKUs</p>
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent" />
      </div>
    </section>
  );
}
