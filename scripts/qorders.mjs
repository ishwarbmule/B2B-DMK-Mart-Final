import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const latest = await db.order.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, grandTotal: true, status: true, source: true } });
const earliest = await db.order.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
const total = await db.order.count();
const last30 = await db.order.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } });
const last90 = await db.order.count({ where: { createdAt: { gte: new Date(Date.now() - 90 * 86400000) } } });
const all = await db.order.findMany({ select: { createdAt: true, grandTotal: true }, orderBy: { createdAt: "desc" }, take: 500 });
const byMonth = {};
for (const o of all) {
  const m = o.createdAt.toISOString().slice(0, 7);
  byMonth[m] = byMonth[m] || { count: 0, revenue: 0 };
  byMonth[m].count++;
  byMonth[m].revenue += o.grandTotal;
}
console.log(JSON.stringify({ now: new Date().toISOString(), total, last30, last90, latest, earliest, byMonth }, null, 1));
await db.$disconnect();
