"use client";

import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal, X, ChevronLeft, ChevronRight, Warehouse, LayoutGrid } from "lucide-react";
import type { DProduct, TopCategoryNode, BrandNode } from "@/lib/types";
import { EndCategoryIconTile } from "@/lib/category-icons";
import { useCartStore } from "@/lib/store";
import { getCustomerToken } from "@/lib/customer-session";
import { ProductCard } from "./product-card";
import { useCatalog } from "./site-header-v2";

interface Filters {
  top: string; mid: string; end: string; brand: string;
  minPrice: string; maxPrice: string; sort: string; q: string; flag: string;
  warehouse: string;
}

const SORTS = [
  ["relevance", "Relevance"],
  ["price-asc", "Price: Low → High"],
  ["price-desc", "Price: High → Low"],
  ["discount", "Biggest Discount"],
  ["name-asc", "Name A → Z"],
  ["new", "Newest"],
];

export function CatalogView({
  title,
  tops,
  brands,
  initial,
}: {
  title: string;
  tops: TopCategoryNode[];
  brands: BrandNode[];
  initial?: Partial<Filters>;
}) {
  const [filters, setFilters] = useState<Filters>({
    top: "", mid: "", end: "", brand: "", minPrice: "", maxPrice: "", sort: "relevance", q: "", flag: "", warehouse: "",
    ...initial,
  });
  const catalog = useCatalog();
  const warehouses = catalog?.warehouses ?? [];
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ products: DProduct[]; total: number; pages: number }>({ products: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const setF = (patch: Partial<Filters>, opts?: { keepParents?: boolean }) => {
    setLoading(true);
    // an end-category chosen from the flat list implies its own parents — drop the others;
    // picking a department clears the end selection so the two never contradict.
    // keepParents: icon-tile category picks stay scoped under the chosen department.
    setFilters((f) => ({
      ...f,
      ...patch,
      ...(patch.top && !opts?.keepParents ? { mid: "", end: "" } : {}),
      ...(patch.mid && !opts?.keepParents ? { end: "" } : {}),
      ...(patch.end && !opts?.keepParents ? { top: "", mid: "" } : {}),
    }));
    setPage(1);
  };

  // price inputs stay freely editable — the fetch debounces so partial numbers ("5", "50") never fire
  const priceDigits = (v: string) => v.replace(/[^0-9]/g, "");

  const fetchPage = useCallback(async (params: Record<string, string>) => {
    // customer token rides along → the API filters the catalog to the buyer's nearest warehouse
    const token = getCustomerToken();
    const res = await fetch(`/api/products?${new URLSearchParams(params).toString()}`, {
      headers: token ? { "x-customer-token": token } : undefined,
    });
    return res.json();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params: Record<string, string> = { page: String(page), limit: "24", sort: filters.sort };
    if (filters.top) params.top = filters.top;
    if (filters.mid) params.mid = filters.mid;
    if (filters.end) params.end = filters.end;
    if (filters.brand) params.brand = filters.brand;
    if (filters.minPrice) params.minPrice = filters.minPrice;
    if (filters.maxPrice) params.maxPrice = filters.maxPrice;
    if (filters.q) params.q = filters.q;
    if (filters.flag) params.flag = filters.flag;
    if (filters.warehouse) params.warehouseId = filters.warehouse;
    // 300 ms debounce — price/keyword typing settles before the query fires
    const timer = setTimeout(() => {
      fetchPage(params)
        .then((d) => { if (!cancelled) setData(d); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filters, page, fetchPage]);

  const activeTop = tops.find((t) => t.id === filters.top);
  const activeMid = activeTop?.mids.find((m) => m.id === filters.mid);
  // departments with a single sub-department (e.g. "General") skip the mid step —
  // the category select then lists that mid's ends directly
  const singleMid = activeTop && activeTop.mids.length === 1 ? activeTop.mids[0] : null;

  const FilterPanel = (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Department</p>
        <select value={filters.top} onChange={(e) => setF({ top: e.target.value })} className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="">All Departments</option>
          {tops.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
        </select>
      </div>
      {activeTop && !singleMid && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Sub-Department</p>
          <select value={filters.mid} onChange={(e) => setF({ mid: e.target.value })} className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs">
            <option value="">All Sub-Departments</option>
            {activeTop.mids.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}
      {/* END-LEVEL CATEGORIES — meaningful icon on top, category name below.
          Scope follows the department picker: a mid's ends, a top's ends, or everything. */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Categories</p>
          {filters.end && (
            <button onClick={() => setF({ end: "" }, { keepParents: true })} className="text-[10px] font-bold text-yellow-600 hover:underline">
              Clear category
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/60 p-2">
          {(activeTop
            ? activeMid
              ? [{ label: activeMid.name, ends: activeMid.ends }]
              : activeTop.mids.filter((m) => m.ends.length > 0).map((m) => ({ label: m.name, ends: m.ends }))
            : tops.map((t) => ({ label: t.name, ends: t.mids.flatMap((m) => m.ends) }))
          )
            .filter((g) => g.ends.length > 0)
            .map((g) => (
              <div key={g.label} className="mb-2.5 last:mb-0">
                <p className="mb-1 truncate px-0.5 text-[10px] font-black uppercase tracking-wide text-gray-400">{g.label}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {g.ends.map((en) => (
                    <EndCategoryIconTile
                      key={en.id}
                      name={en.name}
                      active={filters.end === en.id}
                      onClick={() => setF({ end: filters.end === en.id ? "" : en.id }, { keepParents: true })}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
        <p className="mt-1 text-[10px] text-gray-400">Tap a category — the icon shows what lives inside.</p>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Brand</p>
        <select value={filters.brand} onChange={(e) => setF({ brand: e.target.value })} className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="">All Brands</option>
          {brands.map((b) => <option key={b.id} value={b.slug}>{b.name}</option>)}
        </select>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Sections</p>
        <div className="flex flex-wrap gap-1.5">
          {[["", "All"], ["featured", "Featured"], ["top", "Ready to Dispatch"], ["hot", "Hot"], ["deal", "Deals"]].map(([v, l]) => (
            <button
              key={v || "all"}
              onClick={() => setF({ flag: v })}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${filters.flag === v ? "bg-black text-yellow-400" : "border border-gray-200 text-gray-600 hover:border-yellow-400"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {/* WAREHOUSE — mandatory filter: stock location decides which SKUs actually ship */}
      <div>
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          <Warehouse className="h-3 w-3 text-yellow-600" /> Warehouse
        </p>
        <select value={filters.warehouse} onChange={(e) => setF({ warehouse: e.target.value })} className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="">All Warehouses</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.city ? ` — ${w.city}` : ""}</option>)}
        </select>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Price / piece (₹)</p>
        <div className="flex items-center gap-1.5">
          <input value={filters.minPrice} onChange={(e) => setF({ minPrice: priceDigits(e.target.value) })} placeholder="Min" inputMode="numeric" className="h-9 w-full rounded-lg border border-gray-200 px-2 text-xs" />
          <span className="text-gray-400">–</span>
          <input value={filters.maxPrice} onChange={(e) => setF({ maxPrice: priceDigits(e.target.value) })} placeholder="Max" inputMode="numeric" className="h-9 w-full rounded-lg border border-gray-200 px-2 text-xs" />
        </div>
        <p className="mt-1 text-[10px] text-gray-400">Matches the piece price shown on cards for your slab.</p>
      </div>
      <button
        onClick={() => setF({ top: "", mid: "", end: "", brand: "", minPrice: "", maxPrice: "", flag: "", q: "", warehouse: "" })}
        className="w-full rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
      >
        Clear All Filters
      </button>
    </div>
  );

  return (
    <section id="catalog" className="scroll-mt-40">
      <div className="mb-3 flex items-center justify-between">
        <div>
          {title ? <h2 className="text-lg font-black text-gray-900 md:text-xl">{title}</h2> : null}
          <p className={title ? "text-xs text-gray-500" : "text-xs font-bold text-gray-500"}>{loading ? "Loading…" : `${data.total} SKUs · pieces & packs`}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filters.sort} onChange={(e) => setF({ sort: e.target.value })} className="hidden h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs md:block" aria-label="Sort products">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={() => setShowFilters((s) => !s)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold lg:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          </button>
        </div>
      </div>

      <div className="flex gap-5">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-44 max-h-[75vh] overflow-y-auto rounded-xl border bg-white p-4">{FilterPanel}</div>
        </aside>
        {showFilters && (
          <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setShowFilters(false)}>
            <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold">Filters</p>
                <button onClick={() => setShowFilters(false)} aria-label="Close filters"><X className="h-5 w-5" /></button>
              </div>
              {FilterPanel}
              <button onClick={() => setShowFilters(false)} className="mt-4 w-full rounded-lg bg-black py-2.5 text-sm font-bold text-yellow-400">
                Show {data.total} Results
              </button>
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* CATEGORY STRIP — end-level icon tiles for the active department (icon on top, name below) */}
          {activeTop && !filters.end && (() => {
            const strip = activeMid ? activeMid.ends : activeTop.mids.flatMap((m) => m.ends);
            if (!strip.length) return null;
            return (
              <div className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-gray-500">
                  <LayoutGrid className="h-3.5 w-3.5 text-yellow-500" />
                  Categories in {activeTop.name}{activeMid ? ` › ${activeMid.name}` : ""}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
                  {strip.map((en) => (
                    <div key={en.id} className="w-[88px] shrink-0">
                      <EndCategoryIconTile
                        name={en.name}
                        active={filters.end === en.id}
                        onClick={() => setF({ end: en.id }, { keepParents: true })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-square rounded-xl bg-gray-100" />
                  <div className="mt-2 h-3 w-3/4 rounded bg-gray-100" />
                  <div className="mt-1.5 h-3 w-1/2 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          ) : data.products.length === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <p className="text-sm font-semibold text-gray-700">No products match your filters</p>
              <p className="mt-1 text-xs text-gray-400">Try clearing filters or searching a different term.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {data.products.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
              {data.pages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => { setLoading(true); setPage((p) => p - 1); }}
                    className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span className="text-xs font-semibold text-gray-600">Page {page} of {data.pages}</span>
                  <button
                    disabled={page >= data.pages}
                    onClick={() => { setLoading(true); setPage((p) => p + 1); }}
                    className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <p className="mt-3 text-center text-[11px] text-gray-400">
                Wholesale prices · Itemised invoice on every dispatch
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
