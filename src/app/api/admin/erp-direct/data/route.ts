import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { fetchErpPage, countErpTable } from "@/lib/erp-mysql";
import { getProductsMapping, getWarehousesMapping, getStockMapping, fetchStockJoined, type StockMapping } from "@/lib/erp-direct-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Entity = "products" | "warehouses" | "stock";

/**
 * GET ?entity=&page=1&q= — the ticked-columns data browser.
 * "From website we should have authority to tick which data need to show to
 * website accordingly its columns should appear on admin panel" — this route
 * serves exactly the ticked columns with live ERP data, paginated + searchable.
 * costPrice is NEVER exposed here (admin-only rule) — the mapped cost column is
 * stripped from the response.
 */
export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const url = new URL(req.url);
  const entity = (url.searchParams.get("entity") ?? "products") as Entity;
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const q = (url.searchParams.get("q") ?? "").trim();
  const pageSize = 50;

  try {
    let mapping: { table: string; skuCol?: string; nameCol?: string; codeCol?: string; warehouseCodeCol?: string; columns: string[]; rateCol?: string; mrpCol?: string; costCol?: string } | null = null;
    if (entity === "products") mapping = await getProductsMapping();
    else if (entity === "warehouses") mapping = await getWarehousesMapping();
    else if (entity === "stock") mapping = await getStockMapping();
    else return jsonError("unknown entity");
    if (!mapping) return Response.json({ configured: false });

    const displayCols = [...new Set([...(mapping.columns || []), mapping.skuCol, mapping.nameCol, mapping.codeCol, mapping.warehouseCodeCol, mapping.rateCol, mapping.mrpCol].filter(Boolean) as string[])]
      .filter((c) => c !== mapping!.costCol); // cost price never leaves the mapping layer
    const searchCol = mapping.skuCol || mapping.nameCol || mapping.codeCol || mapping.warehouseCodeCol;

    const [total, rows] = await Promise.all([
      countErpTable(mapping.table),
      // stock rows are ID-keyed (productId / warehouseId) — when the mapping
      // declares its joins, resolve them (SKU + godown code readable instead of
      // raw row ids) and read EVERY godown, not just the picked ones: this
      // browser is the owner's window into the whole source table.
      entity === "stock" && ((mapping as { skuJoin?: unknown }).skuJoin || (mapping as { warehouseJoin?: unknown }).warehouseJoin)
        ? fetchStockJoined(mapping as StockMapping, {
            scoped: false,
            limit: pageSize,
            offset: (page - 1) * pageSize,
            searchCol: q && searchCol ? searchCol : undefined,
            search: q || undefined,
          })
        : fetchErpPage(mapping.table, displayCols, {
            limit: pageSize,
            offset: (page - 1) * pageSize,
            orderBy: searchCol,
            searchCol: q && searchCol ? searchCol : undefined,
            search: q || undefined,
          }),
    ]);
    return Response.json({ configured: true, table: mapping.table, columns: displayCols, page, pageSize, total, rows });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Data fetch failed", 500);
  }
}
