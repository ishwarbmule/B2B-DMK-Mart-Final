/**
 * POST /api/admin/sync/apply-offer-schema — one-shot idempotent migration:
 *   Offer style v2 — per-element admin styling with separate laptop & mobile values:
 *     kicker / headline / sub / button colours + px sizes (laptop & mobile),
 *     per-side content paddings (laptop defaults 50px, mobile 0 = auto),
 *     yellow scrolling-bar styling (bg / text colour / text sizes).
 * Safe to run repeatedly (information_schema check; Hostinger = MariaDB).
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
    for (const [col, ddl] of [
      ["kickerColor", "ALTER TABLE `Offer` ADD COLUMN `kickerColor` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["kickerSize", "ALTER TABLE `Offer` ADD COLUMN `kickerSize` INT NOT NULL DEFAULT 0"],
      ["kickerSizeM", "ALTER TABLE `Offer` ADD COLUMN `kickerSizeM` INT NOT NULL DEFAULT 0"],
      ["headlineColor", "ALTER TABLE `Offer` ADD COLUMN `headlineColor` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["headlineSize", "ALTER TABLE `Offer` ADD COLUMN `headlineSize` INT NOT NULL DEFAULT 0"],
      ["headlineSizeM", "ALTER TABLE `Offer` ADD COLUMN `headlineSizeM` INT NOT NULL DEFAULT 0"],
      ["subColor", "ALTER TABLE `Offer` ADD COLUMN `subColor` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["subSize", "ALTER TABLE `Offer` ADD COLUMN `subSize` INT NOT NULL DEFAULT 0"],
      ["subSizeM", "ALTER TABLE `Offer` ADD COLUMN `subSizeM` INT NOT NULL DEFAULT 0"],
      ["buttonBg", "ALTER TABLE `Offer` ADD COLUMN `buttonBg` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["buttonTextColor", "ALTER TABLE `Offer` ADD COLUMN `buttonTextColor` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["buttonSize", "ALTER TABLE `Offer` ADD COLUMN `buttonSize` INT NOT NULL DEFAULT 0"],
      ["buttonSizeM", "ALTER TABLE `Offer` ADD COLUMN `buttonSizeM` INT NOT NULL DEFAULT 0"],
      ["padTop", "ALTER TABLE `Offer` ADD COLUMN `padTop` INT NOT NULL DEFAULT 50"],
      ["padBottom", "ALTER TABLE `Offer` ADD COLUMN `padBottom` INT NOT NULL DEFAULT 50"],
      ["padLeft", "ALTER TABLE `Offer` ADD COLUMN `padLeft` INT NOT NULL DEFAULT 50"],
      ["padRight", "ALTER TABLE `Offer` ADD COLUMN `padRight` INT NOT NULL DEFAULT 50"],
      ["padTopM", "ALTER TABLE `Offer` ADD COLUMN `padTopM` INT NOT NULL DEFAULT 0"],
      ["padBottomM", "ALTER TABLE `Offer` ADD COLUMN `padBottomM` INT NOT NULL DEFAULT 0"],
      ["padLeftM", "ALTER TABLE `Offer` ADD COLUMN `padLeftM` INT NOT NULL DEFAULT 0"],
      ["padRightM", "ALTER TABLE `Offer` ADD COLUMN `padRightM` INT NOT NULL DEFAULT 0"],
      ["marqueeBg", "ALTER TABLE `Offer` ADD COLUMN `marqueeBg` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["marqueeTextColor", "ALTER TABLE `Offer` ADD COLUMN `marqueeTextColor` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["marqueeSize", "ALTER TABLE `Offer` ADD COLUMN `marqueeSize` INT NOT NULL DEFAULT 0"],
      ["marqueeSizeM", "ALTER TABLE `Offer` ADD COLUMN `marqueeSizeM` INT NOT NULL DEFAULT 0"],
    ] as const) {
      if (await colExists("Offer", col)) {
        skipped.push(`Offer.${col} (already exists)`);
      } else {
        await db.$executeRawUnsafe(ddl);
        applied.push(`Offer.${col}`);
      }
    }

    return NextResponse.json({ ok: true, applied, skipped });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Migration failed", 400);
  }
}
