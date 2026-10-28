import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public catalog browsing with server-side pagination for 2,200+ SKUs (brand-first). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const top = sp.get("top") || "";
  const mid = sp.get("mid") || "";
  const end = sp.get("end") || "";
  const brand = sp.get("brand") || ""; // brand slug or id
  const flag = sp.get("flag") || ""; // featured | hot | top | deal
  const minPrice = parseFloat(sp.get("minPrice") || "");
  const maxPrice = parseFloat(sp.get("maxPrice") || "");
  const sort = sp.get("sort") || "relevance"; // relevance | price-asc | price-desc | name-asc | new | discount
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const limit = Math.min(60, Math.max(4, parseInt(sp.get("limit") || "24")));
  const includeInactive = sp.get("all") === "1"; // admin use

  const warehouseId = sp.get("warehouseId") || ""; // Task 15: only products stocked at this warehouse

  const where: Record<string, unknown> = {};
  if (!includeInactive) where.active = true;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { sku: { contains: q } },
      { barcode: { contains: q } },
      { brand: { is: { name: { contains: q } } } },
    ];
  }
  if (top) where.topId = top;
  if (mid) where.midId = mid;
  if (end) where.endId = end;
  if (brand) {
    const brandRow = await db.brand.findFirst({ where: { OR: [{ slug: brand }, { id: brand }] }, select: { id: true } });
    if (brandRow) where.brandId = brandRow.id;
  }
  if (flag === "featured") where.isFeatured = true;
  if (flag === "hot") where.isHot = true;
  if (flag === "top") where.isTop = true;
  if (flag === "deal") where.isDeal = true;
  if (warehouseId) where.warehouseStocks = { some: { warehouseId, qty: { gt: 0 } } };
  if (!Number.isNaN(minPrice) || !Number.isNaN(maxPrice)) {
    where.dealerPrice = {
      ...(Number.isNaN(minPrice) ? {} : { gte: minPrice }),
      ...(Number.isNaN(maxPrice) ? {} : { lte: maxPrice }),
    };
  }

  const orderBy =
    sort === "price-asc" ? { dealerPrice: "asc" as const }
    : sort === "price-desc" ? { dealerPrice: "desc" as const }
    : sort === "name-asc" ? { name: "asc" as const }
    : sort === "new" ? { createdAt: "desc" as const }
    : sort === "discount" ? { mrp: "desc" as const }
    : { isTop: "desc" as const };

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: { brand: { select: { name: true, slug: true, logo: true } } },
    }),
  ]);

  // Buyer-safe payload whitelist: purchase cost and live stock NEVER leave the admin panel
  // (Task 12g + Task 15). Tiers + packPrice ride along for the client-side slab pricing engine.
  const safe = products.map((p) => ({
    id: p.id, sku: p.sku, slug: p.slug, name: p.name,
    dealerPrice: p.dealerPrice, basePrice: p.basePrice, mrp: p.mrp,
    tier1: p.tier1, tier2: p.tier2, tier3: p.tier3, tier4: p.tier4, tier5: p.tier5,
    packPrice: p.packPrice, packQty: p.packQty, piecesPerBox: p.piecesPerBox, unit: p.unit,
    barcode: p.barcode, gst: p.gst, image: p.image,
    isHot: p.isHot, isTop: p.isTop, isFeatured: p.isFeatured, isDeal: p.isDeal, dealPrice: p.dealPrice,
    active: p.active, rating: p.rating, reviewCount: p.reviewCount,
    brand: p.brand, topId: p.topId, midId: p.midId, endId: p.endId, createdAt: p.createdAt,
  }));

  const res = NextResponse.json({
    products: safe,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
  // Cacheable browsing (category/brand/flag pages) → served from Vercel edge CDN in ~100ms.
  // Admin (all=1) and live search stay uncached so results are always fresh.
  // 15s, no stale-while-revalidate — SWR made old product grids show first.
  if (!includeInactive && !q) {
    res.headers.set("Cache-Control", "public, s-maxage=15");
  } else {
    res.headers.set("Cache-Control", "private, no-store");
  }
  return res;
}
