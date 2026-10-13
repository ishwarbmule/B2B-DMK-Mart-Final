"use client";

import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { DProduct, TopCategoryNode, BrandNode } from "@/lib/types";
import { ProductCard } from "./product-card";

interface Filters {
  top: string; mid: string; end: string; brand: string;
  minPrice: string; maxPrice: string; sort: string; q: string; flag: string;
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
    top: "", mid: "", end: "", brand: "", minPrice: "", maxPrice: "", sort: "relevance", q: "", flag: "",
    ...initial,
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ products: DProduct[]; total: number; pages: number }>({ products: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const setF = (patch: Partial<Filters>) => {
    setLoading(true);
    setFilters((f) => ({ ...f, ...patch, ...(patch.top ? { mid: "", end: "" } : {}), ...(patch.mid ? { end: "" } : {}) }));
    setPage(1);
  };

  const fetchPage = useCallback(async (params: Record<string, string>) => {
    const res = await fetch(`/api/products?${new URLSearchParams(params).toString()}`);
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
    fetchPage(params)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, page, fetchPage]);

  const activeTop = tops.find((t) => t.id === filters.top);
  const activeMid = activeTop?.mids.find((m) => m.id === filters.mid);

  const FilterPanel = (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Department</p>
        <select value={filters.top} onChange={(e) => setF({ top: e.target.value })} className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="">All Departments</option>
          {tops.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
        </select>
      </div>
      {activeTop && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Sub-Department</p>
          <select value={filters.mid} onChange={(e) => setF({ mid: e.target.value })} className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs">
            <option value="">All Sub-Departments</option>
            {activeTop.mids.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}
      {activeMid && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Category</p>
          <select value={filters.end} onChange={(e) => setF({ end: e.target.value })} className="h-9 w-full max-h-32 rounded-lg border border-gray-200 bg-white px-2 text-xs">
            <option value="">All Categories</option>
            {activeMid.ends.map((e2) => <option key={e2.id} value={e2.id}>{e2.name}</option>)}
          </select>
        </div>
      )}
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
          {[["", "All"], ["featured", "Featured"], ["top", "Top"], ["hot", "Hot"], ["deal", "Deals"]].map(([v, l]) => (
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
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">Price / piece (₹)</p>
        <div className="flex items-center gap-1.5">
          <input value={filters.minPrice} onChange={(e) => setF({ minPrice: e.target.value })} placeholder="Min" inputMode="numeric" className="h-9 w-full rounded-lg border border-gray-200 px-2 text-xs" />
          <span className="text-gray-400">–</span>
          <input value={filters.maxPrice} onChange={(e) => setF({ maxPrice: e.target.value })} placeholder="Max" inputMode="numeric" className="h-9 w-full rounded-lg border border-gray-200 px-2 text-xs" />
        </div>
      </div>
      <button
        onClick={() => setF({ top: "", mid: "", end: "", brand: "", minPrice: "", maxPrice: "", flag: "", q: "" })}
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
          <h2 className="text-lg font-black text-gray-900 md:text-xl">{title}</h2>
          <p className="text-xs text-gray-500">{loading ? "Loading…" : `${data.total} SKUs · pieces, packs & bulk cases`}</p>
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
                Wholesale prices are exclusive of GST · GST invoice on every dispatch
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
