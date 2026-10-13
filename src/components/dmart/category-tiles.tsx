"use client";

import type { DCategory } from "@/lib/types";

export function CategoryTiles({
  categories,
  onSelect,
}: {
  categories: DCategory[];
  onSelect: (id: string) => void;
}) {
  return (
    <section className="max-w-7xl mx-auto px-3 sm:px-4 mt-6" aria-label="Shop by category">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base sm:text-xl font-bold text-slate-800">Shop by Category</h2>
          <p className="text-xs text-slate-500">Everything your home needs, at DMK Mart prices</p>
        </div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 gap-2 sm:gap-3">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="group flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 sm:p-3 hover:border-black/50 hover:shadow-md transition-all active:scale-95"
          >
            <span
              className="h-11 w-11 sm:h-14 sm:w-14 rounded-full flex items-center justify-center text-2xl sm:text-3xl group-hover:scale-110 transition-transform"
              style={{ background: `${c.color}1f` }}
              aria-hidden
            >
              {c.emoji}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold text-slate-700 leading-tight text-center line-clamp-2">
              {c.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
