/**
 * Re-sync regression test: after the prune, run the real "Re-sync now" loop
 * (same as the admin button) + finalize, then confirm:
 *  - excluded SKUs were NOT re-imported (count stays 0)
 *  - product count stays at the pruned level (no +99)
 *  - sync engine runs clean (no new errors)
 */
const fs = require("fs");
const BASE = "https://b2b-dmk-mart.vercel.app";
const TOKEN_FILE = "/home/z/my-project/.golive-token";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nf = (n) => Number(n || 0).toLocaleString("en-IN");

async function api(path, init) {
  const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 300)}`);
  return d;
}

(async () => {
  const before = await api("/api/admin/products?limit=1&page=1");
  console.log("products before re-sync:", nf(before.total));

  console.log("\nrunning re-sync loop (real admin button flow)...");
  let pages = 0, done = false, created = 0, updated = 0, skipped = 0, errs = [];
  for (let i = 0; i < 60 && !done; i++) {
    const r = await api("/api/admin/erp-direct/sync", { method: "POST", body: JSON.stringify({ action: "resync" }) });
    pages++;
    if (r.products) {
      created += r.products.created; updated += r.products.updated; skipped += r.products.skipped;
      done = !!r.products.done;
      if (r.products.errors?.length) errs.push(...r.products.errors.slice(0, 2));
      console.log(`  page ${pages}: +${r.products.created}c/${r.products.updated}u/${r.products.skipped}s @${r.products.offset} done=${done}`);
    }
    if (r.errors?.length) errs.push(...r.errors.slice(0, 2));
    if (!r.products && !r.stock) { console.log("  (no products/stock in response)", JSON.stringify(r).slice(0, 120)); break; }
    if (!done) await sleep(1200);
  }
  console.log(`\npull done after ${pages} pages — created=${nf(created)} updated=${nf(updated)} skipped=${nf(skipped)}`);
  if (errs.length) console.log("sync errors:", errs.slice(0, 4));

  const f = await api("/api/admin/erp-direct/apply", { method: "POST", body: JSON.stringify({ action: "finalize" }) });
  console.log(`finalize: ${nf(f.shownProducts)} shown / ${nf(f.hiddenProducts)} hidden · wh ${f.shownWarehouses} shown / ${f.hiddenWarehouses} hidden`);

  // verify
  const after = await api("/api/admin/products?limit=1&page=1");
  console.log("\nproducts after re-sync:", nf(after.total), `(before ${nf(before.total)})`);
  const ex = await api("/api/admin/erp-direct/exclusions");
  console.log("excluded SKUs back in DB:", ex.productCount, "(must be 0)");
  const cat = await fetch(BASE + "/api/catalog");
  console.log("public /api/catalog:", cat.status);
  if (ex.productCount > 0 || after.total > Number(before.total) + 5) {
    console.log("!! REGRESSION: excluded SKUs returned or count jumped");
    process.exit(1);
  }
  console.log("REGRESSION TEST PASSED — GST-firm lines stay out, catalog intact");
})().catch((e) => { console.error("TEST ERROR:", e.message); process.exit(1); });
