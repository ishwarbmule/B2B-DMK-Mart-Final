/** GET /api/catalog — storefront bootstrap: brands, nav tree, sliders, ads, settings, active offer, home coupons, footer pages. */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const [tops, brands, sliders, ads, settingsRaw, activeOffer, homeCoupons, pages, topCounts] = await Promise.all([
    db.topCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: { mids: { orderBy: { name: "asc" }, include: { ends: { orderBy: { name: "asc" } } } } },
    }),
    db.brand.findMany({
      where: { active: true },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
      include: { _count: { select: { products: { where: { active: true } } } } },
    }),
    db.slider.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.ad.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, include: { brand: { select: { name: true, slug: true } } } }),
    db.setting.findMany(),
    db.offer.findFirst({
      where: { active: true, heroSlot: true, startAt: { lte: now }, endAt: { gte: now } },
      orderBy: { createdAt: "desc" },
    }),
    db.coupon.findMany({
      where: { active: true, showOnHome: true, startAt: { lte: now }, endAt: { gte: now } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    db.page.findMany({ where: { active: true, inFooter: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, title: true, type: true } }),
    db.product.groupBy({ by: ["topId"], _count: { _all: true }, where: { active: true } }),
  ]);

  const settings: Record<string, string> = {};
  for (const s of settingsRaw) settings[s.key] = s.value;

  const countByTop = new Map(topCounts.map((r) => [r.topId, r._count._all]));
  const topsWithCounts = tops.map((t) => ({ ...t, productCount: countByTop.get(t.id) ?? 0 }));

  const stats = {
    products: topCounts.reduce((acc, r) => acc + r._count._all, 0),
    stores: await db.store.count({ where: { status: "APPROVED" } }),
    brands: brands.length,
  };

  return NextResponse.json({
    tops: topsWithCounts,
    brands,
    sliders,
    ads,
    settings,
    stats,
    activeOffer: activeOffer ?? null,
    homeCoupons,
    footerPages: pages,
  });
}
