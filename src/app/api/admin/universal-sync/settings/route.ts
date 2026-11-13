/**
 * /api/admin/universal-sync/settings — DMK Universal Inventory API config (dmkmarterp.in).
 * GET  : masked config + live health + mirror/catalog counts + which fields the ERP
 *        currently shares + sync timestamps + webhook URL (for the ERP team).
 * POST : save server URL / API key / push secret (masked value = keep existing),
 *        optionally flip the daily delta pull on/off; every save runs a live health verify.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/erp";
import { getUniversalConfig, verifyUniversalHealth, ensureMirrorTable } from "@/lib/erp-universal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function mask(v: string) { return v ? `${"•".repeat(Math.min(14, Math.max(6, v.length - 4)))}${v.slice(-4)}` : ""; }

async function webhookUrl(req: NextRequest): Promise<string> {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "b2b-dmk-mart.vercel.app";
  const proto = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}/api/dmk-inventory/sync`;
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const config = await getUniversalConfig();
    const [health, dailyEnabled, watermark, lastPushAt, lastFullAt, lastDeltaAt] = await Promise.all([
      verifyUniversalHealth(config),
      getSetting("erp_universal_daily_enabled", "true"),
      getSetting("erp_universal_watermark", ""),
      getSetting("erp_universal_last_push_at", ""),
      getSetting("erp_universal_last_full_at", ""),
      getSetting("erp_universal_last_delta_at", ""),
    ]);
    await ensureMirrorTable().catch(() => {});
    const [mirrorCount, mirrorActive, catalogErp, mrpShared, costShared, rateShared, stockShared, events] = await Promise.all([
      db.erpProductMirror.count(),
      db.erpProductMirror.count({ where: { isActive: true } }),
      db.product.count({ where: { syncSource: "ERP" } }),
      db.erpProductMirror.count({ where: { mrp: { not: null } } }),
      db.erpProductMirror.count({ where: { costPrice: { not: null } } }),
      db.erpProductMirror.count({ where: { deliveryRate: { not: null } } }),
      db.erpProductMirror.count({ where: { availableStock: { not: null } } }),
      db.syncEvent.findMany({ where: { OR: [{ action: { startsWith: "UNIVERSAL" } }, { direction: "WEBHOOK_IN" }] }, orderBy: { createdAt: "desc" }, take: 15 }),
    ]);
    return NextResponse.json({
      ok: true,
      config: { url: config.url, apiKey: mask(config.apiKey), pushSecret: mask(config.pushSecret), apiKeySet: Boolean(config.apiKey), pushSecretSet: Boolean(config.pushSecret) },
      health,
      webhookUrl: await webhookUrl(req),
      counts: { mirror: mirrorCount, mirrorActive, catalogErp, sharedFields: { mrp: mrpShared, costPrice: costShared, deliveryRate: rateShared, availableStock: stockShared } },
      schedule: { dailyEnabled: dailyEnabled === "true", watermark, lastPushAt, lastFullAt, lastDeltaAt },
      events,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Failed to load universal sync status", 500);
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as Record<string, unknown>;

    if (typeof body.erp_universal_url === "string" && body.erp_universal_url.trim()) {
      const u = body.erp_universal_url.trim().replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(u)) return jsonError("Server URL must start with http(s)://", 400);
      await setSetting("erp_universal_url", u);
    }
    for (const [, key] of [["erp_universal_api_key", "erp_universal_api_key"], ["erp_universal_push_secret", "erp_universal_push_secret"]] as const) {
      const v = body[key];
      if (typeof v !== "string") continue;
      if (!v.trim() || v.includes("•")) continue; // masked placeholder = keep existing value
      await setSetting(key, v.trim());
    }
    if (typeof body.erp_universal_daily_enabled === "boolean") {
      await setSetting("erp_universal_daily_enabled", body.erp_universal_daily_enabled ? "true" : "false");
    }

    const config = await getUniversalConfig();
    const health = await verifyUniversalHealth(config);
    return NextResponse.json({ ok: true, health, apiKeySet: Boolean(config.apiKey), pushSecretSet: Boolean(config.pushSecret) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Failed to save universal sync settings", 500);
  }
}
