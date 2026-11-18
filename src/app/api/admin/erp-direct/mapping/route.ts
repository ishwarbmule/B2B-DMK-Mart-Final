import { requireAdmin, jsonError } from "@/lib/admin-auth";
import {
  getProductsMapping, getWarehousesMapping, getStockMapping,
  saveProductsMapping, saveWarehousesMapping, saveStockMapping,
  autoDetectMapping,
  type ProductMapping, type WarehouseMapping, type StockMapping,
} from "@/lib/erp-direct-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Entity = "products" | "warehouses" | "stock";

/** GET ?entity=[products|warehouses|stock][&suggestTable=] — current mapping + an
 *  auto-detected suggestion for a picked table (the admin then ticks/overrides). */
export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const url = new URL(req.url);
  const entity = (url.searchParams.get("entity") ?? "products") as Entity;
  const suggestTable = url.searchParams.get("suggestTable") ?? "";
  try {
    let current: ProductMapping | WarehouseMapping | StockMapping | null = null;
    if (entity === "products") current = await getProductsMapping();
    else if (entity === "warehouses") current = await getWarehousesMapping();
    else current = await getStockMapping();
    const suggestion = suggestTable ? await autoDetectMapping(entity, suggestTable) : null;
    return Response.json({ entity, current, suggestion });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Mapping read failed", 500);
  }
}

/** POST — save the mapping (entity + config JSON). This IS the tick save. */
export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = (await req.json()) as { entity: Entity; mapping: Record<string, unknown> };
    const entity = body.entity;
    if (!body.mapping || typeof body.mapping !== "object") return jsonError("mapping required");
    if (entity === "products") await saveProductsMapping(body.mapping as never);
    else if (entity === "warehouses") await saveWarehousesMapping(body.mapping as never);
    else if (entity === "stock") await saveStockMapping(body.mapping as never);
    else return jsonError("unknown entity");
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Mapping save failed", 400);
  }
}
