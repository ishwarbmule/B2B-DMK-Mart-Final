import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getProductsMapping, getWarehousesMapping, getStockMapping } from "@/lib/erp-direct-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET — dashboard for the ERP integration: mapping presence, row counts, cursor + history. */
export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const [productsMap, warehousesMap, stockMap] = await Promise.all([
      getProductsMapping(), getWarehousesMapping(), getStockMapping(),
    ]);
    const [mirrorCount, erpProducts, erpWarehouses, erpStockRows, brandCount] = await Promise.all([
      db.erpProductMirror.count(),
      db.product.count({ where: { syncSource: "ERP" } }),
      db.warehouse.count({ where: { source: "ERP" } }),
      db.warehouseStock.count({ where: { warehouse: { source: "ERP" } } }),
      db.brand.count(),
    ]);
    const history = await db.syncEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, direction: true, action: true, status: true, message: true, productsSeen: true, created: true, updated: true, skipped: true, durationMs: true, createdAt: true },
    });
    return Response.json({
      mappings: {
        products: productsMap ? { table: productsMap.table, ticked: productsMap.columns?.length ?? 0 } : null,
        warehouses: warehousesMap ? { table: warehousesMap.table, ticked: warehousesMap.columns?.length ?? 0 } : null,
        stock: stockMap ? { table: stockMap.table, ticked: stockMap.columns?.length ?? 0 } : null,
      },
      counts: { mirror: mirrorCount, erpProducts, erpWarehouses, erpStockRows, brands: brandCount },
      cursor: {
        productsOffset: Number(await getSetting("erp_sync_cursor_products", "0") || 0),
        lastFullAt: await getSetting("erp_sync_last_full_at", ""),
        lastWarehousesAt: await getSetting("erp_sync_last_warehouses_at", ""),
        lastStockAt: await getSetting("erp_sync_last_stock_at", ""),
        lastTickAt: await getSetting("erp_sync_last_tick_at", ""),
      },
      history,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Status failed", 500);
  }
}
