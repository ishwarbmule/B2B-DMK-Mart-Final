import { NextRequest, NextResponse } from "next/server";
import { db, Prisma } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One-shot schema repair: Prisma's MySQL default maps String -> VARCHAR(191).
 *  Long values (homepage layout JSON, product descriptions from ERP, page blocks,
 *  coupon/offer copy, scope id lists) were being SILENTLY TRUNCATED at 191 chars.
 *  Converts the at-risk columns to TEXT. Idempotent — skips columns already TEXT. */

const TARGETS: [string, string][] = [
  ["Setting", "value"],
  ["Product", "description"],
  ["Brand", "description"],
  ["Brand", "tagline"],
  ["Brand", "erpNames"],
  ["Page", "blocks"],
  ["Page", "metaDescription"],
  ["SeoMeta", "description"],
  ["Offer", "headline"],
  ["Offer", "subText"],
  ["Offer", "scopeIds"],
  ["Coupon", "headline"],
  ["Coupon", "subText"],
  ["Coupon", "scopeIds"],
  ["Customer", "address"],
  ["Order", "addressLine"],
  ["Slider", "content"],
];

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const altered: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const [table, column] of TARGETS) {
    try {
      const cols = await db.$queryRaw<{ DATA_TYPE: string; CHARACTER_MAXIMUM_LENGTH: number | null }[]>(
        Prisma.sql`SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${column}`
      );
      if (!cols.length) {
        skipped.push(`${table}.${column} (not found)`);
        continue;
      }
      if (cols[0].DATA_TYPE === "text" || cols[0].DATA_TYPE === "mediumtext" || cols[0].DATA_TYPE === "longtext") {
        skipped.push(`${table}.${column} (already ${cols[0].DATA_TYPE})`);
        continue;
      }
      await db.$executeRawUnsafe(`ALTER TABLE \`${table}\` MODIFY \`${column}\` TEXT NOT NULL`);
      altered.push(`${table}.${column} (${cols[0].DATA_TYPE}(${cols[0].CHARACTER_MAXIMUM_LENGTH ?? "?"}) -> TEXT)`);
    } catch (e) {
      errors.push(`${table}.${column}: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
    }
  }

  return NextResponse.json({ ok: errors.length === 0, altered, skipped, errors });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
