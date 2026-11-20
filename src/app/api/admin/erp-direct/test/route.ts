import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { testErpConnection } from "@/lib/erp-mysql";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET — ERP MySQL connectivity probe (SELECT VERSION() + table count).
 *  Used by the admin ERP Data module "Test Connection" button. Never throws:
 *  connection problems come back as { connected: false, error }. */
export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const status = await testErpConnection();
    return Response.json(status);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "ERP connection test failed", 502);
  }
}
