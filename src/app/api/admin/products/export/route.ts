import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/products/export?company=&q=&status=
 * Company-based product list export — the columns match the owner's inventory sheet
 * EXACTLY, so the downloaded file can be edited and re-uploaded (SKU-based update):
 *   SKU | Product Name | Image URL | Company | Top Level Category | End Level Category |
 *   Unit | HSN | GST % | Delivery Rate | Cost Price | Pack Qty | Tier 1 Distributor |
 *   Tier 2 Wholesale | Tier 3 Semi-Wholesale | Tier 4 Retailer | Tier 5 MRP | Sellable Stock |
 *   Damaged Stock | Reserved | Low Stock Threshold | Status | Barcode | Weight (g) |
 *   Pieces/Box | Created On
 */
const SHEET_HEADER = [
  "SKU", "Product Name", "Image URL", "Company", "Top Level Category", "End Level Category",
  "Unit", "HSN", "GST %", "Delivery Rate", "Cost Price", "Pack Qty",
  "Tier 1 Distributor", "Tier 2 Wholesale", "Tier 3 Semi-Wholesale", "Tier 4 Retailer", "Tier 5 MRP",
  "Sellable Stock", "Damaged Stock", "Reserved", "Low Stock Threshold", "Status", "Barcode",
  "Weight (g)", "Pieces/Box", "Created On",
];

const d2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
const dateOnly = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const sp = req.nextUrl.searchParams;
    const company = sp.get("company")?.trim() || "";
    const q = sp.get("q")?.trim() || "";
    const status = sp.get("status") || ""; // active | inactive | "" (all)

    const where: Record<string, unknown> = {};
    if (company) where.company = company;
    if (status === "active") where.active = true;
    if (status === "inactive") where.active = false;
    if (q) where.OR = [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }, { company: { contains: q } }];

    const rows = await db.product.findMany({
      where,
      orderBy: [{ company: "asc" }, { sku: "asc" }],
      include: {
        top: { select: { name: true } },
        end: { select: { name: true } },
        brand: { select: { name: true } },
      },
    });

    const data = rows.map((r) => [
      r.sku,
      r.name,
      r.image,
      r.company || r.brand?.name || "",
      r.top?.name ?? "",
      r.end?.name ?? "",
      r.unit || "Pcs",
      r.hsn,
      d2(r.gst),
      d2(r.deliveryRate),
      d2(r.purchaseCost),
      r.packQty,
      d2(r.tier1), d2(r.tier2), d2(r.tier3), d2(r.tier4), d2(r.tier5),
      d2(r.stock), d2(r.damagedStock), d2(r.reservedQty),
      r.lowStockThreshold,
      r.active ? "ACTIVE" : "INACTIVE",
      r.barcode,
      d2(r.weightGrams),
      r.piecesPerBox || 1,
      dateOnly(r.createdAt),
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([SHEET_HEADER, ...data]);
    ws["!cols"] = [
      { wch: 14 }, { wch: 42 }, { wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 26 },
      { wch: 7 }, { wch: 8 }, { wch: 7 }, { wch: 12 }, { wch: 10 }, { wch: 9 },
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 13 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
      { wch: 10 }, { wch: 11 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    await db.activityLog.create({
      data: { action: "EXPORT", entity: "product", detail: `Company-based Excel exported (${rows.length} products${company ? `, company: ${company}` : ""})` },
    });

    const fname = `dmk-products-${company ? company.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" : "all-"}${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${fname}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 200) : "Export failed", 500);
  }
}
