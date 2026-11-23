/**
 * Customer migration runner — imports the old-website customer export into the
 * live B2B site as APPROVED accounts with demo password 1234.
 *
 * For every Excel row it:
 *   • resolves the shop's real location (address → city → area keyword scan)
 *     to a canonical city (drives warehouse visibility + location pricing)
 *   • computes the belt ("PUNE" | "KOLHAR") the shop belongs to
 *   • places a store-map pin at that area (tiny deterministic jitter per phone so
 *     neighbouring shops don't stack into one marker)
 *
 * Usage:
 *   npx tsx scripts/import-customers-migration.ts --dry   # plan only, no writes
 *   npx tsx scripts/import-customers-migration.ts         # login + POST to production
 */
import { readFileSync } from "fs";

const BASE = process.env.PROD_BASE || "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "1234";

// area keyword (word-boundary matched, priority order) → canonical city + map pin
const AREA_KEYWORDS: Array<[string, string, number, number]> = [
  ["paratwada", "Paratwada", 21.356, 77.519],
  ["shirdi", "Shirdi", 19.7645, 74.4775],
  ["supa", "Supa", 18.9213, 74.4343],
  ["supe", "Supe", 18.8888, 74.4751],
  ["kolhar", "Kolhar", 19.1002, 74.6999],
  ["kesnand", "Kesnand", 18.7687, 73.9458],
  ["dhanora", "Dhanora", 18.749, 73.972],
  ["manjari", "Manjari", 18.5157, 73.9645],
  ["lohegaon", "Lohegaon", 18.5795, 73.9179],
  ["kharadi", "Kharadi", 18.5453, 73.946],
  ["whagholi", "Wagholi", 18.7613, 73.9536],
  ["wagholi", "Wagholi", 18.7613, 73.9536],
  ["shrukwar", "Pune", 18.5123, 73.8565],
  ["shukwar", "Pune", 18.5123, 73.8565],
  ["shukrawar", "Pune", 18.5123, 73.8565],
  ["amravati", "Amravati", 20.9374, 77.7796],
  ["pune", "Pune", 18.5204, 73.8567],
];

interface ExcelRow {
  "Customer ID"?: string;
  "Full Name"?: string;
  "Company / Shop Name"?: string;
  "Email Address"?: string;
  "Mobile Phone"?: string;
  "Demo Password"?: string;
  "Store Address"?: string;
  "City"?: string;
  "State / Area"?: string;
  "Pincode"?: string;
  "Registration Date"?: string;
}

function resolveLocation(row: ExcelRow): { city: string; area: string; lat: number; lng: number; matched: string } {
  const fields = [row["Store Address"] ?? "", row["City"] ?? "", row["State / Area"] ?? ""];
  for (const [kw, canonical, lat, lng] of AREA_KEYWORDS) {
    const re = new RegExp(`\\b${kw}`, "i");
    const field = fields.find((f) => re.test(f));
    if (field) return { city: canonical, area: canonical, lat, lng: lng, matched: kw };
  }
  return { city: (row["City"] ?? "").trim(), area: "", lat: 18.5204, lng: 73.8567, matched: "— (Pune city fallback)" };
}

/** deterministic micro-jitter from the phone so same-area shops don't stack */
function jitter(phone: string): [number, number] {
  const digits = phone.split("").map(Number);
  const a = digits.reduce((s, d, i) => (i % 2 === 0 ? s + d : s), 0);
  const b = digits.reduce((s, d, i) => (i % 2 === 1 ? s + d : s), 0);
  return [((a * 7) % 11 - 5) * 0.00042, ((b * 11) % 13 - 6) * 0.00042];
}

async function main() {
  const dry = process.argv.includes("--dry");
  const src = JSON.parse(readFileSync("/home/z/my-project/scripts/customers-import.json", "utf8")) as ExcelRow[];
  console.log(`Excel rows: ${src.length}${dry ? "  (DRY RUN — no writes)" : ""}\n`);

  const rows = src.map((r) => {
    const phone = String(r["Mobile Phone"] ?? "").replace(/\D/g, "").slice(-10);
    const loc = resolveLocation(r);
    const [dLat, dLng] = jitter(phone);
    return {
      phone,
      fullName: String(r["Full Name"] ?? "").trim(),
      shopName: String(r["Company / Shop Name"] ?? "").trim(),
      email: String(r["Email Address"] ?? "").trim(),
      demoPassword: String(r["Demo Password"] ?? "1234").trim() || "1234",
      address: String(r["Store Address"] ?? "").trim(),
      city: loc.city,
      pincode: /^\d{6}$/.test(String(r["Pincode"] ?? "").trim()) ? String(r["Pincode"]).trim() : "",
      customerType: "RETAILER",
      lat: Number((loc.lat + dLat).toFixed(6)),
      lng: Number((loc.lng + dLng).toFixed(6)),
      createdAt: r["Registration Date"] && !Number.isNaN(Date.parse(r["Registration Date"])) ? new Date(r["Registration Date"]).toISOString() : undefined,
      _resolvedBy: loc.matched,
    };
  });

  // plan summary
  const byCity = new Map<string, number>();
  for (const r of rows) byCity.set(r.city, (byCity.get(r.city) ?? 0) + 1);
  console.log("Resolved shop locations:");
  for (const [city, n] of [...byCity.entries()].sort()) console.log(`  ${city.padEnd(16)} × ${n}`);
  console.log();
  for (const r of rows) {
    console.log(`  ${r.phone} · ${(r.shopName || r.fullName).slice(0, 32).padEnd(32)} → ${r.city.padEnd(12)} pin@${r.lat.toFixed(5)},${r.lng.toFixed(5)}  (${r._resolvedBy})`);
  }

  const bad = rows.filter((r) => r.phone.length !== 10);
  if (bad.length) console.log(`\n⚠ phones not 10 digits: ${bad.map((r) => r.phone).join(", ")}`);

  if (dry) {
    console.log("\nDRY RUN complete — no data sent.");
    return;
  }

  console.log("\nLogging in to production admin…");
  const loginRes = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }),
  });
  const login = await loginRes.json();
  if (!loginRes.ok || !login.token) throw new Error(`Admin login failed: ${loginRes.status} ${JSON.stringify(login).slice(0, 200)}`);
  console.log("Login OK — importing", rows.length, "customers…");

  const res = await fetch(`${BASE}/api/admin/customers/import`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ rows }),
  });
  const d = await res.json();
  console.log(`\nRESULT: ${res.status}`);
  console.log(JSON.stringify({ ok: d.ok, created: d.created, updated: d.updated, failed: d.failed, errors: d.errors }, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
