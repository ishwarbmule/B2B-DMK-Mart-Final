import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { StoreChrome } from "@/components/dmk/store-chrome";
import { Star } from "lucide-react";

// ISR: brand list changes rarely; 5-min edge cache removes the DB hit per view
export const revalidate = 300;

export const metadata: Metadata = {
  title: "All Brands — 39 Brand Stores | DMK Mart B2B",
  description: "Explore all DMK Mart brands — Deep Household, Garden Needs, Goldex, Pariwar, Samarthya, Mahananda and more. Wholesale brand stores with tier pricing.",
  alternates: { canonical: "/brands" },
};

export default async function BrandsPage() {
  // Build-resilient: if the DB is unreachable during prerender (e.g. local build
  // without APP_DATABASE_URL), render an empty shell — ISR re-renders with real
  // data on the first production request.
  let brands: Awaited<ReturnType<typeof db.brand.findMany>> = [];
  try {
    brands = await db.brand.findMany({
      where: { active: true },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
      include: { _count: { select: { products: { where: { active: true } } } } },
    });
  } catch {
    // swallow — prerender fallback
  }

  return (
    <StoreChrome>
      <div className="mx-auto max-w-[1400px] px-3 py-6 md:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900 md:text-3xl">Brand Portfolio</h1>
          <p className="mt-1 text-sm text-gray-500">
            {brands.length} manufacturing partners · every brand gets its own storefront · {brands.reduce((a, b) => a + (b._count?.products ?? 0), 0)} live SKUs
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {brands.map((b) => (
            <Link
              key={b.id}
              href={`/brand/${b.slug}`}
              className="group relative flex flex-col items-center gap-2 rounded-2xl border bg-white p-5 text-center transition hover:border-yellow-400 hover:shadow-lg"
            >
              {b.isFeatured && (
                <span className="absolute right-2 top-2 rounded-full bg-yellow-400 p-1">
                  <Star className="h-3 w-3 fill-black text-black" />
                </span>
              )}
              <span className="flex h-20 w-20 items-center justify-center overflow-hidden">
                {b.logo ? (
                  <Image src={b.logo} alt={b.name} width={80} height={80} className="h-20 w-20 object-contain transition group-hover:scale-110" unoptimized />
                ) : (
                  <span className="text-2xl font-black text-gray-300">{b.name.slice(0, 2).toUpperCase()}</span>
                )}
              </span>
              <p className="text-xs font-bold leading-tight text-gray-900">{b.name}</p>
              <p className="text-[11px] text-gray-400">{b._count?.products ?? 0} SKUs</p>
              <p className="line-clamp-1 text-[10px] text-yellow-600">{b.tagline}</p>
            </Link>
          ))}
        </div>
      </div>
    </StoreChrome>
  );
}
