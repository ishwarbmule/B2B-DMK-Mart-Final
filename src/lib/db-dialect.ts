/**
 * DB dialect detection — production runs Neon Postgres, local dev runs the
 * SQLite twin, and the ERP-era routes may still meet MySQL. Raw SQL in routes
 * MUST branch on this instead of assuming one dialect (backticks / TEMPORARY
 * TABLE / UPDATE..JOIN are MySQL-only and 500 on Postgres: "syntax error at
 * or near \"`\"").
 */
import { db } from "@/lib/db";

export type Dialect = "sqlite" | "postgres" | "mysql";

let detected: Dialect | null = null;

export async function dbDialect(): Promise<Dialect> {
  if (detected) return detected;
  // SQLite twin answers sqlite_version(); Postgres and MySQL both have version().
  try {
    await db.$queryRawUnsafe("SELECT sqlite_version() AS v");
    detected = "sqlite";
    return detected;
  } catch {
    /* not sqlite */
  }
  try {
    const rows = (await db.$queryRawUnsafe("SELECT version() AS v")) as Array<Record<string, unknown>>;
    const v = String(rows?.[0]?.v ?? rows?.[0]?.["version()"] ?? "");
    detected = v.toLowerCase().includes("postgres") ? "postgres" : "mysql";
  } catch {
    detected = "mysql";
  }
  return detected;
}
