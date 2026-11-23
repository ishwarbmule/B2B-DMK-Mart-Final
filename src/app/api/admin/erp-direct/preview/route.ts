/**
 * /api/admin/erp-direct/preview — the "Synced data" surface of the guided flow.
 * Everything comes from the SITE's own database (what has already been pulled),
 * never from the source system. Column set follows the friendly ticks, so
 * unticked details disappear here immediately after an update.
 * GET → { counts, products, warehouses, groups }
 */
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { getProductGroups } from "@/lib/erp-direct-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const groups = await getProductGroups();
    const on = (id: string) => groups.find((g) => g.id === id)?.ticked !== false;

    const productSelect = {
      name: true,
      sku: true,
      dealerPrice: true,
      mrp: on("mrp"),
      stock: on("stock"),
      company: on("brand"),
      active: true,
    } as const;

    const [counts, products, warehouses] = await Promise.all([
      Promise.all([
        db.product.count({ where: { syncSource: "ERP" } }),
        db.product.count({ where: { syncSource: "ERP", active: true } }),
        db.warehouse.count({ where: { source: "ERP" } }),
        db.warehouse.count({ where: { source: "ERP", active: true } }),
        db.warehouseStock.count({ where: { warehouse: { source: "ERP", active: true } } }),
      ]).then(([productsTotal, productsShown, warehousesTotal, warehousesShown, stockRows]) => ({
        productsTotal, productsShown, warehousesTotal, warehousesShown, stockRows,
      })),
      db.product.findMany({
        where: { syncSource: "ERP" },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: productSelect,
      }),
      db.warehouse.findMany({
        // only godowns currently shown — unticked ones never render anywhere
        where: { source: "ERP", active: true },
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: { id: true, name: true, city: true, active: true, _count: { select: { stocks: true } } },
      }),
    ]);

    return Response.json({
      groups,
      counts,
      products: products.map((p) => ({
        name: p.name,
        sku: p.sku,
        price: p.dealerPrice,
        mrp: on("mrp") ? p.mrp : null,
        stock: on("stock") ? p.stock : null,
        company: on("brand") ? p.company : null,
        active: p.active,
      })),
      warehouses: warehouses.map((w) => ({
        name: w.name,
        city: w.city,
        active: w.active,
        stockRows: w._count.stocks,
      })),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Preview failed", 500);
  }
}
