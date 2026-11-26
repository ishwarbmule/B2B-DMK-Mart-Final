import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerFromReq } from "@/lib/customer-auth";
import { rankWarehouses } from "@/lib/geo";
import { GUEST_TIER, locationPriceFor } from "@/lib/pricing";
import { beltOfLocation, servingWarehouseFor } from "@/lib/maharashtra";

export const dynamic = "force-dynamic";

/** Public catalog browsing with server-side pagination for 2,200+ SKUs (brand-first).
 *  Location-aware: a logged-in customer with city/pincode on file only sees products
 *  stocked (qty > 0) at their nearest warehouse — override with ?allWarehouses=1. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const top = sp.get("top") || "";
  const mid = sp.get("mid") || "";
  const end = sp.get("end") || "";
  const brand = sp.get("brand") || ""; // legacy brand page links
  const company = sp.get("company")?.trim() || ""; // company-based browsing (brands removed from inventory)
  const flag = sp.get("flag") || ""; // featured | hot | top | deal
  const minPrice = parseFloat(sp.get("minPrice") || "");
  const maxPrice = parseFloat(sp.get("maxPrice") || "");
  const sort = sp.get("sort") || "relevance"; // relevance | price-asc | price-desc | name-asc | new | discount
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const limit = Math.min(60, Math.max(4, parseInt(sp.get("limit") || "24")));
  const includeInactive = sp.get("all") === "1"; // admin use

  const warehouseId = sp.get("warehouseId") || ""; // Task 15: only products stocked at this warehouse
  const allWarehouses = sp.get("allWarehouses") === "1"; // explicit escape hatch
  // BRAND-GROUPED SECTIONS — flag views (Ready to Dispatch / Top Selling, Hot,
  // Deals of the Day, Featured) can fetch the whole section at once so the page
  // can render clean per-company blocks (products of one brand never mix with
  // another). Bounded by the section size; hard cap 600 keeps it safe.
  const flagAll = flag !== "" && sp.get("flagAll") === "1";

  const where: Record<string, unknown> = {};
  if (!includeInactive) where.active = true;
  if (q) {
    // word-wise search: EVERY word must match somewhere (name/sku/barcode/brand),
    // in any order — "milk can 10" matches "MILK CAN 10 L" and "can 10 l milk"
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
    if (tokens.length) {
      where.AND = tokens.map((t) => ({
        OR: [
          { name: { contains: t } },
          { sku: { contains: t } },
          { barcode: { contains: t } },
          { company: { contains: t } },
          { brand: { is: { name: { contains: t } } } },
        ],
      }));
    }
  }
  if (top) where.topId = top;
  if (mid) where.midId = mid;
  if (end) where.endId = end;
  if (company) where.company = company;
  if (brand) {
    const brandRow = await db.brand.findFirst({ where: { OR: [{ slug: brand }, { id: brand }] }, select: { id: true } });
    if (brandRow) where.brandId = brandRow.id;
  }
  if (flag === "featured") where.isFeatured = true;
  if (flag === "hot") where.isHot = true;
  if (flag === "top") where.isTop = true;
  if (flag === "deal") where.isDeal = true;

  // ── buyer identity once: tier drives BOTH the location catalog and the price filter ──
  const customerId = customerFromReq(req);
  let buyerTier = GUEST_TIER; // logged-out visitors see wholesale (tier2) piece prices
  let buyerWarehouseName = "";
  let buyerCity: string | null = null;
  let scopedWarehouseId = ""; // the godown whose products THIS buyer browses
  if (customerId) {
    const cust = await db.customer.findUnique({
      where: { id: customerId },
      select: { city: true, pincode: true, tier: true, status: true },
    });
    // API-level approval gate: a suspended/pending account's old token must not
    // keep working even if the login page never let them back in
    if (cust && cust.status !== "APPROVED") {
      return NextResponse.json({ error: `Account ${cust.status.toLowerCase()} — contact DMK Mart support.` }, { status: 403 });
    }
    if (cust) {
      buyerTier = /^tier[1-5]$/.test(cust.tier) ? cust.tier : GUEST_TIER;
      buyerCity = cust.city?.trim() || null;
      if (!includeInactive) {
        const whs = await db.warehouse.findMany({
          where: { active: true },
          orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
          select: { id: true, name: true, city: true, isDefault: true, sortOrder: true },
        });
        // WAREHOUSE-SCOPED BROWSING: the buyer picks their godown right after
        // login (the /choose-warehouse gate) and sees ONLY that godown's
        // products — scoped with ANY qty, because finalize plants zero-qty
        // coverage rows for the whole firm catalog (stocked or still being
        // built). No URL escape can bypass the cookie. Legacy fallback when no
        // cookie: the buyer's city belt decides the godown.
        const chosenId = req.cookies.get("dmk_wh")?.value || "";
        const chosen = chosenId ? whs.find((w) => w.id === chosenId) : undefined;
        if (chosen) {
          scopedWarehouseId = chosen.id;
          buyerWarehouseName = chosen.name;
        } else {
          const belt = beltOfLocation(cust.city);
          const beltWh = belt ? servingWarehouseFor(whs, belt) : undefined;
          const nearest = beltWh ?? ((cust.city || cust.pincode) ? rankWarehouses(whs, cust.city, cust.pincode)[0] : undefined);
          if (nearest) {
            scopedWarehouseId = nearest.id;
            buyerWarehouseName = nearest.name;
          } else if (warehouseId) {
            scopedWarehouseId = warehouseId;
          }
        }
        if (scopedWarehouseId) where.warehouseStocks = { some: { warehouseId: scopedWarehouseId } };
      }
    }
  }
  if (!buyerWarehouseName && warehouseId) where.warehouseStocks = { some: { warehouseId, qty: { gt: 0 } } };
  if (!Number.isNaN(minPrice) || !Number.isNaN(maxPrice)) {
    // ACCURATE price filter: match the piece price the buyer actually SEES on the card —
    // their own slab's rate, with the exact fallback the client pricing engine applies
    // (tier column 0 → dealerPrice). Filtering raw dealerPrice made results not match prices shown.
    const range: Record<string, number> = {
      ...(Number.isNaN(minPrice) ? {} : { gte: minPrice }),
      ...(Number.isNaN(maxPrice) ? {} : { lte: maxPrice }),
    };
    const seenPrice = {
      OR: [
        { [buyerTier]: { gt: 0, ...range } },
        { AND: [{ [buyerTier]: { lte: 0 } }, { dealerPrice: range }] },
      ],
    };
    where.AND = [...((where.AND as unknown[]) ?? []), seenPrice];
  }

  // BRAND-FIRST ORDER for the merchandised sections: with the default sort,
  // flag views stream company-by-company (every brand's products sit together,
  // never interleaved). Explicit user sorts still win.
  const flagView = flag !== "";
  const orderBy =
    sort === "price-asc" ? { dealerPrice: "asc" as const }
    : sort === "price-desc" ? { dealerPrice: "desc" as const }
    : sort === "name-asc" ? { name: "asc" as const }
    : sort === "new" ? { createdAt: "desc" as const }
    : sort === "discount" ? { mrp: "desc" as const }
    : flagView ? [{ company: "asc" as const }, { name: "asc" as const }]
    : { isTop: "desc" as const };

  const take = flagAll ? 600 : limit;
  // per-warehouse availability: when scoped, inStock means "stocked at THIS
  // godown" (powers the green dot honestly per location), not stocked anywhere
  const include = {
    brand: { select: { name: true, slug: true, logo: true } },
    ...(scopedWarehouseId
      ? { warehouseStocks: { where: { warehouseId: scopedWarehouseId }, select: { qty: true } } }
      : {}),
  };
  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy,
      skip: flagAll ? 0 : (page - 1) * limit,
      take,
      include,
    }),
  ]);

  // Buyer-safe payload whitelist: purchase cost and the live stock NUMBER never
  // leave the admin panel (Task 12g + Task 15) — only the boolean availability
  // flag rides along (powers the in-stock glow dot on product images).
  // Tiers + packPrice ride along for the client-side slab pricing engine.
  // Location pricing: the logged-in buyer's city override rides as locPrice (all other
  // cities' overrides stay server-side).
  const safe = products.map((p) => ({
    id: p.id, sku: p.sku, slug: p.slug, name: p.name,
    dealerPrice: p.dealerPrice, basePrice: p.basePrice, mrp: p.mrp,
    tier1: p.tier1, tier2: p.tier2, tier3: p.tier3, tier4: p.tier4, tier5: p.tier5,
    ...(buyerCity ? { locPrice: locationPriceFor(p.locationPrices, buyerCity) } : {}),
    packPrice: p.packPrice, packQty: p.packQty, piecesPerBox: p.piecesPerBox, unit: p.unit,
    barcode: p.barcode, gst: p.gst, image: p.image,
    inStock: scopedWarehouseId
      ? ((p as unknown as { warehouseStocks?: { qty: number }[] }).warehouseStocks ?? []).some((s) => s.qty > 0)
      : p.stock > 0,
    isHot: p.isHot, isTop: p.isTop, isFeatured: p.isFeatured, isDeal: p.isDeal, dealPrice: p.dealPrice,
    active: p.active, rating: p.rating, reviewCount: p.reviewCount,
    company: p.company,
    brand: p.brand, topId: p.topId, midId: p.midId, endId: p.endId, createdAt: p.createdAt,
  }));

  const res = NextResponse.json({
    products: safe,
    total: flagAll ? safe.length : total,
    page,
    pages: flagAll ? 1 : Math.max(1, Math.ceil(total / limit)),
    ...(flagAll ? { grouped: true } : {}),
    ...(buyerWarehouseName ? { buyerWarehouse: buyerWarehouseName } : {}),
  });
  // Cacheable browsing (category/brand/flag pages) → served from Vercel edge CDN in ~100ms.
  // Admin (all=1), live search and location-filtered requests stay uncached so results are always fresh.
  if (!includeInactive && !q && !buyerWarehouseName) {
    res.headers.set("Cache-Control", "public, s-maxage=15");
  } else {
    res.headers.set("Cache-Control", "private, no-store");
  }
  return res;
}
