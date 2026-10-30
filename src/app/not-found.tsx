"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Home, LifeBuoy, SearchX } from "lucide-react";

/**
 * Global 404 — designed to match the DMK Mart storefront theme
 * (black · yellow · Space Grotesk). Renders inside the global layout,
 * so the site header and footer are already present around it.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[62vh] max-w-2xl flex-col items-center justify-center px-4 py-14 text-center">
      {/* badge */}
      <span className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
        <SearchX className="h-3.5 w-3.5 text-yellow-500" /> Error 404 · Page not found
      </span>

      {/* big 404 */}
      <p className="mt-5 flex items-baseline gap-2 text-7xl font-black leading-none tracking-tight text-black md:text-8xl">
        4<span className="relative inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-yellow-400 align-middle md:h-20 md:w-20">
          <Image src="/dmk-logo.png" alt="DMK Mart" fill sizes="80px" className="object-cover" unoptimized />
        </span>4
      </p>

      <h1 className="mt-4 text-xl font-black text-gray-900 md:text-2xl">This page took a wrong turn</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500">
        The link may be old or the page may have moved. Your cart is safe —
        continue shopping and we&apos;ll get you back on track.
      </p>

      {/* actions */}
      <div className="mt-7 flex w-full flex-col items-center justify-center gap-2.5 sm:w-auto sm:flex-row">
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-yellow-400 transition hover:bg-gray-800 sm:w-auto"
        >
          <Home className="h-4 w-4" /> Continue Shopping
        </Link>
        <Link
          href="/catalog"
          className="flex w-full items-center justify-center gap-2 rounded-xl border px-6 py-3.5 text-sm font-semibold text-gray-700 transition hover:border-yellow-400 hover:bg-yellow-50 sm:w-auto"
        >
          Browse the catalog <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* helpful shortcuts */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-gray-400">
        <Link href="/brands" className="hover:text-yellow-600">All Brands</Link>
        <span aria-hidden>·</span>
        <Link href="/catalog?flag=deal" className="hover:text-yellow-600">Deals of the Day</Link>
        <span aria-hidden>·</span>
        <Link href="/account" className="hover:text-yellow-600">My Account</Link>
        <span aria-hidden>·</span>
        <Link href="/page/contact-us" className="flex items-center gap-1 hover:text-yellow-600">
          <LifeBuoy className="h-3.5 w-3.5" /> Need help?
        </Link>
      </div>
    </div>
  );
}
