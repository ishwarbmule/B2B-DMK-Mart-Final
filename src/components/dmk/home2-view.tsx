"use client";

/**
 * Home-2 — "Everyday Essentials" retail-style homepage (second homepage URL).
 * Layout mirrors the approved demo: warm hero with USP chips → Shop by Category
 * circles → Shop by Price bands → Sponsored Ads banners → Top Selling grid →
 * Top Companies logo wall. Runs on the live catalog + real cart.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, Heart, Megaphone, Minus, Plus, ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "./site-header-v2";
import { HeroBanner } from "./hero-banner";
import { toCartItem } from "./product-card";
import { useCartStore, formatINR, lineKey } from "@/lib/store";
import { discountPct, type DProduct } from "@/lib/types";
import { useHydrated } from "@/hooks/use-hydrated";

type AdRow = { id: string; title: string; image: string; link: string; active: boolean; brand?: { name: string; slug: string } | null };

/* --------------------------------- shared bits --------------------------------- */

function SectionHead({
  pre, amber, fire, href, viewAll = true,
}: { pre: string; amber?: string; fire?: boolean; href?: string; viewAll?: boolean }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="flex items-center gap-1.5 text-lg font-black text-gray-900 md:text-xl">
        {pre} {amber && <span className="text-amber-500">{amber}</span>} {fire && <span aria-hidden>🔥</span>}
      </h2>
      {viewAll && href && (
        <Link href={href} className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:underline">
          View All <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------ hero ------------------------------------- */

function Hero2() {
  return <HeroBanner />;
}

/* ------------------------------- category circles ------------------------------ */

function CategoryCircles() {
  const catalog = useCatalog();
  const tops = catalog?.tops ?? [];
  if (!tops.length) return null;
  return (
    <section>
      <SectionHead pre="Shop by" amber="Category" href="/catalog" />
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide md:grid md:grid-cols-9 md:overflow-visible">
        {tops.map((t) => (
          <Link key={t.id} href={`/catalog?top=${t.id}`} className="group flex w-20 shrink-0 flex-col items-center gap-2 md:w-auto">
            <span className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-full ring-1 ring-gray-200 transition group-hover:ring-[3px] group-hover:ring-amber-400 md:h-24 md:w-24">
              <Image src={t.image || "/dmk-logo.png"} alt={t.name} fill sizes="96px" className="object-cover" unoptimized />
            </span>
            <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-gray-700 group-hover:text-gray-900">
              {t.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- price bands --------------------------------- */

const BANDS = [
  { label: "Under ₹199", sub: "Budget Buys", min: "", max: "199", bg: "bg-[#FFF6E0]", link: "/catalog?maxPrice=199&sort=price_asc" },
  { label: "₹200 – ₹499", sub: "Best Value", min: "200", max: "499", bg: "bg-sky-50", link: "/catalog?minPrice=200&maxPrice=499" },
  { label: "₹500 – ₹999", sub: "Premium", min: "500", max: "999", bg: "bg-amber-50", link: "/catalog?minPrice=500&maxPrice=999" },
  { label: "₹1000 +", sub: "Bulk Luxury", min: "1000", max: "", bg: "bg-gray-50", link: "/catalog?minPrice=1000" },
];

function ShopByPrice() {
  const [picks, setPicks] = useState<(DProduct | null)[]>([null, null, null, null]);
  useEffect(() => {
    BANDS.forEach((b, i) => {
      const q = new URLSearchParams({ limit: "3" });
      if (b.min) q.set("minPrice", b.min);
      if (b.max) q.set("maxPrice", b.max);
      fetch(`/api/products?${q.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          const arr = (d.products ?? []) as DProduct[];
          const pick = arr.find((p) => p.image?.startsWith("http")) ?? arr[0] ?? null;
          setPicks((prev) => {
            const next = [...prev];
            next[i] = pick;
            return next;
          });
        })
        .catch(() => {});
    });
  }, []);

  return (
    <section>
      <SectionHead pre="Shop by" amber="Price" href="/catalog" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BANDS.map((b, i) => (
          <Link
            key={b.label}
            href={b.link}
            className={`group flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-4 transition hover:shadow-md ${b.bg}`}
          >
            <span>
              <span className="block text-base font-black text-gray-900">{b.label}</span>
              <span className="mt-0.5 block text-[11px] font-semibold text-gray-500 group-hover:text-gray-700">{b.sub}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 opacity-0 transition group-hover:opacity-100">
                Explore <ArrowRight className="h-3 w-3" />
              </span>
            </span>
            <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white/70 ring-1 ring-black/5">
              {picks[i] ? (
                <Image src={picks[i]!.image || "/dmk-logo.png"} alt={picks[i]!.name} fill sizes="80px" className="object-cover" unoptimized />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-gray-300">DMK</span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------- sponsored ads -------------------------------- */

function SponsoredAds() {
  const catalog = useCatalog();
  const ads = ((catalog?.ads ?? []) as AdRow[]).filter((a) => a.active).slice(0, 4);
  if (!ads.length) return null;
  return (
    <section>
      <SectionHead pre="Sponsored" amber="Ads" href="/brands" />
      {/* 4 well-formatted ad slots in 16:9 frames — content comes from admin Ad inputs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ads.map((a) => (
          <Link
            key={a.id}
            href={a.brand?.slug ? `/brand/${a.brand.slug}` : a.link || "#"}
            className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm"
            aria-label={a.title}
          >
            {a.image ? (
              <Image
                src={a.image}
                alt={a.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="object-cover transition duration-300 group-hover:scale-[1.03]"
                unoptimized
              />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#FFF6E0] to-[#FBE8B4] text-center">
                <Megaphone className="h-6 w-6 text-yellow-500" />
                <span className="px-3 text-xs font-bold text-gray-800">{a.title}</span>
              </span>
            )}
            <span className="absolute right-2 top-2 rounded bg-white/85 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600">
              Ad
            </span>
            <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-full bg-yellow-400 px-3 py-1.5 text-[11px] font-bold text-black shadow transition group-hover:bg-yellow-300">
              Shop Now <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ top selling cards ------------------------------ */

function TopSellingCard({ p }: { p: DProduct }) {
  const hydrated = useHydrated();
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const setQty = useCartStore((s) => s.setQty);
  const [wish, setWish] = useState(false);
  const key = lineKey(p.id, "SINGLE");
  const inCart = hydrated ? items.find((i) => lineKey(i.id, i.unitType) === key)?.qty ?? 0 : 0;
  const disc = discountPct(p.mrp, p.dealerPrice);
  const out = p.stock <= 0;
  const href = p.slug ? `/product/${p.slug}` : "#";

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-white transition hover:shadow-lg hover:shadow-black/5">
      <span className="absolute left-0 top-2 z-10 rounded-r-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black shadow-sm">
        Top Seller
      </span>
      <button
        onClick={() => setWish((w) => !w)}
        aria-label="Add to wishlist"
        className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1.5 shadow-sm transition hover:scale-110"
      >
        <Heart className={`h-4 w-4 ${wish ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
      </button>

      <Link href={href} className="relative block aspect-square w-full overflow-hidden bg-gray-50">
        <Image
          src={p.image || "/dmk-logo.png"}
          alt={p.name}
          fill
          sizes="(max-width: 640px) 50vw, 280px"
          className="object-cover transition duration-300 group-hover:scale-105"
          unoptimized
        />
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link href={href} className="line-clamp-2 min-h-[34px] text-[13px] font-semibold leading-tight text-gray-900 hover:text-amber-700">
          {p.name}
        </Link>
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {p.brand?.name}{p.packQty ? ` · Pack of ${p.packQty}` : ""}
        </p>
        <div className="mt-auto flex items-baseline gap-1.5 pt-1">
          <span className="text-base font-black text-gray-900">{formatINR(p.dealerPrice)}</span>
          {p.mrp > p.dealerPrice && (
            <>
              <span className="text-[11px] text-gray-400 line-through">{formatINR(p.mrp)}</span>
              {disc > 0 && <span className="text-[11px] font-bold text-emerald-600">{disc}% off</span>}
            </>
          )}
        </div>

        {out ? (
          <button disabled className="mt-2 w-full cursor-not-allowed rounded-lg bg-gray-100 py-2 text-xs font-bold text-gray-400">
            Out of stock
          </button>
        ) : hydrated && inCart > 0 ? (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-yellow-400 px-1 py-1">
            <button onClick={() => setQty(key, inCart - 1)} aria-label="Decrease" className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-black/10">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-bold">{inCart} pc</span>
            <button onClick={() => setQty(key, inCart + 1)} aria-label="Increase" className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-black/10">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              addItem(toCartItem(p, "SINGLE"), 1);
              toast.success(`Added ${p.name} (1 pc)`);
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-yellow-400 py-2 text-xs font-bold text-black transition hover:bg-yellow-300"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Add to Cart
          </button>
        )}
      </div>
    </div>
  );
}

function TopSelling() {
  const [rows, setRows] = useState<DProduct[]>([]);
  useEffect(() => {
    fetch("/api/products?flag=top&limit=8")
      .then((r) => r.json())
      .then((d) => setRows((d.products ?? []) as DProduct[]))
      .catch(() => {});
  }, []);
  if (!rows.length) return null;
  return (
    <section>
      <SectionHead pre="Top Selling Products" fire href="/catalog?flag=top" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((p) => <TopSellingCard key={p.id} p={p} />)}
      </div>
    </section>
  );
}

/* -------------------------------- top companies -------------------------------- */

function TopCompanies() {
  const catalog = useCatalog();
  const brands = (catalog?.brands ?? []).slice(0, 14);
  if (!brands.length) return null;
  return (
    <section>
      <SectionHead pre="Top" amber="Companies" href="/brands" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {brands.map((b) => (
          <Link
            key={b.id}
            href={`/brand/${b.slug}`}
            title={b.name}
            className="flex h-20 items-center justify-center rounded-xl border bg-white p-3 transition hover:border-amber-300 hover:shadow-md"
          >
            {b.logo ? (
              <Image src={b.logo} alt={b.name} width={80} height={44} className="h-10 w-auto max-w-full object-contain" unoptimized />
            ) : (
              <span className="text-center text-xs font-black leading-tight text-gray-500">{b.name}</span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------ view ------------------------------------- */

export function Home2View() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
      <Hero2 />
      <CategoryCircles />
      <ShopByPrice />
      <SponsoredAds />
      <TopSelling />
      <TopCompanies />
    </div>
  );
}
