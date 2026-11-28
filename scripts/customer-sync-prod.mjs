/**
 * Sync the customer master Excel (upload/custsomer data.xlsx → scripts/customer-master-rows.json)
 * into the production admin panel.
 *
 *   node scripts/customer-sync-prod.mjs plan    # dry-run, no writes
 *   node scripts/customer-sync-prod.mjs apply   # upsert + postfix (status/gstin/pin/createdBy)
 *   node scripts/customer-sync-prod.mjs verify  # read-back summary incl. Store Map stats
 *
 * Rules (user's master sheet = source of truth):
 *   • match by normalized 10-digit mobile; missing → CREATE, present → UPDATE
 *   • Excel row Sr 4 (72199420014, 11-digit typo) is the same customer as Sr 5
 *     (7219420014 — same email + shop) → merged, not duplicated
 *   • passwords: sheet "Store Plain Password" is applied only to accounts that
 *     never chose their own password (mustChangePassword=true or no password);
 *     anyone who already set a personal password keeps it
 *   • status mirror: Approved→APPROVED · Pending→PENDING · Unlinked→APPROVED (Active) / SUSPENDED (Inactive)
 *   • store map: sheet Google Maps pin overwrites lat/lng (geoSource ADMIN);
 *     rows without a link keep their existing pin
 *   • gstin filled only when prod value is empty and the sheet has a plausible id
 *   • createdBy mirrors the sheet's salesperson name ("WEB" for Direct/Online rows)
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const PHASE = process.argv[2] || "plan";

import { readFileSync, writeFileSync } from "fs";

const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 400); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 400)}`);
  return d;
};

// ───────────────────────── helpers ─────────────────────────
const normPhone = (raw) => {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
};

const parsePin = (link) => {
  const m = String(link || "").match(/q=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const BAD = new Set(["", "*", "no", "n/a", "add", "-", "na", "nil"]);
const clean = (v) => String(v ?? "").trim();
const isBad = (v) => BAD.has(clean(v).toLowerCase());

// sheet status → Customer.status
const desiredStatus = (r) => {
  const approval = clean(r["Store Approval Status"]).toUpperCase(); // APPROVED | PENDING | UNLINKED
  const acct = clean(r["Account Status"]).toLowerCase();             // Active | Inactive
  if (approval === "PENDING") return "PENDING";
  if (approval === "UNLINKED") return acct === "inactive" ? "SUSPENDED" : "APPROVED";
  return acct === "inactive" ? "SUSPENDED" : "APPROVED";
};

// salesperson names from the sheet (Salesperson ID 1/2/4) — "Direct / Online" → WEB
const SP_NAMES = new Set(["Akshay", "Kunal kolapkar", "Prashant chinde"]);
const desiredCreatedBy = (r) => (SP_NAMES.has(clean(r["Salesperson Name"])) ? clean(r["Salesperson Name"]) : "WEB");

// ───────────────────────── build rows ─────────────────────────
const MERGED_SR = new Set(["4"]); // Sr 4 = 11-digit typo duplicate of Sr 5 (same email amolwalke029@gmail.com + Manisha enterprises)
const sheet = JSON.parse(readFileSync("/home/z/my-project/scripts/customer-master-rows.json", "utf8"))
  .filter((r) => !MERGED_SR.has(clean(r["Sr No"])));

const rows = sheet.map((r) => {
  const phone = normPhone(r["Mobile Phone"]);
  const pin = parsePin(r["Google Maps Pinned Link"]);
  const pwd = clean(r["Store Plain Password"]);
  const gst = clean(r["GST Detail / Tax ID"]);
  return {
    sr: clean(r["Sr No"]),
    phone,
    fullName: clean(r["Full Name"]),
    shopName: clean(r["Company / Shop Name"]),
    email: isBad(r["Email Address"]) ? "" : clean(r["Email Address"]),
    address: clean(r["Street / Store Address"]),
    city: clean(r["City / Locality"]),
    pincode: /^\d{6}$/.test(clean(r["Billing Pincode"])) ? clean(r["Billing Pincode"]) : "",
    demoPassword: !isBad(pwd) && pwd.length >= 4 ? pwd : "1234",
    lat: pin?.lat ?? null,
    lng: pin?.lng ?? null,
    createdAt: clean(r["Registration Date"]) || undefined,
    status: desiredStatus(r),
    gstin: !isBad(gst) && gst.length >= 10 ? gst : "",
    createdBy: desiredCreatedBy(r),
  };
});

// ───────────────────────── phases ─────────────────────────
const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };
const prod = (await jf("/api/admin/crud/customers", { headers: H })).rows ?? [];
const byPhone = new Map(prod.map((c) => [c.phone, c]));

const invalid = rows.filter((r) => !/^[6-9]\d{9}$/.test(r.phone) && !byPhone.has(r.phone));
if (invalid.length) {
  console.error("Invalid phones after normalization — aborting:", invalid.map(r => [r.sr, r.phone, r.fullName]));
  process.exit(1);
}

const importRows = rows.map((r) => ({
  phone: r.phone, fullName: r.fullName, shopName: r.shopName, email: r.email,
  demoPassword: r.demoPassword, address: r.address, city: r.city, pincode: r.pincode,
  lat: r.lat, lng: r.lng, createdAt: r.createdAt,
}));

const creates = rows.filter((r) => !byPhone.has(r.phone));
const updates = rows.filter((r) => byPhone.has(r.phone));
console.log(`sheet rows: ${rows.length} · will CREATE: ${creates.length} · will UPDATE: ${updates.length}`);

if (PHASE === "plan") {
  const dry = await jf("/api/admin/customers/import", { method: "POST", headers: H, body: JSON.stringify({ rows: importRows, dryRun: true }) });
  console.log(`import dryRun → created:${dry.created} updated:${dry.updated} failed:${dry.failed}`);
  if (dry.errors?.length) console.log("dryRun errors:", JSON.stringify(dry.errors, null, 1));
  const actions = dry.results ?? [];
  const mismatch = actions.filter(a => (a.action === "CREATE" ? !creates.find(r => r.phone === a.phone) : !updates.find(r => r.phone === a.phone)));
  console.log("plan vs local classification mismatches:", mismatch.length ? JSON.stringify(mismatch) : "none");

  // postfix preview — what apply will PATCH beyond the import
  let pinOverwrite = 0, statusFix = 0, gstinFill = 0, createdByFix = 0;
  for (const r of rows) {
    const c = byPhone.get(r.phone);
    if (r.lat != null) pinOverwrite++;
    if (c && c.status !== r.status) { statusFix++; console.log(`  status ${r.sr} ${r.phone} ${r.fullName}: ${c.status} → ${r.status}`); }
    if (r.gstin && (!c || !c.gstin)) { gstinFill++; console.log(`  gstin ${r.sr} ${r.phone} ${r.fullName}: → ${r.gstin}`); }
    const cb = c ? (c.createdBy || "") : "";
    if (!c || cb !== r.createdBy) { createdByFix++; if (c) console.log(`  createdBy ${r.sr} ${r.phone} ${r.fullName}: ${cb || "(empty)"} → ${r.createdBy}`); }
  }
  console.log(`postfix preview → pin overwrite (sheet has link): ${pinOverwrite} · status fixes: ${statusFix} · gstin fills: ${gstinFill} · createdBy fixes: ${createdByFix}`);
  writeFileSync("/home/z/my-project/scripts/customer-sync-plan.json", JSON.stringify({ creates: creates.map(r => r.sr), updates: updates.map(r => r.sr) }, null, 1));
  console.log("PLAN OK — no writes made");
}

if (PHASE === "apply") {
  // 1 · upsert (import endpoint: never clobbers a chosen password)
  const res = await jf("/api/admin/customers/import", { method: "POST", headers: H, body: JSON.stringify({ rows: importRows }) });
  console.log(`import → created:${res.created} updated:${res.updated} failed:${res.failed}`);
  if (res.errors?.length) { console.log("import errors:", JSON.stringify(res.errors, null, 1)); process.exitCode = 1; }

  // 2 · postfix — refresh prod view (includes rows the import just created)
  const prod2 = (await jf("/api/admin/crud/customers", { headers: H })).rows ?? [];
  const byPhone2 = new Map(prod2.map((c) => [c.phone, c]));
  const now = new Date().toISOString();
  let patched = 0, failed = 0;
  for (const r of rows) {
    const c = byPhone2.get(r.phone);
    if (!c) { console.log(`  MISSING after import: ${r.sr} ${r.phone} ${r.fullName}`); failed++; continue; }
    const data = { id: c.id };
    if (r.lat != null && r.lng != null) { data.lat = r.lat; data.lng = r.lng; data.geoSource = "ADMIN"; data.geoUpdatedAt = now; } // sheet pin wins
    if (c.status !== r.status) data.status = r.status;
    if (r.gstin && !c.gstin) data.gstin = r.gstin;
    if ((c.createdBy || "") !== r.createdBy) data.createdBy = r.createdBy;
    if (Object.keys(data).length === 1) continue;
    try {
      await jf("/api/admin/crud/customers", { method: "PATCH", headers: H, body: JSON.stringify(data) });
      patched++;
      const touched = Object.keys(data).filter(k => k !== "id").join(",");
      console.log(`  patched ${r.sr} ${r.phone} ${r.fullName}: ${touched}`);
    } catch (e) { failed++; console.log(`  PATCH FAILED ${r.sr} ${r.phone}: ${e.message}`); }
  }
  console.log(`postfix → patched:${patched} failed:${failed}`);
}

if (PHASE === "verify") {
  const prod3 = (await jf("/api/admin/crud/customers", { headers: H })).rows ?? [];
  const st = {}; for (const c of prod3) st[c.status] = (st[c.status] ?? 0) + 1;
  const pinned = prod3.filter(c => c.lat != null && c.lng != null).length;
  const cb = {}; for (const c of prod3) cb[c.createdBy || "(empty)"] = (cb[c.createdBy || "(empty)"] ?? 0) + 1;
  console.log(`customers total: ${prod3.length} (was 32) · statuses: ${JSON.stringify(st)} · pinned: ${pinned}/${prod3.length}`);
  console.log("createdBy:", JSON.stringify(cb));
  console.log("gstin set:", prod3.filter(c => c.gstin).map(c => `${c.phone}:${c.gstin}`));
  const loc = await jf("/api/admin/customers/locations", { headers: H });
  console.log(`store-map API → total:${loc.stats.total} pinned:${loc.stats.pinned} unpinned:${loc.stats.unpinned} approved:${loc.stats.approved} pending:${loc.stats.pending}`);
  const spot = ["9511646689", "7350608416", "8421241111", "8669141645", "7219420014", "1234567890", "9370832476"];
  for (const p of spot) {
    const c = prod3.find(x => x.phone === p);
    if (c) console.log(`  spot ${p}: ${c.name} | ${c.shopName} | ${c.status} | city:${c.city} | pin:${c.lat},${c.lng} (${c.geoSource}) | gst:${c.gstin || "—"} | by:${c.createdBy} | reg:${String(c.createdAt).slice(0, 10)}`);
    else console.log(`  spot ${p}: MISSING`);
  }
  // new customers must carry their sheet registration date + mustChangePassword
  const news = prod3.filter(c => ["9511646689","8010714899","7996510703","7420940895"].includes(c.phone));
  for (const c of news) console.log(`  new ${c.phone}: ${c.name} | mustChangePassword:${c.mustChangePassword} | createdAt:${String(c.createdAt).slice(0, 19)}`);
}
