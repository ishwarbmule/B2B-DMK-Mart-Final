/**
 * POST /api/admin/sync/apply-hero-schema — one-shot idempotent migration:
 *   - Slider.mobileImage (3:4 portrait artwork for phones)
 *   - Slider.kicker / highlight / chips / tagline (old-artwork content structure)
 *   - Slider.mobilePosition / textColor / headingScale (per-device copy zones)
 *   - Offer.contentPosition (where promo copy sits on the 16:9 sale banner)
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
      ["mobileImage", "ALTER TABLE `Slider` ADD COLUMN `mobileImage` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["kicker", "ALTER TABLE `Slider` ADD COLUMN `kicker` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["highlight", "ALTER TABLE `Slider` ADD COLUMN `highlight` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["chips", "ALTER TABLE `Slider` ADD COLUMN `chips` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["tagline", "ALTER TABLE `Slider` ADD COLUMN `tagline` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["mobilePosition", "ALTER TABLE `Slider` ADD COLUMN `mobilePosition` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["textColor", "ALTER TABLE `Slider` ADD COLUMN `textColor` VARCHAR(191) NOT NULL DEFAULT 'DARK'"],
      ["headingScale", "ALTER TABLE `Slider` ADD COLUMN `headingScale` VARCHAR(191) NOT NULL DEFAULT 'M'"],
      ["contentPosition", "ALTER TABLE `Offer` ADD COLUMN `contentPosition` VARCHAR(191) NOT NULL DEFAULT 'TOP-LEFT'"],
    ] as const) {
      const table = ddl.startsWith("ALTER TABLE `Offer`") ? "Offer" : "Slider";
      if (await colExists(table, col)) {
        skipped.push(`${table}.${col} (already exists)`);
      } else {
        await db.$executeRawUnsafe(ddl);
        applied.push(`${table}.${col}`);
      }
    }

    return NextResponse.json({ ok: true, applied, skipped });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Migration failed", 400);
  }
}
