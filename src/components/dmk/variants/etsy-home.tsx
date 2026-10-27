"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Heart, Search, ShoppingCart, Star } from "lucide-react";
import { formatINR } from "@/lib/store";
import { discountPct, type DProduct, type VariantData } from "@/lib/types";
import { ProductDialog } from "../product-dialog";
import { DesignLinks, DesignSwitcher, useVariantCart } from "./variant-shared";

/* ----------------------------- etsy card ------------------------------- */

function EtsyCard({
  p, onOpen, onAdd, className = "",
}: {
  p: DProduct; onOpen: (p: DProduct) => void; onAdd: (p: DProduct) => void; className?: string;
}) {
  const disc = discountPct(p.mrp, p.basePrice);
  return (
    <div className={`group ${className}`}>
      <div className="relative overflow-hidden rounded-2xl bg-[#EFE7DA]">
        <button onClick={() => onOpen(p)} className="relative block aspect-square w-full">
          <Image
            src={p.image} alt={p.name} fill sizes="(max-width:768px) 50vw, 260px"
            className="object-cover transition duration-500 group-hover:scale-105" unoptimized
          />
        </button>
        <button
          onClick={() => onAdd(p)}
          className="absolute bottom-2.5 right-2.5 translate-y-2 rounded-full bg-black px-3.5 py-2 text-[11px] font-bold text-yellow-400 opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100"
        >
          Quick add
        </button>
        {disc > 0 && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-rose-600">
            {disc}% off
          </span>
        )}
      </div>
      <button onClick={() => onOpen(p)} className="mt-2 block text-left">
        <p className="line-clamp-2 min-h-[36px] text-[13px] font-medium leading-snug text-[#222]">{p.name}</p>
        <p className="mt-1 flex items-center gap-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
          ))}
          <span className="ml-1 text-[10px] text-gray-400">({p.packSize * 37 + 12})</span>
        </p>
        <p className="mt-0.5 text-[10px] font-semibold text-emerald-700">FREE delivery · Pack of {p.packSize}</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-[#222]">{formatINR(p.basePrice)}</span>
          {p.mrp > p.basePrice && <span className="text-[11px] text-gray-400 line-through">{formatINR(p.mrp)}</span>}
        </p>
      </button>
    </div>
  );
}

/* ------------------------------- page ---------------------------------- */

const PRICE_BUCKETS = [
  { key: "u100", label: "Under ₹100", test: (n: number) => n < 100 },
  { key: "100-250", label: "₹100 – ₹250", test: (n: number) => n >= 100 && n <= 250 },
  { key: "250-500", label: "₹250 – ₹500", test: (n: number) => n > 250 && n <= 500 },
  { key: "500p", label: "₹500+", test: (n: number) => n > 500 },
] as const;

export function EtsyHome({ data }: { data: VariantData }) {
  const { tops, companies, deals, featured, hot, top, budget, catProducts } = data;
  const { count, add } = useVariantCart();
  const [detail, setDetail] = useState<DProduct | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [bucket, setBucket] = useState<string | null>(null);
  const [tab, setTab] = useState<"featured" | "trending" | "budget">("featured");
  const [catMenu, setCatMenu] = useState(false);

  const hero = useMemo(() => {
    const picks = [deals[0], top[0], hot[1] ?? hot[0], featured[0]];
    return picks
      .filter((p): p is DProduct => !!p && p.image.startsWith("http"))
      .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
      .slice(0, 4);
  }, [deals, top, hot, featured]);

  const base = tab === "featured" ? featured : tab === "trending" ? [...top, ...hot] : budget;
  const picks = useMemo(() => {
    let rows = cat ? (catProducts[cat] ?? []) : base;
    if (bucket) {
      const b = PRICE_BUCKETS.find((x) => x.key === bucket);
      if (b) rows = rows.filter((p) => b.test(p.basePrice));
    }
    return rows.slice(0, 12);
  }, [cat, base, bucket, catProducts]);
  const catName = tops.find((t) => t.id === cat)?.name;

  const onCat = (id: string) => {
    setCat(id === cat ? null : id);
    setCatMenu(false);
    document.getElementById("picks")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF6EF] font-sans text-[#222]">
      {/* ============================== header ============================= */}
      <header className="sticky top-0 z-40 border-b border-[#E6DCCB] bg-[#FAF6EF]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/home/etsy" className="flex items-center gap-2">
            <Image src="/dmk-logo.png" alt="DMK Mart" width={36} height={36} className="h-9 w-9 rounded-full" unoptimized />
            <span className="font-serif text-xl font-bold tracking-tight">DMK Mart</span>
          </Link>
          <form onSubmit={(e) => e.preventDefault()} className="hidden h-11 flex-1 items-stretch overflow-hidden rounded-full border border-black bg-white md:flex">
            <button
              type="button"
              onClick={() => setCatMenu((m) => !m)}
              className="flex items-center gap-1 border-r border-gray-200 px-4 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              {catName ?? "All Categories"} <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <input
              placeholder="Search for anything wholesale…"
              className="w-full px-4 text-sm outline-none placeholder:text-gray-400"
              readOnly
              onFocus={() => document.getElementById("picks")?.scrollIntoView({ behavior: "smooth" })}
            />
            <button type="submit" className="bg-black px-5 text-xs font-bold text-yellow-400 hover:bg-gray-800">
              Search
            </button>
          </form>
          <div className="ml-auto flex items-center gap-4">
            <button className="hidden text-sm font-medium hover:underline md:block">Sign in</button>
            <button aria-label="Favourites" className="relative hidden sm:block">
              <Heart className="h-5 w-5" />
            </button>
            <Link href="/" aria-label="Cart" className="relative">
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[9px] font-bold text-yellow-400">
                  {count}
                </span>
              )}
            </Link>
          </div>
          {catMenu && (
            <div className="absolute left-1/2 top-16 z-50 w-64 -translate-x-1/3 rounded-2xl border border-[#E6DCCB] bg-white p-2 shadow-xl">
              <button onClick={() => onCat("")} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F4EDE3]">
                All Categories
              </button>
              {tops.map((t) => (
                <button key={t.id} onClick={() => onCat(t.id)} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F4EDE3]">
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* =========================== editorial hero ======================== */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-4 inline-block rounded-full bg-yellow-400/60 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]">
              Wholesale, but warm
            </p>
            <h1 className="font-serif text-4xl leading-[1.08] md:text-[3.4rem]">
              Wholesale that feels
              <span className="italic"> handmade</span> for your store.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-600 md:text-base">
              Shop once, stock the whole shelf. Dealer-priced household, kitchen and décor
              collections from 21 indie-friendly brands — packed carefully, invoiced itemised.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button
                onClick={() => document.getElementById("picks")?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-full bg-black px-7 py-3.5 text-xs font-black uppercase tracking-wide text-yellow-400 transition hover:bg-gray-800"
              >
                Start shopping
              </button>
              <Link href="/" className="text-sm font-semibold underline underline-offset-4 hover:text-black/70">
                How DMK works →
              </Link>
            </div>
            <p className="mt-6 text-[11px] text-gray-500">
              {data.stats.products.toLocaleString("en-IN")} curated SKUs · {data.stats.companies} brands · {data.stats.stores}+ partner stores
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {hero.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setDetail(p)}
                className={`relative overflow-hidden rounded-[1.6rem] ${i % 2 === 1 ? "mt-8" : ""} ${i === 0 ? "h-44 md:h-56" : "h-44 md:h-56"}`}
              >
                <Image src={p.image} alt={p.name} fill sizes="300px" className="object-cover transition duration-500 hover:scale-105" priority={i === 0} unoptimized />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ======================= popular categories ======================== */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-10 text-center">
        <h2 className="font-serif text-2xl md:text-3xl">Shop our popular categories</h2>
        <p className="mt-1 text-sm text-gray-500">Tap a circle to refresh the picks below</p>
        <div className="mt-6 flex justify-start gap-5 overflow-x-auto pb-3 scrollbar-hide md:justify-center">
          {tops.map((t) => (
            <button key={t.id} onClick={() => onCat(t.id)} className="group flex w-24 shrink-0 flex-col items-center">
              <span className={`relative block h-24 w-24 overflow-hidden rounded-full transition group-hover:scale-105 ${cat === t.id ? "ring-2 ring-black ring-offset-4 ring-offset-[#FAF6EF]" : ""}`}>
                <Image src={t.image} alt={t.name} fill sizes="96px" className="object-cover" unoptimized />
              </span>
              <span className="mt-2 text-xs font-medium leading-tight text-gray-700">{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ========================== editors' picks ========================= */}
      <section id="picks" className="mx-auto w-full max-w-6xl px-4 pb-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[#E6DCCB] pb-3">
          <h2 className="font-serif text-2xl md:text-3xl">{catName ? `${catName} picks` : "Editors\u2019 Picks"}</h2>
          <div className="flex gap-5 text-sm">
            {([
              { k: "featured", l: "Featured" },
              { k: "trending", l: "Trending" },
              { k: "budget", l: "Budget bulk" },
            ] as const).map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`pb-1 transition ${tab === t.k ? "font-bold text-black underline decoration-yellow-400 decoration-2 underline-offset-8" : "text-gray-500 hover:text-black"}`}
              >
                {t.l}
              </button>
            ))}
          </div>
        </div>
        {/* price chips */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {PRICE_BUCKETS.map((b) => (
            <button
              key={b.key}
              onClick={() => setBucket(bucket === b.key ? null : b.key)}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                bucket === b.key ? "border-black bg-black text-yellow-400" : "border-[#D8CCB8] bg-white text-gray-700 hover:border-black"
              }`}
            >
              {b.label}
            </button>
          ))}
          {(bucket || cat) && (
            <button
              onClick={() => { setBucket(null); setCat(null); }}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-rose-600 underline underline-offset-2"
            >
              Clear all
            </button>
          )}
          {picks.length === 0 && <span className="text-xs text-gray-400">Nothing in this range for the current pick — try another.</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {picks.map((p) => (
            <EtsyCard key={p.id} p={p} onOpen={setDetail} onAdd={add} />
          ))}
        </div>
      </section>

      {/* =========================== gift guides =========================== */}
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-10 md:grid-cols-2">
        {[
          {
            img: top[1]?.image ?? hero[2]?.image ?? "", title: "Gifts under ₹500, by the dozen",
            sub: "Festive-ready gifting stock that keeps margins healthy", cta: "Browse budget picks", act: () => { setTab("budget"); setBucket("100-250"); document.getElementById("picks")?.scrollIntoView({ behavior: "smooth" }); },
          },
          {
            img: hot[0]?.image ?? hero[3]?.image ?? "", title: "Business gifting, sorted",
            sub: "Curated corporate hampers with slab pricing & itemised invoices", cta: "Talk to our team", act: () => window.open("mailto:care@dmkmart.in"),
          },
        ].map((g) => (
          <div key={g.title} className="group relative h-64 overflow-hidden rounded-3xl md:h-72">
            {g.img && <Image src={g.img} alt={g.title} fill sizes="480px" className="object-cover transition duration-500 group-hover:scale-105" unoptimized />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="font-serif text-2xl text-white">{g.title}</p>
              <p className="mt-1 max-w-xs text-xs text-white/85">{g.sub}</p>
              <button
                onClick={g.act}
                className="mt-3 rounded-full bg-white px-5 py-2 text-[11px] font-black uppercase tracking-wide text-black transition hover:bg-yellow-400"
              >
                {g.cta}
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* =========================== trending row ========================== */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-12">
        <h2 className="mb-5 font-serif text-2xl md:text-3xl">Popular right now</h2>
        <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
          {[...top, ...hot].slice(0, 10).map((p) => (
            <EtsyCard key={p.id} p={p} onOpen={setDetail} onAdd={add} className="w-[230px] shrink-0" />
          ))}
        </div>
      </section>

      {/* ============================== footer ============================= */}
      <footer className="mt-auto border-t border-[#E6DCCB] bg-[#F1E9DC]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <p className="font-serif text-lg font-bold">DMK Mart</p>
            <p className="mt-2 text-xs leading-relaxed text-gray-600">
              A marketplace for store owners who care about the shelf as much as the spreadsheet.
            </p>
          </div>
          <div>
            <p className="mb-2.5 text-xs font-black uppercase tracking-wider">Help</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li><Link href="/" className="hover:underline">Help Centre</Link></li>
              <li><Link href="/" className="hover:underline">Delivery &amp; returns</Link></li>
              <li><Link href="/admin" className="hover:underline">Admin Portal</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-2.5 text-xs font-black uppercase tracking-wider">Discover</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              {tops.slice(0, 4).map((t) => (
                <li key={t.id}><button onClick={() => onCat(t.id)} className="hover:underline">{t.name}</button></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2.5 text-xs font-black uppercase tracking-wider">Brands we carry</p>
            <div className="flex flex-wrap gap-1.5">
              {companies.slice(0, 8).map((c) => (
                <span key={c.id} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-700">{c.name}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-[#E0D5C2] py-4">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4">
            <p className="text-[11px] text-gray-500">© 2026 DMK Mart, Inc. · Made warmly in Maharashtra</p>
            <DesignLinks />
          </div>
        </div>
      </footer>

      <ProductDialog p={detail} onClose={() => setDetail(null)} />
      <DesignSwitcher current="/home/etsy" />
    </div>
  );
}
