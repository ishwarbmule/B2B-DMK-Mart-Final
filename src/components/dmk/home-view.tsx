"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgePercent, Building2, LayoutGrid, Megaphone, PackageCheck, PhoneCall, Star, Truck, ChevronLeft, ChevronRight } from "lucide-react";
import { useCatalog } from "./site-header-v2";
import { HeroBanner } from "./hero-banner";
import { ProductCard, ProductCardMini } from "./product-card";
import type { DProduct } from "@/lib/types";
import { formatINR } from "@/lib/store";

/* ─────────────── Homepage section config (Website Management → Homepage Editor) ─────────────── */
export type HomeSectionCfg = { id: string; visible: boolean; title?: string; sub?: string };

export const HOME_SECTIONS: { id: string; label: string; hasTitle: boolean; hasSub: boolean }[] = [
  { id: "offerHero", label: "Offer Hero (auto from Offers)", hasTitle: false, hasSub: false },
  { id: "brandStrip", label: "Shop by Brand", hasTitle: true, hasSub: false },
  { id: "couponStrip", label: "Live Coupons", hasTitle: true, hasSub: false },
  { id: "categoryGrid", label: "Shop by Category", hasTitle: true, hasSub: true },
  { id: "dealsRail", label: "Deals of the Day", hasTitle: true, hasSub: true },
  { id: "tabbedShowcase", label: "Product Showcase (tabs)", hasTitle: false, hasSub: false },
  { id: "adsStrip", label: "Brand Ads Showcase", hasTitle: true, hasSub: false },
  { id: "deptCards", label: "Wholesale Departments", hasTitle: true, hasSub: false },
  { id: "trustStrip", label: "Trust Badges", hasTitle: false, hasSub: false },
  { id: "howItWorks", label: "How It Works", hasTitle: true, hasSub: false },
];

const DEFAULT_ORDER = HOME_SECTIONS.map((s) => s.id);

function parseSections(raw: string | undefined): HomeSectionCfg[] {
  if (!raw) return DEFAULT_ORDER.map((id) => ({ id, visible: true }));
  try {
    const arr = JSON.parse(raw) as HomeSectionCfg[];
    if (!Array.isArray(arr)) throw new Error("bad");
    // keep any new sections the editor doesn't know yet, in editor order
    const known = arr.filter((s) => DEFAULT_ORDER.includes(s.id));
    for (const id of DEFAULT_ORDER) if (!known.some((s) => s.id === id)) known.push({ id, visible: true });
    return known;
  } catch {
    return DEFAULT_ORDER.map((id) => ({ id, visible: true }));
  }
}

/* ─────────────── Hero banner + live stats (artwork: upload IMG-20261014-ART0003) ─────────────── */
function OfferHero() {
  const stat = useCatalog()?.stats;

  return (
    <section>
      <HeroBanner />
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-600">
        <span className="rounded-lg bg-black/5 px-3 py-1.5"><b className="text-gray-900">{stat?.products ?? 2272}</b> SKUs live</span>
        <span className="rounded-lg bg-black/5 px-3 py-1.5"><b className="text-gray-900">{stat?.brands ?? 39}</b> brands</span>
        <span className="rounded-lg bg-black/5 px-3 py-1.5"><b className="text-gray-900">4</b> price tiers</span>
        <span className="rounded-lg bg-black/5 px-3 py-1.5"><b className="text-gray-900">OTP</b> safe delivery</span>
      </div>
    </section>
  );
}

function CollageImg({ seed }: { seed: string }) {
  const [srcs, setSrcs] = useState<string[]>([]);
  useEffect(() => {
    fetch(`/api/products?limit=6&flag=featured&page=${seed === "a" ? 1 : seed === "b" ? 2 : 3}`)
      .then((r) => r.json())
      .then((d) => setSrcs((d.products ?? []).map((p: DProduct) => p.image).filter(Boolean)))
      .catch(() => {});
  }, [seed]);
  const src = srcs[Math.abs(seed.charCodeAt(0) * 7) % Math.max(1, srcs.length)] || "/dmk-logo.png";
  return <Image src={src} alt="DMK Mart products" fill sizes="200px" className="object-cover" unoptimized />;
}

/* ─────────────── Brand strip ─────────────── */
function BrandStrip({ title }: { title?: string }) {
  const catalog = useCatalog();
  const brands = (catalog?.brands ?? []).slice(0, 16);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
          <Building2 className="h-5 w-5 text-yellow-500" /> {title || "Shop by Brand"}
        </h2>
        <Link href="/brands" className="text-xs font-bold text-yellow-600 hover:underline">View all brands →</Link>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {brands.map((b) => (
          <Link key={b.id} href={`/brand/${b.slug}`} className="group flex flex-col items-center gap-2 rounded-2xl border bg-white p-3 transition hover:border-yellow-400 hover:shadow-md">
            <span className="flex h-14 w-14 items-center justify-center overflow-hidden">
              {b.logo ? (
                <Image src={b.logo} alt={b.name} width={56} height={56} className="h-14 w-14 object-contain transition group-hover:scale-110" unoptimized />
              ) : (
                <span className="text-lg font-black text-gray-300">{b.name.slice(0, 2).toUpperCase()}</span>
              )}
            </span>
            <span className="line-clamp-1 text-[11px] font-bold text-gray-800">{b.name}</span>
            <span className="text-[10px] text-gray-400">{b._count?.products ?? 0} SKUs</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─────────────── Coupon creatives (auto from admin) ─────────────── */
function CouponStrip({ title }: { title?: string }) {
  const catalog = useCatalog();
  const coupons = catalog?.homeCoupons ?? [];
  if (!coupons.length) return null;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
          <BadgePercent className="h-5 w-5 text-yellow-500" /> {title || "Live Coupons — apply at checkout"}
        </h2>
        <Link href="/catalog" className="text-xs font-bold text-yellow-600 hover:underline">Start ordering →</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {coupons.map((c) => (
          <div key={c.id} className="relative overflow-hidden rounded-2xl p-4 shadow-md" style={{ background: c.bgColor, color: c.textColor }}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full border-4 border-white/10" />
            <div className="pointer-events-none absolute -bottom-8 -left-4 h-24 w-24 rounded-full border-4 border-white/10" />
            <p className="text-lg font-black leading-tight">{c.headline}</p>
            <p className="mt-1 text-[11px] opacity-80">{c.subText}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="rounded-lg border border-dashed border-current px-3 py-1 text-sm font-black tracking-widest">{c.code}</span>
              <span className="text-[10px] opacity-70">Min {formatINR(c.minOrder)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────── Shop by Category (image cards, before Deals of the Day) ─────────────── */
function CategoryGrid({ title, sub }: { title?: string; sub?: string }) {
  const catalog = useCatalog();
  // only categories with live (active) inventory — 0-SKU tops stay visible in the All Departments menu
  const tops = (catalog?.tops ?? []).filter((t) => (t.productCount ?? 0) > 0);
  if (!tops.length) return null;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
            <LayoutGrid className="h-5 w-5 text-yellow-500" /> {title || "Shop by Category"}
          </h2>
          <p className="text-[11px] text-gray-500">{sub || "All wholesale departments in one row — tap to browse"}</p>
        </div>
        <Link href="/catalog" className="text-xs font-bold text-yellow-600 hover:underline">Browse all products →</Link>
      </div>
      {/* single scrollable row — small image cards, one per top category */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:gap-4 [scrollbar-width:thin]">
        {tops.map((t) => (
          <Link
            key={t.id}
            href={`/catalog?top=${t.id}`}
            className="group w-[108px] shrink-0 snap-start md:w-[132px]"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl border bg-white shadow-sm transition group-hover:border-yellow-400 group-hover:shadow-md">
              {t.image ? (
                <Image
                  src={t.image}
                  alt={t.name}
                  fill
                  sizes="132px"
                  className="object-cover transition duration-300 group-hover:scale-105"
                  unoptimized
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FFF6E0] to-[#FBE8B4] text-4xl">{t.emoji}</span>
              )}
              <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-bold text-yellow-400">
                {t.productCount ?? 0}
              </span>
            </div>
            <p className="mt-1.5 truncate text-center text-[11px] font-bold text-gray-900 md:text-xs">{t.name}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─────────────── Product row / tabs ─────────────── */
function useFlagRows() {
  const [rows, setRows] = useState<{ featured: DProduct[]; top: DProduct[]; hot: DProduct[]; deals: DProduct[] }>({ featured: [], top: [], hot: [], deals: [] });
  useEffect(() => {
    const get = async (extra: string) => {
      const r = await fetch(`/api/products?limit=12&${extra}`);
      const d = await r.json();
      return (d.products ?? []) as DProduct[];
    };
    Promise.all([get("flag=featured"), get("flag=top"), get("flag=hot"), get("flag=deal")]).then(([featured, top, hot, deals]) =>
      setRows({ featured, top, hot, deals })
    );
  }, []);
  return rows;
}

function DealsRail({ deals, title, sub }: { deals: DProduct[]; title?: string; sub?: string }) {
  if (!deals.length) return null;
  return (
    <section className="rounded-2xl bg-gradient-to-r from-red-600 to-red-500 p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-white px-3 py-1.5 text-lg font-black text-red-600">DEALS</span>
          <div>
            <p className="text-base font-black text-white md:text-xl">{title || "Deals of the Day"}</p>
            <p className="text-[11px] text-red-100">{sub || "Extra margin on today's picks — while stocks last"}</p>
          </div>
        </div>
        <Link href="/catalog?flag=deal" className="flex items-center gap-1 rounded-lg bg-black/30 px-3 py-2 text-xs font-bold text-white hover:bg-black/50">
          View All <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {deals.map((p) => <ProductCardMini key={p.id} p={p} />)}
      </div>
    </section>
  );
}

const TABS = [
  { key: "featured", label: "Featured Picks" },
  { key: "top", label: "Top Selling" },
  { key: "hot", label: "Hot Products" },
] as const;

function TabbedShowcase() {
  const rows = useFlagRows();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("featured");
  const products = rows[tab];
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-xs font-bold transition ${
              tab === t.key ? "bg-black text-yellow-400" : "border bg-white text-gray-600 hover:border-yellow-400"
            }`}
          >
            {t.label}
          </button>
        ))}
        <Link href={`/catalog?flag=${tab}`} className="ml-auto text-xs font-bold text-yellow-600 hover:underline">See all →</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {products.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
    </section>
  );
}

/* ─────────────── Brand Ads showcase (uniform cards below the product list) ─────────────── */
type AdRow = { id: string; title: string; image: string; link: string; active: boolean; brand?: { name: string; slug: string } | null };

function AdsStrip({ title }: { title?: string }) {
  const catalog = useCatalog();
  const ads = ((catalog?.ads ?? []) as AdRow[]).filter((a) => a.active).slice(0, 4);
  if (!ads.length) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-black text-gray-900">
        <Megaphone className="h-5 w-5 text-yellow-500" /> {title || "Sponsored Promotions"}
      </h2>
      {/* 4 well-formatted ad slots in 16:9 frames — content comes from admin Ad inputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ads.map((a) => (
          <Link
            key={a.id}
            href={a.brand?.slug ? `/brand/${a.brand.slug}` : a.link || "#"}
            className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm transition hover:shadow-md"
            aria-label={a.title}
          >
            {a.image ? (
              <Image src={a.image} alt={a.title} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" unoptimized />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#FFF6E0] to-[#FBE8B4] text-center">
                <Megaphone className="h-6 w-6 text-yellow-500" />
                <span className="px-3 text-xs font-bold text-gray-800">{a.title}</span>
                <span className="text-[10px] font-semibold text-gray-500">Tap to explore →</span>
              </span>
            )}
            <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-yellow-400">Ad</span>
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pb-2 pt-7 text-[11px] font-bold text-white">
              {a.brand?.name || a.title}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─────────────── Departments ─────────────── */
function DeptCards({ title }: { title?: string }) {
  const catalog = useCatalog();
  const tops = catalog?.tops ?? [];
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-black text-gray-900">
        <PackageCheck className="h-5 w-5 text-yellow-500" /> {title || "Wholesale Departments"}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tops.map((t, i) => (
          <Link
            key={t.id}
            href={`/catalog?top=${t.id}`}
            className={`flex flex-col justify-between rounded-2xl border bg-white p-4 transition hover:border-yellow-400 hover:shadow-md ${i === 0 ? "sm:col-span-2 sm:row-span-1" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{t.emoji}</span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </div>
            <div className="mt-4">
              <p className="text-sm font-bold leading-tight text-gray-900">{t.name}</p>
              <p className="text-[11px] text-gray-400">{t.productCount ?? 0} SKUs · {t.mids.length} sub-categories</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─────────────── How it works ─────────────── */
function HowItWorks({ title }: { title?: string }) {
  const steps = [
    { icon: Building2, title: "Create B2B Account", text: "Register as retailer, wholesaler or distributor — get your price tier after approval." },
    { icon: PackageCheck, title: "Order Pieces, Packs or Cases", text: "Every product supports single pieces, full packs and bulk cases with transparent pricing." },
    { icon: Truck, title: "OTP-verified Delivery", text: "A 4-digit OTP is printed on your invoice — share it only when your order arrives." },
  ];
  return (
    <section className="rounded-2xl bg-black p-6 md:p-10">
      <h2 className="text-center text-xl font-black text-white md:text-2xl">{title || "Built for Serious B2B Buyers"}</h2>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={i} className="relative rounded-2xl border border-gray-800 bg-gray-950 p-5">
            <span className="absolute -top-3 left-5 rounded-full bg-yellow-400 px-2.5 py-0.5 text-[11px] font-black text-black">STEP {i + 1}</span>
            <s.icon className="h-7 w-7 text-yellow-400" />
            <p className="mt-3 text-sm font-bold text-white">{s.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">{s.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl bg-yellow-400 p-5 md:flex-row">
        <div>
          <p className="text-lg font-black text-black">Need a custom quote for container loads?</p>
          <p className="text-xs text-black/70">Talk to our wholesale desk — slab pricing up to 16% off.</p>
        </div>
        <a href="tel:+919822012345" className="flex items-center gap-2 rounded-xl bg-black px-6 py-3 text-sm font-bold text-yellow-400 hover:bg-gray-900">
          <PhoneCall className="h-4 w-4" /> +91 98220 12345
        </a>
      </div>
    </section>
  );
}

/* ─────────────── Ratings strip ─────────────── */
function TrustStrip() {
  const items = [
    { icon: Star, title: "4.8/5 B2B rating", text: "from 480+ retail partners" },
    { icon: Truck, title: "48h dispatch", text: "from Pune warehouse" },
    { icon: BadgePercent, title: "Tier pricing", text: "retailer → distributor rates" },
    { icon: PackageCheck, title: "2,272 SKUs", text: "across 9 departments" },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border bg-white p-4">
          <it.icon className="h-8 w-8 shrink-0 text-yellow-500" />
          <div>
            <p className="text-xs font-black text-gray-900">{it.title}</p>
            <p className="text-[11px] text-gray-500">{it.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

export function HomeView() {
  const rows = useFlagRows();
  const catalog = useCatalog();
  const cfg = parseSections(catalog?.settings?.home_sections);

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
      {cfg.map((s) => {
        if (!s.visible) return null;
        switch (s.id) {
          case "offerHero": return <OfferHero key={s.id} />;
          case "brandStrip": return <BrandStrip key={s.id} title={s.title} />;
          case "couponStrip": return <CouponStrip key={s.id} title={s.title} />;
          case "categoryGrid": return <CategoryGrid key={s.id} title={s.title} sub={s.sub} />;
          case "dealsRail": return <DealsRail key={s.id} deals={rows.deals} title={s.title} sub={s.sub} />;
          case "tabbedShowcase": return <TabbedShowcase key={s.id} />;
          case "adsStrip": return <AdsStrip key={s.id} title={s.title} />;
          case "deptCards": return <DeptCards key={s.id} title={s.title} />;
          case "trustStrip": return <TrustStrip key={s.id} />;
          case "howItWorks": return <HowItWorks key={s.id} title={s.title} />;
          default: return null;
        }
      })}
    </div>
  );
}
