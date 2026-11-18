import { PrismaClient } from '@prisma/client'

// Neon Postgres (Lakebase) is the app database. The runtime URL is the POOLED
// endpoint (PgBouncer transaction mode) — Prisma must run with pgbouncer=true
// (no server-side prepared statements) and a tiny per-instance pool so Vercel
// serverless concurrency never exhausts Neon connections. Migrations use the
// DIRECT endpoint via the schema's directUrl (APP_DATABASE_URL_DIRECT).
function datasourceUrl(): string | undefined {
  const raw = process.env.APP_DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol.startsWith("postgres")) {
      if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
      if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "2");
      if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
      if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "15");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// NOTE: no `log: ['query']` — SQL logging on serverless adds heavy serialization
// overhead to every request and can leak data into logs. Enable temporarily for debugging only.
const dsUrl = datasourceUrl();
export const db =
  globalForPrisma.prisma ??
  new PrismaClient(dsUrl ? { datasources: { db: { url: dsUrl } } } : undefined)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
