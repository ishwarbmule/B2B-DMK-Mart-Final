/**
 * /api/admin/brochure/generate — dynamic company/catalog brochure engine.
 *
 * GET  → meta for the filter panel: distinct companies (+counts), category tree,
 *        firm contact settings. Powers the "Download Brochure" module.
 * POST → builds the PDF from LIVE data with body filters:
 *        { companies[], topId?, midId?, endId?, readyOnly?, includeOutOfStock?,
 *          showPrices?, tier?, maxProducts? }
 *        Two response modes:
 *        · SMALL PDF  (< SHARE_THRESHOLD bytes) → application/pdf binary download.
 *        · LARGE PDF  → uploaded to Cloudinary (raw resource) and a JSON
 *          { shareUrl, meta } is returned instead. Serverless responses are
 *          hard-capped (~4.5 MB) — streaming a big PDF used to 500 here; a
 *          Cloudinary-hosted link has no such limit and downloads faster.
 *        When Cloudinary is NOT configured, the binary is streamed regardless
 *        (with the size clamps below it usually still fits).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { generateBrochure, uploadBrochureShare, SITE_URL, type BrochureFilters } from "@/lib/brochure";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Serverless response bodies are capped ~4.5 MB — anything bigger must go via
 *  the Cloudinary share link instead of a direct binary stream. */
const SHARE_THRESHOLD_BYTES = 3.2 * 1024 * 1024;

function cloudinaryConfigured(): boolean {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    // ?warehouseId=… → ALSO return the picker list: the FULL catalog with that
    // godown's own quantities (0 where it carries none), hidden products
    // included, so the admin can sort and pick exactly what goes into the
    // brochure.
    const pickWarehouseId = (req.nextUrl.searchParams.get("warehouseId") || "").trim();

    const [companyGroups, tops, warehouses, settings] = await Promise.all([
      db.product.groupBy({ by: ["company"], _count: { _all: true }, where: { active: true } }),
      db.topCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, mids: { select: { id: true, name: true, ends: { select: { id: true, name: true } } } } } }),
      // the godowns a brochure can be printed for — ERP godowns the admin still
      // shows + admin-created LOCAL ones, each with its stocked-SKU count
      db.warehouse.findMany({
        where: { active: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: { id: true, name: true, city: true, isDefault: true, _count: { select: { stocks: { where: { qty: { gt: 0 } } } } } },
      }),
      db.setting.findMany({ where: { key: { in: ["firm_name", "firm_phone", "site_title"] } } }).catch(() => [] as { key: string; value: string }[]),
    ]);

    // picker rows — brand-grouped order (company → name) so the brochure pops
    // out with the same grouping the picker showed
    let warehouse: { id: string; name: string; city: string } | null = null;
    let products: {
      id: string; sku: string; name: string; company: string; category: string;
      qty: number; active: boolean; dealerPrice: number; mrp: number; image: string;
    }[] = [];
    if (pickWarehouseId) {
      const wh = await db.warehouse.findUnique({ where: { id: pickWarehouseId }, select: { id: true, name: true, city: true } });
      if (!wh) return jsonError("That warehouse no longer exists — pick another one.", 400);
      warehouse = wh;
      // THE FULL CATALOG through the godown lens: EVERY product — active or
      // hidden — with THIS godown's own qty (0 when the source carries no
      // stock row for it here). "Each warehouse's all products should be
      // visible to print … all products means inactive products too": the
      // owner sorts and picks exactly what goes into the print, stocked or not.
      const rows = await db.product.findMany({
        select: {
          id: true, sku: true, name: true, company: true, dealerPrice: true, mrp: true, active: true, image: true,
          end: { select: { name: true } }, mid: { select: { name: true } }, top: { select: { name: true } },
          warehouseStocks: { where: { warehouseId: pickWarehouseId }, select: { qty: true } },
        },
        orderBy: [{ company: "asc" }, { name: "asc" }],
      });
      products = rows.map((p) => ({
        id: p.id, sku: p.sku, name: p.name, company: p.company || "Unassigned",
        category: p.end?.name || p.mid?.name || p.top?.name || "General",
        qty: p.warehouseStocks?.[0]?.qty ?? 0,
        active: p.active,
        dealerPrice: p.dealerPrice,
        mrp: p.mrp,
        image: p.image,
      }));
    }

    const S: Record<string, string> = {};
    for (const s of settings) S[s.key] = s.value;
    return NextResponse.json({
      companies: companyGroups
        .map((c) => ({ name: c.company || "Unassigned", count: c._count._all }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      tops,
      warehouses: warehouses.map((w) => ({ id: w.id, name: w.name, city: w.city, isDefault: w.isDefault, skus: w._count.stocks })),
      contact: { firmName: S.firm_name || "DMK Mart", firmPhone: S.firm_phone || "", site: SITE_URL },
      ...(pickWarehouseId ? { warehouse, products } : {}),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Could not load brochure meta", 500);
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<BrochureFilters> & { share?: boolean };
    // WAREHOUSE IS MANDATORY — every brochure is printed for ONE godown, and the
    // product list + quantities are that warehouse's own stock.
    const warehouseId = String(body.warehouseId || "").trim();
    if (!warehouseId) return jsonError("Pick the warehouse first — every brochure prints one godown's stock.", 400);
    const filters: BrochureFilters = {
      warehouseId,
      companies: Array.isArray(body.companies) ? body.companies.map(String).filter(Boolean).slice(0, 25) : [],
      topId: body.topId || undefined,
      midId: body.midId || undefined,
      endId: body.endId || undefined,
      readyOnly: !!body.readyOnly,
      includeOutOfStock: !!body.includeOutOfStock,
      showPrices: body.showPrices !== false,
      tier: typeof body.tier === "string" ? body.tier : "dealer",
      // "all" = print everything that matches (up to the hard server cap);
      // a picked productIds list always wins over the other filters
      maxProducts: body.maxProducts === "all" ? "all" : Math.min(Number(body.maxProducts) || 120, 250),
      productIds: Array.isArray(body.productIds) ? body.productIds.map(String).filter(Boolean) : [],
    };

    const { buffer, meta } = await generateBrochure(filters);

    // Big PDFs can never survive the serverless response cap — upload to
    // Cloudinary and hand back the hosted link. Small PDFs stream directly.
    const needsShare = cloudinaryConfigured() && (body.share === true || buffer.length > SHARE_THRESHOLD_BYTES);
    let shareUrl: string | null = null;
    if (needsShare) {
      try {
        shareUrl = await uploadBrochureShare(buffer, meta.filename);
      } catch { shareUrl = null; }
      meta.shareUrl = shareUrl || undefined;
    }

    await db.activityLog.create({
      data: { action: "EXPORT", entity: "brochure", detail: `${meta.id}: ${meta.count} products for ${meta.warehouse ?? "warehouse"}, companies=[${meta.companies.slice(0, 6).join(", ")}]${shareUrl ? " · shared" : ""}`, user: "Super Admin" },
    }).catch(() => {});

    if (needsShare && shareUrl) {
      return NextResponse.json({ shareUrl, meta, bytes: buffer.length });
    }

    const metaHeader = Buffer.from(JSON.stringify(meta)).toString("base64url");
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${meta.filename}"`,
        "cache-control": "no-store",
        "x-brochure-meta": metaHeader,
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 400) : "Brochure generation failed", 500);
  }
}
