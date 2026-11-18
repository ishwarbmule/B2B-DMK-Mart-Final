// Verify Neon app DB: table list + row counts of key models.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
console.log('TABLES (' + tables.length + '):', tables.map((t) => t.tablename).join(', '));

const counts = {};
for (const m of ['User', 'Order', 'OrderItem', 'Cart', 'Setting', 'Brand', 'Category', 'Product', 'ErpProductMirror', 'Warehouse', 'WarehouseStock', 'SiteContent']) {
  try { counts[m] = await db[m].count(); } catch (e) { counts[m] = 'ERR ' + e.message.slice(0, 60); }
}
console.log('ROW COUNTS:', JSON.stringify(counts, null, 2));
await db.$disconnect();
