"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Package, ShieldCheck, Users } from "lucide-react";
import type { SliderRow } from "@/lib/types";

/**
 * Hero carousel driven by the DB `Slider` rows (Website Management → Manage Sliders).
 * NO overlay/scrim is drawn — copy sits directly in each artwork's vacant space.
 * 9-zone placement per device: `position` (laptop/desktop/tablet) and
 * `mobilePosition` (phones). `textColor` DARK/LIGHT matches the wall behind the
 * copy; `headingScale` S/M/L keeps the content inside the vacant area.
 * Copy structure: kicker → two-tone heading (highlight in amber) → short
 * paragraph → USP chips → pill CTA → script tagline (wide screens, top-right).
 */
const CHIP_ICONS = [Package, ShieldCheck, Users];

const ZONES: Record<string, string> = {
  "TOP-LEFT": "justify-start items-start text-left",
  "TOP-CENTER": "justify-start items-center text-center",
  "TOP-RIGHT": "justify-start items-end text-right",
  "MIDDLE-LEFT": "justify-center items-start text-left",
  "MIDDLE-CENTER": "justify-center items-center text-center",
  "MIDDLE-RIGHT": "justify-center items-end text-right",
  "BOTTOM-LEFT": "justify-end items-start text-left",
  "BOTTOM-CENTER": "justify-end items-center text-center",
  "BOTTOM-RIGHT": "justify-end items-end text-right",
  // legacy values from earlier schema
  LEFT: "justify-center items-start text-left",
  CENTER: "justify-center items-center text-center",
  RIGHT: "justify-center items-end text-right",
};

const SCALES: Record<string, string> = {
  S: "text-lg sm:text-2xl md:text-3xl",
  M: "text-xl sm:text-3xl md:text-4xl",
  L: "text-2xl sm:text-4xl md:text-5xl",
};

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
  const dark = (s.textColor ?? "DARK") !== "LIGHT";
  const ink = dark ? "text-gray-900" : "text-white";
  const inkSoft = dark ? "text-gray-700" : "text-gray-100";

  const zone = ZONES[s.mobilePosition || s.position || "TOP-LEFT"] ?? ZONES["TOP-LEFT"];
  const zoneSm = ZONES[s.position || "MIDDLE-LEFT"] ?? ZONES["MIDDLE-LEFT"];
  const scale = SCALES[s.headingScale || "M"] ?? SCALES.M;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#FFF6E0]">
      {/* 3:4 portrait frame on phones · wide 16:9-ish frame on tablet/laptop/desktop */}
      <div className="relative aspect-[3/4] w-full sm:aspect-[16/9] lg:max-h-[480px]">
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

        {/* Script tagline — top-right, wide screens only, no backdrop */}
        {s.tagline && (
          <div className="absolute right-6 top-5 z-10 hidden text-right sm:block lg:right-10 lg:top-7">
            <p
              className={`text-2xl font-bold leading-[1.15] ${ink} lg:text-[2rem]`}
              style={{ fontFamily: "var(--font-script), cursive" }}
            >
              {s.tagline}
            </p>
          </div>
        )}

        {/* Copy block — placed in the artwork's vacant space; NO overlay colours */}
        <div
          className={`absolute inset-0 flex flex-col gap-1.5 p-5 sm:gap-2.5 sm:p-10 ${zone} ${zoneSm ? zoneSm : ""}`}
        >
          <div className={`flex flex-col gap-1.5 sm:gap-2.5 ${zone}`}>
            {s.kicker && (
              <span className={`text-[10px] font-extrabold uppercase tracking-[0.18em] ${inkSoft} sm:text-xs`}>
                {s.kicker}
              </span>
            )}
            <h2 className={`max-w-[60%] font-black leading-[1.06] tracking-tight sm:max-w-md ${scale} ${ink}`}>
              {s.heading}
              {s.highlight && <span className="text-amber-500"> {s.highlight}</span>}
            </h2>
            {s.content && (
              <p className={`max-w-[62%] text-[11px] leading-snug sm:max-w-sm sm:text-sm sm:leading-snug ${inkSoft}`}>
                {s.content}
              </p>
            )}
            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-5">
                {chips.map((c, i) => {
                  const Icon = CHIP_ICONS[i % CHIP_ICONS.length];
                  return (
                    <span key={c} className="flex items-center gap-1.5 sm:gap-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm sm:h-9 sm:w-9 ${dark ? "bg-amber-400 text-black" : "bg-white/20 text-white backdrop-blur-sm"}`}>
                        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.4} />
                      </span>
                      <span className={`max-w-[76px] text-[9.5px] font-bold leading-tight sm:max-w-[96px] sm:text-xs ${ink}`}>
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
                className={`mt-0.5 flex w-fit items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-extrabold shadow-md transition sm:mt-1 sm:px-6 sm:py-2.5 sm:text-sm ${dark ? "bg-amber-400 text-black hover:bg-amber-300" : "bg-white/95 text-gray-900 hover:bg-white"}`}
              >
                {s.buttonText || "Shop Now"}
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.6} />
              </Link>
            ) : (
              <button
                onClick={onCta}
                className={`mt-0.5 flex w-fit items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-extrabold shadow-md transition sm:mt-1 sm:px-6 sm:py-2.5 sm:text-sm ${dark ? "bg-amber-400 text-black hover:bg-amber-300" : "bg-white/95 text-gray-900 hover:bg-white"}`}
              >
                {s.buttonText || "Shop Now"}
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.6} />
              </button>
            )}
          </div>
        </div>
      </div>

      {n > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + n) % n)}
            aria-label="Previous offer"
            className="absolute left-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow hover:bg-white sm:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % n)}
            aria-label="Next offer"
            className="absolute right-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow hover:bg-white sm:flex"
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
