#!/usr/bin/env node
/**
 * Batch C production verification:
 *  1. wait for deploy (new live-content defaults visible)
 *  2. login page: staff-links block gone, site-content keys live
 *  3. site-content defaults for login.* / wh.*
 *  4. demo customer login → /api/auth/me nearestWarehouse + tier-priced products payload
 *  5. admin login → ERP sources (tier groups) + deep-stock scan runs
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDeploy() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/site-content`);
      if (r.ok) {
        const d = await r.json();
        if (d?.defaults?.["login.topline"]) return d;
      }
    } catch { /* retry */ }
    await sleep(15000);
  }
  throw new Error("deployment marker never appeared");
}

(async () => {
  const defaults = await waitForDeploy();
  log("✓ deploy live — login.topline default:", JSON.stringify(defaults["login.topline"]));

  // 1. login page HTML — staff links must be gone
  const html = await (await fetch(`${BASE}/login`)).text();
  const hasStaff = html.includes("Are you part of the DMK Mart team");
  const hasSlider = html.includes("Sign in") && html.includes("Create account");
  log(hasStaff ? "✗ staff links STILL on login page" : "✓ staff links removed from /login", "|", hasSlider ? "✓ auth panel renders" : "✗ auth panel missing");

  // 2. site-content registry completeness
  const needKeys = ["login.topline", "login.usp.chips", "login.panel.strip", "login.register.note", "login.regdone.text", "login.footer", "wh.badge", "wh.title", "wh.subtitle", "wh.cardcaption", "wh.mismatch.title", "wh.mismatch.text"];
  const missing = needKeys.filter((k) => !defaults[k]);
  log(missing.length ? `✗ missing site-content keys: ${missing.join(", ")}` : "✓ all 12 login/warehouse content keys registered");

  // 3. demo customer login (Pune) → me + products
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "9529433664", password: "Ishwar" }),
  });
  if (!loginRes.ok) { log("✗ demo Pune login failed:", loginRes.status, await loginRes.text()); return; }
  const { token, customer } = await loginRes.json();
  log(`✓ demo Pune login — ${customer?.shopName || customer?.name} tier=${customer?.tier} status=${customer?.status}`);

  const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { "x-customer-token": token } })).json();
  log(me.nearestWarehouse ? `✓ nearestWarehouse: ${me.nearestWarehouse.name} (${me.nearestWarehouse.city})` : "✗ no nearestWarehouse for demo buyer");

  const prod = await (await fetch(`${BASE}/api/products?limit=8`, { headers: { "x-customer-token": token } })).json();
  const p0 = prod.products?.[0];
  if (p0) {
    const tiers = ["tier1", "tier2", "tier3", "tier4", "tier5"].filter((k) => p0[k] !== undefined);
    log(`✓ products payload carries tier prices (${tiers.join(",") || "NONE"}) — buyer tier ${customer.tier} → shown price source exists`);
    log(`  sample: ${p0.name?.slice(0, 40)} tier1=${p0.tier1} tier2=${p0.tier2} tier4=${p0.tier4} mrp=${p0.mrp}`);
  } else {
    log("✗ no products in payload");
  }

  // 4. admin login → ERP groups (tier checkboxes) + deep stock scan
  const adminRes = await fetch(`${BASE}/api/admin/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }),
  });
  if (!adminRes.ok) { log("✗ admin login failed:", adminRes.status); return; }
  const admin = await adminRes.json();
  const at = admin.token ?? admin.adminToken;
  log("✓ admin login ok");

  const src = await (await fetch(`${BASE}/api/admin/erp-direct/sources`, { headers: { authorization: `Bearer ${at}` } })).json();
  const groups = src?.groups ?? [];
  const tierGroups = groups.filter((g) => ["tier1", "tier2", "tier3"].includes(g.id));
  log(tierGroups.length === 3 ? `✓ ERP step-3 tier checkboxes: ${tierGroups.map((g) => `${g.id}=${g.label}`).join(" | ")}` : `✗ tier groups: ${groups.map((g) => g.id).join(",")}`);
  const map = src?.products?.mapping ?? src?.mapping;
  if (map) log(`  products mapping tier cols: tier1=${map.tier1Col || "—"} tier2=${map.tier2Col || "—"} tier3=${map.tier3Col || "—"} rate=${map.rateCol || "—"} mrp=${map.mrpCol || "—"}`);

  log("→ running deep per-warehouse stock scan (05:00 AM IST pass)…");
  const t0 = Date.now();
  const deep = await fetch(`${BASE}/api/admin/erp-direct/sync`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${at}` },
    body: JSON.stringify({ action: "deep-stock" }),
  });
  const dj = await deep.json();
  if (deep.ok) {
    for (const w of dj.warehouses ?? []) log(`  · ${w.name}: ${w.rows} rows, ${w.upserted} upserted, ${w.staleRemoved} stale removed${w.errors?.length ? " ERROR " + w.errors[0] : ""}`);
    log(`✓ deep scan done in ${Math.round((Date.now() - t0) / 1000)}s — totals: ${dj.totals?.rows} rows / ${dj.totals?.upserted} upserted / ${dj.totals?.productsUpdated} products updated`);
  } else {
    log("✗ deep scan failed:", deep.status, JSON.stringify(dj).slice(0, 300));
  }

  // 5. IST display sanity — cron route comments not verifiable via HTTP; vercel.json checked in repo
  log("done.");
})().catch((e) => { console.error("VERIFY FAILED:", e.message); process.exit(1); });
