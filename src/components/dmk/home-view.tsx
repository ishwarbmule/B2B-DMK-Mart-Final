"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BadgePercent, Building2, Check, Copy, LayoutGrid, ListFilter, Megaphone, PackageCheck, PhoneCall, Star, Ticket, Truck, ChevronRight, Sparkles } from "lucide-react";
import { useCatalog } from "./site-header-v2";
import { HeroBanner } from "./hero-banner";
import { HeroSlider } from "./hero-slider";
import { ProductCard, ProductCardMini } from "./product-card";
import { CatalogView } from "./catalog-view";
import type { DProduct, OfferNode, CouponNode } from "@/lib/types";
import { formatINR } from "@/lib/store";

/* ─────────────── Homepage section config (Website Management → Homepage Editor) ─────────────── */
export type HomeSectionCfg = { id: string; visible: boolean; title?: string; sub?: string; color?: string; size?: "S" | "M" | "L"; align?: "left" | "center" | "right" };

/* Per-section style helpers (Website Management → Homepage Editor: colour / size / position) */
const secSize = (s?: string) => (s === "S" ? "text-base sm:text-lg" : s === "L" ? "text-xl sm:text-2xl" : "text-lg");
const secAlign = (a?: string) => (a === "center" ? "justify-center text-center" : a === "right" ? "justify-end text-right" : "justify-start text-left");
const secColor = (c?: string) => (c || undefined) as string | undefined;

export const HOME_SECTIONS: { id: string; label: string; hasTitle: boolean; hasSub: boolean }[] = [
  { id: "offerHero", label: "Offer Hero (auto from Offers)", hasTitle: false, hasSub: false },
  { id: "brandStrip", label: "Shop by Brand", hasTitle: true, hasSub: false },
  { id: "categoryGrid", label: "Shop by Category", hasTitle: true, hasSub: true },
  { id: "dealsRail", label: "Deals of the Day", hasTitle: true, hasSub: true },
  { id: "tabbedShowcase", label: "Product Showcase (tabs)", hasTitle: false, hasSub: false },
  { id: "adsStrip", label: "Brand Ads Showcase", hasTitle: true, hasSub: false },
  { id: "allProducts", label: "All Products (filters + pagination)", hasTitle: true, hasSub: true },
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
    for (const id of DEFAULT_ORDER) if (!known.some((s) => s.id === id)) {
      // "allProducts" slots in right after the Sponsored Promotions (adsStrip) section
      const adsIdx = known.findIndex((s) => s.id === "adsStrip");
      if (id === "allProducts" && adsIdx >= 0) known.splice(adsIdx + 1, 0, { id, visible: true });
      else known.push({ id, visible: true });
    }
    return known;
  } catch {
    return DEFAULT_ORDER.map((id) => ({ id, visible: true }));
  }
}

/* ─────────────── Hero carousel (slides editable: Admin → Website Management → Manage Sliders) ─────────────── */
function OfferHero() {
  const sliders = useCatalog()?.sliders ?? [];

  return (
    <section>
      {sliders.length > 0 ? (
        <HeroSlider sliders={sliders} onCta={() => (window.location.href = "/catalog")} />
      ) : (
        <HeroBanner />
      )}
    </section>
  );
}

/* ─────────────── Big Sale / Offer promo — auto-appears ABOVE the hero when an offer is active,
                    hides itself automatically when none is live (Admin → Offers & Campaigns) ─────────────── */
const PROMO_ZONES: Record<string, string> = {
  "TOP-LEFT": "justify-start items-start text-left",
  "TOP-RIGHT": "justify-start items-end text-right",
  CENTER: "justify-center items-center text-center",
  "BOTTOM-LEFT": "justify-end items-start text-left",
  "BOTTOM-RIGHT": "justify-end items-end text-right",
};

/* ── Offer style v2 helpers — admin px sizes with SEPARATE laptop & mobile values ── */
const numOr = (v: number | undefined, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? v : dflt);
/** Admin px → responsive font-size. Laptop+mobile set → clamp between them; laptop only → fluid mobile (~55%);
    mobile only → fixed px; neither → undefined (theme classes stay in charge). */
function offerFontSize(desk: number | undefined, mob: number | undefined): CSSProperties | undefined {
  const d = numOr(desk, 0);
  const m = numOr(mob, 0);
  const clampStyle = (mm: number, dd: number): CSSProperties => ({
    fontSize: `clamp(${mm.toFixed(1)}px, calc(${mm.toFixed(1)}px + ${(dd - mm).toFixed(1)} * (100vw - 360px) / 664), ${dd}px)`,
  });
  if (d > 0 && m > 0) return clampStyle(Math.min(m, d), d);
  if (d > 0) return clampStyle(d * 0.55, d);
  if (m > 0) return { fontSize: `${m}px` };
  return undefined;
}
/** Mobile padding: admin-set px wins, otherwise auto-derive from desktop (brand 14–24px). */
const offerMobPad = (deskPx: number, adminM: number | undefined) =>
  numOr(adminM, 0) > 0 ? Math.max(8, numOr(adminM, 0)) : Math.max(14, Math.min(24, Math.round(deskPx * 0.4)));

function OfferPromo({ offer }: { offer: OfferNode }) {
  const zone = PROMO_ZONES[offer.contentPosition || "TOP-LEFT"] ?? PROMO_ZONES["TOP-LEFT"];
  // per-side content padding — laptop from admin (default 50px), mobile admin-set or auto 14–24px
  const pad = { t: numOr(offer.padTop, 50), r: numOr(offer.padRight, 50), b: numOr(offer.padBottom, 50), l: numOr(offer.padLeft, 50) };
  const padVars = {
    "--pt": `${pad.t}px`,
    "--pr": `${pad.r}px`,
    "--pb": `${pad.b}px`,
    "--pl": `${pad.l}px`,
    "--ptm": `${offerMobPad(pad.t, offer.padTopM)}px`,
    "--prm": `${offerMobPad(pad.r, offer.padRightM)}px`,
    "--pbm": `${offerMobPad(pad.b, offer.padBottomM)}px`,
    "--plm": `${offerMobPad(pad.l, offer.padLeftM)}px`,
  } as CSSProperties;
  return (
    <motion.section
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative overflow-hidden bg-black"
      style={{ background: offer.bannerImage ? undefined : offer.bgColor }}
    >
      {/* 16:9 cinematic frame — only this frame size is accepted in admin; pad vars live here so the copy block inherits them */}
      <div className="relative aspect-video max-h-[560px] w-full" style={padVars}>
        {offer.bannerImage ? (
          <Image src={offer.bannerImage} alt={offer.headline} fill sizes="100vw" className="object-cover object-center" priority unoptimized />
        ) : null}
        {/* copy sits where admin chose — per-side admin padding (laptop default 50px, phones 14–24px), no hiding overlay */}
        <div className={`absolute inset-0 flex flex-col pt-[var(--ptm)] pr-[var(--prm)] pb-[var(--pbm)] pl-[var(--plm)] sm:pt-[var(--pt)] sm:pr-[var(--pr)] sm:pb-[var(--pb)] sm:pl-[var(--pl)] ${zone}`}>
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}
            className={`flex max-w-full flex-col gap-1.5 sm:gap-2.5 ${zone}`}
          >
            <motion.p
              variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 16 } } }}
              className="text-[10px] font-extrabold uppercase tracking-[0.22em] sm:text-xs"
              style={{ color: offer.kickerColor || offer.textColor, ...offerFontSize(offer.kickerSize, offer.kickerSizeM) }}
            >
              <Sparkles className="mr-1.5 inline h-3.5 w-3.5" /> Limited Period Campaign
            </motion.p>
            <motion.h2
              variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 16 } } }}
              className="max-w-lg text-2xl font-black leading-[1.06] tracking-tight drop-shadow-[0_1px_10px_rgba(0,0,0,0.35)] sm:text-4xl md:text-5xl"
              style={{ color: offer.headlineColor || offer.textColor, ...offerFontSize(offer.headlineSize, offer.headlineSizeM) }}
            >
              {offer.headline}
            </motion.h2>
            {offer.subText && (
              <motion.p
                variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 16 } } }}
                className="max-w-md text-[11px] font-semibold leading-snug drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)] sm:text-sm"
                style={{ color: offer.subColor || offer.textColor, ...offerFontSize(offer.subSize, offer.subSizeM) }}
              >
                {offer.subText}
              </motion.p>
            )}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 16 } } }}
            >
              <Link
                href={offer.ctaUrl || "/catalog"}
                className={`mt-1 flex w-fit items-center gap-2 rounded-xl px-5 py-2.5 font-extrabold shadow-lg shadow-black/25 transition-all duration-200 hover:scale-[1.04] active:scale-95 sm:px-7 sm:py-3 ${offer.buttonBg ? "" : "bg-black hover:bg-gray-900"} ${offer.buttonTextColor ? "" : "text-yellow-400"}`}
                style={{
                  ...(offer.buttonBg ? { background: offer.buttonBg } : {}),
                  ...(offer.buttonTextColor ? { color: offer.buttonTextColor } : {}),
                  ...offerFontSize(offer.buttonSize, offer.buttonSizeM),
                }}
              >
                {offer.ctaText || "Shop Now"}
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.6} />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

/* Yellow sliding headline for the active Big Sale — sits between the promo banner and the hero */
function SaleMarquee({ offer }: { offer: OfferNode }) {
  const bits = useMemo(() => {
    const arr = [offer.headline, offer.subText];
    if ((offer.discountValue ?? 0) > 0) arr.push(offer.discountType === "AMOUNT" ? `Flat ₹${offer.discountValue} OFF` : `Flat ${offer.discountValue}% OFF`);
    if ((offer.minOrder ?? 0) > 0) arr.push(`On orders above ${formatINR(offer.minOrder ?? 0)}`);
    arr.push(offer.ctaText || "Shop Now");
    return arr.filter(Boolean);
  }, [offer]);
  // Seamless infinite loop: exactly 2 identical copies animated to translateX(-50%).
  // Content is doubled inside each copy so one copy always spans wider than any screen.
  const Seq = () => (
    <span className="flex shrink-0 items-center">
      {[...bits, ...bits].map((b, i) => (
        <span key={i} className="flex items-center">
          <Sparkles className="mx-4 h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap text-xs font-black uppercase tracking-wide sm:text-sm" style={offerFontSize(offer.marqueeSize, offer.marqueeSizeM)}>{b}</span>
        </span>
      ))}
    </span>
  );
  return (
    <div className="overflow-hidden py-2.5" style={{ background: offer.marqueeBg || "#facc15", color: offer.marqueeTextColor || "#000" }}>
      <div className="flex w-max animate-dmk-marquee-slim hover:[animation-play-state:paused]">
        <Seq /><Seq />
      </div>
    </div>
  );
}

/* ─────────────── Slim coupon marquee — auto-appears after Deals of the Day when coupons are live.
                    Codes are copy-to-clipboard; a single coupon repeats across the strip ─────────────── */
function CouponMarquee({ coupons }: { coupons: CouponNode[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!coupons.length) return null;
  // one coupon → repeat it across the strip so the ticker never runs empty;
  // multiple coupons → doubled so each loop copy stays wider than any viewport
  const base = coupons.length === 1 ? Array.from({ length: 6 }, () => coupons[0]) : [...coupons, ...coupons];

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1600);
    } catch {
      /* clipboard unavailable — code is still selectable text */
    }
  };

  const Seq = () => (
    <span className="flex shrink-0 items-center">
      {base.map((c, i) => (
        <span key={`${c.id}-${i}`} className="mx-3 flex items-center gap-2">
          <Ticket className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
          <span className="whitespace-nowrap text-[11px] font-bold text-white">{c.headline || "Coupon"}</span>
          <button
            onClick={() => copy(c.code)}
            title="Click to copy coupon code"
            className="flex items-center gap-1 whitespace-nowrap rounded border border-dashed border-yellow-400/70 bg-yellow-400/10 px-2 py-0.5 font-mono text-[11px] font-black tracking-widest text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
          >
            {c.code}
            {copied === c.code ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-70" />}
          </button>
        </span>
      ))}
    </span>
  );

  return (
    <div className="overflow-hidden rounded-full border border-gray-800 bg-black py-2 shadow-sm">
      <div className="flex w-max animate-dmk-marquee-slim hover:[animation-play-state:paused]">
        <Seq /><Seq />
      </div>
    </div>
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
function BrandStrip({ cfg, title }: { cfg?: HomeSectionCfg; title?: string }) {
  const catalog = useCatalog();
  const brands = (catalog?.brands ?? []).slice(0, 16);
  return (
    <section>
      <div className={`mb-3 flex items-center justify-between`}>
        <h2 className={`flex items-center gap-2 ${secSize(cfg?.size)} font-black`} style={{ color: secColor(cfg?.color) }}>
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

/* ─────────────── Shop by Category (image cards, before Deals of the Day) ─────────────── */
function CategoryGrid({ cfg, title, sub }: { cfg?: HomeSectionCfg; title?: string; sub?: string }) {
  const catalog = useCatalog();
  // only categories with live (active) inventory — 0-SKU tops stay visible in the All Departments menu
  const tops = (catalog?.tops ?? []).filter((t) => (t.productCount ?? 0) > 0);
  if (!tops.length) return null;
  return (
    <section>
      <div className={`mb-3 flex items-end justify-between`}>
        <div className="flex flex-col gap-0.5">
          <h2 className={`flex items-center gap-2 ${secSize(cfg?.size)} font-black`} style={{ color: secColor(cfg?.color) }}>
            <LayoutGrid className="h-5 w-5 text-yellow-500" /> {title || "Shop by Category"}
          </h2>
          <p className="text-[11px] text-gray-500" style={{ color: secColor(cfg?.color) }}>{sub || "All wholesale departments in one row — tap to browse"}</p>
        </div>
        <Link href="/catalog" className="text-xs font-bold text-yellow-600 hover:underline">Browse all products →</Link>
      </div>
      {/* single aligned row — cards sit inside the page grid (no edge bleed),
          scrollable on mobile, spread edge-to-edge on desktop */}
      <div className="flex snap-x items-end justify-start gap-3 overflow-x-auto pb-2 md:gap-4 lg:flex-wrap lg:justify-between lg:overflow-visible [scrollbar-width:thin]">
        {tops.map((t) => (
          <Link
            key={t.id}
            href={`/catalog?top=${t.id}`}
            className="group w-[104px] shrink-0 snap-start md:w-[124px] lg:w-[120px] xl:w-[128px]"
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

function DealsRail({ cfg, deals, title, sub }: { cfg?: HomeSectionCfg; deals: DProduct[]; title?: string; sub?: string }) {
  if (!deals.length) return null;
  return (
    <section className="rounded-2xl bg-gradient-to-r from-red-600 to-red-500 p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-white px-3 py-1.5 text-lg font-black text-red-600">DEALS</span>
          <div>
            <p className={`${secSize(cfg?.size)} font-black text-white`} style={{ color: secColor(cfg?.color) }}>{title || "Deals of the Day"}</p>
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
            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
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

/* ─────────────── Brand Ads showcase (uniform height, native aspect — 1:1, 16:9, 9:16, 3:4 all align;
                    hover slides a white detail card in from the bottom-left corner) ─────────────── */
type AdRow = { id: string; title: string; image: string; link: string; active: boolean; brand?: { name: string; slug: string } | null };

/** Renders at the image's natural aspect ratio inside a fixed-height row (any format aligns cleanly). */
function AdImage({ src, alt }: { src: string; alt: string }) {
  const [ratio, setRatio] = useState(16 / 9);
  return (
    <div className="relative h-full" style={{ aspectRatio: String(ratio) }}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 80vw, 30vw"
        className="object-cover"
        unoptimized
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
        }}
      />
    </div>
  );
}

function AdsStrip({ cfg, title }: { cfg?: HomeSectionCfg; title?: string }) {
  const catalog = useCatalog();
  const ads = ((catalog?.ads ?? []) as AdRow[]).filter((a) => a.active).slice(0, 6);
  if (!ads.length) return null;
  return (
    <section>
      <h2 className={`mb-3 flex items-center gap-2 ${secSize(cfg?.size)} font-black`} style={{ color: secColor(cfg?.color) }}>
        <Megaphone className="h-5 w-5 text-yellow-500" /> {title || "Sponsored Promotions"}
      </h2>
      {/* one aligned row — every ad keeps its own shape at the same height, swipeable on mobile */}
      <div className="flex items-stretch gap-3 overflow-x-auto pb-1 scrollbar-hide lg:justify-center">
        {ads.map((a) => (
          <Link
            key={a.id}
            href={a.brand?.slug ? `/brand/${a.brand.slug}` : a.link || "#"}
            className="group relative block h-44 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm transition hover:shadow-md md:h-52 lg:h-56"
            aria-label={a.title}
          >
            {a.image ? (
              <AdImage src={a.image} alt={a.title} />
            ) : (
              <span className="flex h-full w-64 flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#FFF6E0] to-[#FBE8B4] text-center">
                <Megaphone className="h-6 w-6 text-yellow-500" />
                <span className="px-3 text-xs font-bold text-gray-800">{a.title}</span>
              </span>
            )}
            <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-yellow-400">Ad</span>
            {/* touch devices have no hover — always show a slim bottom label */}
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pb-2 pt-7 text-[11px] font-bold text-white sm:group-hover:opacity-0">
              {a.brand?.name || a.title}
            </span>
            {/* white detail card slides in from the bottom-left corner on hover */}
            <span className="pointer-events-none absolute inset-0 flex -translate-x-full translate-y-full flex-col justify-end gap-0.5 bg-white/95 p-4 shadow-xl transition-transform duration-300 ease-out group-hover:translate-x-0 group-hover:translate-y-0">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-yellow-600">Sponsored</span>
              <span className="line-clamp-2 text-sm font-black leading-tight text-gray-900">{a.title}</span>
              {a.brand?.name && <span className="text-[11px] font-semibold text-gray-500">by {a.brand.name}</span>}
              <span className="mt-1.5 flex w-fit items-center gap-1 rounded-lg bg-black px-3 py-1 text-[10px] font-bold text-yellow-400">
                Visit now <ArrowRight className="h-3 w-3" strokeWidth={2.6} />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─────────────── All Products — full catalog with filters, right after Sponsored Promotions ─────────────── */
function AllProductsSection({ cfg, title, sub }: { cfg?: HomeSectionCfg; title?: string; sub?: string }) {
  const catalog = useCatalog();
  if (!catalog) return null;
  return (
    <section>
      <div className={`mb-3 flex flex-col gap-0.5 ${secAlign(cfg?.align)}`}>
        <h2 className={`flex items-center gap-2 ${secSize(cfg?.size)} font-black`} style={{ color: secColor(cfg?.color) }}>
          <ListFilter className="h-5 w-5 text-yellow-500" /> {title || "All Products"}
        </h2>
        <p className="text-[11px] text-gray-500">{sub || "Complete wholesale range — filter by department, category, brand, price and sort"}</p>
      </div>
      <CatalogView
        title=""
        tops={catalog.tops}
        brands={catalog.brands}
      />
    </section>
  );
}

/* ─────────────── Departments ─────────────── */
function DeptCards({ cfg, title }: { cfg?: HomeSectionCfg; title?: string }) {
  const catalog = useCatalog();
  const tops = catalog?.tops ?? [];
  return (
    <section>
      <h2 className={`mb-3 flex items-center gap-2 ${secSize(cfg?.size)} font-black`} style={{ color: secColor(cfg?.color) }}>
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
function HowItWorks({ cfg, title }: { cfg?: HomeSectionCfg; title?: string }) {
  const steps = [
    { icon: Building2, title: "Create B2B Account", text: "Register as retailer, wholesaler or distributor — get your price tier after approval." },
    { icon: PackageCheck, title: "Order Pieces or Full Packs", text: "Every product supports single pieces and sealed full packs with transparent pricing — pack rates when you pick up." },
    { icon: Truck, title: "OTP-verified Delivery", text: "A 4-digit OTP is printed on your invoice — share it only when your order arrives." },
  ];
  return (
    <section className="rounded-2xl bg-black p-6 md:p-10">
      <h2 className={`text-center text-xl font-black text-white md:text-2xl`} style={{ color: secColor(cfg?.color) }}>{title || "Built for Serious B2B Buyers"}</h2>
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
  const offer = catalog?.activeOffer ?? null;
  const coupons = catalog?.homeCoupons ?? [];

  return (
    <>
      {/* Big Sale / Offer engine — full-bleed banner stretching edge-to-edge with the yellow marquee attached directly
          underneath (zero gap); renders ONLY while an offer is active (auto-hide otherwise) */}
      {offer && (
        <div className="w-full">
          <OfferPromo offer={offer} />
          <SaleMarquee offer={offer} />
        </div>
      )}
      <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
      {cfg.map((s) => {
        if (!s.visible) return null;
        switch (s.id) {
          case "offerHero": return <OfferHero key={s.id} />;
          case "brandStrip": return <BrandStrip key={s.id} cfg={s} title={s.title} />;
          case "categoryGrid": return <CategoryGrid key={s.id} cfg={s} title={s.title} sub={s.sub} />;
          case "dealsRail": return (
            <div key={s.id} className="space-y-8">
              <DealsRail cfg={s} deals={rows.deals} title={s.title} sub={s.sub} />
              {/* slim copyable coupon ticker — auto-appears only while coupons are live */}
              {coupons.length > 0 && <CouponMarquee coupons={coupons} />}
            </div>
          );
          case "tabbedShowcase": return <TabbedShowcase key={s.id} />;
          case "adsStrip": return <AdsStrip key={s.id} cfg={s} title={s.title} />;
          case "allProducts": return <AllProductsSection key={s.id} cfg={s} title={s.title} sub={s.sub} />;
          case "deptCards": return <DeptCards key={s.id} cfg={s} title={s.title} />;
          case "trustStrip": return <TrustStrip key={s.id} />;
          case "howItWorks": return <HowItWorks key={s.id} cfg={s} title={s.title} />;
          default: return null;
        }
      })}
      </div>
    </>
  );
}
