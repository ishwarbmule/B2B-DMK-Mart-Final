import { db } from "@/lib/db";
import { discountPct, type DProduct, type VariantData } from "@/lib/types";

/**
 * Server-side data loader for the homepage design variants
 * (/home/dmart, /home/etsy, /home/croma, /home/vijaysales).
 * One pass over the catalog, sliced into reusable rows per design.
 */
export async function getVariantData(): Promise<VariantData> {
  const [tops, companies, sliders, products, stores] = await Promise.all([
    db.topCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        mids: {
          orderBy: { name: "asc" },
          include: { ends: { orderBy: { name: "asc" } } },
        },
      },
    }),
    db.company.findMany({
      where: { active: true },
      orderBy: [{ isStar: "desc" }, { name: "asc" }],
      include: { _count: { select: { products: { where: { active: true } } } } },
    }),
    db.slider.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.product.findMany({
      where: { active: true, basePrice: { gt: 0 } },
      include: { company: { select: { name: true, logo: true } } },
    }),
    db.store.count({ where: { status: "APPROVED" } }),
  ]);

  const topCounts = await db.product.groupBy({
    by: ["topId"],
    _count: { _all: true },
    where: { active: true },
  });
  const countByTop = new Map(topCounts.map((r) => [r.topId, r._count._all]));

  const rows: DProduct[] = products.map((p) => ({
    ...p,
    company: { name: p.company.name, logo: p.company.logo },
  }));

  const featured = rows.filter((r) => r.isFeatured).slice(0, 12);
  const hot = rows.filter((r) => r.isHot).slice(0, 12);
  const top = rows.filter((r) => r.isTop).slice(0, 12);
  const deals = [...rows]
    .sort((a, b) => discountPct(b.mrp, b.basePrice) - discountPct(a.mrp, a.basePrice))
    .slice(0, 14);
  const budget = [...rows].sort((a, b) => a.basePrice - b.basePrice).slice(0, 12);
  const premium = [...rows].sort((a, b) => b.basePrice - a.basePrice).slice(0, 12);

  const explore = Array.from(
    new Map([...deals, ...featured, ...hot, ...top, ...budget, ...premium].map((p) => [p.id, p])).values()
  ).slice(0, 72);

  // up to 10 best products per top-level department (real photos & discounts first)
  const byTop = new Map<string, DProduct[]>();
  for (const r of rows) {
    const arr = byTop.get(r.topId) ?? [];
    arr.push(r);
    byTop.set(r.topId, arr);
  }
  const catProducts: Record<string, DProduct[]> = {};
  for (const [topId, arr] of byTop) {
    catProducts[topId] = arr
      .sort(
        (a, b) =>
          Number(b.image.startsWith("http")) - Number(a.image.startsWith("http")) ||
          discountPct(b.mrp, b.basePrice) - discountPct(a.mrp, a.basePrice)
      )
      .slice(0, 10);
  }

  return {
    tops: tops.map((t) => ({ ...t, productCount: countByTop.get(t.id) ?? 0 })),
    companies,
    sliders,
    featured,
    hot,
    top,
    deals,
    budget,
    explore,
    catProducts,
    stats: { products: rows.length, stores, companies: companies.length },
  };
}
