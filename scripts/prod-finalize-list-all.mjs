/**
 * Deploy-wait + production finalize + verify.
 * Waits until the new listing rule is live (probe: finalize lists covered
 * products), runs finalize, then prints the panel totals the owner checks.
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 300)}`);
  return d;
};
const nf = (n) => Number(n || 0).toLocaleString("en-IN");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };
const total = async (sp) => (await jf(`/api/admin/products?limit=5&${sp}`, { headers: H })).total;

// wait for the deploy that carries the coverage-listing rule
console.log("waiting for Vercel deploy…");
let deployed = false;
for (let i = 0; i < 20; i++) {
  await sleep(45000);
  try {
    const f = await jf("/api/admin/erp-direct/apply", { method: "POST", headers: H, body: JSON.stringify({ action: "finalize" }) });
    console.log(`try ${i + 1}: finalize → shown=${nf(f.shownProducts)} hidden=${nf(f.hiddenProducts)} · wh ${f.shownWarehouses}/${f.hiddenWarehouses}`);
    const act = await total("status=active");
    console.log(`  active total after finalize: ${nf(act)}`);
    if (Number(act) >= 4000) { deployed = true; break; }
  } catch (e) {
    console.log(`try ${i + 1}: ${String(e.message).slice(0, 160)}`);
  }
}
if (!deployed) { console.log("deploy not confirmed in time — aborting"); process.exit(2); }

console.log("\n=== panel totals after the listing rule ===");
console.log("all products:       ", nf(await total("")));
console.log("active (listed):    ", nf(await total("status=active")));
console.log("inactive (hidden):  ", nf(await total("status=inactive")));
console.log("in stock (stock>0): ", nf(await total("stocked=1")));

console.log("\n=== warehouses (buyer view) ===");
const wh = await jf("/api/admin/warehouses", { headers: H });
for (const w of (wh.warehouses || wh || [])) console.log(`  ${w.name}: active=${w.active} · ${nf(w.productCount)} stocked · ${nf(w.totalStock)} units`);

console.log("\n=== spot checks: catalog-only Pune SKUs now listed ===");
for (const q of ["PAPPLAS0001", "PGARDNE0001", "PGOLDEX0001"]) {
  try {
    const one = await jf(`/api/admin/products?q=${q}&limit=1`, { headers: H });
    const p = (one.products || [])[0];
    if (p) console.log(`  ${p.sku} · ${String(p.name).slice(0, 36)} · active=${p.active} stock=${p.stock}`);
    else console.log(`  ${q}: not found`);
  } catch (e) { console.log(`  ${q}: lookup failed ${String(e.message).slice(0, 80)}`); }
}
console.log("\nDONE");
