/**
 * /api/admin/erp-direct/apply — the "Update Products" button.
 * POST { ids: string[], groups: Record<string, boolean> }
 *   → stage 1 (fast): save the ticked godowns + product details, flip warehouse
 *     visibility. Unticked warehouses hide (active=false, stock rows removed);
 *     re-ticked ones show again.
 * POST { action: "finalize" }
 *   → stage 2 (after the pull loop completes): reconcile every ERP-sourced
 *     warehouse's visibility and list products stocked in shown warehouses
 *     only. Never touches the source system (strictly read-only).
 */
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { applySyncSelection, finalizeSyncSelection } from "@/lib/erp-direct-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      ids?: unknown;
      groups?: Record<string, boolean>;
    };
    if (body.action === "finalize") {
      const result = await finalizeSyncSelection();
      return Response.json({ ok: true, ...result });
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : undefined;
    if (!ids && !body.groups) return jsonError("Nothing to update — tick warehouses or product details first");
    const result = await applySyncSelection({ ids, groups: body.groups });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Update failed", 400);
  }
}
