"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const banners = [
  {
    id: 1,
    title: "DMK Mega B2B Sale",
    subtitle: "Up to 65% OFF on wholesale packs · Tier pricing for dealers",
    cta: "Shop Deals",
    emoji: "🏷️",
    from: "#ffd400",
    to: "#f5b800",
    text: "#111111",
    accent: "#111111",
    accentText: "#ffd400",
  },
  {
    id: 2,
    title: "Planters & Garden Fiesta",
    subtitle: "500+ pots, planters & garden tools in stock",
    cta: "Buy Now",
    emoji: "🪴",
    from: "#14532d",
    to: "#16a34a",
    text: "#ffffff",
    accent: "#ffd400",
    accentText: "#14532d",
  },
  {
    id: 3,
    title: "Cleaning Combo Bonanza",
    subtitle: "Mops, wipers & brushes starting ₹49",
    cta: "Explore Now",
    emoji: "🧹",
    from: "#134e4a",
    to: "#0d9488",
    text: "#ffffff",
    accent: "#ffd400",
    accentText: "#134e4a",
  },
  {
    id: 4,
    title: "Kitchen & Dining Fest",
    subtitle: "Containers, jars & cookware · Up to 45% OFF",
    cta: "Grab Offers",
    emoji: "🍽️",
    from: "#111111",
    to: "#3f3f46",
    text: "#ffffff",
    accent: "#ffd400",
    accentText: "#111111",
  },
];

export function HeroCarousel({ onShopNow }: { onShopNow: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, [paused]);

  const go = (dir: number) => setIndex((i) => (i + dir + banners.length) % banners.length);
  const banner = banners[index];

  return (
    <section
      className="relative overflow-hidden rounded-xl mx-auto max-w-7xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Offers"
    >
      <div
        className="h-40 sm:h-52 md:h-60 flex items-center justify-between px-6 sm:px-12 transition-colors duration-700"
        style={{ background: `linear-gradient(120deg, ${banner.from} 0%, ${banner.to} 100%)` }}
      >
        <div className="flex-1 min-w-0">
          <span
            className="inline-block text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2"
            style={{ background: banner.accent, color: banner.accentText }}
          >
            DMK Mart Exclusive
          </span>
          <h2
            className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight drop-shadow-sm"
            style={{ color: banner.text }}
          >
            {banner.title}
          </h2>
          <p className="text-xs sm:text-sm md:text-base mt-1" style={{ color: banner.text, opacity: 0.8 }}>
            {banner.subtitle}
          </p>
          <button
            onClick={onShopNow}
            className="mt-2 sm:mt-3 inline-flex items-center gap-1.5 bg-white/95 hover:bg-white text-sm font-bold px-4 py-1.5 rounded-lg transition-all hover:scale-[1.03] shadow"
            style={{ color: "#111111" }}
          >
            {banner.cta} →
          </button>
        </div>
        <div className="text-6xl sm:text-7xl md:text-8xl ml-4 select-none" aria-hidden>
          {banner.emoji}
        </div>
      </div>

      {/* Controls */}
      <button
        onClick={() => go(-1)}
        className="hidden sm:block absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow transition-colors"
        aria-label="Previous offer"
      >
        <ChevronLeft className="h-4 w-4 text-slate-700" />
      </button>
      <button
        onClick={() => go(1)}
        className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow transition-colors"
        aria-label="Next offer"
      >
        <ChevronRight className="h-4 w-4 text-slate-700" />
      </button>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
        {banners.map((b, i) => (
          <button
            key={b.id}
            onClick={() => setIndex(i)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/70"
            )}
            aria-label={`Go to offer ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
