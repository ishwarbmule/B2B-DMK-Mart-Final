/**
 * Production audit — warehouse selection & per-godown product counts.
 * Read-only: login + GET endpoints only.
 */
const BASE = "https://b2b-dmk-mart.vercel.app";

async function jf(url, opts = {}) {
  const res = await fetch(BASE + url, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 400); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const login = await jf("/api/admin/login", {
  method: "POST",
  body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }),
});
const T = login.token || login.accessToken;
if (!T) throw new Error("no token: " + JSON.stringify(login).slice(0, 200));
const H = { authorization: `Bearer ${T}` };

console.log("=== 1. erp-direct/sources (godowns + selection state) ===");
const sources = await jf("/api/admin/erp-direct/sources", { headers: H });
console.log(JSON.stringify({
  configured: sources.configured,
  connected: sources.connected,
  selectedIds: sources.selectedIds,
  hasSelection: sources.hasSelection,
}, null, 1));
console.log("warehouses (neon):", JSON.stringify(sources.warehouses, null, 1));
console.log("groups:", (sources.groups || []).map((g) => `${g.id}=${g.ticked}${g.locked ? " locked" : ""}`).join(", "));

console.log("\n=== 2. erp-direct/selection ===");
const sel = await jf("/api/admin/erp-direct/selection", { headers: H });
console.log(JSON.stringify(sel, null, 1).slice(0, 3000));

console.log("\n=== 3. erp-direct/preview (synced counts) ===");
const pv = await jf("/api/admin/erp-direct/preview", { headers: H });
console.log(JSON.stringify(pv.counts, null, 1));
console.log("warehouses:", JSON.stringify(pv.warehouses, null, 1));

console.log("\n=== 4. crud/warehouses (neon list) ===");
const wh = await jf("/api/admin/crud/warehouses", { headers: H });
const list = Array.isArray(wh) ? wh : wh.items || wh.data || [];
for (const w of list) {
  console.log(`- ${w.name} | city=${w.city || "-"} | code=${w.code || "-"} | source=${w.source || "-"} | active=${w.active} | isDefault=${w.isDefault} | id=${w.id}`);
}

console.log("\n=== 5. admin products status counts ===");
for (const status of ["active", "inactive", ""]) {
  const p = await jf(`/api/admin/products?status=${encodeURIComponent(status)}&pageSize=1`, { headers: H });
  const total = p.total ?? p.pagination?.total ?? (Array.isArray(p.items) ? p.items.length : "?");
  console.log(`status="${status}" → total ${total}`);
}

console.log("\n=== 6. per-warehouse product counts via brochure meta ===");
const bm = await jf("/api/admin/brochure/generate", { headers: H });
for (const w of bm.warehouses || []) {
  console.log(`- ${w.name} (${w.city || "-"}) skus=${w.skus} id=${w.id}`);
}
