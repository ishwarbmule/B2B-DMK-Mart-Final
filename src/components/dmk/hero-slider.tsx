"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Package, ShieldCheck, Users } from "lucide-react";
import type { SliderRow } from "@/lib/types";

/**
 * Hero carousel driven by the DB `Slider` rows (Website Management → Manage Sliders).
 * Copy structure mirrors the original DMK artwork:
 *   kicker ("YOUR PARTNER IN QUALITY PRODUCTS") → two-tone headline (dark + yellow
 *   highlight) → USP chips (yellow icon circles) → yellow pill "Shop Now →" →
 *   script-font tagline ("Homes, Shops, Businesses — All in One Place", top-right).
 * Art direction: slide.image (horizontal) on laptop/desktop/tablet (≥640px),
 * slide.mobileImage (3:4 portrait) on phones. On phones the copy block sits in the
 * TOP-LEFT corner over a top-down scrim; on wide screens it sits left over a
 * left→right scrim, keeping the light-on-cream look of the original artwork.
 */
const CHIP_ICONS = [Package, ShieldCheck, Users];

export function HeroSlider({ sliders, onCta }: { sliders: SliderRow[]; onCta?: () => void }) {
  const [idx, setIdx] = useState(0);
  const n = sliders.length;

  useEffect(() => {
    if (n <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 6000);
    return () => clearInterval(t);
  }, [n]);

  if (!n) return null;
  const s = sliders[idx];
  const href = s.buttonUrl && !s.buttonUrl.startsWith("#") ? s.buttonUrl : null;
  const chips = (s.chips ?? "").split(",").map((c) => c.trim()).filter(Boolean);

  /* Wide screens: copy position per slide (LEFT default, like the old artwork) */
  const posWrapSm =
    s.position === "CENTER"
      ? "sm:items-center sm:text-center"
      : s.position === "RIGHT"
        ? "sm:items-end sm:text-right sm:justify-end"
        : "sm:items-start sm:text-left";

  /* Scrim: white wash (old artwork = dark text on cream). Phones: top-down wash,
     copy pinned top-left. Wide: left→right wash, copy vertically centered. */
  const scrim =
    "absolute inset-0 flex flex-col justify-start items-start text-left gap-2 bg-gradient-to-b from-white/95 via-white/80 to-transparent p-5 pt-7 sm:justify-center sm:gap-3 sm:bg-gradient-to-r sm:from-white/95 sm:via-white/70 sm:to-transparent sm:p-10";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#FFF6E0]">
      {/* 3:4 portrait frame on phones · wide 2.5:1 frame on tablet/laptop/desktop */}
      <div className="relative aspect-[3/4] w-full sm:aspect-[1200/480] lg:max-h-[440px]">
        {/* Desktop / laptop / tablet artwork (horizontal) */}
        <Image
          key={`d-${s.id}`}
          src={s.image}
          alt={`${s.heading} ${s.highlight ?? ""}`.trim()}
          fill
          sizes="(max-width: 640px) 0vw, 100vw"
          className="hidden object-cover sm:block"
          priority
          unoptimized
        />
        {/* Mobile artwork (3:4 portrait) */}
        <Image
          key={`m-${s.id}`}
          src={s.mobileImage || s.image}
          alt={`${s.heading} ${s.highlight ?? ""}`.trim()}
          fill
          sizes="100vw"
          className="object-cover sm:hidden"
          priority
          unoptimized
        />

        {/* Script tagline — top-right, wide screens only (like the old artwork) */}
        {s.tagline && (
          <div className="absolute right-6 top-5 z-10 hidden text-right sm:block lg:right-10 lg:top-7">
            <p
              className="text-2xl font-bold leading-[1.15] text-gray-900 lg:text-[2rem]"
              style={{ fontFamily: "var(--font-script), cursive" }}
            >
              {s.tagline}
            </p>
          </div>
        )}

        {/* Copy block — top-left on phones · positioned left/center/right on wide */}
        <div className={`${scrim} ${posWrapSm}`}>
          {s.kicker && (
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-gray-700 sm:text-xs">
              {s.kicker}
            </span>
          )}
          <h2 className="max-w-md text-[1.35rem] font-black leading-[1.08] tracking-tight text-gray-900 sm:text-3xl md:text-4xl lg:text-[2.6rem]">
            {s.heading}
            {s.highlight && <span className="text-amber-500"> {s.highlight}</span>}
          </h2>
          {s.content && (
            <p className="max-w-sm text-[11px] leading-relaxed text-gray-700 sm:max-w-md sm:text-sm">
              {s.content}
            </p>
          )}
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-0.5 sm:gap-x-5 sm:gap-y-0 sm:pt-1">
              {chips.map((c, i) => {
                const Icon = CHIP_ICONS[i % CHIP_ICONS.length];
                return (
                  <span key={c} className="flex items-center gap-1.5 sm:gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-black shadow-sm sm:h-9 sm:w-9">
                      <Icon className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" strokeWidth={2.4} />
                    </span>
                    <span className="max-w-[76px] text-[9.5px] font-bold leading-tight text-gray-800 sm:max-w-[96px] sm:text-xs">
                      {c}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
          {href ? (
            <Link
              href={href}
              className="mt-1 flex w-fit items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-xs font-extrabold text-black shadow-md transition hover:bg-amber-300 sm:mt-2 sm:px-7 sm:py-3 sm:text-sm"
            >
              {s.buttonText || "Shop Now"}
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.6} />
            </Link>
          ) : (
            <button
              onClick={onCta}
              className="mt-1 flex w-fit items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-xs font-extrabold text-black shadow-md transition hover:bg-amber-300 sm:mt-2 sm:px-7 sm:py-3 sm:text-sm"
            >
              {s.buttonText || "Shop Now"}
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.6} />
            </button>
          )}
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
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {sliders.map((sl, i) => (
              <button
                key={sl.id}
                onClick={() => setIdx(i)}
                aria-label={`Go to offer ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-gray-900" : "w-1.5 bg-gray-900/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
