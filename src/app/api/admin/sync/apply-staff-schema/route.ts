/**
 * POST /api/admin/sync/apply-staff-schema — one-shot idempotent migration for the
 * sales-team + warehouse-manager systems:
 *   - SalesPerson: username, password, email, area, active
 *   - WarehouseManager table (+ FK → Warehouse, unique username)
 *   - Order: warehouseId, warehouseName (serving warehouse routing)
 *   - Customer: createdBy
 * Safe to run repeatedly (Hostinger = MariaDB, supports ADD COLUMN IF NOT EXISTS).
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function colExists(table: string, column: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ c: number }[]>(
    Prisma.sql`SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    // ── WarehouseManager table ──
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`WarehouseManager\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`username\` VARCHAR(191) NOT NULL,
        \`password\` VARCHAR(191) NOT NULL,
        \`phone\` VARCHAR(191) NOT NULL DEFAULT '',
        \`email\` VARCHAR(191) NOT NULL DEFAULT '',
        \`warehouseId\` VARCHAR(191) NOT NULL,
        \`permissions\` TEXT NULL,
        \`active\` BOOLEAN NOT NULL DEFAULT true,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`WarehouseManager_username_key\` (\`username\`),
        INDEX \`WarehouseManager_warehouseId_idx\` (\`warehouseId\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    applied.push("CREATE TABLE WarehouseManager (if missing)");

    try {
      await db.$executeRawUnsafe("ALTER TABLE `WarehouseManager` ADD CONSTRAINT `fk_wm_warehouse` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE CASCADE ON UPDATE CASCADE");
      applied.push("FK fk_wm_warehouse");
    } catch { skipped.push("FK fk_wm_warehouse (already present)"); }

    // ── New columns ──
    const alters: Array<[string, string, string]> = [
      ["SalesPerson", "username", "ALTER TABLE `SalesPerson` ADD COLUMN IF NOT EXISTS `username` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["SalesPerson", "password", "ALTER TABLE `SalesPerson` ADD COLUMN IF NOT EXISTS `password` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["SalesPerson", "email", "ALTER TABLE `SalesPerson` ADD COLUMN IF NOT EXISTS `email` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["SalesPerson", "area", "ALTER TABLE `SalesPerson` ADD COLUMN IF NOT EXISTS `area` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["SalesPerson", "active", "ALTER TABLE `SalesPerson` ADD COLUMN IF NOT EXISTS `active` BOOLEAN NOT NULL DEFAULT true"],
      ["Order", "warehouseId", "ALTER TABLE `Order` ADD COLUMN IF NOT EXISTS `warehouseId` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["Order", "warehouseName", "ALTER TABLE `Order` ADD COLUMN IF NOT EXISTS `warehouseName` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["Customer", "createdBy", "ALTER TABLE `Customer` ADD COLUMN IF NOT EXISTS `createdBy` VARCHAR(191) NOT NULL DEFAULT ''"],
    ];
    for (const [table, column, sql] of alters) {
      if (await colExists(table, column)) { skipped.push(`${table}.${column} (exists)`); continue; }
      await db.$executeRawUnsafe(sql);
      applied.push(`${table}.${column}`);
    }

    await db.activityLog.create({
      data: { action: "MIGRATE", entity: "schema", detail: `staff-schema applied: ${applied.length} changes (${skipped.length} already present)` },
    }).catch(() => {});

    return NextResponse.json({ ok: true, applied, skipped });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 400) : "Migration failed", 500);
  }
}
