// Seed minimal data into the local sqlite twin for the brochure end-to-end test.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const top = await db.topCategory.create({ data: { name: 'Hardware', sortOrder: 1 } });
const mid = await db.midCategory.create({ data: { name: 'Tools', topId: top.id } });
const end = await db.endCategory.create({ data: { name: 'Hand Tools', midId: mid.id } });

const wh = await db.warehouse.create({ data: { name: 'KOLHAR WARE HOUSE', code: 'WH-MAIN', city: 'KOLHAR', source: 'ERP', active: true, isDefault: true } });
const wh2 = await db.warehouse.create({ data: { name: 'DMK MART PUNE', code: 'PDMKMAIN01', city: 'PUNE', source: 'ERP', active: true } });

const mkProduct = (i, company, stock, isTop, isHot, isDeal) => db.product.create({
  data: {
    sku: `SKU-${1000 + i}`, slug: `test-product-${i}`, name: `Test Product ${i} ${company}`,
    company, topId: top.id, midId: mid.id, endId: end.id,
    unit: 'Pcs', dealerPrice: 100 + i, basePrice: 100 + i, mrp: 150 + i,
    tier2: 90 + i, stock, packQty: 1, gst: 18,
    image: '', gallery: '[]', description: '', active: true,
    isTop, isHot, isDeal, activeSource: 'ERP', syncSource: 'ERP',
  },
});

const p1 = await mkProduct(1, 'Alpha Brand', 10, true, false, false);
const p2 = await mkProduct(2, 'Alpha Brand', 0, true, false, false);
const p3 = await mkProduct(3, 'Beta Traders', 5, true, true, true);

await db.warehouseStock.createMany({ data: [
  { warehouseId: wh.id, productId: p1.id, qty: 10 },
  { warehouseId: wh.id, productId: p2.id, qty: 0 },
  { warehouseId: wh.id, productId: p3.id, qty: 5 },
  { warehouseId: wh2.id, productId: p3.id, qty: 2 },
]});

console.log('seeded: 3 products (2 companies), 2 warehouses, 4 stock rows');
await db.$disconnect();
