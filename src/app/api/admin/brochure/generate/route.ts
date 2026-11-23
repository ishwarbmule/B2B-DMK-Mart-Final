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
    const [companyGroups, tops, settings] = await Promise.all([
      db.product.groupBy({ by: ["company"], _count: { _all: true }, where: { active: true } }),
      db.topCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, mids: { select: { id: true, name: true, ends: { select: { id: true, name: true } } } } } }),
      db.setting.findMany({ where: { key: { in: ["firm_name", "firm_phone", "site_title"] } } }).catch(() => [] as { key: string; value: string }[]),
    ]);
    const S: Record<string, string> = {};
    for (const s of settings) S[s.key] = s.value;
    return NextResponse.json({
      companies: companyGroups
        .map((c) => ({ name: c.company || "Unassigned", count: c._count._all }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      tops,
      contact: { firmName: S.firm_name || "DMK Mart", firmPhone: S.firm_phone || "", site: SITE_URL },
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
    const filters: BrochureFilters = {
      companies: Array.isArray(body.companies) ? body.companies.map(String).filter(Boolean).slice(0, 25) : [],
      topId: body.topId || undefined,
      midId: body.midId || undefined,
      endId: body.endId || undefined,
      readyOnly: !!body.readyOnly,
      includeOutOfStock: !!body.includeOutOfStock,
      showPrices: body.showPrices !== false,
      tier: typeof body.tier === "string" ? body.tier : "dealer",
      maxProducts: Math.min(Number(body.maxProducts) || 120, 250),
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
      data: { action: "EXPORT", entity: "brochure", detail: `${meta.id}: ${meta.count} products, companies=[${meta.companies.slice(0, 6).join(", ")}]${shareUrl ? " · shared" : ""}`, user: "Super Admin" },
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
