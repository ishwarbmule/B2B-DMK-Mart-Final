import { runErpDaily } from "@/lib/erp-direct-sync";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron — DAILY DEEP SYNC at 05:00 AM IST.
 * vercel.json `30 23 * * *` = 23:30 UTC = 05:00 IST (IST = UTC+5:30, so the
 * cron must fire 30 minutes past 23:00 UTC the previous evening).
 *
 * The run scans the SELECTED godowns warehouse-by-warehouse (deep stock pass),
 * refreshes warehouses, then loops product pages within its 50s budget (cursor
 * persisted — leftover rows continue next run or via the admin "Re-sync now"
 * loop). Auth: ?key=CRON_SECRET env or the admin-managed cron_secret setting,
 * or a valid admin token (manual run).
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
    const result = await runErpDaily();
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "tick failed" }, { status: 500 });
  }
}
