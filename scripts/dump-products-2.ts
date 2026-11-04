/**
 * Pull ALL products (sku/name/categories/stock) from the production admin API.
 * Output: scripts/db-products-dump-2.json { products, warehouses }
 */
import fs from "fs";

const BASE = process.env.PROD_BASE || "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "DmkMartB2B!2026";
const OUT = "/home/z/my-project/scripts/db-products-dump-2.json";

let TOKEN = "";
async function api(p: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    signal: AbortSignal.timeout(120_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401 && !String(p).includes("login")) throw new Error(`401 on ${p}`);
  return { status: res.status, body };
}

async function main() {
  const r = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
  TOKEN = r.body?.token;
  if (!TOKEN) throw new Error(`login failed: ${JSON.stringify(r.body).slice(0, 200)}`);
  console.log("✓ logged in");

  const products: Array<{ sku: string; name: string; active: boolean; stock: number; top: string; mid: string; end: string; brand: string }> = [];
  let page = 1, pages = 1;
  do {
    const d = await api(`/api/admin/products?limit=100&page=${page}&all=1`);
    const rows = d.body?.rows ?? [];
    pages = d.body?.pages ?? 1;
    for (const x of rows) {
      products.push({
        sku: String(x.sku), name: String(x.name), active: !!x.active, stock: Number(x.stock ?? 0),
        top: String(x.top?.name ?? ""), mid: String(x.mid?.name ?? ""), end: String(x.end?.name ?? ""),
        brand: String(x.brand?.name ?? ""),
      });
    }
    if (page % 5 === 0) console.log(`  page ${page}/${pages} (total ${products.length})`);
    page++;
  } while (page <= pages);

  const wd = await api("/api/admin/crud/warehouses");
  const warehouses = (wd.body?.rows ?? []).map((w: Record<string, unknown>) => ({
    id: String(w.id), name: String(w.name), city: String(w.city ?? ""), isDefault: !!w.isDefault, active: !!w.active,
    stocks: Number((w._count as { stocks?: number })?.stocks ?? 0),
  }));

  fs.writeFileSync(OUT, JSON.stringify({ products, warehouses }, null, 1));
  console.log(`products: ${products.length}`);
  for (const w of warehouses) console.log(`  wh: ${w.name} | city=${w.city} | default=${w.isDefault} | active=${w.active} | stocked=${w.stocks}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
