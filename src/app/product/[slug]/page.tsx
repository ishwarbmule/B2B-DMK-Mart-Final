import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { db } from "@/lib/db";
import { StoreChrome } from "@/components/dmk/store-chrome";
import { ProductDetail } from "@/components/dmk/product-detail";
import type { DProduct } from "@/lib/types";

// ISR: rendered once per 120s at the edge instead of hitting the Mumbai DB on
// every view (ERP sync refreshes prices every 15–30 min, so 2 min staleness is
// acceptable). Buyers see ~edge-speed loads; DB round trips drop ~99.9%.
export const dynamic = "force-static";
export const revalidate = 120;

// React cache(): dedupes the identical query made by generateMetadata + page body
const getProduct = cache(async function getProduct(slug: string) {
  return db.product.findUnique({
    where: { slug },
    include: {
      brand: { select: { name: true, slug: true, logo: true } },
      top: { select: { name: true } },
      mid: { select: { name: true } },
      end: { select: { name: true } },
    },
  });
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  if (!p) return { title: "Product not found | DMK Mart" };
  const title = p.seoTitle || `${p.name} — ${p.brand.name} | DMK Mart B2B`;
  const description = p.seoDesc || `Buy ${p.name} (${p.brand.name}) at wholesale price on DMK Mart. Single pieces & packs. Itemised invoice, OTP-verified delivery.`;
  return {
    title,
    description,
    keywords: p.keywords ? p.keywords.split(",").map((k) => k.trim()) : undefined,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: {
      title,
      description,
      images: p.image ? [{ url: p.image }] : undefined,
      type: "website",
    },
  };
}

function toDProduct(p: NonNullable<Awaited<ReturnType<typeof getProduct>>>): DProduct {
  return {
    id: p.id, sku: p.sku, slug: p.slug, name: p.name,
    dealerPrice: p.dealerPrice, basePrice: p.basePrice, mrp: p.mrp,
    packQty: p.packQty, piecesPerBox: p.piecesPerBox, unit: p.unit,
    // Task 12 (g): stock must NEVER reach the buyer payload (network tab included)
    stock: 0, barcode: p.barcode, gst: p.gst, image: p.image,
    isHot: p.isHot, isTop: p.isTop, isFeatured: p.isFeatured, isDeal: p.isDeal,
    dealPrice: p.dealPrice, active: p.active, rating: p.rating, reviewCount: p.reviewCount,
    brand: p.brand, top: p.top, mid: p.mid, end: p.end,
    // extra fields consumed by detail page
    tier1: p.tier1, tier2: p.tier2, tier3: p.tier3, tier4: p.tier4, tier5: p.tier5,
    hsn: p.hsn, gallery: p.gallery, description: p.description,
  } as DProduct & Record<string, unknown>;
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || !product.active) notFound();

  // RELATED PRODUCTS — same brand ONLY (requirement)
  const relatedRaw = await db.product.findMany({
    where: { brandId: product.brandId, active: true, id: { not: product.id } },
    orderBy: [{ isFeatured: "desc" }, { rating: "desc" }],
    take: 12,
    include: { brand: { select: { name: true, slug: true, logo: true } } },
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: [product.image].filter(Boolean),
    description: product.seoDesc || product.description || product.name,
    sku: product.sku,
    brand: { "@type": "Brand", name: product.brand.name },
    aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewCount || 1 },
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: product.dealerPrice,
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "DMK Mart" },
    },
  };

  return (
    <StoreChrome>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductDetail p={toDProduct(product)} related={relatedRaw.map(toDProduct)} />
    </StoreChrome>
  );
}
