/**
 * /api/admin/erp-direct/sources — the guided Data Sync flow's single loader.
 * GET → {
 *   configured, connected, error?,          // generic error only — no host/db/version/tables
 *   warehouses: [{ id, name, city, active, products }],  // ONLY non-GST-firm godowns;
 *                                                        // never firm names, tax wording,
 *                                                        // codes, table or column names
 *   hasSelection, selectedIds,              // ERP godown row IDs currently synced
 *   groups: [{ id, label, ticked, locked? }],            // friendly product-detail ticks
 * }
 * Read-only toward the source system; everything else is the site's own database.
 */
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import {
  ensureSyncMappings, listNonGstGodowns, getProductGroups, selectionState,
} from "@/lib/erp-direct-sync";
import { testErpConnection } from "@/lib/erp-mysql";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GENERIC_ERROR = "Could not reach the data source — check the saved credentials";

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    await ensureSyncMappings();
    const conn = await testErpConnection();
    const sel = await selectionState();
    const groups = await getProductGroups();
    let warehouses: { id: string; name: string; city: string; active: boolean; products: number }[] = [];
    if (conn.connected) {
      const godowns = await listNonGstGodowns();
      warehouses = godowns.map((g) => ({
        id: g.erpId,
        name: g.name,
        city: g.city,
        active: g.isActive,
        products: g.productCount,
      }));
    }
    return Response.json({
      configured: conn.configured,
      connected: conn.connected,
      error: conn.connected ? undefined : GENERIC_ERROR,
      hasSelection: sel.configured,
      selectedIds: sel.ids,
      groups,
      warehouses,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Load failed", 500);
  }
}
