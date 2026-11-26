/**
 * Production "Sync now" driver — mirrors the admin UI loop exactly:
 *   POST /api/admin/erp-direct/sync { action: "resync" }   (until products.done)
 *   POST /api/admin/erp-direct/apply { action: "finalize" }
 * Then prints the verification counts (catalog size, active split, per-warehouse
 * stock rows, P-pattern coverage).
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 300)}`);
  return d;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nf = (n) => Number(n || 0).toLocaleString("en-IN");

const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

// 0. pre-flight: the new code must be live (picker shows firm-catalog counts)
const pre = await jf("/api/admin/erp-direct/sources", { headers: H });
console.log("connected:", pre.connected, "| selected ids:", (pre.selectedIds || []).length);
for (const w of pre.warehouses || []) console.log(`  picker: ${w.name} · ${w.city} · products=${nf(w.products)}`);
const pune = (pre.warehouses || []).find((w) => /PUNE/i.test(w.name));
if (!pune || pune.products <= 300) {
  console.log("\n!! new code not live yet (Pune count still stock-row-based) — aborting");
  process.exit(2);
}
console.log("\nnew code confirmed live — starting the pull loop");

// 1. pull loop
let created = 0, updated = 0, pages = 0, done = false;
for (let i = 0; i < 60; i++) {
  const r = await jf("/api/admin/erp-direct/sync", { method: "POST", headers: H, body: JSON.stringify({ action: "resync" }) });
  pages++;
  if (r.warehouses) console.log(`page ${pages}: warehouses ok`);
  if (r.stock) console.log(`  stock: ${nf(r.stock.rows)} rows read, ${nf(r.stock.stocksUpserted)} upserted, ${nf(r.stock.productsUpdated)} products updated`);
  if (r.products) {
    created += r.products.created; updated += r.products.updated;
    console.log(`  products: page@${r.products.offset} +${nf(r.products.created)} created / ${nf(r.products.updated)} updated / ${nf(r.products.skipped)} skipped — done=${r.products.done}`);
    if (r.errors?.length) console.log("  errors:", r.errors.slice(0, 3).join(" | "));
    done = !!r.products.done;
  }
  if (done) break;
  await sleep(1200);
}
console.log(`\npull loop finished after ${pages} calls — created ${nf(created)}, updated ${nf(updated)}, done=${done}`);

// 2. finalize
const f = await jf("/api/admin/erp-direct/apply", { method: "POST", headers: H, body: JSON.stringify({ action: "finalize" }) });
console.log(`finalize: ${nf(f.shownProducts)} products listed / ${nf(f.hiddenProducts)} hidden · warehouses ${f.shownWarehouses} shown / ${f.hiddenWarehouses} hidden`);

// 3. verification via the site's own preview surface
const pv = await jf("/api/admin/erp-direct/preview", { headers: H });
console.log("\n=== site catalog after sync ===");
console.log(JSON.stringify(pv.counts));
for (const w of pv.warehouses || []) console.log(`  ${w.name} (${w.city}): ${nf(w.stockRows)} stock rows, active=${w.active}`);
console.log("\nlatest synced products (top 8):");
for (const p of (pv.products || []).slice(0, 8)) console.log(`  ${p.sku} · ${String(p.name).slice(0, 40)} · stock=${p.stock} · active=${p.active}`);
console.log("\nDONE");
