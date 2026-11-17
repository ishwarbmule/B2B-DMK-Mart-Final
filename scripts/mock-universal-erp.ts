/**
 * Mock of the DMK ERP Universal Inventory API (dmkmarterp.in) — local integration
 * test only. Serves the exact v1 contract: X-API-Key auth, /health → UP,
 * /products?limit&offset[&since] → { ok, data: { products, hasMore, total } }.
 *
 * Run:  bun scripts/mock-universal-erp.ts   (port 3040)
 */
import { createHmac } from "crypto";

const API_KEY = "test-api-key-12345";
const PUSH_SECRET = "test-push-secret-67890";

const PRODUCTS = Array.from({ length: 14 }, (_, i) => ({
  sku: `MOCK-SKU-${String(i + 1).padStart(3, "0")}`,
  name: `Mock Product ${i + 1} — Wholesale Unit`,
  isActive: i % 5 !== 4, // every 5th inactive
  updatedAt: new Date(Date.now() - i * 3600_000).toISOString(),
  pricing: { mrp: 100 + i * 10, costPrice: 60 + i * 5, deliveryRate: 90 + i * 9 },
  stock: { availableStock: 40 + i },
}));

const server = Bun.serve({
  port: 3040,
  async fetch(req) {
    const url = new URL(req.url);
    const key = req.headers.get("x-api-key") || "";
    if (key !== API_KEY) return new Response(JSON.stringify({ ok: false, error: "bad api key" }), { status: 401 });

    if (url.pathname === "/api/universal/v1/health") {
      return Response.json({ status: "UP", service: "mock-universal-erp" });
    }

    if (url.pathname === "/api/universal/v1/products") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 200);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const since = url.searchParams.get("since");
      let list = PRODUCTS;
      if (since) {
        const t = new Date(since).getTime();
        if (!Number.isNaN(t)) list = list.filter((p) => new Date(p.updatedAt).getTime() > t);
      }
      const page = list.slice(offset, offset + limit);
      return Response.json({
        ok: true,
        data: { products: page, hasMore: offset + limit < list.length, total: list.length },
      });
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`mock universal ERP on http://localhost:${server.port} · api key: ${API_KEY} · push secret: ${PUSH_SECRET} · products: ${PRODUCTS.length}`);
export { PUSH_SECRET };
