/**
 * PATTERN SKU → GODOWN mapping (post-deploy run).
 * The stock browser now resolves productId/warehouseId → SKU/godown code for
 * EVERY godown (scoped:false). Page all ERP stock rows and tally the owner's
 * "P + 6 letters + 4 digits" pattern per godown.
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
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

// sanity: stock browser must now show SKU-shaped values
const first = await jf("/api/admin/erp-direct/data?entity=stock&page=1", { headers: H });
console.log("stock columns:", first.columns.join(", "));
const skuKey = "productId"; // the JOIN aliases Product.sku under the skuCol name
const whKey = first.columns.find((c) => /warehouse/i.test(c)) || "warehouseId";
const qtyKey = first.columns.find((c) => /quantity|qty/i.test(c)) || "quantity";
console.log(`keys → sku=${skuKey} wh=${whKey} qty=${qtyKey}`);
console.log("sample row:", JSON.stringify((first.rows || [])[0]));
const skuShaped = (first.rows || []).every((r) => !/^[0-9a-f]{8,}|^c[a-z0-9]{20,}/i.test(String(r[skuKey] || "x")));
if (!skuShaped) console.log("!! stock rows still show raw ids — deploy not live yet");

// page everything (cached to /tmp so re-runs don't re-hit the API)
const rows = [];
const CACHE = "/tmp/stock-rows.json";
let cached = null;
try { cached = JSON.parse(await import("fs").then((f) => f.readFileSync(CACHE, "utf8"))); } catch {}
if (Array.isArray(cached) && cached.length) {
  rows.push(...cached);
  console.log(`(cached) ERP stock rows: ${rows.length}`);
} else {
for (let page = 1; ; page++) {
  let d;
  for (let a = 1; a <= 3; a++) {
    try { d = await jf(`/api/admin/erp-direct/data?entity=stock&page=${page}`, { headers: H }); break; }
    catch (e) { if (a === 3) throw e; await sleep(1500 * a); }
  }
  rows.push(...(d.rows || []));
  if (page * 50 >= (d.total || 0) || !(d.rows || []).length) break;
  if (page % 10 === 0) process.stdout.write(`  ${rows.length}/${d.total}…\n`);
}
(await import("fs")).writeFileSync(CACHE, JSON.stringify(rows));
}
console.log(`ERP stock rows paged: ${rows.length}`);

// godown code → readable label
const WH_LABEL = {
  "WH-MAIN": "KOLHAR WARE HOUSE / Main Warehouse (code shared)",
  PDMKMAIN01: "DMK MART PUNE",
  "DMKT-MH-413710": "DMK TRADERS AND SONS",
  DMK1: "DMK TRADERS-1",
};

function tally(re, label) {
  const byWh = new Map(); // code → {rows, withQty, skus:Set, companies:Map}
  for (const r of rows) {
    const sku = String(r[skuKey] ?? "");
    if (!re.test(sku)) continue;
    const code = String(r[whKey] ?? "?");
    if (!byWh.has(code)) byWh.set(code, { rows: 0, withQty: 0, skus: new Set(), companies: new Map() });
    const t = byWh.get(code);
    t.rows++;
    if (Number(r[qtyKey] || 0) > 0) t.withQty++;
    t.skus.add(sku);
  }
  console.log(`\n===== ${label} =====`);
  if (!byWh.size) console.log("  NO godown holds any matching SKU");
  for (const [code, t] of [...byWh.entries()].sort((a, b) => b[1].rows - a[1].rows)) {
    console.log(`  ${WH_LABEL[code] || code}: stockRows=${t.rows} (qty>0: ${t.withQty}) distinct SKUs=${t.skus.size}`);
    console.log(`    sample: ${[...t.skus].slice(0, 8).join(", ")}`);
  }
  return byWh;
}

tally(/^P[A-Za-z]{6}\d{4}$/, "EXACT: P + 6 letters + 4 digits");
tally(/^P[A-Za-z]{5,7}\d{3,5}$/, "RELAXED: P + 5-7 letters + 3-5 digits");
tally(/^[A-Za-z]{6}\d{4}$/, "REFERENCE: 6 letters + 4 digits (any first letter)");

// per-godown totals for context
const all = new Map();
for (const r of rows) {
  const code = String(r[whKey] ?? "?");
  all.set(code, (all.get(code) || 0) + 1);
}
console.log("\nper-godown ALL stock rows:", [...all.entries()].map(([c, n]) => `${WH_LABEL[c] || c}=${n}`).join(" | "));

// ERP catalog search for a few pattern prefixes (products browser, LIKE on sku)
console.log("\nERP catalog presence of pattern SKUs:");
for (const q of ["PSTEELK", "PDEEPA", "PGOLDX", "PSUNRIS"]) {
  let d;
  try { d = await jf(`/api/admin/erp-direct/data?entity=products&q=${encodeURIComponent(q)}&page=1`, { headers: H }); }
  catch (e) { console.log(`  "${q}": search failed (${String(e).slice(0, 80)})`); continue; }
  console.log(`  "${q}": ${d.total} catalog rows, sample: ${(d.rows || []).slice(0, 3).map((r) => r.sku).join(", ")}`);
}
console.log("\nDONE");
