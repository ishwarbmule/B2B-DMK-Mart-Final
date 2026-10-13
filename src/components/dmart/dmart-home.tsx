"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "./header";
import { HeroCarousel } from "./hero-carousel";
import { CategoryTiles } from "./category-tiles";
import { ProductRow } from "./product-row";
import { ProductGrid } from "./product-grid";
import { CartDrawer } from "./cart-drawer";
import { CheckoutDialog } from "./checkout-dialog";
import { ProductDetail } from "./product-detail";
import { Footer } from "./footer";
import { AdminLogin } from "./admin-login";
import { AdminDashboard } from "./admin-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgePercent, Truck, Timer, ShieldCheck, ChevronLeft, SearchX } from "lucide-react";
import type { DCategory, DProduct } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";

const ADMIN_TOKEN_KEY = "dmk-admin-token";

type View = { kind: "home" } | { kind: "category"; categoryId: string } | { kind: "search" };

export function DmartHome() {
  const [categories, setCategories] = useState<DCategory[]>([]);
  const [products, setProducts] = useState<DProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<View>({ kind: "home" });
  const [detail, setDetail] = useState<DProduct | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const mounted = useHydrated();

  // Restore admin session + support #admin deep link
  useEffect(() => {
    if (!mounted) return;
    const saved = localStorage.getItem(ADMIN_TOKEN_KEY);
    const wantsAdmin = window.location.hash === "#admin";
    if (saved) {
      // Validate saved token against server
      fetch("/api/admin/stats", { headers: { "x-admin-token": saved } })
        .then((r) => {
          if (r.ok) setAdminToken(saved);
          else localStorage.removeItem(ADMIN_TOKEN_KEY);
        })
        .catch(() => localStorage.removeItem(ADMIN_TOKEN_KEY))
        .finally(() => setAdminChecked(true));
    } else {
      setAdminChecked(true);
    }
    if (wantsAdmin && !saved) setAdminLoginOpen(true);
  }, [mounted]);

  // Initial data load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cRes, pRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/products"),
        ]);
        const cData = await cRes.json();
        const pData = await pRes.json();
        if (!alive) return;
        setCategories(cData.categories ?? []);
        setProducts(pData.products ?? []);
      } catch (e) {
        console.error("Failed to load store data", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (debounced) setView({ kind: "search" });
    else setView((v) => (v.kind === "search" ? { kind: "home" } : v));
  }, [debounced]);

  const activeCategory = useMemo(
    () => (view.kind === "category" ? categories.find((c) => c.id === view.categoryId) ?? null : null),
    [view, categories]
  );

  const visibleProducts = useMemo(() => {
    if (view.kind === "category" && activeCategory) {
      return products.filter((p) => p.categoryId === activeCategory.id);
    }
    if (view.kind === "search" && debounced) {
      const q = debounced.toLowerCase();
      return products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.category.name.toLowerCase().includes(q) ||
          p.packSize.toLowerCase().includes(q)
      );
    }
    return [];
  }, [view, debounced, products, activeCategory]);

  const dealProducts = useMemo(
    () => products.filter((p) => p.isDeal).slice(0, 12),
    [products]
  );

  const goHome = useCallback(() => {
    setView({ kind: "home" });
    setSearch("");
  }, []);

  const openDetail = useCallback((p: DProduct) => {
    setDetail(p);
    setDetailOpen(true);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header
        categories={categories}
        search={search}
        onSearch={setSearch}
        onHome={goHome}
        onCategory={(id) => {
          setSearch("");
          setView({ kind: "category", categoryId: id });
        }}
        activeCategoryId={view.kind === "category" ? view.categoryId : null}
      />

      <main className="flex-1 pb-10">
        {loading ? (
          <div className="max-w-7xl mx-auto px-3 sm:px-4 mt-4 space-y-6">
            <Skeleton className="h-40 sm:h-56 w-full rounded-xl" />
            <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-6 w-52" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          </div>
        ) : view.kind === "home" ? (
          <>
            {/* Benefits strip */}
            <div className="max-w-7xl mx-auto px-3 sm:px-4 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { icon: BadgePercent, text: "Best wholesale prices", color: "#b8860b" },
                  { icon: Truck, text: "Free delivery above ₹500", color: "#16a34a" },
                  { icon: Timer, text: "Express 2-hour delivery", color: "#ea580c" },
                  { icon: ShieldCheck, text: "Bulk B2B tier pricing", color: "#9333ea" },
                ].map((b) => (
                  <div
                    key={b.text}
                    className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <b.icon className="h-4 w-4 shrink-0" style={{ color: b.color }} />
                    <span className="text-[11px] sm:text-xs font-semibold text-slate-600 truncate">
                      {b.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-3 sm:px-4 mt-4">
              <HeroCarousel onShopNow={() => document.getElementById("deals")?.scrollIntoView({ behavior: "smooth" })} />
            </div>

            <CategoryTiles
              categories={categories}
              onSelect={(id) => {
                setSearch("");
                setView({ kind: "category", categoryId: id });
              }}
            />

            <div id="deals">
              <ProductRow
                title="⚡ Deals of the Week"
                subtitle="Biggest discounts, refreshed every week"
                products={dealProducts}
                onOpen={openDetail}
                onSeeAll={() => setView({ kind: "search" })}
              />
            </div>

            {categories.map((c) => (
              <ProductRow
                key={c.id}
                title={`${c.emoji} ${c.name}`}
                subtitle={`${c._count.products} products available`}
                products={products.filter((p) => p.categoryId === c.id).slice(0, 10)}
                onOpen={openDetail}
                onSeeAll={() => {
                  setSearch("");
                  setView({ kind: "category", categoryId: c.id });
                }}
              />
            ))}
          </>
        ) : (
          <div className="max-w-7xl mx-auto px-3 sm:px-4 mt-5">
            <button
              onClick={goHome}
              className="inline-flex items-center gap-1 text-sm font-semibold text-black hover:underline mb-3"
            >
              <ChevronLeft className="h-4 w-4" /> Back to Home
            </button>

            {view.kind === "category" ? (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <span
                    className="h-10 w-10 rounded-full flex items-center justify-center text-xl"
                    style={{ background: `${activeCategory?.color ?? "#111111"}1f` }}
                    aria-hidden
                  >
                    {activeCategory?.emoji}
                  </span>
                  <div>
                    <h1 className="text-lg sm:text-2xl font-bold text-slate-800">
                      {activeCategory?.name ?? "Category"}
                    </h1>
                    <p className="text-xs text-slate-500">
                      {visibleProducts.length} products · Best prices guaranteed
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <ProductGrid products={visibleProducts} onOpen={openDetail} />
                </div>
              </>
            ) : (
              <>
                <h1 className="text-lg sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <SearchX className="h-5 w-5 text-[#b8860b]" aria-hidden />
                  {debounced ? (
                    <>
                      Results for &ldquo;{debounced}&rdquo;
                      <span className="text-sm font-normal text-slate-400">
                        ({visibleProducts.length} found)
                      </span>
                    </>
                  ) : (
                    "All Deals & Offers"
                  )}
                </h1>
                <div className="mt-4">
                  {debounced && visibleProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                      <div className="text-6xl mb-4" aria-hidden>🔍</div>
                      <h3 className="text-lg font-semibold text-slate-700">
                        No products match &ldquo;{debounced}&rdquo;
                      </h3>
                      <p className="text-sm text-slate-400 mt-1 mb-5">
                        Check the spelling or try browsing our categories.
                      </p>
                      <Button onClick={goHome} className="bg-black hover:bg-[#2c2c2c] text-[#ffd400] font-bold">
                        Browse Categories
                      </Button>
                    </div>
                  ) : (
                    <ProductGrid
                      products={visibleProducts}
                      onOpen={openDetail}
                      emptyMessage={debounced ? `No results for "${debounced}"` : "No products found."}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <Footer
        onAdmin={() => {
          if (adminToken) return;
          setAdminLoginOpen(true);
        }}
      />

      <CartDrawer
        categories={categories}
        onBrowse={(categoryId) => setView({ kind: "category", categoryId })}
        onCheckout={() => setCheckoutOpen(true)}
      />
      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} />
      <ProductDetail product={detail} open={detailOpen} onOpenChange={setDetailOpen} />

      {/* Admin panel */}
      {adminChecked && (
        <>
          <AdminLogin
            open={adminLoginOpen && !adminToken}
            onOpenChange={setAdminLoginOpen}
            onLogin={(token) => {
              localStorage.setItem(ADMIN_TOKEN_KEY, token);
              setAdminToken(token);
              setAdminLoginOpen(false);
            }}
          />
          {adminToken && (
            <AdminDashboard
              token={adminToken}
              categories={categories}
              onClose={() => setAdminToken(null)}
              onLogout={() => {
                localStorage.removeItem(ADMIN_TOKEN_KEY);
                setAdminToken(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
