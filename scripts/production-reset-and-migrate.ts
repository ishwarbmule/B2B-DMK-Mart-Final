/**
 * PRODUCTION CLEANUP + OLD-CUSTOMER MIGRATION (one-time).
 *
 * 1. Wipes every demo/transactional table: products, orders + items, customers,
 *    ERP mirror, sync events, price logs, activity logs, OTPs, purchases, returns,
 *    stock transfers, coupons, demo staff.
 * 2. Imports the 30 old-website customers from B2B_DMK_Mart_Customers_Export.xlsx:
 *      - password 1234 (sha256) + mustChangePassword=true → forced "set new password"
 *        popup on their first login
 *      - status APPROVED (sheet: Active) · source WEB (login requirement) · createdBy MIGRATION
 *      - createdAt from the sheet's Registration Date
 *      - location geocoded (Nominatim → gazetteer fallback) so every customer appears
 *        as a pin on the admin Store Map immediately
 *
 * Run:  bun scripts/production-reset-and-migrate.ts
 */
import { readFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const XLSX_CANDIDATES = [
  "/home/z/my-project/upload/B2B_DMK_Mart_Customers_Export.xlsx",
  "/tmp/customers.xlsx",
];

type Row = Record<string, string | number>;

function readRows(): Row[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  for (const p of XLSX_CANDIDATES) {
    if (existsSync(p)) {
      const wb = XLSX.readFile(p);
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as Row[];
    }
  }
  throw new Error("Customer export XLSX not found in " + XLSX_CANDIDATES.join(" | "));
}

/* ───────────── geocoding (Nominatim + gazetteer fallback) ───────────── */

const GAZETTEER: { match: RegExp; lat: number; lng: number }[] = [
  { match: /wagholi|whagholi/i, lat: 18.7459, lng: 73.9539 },
  { match: /kesnand|kesnandi/i, lat: 18.7517, lng: 73.9686 },
  { match: /kharadi|it ?park|add\b/i, lat: 18.5513, lng: 73.9456 },
  { match: /manjari/i, lat: 18.5167, lng: 73.9783 },
  { match: /lohegaon/i, lat: 18.5957, lng: 73.9196 },
  { match: /dhanora|dhanore/i, lat: 18.7400, lng: 73.9350 },
  { match: /shirdi/i, lat: 19.7662, lng: 74.4774 },
  { match: /paratwada|achalpur|amravati/i, lat: 21.3566, lng: 77.4055 },
  { match: /supa/i, lat: 19.0340, lng: 74.5290 },
  { match: /kolhar/i, lat: 18.9500, lng: 74.4700 },
  { match: /parner/i, lat: 19.0610, lng: 74.4420 },
  { match: /pune/i, lat: 18.5204, lng: 73.8567 },
];

function gazetteer(text: string): { lat: number; lng: number } | null {
  for (const g of GAZETTEER) if (g.match.test(text)) return { lat: g.lat, lng: g.lng };
  return null;
}

const UA = "DMK-Mart-B2B-Migration/1.0 (contact: dmkmartdata@gmail.com)";
const geoCache = new Map<string, { lat: number; lng: number } | null>();

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  const key = q.toLowerCase().trim();
  if (geoCache.has(key)) return geoCache.get(key) ?? null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ", Maharashtra, India")}&format=json&limit=1&countrycodes=in`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const hits = (await res.json()) as { lat: string; lon: string }[];
      if (hits.length) {
        const hit = { lat: Number(hits[0].lat), lng: Number(hits[0].lon) };
        geoCache.set(key, hit);
        return hit;
      }
    }
  } catch { /* fall through */ }
  geoCache.set(key, null);
  return null;
}

async function locate(row: Row): Promise<{ lat: number; lng: number; source: string } | null> {
  const store = String(row["Store Address"] ?? "").trim();
  const city = String(row["City"] ?? "").trim();
  const area = String(row["State / Area"] ?? "").trim();
  const query = [store, city, area].filter(Boolean).join(", ");
  if (!query) return null;
  const hit = await geocode(query);
  if (hit) return { ...hit, source: "NOMINATIM" };
  const fb = gazetteer(query);
  if (fb) return { ...fb, source: "GAZETTEER" };
  return null;
}

/* ───────────── main ───────────── */

async function main() {
  console.log("── 1. wiping demo / transactional data ──");
  const wiped: string[] = [];
  for (const table of [
    "orderItem", "order", "product", "erpProductMirror", "syncEvent", "priceChangeLog",
    "activityLog", "otpCode", "purchase", "returnRequest", "stockTransferItem",
    "stockTransfer", "coupon", "salesPerson", "warehouseManager", "deliveryMan", "customer",
  ] as const) {
    const model = (db as unknown as Record<string, { deleteMany: (a?: unknown) => Promise<{ count: number }> }>)[
      table === "order" ? "order" : table
    ];
    const r = await model.deleteMany({});
    wiped.push(`${table}:${r.count}`);
  }
  console.log("   deleted →", wiped.join("  "));

    console.log("── 1b. purging retired direct-ERP MySQL settings ──");
  const oldKeys = [
    "erp_db_host", "erp_db_port", "erp_db_user", "erp_db_password", "erp_db_name",
    "erp_products_table", "erp_sync_enabled", "erp_write_enabled",
    "erp_write_unlocked_at", "erp_product_aliases", "erp_auto_sync_minutes",
    "erp_image_base", "erp_last_pull_at",
  ];
  for (const key of oldKeys) await db.setting.deleteMany({ where: { key } });
  console.log(`   removed ${oldKeys.length} legacy keys (kept: erp_universal_*, cron_secret, sms_*, site settings)`);

console.log("── 2. importing old-website customers ──");
  const rows = readRows();
  console.log(`   sheet rows: ${rows.length}`);

  const seenPhones = new Set<string>();
  let imported = 0, geocoded = 0, noGeo = 0, skipped = 0;
  const preview: string[] = [];

  for (const row of rows) {
    const phone = String(row["Mobile Phone"] ?? "").replace(/\D/g, "").slice(-10);
    const name = String(row["Full Name"] ?? "").trim();
    if (!phone || !name) { skipped++; continue; }
    if (seenPhones.has(phone)) { skipped++; continue; }
    seenPhones.add(phone);

    const email = String(row["Email Address"] ?? "").trim().toLowerCase();
    const shop = String(row["Company / Shop Name"] ?? "").trim();
    const address = String(row["Store Address"] ?? "").trim();
    const city = String(row["City"] ?? "").trim();
    const pin = String(row["Pincode"] ?? "").replace(/\D/g, "").slice(0, 6);
    const regDate = String(row["Registration Date"] ?? "").trim();
    const createdAt = regDate && !Number.isNaN(new Date(regDate.replace(" ", "T")).getTime())
      ? new Date(regDate.replace(" ", "T"))
      : new Date();

    const loc = await locate(row);
    if (loc) geocoded++; else noGeo++;

    await db.customer.create({
      data: {
        name,
        shopName: shop || name,
        phone,
        email,
        password: sha("1234"),
        mustChangePassword: true,
        address: address || city,
        city: city || "Pune",
        pincode: pin,
        customerType: "RETAILER",
        tier: "tier4",
        status: "APPROVED",
        approvedAt: createdAt,
        approvedBy: "MIGRATION",
        source: "WEB",
        createdBy: "MIGRATION",
        createdAt,
        ...(loc ? { lat: loc.lat, lng: loc.lng, geoSource: "ADMIN", geoUpdatedAt: new Date() } : {}),
      },
    });
    imported++;
    preview.push(`${name.padEnd(22)} ${phone} → ${loc ? `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)} (${loc.source})` : "no pin"}`);
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim usage policy: ~1 req/s
  }

  console.log(preview.map((l) => "   " + l).join("\n"));
  console.log(`── summary ──`);
  console.log(`   imported: ${imported} · geocoded: ${geocoded} · no-pin: ${noGeo} · skipped(dup/invalid): ${skipped}`);

  const counts = {
    customers: await db.customer.count(),
    mustChange: await db.customer.count({ where: { mustChangePassword: true } }),
    pinned: await db.customer.count({ where: { NOT: { lat: null } } }),
    products: await db.product.count(),
    orders: await db.order.count(),
  };
  console.log("   final counts:", JSON.stringify(counts));
}

main()
  .catch((e) => { console.error("MIGRATION FAILED:", e); process.exit(1); })
  .finally(() => db.$disconnect());
