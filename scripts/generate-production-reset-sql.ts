/**
 * Generates download/dmkmart-production-reset.sql — the ONE-PASTE phpMyAdmin
 * script that takes the PRODUCTION MySQL database (u671486929_dmkmartweb) from
 * ANY state (empty / old schema / demo data) to the clean production state.
 *
 * Contents:
 *   0. DROP all tables (IF EXISTS)                       → deterministic rebuild
 *   1. CREATE all 36 tables of the current Prisma schema (prisma migrate diff
 *      output; TEXT-column DEFAULTs stripped for MySQL 8 compatibility)
 *   2. Add all foreign keys
 *   3. INSERT storefront content migrated from the local DB: brands, the full
 *      3-level category tree, offers, pages, SEO meta, price slabs, sliders,
 *      ads, stores, zones, site settings
 *   4. INSERT the 30 old-website customers (temp password 1234 sha256, forced
 *      password change on first login, geocoded store-map pins)
 *
 * Works on MySQL 5.7 / 8.0 / 8.4 and MariaDB 10.x. Idempotent: safe to run
 * again at any time (it rebuilds everything).
 *
 * Regenerate:  DATABASE_URL=file:/home/z/B2B-DMK-Mart-Final/db/custom.db bun scripts/generate-production-reset-sql.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/* ── SQL value escaping ─────────────────────────────────────────────── */
const esc = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace("T", " ")}'`;
  return `'${String(v)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")}'`;
};
const dt = (v: Date | null) => (v ? esc(v) : "NULL");

/* ── current MySQL DDL from the Prisma schema ───────────────────────── */
function currentDdl(): string {
  const proc = Bun.spawnSync(
    ["bunx", "prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: "mysql://dummy:dummy@localhost:3306/dummy",
        APP_DATABASE_URL: "mysql://dummy:dummy@localhost:3306/dummy",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (proc.exitCode !== 0) {
    console.error(new TextDecoder().decode(proc.stderr));
    throw new Error("prisma migrate diff failed");
  }
  return new TextDecoder().decode(proc.stdout);
}

function buildSchemaSection(): { drop: string[]; creates: string; fks: string; tables: string[] } {
  const ddl = currentDdl();

  // table names, in DDL order
  const tables = [...ddl.matchAll(/^CREATE TABLE `([^`]+)`/gm)].map((m) => m[1]);

  // MySQL 5.7/8.0 reject DEFAULT on TEXT columns → strip the defaults.
  // (App code always writes these values explicitly, so nothing changes.)
  const stripped = ddl.replace(/^(\s*`[^`]+` TEXT NOT NULL) DEFAULT '[^']*'/gm, "$1");

  const creates = stripped
    .slice(0, stripped.indexOf("\n-- AddForeignKey\n"))
    .replaceAll("CREATE TABLE `", "CREATE TABLE IF NOT EXISTS `");

  const fkIdx = stripped.indexOf("\n-- AddForeignKey\n");
  const fks = fkIdx >= 0 ? stripped.slice(fkIdx + 1).trimEnd() : "";

  const drop = [...tables].reverse();
  return { drop, creates, fks, tables };
}

/* ── generic INSERT builder ─────────────────────────────────────────── */
function insertStmt(table: string, columns: string[], valueRows: string[][]): string {
  if (valueRows.length === 0) return "";
  const lines: string[] = [];
  lines.push(`INSERT INTO \`${table}\``);
  lines.push(`  (${columns.map((c) => `\`${c}\``).join(", ")})`);
  lines.push(`VALUES`);
  lines.push(valueRows.map((vals) => `  (${vals.join(", ")})`).join(",\n") + ";");
  lines.push("");
  return lines.join("\n");
}

function rowsOf(model: string, columns: string[], orderBy?: Record<string, "asc">): Promise<Record<string, unknown>[]> {
  return (db as unknown as Record<string, { findMany: (o?: object) => Promise<Record<string, unknown>[]> }>)[model].findMany(
    orderBy ? { orderBy } : undefined,
  ) as Promise<Record<string, unknown>[]>;
}

async function main() {
  const { drop, creates, fks, tables } = buildSchemaSection();
  const lines: string[] = [];

  lines.push(`-- ============================================================`);
  lines.push(`-- DMK Mart B2B — PRODUCTION BOOTSTRAP + RESET + CUSTOMER MIGRATION`);
  lines.push(`-- Paste into: hPanel → phpMyAdmin → select u671486929_dmkmartweb → SQL → Go`);
  lines.push(`--`);
  lines.push(`-- Takes the database from ANY state (empty / old schema / demo data) to`);
  lines.push(`-- the clean production state:`);
  lines.push(`--   1. Rebuilds ALL ${tables.length} tables of the current app schema`);
  lines.push(`--   2. Restores storefront content: ${"brands, category tree, offers, pages, SEO, price slabs, sliders, ads, stores, zones, settings"}`);
  lines.push(`--   3. Imports the 30 old-website customers (temp password 1234 — they`);
  lines.push(`--      must set a new password on first login; store-map pins included)`);
  lines.push(`--`);
  lines.push(`-- Compatible with MySQL 5.7/8.0/8.4 and MariaDB 10.x.`);
  lines.push(`-- Safe to re-run (full deterministic rebuild).`);
  lines.push(`-- Catalog stays empty until the first Inventory Sync pull`);
  lines.push(`-- (Admin → Inventory Sync → paste API key + secret → Re-sync now).`);
  lines.push(`-- ============================================================`);
  lines.push(``);
  lines.push(`SET NAMES utf8mb4;`);
  lines.push(`SET FOREIGN_KEY_CHECKS = 0;`);
  lines.push(``);

  /* 1 ── drop everything (deterministic rebuild, old or new schema alike) */
  lines.push(`-- 1 ── drop old tables (any previous state)`);
  for (const t of drop) lines.push(`DROP TABLE IF EXISTS \`${t}\`;`);
  lines.push(``);

  /* 2 ── create all tables (Prisma-generated DDL, MySQL-safe) */
  lines.push(`-- 2 ── create the current app schema (${tables.length} tables)`);
  lines.push(creates.trimEnd());
  lines.push(``);

  /* 3 ── foreign keys */
  lines.push(`-- 3 ── foreign key constraints`);
  lines.push(fks.trimEnd());
  lines.push(``);

  /* 4 ── storefront content (dependency order) */
  lines.push(`-- 4 ── storefront content (brands, categories, pages, offers, settings...)`);

  const content: Array<{ table: string; model: string; columns: string[]; orderBy?: string }> = [
    { table: "Zone", model: "zone", columns: ["id", "name", "createdAt"] },
    { table: "Brand", model: "brand", columns: ["id", "name", "slug", "logo", "banner", "description", "tagline", "color", "erpNames", "storefrontLayout", "storefrontConfig", "isFeatured", "sortOrder", "active", "createdAt", "updatedAt"], orderBy: "name" },
    { table: "TopCategory", model: "topCategory", columns: ["id", "name", "emoji", "image", "color", "sortOrder"], orderBy: "name" },
    { table: "MidCategory", model: "midCategory", columns: ["id", "name", "topId"], orderBy: "name" },
    { table: "EndCategory", model: "endCategory", columns: ["id", "name", "midId"], orderBy: "name" },
    { table: "Store", model: "store", columns: ["id", "name", "manager", "phone", "email", "zone", "city", "area", "status", "createdAt"] },
    { table: "Offer", model: "offer", columns: ["id", "name", "slug", "type", "headline", "subText", "ctaText", "ctaUrl", "bannerImage", "contentPosition", "bgColor", "textColor", "kickerColor", "kickerSize", "kickerSizeM", "headlineColor", "headlineSize", "headlineSizeM", "subColor", "subSize", "subSizeM", "buttonBg", "buttonTextColor", "buttonSize", "buttonSizeM", "padTop", "padBottom", "padLeft", "padRight", "padTopM", "padBottomM", "padLeftM", "padRightM", "marqueeBg", "marqueeTextColor", "marqueeSize", "marqueeSizeM", "heroSlot", "startAt", "endAt", "scopeType", "scopeIds", "discountType", "discountValue", "minOrder", "active", "createdAt"] },
    { table: "Slider", model: "slider", columns: ["id", "heading", "content", "buttonText", "buttonUrl", "image", "mobileImage", "kicker", "highlight", "chips", "tagline", "mobilePosition", "textColor", "headingScale", "kickerColor", "kickerSize", "headingColor", "headingSize", "headingColors", "highlightColor", "contentColor", "contentSize", "taglineColor", "buttonBg", "buttonTextColor", "padTop", "padBottom", "padLeft", "padRight", "position", "active", "sortOrder"] },
    { table: "Ad", model: "ad", columns: ["id", "title", "link", "image", "brandId", "active", "sortOrder"] },
    { table: "Page", model: "page", columns: ["id", "slug", "title", "type", "blocks", "metaTitle", "metaDescription", "keywords", "ogImage", "inFooter", "sortOrder", "active", "createdAt", "updatedAt"] },
    { table: "SeoMeta", model: "seoMeta", columns: ["path", "title", "description", "keywords", "ogImage", "noindex", "extraHead"] },
    { table: "PriceSlab", model: "priceSlab", columns: ["id", "title", "minQty", "discountPct", "note", "active", "createdAt"] },
    { table: "Setting", model: "setting", columns: ["key", "value"] },
  ];

  const seededCounts: Array<[string, number]> = [];
  for (const spec of content) {
    const rows = await rowsOf(spec.model, spec.columns, spec.orderBy ? { [spec.orderBy]: "asc" } : undefined);
    if (rows.length === 0) continue;
    const valueRows = rows.map((r) => spec.columns.map((c) => esc(r[c])));
    lines.push(insertStmt(spec.table, spec.columns, valueRows));
    seededCounts.push([spec.table, rows.length]);
  }
  lines.push(``);

  /* 5 ── the 30 migrated customers (forced password change + map pins) */
  lines.push(`-- 5 ── import the ${30} old-website customers`);
  const customers = await db.customer.findMany({ orderBy: { createdAt: "asc" } });
  const custCols = [
    "id", "name", "shopName", "phone", "email", "password", "mustChangePassword", "gstin", "address", "city",
    "pincode", "customerType", "tier", "creditLimit", "creditBalance", "status", "approvedAt", "approvedBy",
    "source", "erpId", "createdBy", "lat", "lng", "geoSource", "geoUpdatedAt", "orders", "totalSpent", "createdAt",
  ];
  const custRows = customers.map((c) => [
    esc(c.id), esc(c.name), esc(c.shopName), esc(c.phone), esc(c.email), esc(c.password), "1", esc(c.gstin),
    esc(c.address), esc(c.city), esc(c.pincode), esc(c.customerType), esc(c.tier), c.creditLimit, c.creditBalance,
    esc(c.status), dt(c.approvedAt), esc(c.approvedBy), esc(c.source), esc(c.erpId), esc(c.createdBy),
    c.lat ?? "NULL", c.lng ?? "NULL", esc(c.geoSource), dt(c.geoUpdatedAt), c.orders, c.totalSpent, dt(c.createdAt),
  ]);
  lines.push(insertStmt("Customer", custCols, custRows as unknown as string[][]));
  seededCounts.push(["Customer", customers.length]);
  lines.push(``);

  lines.push(`SET FOREIGN_KEY_CHECKS = 1;`);
  lines.push(``);
  lines.push(`-- Done. Next steps:`);
  lines.push(`--   1. Vercel → Settings → Environment Variables → ensure APP_DATABASE_URL,`);
  lines.push(`--      ADMIN_AUTH_SECRET, CUSTOMER_AUTH_SECRET, ADMIN_PASSWORD, CRON_SECRET,`);
  lines.push(`--      NEXT_PUBLIC_SITE_URL (+ Cloudinary if uploads are used) → Redeploy`);
  lines.push(`--   2. Admin → Inventory Sync → paste API key + push secret → Test Connection`);
  lines.push(`--   3. Re-sync now → products flow in → they appear on the storefront`);
  lines.push(`--   4. All 30 customers log in with phone + 1234 and set their own password.`);
  lines.push(``);

  const sql = lines.join("\n");
  mkdirSync("download", { recursive: true });
  writeFileSync("download/dmkmart-production-reset.sql", sql);
  // browser-downloadable copy served by the dev server at /dmkmart-production-reset.sql
  mkdirSync("public", { recursive: true });
  writeFileSync("public/dmkmart-production-reset.sql", sql);

  console.log(`written download/dmkmart-production-reset.sql (${sql.split("\n").length} lines, ${Math.round(sql.length / 1024)} KB)`);
  console.log(`tables: ${tables.length}, seeded: ${seededCounts.map(([t, n]) => `${t}=${n}`).join(", ")}`);
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exit(1); })
  .finally(() => db.$disconnect());
