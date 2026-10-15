import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://dmkmartb2b.space-z.ai";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, brands, pages] = await Promise.all([
    db.product.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
    db.brand.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
    db.page.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/home-2`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/brands`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/account`, changeFrequency: "monthly", priority: 0.4 },
  ];

  return [
    ...staticRoutes,
    ...brands.map((b) => ({ url: `${SITE}/brand/${b.slug}`, lastModified: b.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${SITE}/product/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...pages.map((p) => ({ url: `${SITE}/page/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
