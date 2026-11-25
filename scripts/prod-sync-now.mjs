/**
 * Triggers the full "Sync now" loop on production (read-only toward ERP):
 * resync chunks until products.done, then finalize visibility.
 * Sync scope = the saved selection (Kolhar + DMK MART PUNE godown row IDs only).
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 200)}`);
  return d;
};

const login = await jf("/api/admin/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }),
});
const H = { authorization: `Bearer ${login.token}` };

const src = await jf("/api/admin/erp-direct/sources", { headers: H });
console.log("selection:", src.selectedIds, "→", (src.warehouses || []).map((w) => `${w.name}=${w.products} (ERP)`).join(", "));

let created = 0, updated = 0, newSkipped = 0, stockRows = 0, whChecked = 0, pages = 0;
for (let i = 0; i < 30; i++) {
  const r = await jf("/api/admin/erp-direct/sync", { method: "POST", body: JSON.stringify({ action: "resync" }), headers: H });
  pages++;
  if (r.warehouses) whChecked = Math.max(whChecked, (r.warehouses.created || 0) + (r.warehouses.updated || 0));
  if (r.stock) stockRows = Math.max(stockRows, r.stock.stocksUpserted || 0);
  if (r.products) {
    created += r.products.created || 0;
    updated += r.products.updated || 0;
    newSkipped += r.products.newSkipped || 0;
    const p = r.products;
    console.log(`page ${pages}: seen=${p.seen} new=${p.created} updated=${p.updated} done=${p.done} err=${(p.errors || []).length}`);
    if (p.done) break;
  } else break;
}
const f = await jf("/api/admin/erp-direct/apply", { method: "POST", body: JSON.stringify({ action: "finalize" }), headers: H });
console.log(`finalize: shownWh=${f.shownWarehouses} hiddenWh=${f.hiddenWarehouses} shownProducts=${f.shownProducts} hiddenProducts=${f.hiddenProducts}`);
console.log(`totals: pages=${pages} created=${created} updated=${updated} stockRows≈${stockRows}`);
