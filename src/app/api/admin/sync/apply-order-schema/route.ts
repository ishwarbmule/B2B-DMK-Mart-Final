/**
 * POST /api/admin/sync/apply-order-schema — one-shot idempotent migration:
 *   - Warehouse + WarehouseStock tables (multi-godown stock)
 *   - Customer: creditBalance, approvedAt, approvedBy
 *   - Order: confirmedAt, confirmedBy, nextDeliveryAt
 *   - OrderItem: serialNo, lineStatus, plannedNote
 * Safe to run repeatedly (IF NOT EXISTS everywhere; Hostinger = MariaDB).
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
    // ── New tables ──
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`Warehouse\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NOT NULL DEFAULT '',
        \`address\` TEXT NULL,
        \`city\` VARCHAR(191) NOT NULL DEFAULT '',
        \`phone\` VARCHAR(191) NOT NULL DEFAULT '',
        \`isDefault\` BOOLEAN NOT NULL DEFAULT false,
        \`active\` BOOLEAN NOT NULL DEFAULT true,
        \`sortOrder\` INTEGER NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    applied.push("CREATE TABLE Warehouse (if missing)");

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`WarehouseStock\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`warehouseId\` VARCHAR(191) NOT NULL,
        \`productId\` VARCHAR(191) NOT NULL,
        \`qty\` INTEGER NOT NULL DEFAULT 0,
        \`updatedAt\` DATETIME(3) NOT NULL,
        UNIQUE INDEX \`WarehouseStock_warehouseId_productId_key\` (\`warehouseId\`, \`productId\`),
        INDEX \`WarehouseStock_productId_idx\` (\`productId\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    applied.push("CREATE TABLE WarehouseStock (if missing)");

    // FKs (best-effort — may already exist)
    for (const [fk, sql] of [
      ["fk_ws_warehouse", "ALTER TABLE `WarehouseStock` ADD CONSTRAINT `fk_ws_warehouse` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
      ["fk_ws_product", "ALTER TABLE `WarehouseStock` ADD CONSTRAINT `fk_ws_product` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
    ] as const) {
      try { await db.$executeRawUnsafe(sql); applied.push(`FK ${fk}`); }
      catch { skipped.push(`FK ${fk} (already present or pending)`); }
    }

    // ── New columns ──
    const alters: Array<[string, string, string]> = [
      ["Customer", "creditBalance", "ALTER TABLE `Customer` ADD COLUMN IF NOT EXISTS `creditBalance` DOUBLE NOT NULL DEFAULT 0"],
      ["Customer", "approvedAt", "ALTER TABLE `Customer` ADD COLUMN IF NOT EXISTS `approvedAt` DATETIME(3) NULL"],
      ["Customer", "approvedBy", "ALTER TABLE `Customer` ADD COLUMN IF NOT EXISTS `approvedBy` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["Order", "confirmedAt", "ALTER TABLE `Order` ADD COLUMN IF NOT EXISTS `confirmedAt` DATETIME(3) NULL"],
      ["Order", "confirmedBy", "ALTER TABLE `Order` ADD COLUMN IF NOT EXISTS `confirmedBy` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["Order", "nextDeliveryAt", "ALTER TABLE `Order` ADD COLUMN IF NOT EXISTS `nextDeliveryAt` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["OrderItem", "serialNo", "ALTER TABLE `OrderItem` ADD COLUMN IF NOT EXISTS `serialNo` INTEGER NOT NULL DEFAULT 0"],
      ["OrderItem", "lineStatus", "ALTER TABLE `OrderItem` ADD COLUMN IF NOT EXISTS `lineStatus` VARCHAR(191) NOT NULL DEFAULT 'OK'"],
      ["OrderItem", "plannedNote", "ALTER TABLE `OrderItem` ADD COLUMN IF NOT EXISTS `plannedNote` VARCHAR(191) NOT NULL DEFAULT ''"],
    ];
    for (const [table, column, sql] of alters) {
      if (await colExists(table, column)) { skipped.push(`${table}.${column} (exists)`); continue; }
      await db.$executeRawUnsafe(sql);
      applied.push(`${table}.${column}`);
    }

    await db.activityLog.create({
      data: { action: "MIGRATE", entity: "schema", detail: `order-schema applied: ${applied.length} changes (${skipped.length} already present)` },
    }).catch(() => {});

    return NextResponse.json({ ok: true, applied, skipped });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 400) : "Migration failed", 500);
  }
}
