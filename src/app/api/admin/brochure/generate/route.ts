/**
 * /api/admin/brochure/generate — dynamic company/catalog brochure engine.
 *
 * GET  → meta for the filter panel: distinct companies (+counts), category tree,
 *        firm contact settings. Powers the "Download Brochure" module.
 * POST → builds the PDF from LIVE data with body filters:
 *        { companies[], topId?, midId?, endId?, readyOnly?, includeOutOfStock?,
 *          showPrices?, tier?, maxProducts? }
 *        Response: application/pdf binary (download blob).
 *        Meta (version id, share URL, counts) is returned in the
 *        `X-Brochure-Meta` header as base64url JSON.
 *        When Cloudinary is configured the PDF is also uploaded as a raw
 *        resource → shareable https link for WhatsApp / email.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { generateBrochure, uploadBrochureShare, SITE_URL, type BrochureFilters } from "@/lib/brochure";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      maxProducts: Number(body.maxProducts) || 200,
    };

    const { buffer, meta } = await generateBrochure(filters);

    // Best-effort share upload (WhatsApp / email need a public https link).
    let shareUrl: string | null = null;
    try {
      shareUrl = await uploadBrochureShare(buffer, meta.filename);
    } catch { shareUrl = null; }
    if (shareUrl) meta.shareUrl = shareUrl;

    await db.activityLog.create({
      data: { action: "EXPORT", entity: "brochure", detail: `${meta.id}: ${meta.count} products, companies=[${meta.companies.slice(0, 6).join(", ")}]${shareUrl ? " · shared" : ""}`, user: "Super Admin" },
    }).catch(() => {});

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
