import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { StoreChrome } from "@/components/dmk/store-chrome";
import { BrandStorefront, type BrandData } from "@/components/dmk/brand-storefront";
import type { DProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getBrand(slug: string) {
  const brand = await db.brand.findUnique({
    where: { slug },
    include: { _count: { select: { products: { where: { active: true } } } } },
  });
  if (!brand) return null;
  const base = { where: { brandId: brand.id, active: true } };
  const [featured, hot, deals, top, all, catRows] = await Promise.all([
    db.product.findMany({ ...base, where: { ...base.where, isFeatured: true }, take: 12, orderBy: [{ rating: "desc" }] }),
    db.product.findMany({ ...base, where: { ...base.where, isHot: true }, take: 12, orderBy: [{ rating: "desc" }] }),
    db.product.findMany({ ...base, where: { ...base.where, isDeal: true }, take: 12 }),
    db.product.findMany({ ...base, where: { ...base.where, isTop: true }, take: 12 }),
    db.product.findMany({ ...base, take: 60, orderBy: [{ isFeatured: "desc" }, { name: "asc" }] }),
    db.product.groupBy({ by: ["endId"], _count: { _all: true }, where: base.where }),
  ]);
  const endIds = catRows.map((c) => c.endId);
  const ends = endIds.length ? await db.endCategory.findMany({ where: { id: { in: endIds } } }) : [];
  const endById = new Map(ends.map((e) => [e.id, e]));
  // sample image per end category
  const imgByEnd = new Map<string, string>();
  for (const p of all) {
    const key = (p as unknown as { endId: string }).endId;
    if (key && !imgByEnd.has(key)) imgByEnd.set(key, p.image);
  }
  const categories = catRows
    .map((c) => ({
      end: endById.get(c.endId)?.name ?? "Products",
      count: c._count._all,
      image: imgByEnd.get(c.endId) ?? "",
    }))
    .sort((a, b) => b.count - a.count);

  const topsRaw = await db.product.groupBy({ by: ["topId"], _count: { _all: true }, where: base.where });
  const topIds = topsRaw.map((t) => t.topId);
  const tops = topIds.length ? await db.topCategory.findMany({ where: { id: { in: topIds } } }) : [];
  const topById = new Map(tops.map((t) => [t.id, t]));

  return {
    brand: {
      id: brand.id, name: brand.name, slug: brand.slug, logo: brand.logo,
      description: brand.description, tagline: brand.tagline,
      storefrontLayout: brand.storefrontLayout, storefrontConfig: brand.storefrontConfig,
      productCount: brand._count.products,
    } as BrandData,
    tops: topsRaw.map((t) => ({ id: t.topId, name: topById.get(t.topId)?.name ?? "Products", emoji: topById.get(t.topId)?.emoji ?? "🧺", count: t._count._all })),
    featured: featured as unknown as DProduct[],
    hot: hot as unknown as DProduct[],
    deals: deals as unknown as DProduct[],
    top: top as unknown as DProduct[],
    all: all as unknown as DProduct[],
    categories,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const brand = await db.brand.findUnique({ where: { slug } });
  if (!brand) return { title: "Brand not found | DMK Mart" };
  return {
    title: `${brand.name} Brand Store — Wholesale Catalog | DMK Mart B2B`,
    description: brand.description || `Shop the full ${brand.name} range at DMK Mart wholesale prices. Pieces, packs & bulk cases with GST invoice.`,
    alternates: { canonical: `/brand/${brand.slug}` },
    openGraph: { images: brand.logo ? [{ url: brand.logo }] : undefined },
  };
}

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getBrand(slug);
  if (!data) notFound();
  return (
    <StoreChrome>
      <BrandStorefront {...data} />
    </StoreChrome>
  );
}
