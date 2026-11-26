const BASE = "https://b2b-dmk-mart.vercel.app";
const login = await fetch(BASE + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) }).then(r => r.json());
const H = { "content-type": "application/json", authorization: `Bearer ${login.token}` };
const whs = (await fetch(BASE + "/api/admin/warehouses", { headers: H }).then(r => r.json())).warehouses;
for (const wh of whs) {
  const res = await fetch(BASE + "/api/admin/brochure/generate", { method: "POST", headers: H, body: JSON.stringify({ warehouseId: wh.id, companies: [], includeOutOfStock: true, showPrices: true, tier: "dealer", maxProducts: "all" }) });
  const meta = res.headers.get("x-brochure-meta");
  const info = meta ? JSON.parse(Buffer.from(meta.replace(/-/g, "+").replace(/_/g, "/"), "base64url").toString()) : null;
  console.log(`${wh.name}: HTTP ${res.status} · count=${info?.count ?? "?"} · ${info?.shareUrl ? "hosted" : "binary"} · meta=${info?.filename ?? "-"}`);
}
