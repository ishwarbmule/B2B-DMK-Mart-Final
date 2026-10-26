/**
 * POST /api/admin/sync/apply-task15-schema — one-shot idempotent migration for Task 15:
 *   - Order: fulfillment, pickupWarehouseId, pickupWarehouseName
 *   - StockTransfer + StockTransferItem tables (warehouse → warehouse moves)
 * Safe to run repeatedly (information_schema checks everywhere; Hostinger = MariaDB).
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

async function tableExists(table: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ c: number }[]>(
    Prisma.sql`SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}`
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    // ── Order: fulfillment columns ──
    for (const [col, ddl] of [
      ["fulfillment", "ALTER TABLE `Order` ADD COLUMN `fulfillment` VARCHAR(191) NOT NULL DEFAULT 'DELIVERY'"],
      ["pickupWarehouseId", "ALTER TABLE `Order` ADD COLUMN `pickupWarehouseId` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["pickupWarehouseName", "ALTER TABLE `Order` ADD COLUMN `pickupWarehouseName` VARCHAR(191) NOT NULL DEFAULT ''"],
    ] as const) {
      if (await colExists("Order", col)) skipped.push(`Order.${col} exists`);
      else { await db.$executeRawUnsafe(ddl); applied.push(`Order.${col}`); }
    }

    // ── StockTransfer ──
    if (await tableExists("StockTransfer")) {
      skipped.push("StockTransfer exists");
    } else {
      await db.$executeRawUnsafe(`
        CREATE TABLE \`StockTransfer\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`code\` VARCHAR(191) NOT NULL,
          \`fromWarehouseId\` VARCHAR(191) NOT NULL,
          \`toWarehouseId\` VARCHAR(191) NOT NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'RECEIVED',
          \`note\` VARCHAR(191) NOT NULL DEFAULT '',
          \`itemCount\` INTEGER NOT NULL DEFAULT 0,
          \`totalQty\` INTEGER NOT NULL DEFAULT 0,
          \`createdBy\` VARCHAR(191) NOT NULL DEFAULT 'Super Admin',
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          UNIQUE INDEX \`StockTransfer_code_key\`(\`code\`),
          INDEX \`StockTransfer_fromWarehouseId_idx\`(\`fromWarehouseId\`),
          INDEX \`StockTransfer_toWarehouseId_idx\`(\`toWarehouseId\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      applied.push("CREATE TABLE StockTransfer");
      await db.$executeRawUnsafe(
        "ALTER TABLE `StockTransfer` ADD CONSTRAINT `StockTransfer_fromWarehouseId_fkey` FOREIGN KEY (`fromWarehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE"
      ).catch(() => {});
      await db.$executeRawUnsafe(
        "ALTER TABLE `StockTransfer` ADD CONSTRAINT `StockTransfer_toWarehouseId_fkey` FOREIGN KEY (`toWarehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE"
      ).catch(() => {});
    }

    // ── StockTransferItem ──
    if (await tableExists("StockTransferItem")) {
      skipped.push("StockTransferItem exists");
    } else {
      await db.$executeRawUnsafe(`
        CREATE TABLE \`StockTransferItem\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`transferId\` VARCHAR(191) NOT NULL,
          \`productId\` VARCHAR(191) NOT NULL,
          \`sku\` VARCHAR(191) NOT NULL DEFAULT '',
          \`name\` VARCHAR(191) NOT NULL DEFAULT '',
          \`qty\` INTEGER NOT NULL,
          INDEX \`StockTransferItem_transferId_idx\`(\`transferId\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      applied.push("CREATE TABLE StockTransferItem");
      await db.$executeRawUnsafe(
        "ALTER TABLE `StockTransferItem` ADD CONSTRAINT `StockTransferItem_transferId_fkey` FOREIGN KEY (`transferId`) REFERENCES `StockTransfer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"
      ).catch(() => {});
    }

    return NextResponse.json({ ok: true, applied, skipped });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Migration failed", 500);
  }
}
