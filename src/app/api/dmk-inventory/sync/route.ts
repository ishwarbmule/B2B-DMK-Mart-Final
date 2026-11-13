/**
 * DMK ERP → B2B inventory webhook (Universal Inventory API v1).
 *
 * POST /api/dmk-inventory/sync
 *   Header : X-DMK-Signature: sha256=HMAC-SHA256(rawRequestBody, PUSH SECRET) — wrong/missing = rejected
 *   Payload: { type: "CATALOG_DELTA", products: [ { sku, name, isActive, updatedAt,
 *              pricing: { mrp?, costPrice?, deliveryRate? }, stock: { availableStock? } } ] }
 *   Reply  : HTTP 200 within 5 seconds — small batches are applied inline and echo
 *            their counts; large batches are ACKed immediately and applied via
 *            after() (any post-response failure is covered by the daily ?since= delta pull).
 *
 * Rules enforced by the apply layer: SKU is the unique key, costPrice stays admin-only,
 * a missing field means "not shared" and is hidden, not invented.
 */
import { NextRequest, NextResponse, after } from "next/server";
import { getUniversalConfig, verifyPushSignature, ensureMirrorTable, applyUniversalProducts } from "@/lib/erp-universal";
import { logSyncEvent } from "@/lib/erp-sync";
import { setSetting } from "@/lib/erp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INLINE_LIMIT = 10; // remote Hostinger MySQL ≈ 100ms/query — keep the inline path well under 5s

export async function GET() {
  // handshake probe (no secrets revealed)
  return NextResponse.json({ ok: true, service: "DMK B2B universal inventory sync", contract: "CATALOG_DELTA + X-DMK-Signature", time: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  let raw = "";
  try {
    raw = await req.text(); // raw body FIRST — the signature is computed over the exact bytes

    const { pushSecret } = await getUniversalConfig();
    if (!pushSecret) {
      await logSyncEvent({ direction: "WEBHOOK_IN", action: "UNIVERSAL_PUSH", status: "ERROR", message: "Push rejected — no push secret configured yet (Admin → Inventory Sync)" });
      return NextResponse.json({ ok: false, error: "push secret not configured on B2B side" }, { status: 503 });
    }

    const signature = req.headers.get("x-dmk-signature") || "";
    if (!verifyPushSignature(raw, signature, pushSecret)) {
      await logSyncEvent({ direction: "WEBHOOK_IN", action: "UNIVERSAL_PUSH", status: "ERROR", message: "Push REJECTED — bad X-DMK-Signature (HMAC mismatch)" });
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }

    const type = String(body.type ?? "CATALOG_DELTA");
    if (type !== "CATALOG_DELTA") {
      await logSyncEvent({ direction: "WEBHOOK_IN", action: "UNIVERSAL_PUSH", status: "ERROR", message: `Unsupported payload type "${type}" — expected CATALOG_DELTA` });
      return NextResponse.json({ ok: false, error: `unsupported type ${type}` }, { status: 200 }); // 200 so ERP stops retrying a bad contract
    }

    const products = body.products;
    if (!Array.isArray(products) || !products.length) {
      return NextResponse.json({ ok: false, error: "no products in payload" }, { status: 200 });
    }

    await setSetting("erp_universal_last_push_at", new Date().toISOString());

    if (products.length <= INLINE_LIMIT) {
      const result = await applyUniversalProducts(products as Record<string, unknown>[], "PUSH");
      const durationMs = Date.now() - started;
      await logSyncEvent({
        direction: "WEBHOOK_IN",
        action: "UNIVERSAL_PUSH",
        status: result.errors.length ? "PARTIAL" : "OK",
        message: `CATALOG_DELTA push: seen ${result.seen} · created ${result.created} · updated ${result.updated} · skipped ${result.skipped}${result.errors.length ? ` · errors ${result.errors.length}` : ""}`,
        seen: result.seen, created: result.created, updated: result.updated, skipped: result.skipped, durationMs,
      });
      return NextResponse.json({ ok: true, received: result.seen, created: result.created, updated: result.updated, skipped: result.skipped, durationMs });
    }

    // big batch — ACK inside the 5s budget, apply post-response
    const count = products.length;
    after(async () => {
      const t = Date.now();
      try {
        const result = await applyUniversalProducts(products as Record<string, unknown>[], "PUSH");
        await logSyncEvent({
          direction: "WEBHOOK_IN",
          action: "UNIVERSAL_PUSH",
          status: result.errors.length ? "PARTIAL" : "OK",
          message: `CATALOG_DELTA push (async ${count} items): seen ${result.seen} · created ${result.created} · updated ${result.updated} · skipped ${result.skipped}`,
          seen: result.seen, created: result.created, updated: result.updated, skipped: result.skipped, durationMs: Date.now() - t,
        });
      } catch (e) {
        await logSyncEvent({ direction: "WEBHOOK_IN", action: "UNIVERSAL_PUSH", status: "ERROR", message: `Async batch failed (${count} items) — daily delta pull will recover: ${e instanceof Error ? e.message.slice(0, 220) : String(e)}`, durationMs: Date.now() - t }).catch(() => {});
      }
    });
    await ensureMirrorTable().catch(() => {});
    return NextResponse.json({ ok: true, accepted: count, mode: "async", note: "applied post-response; daily delta pull covers any failure" });
  } catch (e) {
    await logSyncEvent({ direction: "WEBHOOK_IN", action: "UNIVERSAL_PUSH", status: "ERROR", message: e instanceof Error ? e.message.slice(0, 400) : String(e), durationMs: Date.now() - started }).catch(() => {});
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 200 }); // 200 = stop retry storms; delta pull is the safety net
  }
}
