"use client";

import { PackageSearch } from "lucide-react";
import { ProductCard } from "./product-card";
import type { DProduct } from "@/lib/types";

export function ProductGrid({
  products,
  onOpen,
  emptyMessage = "No products found.",
}: {
  products: DProduct[];
  onOpen: (p: DProduct) => void;
  emptyMessage?: string;
}) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <PackageSearch className="h-14 w-14 text-slate-300 mb-4" aria-hidden />
        <h3 className="text-lg font-semibold text-slate-700">{emptyMessage}</h3>
        <p className="text-sm text-slate-400 mt-1">Try browsing our categories or search for something else.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} onOpen={onOpen} />
      ))}
    </div>
  );
}
