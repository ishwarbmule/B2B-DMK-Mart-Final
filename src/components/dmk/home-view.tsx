"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgePercent, Building2, Clock3, Handshake, Megaphone, PackageCheck, PhoneCall, Star, Truck, Zap, ChevronLeft, ChevronRight } from "lucide-react";
import { useCatalog } from "./site-header-v2";
import { ProductCard, ProductCardMini } from "./product-card";
import type { DProduct } from "@/lib/types";
import { formatINR } from "@/lib/store";

function useCountdown(target?: string | null) {
  const [left, setLeft] = useState("");
  useEffect(() => {
    if (!target) return;
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) return setLeft("Ending now");
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLeft(`${d ? d + "d " : ""}${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return left;
}

/* ─────────────── Offer Hero (auto from admin Offers) ─────────────── */
function OfferHero() {
  const catalog = useCatalog();
  const offer = catalog?.activeOffer ?? null;
  const sliders = catalog?.sliders ?? [];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % Math.max(1, sliders.length)), 5000);
    return () => clearInterval(id);
  }, [sliders.length]);
  const left = useCountdown(offer?.endAt ?? null);
  const stat = catalog?.stats;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-gray-800"
      style={{ background: offer?.bgColor || "#0a0a0a", color: offer?.textColor || "#facc15" }}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-20 blur-3xl" style={{ background: offer?.textColor || "#facc15" }} />
      <div className="relative grid gap-6 p-6 md:grid-cols-[1.2fr_1fr] md:p-10">
        <div>
          {offer ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: offer.textColor, color: offer.textColor }}>
                <Zap className="h-3.5 w-3.5" /> {offer.type.replace("_", " ")} · Live
              </span>
              <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight md:text-5xl">{offer.headline}</h1>
              <p className="mt-3 max-w-md text-sm opacity-90 md:text-base">{offer.subText}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href={offer.ctaUrl || "/catalog?flag=deal"}
                  className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:scale-[1.02]"
                  style={{ background: offer.textColor, color: offer.bgColor || "#000" }}
                >
                  {offer.ctaText} <ArrowRight className="ml-1 inline h-4 w-4" />
                </Link>
                {left && (
                  <span className="flex items-center gap-2 rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm font-bold tabular-nums">
                    <Clock3 className="h-4 w-4" /> {left}
                  </span>
                )}
              </div>
            </>
          ) : (
            sliders[idx % Math.max(1, sliders.length)] && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-yellow-400">
                  <Handshake className="h-3.5 w-3.5" /> {stat?.brands ?? 39} Brands · B2B Only
                </span>
                <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-white md:text-5xl">
                  {sliders[idx % sliders.length].heading}
                </h1>
                <p className="mt-3 max-w-md text-sm text-gray-300 md:text-base">{sliders[idx % sliders.length]?.content}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href={sliders[idx % sliders.length]?.buttonUrl || "/catalog"} className="rounded-xl bg-yellow-400 px-6 py-3 text-sm font-bold text-black transition hover:scale-[1.02]">
                    {sliders[idx % sliders.length]?.buttonText} <ArrowRight className="ml-1 inline h-4 w-4" />
                  </Link>
                </div>
                <div className="mt-4 flex gap-1.5">
                  {sliders.map((_, i) => (
                    <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === idx % sliders.length ? "w-6 bg-yellow-400" : "w-2 bg-gray-600"}`} />
                  ))}
                </div>
              </>
            )
          )}
          <div className="mt-6 flex flex-wrap gap-4 text-[11px] text-gray-300">
            <span className="rounded-lg bg-white/10 px-3 py-1.5"><b className="text-white">{stat?.products ?? 2272}</b> SKUs live</span>
            <span className="rounded-lg bg-white/10 px-3 py-1.5"><b className="text-white">{stat?.brands ?? 39}</b> brands</span>
            <span className="rounded-lg bg-white/10 px-3 py-1.5"><b className="text-white">4</b> price tiers</span>
            <span className="rounded-lg bg-white/10 px-3 py-1.5"><b className="text-white">OTP</b> safe delivery</span>
          </div>
        </div>

        {/* photo collage */}
        <div className="relative hidden min-h-[280px] md:block">
          <div className="absolute right-0 top-2 h-44 w-44 rotate-6 overflow-hidden rounded-2xl border-4 border-yellow-400/70 shadow-2xl">
            <CollageImg seed="a" />
          </div>
          <div className="absolute bottom-0 right-28 h-40 w-40 -rotate-3 overflow-hidden rounded-2xl border-4 border-white/80 shadow-2xl">
            <CollageImg seed="b" />
          </div>
          <div className="absolute left-4 top-24 h-36 w-36 rotate-[-8deg] overflow-hidden rounded-2xl border-4 border-yellow-400/50 shadow-2xl">
            <CollageImg seed="c" />
          </div>
        </div>
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
function BrandStrip() {
  const catalog = useCatalog();
  const brands = (catalog?.brands ?? []).slice(0, 16);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
          <Building2 className="h-5 w-5 text-yellow-500" /> Shop by Brand
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
function CouponStrip() {
  const catalog = useCatalog();
  const coupons = catalog?.homeCoupons ?? [];
  if (!coupons.length) return null;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
          <BadgePercent className="h-5 w-5 text-yellow-500" /> Live Coupons — apply at checkout
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

function DealsRail({ deals }: { deals: DProduct[] }) {
  if (!deals.length) return null;
  return (
    <section className="rounded-2xl bg-gradient-to-r from-red-600 to-red-500 p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-white px-3 py-1.5 text-lg font-black text-red-600">DEALS</span>
          <div>
            <p className="text-base font-black text-white md:text-xl">Deals of the Day</p>
            <p className="text-[11px] text-red-100">Extra margin on today&apos;s picks — while stocks last</p>
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
type AdRow = { id: string; title: string; image: string; link: string; brand?: { name: string; slug: string } | null };

function AdsStrip() {
  const catalog = useCatalog();
  const ads = ((catalog?.ads ?? []) as AdRow[]).filter((a) => a.image).slice(0, 4);
  if (!ads.length) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-black text-gray-900">
        <Megaphone className="h-5 w-5 text-yellow-500" /> Brand Showcase
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ads.map((a) => (
          <Link
            key={a.id}
            href={a.brand?.slug ? `/brand/${a.brand.slug}` : a.link || "#"}
            className="group relative block overflow-hidden rounded-2xl border bg-white transition hover:shadow-md"
            aria-label={a.title}
          >
            <div className="relative aspect-square w-full">
              <Image src={a.image} alt={a.title} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" unoptimized />
            </div>
            <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-yellow-400">Ad</span>
            {a.brand?.name && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 pb-2.5 pt-8 text-xs font-black text-white">{a.brand.name}</span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─────────────── Departments ─────────────── */
function DeptCards() {
  const catalog = useCatalog();
  const tops = catalog?.tops ?? [];
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-black text-gray-900">
        <PackageCheck className="h-5 w-5 text-yellow-500" /> Wholesale Departments
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
function HowItWorks() {
  const steps = [
    { icon: Building2, title: "Create B2B Account", text: "Register as retailer, wholesaler or distributor — get your price tier after approval." },
    { icon: PackageCheck, title: "Order Pieces, Packs or Cases", text: "Every product supports single pieces, full packs and bulk cases with transparent pricing." },
    { icon: Truck, title: "OTP-verified Delivery", text: "A 4-digit OTP is printed on your invoice — share it only when your order arrives." },
  ];
  return (
    <section className="rounded-2xl bg-black p-6 md:p-10">
      <h2 className="text-center text-xl font-black text-white md:text-2xl">Built for Serious B2B Buyers</h2>
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
  return (
    <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
      <OfferHero />
      <BrandStrip />
      <CouponStrip />
      <DealsRail deals={rows.deals} />
      <TabbedShowcase />
      <AdsStrip />
      <DeptCards />
      <TrustStrip />
      <HowItWorks />
    </div>
  );
}
