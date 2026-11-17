/**
 * Mock of the DMK ERP Universal Inventory API (dmkmarterp.in) — local integration
 * test only. Serves the exact v1 contract: X-API-Key auth, /health → UP,
 * /products?limit&offset[&since] → { ok, data: { products, hasMore, total } },
 * /warehouses → { ok, data: { warehouses } },
 * /warehouse-stock?limit&offset → { ok, data: { rows, total, hasMore } }.
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

const WAREHOUSES = [
  { code: "WH-PUNE", name: "Pune Main Godown", city: "Pune", address: "MIDC Bhosari, Pune 411026", phone: "9822012345", isActive: true },
  { code: "WH-NAGPUR", name: "Nagpur Godown", city: "Nagpur", address: "Kamptee Road, Nagpur 440001", phone: "9822012346", isActive: true },
  { code: "WH-SOLAPUR", name: "Solapur Godown", city: "Solapur", address: "Solapur MIDC 413255", phone: "9822012347", isActive: false },
];

// deterministic per-sku hash — stable across restarts so qty diffs stay meaningful
function skuHash(sku: string): number {
  let h = 0;
  for (let i = 0; i < sku.length; i++) h = (h + sku.charCodeAt(i) * (i + 1)) % 100000;
  return h;
}

// every sku × the two active godowns, plus a few rows for the inactive WH-SOLAPUR (so the
// admin UI sees it exists but inactive); one specific sku sits at qty 0 on WH-NAGPUR
const STOCK_ROWS = [
  ...WAREHOUSES.filter((w) => w.isActive).flatMap((w) => {
    const whIndex = WAREHOUSES.indexOf(w);
    return PRODUCTS.map((p, i) => ({
      warehouseCode: w.code,
      sku: p.sku,
      qty: w.code === "WH-NAGPUR" && i === 2 ? 0 : (skuHash(p.sku) + whIndex * 37) % 260,
    }));
  }),
  ...PRODUCTS.slice(0, 3).map((p) => ({ warehouseCode: "WH-SOLAPUR", sku: p.sku, qty: (skuHash(p.sku) + 2 * 37) % 260 })),
];

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

    if (url.pathname === "/api/universal/v1/warehouses") {
      return Response.json({ ok: true, data: { warehouses: WAREHOUSES } });
    }

    if (url.pathname === "/api/universal/v1/warehouse-stock") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 200);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const page = STOCK_ROWS.slice(offset, offset + limit);
      return Response.json({
        ok: true,
        data: { rows: page, total: STOCK_ROWS.length, hasMore: offset + limit < STOCK_ROWS.length },
      });
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`mock universal ERP on http://localhost:${server.port} · api key: ${API_KEY} · push secret: ${PUSH_SECRET} · products: ${PRODUCTS.length} · warehouses: ${WAREHOUSES.length} · stock rows: ${STOCK_ROWS.length}`);
export { PUSH_SECRET };
