import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// NOTE: no `log: ['query']` — SQL logging on serverless adds heavy serialization
// overhead to every request and can leak data into logs. Enable temporarily for debugging only.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
