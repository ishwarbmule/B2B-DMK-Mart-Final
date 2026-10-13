"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { ProductCard } from "./product-card";
import type { DProduct } from "@/lib/types";

export function ProductRow({
  title,
  subtitle,
  products,
  onOpen,
  onSeeAll,
}: {
  title: string;
  subtitle?: string;
  products: DProduct[];
  onOpen: (p: DProduct) => void;
  onSeeAll?: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  const scroll = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * 480, behavior: "smooth" });
  };

  return (
    <section className="max-w-7xl mx-auto px-3 sm:px-4 mt-6" aria-label={title}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base sm:text-xl font-bold text-slate-800">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onSeeAll && (
            <button
              onClick={onSeeAll}
              className="text-xs sm:text-sm font-semibold text-black hover:underline font-bold"
            >
              See all
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => scroll(-1)}
              className="p-1.5 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors"
              aria-label={`Scroll ${title} left`}
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <button
              onClick={() => scroll(1)}
              className="p-1.5 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors"
              aria-label={`Scroll ${title} right`}
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
      <div
        ref={scroller}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x"
      >
        {products.map((p) => (
          <div key={p.id} className="snap-start">
            <ProductCard product={p} onOpen={onOpen} compact />
          </div>
        ))}
      </div>
    </section>
  );
}
