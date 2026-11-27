/**
 * GST-firm exclusion audit (READ-ONLY).
 * 1. login → selection/godown state
 * 2. dump all products (sku, company, active, syncSource)
 * 3. compare with the 99 SKUs from the two uploaded Excel files
 * 4. check which excluded SKUs have orders (FK constraint risk for hard delete)
 * 5. brand/company census
 */
const fs = require("fs");
const BASE = "https://b2b-dmk-mart.vercel.app";
const TOKEN_FILE = "/home/z/my-project/.golive-token";

const EXCLUDED_SKUS = JSON.parse(fs.readFileSync("/home/z/my-project/scripts/excluded-skus.json", "utf8"));
const EXCLUDED_COMPANIES = ["DMK TRADERS", "HD POLYPLAST", "PLASTIC WORLD", "STEELKING INDUSTRIES PRIVATE LIMITED"];

async function api(path, init) {
  const token = fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, "utf8").trim() : "";
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 300)}`);
  return d;
}

(async () => {
  // login if needed
  if (!fs.existsSync(TOKEN_FILE)) {
    const res = await fetch(BASE + "/api/admin/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginId: "B2B DMK Mart", password: process.env.ADMIN_PASSWORD || "1234" }),
    });
    const body = await res.json().catch(() => ({}));
    const tok = body?.token || body?.data?.token;
    if (!tok) { console.log("LOGIN FAILED:", res.status, JSON.stringify(body).slice(0, 200)); process.exit(1); }
    fs.writeFileSync(TOKEN_FILE, tok);
    console.log("logged in, token saved");
  }

  // 1. selection state
  const src = await api("/api/admin/erp-direct/sources");
  console.log("\n=== ERP sources / selection ===");
  console.log("connected:", src.connected, "| configured:", src.configured, "| selectedIds:", JSON.stringify(src.selectedIds || []));
  for (const w of src.warehouses || []) {
    console.log(`  godown: ${w.name} | city=${w.city} | active=${w.active} | products=${w.products ?? "?"} | id=${w.id}`);
  }
  if (src.groups) console.log("groups:", src.groups.map((g) => `${g.id}=${g.ticked}`).join(", "));

  // 2. dump all products
  const all = [];
  let page = 1;
  for (;;) {
    const d = await api(`/api/admin/products?limit=100&page=${page}&idsOnly=0`);
    for (const r of d.rows || []) {
      all.push({ id: r.id, sku: r.sku, name: r.name, company: r.company || "", active: r.active, syncSource: r.syncSource, activeSource: r.activeSource, stock: r.stock });
    }
    if (!d.total || all.length >= d.total || !(d.rows || []).length) break;
    page++;
    if (page > 200) break;
  }
  console.log("\n=== products in production ===");
  console.log("total:", all.length);

  // company census
  const byCompany = new Map();
  for (const p of all) byCompany.set(p.company || "(blank)", (byCompany.get(p.company || "(blank)") || 0) + 1);
  console.log("\nby company:");
  for (const [c, n] of [...byCompany.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`);

  // excluded-SKU presence
  const exSet = new Set(EXCLUDED_SKUS.map((s) => String(s).trim()));
  const present = all.filter((p) => exSet.has(p.sku));
  console.log(`\nexcluded SKUs present in production: ${present.length} / ${EXCLUDED_SKUS.length}`);
  const missing = EXCLUDED_SKUS.filter((s) => !present.find((p) => p.sku === s));
  if (missing.length) console.log("excluded SKUs NOT in production (first 10):", missing.slice(0, 10));

  // GST-company products that are NOT in the excel list
  const gstCompanyProducts = all.filter((p) => EXCLUDED_COMPANIES.some((c) => (p.company || "").trim().toUpperCase() === c.toUpperCase()));
  const extraGst = gstCompanyProducts.filter((p) => !exSet.has(p.sku));
  console.log(`\nproducts with GST-firm company name: ${gstCompanyProducts.length} (of which NOT in excel list: ${extraGst.length})`);
  if (extraGst.length) {
    console.log("extra GST-company products (first 40):");
    for (const p of extraGst.slice(0, 40)) console.log(`  ${p.sku} | ${p.company} | ${p.name.slice(0, 50)} | active=${p.active}`);
  }

  // 3. orders referencing excluded products?
  const presentIds = present.map((p) => p.id);
  let ordersWithExcluded = 0;
  try {
    // orders API: check items' skus
    let opage = 1, orderSkus = new Set();
    for (;;) {
      const d = await api(`/api/admin/orders?page=${opage}&limit=100`);
      for (const o of d.orders || d.rows || []) {
        for (const it of o.items || []) orderSkus.add(it.sku);
      }
      const tot = d.total ?? (d.orders || d.rows || []).length;
      if (!d.orders && !d.rows) break;
      if (opage * 100 >= tot) break;
      opage++;
      if (opage > 100) break;
    }
    ordersWithExcluded = [...orderSkus].filter((s) => exSet.has(s)).length;
    console.log(`\ndistinct order-item SKUs that are excluded products: ${ordersWithExcluded}`);
    if (ordersWithExcluded) console.log("  →", [...orderSkus].filter((s) => exSet.has(s)).slice(0, 20));
  } catch (e) {
    console.log("\norders check skipped:", e.message.slice(0, 120));
  }

  // save dump for the next step
  fs.writeFileSync("/home/z/my-project/scripts/prod-products-dump.json", JSON.stringify({ all, present, extraGst }, null, 1));
  console.log("\ndump saved → scripts/prod-products-dump.json");
})().catch((e) => { console.error("AUDIT ERROR:", e.message); process.exit(1); });
