/** Verify the applied category tree + warehouse list (read-only). */
const BASE = "https://b2b-dmk-mart.vercel.app";
let TOKEN = "";

async function api(p: string) {
  const res = await fetch(`${BASE}${p}`, { headers: { authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(60000) });
  return res.json();
}

async function main() {
  const login = await fetch(`${BASE}/api/admin/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginId: "B2B DMK Mart", password: "DmkMartB2B!2026" }),
  }).then((r) => r.json());
  TOKEN = login.token;

  const d = await api("/api/admin/catalog/apply-categories");
  console.log("tops:", d.tops.length);
  for (const t of d.tops) {
    const ends = t.mids.reduce((s: number, m: { products: number }) => s + m.products, 0);
    console.log(`  ${t.name}: ${t.products} prods, ${t.mids.length} mids (sum ${ends})`);
  }
  const wh = await api("/api/admin/crud/warehouses");
  console.log("warehouses:", (wh.rows ?? []).map((w: { name: string; isDefault: boolean }) => `${w.name}${w.isDefault ? "*" : ""}`).join(" | "));
}

main().catch((e) => { console.error(e); process.exit(1); });
