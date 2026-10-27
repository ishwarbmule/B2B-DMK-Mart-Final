"use client";

import Image from "next/image";
import { useRef } from "react";
import { ChevronLeft, ChevronRight, Star, ShieldCheck, Truck, Percent } from "lucide-react";
import type { CompanyNode } from "@/lib/types";

export function BenefitsStrip() {
  const items = [
    { icon: Percent, title: "Wholesale Dealer Rates", sub: "Slab discounts up to 10%" },
    { icon: ShieldCheck, title: "Itemised Invoice", sub: "Clear per-line billing on every bill" },
    { icon: Truck, title: "Fast Dispatch", sub: "2,400+ SKUs ready to move" },
    { icon: Star, title: "21 Trusted Brands", sub: "Verified manufacturers only" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
      {items.map((it) => (
        <div key={it.title} className="flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 md:px-4">
          <it.icon className="h-5 w-5 shrink-0 text-yellow-600" />
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-gray-900 md:text-[13px]">{it.title}</p>
            <p className="truncate text-[10px] text-gray-500 md:text-[11px]">{it.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BrandStrip({ companies, onBrand }: { companies: CompanyNode[]; onBrand: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * 400, behavior: "smooth" });
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-900 md:text-xl">Shop by Brand</h2>
          <p className="text-xs text-gray-500">{companies.length} verified manufacturers · dealer pricing</p>
        </div>
        <div className="hidden gap-1 md:flex">
          <button onClick={() => scroll(-1)} aria-label="Scroll brands left" className="rounded-full border p-1.5 hover:bg-gray-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => scroll(1)} aria-label="Scroll brands right" className="rounded-full border p-1.5 hover:bg-gray-50">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={ref} className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {companies.map((c) => (
          <button
            key={c.id}
            onClick={() => onBrand(c.id)}
            className="group relative flex w-32 shrink-0 flex-col items-center gap-2 rounded-xl border bg-white p-3 transition hover:border-yellow-400 hover:shadow-md"
          >
            {c.isStar && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-yellow-400 p-0.5" title="Star brand">
                <Star className="h-3 w-3 fill-black text-black" />
              </span>
            )}
            <Image src={c.logo} alt={c.name} width={64} height={64} className="h-16 w-16 rounded-lg object-cover" unoptimized />
            <p className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-gray-800">{c.name}</p>
            <p className="text-[10px] text-gray-400">{c._count?.products ?? 0} SKUs</p>
          </button>
        ))}
      </div>
    </section>
  );
}
