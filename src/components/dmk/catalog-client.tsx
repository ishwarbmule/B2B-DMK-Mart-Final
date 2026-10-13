"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CatalogView } from "./catalog-view";
import { useCatalog } from "./site-header-v2";
import { Skeleton } from "@/components/ui/skeleton";

export function CatalogClient() {
  const params = useSearchParams();
  const catalog = useCatalog();

  const q = params.get("q") ?? "";
  const top = params.get("top") ?? "";
  const brand = params.get("brand") ?? "";
  const flag = params.get("flag") ?? "";

  const title = useMemo(() => {
    if (q) return `Results for "${q}"`;
    if (flag === "deal") return "Deals of the Day";
    if (flag === "hot") return "Hot Products";
    if (flag === "featured") return "Featured Picks";
    if (flag === "top") return "Top Selling";
    if (brand) {
      const b = catalog?.brands.find((x) => x.slug === brand);
      return b ? `${b.name} — Brand Catalog` : "Brand Catalog";
    }
    if (top) {
      const t = catalog?.tops.find((x) => x.id === top);
      return t ? `${t.emoji} ${t.name}` : "Wholesale Catalog";
    }
    return "Wholesale Catalog — All Products";
  }, [q, top, brand, flag, catalog]);

  if (!catalog) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-3 px-3 py-5 md:px-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 md:px-6">
      <CatalogView
        key={`${q}|${top}|${brand}|${flag}`}
        title={title}
        tops={catalog.tops}
        brands={catalog.brands}
        initial={{ q, top, brand, flag }}
      />
    </div>
  );
}
