// READ-ONLY diagnostic — why unselected-warehouse products appear in admin.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const getSettingRows = async (keys) =>
  db.$queryRaw`SELECT key, value FROM "Setting" WHERE key = ANY(${keys}) ORDER BY key`;

// 1. Saved selection + mappings (truncate long values)
const KEYS = [
  'erp_sync_selected_warehouses', // legacy codes
  'erp_sync_selected_whids',      // current ERP godown row IDs
  'erp_wh_neon_map',              // ERP godown ID -> Neon Warehouse.id
];
const settings = await getSettingRows(KEYS);
console.log('=== SETTINGS ===');
for (const s of settings) {
  let v = s.value || '';
  if (v.length > 400) v = v.slice(0, 400) + ` …(+${v.length - 400} chars)`;
  console.log(`${s.key} = ${v}`);
}
for (const k of KEYS) if (!settings.find((s) => s.key === k)) console.log(`${k} = (MISSING)`);

// 2. Warehouses in Neon
const whs = await db.$queryRaw`
  SELECT w.id, w.code, w.name, w.city, w.active, w.source,
    (SELECT count(*)::int FROM "WarehouseStock" s WHERE s."warehouseId" = w.id) AS stock_rows,
    (SELECT count(*)::int FROM "WarehouseStock" s WHERE s."warehouseId" = w.id AND s.qty > 0) AS nonzero_rows
  FROM "Warehouse" w ORDER BY w.source, w.active DESC, w.name`;
console.log('\n=== WAREHOUSES ===');
for (const w of whs)
  console.log(`${w.source} · active=${w.active} · code=${w.code} · "${w.name}" (${w.city}) · stockRows=${w.stock_rows} (nonzero ${w.nonzero_rows}) · id=${w.id}`);

// 3. Stock rows living in INACTIVE (unselected) ERP warehouses — the visible leak
const leaked = await db.$queryRaw`
  SELECT w.id AS wh_id, w.code, w.name, w.active, count(*)::int AS rows, sum(CASE WHEN s.qty > 0 THEN 1 ELSE 0 END)::int AS nonzero
  FROM "WarehouseStock" s JOIN "Warehouse" w ON w.id = s."warehouseId"
  WHERE w.source = 'ERP' AND w.active = false
  GROUP BY w.id, w.code, w.name, w.active ORDER BY rows DESC`;
console.log('\n=== STOCK ROWS IN INACTIVE (UNSELECTED) ERP WAREHOUSES ===');
if (!leaked.length) console.log('(none)');
for (const l of leaked) console.log(`wh="${l.name}" code=${l.code} rows=${l.rows} nonzero=${l.nonzero} whId=${l.wh_id}`);

// 4. WarehouseStock rows joined to LOCAL warehouses (non-ERP) for contrast
const localRows = await db.$queryRaw`
  SELECT w.name, w.active, count(*)::int AS rows
  FROM "WarehouseStock" s JOIN "Warehouse" w ON w.id = s."warehouseId"
  WHERE w.source <> 'ERP' GROUP BY w.name, w.active ORDER BY rows DESC`;
if (localRows.length) {
  console.log('\n=== STOCK ROWS IN NON-ERP WAREHOUSES ===');
  for (const l of localRows) console.log(`wh="${l.name}" active=${l.active} rows=${l.rows}`);
}

// 5. Product visibility vs ERP stock coverage
const prod = await db.$queryRaw`
  SELECT
    count(*)::int AS total,
    sum(CASE WHEN active THEN 1 ELSE 0 END)::int AS active,
    sum(CASE WHEN "syncSource" = 'ERP' THEN 1 ELSE 0 END)::int AS erp_src,
    sum(CASE WHEN "syncSource" = 'ERP' AND active THEN 1 ELSE 0 END)::int AS erp_active,
    sum(CASE WHEN "activeSource" = 'ADMIN' THEN 1 ELSE 0 END)::int AS admin_override,
    sum(CASE WHEN "isTop" THEN 1 ELSE 0 END)::int AS top_flag
  FROM "Product"`;
console.log('\n=== PRODUCTS ===', JSON.stringify(prod[0]));

const covered = await db.$queryRaw`
  SELECT count(DISTINCT s."productId")::int AS covered
  FROM "WarehouseStock" s JOIN "Warehouse" w ON w.id = s."warehouseId"
  WHERE w.source = 'ERP' AND w.active = true`;
console.log('products with stock rows in ACTIVE ERP warehouses:', covered[0].covered);

// active ERP-sourced products with NO stock row in any active ERP warehouse
const ghosts = await db.$queryRaw`
  SELECT count(*)::int AS n FROM "Product" p
  WHERE p.active = true AND p."syncSource" = 'ERP'
    AND NOT EXISTS (
      SELECT 1 FROM "WarehouseStock" s JOIN "Warehouse" w ON w.id = s."warehouseId"
      WHERE s."productId" = p.id AND w.source = 'ERP' AND w.active = true)`;
console.log('ACTIVE ERP products with NO stock in any active ERP warehouse (ghost products):', ghosts[0].n);

// 6. Sample of ghost products
const ghostSample = await db.$queryRaw`
  SELECT p.sku, p.name, p.company, p.stock, p."activeSource", p."isTop"
  FROM "Product" p
  WHERE p.active = true AND p."syncSource" = 'ERP'
    AND NOT EXISTS (
      SELECT 1 FROM "WarehouseStock" s JOIN "Warehouse" w ON w.id = s."warehouseId"
      WHERE s."productId" = p.id AND w.source = 'ERP' AND w.active = true)
  ORDER BY p."updatedAt" DESC LIMIT 15`;
console.log('\n=== GHOST SAMPLE (active but not stocked in a selected warehouse) ===');
for (const g of ghostSample) console.log(`${g.sku} · "${(g.name||'').slice(0,40)}" · ${g.company} · stock=${g.stock} · src=${g.activeSource} · top=${g.isTop}`);

await db.$disconnect();
