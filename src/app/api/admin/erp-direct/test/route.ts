import { requireAdmin } from "@/lib/admin-auth";
import { testErpConnection } from "@/lib/erp-mysql";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET — connectivity probe for the Data Sync wizard. On success the response
 *  carries NOTHING about the source system (no host, database, version or
 *  table count) — the owner just sees "Connected". Problems surface as a
 *  generic message; detail stays in the server logs. Never throws. */
export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const status = await testErpConnection();
    return Response.json({
      configured: status.configured,
      connected: status.connected,
      ...(status.connected ? {} : { error: "Could not reach the data source — check the saved credentials" }),
    });
  } catch (e) {
    console.error("[erp-direct/test]", e); // detail in logs only
    return Response.json({ configured: true, connected: false, error: "Could not reach the data source — check the saved credentials" });
  }
}
