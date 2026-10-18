"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * Shared campaign hero — "Everyday Essentials for a Better Tomorrow".
 * Artwork (public/images/hero-banner.jpg) has all copy baked in:
 * headline, USP chips (Wide Product Range / Trusted Quality / Built for
 * Businesses), Shop Now and the Homes-Shops-Businesses tagline.
 * The whole banner deep-links to the catalog.
 * Used on BOTH homepages: default (/) and home-2 (/home-2).
 */
export function HeroBanner() {
  return (
    <Link
      href="/catalog"
      aria-label="Everyday Essentials for a Better Tomorrow — shop now"
      className="group relative block overflow-hidden rounded-2xl border border-amber-100 bg-[#FFF6E0] shadow-sm"
    >
      <Image
        src="/images/hero-banner.jpg"
        alt="Everyday Essentials for a Better Tomorrow — wide product range, trusted quality, built for businesses. Homes, shops, businesses — all in one place."
        width={1920}
        height={702}
        priority
        unoptimized
        className="h-[235px] w-full object-cover object-[32%_center] transition duration-300 group-hover:scale-[1.01] sm:h-auto"
      />
    </Link>
  );
}
