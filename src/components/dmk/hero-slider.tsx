"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SliderRow } from "@/lib/types";

/**
 * Hero carousel driven by the DB `Slider` rows (Website Management → Manage Sliders).
 * Art direction per device:
 *   - Desktop / laptop / tablet (≥640px): slide.image — horizontal wide artwork
 *   - Mobile (<640px): slide.mobileImage — 3:4 portrait artwork (falls back to image)
 * Every slide's images, headline, paragraph, button text/URL and copy position
 * are admin-editable. Copy sits on a scrim: left/center/right gradient on wide
 * screens, bottom gradient on phones so portrait artwork stays readable.
 */
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

  /* Copy placement: bottom-anchored on phones (portrait frame), positioned per slide on ≥sm */
  const posWrapSm =
    s.position === "CENTER"
      ? "sm:items-center sm:text-center"
      : s.position === "RIGHT"
        ? "sm:items-end sm:text-right sm:justify-end"
        : "sm:items-start sm:text-left";
  const scrim =
    "absolute inset-0 flex flex-col justify-end items-start text-left gap-2.5 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-5 md:gap-3 md:p-10 sm:justify-center sm:bg-gradient-to-r sm:from-black/70 sm:via-black/25 sm:to-transparent";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      {/* 3:4 portrait frame on phones · wide 2.5:1 frame on tablet/laptop/desktop */}
      <div className="relative aspect-[3/4] w-full sm:aspect-[1200/480] lg:max-h-[440px]">
        {/* Desktop / laptop / tablet artwork (horizontal) */}
        <Image
          key={`d-${s.id}`}
          src={s.image}
          alt={s.heading}
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
          alt={s.heading}
          fill
          sizes="100vw"
          className="object-cover sm:hidden"
          priority
          unoptimized
        />
        <div className={`${scrim} ${posWrapSm}`}>
          <span className="w-fit rounded-full bg-yellow-400 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black md:text-[11px]">
            DMK Mart Exclusive
          </span>
          <h2 className="max-w-md text-xl font-black leading-tight text-white sm:text-2xl md:text-3xl lg:text-4xl">
            {s.heading}
          </h2>
          <p className="max-w-md text-xs text-gray-200 md:text-sm">{s.content}</p>
          {href ? (
            <Link
              href={href}
              className="w-fit rounded-lg bg-yellow-400 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-black transition hover:bg-yellow-300 md:text-sm"
            >
              {s.buttonText || "Shop Now"} →
            </Link>
          ) : (
            <button
              onClick={onCta}
              className="w-fit rounded-lg bg-yellow-400 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-black transition hover:bg-yellow-300 md:text-sm"
            >
              {s.buttonText || "Shop Now"} →
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
