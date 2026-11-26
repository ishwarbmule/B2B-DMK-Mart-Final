/**
 * "P + 6-letter company + 4 digits" SKU pattern — WHICH godown holds those products?
 *
 * Method (all reads, production only):
 *  1. Pull EVERY Neon product (sku + erpId + company) via /api/admin/products.
 *  2. Page through the ENTIRE ERP WarehouseStock table via the admin data browser
 *     (all 5 godowns, selected or not): productId + warehouseId + quantity.
 *  3. Join productId ↔ Product.erpId → sku → regex-match the owner's pattern.
 *  4. Tally matched SKUs per ERP godown (rows and quantity>0 rows) + SKUs with
 *     NO stock row anywhere.
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

// ── 1. every Neon product: sku, erpId, company, name, active ──
console.log("pulling Neon products…");
const products = [];
for (let page = 1; ; page++) {
  const p = await jf(`/api/admin/products?status=&page=${page}&limit=100`, { headers: H });
  const rows = p.rows || [];
  products.push(...rows.map((r) => ({ sku: r.sku, erpId: r.erpId || "", company: r.company || "", name: r.name || "", active: r.active })));
  if (page >= (p.pages || 1) || !rows.length) break;
  if (page % 10 === 0) process.stdout.write(`  ${products.length}…\n`);
}
console.log(`Neon products: ${products.length}`);

// ── 2. every ERP stock row (all godowns) ──
console.log("pulling ERP stock rows…");
const stockRows = [];
for (let page = 1; ; page++) {
  let d;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { d = await jf(`/api/admin/erp-direct/data?entity=stock&page=${page}`, { headers: H }); break; }
    catch (e) { if (attempt === 3) throw e; await sleep(1500 * attempt); }
  }
  stockRows.push(...(d.rows || []).map((r) => ({ pid: r.productId, wh: r.warehouseId, qty: Number(r.quantity || 0) })));
  if (page * 50 >= (d.total || 0) || !(d.rows || []).length) break;
  if (page % 10 === 0) process.stdout.write(`  ${stockRows.length}/${d.total}…\n`);
}
console.log(`ERP stock rows: ${stockRows.length}`);

// ── 3. ERP godown ids → names (from the selection endpoint = Neon mirror; codes from selection output) ──
const sel = await jf("/api/admin/erp-direct/selection", { headers: H });
const whName = {};
for (const w of sel.warehouses || []) whName[w.id] = w.name || w.code;
const known = {
  cmudwqdr900o8lx4soq8vl561: "KOLHAR WARE HOUSE (WH-MAIN)",
  cmwi87vk9001a3noxycid64gg: "DMK MART PUNE (PDMKMAIN01)",
  cmwoih5mr0001l807j9ell6cn: "DMK TRADERS AND SONS",
  cmwoih3w20000l807aoigrt06: "DMK TRADERS-1",
  cmwoih93m0003l807xup9c724: "PUNE DMK MART MAIN",
};
for (const [k, v] of Object.entries(known)) whName[k] = whName[k] || v;

// ── 4. join + pattern match ──
const skuByErp = new Map(products.filter((p) => p.erpId).map((p) => [p.erpId, p]));
const EXACT = /^P[A-Za-z]{6}\d{4}$/;
const RELAX = /^P[A-Za-z]{5,7}\d{3,5}$/;

function tally(re, label) {
  const byWh = new Map(); // wh → {rows, withQty, skus:Set}
  const noWh = [];
  const seenSku = new Map(); // sku → [{wh, qty}]
  for (const r of stockRows) {
    const p = skuByErp.get(r.pid);
    if (!p || !re.test(p.sku)) continue;
    if (!byWh.has(r.wh)) byWh.set(r.wh, { rows: 0, withQty: 0, skus: new Set() });
    const t = byWh.get(r.wh);
    t.rows++; if (r.qty > 0) t.withQty++;
    t.skus.add(p.sku);
    if (!seenSku.has(p.sku)) seenSku.set(p.sku, []);
    seenSku.get(p.sku).push({ wh: whName[r.wh] || r.wh, qty: r.qty, company: p.company });
  }
  const matched = seenSku.size;
  const matchedProducts = products.filter((p) => re.test(p.sku));
  const untouched = matchedProducts.filter((p) => !seenSku.has(p.sku));
  console.log(`\n===== ${label} (${re.source}) =====`);
  console.log(`Neon products matching: ${matchedProducts.length} | of those WITH ERP stock rows: ${matched} | with NO stock row anywhere: ${untouched.length}`);
  for (const [wh, t] of [...byWh.entries()].sort((a, b) => b[1].rows - a[1].rows)) {
    console.log(`  ${whName[wh] || wh}: rows=${t.rows} (qty>0: ${t.withQty}) distinct SKUs=${t.skus.size}`);
  }
  if (untouched.length) console.log(`  sample NO-stock-row SKUs: ${untouched.slice(0, 10).map((p) => `${p.sku}[${p.company}]`).join(", ")}`);
  const companies = new Map();
  for (const p of matchedProducts) companies.set(p.company || "(none)", (companies.get(p.company || "(none)") || 0) + 1);
  console.log(`  companies: ${[...companies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, n]) => `${c}=${n}`).join(", ")}`);
  console.log(`  sample SKUs: ${matchedProducts.slice(0, 12).map((p) => p.sku).join(", ")}`);
  return { matched, untouched };
}

const exact = tally(EXACT, "EXACT  P + 6 letters + 4 digits");
const relax = tally(RELAX, "RELAXED  P + 5-7 letters + 3-5 digits");

// also: near-miss without the P (6 letters + 4 digits) in case the owner's P is approximate
tally(/^[A-Za-z]{6}\d{4}$/, "REFERENCE  6 letters + 4 digits (any first letter)");

console.log("\nDONE");
