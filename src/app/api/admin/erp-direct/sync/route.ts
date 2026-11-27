import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { fullResyncChunk, loadWhNeonMap, runErpTick, syncStockDeep } from "@/lib/erp-direct-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { action: "resync" | "update-info" | "tick" | "deep-stock", pageSize?, whId? }
 *   resync      — one FULL-PULL chunk (warehouses + stock + next product page, cursor
 *                 persisted). The admin UI loops calls until products.done — a big
 *                 catalog never hits the serverless timeout (the 504 lesson).
 *   update-info — "Update information" chunk: same pull but product pages only
 *                 REFRESH what the panel already lists (prices, MRP, names, brands,
 *                 categories, stock); brand-new SKUs are counted, not added —
 *                 "Update Products" / "Sync now" remains the only way to grow the
 *                 catalog. Warehouses + stock still refresh so quantities stay true.
 *   deep-stock  — DEEP per-warehouse stock scan: each SELECTED godown is scanned
 *                 one at a time (scoped ERP read + diff + stale cleanup), exactly
 *                 the pass the 05:00 IST cron runs daily. With `whId` (an ERP
 *                 godown id from the picker) ONLY that one warehouse is scanned —
 *                 the per-warehouse "Deep scan" button.
 *   tick        — the cron maintenance pass (interval-gated unless forced).
 */
export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; pageSize?: number; force?: boolean; stage?: "warehouses" | "stock" | "products"; whId?: string };
    const action = body.action ?? "resync";
    if (action === "tick") {
      const result = await runErpTick(body.force ?? false);
      return Response.json(result);
    }
    if (action === "deep-stock") {
      // per-warehouse deep scan: the ERP godown id translates through the
      // erp_wh_neon_map to the Neon Warehouse row the deep scan iterates
      let neonId: string | undefined;
      if (body.whId) {
        const map = await loadWhNeonMap();
        neonId = map[String(body.whId)];
        if (!neonId) return jsonError("Unknown warehouse for deep scan — save the godown selection first", 400);
      }
      const result = await syncStockDeep(neonId ? { whId: neonId } : undefined);
      return Response.json(result);
    }
    const result = await fullResyncChunk(
      Math.min(Math.max(50, body.pageSize ?? 300), 1000),
      body.stage,
      action === "update-info" ? { updateOnly: true } : undefined,
    );
    return Response.json(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Sync failed", 500);
  }
}
