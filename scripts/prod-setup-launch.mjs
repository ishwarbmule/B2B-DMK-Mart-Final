/**
 * Production launch setup (idempotent — safe to re-run):
 *  1. support/firm phone → the owner's new number
 *  2. top-level category images → Cloudinary upload + TopCategory.image
 *  3. demo customers (Pune/Ishwar + Kolhar/Ganesh) — approved, direct login
 *  4. verification prints
 */
import { readFileSync } from "fs";
import { createHash } from "crypto";

const BASE = "https://b2b-dmk-mart.vercel.app";
const NEW_PHONE = "+91 93095 75173";

const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 300)}`);
  return d;
};
const nf = (n) => Number(n || 0).toLocaleString("en-IN");

const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

// 1 ── phone settings
await jf("/api/admin/settings", { method: "PUT", headers: H, body: JSON.stringify({ support_phone: NEW_PHONE, firm_phone: NEW_PHONE }) });
console.log("settings: support_phone + firm_phone =", NEW_PHONE);

// 2 ── category images
const TOP_IMAGES = [
  ["General", "cat-general", "scripts/gen-imgs/top-general.png"],
  ["NV Products-Feriwala", "cat-nv", "scripts/gen-imgs/top-nv.png"],
  ["Gardening Tools & Planters", "cat-gardening", "scripts/gen-imgs/top-gardening.png"],
  ["Kitchen Equipments Commercial", "cat-kitchen-commercial", "scripts/gen-imgs/top-kitchen-commercial.png"],
  ["HouseHold Unbreakable", "cat-household", "scripts/gen-imgs/top-household.png"],
  ["Furniture", "cat-furniture", "scripts/gen-imgs/top-furniture.png"],
  ["Water Jar & Bottle", "cat-waterjar", "scripts/gen-imgs/top-waterjar.png"],
  ["Kitchen Ware", "cat-kitchenware", "scripts/gen-imgs/top-kitchenware.png"],
];
const catalog = await jf("/api/catalog");
const topByName = new Map((catalog.tops ?? []).map((t) => [t.name, t]));
for (const [name, publicId, file] of TOP_IMAGES) {
  const top = topByName.get(name);
  if (!top) { console.log(`  ! top category "${name}" not found — skipped`); continue; }
  if (top.image && top.image.includes(publicId)) { console.log(`  = ${name} already has its Cloudinary image`); continue; }
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)], { type: "image/png" }), `${publicId}.png`);
  form.append("folder", "categories");
  form.append("publicId", publicId);
  const upRes = await fetch(BASE + "/api/admin/upload", { method: "POST", headers: { authorization: `Bearer ${login.token}` }, body: form });
  const up = await upRes.json();
  if (!upRes.ok) { console.log(`  ! upload failed for ${name}: ${JSON.stringify(up).slice(0, 160)}`); continue; }
  await jf("/api/admin/crud/tops", { method: "PATCH", headers: H, body: JSON.stringify({ id: top.id, image: up.url }) });
  console.log(`  ✓ ${name} → ${up.url}`);
}

// 3 ── demo customers (approved, direct password, no forced change)
const sha = (s) => createHash("sha256").update(s).digest("hex");
const DEMOS = [
  { phone: "+919529433664", password: "Ishwar", fullName: "Ishwar (Demo Pune)", shopName: "Ishwar Trade & Hardware", city: "Pune", pincode: "411019", lat: 18.5204, lng: 73.8567 },
  { phone: "+918983433664", password: "Ganesh", fullName: "Ganesh (Demo Kolhar)", shopName: "Ganesh General Stores", city: "Kolhar", pincode: "414001", lat: 19.2459, lng: 74.6913 },
];
for (const d of DEMOS) {
  const imp = await jf("/api/admin/customers/import", {
    method: "POST", headers: H,
    body: JSON.stringify({ rows: [{ ...d, customerType: "RETAILER", tier: "tier4", demoPassword: d.password }] }),
  });
  const row = imp.results?.[0];
  if (!row?.id) { console.log(`  ! demo ${d.phone}: import issue ${JSON.stringify(imp).slice(0, 200)}`); continue; }
  // import forces mustChangePassword — the demo logins must go straight in
  await jf("/api/admin/crud/customers", { method: "PATCH", headers: H, body: JSON.stringify({ id: row.id, mustChangePassword: false }) });
  console.log(`  ✓ demo customer ${d.fullName} (${d.phone}) — ${row.action}d, direct login ready`);
}

// 4 ── verification
const cat2 = await jf("/api/catalog");
console.log("\n=== catalog verification ===");
for (const t of cat2.tops ?? []) console.log(`  ${t.name}: image=${t.image ? "SET" : "MISSING"} · ${nf(t.productCount)} SKUs`);
console.log("\n=== demo login verification ===");
for (const d of DEMOS) {
  try {
    const l = await jf("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: d.phone, password: d.password }) });
    const wh = (cat2.warehouses ?? []).find((w) => /PUNE/i.test(w.name) === /Pune/i.test(d.fullName));
    const whPick = await fetch(BASE + "/api/auth/select-warehouse", { method: "POST", headers: { "content-type": "application/json", "x-customer-token": l.token }, body: JSON.stringify({ warehouseId: wh?.id }) });
    const setCookie = whPick.headers.get("set-cookie") || "";
    const whCookie = setCookie.match(/dmk_wh=([^;]+)/)?.[1] || "";
    const prod = await jf("/api/products?limit=1", { headers: { "x-customer-token": l.token, cookie: `dmk_wh=${whCookie}` } });
    console.log(`  ${d.phone}/${d.password}: login OK (${l.customer?.shopName}) → warehouse ${wh?.name} → ${nf(prod.total)} products visible`);
  } catch (e) {
    console.log(`  ! demo ${d.phone}: ${String(e.message).slice(0, 160)}`);
  }
}
console.log("\nDONE");
