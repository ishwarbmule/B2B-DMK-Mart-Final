/**
 * POST /api/admin/sync/apply-hero-schema — one-shot idempotent migration:
 *   - Slider.mobileImage (3:4 portrait artwork for phones)
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
    if (await colExists("Slider", "mobileImage")) {
      skipped.push("Slider.mobileImage (already exists)");
    } else {
      await db.$executeRawUnsafe(
        "ALTER TABLE `Slider` ADD COLUMN `mobileImage` VARCHAR(191) NOT NULL DEFAULT ''"
      );
      applied.push("Slider.mobileImage VARCHAR(191) DEFAULT ''");
    }

    return NextResponse.json({ ok: true, applied, skipped });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Migration failed", 400);
  }
}
