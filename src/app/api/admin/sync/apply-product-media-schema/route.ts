/**
 * POST /api/admin/sync/apply-product-media-schema — one-shot idempotent migration:
 * widens Product media/SEO columns that overflow Prisma's default VARCHAR(191):
 *   - Product.gallery  VARCHAR(191) → TEXT  (JSON array of Cloudinary URLs)
 *   - Product.seoDesc  VARCHAR(191) → TEXT
 *   - Product.keywords VARCHAR(191) → TEXT
 * Safe to run repeatedly (checks information_schema first; Hostinger = MariaDB).
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function colType(table: string, column: string): Promise<string | null> {
  const rows = await db.$queryRaw<{ DATA_TYPE: string }[]>(
    Prisma.sql`SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`
  );
  return rows[0]?.DATA_TYPE ?? null;
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    const targets: Array<[string, string]> = [
      ["gallery", "MODIFY COLUMN `gallery` TEXT NOT NULL"],
      ["seoDesc", "MODIFY COLUMN `seoDesc` TEXT NOT NULL"],
      ["keywords", "MODIFY COLUMN `keywords` TEXT NOT NULL"],
    ];
    for (const [column, modify] of targets) {
      const type = await colType("Product", column);
      if (type === "text") { skipped.push(`Product.${column} (already TEXT)`); continue; }
      await db.$executeRawUnsafe(`ALTER TABLE \`Product\` ${modify}`);
      applied.push(`Product.${column}: ${type ?? "?"} → TEXT`);
    }

    await db.activityLog.create({
      data: { action: "MIGRATE", entity: "schema", detail: `product-media-schema applied: ${applied.length} widened (${skipped.length} already TEXT)` },
    }).catch(() => {});

    return NextResponse.json({ ok: true, applied, skipped });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 400) : "Migration failed", 500);
  }
}
