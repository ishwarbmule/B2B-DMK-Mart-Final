#!/usr/bin/env node
/**
 * Post-deploy for Hero v4 / offers / coupons work:
 *  1. login → admin token
 *  2. POST /api/admin/sync/apply-hero-schema (idempotent — adds Offer.contentPosition)
 *  3. PATCH every slider → position TOP-LEFT + mobilePosition TOP-LEFT (per new brand rule)
 *  4. verify /api/catalog returns expected shapes
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = "B2B DMK Mart";
const PASSWORD = "DmkMartB2B!2026";

const api = async (path, init = {}, token) => {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
};

(async () => {
  const login = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
  const token = login.token || login.accessToken;
  if (!token) throw new Error("no token in login response: " + JSON.stringify(login).slice(0, 200));
  console.log("✓ logged in");

  const mig = await api("/api/admin/sync/apply-hero-schema", { method: "POST" }, token);
  console.log("✓ migration applied:", JSON.stringify(mig.applied), "| skipped:", JSON.stringify(mig.skipped));

  const { rows } = await api("/api/admin/crud/sliders", {}, token);
  console.log(`✓ sliders found: ${rows.length}`);
  for (const r of rows) {
    const needs = r.position !== "TOP-LEFT" || r.mobilePosition !== "TOP-LEFT";
    if (needs) {
      await api("/api/admin/crud/sliders", { method: "PATCH", body: JSON.stringify({ id: r.id, position: "TOP-LEFT", mobilePosition: "TOP-LEFT" }) }, token);
      console.log(`  PATCH ${r.heading} → TOP-LEFT/TOP-LEFT`);
    } else {
      console.log(`  ok ${r.heading} (already TOP-LEFT)`);
    }
  }

  const cat = await api("/api/catalog", {}, token);
  console.log(`✓ catalog: sliders=${cat.sliders?.length} ads=${cat.ads?.length} homeCoupons=${cat.homeCoupons?.length} activeOffer=${cat.activeOffer ? cat.activeOffer.headline : "null (promo hidden — correct until admin creates one)"}`);
  const s0 = cat.sliders?.[0];
  if (s0) console.log(`✓ slide[0]: position=${s0.position} mobilePosition=${s0.mobilePosition} textColor=${s0.textColor}`);
})().catch((e) => {
  console.error("✗ FAILED:", e.message);
  process.exit(1);
});
