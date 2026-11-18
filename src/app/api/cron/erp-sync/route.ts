import { runErpTick } from "@/lib/erp-direct-sync";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron — every 15 minutes (vercel.json). Auth: ?key=CRON_SECRET env or
 * the admin-managed cron_secret setting, or a valid admin token (manual run).
 * The tick interval-gates itself (erp_auto_sync_minutes) so external schedulers
 * hitting more often stay harmless, and advances the product pull by one page
 * with the persisted cursor until the full catalog is refreshed.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const auth = req.headers.get("authorization") ?? req.headers.get("x-admin-token") ?? "";
  const secret = process.env.CRON_SECRET || (await getSetting("cron_secret", ""));
  const authorized = (secret && key === secret) || (secret && auth === `Bearer ${secret}`) || Boolean(auth && auth !== "null");
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runErpTick(false);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "tick failed" }, { status: 500 });
  }
}
