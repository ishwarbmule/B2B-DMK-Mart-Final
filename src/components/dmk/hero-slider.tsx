"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Package, ShieldCheck, Users } from "lucide-react";
import type { SliderRow } from "@/lib/types";

/**
 * Hero carousel v5 — DB `Slider` rows (Admin → Website Management → Hero Section (Sliders)).
 * - Background images auto-fit the container (object-cover, fixed responsive frames) — never padded.
 * - Copy block (text + chips + buttons only) is placed in one of 9 zones per device and padded
 *   per-side from admin (default 50px wide screens; phones scale proportionally, 14–24px).
 * - Per-element styling: kicker / heading / paragraph / tagline / button colours + px font sizes,
 *   multicolour headline via *star* segments cycling a JSON palette (Admin editable).
 * - NO overlay colours; text colour (DARK/LIGHT) matches the artwork wall.
 * - Motion: staggered copy entrance, image crossfade, springy controls.
 * - Brand CTA: rounded-xl black button with yellow text (matches storefront CTAs, not circular).
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

/* ── v5 styling helpers ─────────────────────────────────────────────── */
const AMBER = "#f59e0b";

/** Parse `*star*` segments out of the heading for the multicolour headline. */
function parseHeading(heading: string): { text: string; accent: boolean }[] {
  const out: { text: string; accent: boolean }[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(heading))) {
    if (m.index > last) out.push({ text: heading.slice(last, m.index), accent: false });
    out.push({ text: m[1], accent: true });
    last = m.index + m[0].length;
  }
  if (last < heading.length) out.push({ text: heading.slice(last), accent: false });
  return out.filter((p) => p.text.length > 0);
}

/** Admin palette (JSON hex array) → validated colours; falls back to brand amber. */
function paletteOf(raw?: string): string[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (Array.isArray(arr)) {
      const cols = arr.map(String).filter((c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c));
      if (cols.length) return cols;
    }
  } catch {
    /* bad JSON → fallback */
  }
  return [AMBER];
}

/** Admin-set px size → fluid clamp(): ~55% of desktop px on phones (brand-capped), exact px on desktop. */
function fluidSize(desk: number | undefined, mobCap: number): CSSProperties | undefined {
  const d = Number(desk);
  if (!d || d <= 0) return undefined;
  const m = Math.min(d * 0.55, mobCap);
  return { fontSize: `clamp(${m.toFixed(1)}px, calc(${m.toFixed(1)}px + ${(d - m).toFixed(1)} * (100vw - 360px) / 664), ${d}px)` };
}

const numOr = (v: number | undefined, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? v : dflt);
/** Phones never take the full desktop padding — proportional 14–24px per mobile brand rules. */
const mobPad = (v: number) => Math.max(14, Math.min(24, Math.round(v * 0.4)));

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
  const palette = paletteOf(s.headingColors);
  const segs = parseHeading(s.heading || "");
  let accentIdx = 0;

  // 9-zone placement: mobile zone first, desktop zone re-applied as sm: variants
  const zoneM = ZONES[s.mobilePosition || s.position || "TOP-LEFT"] ?? ZONES["TOP-LEFT"];
  const zoneDsm = (ZONES[s.position || "TOP-LEFT"] ?? ZONES["TOP-LEFT"])
    .split(" ")
    .map((c) => `sm:${c}`)
    .join(" ");
  const zoneAll = `${zoneM} ${zoneDsm}`;
  const scale = SCALES[s.headingScale || "M"] ?? SCALES.M;

  // Per-side padding for the copy block (content + buttons only — image stays full-bleed)
  const pad = { t: numOr(s.padTop, 50), r: numOr(s.padRight, 50), b: numOr(s.padBottom, 50), l: numOr(s.padLeft, 50) };
  const padVars = {
    "--pt": `${pad.t}px`,
    "--pr": `${pad.r}px`,
    "--pb": `${pad.b}px`,
    "--pl": `${pad.l}px`,
    "--ptm": `${mobPad(pad.t)}px`,
    "--prm": `${mobPad(pad.r)}px`,
    "--pbm": `${mobPad(pad.b)}px`,
    "--plm": `${mobPad(pad.l)}px`,
  } as CSSProperties;

  // Script tagline floats in the corner OPPOSITE the copy block, on the same padding rhythm
  const z = s.position || "TOP-LEFT";
  const tagPos = [
    z.includes("RIGHT") ? "left-[var(--plm)] sm:left-[var(--pl)]" : "right-[var(--prm)] sm:right-[var(--pr)]",
    z.startsWith("TOP") ? "bottom-[var(--pbm)] sm:bottom-[var(--pb)]" : "top-[var(--ptm)] sm:top-[var(--pt)]",
  ].join(" ");

  // Brand CTA — rounded-xl black/yellow like every storefront button (overridable per slide)
  const ctaCls = `mt-1 flex w-fit items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-extrabold shadow-lg shadow-black/25 transition-all duration-200 hover:scale-[1.04] active:scale-95 sm:px-7 sm:py-3 sm:text-sm ${
    s.buttonBg ? "" : "bg-black hover:bg-gray-900"
  } ${s.buttonTextColor ? "" : "text-yellow-400"}`;
  const ctaStyle = {
    ...(s.buttonBg ? { background: s.buttonBg } : {}),
    ...(s.buttonTextColor ? { color: s.buttonTextColor } : {}),
  } as CSSProperties;

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

        {/* Script tagline — floats opposite the copy block on wide screens */}
        {s.tagline && (
          <div className={`absolute z-10 hidden sm:block ${tagPos} ${z.includes("RIGHT") ? "text-left" : "text-right"}`}>
            <p
              className={`text-2xl font-bold leading-[1.15] lg:text-[2rem] ${ink}`}
              style={{ fontFamily: "var(--font-script), cursive", ...(s.taglineColor ? { color: s.taglineColor } : {}) }}
            >
              {s.tagline}
            </p>
          </div>
        )}

        {/* Copy block — 9-zone placement, per-side admin padding (50px default, phones 14–24px).
            Pads wrap content + buttons ONLY; the artwork is never inset. NO overlay colours. */}
        <div
          className={`absolute inset-0 flex flex-col pt-[var(--ptm)] pr-[var(--prm)] pb-[var(--pbm)] pl-[var(--plm)] sm:pt-[var(--pt)] sm:pr-[var(--pr)] sm:pb-[var(--pb)] sm:pl-[var(--pl)] ${zoneAll}`}
          style={padVars}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={s.id}
              variants={stagger}
              initial="hidden"
              animate="show"
              exit="exit"
              className={`flex max-w-full flex-col gap-2 sm:gap-3 ${zoneAll}`}
            >
              {s.kicker && (
                <motion.span variants={rise} className="flex items-center gap-2.5">
                  <span aria-hidden className="h-[3px] w-8 shrink-0 rounded-full bg-amber-500" style={s.kickerColor ? { background: s.kickerColor } : undefined} />
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-[0.22em] sm:text-xs ${inkSoft}`}
                    style={{ ...(s.kickerColor ? { color: s.kickerColor } : {}), ...fluidSize(s.kickerSize, 12) }}
                  >
                    {s.kicker}
                  </span>
                </motion.span>
              )}
              <motion.h2
                variants={rise}
                className={`max-w-[80%] font-black leading-[1.04] tracking-tight sm:max-w-xl ${scale} ${ink}`}
                style={{ ...(s.headingColor ? { color: s.headingColor } : {}), ...fluidSize(s.headingSize, 32) }}
              >
                {segs.map((seg, i) =>
                  seg.accent ? (
                    <span key={i} style={{ color: palette[accentIdx++ % palette.length] }}>
                      {seg.text}
                    </span>
                  ) : (
                    <span key={i} style={s.headingColor ? { color: s.headingColor } : undefined}>
                      {seg.text}
                    </span>
                  ),
                )}
                {s.highlight && <span style={{ color: s.highlightColor || AMBER }}> {s.highlight}</span>}
              </motion.h2>
              {s.content && (
                <motion.p
                  variants={rise}
                  className={`max-w-[80%] text-[11px] leading-snug sm:max-w-md sm:text-sm ${inkSoft}`}
                  style={{ ...(s.contentColor ? { color: s.contentColor } : {}), ...fluidSize(s.contentSize, 15) }}
                >
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
                        <span className={`max-w-[76px] text-[9.5px] font-bold leading-tight sm:max-w-[96px] sm:text-xs ${ink}`}>{c}</span>
                      </span>
                    );
                  })}
                </motion.div>
              )}
              <motion.div variants={rise}>
                {href ? (
                  <Link href={href} className={ctaCls} style={ctaStyle}>
                    {s.buttonText || "Shop Now"}
                    <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.6} />
                  </Link>
                ) : (
                  <button onClick={onCta} className={ctaCls} style={ctaStyle}>
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
