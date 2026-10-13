"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Search, MapPin, Store as StoreIcon, Star } from "lucide-react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import {
  BrandMarquee,
  CategoryRail,
  DealsBento,
  DeptCards,
  HeroV2,
  HowItWorks,
  TabbedShowcase,
} from "./home-v2";
import { CatalogView } from "./catalog-view";
import { ProductDialog } from "./product-dialog";
import { CartDrawer } from "./cart-drawer";
import { CheckoutDialog } from "./checkout-dialog";
import { AdminLoginDialog } from "@/components/admin/login-dialog";
import type { CatalogPayload, DProduct } from "@/lib/types";

type View = "home" | "catalog" | "brands" | "stores";

interface StoreRow { id: string; name: string; manager: string; phone: string; zone: string; city: string; area: string; status: string }

export function DmkSite() {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [view, setView] = useState<View>("home");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<{ products: DProduct[]; total: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState<DProduct | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [flag, setFlag] = useState<"" | "featured" | "hot" | "top">("");
  const [catalogTitle, setCatalogTitle] = useState("All Products");
  const [initialFilters, setInitialFilters] = useState<Record<string, string>>({});
  const [homeRows, setHomeRows] = useState<{ featured: DProduct[]; hot: DProduct[]; top: DProduct[]; deals: DProduct[] }>({ featured: [], hot: [], top: [], deals: [] });
  const [stores, setStores] = useState<StoreRow[]>([]);

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => {});
    fetch("/api/admin/public-stores")
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => setStores(d.rows || []))
      .catch(() => {});
  }, []);

  const fetchPage = useCallback(
    async (params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`/api/products?${qs}`);
      return res.json();
    },
    []
  );

  const loadHomeRows = useCallback(async () => {
    const get = async (extra: string) => {
      const res = await fetch(`/api/products?limit=12&${extra}`);
      const d = await res.json();
      return d.products as DProduct[];
    };
    const [featured, hot, top, deals] = await Promise.all([
      get("flag=featured"),
      get("flag=hot"),
      get("flag=top"),
      get("sort=price-asc&minPrice=1"),
    ]);
    setHomeRows({ featured, hot, top, deals });
  }, []);

  useEffect(() => {
    if (view === "home") loadHomeRows();
  }, [view, loadHomeRows]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null);
      setView((v) => (v === "home" ? v : "home"));
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&limit=24`);
      const d = await res.json();
      setSearchResults(d);
      setView("catalog");
      setCatalogTitle(`Results for "${q}"`);
      setInitialFilters({});
      setFlag("");
    } finally {
      setSearching(false);
    }
  }, []);

  const openTopCategory = useCallback(
    (topId: string) => {
      setSearchQ("");
      setSearchResults(null);
      setFlag("");
      const t = catalog?.tops.find((x) => x.id === topId);
      setCatalogTitle(t ? t.name : "All Products");
      setInitialFilters({ top: topId });
      setView("catalog");
      window.scrollTo({ top: 0 });
    },
    [catalog]
  );

  const openCatalog = (f: typeof flag, title: string) => {
    setSearchQ("");
    setSearchResults(null);
    setFlag(f);
    setCatalogTitle(title);
    setInitialFilters({});
    setView("catalog");
  };

  const catalogKey = useMemo(() => JSON.stringify(initialFilters) + flag + searchQ, [initialFilters, flag, searchQ]);

  if (!catalog) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-[1400px] animate-pulse p-6">
          <div className="h-16 rounded-xl bg-gray-200" />
          <div className="mt-4 h-72 rounded-2xl bg-gray-200" />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-square rounded-xl bg-gray-200" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader
        tops={catalog.tops}
        announcement={catalog.settings.announcement || "Wholesale dealer pricing for B2B buyers"}
        onSearch={runSearch}
        onNavigate={(v) => {
          if (v === "catalog") openCatalog("", "All Products");
          else if (v === "brands") setView("brands");
          else if (v === "stores") setView("stores");
          else { setSearchQ(""); setSearchResults(null); setView("home"); }
          window.scrollTo({ top: 0 });
        }}
        onTopCategory={openTopCategory}
        onAdmin={() => setAdminOpen(true)}
      />

      <main className="mx-auto max-w-[1400px] space-y-8 px-3 py-5 md:px-6">
        {view === "home" && (
          <>
            <HeroV2
              sliders={catalog.sliders}
              hot={homeRows.hot}
              featured={homeRows.featured}
              stats={catalog.stats}
              onShopAll={() => openCatalog("", "All Products")}
              onDeals={() => {
                document.getElementById("deals")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />

            <CategoryRail tops={catalog.tops} onOpen={openTopCategory} />

            <DealsBento
              hot={homeRows.hot}
              deals={homeRows.deals}
              stats={{ products: catalog.stats.products, stores: catalog.stats.stores }}
              onOpen={setDetail}
              onSeeAll={() => openCatalog("hot", "Hot Deals")}
            />

            <TabbedShowcase
              rows={homeRows}
              onOpen={setDetail}
              onSeeAll={(tab) => {
                if (tab === "featured") openCatalog("featured", "Featured Products");
                else if (tab === "top") openCatalog("top", "Top Selling Products");
                else if (tab === "hot") openCatalog("hot", "Hot Deals");
                else openCatalog("", "Budget Bulk");
              }}
            />

            <DeptCards
              tops={catalog.tops.map((t) => ({ ...t, count: t.productCount }))}
              onOpen={openTopCategory}
            />

            <HowItWorks freeAbove={catalog.settings.freeDeliveryAbove} />

            <BrandMarquee
              companies={catalog.companies}
              onBrand={(id) => {
                const c = catalog.companies.find((x) => x.id === id);
                setInitialFilters({ company: id });
                setCatalogTitle(`${c?.name ?? "Brand"} · Dealer Catalog`);
                setFlag("");
                setSearchQ("");
                setSearchResults(null);
                setView("catalog");
                window.scrollTo({ top: 0 });
              }}
            />

            <CatalogView
              key={catalogKey}
              title="All Products"
              tops={catalog.tops}
              companies={catalog.companies}
              fetchPage={fetchPage}
              onOpen={setDetail}
            />
          </>
        )}

        {view === "catalog" && (
          <CatalogView
            key={catalogKey}
            title={searchResults ? catalogTitle : catalogTitle || "All Products"}
            tops={catalog.tops}
            companies={catalog.companies}
            fetchPage={async (params) => {
              if (searchResults && searchQ) return { ...searchResults, pages: 1 };
              if (flag) return fetchPage({ ...params, flag });
              return fetchPage({ ...params, top: initialFilters.top || "", company: initialFilters.company || "" });
            }}
            onOpen={setDetail}
          />
        )}

        {view === "brands" && (
          <section className="space-y-5">
            <div>
              <h1 className="text-xl font-black md:text-2xl">Brand Portfolio</h1>
              <p className="text-sm text-gray-500">{catalog.companies.length} active manufacturing partners · {catalog.stats.products} live SKUs</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {catalog.companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setInitialFilters({ company: c.id });
                    setCatalogTitle(`${c.name} · Dealer Catalog`);
                    setFlag("");
                    setSearchQ("");
                    setSearchResults(null);
                    setView("catalog");
                  }}
                  className="relative flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 transition hover:border-yellow-400 hover:shadow-md"
                >
                  {c.isStar && <span className="absolute right-2 top-2 rounded-full bg-yellow-400 p-1"><Star className="h-3 w-3 fill-black text-black" /></span>}
                  <Image src={c.logo} alt={c.name} width={80} height={80} className="h-20 w-20 rounded-xl object-cover" unoptimized />
                  <p className="text-center text-xs font-bold">{c.name}</p>
                  <p className="text-[11px] text-gray-400">{c._count?.products ?? 0} SKUs</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === "stores" && (
          <section className="space-y-5">
            <div>
              <h1 className="text-xl font-black md:text-2xl">Our Retail Network</h1>
              <p className="text-sm text-gray-500">Verified B2B partners across Maharashtra — visit a counter near you</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(stores.length ? stores : []).map((s) => (
                <div key={s.id} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-500">Manager: {s.manager}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-600"}`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-[11px] text-gray-500">
                    <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {s.area}, {s.city} · {s.zone} Zone</p>
                    <p className="flex items-center gap-1.5"><StoreIcon className="h-3 w-3" /> {s.phone}</p>
                  </div>
                </div>
              ))}
              {!stores.length && (
                <div className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-gray-400">
                  Store directory is being synced — check back shortly.
                </div>
              )}
            </div>
          </section>
        )}

        {searching && (
          <div className="fixed inset-x-0 top-16 z-50 mx-auto w-fit rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-yellow-400 shadow-lg">
            <Search className="mr-1 inline h-3 w-3" /> Searching…
          </div>
        )}
      </main>

      <SiteFooter tops={catalog.tops} settings={catalog.settings} onAdmin={() => setAdminOpen(true)} onTopCategory={openTopCategory} />

      <ProductDialog p={detail} onClose={() => setDetail(null)} />
      <CartDrawer onCheckout={() => setCheckout(true)} />
      <CheckoutDialog open={checkout} onOpenChange={setCheckout} />
      <AdminLoginDialog open={adminOpen} onOpenChange={setAdminOpen} />
    </div>
  );
}
