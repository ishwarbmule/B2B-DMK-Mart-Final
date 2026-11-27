/**
 * /api/admin/erp-direct/exclusions — GST-firm product exclusion (owner rule).
 *
 * The two Excel exports of 27 Nov 2026 list the GST-firm product lines (DMK
 * Traders / HD Polyplast / Plastic World / Steelking). DMK Mart sells only the
 * non-GST firms' products from the Kolhar and Pune warehouses, so:
 *   - every sync path skips these SKUs (src/lib/erp-sync-exclusions.ts), and
 *   - this endpoint removes whatever copies already landed here.
 *
 * GET  → report: matching rows still in the DB + affected brands/mirrors.
 * POST { action: "prune" } → delete them (product delete cascades its
 *   WarehouseStock rows). A product that has orders cannot be hard-deleted
 *   (OrderItem FK) — it is hidden instead (active=false, stock=0) and counted
 *   as `hidden`. Also drops the now-unused ERP mirror rows and the brands of
 *   the excluded firms that no longer hold any product.
 */
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { setSetting, logSyncEvent } from "@/lib/settings";
import { EXCLUDED_SKUS, EXCLUDED_COMPANIES, isExcludedCompany } from "@/lib/erp-sync-exclusions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
void norm; // reserved for future admin-managed extension lists

async function findExcludedProducts() {
  return db.product.findMany({
    where: { OR: [{ sku: { in: EXCLUDED_SKUS } }] },
    select: { id: true, sku: true, name: true, company: true, active: true, activeSource: true, syncSource: true, stock: true, brandId: true },
    orderBy: { sku: "asc" },
  });
}

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const rows = await findExcludedProducts();
  const brands = await db.brand.findMany({ select: { id: true, name: true } });
  const gstBrands = brands.filter((b) => isExcludedCompany(b.name));
  const brandIds = new Set(gstBrands.map((b) => b.id));
  return Response.json({
    ok: true,
    excludedSkus: EXCLUDED_SKUS.length,
    excludedCompanies: EXCLUDED_COMPANIES,
    products: rows,
    productCount: rows.length,
    gstFirmBrands: gstBrands.map((b) => ({ id: b.id, name: b.name })),
    gstBrandProducts: rows.filter((r) => r.brandId && brandIds.has(r.brandId)).length,
  });
}

export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "prune") return jsonError("Unknown action — use { action: \"prune\" }");

    const rows = await findExcludedProducts();
    let deleted = 0;
    let hidden = 0;
    const deletedSkus: string[] = [];
    const hiddenSkus: string[] = [];
    for (const r of rows) {
      try {
        await db.product.delete({ where: { id: r.id } }); // cascades WarehouseStock
        deleted++;
        deletedSkus.push(r.sku);
      } catch {
        // order items reference this product — hide it instead, never lose order history
        await db.product.update({ where: { id: r.id }, data: { active: false, stock: 0, activeSource: "ADMIN" } });
        await db.warehouseStock.deleteMany({ where: { productId: r.id } });
        hidden++;
        hiddenSkus.push(r.sku);
      }
    }

    // ERP mirror rows for the excluded lines are "collected data" too
    const mirrors = await db.erpProductMirror.deleteMany({ where: { sku: { in: EXCLUDED_SKUS } } });

    // brands of the excluded firms that no longer hold any product (Ad.brandId is SetNull — safe)
    const brands = await db.brand.findMany({ select: { id: true, name: true } });
    const removedBrands: string[] = [];
    for (const b of brands) {
      if (!isExcludedCompany(b.name)) continue;
      const still = await db.product.count({ where: { brandId: b.id } });
      if (still === 0) {
        await db.brand.delete({ where: { id: b.id } });
        removedBrands.push(b.name);
      }
    }

    // audit trail: persist the exclusion list as a setting (the code rule is the constant)
    await setSetting("erp_sync_excluded_skus", JSON.stringify({ note: "GST-firm lines from the 27 Nov 2026 Excel exports — never sync (src/lib/erp-sync-exclusions.ts)", skus: EXCLUDED_SKUS }));
    await logSyncEvent({
      direction: "ERP→WEB", action: "gst-firm-prune", status: "OK",
      message: `GST-firm exclusion prune: ${deleted} products deleted, ${hidden} hidden (order history), ${mirrors.count} mirror rows, ${removedBrands.length} empty firm brands removed`,
    });

    return Response.json({
      ok: true,
      matched: rows.length,
      deleted, hidden,
      deletedSkus, hiddenSkus,
      mirrorsRemoved: mirrors.count,
      removedBrands,
      remaining: await db.product.count({ where: { sku: { in: EXCLUDED_SKUS } } }),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Prune failed", 400);
  }
}
