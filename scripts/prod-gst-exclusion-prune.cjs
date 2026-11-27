/**
 * GST-firm exclusion — production prune driver.
 *  1. wait for the new /api/admin/erp-direct/exclusions endpoint to go live
 *  2. GET report → show what will be removed
 *  3. POST { action: "prune" } → delete GST-firm products
 *  4. verify: excluded SKUs gone, product companies clean, catalog healthy
 */
const fs = require("fs");
const BASE = "https://b2b-dmk-mart.vercel.app";
const TOKEN_FILE = "/home/z/my-project/.golive-token";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init) {
  const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 400); }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 300)}`);
  return d;
}

(async () => {
  // 1. wait for deploy (exclusions endpoint 404s until the new build is live)
  console.log("waiting for deployment (exclusions endpoint)...");
  let live = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + "/api/admin/erp-direct/exclusions", { headers: { authorization: "Bearer probe" } });
      if (r.status !== 404) { live = true; break; } // 401/400 = route exists (auth/parse layer)
    } catch { /* network hiccup — retry */ }
    await sleep(15000);
  }
  if (!live) { console.log("deploy did not come up in time"); process.exit(1); }
  console.log("new build is live\n");

  // 2. report
  const rep = await api("/api/admin/erp-direct/exclusions");
  console.log(`=== report: ${rep.productCount} excluded products in DB, ${rep.gstFirmBrands.length} GST-firm brands ===`);
  const byCompany = new Map();
  for (const p of rep.products || []) {
    const c = p.company || "(blank)";
    byCompany.set(c, (byCompany.get(c) || 0) + 1);
  }
  for (const [c, n] of [...byCompany.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`);

  // 3. prune
  console.log("\npruning...");
  const r = await api("/api/admin/erp-direct/exclusions", { method: "POST", body: JSON.stringify({ action: "prune" }) });
  console.log(`matched=${r.matched} deleted=${r.deleted} hidden=${r.hidden} mirrorsRemoved=${r.mirrorsRemoved} remaining=${r.remaining}`);
  console.log("removed brands:", JSON.stringify(r.removedBrands));
  if (r.hiddenSkus?.length) console.log("hidden (order history):", r.hiddenSkus.join(", "));
  if (r.remaining > 0) { console.log("!! some excluded products remain — rerun prune"); process.exit(1); }

  // 4. verify clean
  console.log("\n=== verification ===");
  const after = await api("/api/admin/erp-direct/exclusions");
  console.log(`excluded products still in DB: ${after.productCount} (must be 0)`);

  // company sweep: no GST-firm company name on any product
  const GST_COMPANIES = ["DMK TRADERS", "HD POLYPLAST", "HD POLY PLAST", "PLASTIC WORLD", "STEELKING INDUSTRIES PRIVATE LIMITED"];
  let gstLeft = 0;
  for (const c of GST_COMPANIES) {
    const d = await api(`/api/admin/products?company=${encodeURIComponent(c)}&limit=5`);
    if (d.total > 0) {
      gstLeft += d.total;
      console.log(`  STILL PRESENT company="${c}": ${d.total}`);
      for (const row of (d.rows || []).slice(0, 5)) console.log(`    ${row.sku} | ${row.name.slice(0, 40)}`);
    }
  }
  console.log(gstLeft === 0 ? "company sweep: CLEAN (no GST-firm company products left)" : `company sweep: ${gstLeft} leftover`);

  // catalog health
  const cat = await api("/api/admin/products?limit=1&page=1");
  console.log(`total products now: ${cat.total} (was 4781 before prune)`);
  const pub = await fetch(BASE + "/api/catalog");
  console.log("public /api/catalog:", pub.status);
  const home = await fetch(BASE + "/");
  console.log("homepage:", home.status);
})().catch((e) => { console.error("PRUNE ERROR:", e.message); process.exit(1); });
