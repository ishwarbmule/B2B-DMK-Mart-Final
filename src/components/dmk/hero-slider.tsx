"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Package, ShieldCheck, Users } from "lucide-react";
import type { SliderRow } from "@/lib/types";

/**
 * Hero carousel v4 — DB `Slider` rows (Website Management → Manage Sliders).
 * - Background images auto-fit the container (object-cover, fixed responsive frames).
 * - Copy block defaults to the LEFT-TOP corner with 50px padding on every side
 *   (wide screens; phones use a proportional 20px per mobile rules).
 * - Admin still picks a 9-zone placement per slide / per device — padding stays 50px.
 * - NO overlay colours; text colour (DARK/LIGHT) matches the artwork wall.
 * - Motion animations: staggered copy entrance, image crossfade, springy controls.
 * Brand design system: amber pill CTAs (rounded-full), amber icon chips,
 * uppercase tracking kicker, black display headings, script tagline.
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
  M: "text-2xl sm:text-3xl md:text-4xl",
  L: "text-3xl sm:text-4xl md:text-5xl",
};

/* Motion variants — staggered entrance per brand motion language */
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
  exit: { opacity: 0, y: -14, transition: { duration: 0.25 } },
};
const rise = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120, damping: 16 } },
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
  const zoneSm = ZONES[s.position || "TOP-LEFT"] ?? ZONES["TOP-LEFT"];
  const scale = SCALES[s.headingScale || "M"] ?? SCALES.M;

  const ctaCls = `mt-1 flex w-fit items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-xs font-extrabold text-black shadow-lg shadow-amber-400/30 transition-transform duration-200 hover:scale-[1.04] active:scale-95 sm:px-7 sm:py-3 sm:text-sm`;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#FFF6E0]">
      {/* auto-fit frames: portrait-friendly on phones, cinematic on wide screens —
          the artwork always covers the container edge-to-edge */}
      <div className="relative h-[440px] w-full sm:h-[460px] lg:h-[540px]">
        {/* desktop / tablet artwork — crossfade between slides */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`d-${s.id}`}
            className="absolute inset-0 hidden sm:block"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <Image src={s.image} alt={`${s.heading} ${s.highlight ?? ""}`.trim()} fill sizes="100vw" className="object-cover object-center" priority unoptimized />
          </motion.div>
          {/* phone artwork (3:4 portrait) */}
          <motion.div
            key={`m-${s.id}`}
            className="absolute inset-0 sm:hidden"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <Image src={s.mobileImage || s.image} alt={`${s.heading} ${s.highlight ?? ""}`.trim()} fill sizes="100vw" className="object-cover object-center" priority unoptimized />
          </motion.div>
        </AnimatePresence>

        {/* Script tagline — top-right on wide screens, mirrors the 50px inset */}
        {s.tagline && (
          <div className="absolute right-[50px] top-[44px] z-10 hidden text-right sm:block">
            <p
              className={`text-2xl font-bold leading-[1.15] ${ink} lg:text-[2rem]`}
              style={{ fontFamily: "var(--font-script), cursive" }}
            >
              {s.tagline}
            </p>
          </div>
        )}

        {/* Copy block — placed per admin zone; 50px padding from every side on wide
            screens (20px on phones per mobile rules). NO overlay colours. */}
        <div className={`absolute inset-0 flex flex-col p-5 sm:p-[50px] ${zone} ${zoneSm}`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={s.id}
              variants={stagger}
              initial="hidden"
              animate="show"
              exit="exit"
              className={`flex max-w-full flex-col gap-2 sm:gap-3 ${zone}`}
            >
              {s.kicker && (
                <motion.span variants={rise} className={`text-[10px] font-extrabold uppercase tracking-[0.2em] ${inkSoft} sm:text-xs`}>
                  {s.kicker}
                </motion.span>
              )}
              <motion.h2 variants={rise} className={`max-w-[70%] font-black leading-[1.05] tracking-tight sm:max-w-lg ${scale} ${ink}`}>
                {s.heading}
                {s.highlight && <span className="text-amber-500"> {s.highlight}</span>}
              </motion.h2>
              {s.content && (
                <motion.p variants={rise} className={`max-w-[75%] text-[11px] leading-snug sm:max-w-md sm:text-sm ${inkSoft}`}>
                  {s.content}
                </motion.p>
              )}
              {chips.length > 0 && (
                <motion.div variants={rise} className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-5">
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
                </motion.div>
              )}
              <motion.div variants={rise}>
                {href ? (
                  <Link href={href} className={ctaCls}>
                    {s.buttonText || "Shop Now"}
                    <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.6} />
                  </Link>
                ) : (
                  <button onClick={onCta} className={ctaCls}>
                    {s.buttonText || "Shop Now"}
                    <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.6} />
                  </button>
                )}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {n > 1 && (
          <>
            <motion.button
              onClick={() => setIdx((i) => (i - 1 + n) % n)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.92 }}
              aria-label="Previous offer"
              className="absolute left-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow hover:bg-white sm:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </motion.button>
            <motion.button
              onClick={() => setIdx((i) => (i + 1) % n)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.92 }}
              aria-label="Next offer"
              className="absolute right-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow hover:bg-white sm:flex"
            >
              <ChevronRight className="h-5 w-5" />
            </motion.button>
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {sliders.map((sl, i) => (
                <motion.button
                  key={sl.id}
                  onClick={() => setIdx(i)}
                  whileTap={{ scale: 0.8 }}
                  aria-label={`Go to offer ${i + 1}`}
                  animate={{ width: i === idx ? 24 : 6 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  className={`h-1.5 rounded-full ${i === idx ? "bg-gray-900" : "bg-gray-900/40"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
