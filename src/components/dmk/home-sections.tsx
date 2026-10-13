"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import type { DProduct } from "@/lib/types";
import { ProductCard } from "./product-card";

export function DeptShowcase({
  tops,
  onOpen,
}: {
  tops: { id: string; name: string; emoji: string; image: string; mids: unknown[] }[];
  onOpen: (id: string) => void;
}) {
  return (
    <section id="departments">
      <div className="mb-3">
        <h2 className="text-lg font-black text-gray-900 md:text-xl">Shop by Department</h2>
        <p className="text-xs text-gray-500">{tops.length} wholesale departments · 300+ end categories</p>
      </div>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-5 md:gap-3 lg:grid-cols-9">
        {tops.map((t) => (
          <button
            key={t.id}
            onClick={() => onOpen(t.id)}
            className="group flex flex-col items-center gap-1.5 rounded-xl border bg-white p-2 transition hover:border-yellow-400 hover:shadow-md"
          >
            <Image
              src={t.image}
              alt={t.name}
              width={96}
              height={96}
              className="h-16 w-16 rounded-lg object-cover transition group-hover:scale-105 md:h-20 md:w-20"
              unoptimized
            />
            <p className="line-clamp-2 text-center text-[10px] font-semibold leading-tight text-gray-800 md:text-[11px]">
              {t.name}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ProductRow({
  title,
  sub,
  products,
  onOpen,
  onSeeAll,
}: {
  title: string;
  sub?: string;
  products: DProduct[];
  onOpen: (p: DProduct) => void;
  onSeeAll?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  if (!products.length) return null;
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * 600, behavior: "smooth" });
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-900 md:text-xl">{title}</h2>
          {sub && <p className="text-xs text-gray-500">{sub}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onSeeAll && (
            <Link
              href="#catalog"
              onClick={(e) => { e.preventDefault(); onSeeAll(); }}
              className="text-xs font-bold text-yellow-700 hover:underline"
            >
              View All →
            </Link>
          )}
          <div className="hidden gap-1 md:flex">
            <button onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`} className="rounded-full border p-1.5 hover:bg-gray-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => scroll(1)} aria-label={`Scroll ${title} right`} className="rounded-full border p-1.5 hover:bg-gray-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div ref={ref} className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {products.map((p) => (
          <div key={p.id} className="w-[168px] shrink-0 md:w-[200px]">
            <ProductCard p={p} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </section>
  );
}
