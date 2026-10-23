import { PrismaClient } from '@prisma/client'

// Hostinger shared MySQL enforces max_connections_per_hour (500 on current plan).
// Every serverless instance opening a big Prisma pool burns through it fast,
// causing ERROR 1226 outages. Keep the per-instance pool tiny and rely on
// edge caching (catalog/products routes) to absorb traffic.
function datasourceUrl(): string | undefined {
  const raw = process.env.APP_DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "4");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
    if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "15");
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
