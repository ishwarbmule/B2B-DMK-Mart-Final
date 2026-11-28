/**
 * Dump current production customers + salespersons for the Excel master sync.
 * Read-only. Writes scripts/customer-prod-state.json
 * Usage: node scripts/customer-sync-state.mjs
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const OUT = "/home/z/my-project/scripts/customer-prod-state.json";

const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 300)}`);
  return d;
};

const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

const cust = await jf("/api/admin/crud/customers", { headers: H });
const sp = await jf("/api/admin/crud/salespersons", { headers: H });
const customers = cust.rows ?? [];
const salespersons = sp.rows ?? [];

console.log("customers in prod:", customers.length);
console.log("salespersons in prod:", salespersons.length);
for (const s of salespersons) console.log(`  SP id=${s.id} name="${s.name}" mobile=${s.mobile ?? ""} active=${s.active ?? ""}`);
const byStatus = {};
for (const c of customers) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
console.log("customers by status:", byStatus);
const withPin = customers.filter(c => c.lat != null && c.lng != null).length;
console.log("customers with pin:", withPin);
const byCreatedBy = {};
for (const c of customers) byCreatedBy[c.createdBy || "(empty)"] = (byCreatedBy[c.createdBy || "(empty)"] ?? 0) + 1;
console.log("customers by createdBy:", byCreatedBy);

// compact per-customer view for matching review
const compact = customers.map(c => ({
  id: c.id, name: c.name, shopName: c.shopName, phone: c.phone, email: c.email,
  status: c.status, city: c.city, address: (c.address ?? "").slice(0, 60),
  gstin: c.gstin, lat: c.lat, lng: c.lng, geoSource: c.geoSource,
  createdBy: c.createdBy, createdAt: c.createdAt, mustChangePassword: c.mustChangePassword,
  hasPassword: !!c.password,
}));

import { writeFileSync } from "fs";
writeFileSync(OUT, JSON.stringify({ customers: compact, salespersons: salespersons.map(s => ({ id: s.id, name: s.name, mobile: s.mobile, active: s.active })) }, null, 1));
console.log("saved →", OUT);
