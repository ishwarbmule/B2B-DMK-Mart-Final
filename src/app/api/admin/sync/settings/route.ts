/**
 * /api/admin/sync/settings — ERP MySQL credentials + mapping saved by the owner.
 * GET  : masked config + current mapping settings.
 * POST : save credentials (password optional = keep existing), test connection,
 *        and optionally unlock/lock ERP writes (erp_write_enabled toggle).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { getSetting, setSetting, testErpConnection, closeErpPool } from "@/lib/erp";
import { db } from "@/lib/db";
import { logSyncEvent } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";

const CONN_KEYS = ["erp_db_host", "erp_db_port", "erp_db_user", "erp_db_password", "erp_db_name"] as const;
const OTHER_KEYS = ["erp_products_table", "erp_product_aliases", "erp_image_base_url"] as const;

function mask(v: string) { return v ? "•".repeat(Math.min(18, Math.max(6, v.length))) : ""; }

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const keys = [...CONN_KEYS, ...OTHER_KEYS, "erp_write_enabled", "erp_write_unlocked_at"];
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const status = await testErpConnection().catch(() => ({ configured: false, connected: false }));
  return NextResponse.json({
    ok: true,
    config: {
      erp_db_host: map.get("erp_db_host") ?? "",
      erp_db_port: map.get("erp_db_port") ?? "3306",
      erp_db_user: map.get("erp_db_user") ?? "",
      erp_db_password: mask(map.get("erp_db_password") ?? ""),
      erp_db_name: map.get("erp_db_name") ?? "",
      erp_products_table: map.get("erp_products_table") ?? "products",
      erp_product_aliases: map.get("erp_product_aliases") ?? "{}",
      erp_image_base_url: map.get("erp_image_base_url") ?? "",
      erp_write_enabled: (map.get("erp_write_enabled") ?? "false") === "true",
      erp_write_unlocked_at: map.get("erp_write_unlocked_at") ?? "",
    },
    status,
  });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as Record<string, unknown>;

    // credentials
    for (const k of CONN_KEYS) {
      const v = body[k];
      if (typeof v !== "string") continue;
      if (k === "erp_db_password" && (!v || /^•+$/.test(v))) continue; // masked = keep existing
      await setSetting(k, k === "erp_db_port" ? String(Number(v) || 3306) : v.trim());
    }
    // mapping (validated)
    const table = typeof body.erp_products_table === "string" ? body.erp_products_table.trim() : "";
    if (table) {
      if (!/^[\w$]+$/.test(table)) return jsonError("Invalid table name — use bare letters/underscore only", 400);
      await setSetting("erp_products_table", table);
    }
    if (typeof body.erp_product_aliases === "string") {
      const parsed = JSON.parse(body.erp_product_aliases || "{}") as Record<string, unknown>;
      for (const [ck, col] of Object.entries(parsed)) {
        if (typeof col !== "string" || !/^[\w$]+$/.test(col)) return jsonError(`Invalid alias column for "${ck}"`, 400);
      }
      await setSetting("erp_product_aliases", JSON.stringify(parsed));
    }
    if (typeof body.erp_image_base_url === "string") await setSetting("erp_image_base_url", body.erp_image_base_url.trim());

    // auto-sync interval — lightweight standalone save (no ERP connection test needed)
    if (typeof body.erp_auto_sync_minutes === "string" || typeof body.erp_auto_sync_minutes === "number") {
      const n = Math.max(5, Math.min(720, parseInt(String(body.erp_auto_sync_minutes), 10) || 30));
      await setSetting("erp_auto_sync_minutes", String(n));
      return NextResponse.json({ ok: true, erp_auto_sync_minutes: n });
    }

    // ERP write lock toggle — explicit and audited
    if (typeof body.erp_write_enabled === "boolean") {
      const enabling = body.erp_write_enabled && body.confirmUnlock === "UNLOCK ERP WRITES";
      const value = enabling ? "true" : "false";
      await setSetting("erp_write_enabled", value);
      if (enabling) await setSetting("erp_write_unlocked_at", new Date().toISOString());
      await logSyncEvent({
        direction: "PUSH_ERP",
        action: "TOGGLE",
        status: "OK",
        message: enabling
          ? `ERP writes UNLOCKED by admin at ${new Date().toLocaleString("en-IN")} — push button can now update whitelisted stock/price columns`
          : "ERP writes LOCKED — ERP database is now fully read-only",
      });
    }

    await closeErpPool(); // force reconnect with fresh credentials
    const status = await testErpConnection();
    if (!status.connected) {
      return NextResponse.json({ ok: false, error: status.error ?? "Connection failed", status }, { status: 200 });
    }
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to save ERP settings", 500);
  }
}
