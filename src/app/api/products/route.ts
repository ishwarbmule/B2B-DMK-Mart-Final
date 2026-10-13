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

  return NextResponse.json({
    products,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}
