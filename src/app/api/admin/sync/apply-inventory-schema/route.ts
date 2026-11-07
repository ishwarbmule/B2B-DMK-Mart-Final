/**
 * POST|GET /api/admin/sync/apply-inventory-schema?key=<cron secret>
 *
 * One-time idempotent migration for the company-based inventory (brand removal):
 *   1. Product.company        VARCHAR(191) NOT NULL DEFAULT ''  (Excel "Company")
 *   2. Product.deliveryRate   DOUBLE NOT NULL DEFAULT 0         (Excel "Delivery Rate")
 *   3. Product.brandId        → NULLable (brands no longer required; legacy links stay)
 *   4. DROP Product.legacySku + Product.packDiscountPct (columns not in the inventory sheet)
 *   5. INDEX on company
 *   6. Backfill: company := legacy brand name where company is empty
 *
 * Auth: cron secret (env CRON_SECRET or the `cron_secret` Setting) or admin Bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET || "";
  const key = req.nextUrl.searchParams.get("key") || "";
  const auth = req.headers.get("authorization") || "";
  if (secret && (key === secret || auth === `Bearer ${secret}`)) return true;
  if (key || auth === "Bearer x") {
    try {
      const s = await db.setting.findUnique({ where: { key: "cron_secret" } });
      const dbSecret = s?.value?.trim() || "";
      if (dbSecret && (key === dbSecret || auth === `Bearer ${dbSecret}`)) return true;
    } catch { /* ignore */ }
  }
  return requireAdmin(req) === null;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: number }[]>(
    Prisma.sql`SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${column}`
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: number }[]>(
    Prisma.sql`SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ${table} AND index_name = ${index}`
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    // 1) company
    if (!(await columnExists("Product", "company"))) {
      await db.$executeRawUnsafe("ALTER TABLE `Product` ADD COLUMN `company` VARCHAR(191) NOT NULL DEFAULT ''");
      applied.push("ADD company VARCHAR(191)");
    } else skipped.push("company exists");

    // 2) deliveryRate
    if (!(await columnExists("Product", "deliveryRate"))) {
      await db.$executeRawUnsafe("ALTER TABLE `Product` ADD COLUMN `deliveryRate` DOUBLE NOT NULL DEFAULT 0");
      applied.push("ADD deliveryRate DOUBLE");
    } else skipped.push("deliveryRate exists");

    // 3) brandId nullable
    const nullability = await db.$queryRaw<{ is_nullable: string }[]>(
      Prisma.sql`SELECT is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Product' AND column_name = 'brandId'`
    );
    if (nullability[0]?.is_nullable === "NO") {
      await db.$executeRawUnsafe("ALTER TABLE `Product` MODIFY `brandId` VARCHAR(191) NULL");
      applied.push("brandId → NULL");
    } else skipped.push("brandId already nullable");

    // 4) drop columns the inventory sheet does not have
    if (await columnExists("Product", "legacySku")) {
      await db.$executeRawUnsafe("ALTER TABLE `Product` DROP COLUMN `legacySku`");
      applied.push("DROP legacySku");
    } else skipped.push("legacySku absent");
    if (await columnExists("Product", "packDiscountPct")) {
      await db.$executeRawUnsafe("ALTER TABLE `Product` DROP COLUMN `packDiscountPct`");
      applied.push("DROP packDiscountPct");
    } else skipped.push("packDiscountPct absent");

    // 5) index
    if (!(await indexExists("Product", "Product_company_idx"))) {
      await db.$executeRawUnsafe("ALTER TABLE `Product` ADD INDEX `Product_company_idx` (`company`)");
      applied.push("INDEX company");
    } else skipped.push("company index exists");

    // 6) backfill company from the legacy brand name
    const bf = await db.$executeRawUnsafe(
      "UPDATE `Product` p LEFT JOIN `Brand` b ON b.`id` = p.`brandId` SET p.`company` = b.`name` WHERE p.`company` = '' AND b.`name` IS NOT NULL"
    );
    if (Number(bf) > 0) applied.push(`backfill company from brand (${bf} rows)`);

    return NextResponse.json({ ok: true, applied, skipped });
  } catch (e) {
    return NextResponse.json(
      { ok: false, applied, error: e instanceof Error ? e.message.slice(0, 400) : "migration failed" },
      { status: 500 }
    );
  }
}
