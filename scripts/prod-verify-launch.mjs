/**
 * Post-deploy verification for the login-first + warehouse-scope launch:
 *  1. deploy wait (probe: GET / redirects to /login)
 *  2. gate checks (/, /catalog, /login, /admin)
 *  3. finalize → coverage rows planted (catalog scoped totals)
 *  4. demo logins end-to-end (login → choose warehouse → scoped product count)
 *  5. security headers + phone checks
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, redirect: "manual", cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 200); }
  return { res, d };
};
const nf = (n) => Number(n || 0).toLocaleString("en-IN");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("waiting for deploy…");
let live = false;
for (let i = 0; i < 24; i++) {
  await sleep(30000);
  try {
    const { res } = await jf("/");
    const loc = res.headers.get("location") || "";
    console.log(`try ${i + 1}: GET / → ${res.status} ${loc.slice(0, 60)}`);
    if (res.status >= 300 && res.status < 400 && loc.includes("/login")) { live = true; break; }
    if (res.status === 200) { console.log("  (still old deploy — homepage public)"); }
  } catch (e) { console.log(`try ${i + 1}: ${String(e.message).slice(0, 100)}`); }
}
if (!live) { console.log("deploy not detected in time — aborting"); process.exit(2); }

console.log("\n=== gate checks ===");
for (const p of ["/", "/catalog", "/brands", "/account", "/login", "/admin", "/choose-warehouse"]) {
  const { res } = await jf(p);
  console.log(`  GET ${p} → ${res.status}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}`);
}

console.log("\n=== security headers ===");
const hres = await fetch(BASE + "/login", { redirect: "manual" });
for (const k of ["x-content-type-options", "x-frame-options", "referrer-policy", "strict-transport-security"]) {
  console.log(`  ${k}: ${hres.headers.get(k) ?? "—"}`);
}

// admin finalize → coverage rows
const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const token = login.d.token;
const H = { authorization: `Bearer ${token}`, "x-admin-token": token };
console.log("\n=== finalize (plants coverage rows) ===");
const f = await jf("/api/admin/erp-direct/apply", { method: "POST", headers: H, body: JSON.stringify({ action: "finalize" }) });
console.log(`  shown=${nf(f.d.shownProducts)} hidden=${nf(f.d.hiddenProducts)} · wh ${f.d.shownWarehouses}/${f.d.hiddenWarehouses}`);

console.log("\n=== demo end-to-end (login → warehouse → scoped catalog) ===");
const DEMOS = [
  { phone: "+919529433664", password: "Ishwar", whName: "PUNE" },
  { phone: "+918983433664", password: "Ganesh", whName: "KOLHAR" },
];
for (const d of DEMOS) {
  try {
    const l = await jf("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: d.phone, password: d.password }) });
    if (l.res.status !== 200) { console.log(`  ! ${d.phone}: ${JSON.stringify(l.d).slice(0, 120)}`); continue; }
    const cat = await jf("/api/catalog");
    const wh = (cat.d.warehouses ?? []).find((w) => w.name.includes(d.whName));
    const sw = await jf("/api/auth/select-warehouse", { method: "POST", headers: { "x-customer-token": l.d.token }, body: JSON.stringify({ warehouseId: wh.id }) });
    const whCookie = (sw.res.headers.get("set-cookie") || "").match(/dmk_wh=([^;]+)/)?.[1] || "";
    const prod = await jf("/api/products?limit=5", { headers: { "x-customer-token": l.d.token, cookie: `dmk_wh=${whCookie}` } });
    const stocked = await jf("/api/products?limit=5&flag=top", { headers: { "x-customer-token": l.d.token, cookie: `dmk_wh=${whCookie}` } });
    console.log(`  ${d.phone} (${l.d.customer.shopName}): warehouse=${wh.name} → ${nf(prod.d.total)} products visible (${prod.d.buyerWarehouse ?? ""}), ready-to-dispatch section ${nf(stocked.d.total ?? stocked.d.products?.length ?? 0)}`);
    // a catalog-only family must be visible for Pune
    if (d.whName === "PUNE") {
      const g = await jf(`/api/products?company=${encodeURIComponent("Garden Needs")}&limit=3`, { headers: { "x-customer-token": l.d.token, cookie: `dmk_wh=${whCookie}` } });
      console.log(`    Garden Needs at Pune: ${nf(g.d.total)} visible`);
    }
  } catch (e) {
    console.log(`  ! ${d.phone}: ${String(e.message).slice(0, 160)}`);
  }
}

console.log("\n=== phone + category images ===");
const cat2 = await jf("/api/catalog");
console.log(`  settings.support_phone: ${cat2.d.settings.support_phone ?? "—"} | firm_phone: ${cat2.d.settings.firm_phone ?? "—"}`);
console.log(`  tops with images: ${(cat2.d.tops ?? []).filter((t) => t.image).length}/${(cat2.d.tops ?? []).length}`);

console.log("\n=== panel totals ===");
const total = async (sp) => (await jf(`/api/admin/products?limit=5&${sp}`, { headers: H })).d.total;
console.log(`  all=${nf(await total(""))} active=${nf(await total("status=active"))} in-stock=${nf(await total("stocked=1"))}`);
console.log("\nDONE");
