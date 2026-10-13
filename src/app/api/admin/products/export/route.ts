import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Bulk Rate Change — Step 1: export product list as CSV (optionally by company) */
export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const company = req.nextUrl.searchParams.get("company") || "";
    const where: Record<string, unknown> = {};
    if (company) where.companyId = company;
    const rows = await db.product.findMany({
      where,
      orderBy: { sku: "asc" },
      include: { company: { select: { name: true } } },
    });
    const header = "id,sku,product_name,old_price,c_price,base_price,pack_size,stock,active";
    const lines = rows.map((r) =>
      [r.id, r.sku, `"${r.name.replace(/"/g, '""')}"`, r.mrp, r.basePrice, r.dealerPrice, r.packSize, r.stock, r.active ? "Yes" : "No"].join(",")
    );
    const csv = [header, ...lines].join("\n");
    await db.activityLog.create({ data: { action: "EXPORT", entity: "product", detail: `Bulk rate CSV exported (${rows.length} products${company ? ", filtered by company" : ""})` } });
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="dmk-rate-export-${Date.now()}.csv"`,
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 200) : "Export failed", 500);
  }
}
