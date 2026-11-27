/**
 * Post-deploy production verification for the 2026-11-27 batch:
 *   1. wait for the Vercel deploy that carries the new commit
 *   2. POST /api/admin/schema-sync — Order.verifiedAt/verifiedBy + SalesPerson.warehouseId
 *   3. phone scrub (old +91 98220 12345 out of Settings/Pages/Stores)
 *   4. demo staff logins (rahul/kolharmgr) + salesperson warehouse assignment
 *   5. smoke tests: tier5 in buyer payload · login.footer staff text (C④) · orders-flow verify
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 400); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 300)}`);
  return d;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

// 1 · wait for the deploy — probe: GET /api/admin/schema-sync audit includes SalesPerson.warehouseId
//     only when the new route code is live
console.log("waiting for deploy…");
let live = false;
for (let i = 0; i < 30; i++) {
  try {
    const audit = await jf("/api/admin/schema-sync", { headers: H });
    if ((audit.columns ?? []).some((c) => c.table === "SalesPerson" && c.column === "warehouseId")) { live = true; break; }
  } catch { /* not live yet */ }
  await sleep(30000);
}
if (!live) { console.error("deploy did not go live in time"); process.exit(1); }
console.log("✓ new code is live");

// 2 · schema-sync DDL
{
  const r = await jf("/api/admin/schema-sync", { method: "POST", headers: H });
  console.log("schema-sync:", JSON.stringify(r));
}

// 3 · phone scrub + demo staff (existing idempotent scripts, run inline via spawn)
import { spawnSync } from "node:child_process";
for (const s of ["scripts/prod-phone-scrub.mjs", "scripts/prod-demo-staff.mjs"]) {
  console.log(`\n── ${s} ──`);
  const r = spawnSync("node", [s], { stdio: "inherit", cwd: process.cwd() });
  if (r.status !== 0) console.error(`${s} exited ${r.status}`);
}

// 4 · C④ — does the public SiteContent override put staff text on the login footer?
{
  const sc = await jf("/api/site-content");
  const o = sc.overrides ?? {};
  const staffy = Object.entries(o).filter(([k, v]) => /staff|salesperson|warehouse portal/i.test(String(v)));
  console.log(staffy.length ? `❌ SiteContent still carries staff text: ${staffy.map(([k]) => k).join(", ")}` : "✓ no staff text in SiteContent overrides");
}

// 5 · smoke — tier5 rides in the buyer payload
{
  const d = await jf("/api/products?limit=3");
  const p = (d.products ?? [])[0] ?? {};
  console.log("buyer payload tier keys:", ["tier1", "tier2", "tier3", "tier4", "tier5"].filter((k) => k in p).join(", ") || "none");
}

// 6 · smoke — salesteam + warehouse logins
{
  const sp = await jf("/api/salesteam/login", { method: "POST", body: JSON.stringify({ username: "rahul", password: "rahul123" }) }).catch((e) => ({ error: String(e) }));
  console.log("salesperson login:", sp.token ? `✓ ${sp.profile.name}${sp.profile.warehouse ? " → " + sp.profile.warehouse.name : " (no warehouse assigned)"}` : `❌ ${JSON.stringify(sp).slice(0, 120)}`);
  const mg = await jf("/api/warehouse/login", { method: "POST", body: JSON.stringify({ username: "kolharmgr", password: "kolhar123" }) }).catch((e) => ({ error: String(e) }));
  console.log("manager login:", mg.token ? `✓ ${mg.profile?.name ?? mg.profile?.id}` : `❌ ${JSON.stringify(mg).slice(0, 160)}`);
}

// 7 · smoke — orders-flow verify action exists (wrong id → clean error, not "Unknown action")
{
  const r = await fetch(BASE + "/api/admin/orders-flow", { method: "POST", headers: { "content-type": "application/json", ...H }, body: JSON.stringify({ action: "verify", orderId: "no-such-order", lines: [] }) });
  const t = await r.text();
  console.log("verify action probe:", t.includes("Unknown action") ? "❌ verify action missing" : "✓ verify action live (" + r.status + ")");
}
console.log("\nverification complete");
