import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { fullResyncChunk, runErpTick } from "@/lib/erp-direct-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { action: "resync" | "tick", pageSize? }
 *   resync — one FULL-PULL chunk (warehouses + stock + next product page, cursor
 *            persisted). The admin UI loops calls until products.done — a big
 *            catalog never hits the serverless timeout (the 504 lesson).
 *   tick   — the cron maintenance pass (interval-gated unless forced).
 */
export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; pageSize?: number; force?: boolean };
    const action = body.action ?? "resync";
    if (action === "tick") {
      const result = await runErpTick(body.force ?? false);
      return Response.json(result);
    }
    const result = await fullResyncChunk(Math.min(Math.max(50, body.pageSize ?? 300), 1000));
    return Response.json(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Sync failed", 500);
  }
}
