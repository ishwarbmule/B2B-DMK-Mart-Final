/**
 * POST /api/admin/sync/apply-storemap-schema — one-shot idempotent migration for the
 * Store Map feature (customer store locations):
 *   - Customer: lat FLOAT NULL, lng FLOAT NULL, geoSource VARCHAR(191) '', geoUpdatedAt DATETIME(3) NULL
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
  // Auth: admin Bearer token OR cron secret (?key= / Bearer) — same policy as
  // the other one-shot sync migrations (migrate-inventory etc.), so ops can
  // trigger it without interactive admin credentials.
  const key = req.nextUrl.searchParams.get("key") || "";
  const auth = (req.headers.get("authorization") || "").trim();
  const cronSecret = process.env.CRON_SECRET || "";
  let authed = false;
  if (cronSecret && (key === cronSecret || auth === `Bearer ${cronSecret}`)) {
    authed = true;
  } else {
    try {
      const s = await db.setting.findUnique({ where: { key: "cron_secret" } });
      if (s?.value && (key === s.value || auth === `Bearer ${s.value}`)) authed = true;
    } catch { /* db not reachable yet — fall through */ }
  }
  const unauthorized = requireAdmin(req);
  if (!authed && unauthorized) return unauthorized;
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    const alters: Array<[string, string, string]> = [
      ["Customer", "lat", "ALTER TABLE `Customer` ADD COLUMN IF NOT EXISTS `lat` DOUBLE NULL"],
      ["Customer", "lng", "ALTER TABLE `Customer` ADD COLUMN IF NOT EXISTS `lng` DOUBLE NULL"],
      ["Customer", "geoSource", "ALTER TABLE `Customer` ADD COLUMN IF NOT EXISTS `geoSource` VARCHAR(191) NOT NULL DEFAULT ''"],
      ["Customer", "geoUpdatedAt", "ALTER TABLE `Customer` ADD COLUMN IF NOT EXISTS `geoUpdatedAt` DATETIME(3) NULL"],
    ];
    for (const [table, column, sql] of alters) {
      if (await colExists(table, column)) { skipped.push(`${table}.${column} (exists)`); continue; }
      await db.$executeRawUnsafe(sql);
      applied.push(`${table}.${column}`);
    }

    await db.activityLog.create({
      data: { action: "MIGRATE", entity: "schema", detail: `storemap-schema applied: ${applied.length} changes (${skipped.length} already present)` },
    }).catch(() => {});

    return NextResponse.json({ ok: true, applied, skipped });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 400) : "Migration failed", 500);
  }
}
