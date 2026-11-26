/**
 * Round-2 production verification:
 *  1. deploy wait (probe: public /forgot-password renders the reset wizard)
 *  2. public-path checks (/forgot-password, /salesteam, /warehouse — NO bounce to /login)
 *  3. admin login → POST /api/admin/schema-sync (Warehouse.image + Order edited/notified columns)
 *  4. warehouse images → upload to Cloudinary (folder warehouses) + PATCH both godowns
 *  5. demo login e2e ×2 → warehouse-scoped catalog check (Pune vs Kolhar totals differ, sample
 *     products verified against the godown's stock list) — the "only my warehouse" rule
 *  6. forgot/reset-password e2e on the Pune demo account, resetting to the SAME password (no-op)
 *     + purpose-binding check (a LOGIN token must be rejected as a reset grant)
 *  7. staff panel login endpoints alive (401 on bad creds — page-level reachability checked in 2)
 *  8. whole-warehouse brochure smoke (maxProducts:"all" → no 600 error)
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
import fs from "fs";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, redirect: "manual", cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { res, d };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("=== 1 · waiting for deploy (probe /forgot-password) ===");
let live = false;
for (let i = 0; i < 30; i++) {
  await sleep(30000);
  try {
    const { res, d } = await jf("/forgot-password");
    const ok = res.status === 200 && typeof d === "string" && d.includes("Reset your password");
    console.log(`try ${i + 1}: GET /forgot-password → ${res.status} ${ok ? "(reset wizard live)" : d.slice ? "(old deploy)" : ""}`);
    if (ok) { live = true; break; }
  } catch (e) { console.log(`try ${i + 1}: ${String(e.message).slice(0, 100)}`); }
}
if (!live) { console.log("deploy not detected in time — aborting"); process.exit(2); }

console.log("\n=== 2 · public paths (must NOT bounce to /login) ===");
for (const p of ["/forgot-password", "/salesteam", "/warehouse", "/login", "/admin"]) {
  const { res } = await jf(p);
  const loc = res.headers.get("location") || "";
  console.log(`  GET ${p} → ${res.status}${loc ? ` → ${loc}` : ""} ${loc.includes("/login") ? "❌ BOUNCED" : "✓"}`);
}

console.log("\n=== 3 · schema-sync (DDL for new columns) ===");
const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const token = login.d?.token;
if (!token) { console.log("admin login FAILED", login.d); process.exit(2); }
const H = { authorization: `Bearer ${token}`, "x-admin-token": token };
const sync = await jf("/api/admin/schema-sync", { method: "POST", headers: H });
console.log("  POST schema-sync:", JSON.stringify(sync.d));
const audit = await jf("/api/admin/schema-sync", { method: "GET", headers: H });
console.log("  GET audit:", JSON.stringify(audit.d));

console.log("\n=== 4 · warehouse images → Cloudinary + godown rows ===");
const whs = (await jf("/api/admin/crud/warehouses", { headers: H })).d?.rows ?? [];
console.log("  godowns:", whs.map((w) => `${w.name} [${w.id}] img=${w.image ? "set" : "empty"}`).join(" · "));
for (const key of ["pune", "kolhar"]) {
  const file = `/home/z/my-project/scripts/wh-images/wh-${key}.png`;
  const want = key === "pune" ? /pune/i : /kolhar/i;
  const wh = whs.find((w) => want.test(w.name) || want.test(w.city || ""));
  if (!wh) { console.log(`  no godown matched "${key}" — skip`); continue; }
  if (wh.image && wh.image.includes(`wh-${key}`)) { console.log(`  ${wh.name}: image already set`); continue; }
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(file)], { type: "image/png" }), `wh-${key}.png`);
  form.append("folder", "warehouses");
  form.append("publicId", `wh-${key}`);
  const up = await fetch(BASE + "/api/admin/upload", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
  const ud = await up.json().catch(() => ({}));
  if (!up.ok || !ud.url) { console.log(`  upload failed for ${key}:`, up.status, JSON.stringify(ud).slice(0, 160)); continue; }
  const patch = await jf(`/api/admin/warehouses/${wh.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ image: ud.url }) });
  console.log(`  ${wh.name}: image → ${patch.res.status} ${ud.url.slice(0, 80)}`);
}

console.log("\n=== 5 · demo logins + warehouse-scoped catalog ===");
const DEMOS = [
  { phone: "9529433664", password: "Ishwar", label: "Pune demo" },
  { phone: "8983433664", password: "Ganesh", label: "Kolhar demo" },
];
const scopedTotals = {};
let firstScopeSample = [];
const allWhs = (await jf("/api/admin/warehouses", { headers: H })).d?.warehouses ?? [];
for (const demo of DEMOS) {
  const l = await jf("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: demo.phone, password: demo.password }) });
  if (!l.d?.token) { console.log(`  ${demo.label} LOGIN FAILED:`, JSON.stringify(l.d).slice(0, 160)); continue; }
  const wh = allWhs.find((w) => (demo.label.includes("Pune") ? /pune/i : /kolhar/i).test(w.name) || (demo.label.includes("Pune") ? /pune/i : /kolhar/i).test(w.city || "")) || allWhs[0];
  const sw = await jf("/api/auth/select-warehouse", { method: "POST", headers: { "x-customer-token": l.d.token }, body: JSON.stringify({ warehouseId: wh.id }) });
  const whCookie = sw.d?.warehouse?.id || wh.id;
  const prod = await jf("/api/products?limit=200", { headers: { "x-customer-token": l.d.token, cookie: `dmk_wh=${whCookie}` } });
  scopedTotals[demo.label] = { total: prod.d?.total, buyerWh: prod.d?.buyerWarehouse?.name || wh.name };
  console.log(`  ${demo.label} → warehouse "${wh.name}" → catalog total ${prod.d?.total} · buyerWarehouse=${prod.d?.buyerWarehouse?.name ?? "?"}`);
  if (demo.label.includes("Pune")) firstScopeSample = (prod.d?.products ?? []).slice(0, 5).map((p) => p.id);
  // other-warehouse isolation: pick the OTHER godown's stock list, make sure scoped ids are NOT from it
  const other = allWhs.find((w) => w.id !== wh.id);
  if (other && prod.d?.products?.length) {
    const otherDetail = await jf(`/api/admin/warehouses?id=${other.id}`, { headers: H });
    const otherIds = new Set((otherDetail.d?.products ?? []).map((p) => p.productId));
    const leaks = (prod.d.products ?? []).filter((p) => !otherIds.has(p.id) && otherIds.size > 0).length;
    // leaks here = scoped products that ARE in neither godown list... simpler: count scoped items missing from the CHOSEN godown
    const ownDetail = await jf(`/api/admin/warehouses?id=${wh.id}`, { headers: H });
    const ownIds = new Set((ownDetail.d?.products ?? []).map((p) => p.productId));
    const notInOwn = (prod.d.products ?? []).filter((p) => !ownIds.has(p.id)).length;
    console.log(`    scoped sample: ${prod.d.products.length} · not stocked in chosen godown: ${notInOwn} · other godown "${other.name}" rows: ${otherIds.size}`);
  }
}
const totals = Object.values(scopedTotals).map((s) => s.total);
console.log(`  totals differ across warehouses: ${totals.length === 2 && totals[0] !== totals[1] ? "✓ (coverage differs)" : `→ ${totals.join(" vs ")}`}`);

console.log("\n=== 6 · forgot/reset-password e2e (no-op reset to the same password) ===");
const ident = await jf("/api/auth/identify", { method: "POST", body: JSON.stringify({ identifier: "9529433664" }) });
console.log("  identify:", ident.res.status, ident.d?.found ? `masked ${ident.d.masked}` : JSON.stringify(ident.d).slice(0, 120));
const otpSend = await jf("/api/auth/otp/send", { method: "POST", body: JSON.stringify({ identifier: "9529433664", purpose: "RESET" }) });
console.log("  otp/send:", otpSend.res.status, otpSend.d?.devOtp ? `devOtp ${otpSend.d.devOtp}` : JSON.stringify(otpSend.d).slice(0, 120));
if (otpSend.d?.devOtp) {
  const otpVerify = await jf("/api/auth/otp/verify", { method: "POST", body: JSON.stringify({ identifier: "9529433664", code: otpSend.d.devOtp, purpose: "RESET" }) });
  console.log("  otp/verify:", otpVerify.res.status, otpVerify.d?.resetToken ? "resetToken issued ✓" : JSON.stringify(otpVerify.d).slice(0, 120));
  // purpose binding: a LOGIN-equivalent token must be rejected
  const l2 = await jf("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "9529433664", password: "Ishwar" }) });
  const bad = await jf("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ resetToken: l2.d?.token, password: "Xx123456" }) });
  console.log(`  purpose-binding (login token as reset grant): ${bad.res.status === 401 ? "✓ rejected (401)" : "❌ accepted — SECURITY BUG"}`);
  const rp = await jf("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ resetToken: otpVerify.d?.resetToken, password: "Ishwar" }) });
  console.log(`  reset to same password: ${rp.res.status === 200 ? "✓ chain works" : "❌ " + JSON.stringify(rp.d).slice(0, 120)}`);
  const relog = await jf("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "9529433664", password: "Ishwar" }) });
  console.log(`  login after reset: ${relog.res.status === 200 ? "✓" : "❌ " + JSON.stringify(relog.d).slice(0, 100)}`);
}

console.log("\n=== 7 · staff panel endpoints alive ===");
const s1 = await jf("/api/salesteam/login", { method: "POST", body: JSON.stringify({ username: "probe-nonexistent", password: "x" }) });
const s2 = await jf("/api/warehouse/login", { method: "POST", body: JSON.stringify({ username: "probe-nonexistent", password: "x" }) });
console.log(`  /api/salesteam/login → ${s1.res.status} (401 = alive & reachable) · /api/warehouse/login → ${s2.res.status}`);

console.log("\n=== 8 · whole-warehouse brochure smoke (no 600 cap) ===");
const wh0 = allWhs[0];
const t0 = Date.now();
const bro = await jf("/api/admin/brochure/generate", {
  method: "POST", headers: H, signal: undefined,
  body: JSON.stringify({ warehouseId: wh0.id, companies: [], readyOnly: false, includeOutOfStock: true, showPrices: true, tier: "dealer", maxProducts: "all" }),
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (bro.res.ok) {
  const meta = bro.d?.meta;
  console.log(`  brochure ${wh0.name}: ${bro.res.status} · ${meta ? `${meta.count} products in ${secs}s · ${meta.shareUrl ? "hosted ✓" : "binary"}` : `binary pdf in ${secs}s`} ${meta?.count > 600 ? "✓ over-600 works" : ""}`);
} else {
  console.log(`  brochure FAILED (${bro.res.status}) in ${secs}s:`, String(bro.d).slice(0, 200));
}

console.log("\nDONE — round-2 verification complete");
