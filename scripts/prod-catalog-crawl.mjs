/**
 * Page the ENTIRE ERP Product catalog via the production data browser
 * (50/page) and analyze locally:
 *  - exact "P + 6 letters + 4 digits" SKU pattern count (owner: ~2043 for Pune)
 *  - stockQuantity sanity for SKUs WITHOUT godown stock rows (phantom-stock risk)
 *  - company breakdown of pattern vs non-pattern
 * Cached to /tmp/erp-catalog.json so re-runs are free.
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const fs = await import("fs");
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 200)}`);
  return d;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

const CACHE = "/tmp/erp-catalog.json";
let rows = null;
try { rows = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch {}
if (Array.isArray(rows) && rows.length) {
  console.log(`(cached) catalog rows: ${rows.length}`);
} else {
  rows = [];
  const first = await jf("/api/admin/erp-direct/data?entity=products&page=1", { headers: H });
  console.log("columns:", first.columns.join(", "));
  console.log("total:", first.total);
  rows.push(...(first.rows || []));
  for (let page = 2; page * 50 < first.total + 50; page++) {
    let d;
    for (let a = 1; a <= 3; a++) {
      try { d = await jf(`/api/admin/erp-direct/data?entity=products&page=${page}`, { headers: H }); break; }
      catch (e) { if (a === 3) throw e; await sleep(2000 * a); }
    }
    rows.push(...(d.rows || []));
    if (!(d.rows || []).length) break;
    if (page % 10 === 0) process.stdout.write(`  ${rows.length}/${first.total}\n`);
  }
  fs.writeFileSync(CACHE, JSON.stringify(rows));
}

console.log(`\ncatalog rows fetched: ${rows.length}`);
const EXACT = /^P[A-Za-z]{6}\d{4}$/;
const skuOf = (r) => String(r.sku ?? "");
const pattern = rows.filter((r) => EXACT.test(skuOf(r)));
console.log(`EXACT P+6letters+4digits: ${pattern.length}`);

// godown stock cache for cross-check
let stock = [];
try { stock = JSON.parse(fs.readFileSync("/tmp/stock-rows.json", "utf8")); } catch {}
const stockedSkus = new Set(stock.map((s) => String(s.productId ?? "")));
console.log(`godown stock rows: ${stock.length} (distinct SKUs ${stockedSkus.size})`);

// pattern SKUs: stocked vs catalog-only
const patStocked = pattern.filter((r) => stockedSkus.has(skuOf(r)));
console.log(`pattern SKUs with godown stock rows: ${patStocked.length} → catalog-only (no stock row): ${pattern.length - patStocked.length}`);

// phantom-stock check: stockQuantity on catalog-only SKUs
const catOnly = pattern.filter((r) => !stockedSkus.has(skuOf(r)));
const withQty = catOnly.filter((r) => Number(r.stockQuantity || 0) > 0);
console.log(`catalog-only pattern SKUs with ERP stockQuantity > 0: ${withQty.length} / ${catOnly.length}`);
console.log(`  sample stockQuantity values: ${catOnly.slice(0, 12).map((r) => `${skuOf(r)}=${r.stockQuantity}`).join(", ")}`);

// non-pattern: stocked vs not
const nonPat = rows.filter((r) => !EXACT.test(skuOf(r)));
const nonPatStocked = nonPat.filter((r) => stockedSkus.has(skuOf(r)));
console.log(`\nnon-pattern SKUs: ${nonPat.length} (with godown stock rows: ${nonPatStocked.length})`);

// company breakdown of pattern products (top 12)
const byCompany = new Map();
for (const r of pattern) { const c = String(r.company || "?"); byCompany.set(c, (byCompany.get(c) || 0) + 1); }
console.log(`\npattern products by company (top 12): ${[...byCompany.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, n]) => `${c}=${n}`).join(", ")}`);

// active split for pattern
const patActive = pattern.filter((r) => r.isActive === true || r.isActive === 1 || r.isActive === "1");
console.log(`pattern active: ${patActive.length} / ${pattern.length}`);

// sample of catalog-only pattern SKUs
console.log(`\nsample catalog-only pattern SKUs: ${catOnly.slice(0, 10).map(skuOf).join(", ")}`);
