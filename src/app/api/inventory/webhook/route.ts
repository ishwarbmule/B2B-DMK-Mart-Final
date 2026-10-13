/**
 * ERP → E-commerce inventory webhook receiver.
 * The ERP's IntegrationPortal "DMK B2B" auto-pushes products here every 30 min
 * (webhookUrl configured on the ERP side). Auth: x-api-key header or body.apiKey.
 * Always answers 200 with a JSON summary so the ERP sync stops reporting HTTP 404.
 */
import { NextRequest, NextResponse } from "next/server";
import { applyErpProducts, logSyncEvent } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";

const EXPECTED_KEY = process.env.ERP_WEBHOOK_API_KEY ?? "";

export async function GET() {
  // handshake probe
  return NextResponse.json({ ok: true, service: "DMK B2B inventory webhook", time: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const key = req.headers.get("x-api-key") || (body as Record<string, unknown>)?.apiKey || (body as Record<string, unknown>)?.token || "";
    const authed = EXPECTED_KEY && String(key) === EXPECTED_KEY;

    if (!authed) {
      await logSyncEvent({ direction: "WEBHOOK_IN", action: "PRODUCTS", status: "ERROR", message: "Unauthorized push (bad api key)" });
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const payload = (body as Record<string, unknown>)?.products
      ? body
      : ((body as Record<string, unknown>)?.data ?? body);
    const result = await applyErpProducts(payload);
    const durationMs = Date.now() - started;
    await logSyncEvent({
      direction: "WEBHOOK_IN",
      action: "PRODUCTS",
      status: result.errors.length ? "PARTIAL" : "OK",
      message: `ERP push: seen ${result.seen} · created ${result.created} · updated ${result.updated} · skipped ${result.skipped}${result.errors.length ? ` · errors ${result.errors.length}` : ""}`,
      seen: result.seen, created: result.created, updated: result.updated, skipped: result.skipped, durationMs,
    });
    return NextResponse.json({ ok: true, received: result.seen, created: result.created, updated: result.updated, skipped: result.skipped, durationMs });
  } catch (e) {
    await logSyncEvent({ direction: "WEBHOOK_IN", action: "PRODUCTS", status: "ERROR", message: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started });
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 200 }); // 200 so ERP doesn't hard-fail
  }
}
