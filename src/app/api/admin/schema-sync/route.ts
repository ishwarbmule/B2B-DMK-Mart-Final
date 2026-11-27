/**
 * POST /api/admin/schema-sync — idempotent DDL for columns the Prisma schema
 * expects but a stale production database may still lack. The sandbox has no
 * DB credentials (they live in Vercel env), so additive migrations run here:
 * deploy → admin calls this once → every `ADD COLUMN IF NOT EXISTS` is safe
 * to repeat. GET returns the column audit without touching anything.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const STATEMENTS: Array<{ table: string; sql: string; column: string }> = [
  {
    table: "Warehouse",
    column: "image",
    sql: `ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "image" TEXT NOT NULL DEFAULT ''`,
  },
  {
    table: "Order",
    column: "editedAt",
    sql: `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3)`,
  },
  {
    table: "Order",
    column: "editedBy",
    sql: `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "editedBy" TEXT NOT NULL DEFAULT ''`,
  },
  {
    table: "Order",
    column: "customerNotifiedAt",
    sql: `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerNotifiedAt" TIMESTAMP(3)`,
  },
  {
    table: "Order",
    column: "verifiedAt",
    sql: `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3)`,
  },
  {
    table: "Order",
    column: "verifiedBy",
    sql: `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "verifiedBy" TEXT NOT NULL DEFAULT ''`,
  },
  {
    table: "SalesPerson",
    column: "warehouseId",
    sql: `ALTER TABLE "SalesPerson" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT NOT NULL DEFAULT ''`,
  },
];

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const results: Array<{ table: string; column: string; exists: boolean }> = [];
  for (const s of STATEMENTS) {
    const rows = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2) AS "exists"`,
      s.table, s.column,
    );
    results.push({ table: s.table, column: s.column, exists: Boolean(rows[0]?.exists) });
  }
  return NextResponse.json({ ok: true, columns: results });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const applied: string[] = [];
  const already: string[] = [];
  try {
    for (const s of STATEMENTS) {
      const rows = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2) AS "exists"`,
        s.table, s.column,
      );
      if (rows[0]?.exists) {
        already.push(`${s.table}.${s.column}`);
        continue;
      }
      await db.$executeRawUnsafe(s.sql);
      applied.push(`${s.table}.${s.column}`);
    }
    return NextResponse.json({ ok: true, applied, alreadyPresent: already });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Schema sync failed", 500);
  }
}
