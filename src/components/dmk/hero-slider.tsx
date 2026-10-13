"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SliderRow } from "@/lib/types";

export function HeroSlider({ sliders, onCta }: { sliders: SliderRow[]; onCta: () => void }) {
  const [idx, setIdx] = useState(0);
  const n = sliders.length;

  useEffect(() => {
    if (n <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 5000);
    return () => clearInterval(t);
  }, [n]);

  if (!n) return null;
  const s = sliders[idx];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <div className="relative aspect-[1200/480] max-h-[380px] w-full">
        <Image
          key={s.id}
          src={s.image}
          alt={s.heading}
          fill
          sizes="(max-width: 1024px) 100vw, 1100px"
          className="object-cover"
          priority
          unoptimized
        />
        <div className="absolute inset-0 flex flex-col justify-center gap-3 bg-gradient-to-r from-black/70 via-black/20 to-transparent p-6 md:p-12">
          <span className="w-fit rounded-full bg-yellow-400 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-black">
            DMK Mart Exclusive
          </span>
          <h2 className="max-w-md text-2xl font-black leading-tight text-white md:text-4xl">
            {s.heading}
          </h2>
          <p className="max-w-md text-xs text-gray-200 md:text-sm">{s.content}</p>
          <button
            onClick={onCta}
            className="w-fit rounded-lg bg-yellow-400 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-black transition hover:bg-yellow-300 md:text-sm"
          >
            {s.buttonText || "Shop Now"} →
          </button>
        </div>
      </div>

      {n > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + n) % n)}
            aria-label="Previous offer"
            className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow hover:bg-white sm:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % n)}
            aria-label="Next offer"
            className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow hover:bg-white sm:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {sliders.map((sl, i) => (
              <button
                key={sl.id}
                onClick={() => setIdx(i)}
                aria-label={`Go to offer ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-yellow-400" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
