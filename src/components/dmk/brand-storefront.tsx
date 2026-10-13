"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Building2, Flame, LayoutTemplate, Package, Star, TrendingUp, Zap } from "lucide-react";
import { useEffect } from "react";
import { ProductCard, ProductCardMini } from "./product-card";
import { formatINR, useSiteStore } from "@/lib/store";
import type { DProduct } from "@/lib/types";

export interface BrandData {
  id: string; name: string; slug: string; logo: string; description: string; tagline: string;
  storefrontLayout: number; storefrontConfig: string;
  productCount: number;
}

type Config = {
  heroHeadline?: string; heroSub?: string; bg?: string; accent?: string;
  showCategories?: boolean; showTopProducts?: boolean; showHotDeals?: boolean; showAllProducts?: boolean;
};

function parseConfig(json: string): Config {
  try { return JSON.parse(json || "{}"); } catch { return {}; }
}

interface Props {
  brand: BrandData;
  tops: { id: string; name: string; emoji: string; count: number }[];
  featured: DProduct[]; hot: DProduct[]; deals: DProduct[]; top: DProduct[]; all: DProduct[];
  categories: { end: string; count: number; image: string }[];
}

function BrandHero({ brand, cfg, dark, tall }: { brand: BrandData; cfg: Config; dark?: boolean; tall?: boolean }) {
  const gst = useSiteStore((s) => s.gstEnabled);
  useEffect(() => { useSiteStore.getState().load(); }, []);
  return (
    <section className={`relative overflow-hidden rounded-2xl border ${dark ? "border-gray-800" : "border-gray-200"}`} style={{ background: cfg.bg || (dark ? "#0a0a0a" : "#fff") }}>
      <div className="grid items-center gap-6 p-6 md:grid-cols-[1fr_auto] md:p-10">
        <div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${dark ? "bg-white/10 text-yellow-400" : "bg-black/5 text-gray-600"}`}>
            <Building2 className="h-3.5 w-3.5" /> Official Brand Store
          </span>
          <h1 className={`mt-4 text-3xl font-black leading-tight md:text-4xl ${dark ? "text-white" : "text-gray-900"}`}>
            {cfg.heroHeadline || `Shop ${brand.name}`}
          </h1>
          <p className={`mt-2 max-w-xl text-sm md:text-base ${dark ? "text-gray-300" : "text-gray-600"}`}>
            {cfg.heroSub || brand.description || `Wholesale rates on the full ${brand.name} range.`}
          </p>
          <div className={`mt-4 flex flex-wrap gap-3 text-[11px] ${dark ? "text-gray-400" : "text-gray-500"}`}>
            <span className="rounded-lg bg-black/5 px-3 py-1.5"><b>{brand.productCount}</b> SKUs</span>
            <span className="rounded-lg bg-black/5 px-3 py-1.5"><b>4</b> price tiers</span>
            {gst ? <span className="rounded-lg bg-black/5 px-3 py-1.5"><b>GST</b> invoice</span> : <span className="rounded-lg bg-black/5 px-3 py-1.5"><b>Itemised</b> invoice</span>}
          </div>
        </div>
        <div className={`relative ${tall ? "h-40 w-40 md:h-52 md:w-52" : "h-32 w-32 md:h-40 md:w-40"} mx-auto overflow-hidden rounded-3xl border-4 shadow-2xl ${dark ? "border-yellow-400/60 bg-white" : "border-yellow-400/60 bg-white"}`}>
          {brand.logo ? (
            <Image src={brand.logo} alt={brand.name} fill sizes="200px" className="object-contain p-4" unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl font-black text-gray-300">{brand.name.slice(0, 2)}</div>
          )}
        </div>
      </div>
    </section>
  );
}

function Grid({ products, cols = 6 }: { products: DProduct[]; cols?: number }) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${cols === 6 ? "lg:grid-cols-6" : cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
      {products.map((p) => <ProductCard key={p.id} p={p} />)}
    </div>
  );
}

function SectionHead({ icon: Icon, title, sub, href }: { icon: typeof Flame; title: string; sub?: string; href?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-black text-gray-900"><Icon className="h-5 w-5 text-yellow-500" /> {title}</h2>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
      {href && <Link href={href} className="text-xs font-bold text-yellow-600 hover:underline">See all →</Link>}
    </div>
  );
}

export function BrandStorefront({ brand, tops, featured, hot, deals, top, all, categories }: Props) {
  const cfg = parseConfig(brand.storefrontConfig);
  const layout = ((brand.storefrontLayout - 1) % 10) + 1;

  switch (layout) {
    case 2: // Split Hero Editorial
      return (
        <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
          <BrandHero brand={brand} cfg={cfg} tall />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {featured.slice(0, 4).map((p) => (
              <Link key={p.id} href={p.slug ? `/product/${p.slug}` : "#"} className="group relative aspect-[4/5] overflow-hidden rounded-2xl border bg-white">
                <Image src={p.image || "/dmk-logo.png"} alt={p.name} fill sizes="300px" className="object-cover transition group-hover:scale-105" unoptimized />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="line-clamp-1 text-xs font-bold text-white">{p.name}</p>
                  <p className="text-[11px] text-yellow-400">{formatINR(p.dealerPrice)} / pc</p>
                </div>
              </Link>
            ))}
          </div>
          {cfg.showHotDeals !== false && hot.length > 0 && (
            <section>
              <SectionHead icon={Flame} title={`${brand.name} Bestsellers`} sub="Most reordered by our B2B partners" />
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">{hot.slice(0, 10).map((p) => <ProductCardMini key={p.id} p={p} />)}</div>
            </section>
          )}
          <Grid products={all.slice(0, 24)} />
        </div>
      );

    case 3: // Dark Premium
      return (
        <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
          <BrandHero brand={brand} cfg={{ ...cfg, bg: "#0a0a0a" }} dark tall />
          {deals.length > 0 && (
            <section className="rounded-2xl bg-yellow-400 p-5">
              <SectionHead icon={Zap} title="Premium Deals Inside" sub="Extra margin on selected lines" />
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">{deals.slice(0, 10).map((p) => <ProductCardMini key={p.id} p={p} />)}</div>
            </section>
          )}
          <Grid products={featured.length ? featured : all.slice(0, 12)} />
          <Grid products={all.slice(12, 36)} />
        </div>
      );

    case 4: // Minimal White
      return (
        <div className="mx-auto max-w-[1400px] space-y-6 px-3 py-5 md:px-6">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="relative h-20 w-20 overflow-hidden rounded-2xl border bg-white">
              {brand.logo && <Image src={brand.logo} alt={brand.name} fill sizes="80px" className="object-contain p-2" unoptimized />}
            </div>
            <h1 className="text-2xl font-black text-gray-900">{brand.name}</h1>
            <p className="max-w-lg text-xs text-gray-500">{cfg.heroSub || brand.description}</p>
          </div>
          {cfg.showCategories !== false && (
            <div className="flex flex-wrap justify-center gap-2">
              {categories.slice(0, 12).map((c) => (
                <Link key={c.end} href={`/catalog?brand=${brand.slug}`} className="rounded-full border px-3 py-1.5 text-[11px] font-semibold text-gray-600 hover:border-yellow-400">
                  {c.end} ({c.count})
                </Link>
              ))}
            </div>
          )}
          <Grid products={all.slice(0, 36)} />
        </div>
      );

    case 5: // Promo / Offers
      return (
        <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
          <BrandHero brand={brand} cfg={cfg} />
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { t: "Buy Full Packs", d: "Save ~6% vs single pieces", i: Package, c: "bg-yellow-50 border-yellow-200" },
              { t: "Case-load Pricing", d: "Save ~12% on bulk cases", i: Building2, c: "bg-emerald-50 border-emerald-200" },
              { t: "Top Rated", d: `${brand.tagline || "Trusted by 100s of counters"}`, i: Star, c: "bg-orange-50 border-orange-200" },
            ].map((x) => (
              <div key={x.t} className={`rounded-2xl border p-4 ${x.c}`}>
                <x.i className="h-6 w-6 text-black/60" />
                <p className="mt-2 text-sm font-black">{x.t}</p>
                <p className="text-[11px] text-gray-600">{x.d}</p>
              </div>
            ))}
          </div>
          {deals.length > 0 && (
            <section>
              <SectionHead icon={Zap} title="Deal Zone" href={`/catalog?brand=${brand.slug}&flag=deal`} />
              <Grid products={deals} />
            </section>
          )}
          <section>
            <SectionHead icon={TrendingUp} title="Top Selling" />
            <Grid products={top.length ? top : all.slice(0, 12)} />
          </section>
          <section>
            <SectionHead icon={Package} title={`Complete ${brand.name} Range`} href={`/catalog?brand=${brand.slug}`} />
            <Grid products={all.slice(0, 24)} />
          </section>
        </div>
      );

    case 6: // Catalog Dense
      return (
        <div className="mx-auto max-w-[1400px] space-y-6 px-3 py-5 md:px-6">
          <div className="flex items-center justify-between rounded-2xl border bg-white p-4">
            <div className="flex items-center gap-3">
              {brand.logo && <Image src={brand.logo} alt={brand.name} width={48} height={48} className="h-12 w-12 object-contain" unoptimized />}
              <div>
                <h1 className="text-lg font-black">{brand.name} — Full Catalog</h1>
                <p className="text-[11px] text-gray-500">{brand.productCount} SKUs · tier pricing on every line</p>
              </div>
            </div>
            <Link href={`/catalog?brand=${brand.slug}`} className="rounded-lg bg-black px-4 py-2 text-xs font-bold text-yellow-400">Filter & Sort</Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {all.slice(0, 48).map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </div>
      );

    case 7: // Showcase Carousel
      return (
        <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
          <BrandHero brand={brand} cfg={cfg} tall />
          {[
            { title: "Featured Showcase", list: featured },
            { title: "Hot Right Now", list: hot },
            { title: "Deals of the Day", list: deals },
            { title: "Top Selling", list: top },
          ].filter((s) => s.list.length > 0).map((s) => (
            <section key={s.title}>
              <SectionHead icon={Star} title={s.title} />
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">{s.list.slice(0, 12).map((p) => <ProductCardMini key={p.id} p={p} />)}</div>
            </section>
          ))}
          <section>
            <SectionHead icon={Package} title="Browse Everything" href={`/catalog?brand=${brand.slug}`} />
            <Grid products={all.slice(0, 18)} />
          </section>
        </div>
      );

    case 8: // Story-Driven
      return (
        <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
          <BrandHero brand={brand} cfg={cfg} tall />
          <div className="rounded-2xl border bg-white p-6 md:p-10">
            <p className="mx-auto max-w-3xl text-center text-sm leading-relaxed text-gray-600 md:text-base">{brand.description || `${brand.name} is one of the trusted brands distributed by DMK Mart across Maharashtra.`}</p>
            <div className="mx-auto mt-6 grid max-w-2xl grid-cols-3 gap-3 text-center">
              <div><p className="text-xl font-black text-gray-900">{brand.productCount}</p><p className="text-[10px] uppercase tracking-wide text-gray-400">Products</p></div>
              <div><p className="text-xl font-black text-gray-900">48h</p><p className="text-[10px] uppercase tracking-wide text-gray-400">Dispatch</p></div>
              <div><p className="text-xl font-black text-gray-900">100%</p><p className="text-[10px] uppercase tracking-wide text-gray-400">Genuine</p></div>
            </div>
          </div>
          <Grid products={featured.slice(0, 12)} />
          <Grid products={all.slice(12, 30)} />
        </div>
      );

    case 9: // Category-Led
      return (
        <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
          <BrandHero brand={brand} cfg={cfg} />
          <section>
            <SectionHead icon={LayoutTemplate} title="Shop by Category" sub={`${categories.length} categories in ${brand.name}`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {categories.slice(0, 12).map((c) => (
                <div key={c.end} className="relative aspect-square overflow-hidden rounded-2xl border bg-white">
                  {c.image && <Image src={c.image} alt={c.end} fill sizes="200px" className="object-cover opacity-90" unoptimized />}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2.5">
                    <p className="text-xs font-bold text-white">{c.end}</p>
                    <p className="text-[10px] text-gray-300">{c.count} SKUs</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {cfg.showHotDeals !== false && hot.length > 0 && (
            <section>
              <SectionHead icon={Flame} title="Hot in this Brand" />
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">{hot.slice(0, 12).map((p) => <ProductCardMini key={p.id} p={p} />)}</div>
            </section>
          )}
          <Grid products={all.slice(0, 24)} />
        </div>
      );

    case 10: // Bold Yellow (DMK energy)
      return (
        <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
          <section className="overflow-hidden rounded-2xl bg-yellow-400 p-6 md:p-10">
            <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
              <div>
                <span className="rounded-full bg-black px-3 py-1 text-[11px] font-black uppercase tracking-wider text-yellow-400">Brand Store</span>
                <h1 className="mt-3 text-3xl font-black leading-none text-black md:text-5xl">{(cfg.heroHeadline || brand.name).toUpperCase()}</h1>
                <p className="mt-3 max-w-md text-sm font-semibold text-black/70">{cfg.heroSub || `Wholesale rates on the full ${brand.name} range — pieces, packs & cases.`}</p>
                <Link href={`/catalog?brand=${brand.slug}`} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-black px-6 py-3 text-sm font-bold text-yellow-400 hover:bg-gray-900">
                  Browse {brand.productCount} SKUs <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="relative mx-auto h-36 w-36 overflow-hidden rounded-full border-4 border-black bg-white md:h-48 md:w-48">
                {brand.logo && <Image src={brand.logo} alt={brand.name} fill sizes="200px" className="object-contain p-5" unoptimized />}
              </div>
            </div>
          </section>
          {deals.length > 0 && (
            <section className="rounded-2xl bg-black p-5">
              <p className="mb-3 flex items-center gap-2 text-lg font-black text-yellow-400"><Zap className="h-5 w-5" /> Black-Yellow Deals</p>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">{deals.slice(0, 10).map((p) => <ProductCardMini key={p.id} p={p} />)}</div>
            </section>
          )}
          <Grid products={all.slice(0, 30)} />
        </div>
      );

    case 1: // Classic Banner Grid (default)
    default:
      return (
        <div className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
          <BrandHero brand={brand} cfg={cfg} />
          {cfg.showCategories !== false && tops.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tops.map((t) => (
                <Link key={t.id} href={`/catalog?top=${t.id}&brand=${brand.slug}`} className="rounded-full border bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-yellow-400 hover:bg-yellow-50">
                  {t.emoji} {t.name} <span className="text-gray-400">({t.count})</span>
                </Link>
              ))}
            </div>
          )}
          {cfg.showHotDeals !== false && deals.length > 0 && (
            <section>
              <SectionHead icon={Zap} title="Deals from this Brand" href={`/catalog?brand=${brand.slug}&flag=deal`} />
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">{deals.slice(0, 12).map((p) => <ProductCardMini key={p.id} p={p} />)}</div>
            </section>
          )}
          {cfg.showTopProducts !== false && top.length > 0 && (
            <section>
              <SectionHead icon={TrendingUp} title="Top Selling" />
              <Grid products={top} />
            </section>
          )}
          {cfg.showAllProducts !== false && (
            <section>
              <SectionHead icon={Package} title={`All ${brand.name} Products`} href={`/catalog?brand=${brand.slug}`} />
              <Grid products={all.slice(0, 30)} />
            </section>
          )}
        </div>
      );
  }
}
