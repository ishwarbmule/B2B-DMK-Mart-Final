// Clean E2E test data from the production Neon DB (fresh start for the owner).
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const e2eCustomers = await db.customer.findMany({ where: { OR: [{ email: { endsWith: '@neon.test' } }, { phone: { startsWith: '9000' } }] }, select: { id: true } });
const ids = e2eCustomers.map((c) => c.id);
console.log('e2e customers:', ids.length);

const del = await db.orderItem.deleteMany({ where: { order: { customerId: { in: ids } } } });
console.log('orderItems deleted:', del.count);
const delO = await db.order.deleteMany({ where: { customerId: { in: ids } } });
console.log('orders deleted:', delO.count);

const delC = await db.customer.deleteMany({ where: { id: { in: ids } } });
console.log('customers deleted:', delC.count);

const delP = await db.product.deleteMany({ where: { sku: { startsWith: 'E2E-' } } });
console.log('products deleted:', delP.count);

const delT = await db.topCategory.deleteMany({ where: { name: { startsWith: 'E2E ' } } });
const delM = await db.midCategory.deleteMany({ where: { name: { startsWith: 'E2E ' } } });
const delE = await db.endCategory.deleteMany({ where: { name: { startsWith: 'E2E ' } } });
console.log('categories deleted (t/m/e):', delT.count, delM.count, delE.count);

const delS = await db.setting.deleteMany({ where: { key: { in: ['erp_map_products', 'erp_map_warehouses', 'erp_map_stock'] } } });
console.log('tick settings reset:', delS.count);

console.log('remaining: customers', await db.customer.count(), '| orders', await db.order.count(), '| products', await db.product.count(), '| cats', await db.topCategory.count(), await db.midCategory.count(), await db.endCategory.count(), '| settings', await db.setting.count());
await db.$disconnect();
