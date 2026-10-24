/**
 * Extract product -> Top Category mapping from uploaded Excel
 * Output: JSON mapping keyed by SKU and by product name, plus category summary
 */
import * as XLSX from 'xlsx';
import fs from 'fs';

const FILE = '/home/z/my-project/upload/B2B_DMK_Mart_All_Products_Catalog.xlsx';

const wb = XLSX.readFile(FILE, { cellDates: false });
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log(`Sheet: ${sheetName}, total rows: ${rows.length}`);
console.log('Columns:', Object.keys(rows[0] || {}).join(' | '));

// Identify relevant columns
const cols = Object.keys(rows[0] || {});
const skuCol = cols.find(c => /SKU|Item Code/i.test(c));
const nameCol = cols.find(c => /Product Name/i.test(c));
const topCatCol = cols.find(c => /Top Category/i.test(c));
const midCatCol = cols.find(c => /Sub Category \(Mid\)/i.test(c));
const endCatCol = cols.find(c => /End Category/i.test(c));
const brandCol = cols.find(c => /Brand|Company/i.test(c));
const statusCol = cols.find(c => /^Status/i.test(c));
const pidCol = cols.find(c => /Product ID/i.test(c));

console.log('\nDetected columns:', { pidCol, skuCol, nameCol, topCatCol, midCatCol, endCatCol, brandCol, statusCol });

// Category summary
const catCounts = new Map<string, number>();
const midByTop = new Map<string, Set<string>>();
const catSamples = new Map<string, string[]>();

for (const r of rows) {
  const top = String(r[topCatCol] || '').trim();
  if (!top) continue;
  catCounts.set(top, (catCounts.get(top) || 0) + 1);
  const mid = String(r[midCatCol] || '').trim();
  if (mid) {
    if (!midByTop.has(top)) midByTop.set(top, new Set());
    midByTop.get(top)!.add(mid);
  }
  if (!catSamples.has(top)) catSamples.set(top, []);
  const s = catSamples.get(top)!;
  if (s.length < 3) s.push(String(r[nameCol] || '').trim());
}

console.log('\n=== TOP CATEGORIES (from Excel) ===');
for (const [cat, n] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${cat}: ${n} products | sample: ${catSamples.get(cat)!.join(' ; ')}`);
  const mids = midByTop.get(cat);
  if (mids && mids.size <= 15) console.log(`   sub: ${[...mids].join(' | ')}`);
}

// Save full mapping keyed by SKU (normalized) and product id
const mapping: any = { bySku: {}, byPid: {}, rows: [] };
for (const r of rows) {
  const sku = String(r[skuCol] || '').trim();
  const pid = String(r[pidCol] || '').trim();
  const name = String(r[nameCol] || '').trim();
  const top = String(r[topCatCol] || '').trim();
  const mid = String(r[midCatCol] || '').trim();
  const end = String(r[endCatCol] || '').trim();
  const brand = String(r[brandCol] || '').trim();
  const status = String(r[statusCol] || '').trim();
  const priceCols = {
    selling: cols.find(c => /Selling Price/i.test(c)),
    mrp: cols.find(c => /^MRP/i.test(c)),
    base: cols.find(c => /Base Price/i.test(c)),
    stock: cols.find(c => /Stock Quantity/i.test(c)),
    imgFile: cols.find(c => /Featured Image Filename/i.test(c)),
  };
  const row = { pid, sku, name, top, mid, end, brand, status };
  (row as any).selling = String(r[priceCols.selling!] || '').replace(/[₹,]/g, '').trim();
  (row as any).mrp = String(r[priceCols.mrp!] || '').replace(/[₹,]/g, '').trim();
  (row as any).base = String(r[priceCols.base!] || '').replace(/[₹,]/g, '').trim();
  (row as any).stock = String(r[priceCols.stock!] || '').replace(/[₹,]/g, '').trim();
  (row as any).imgFile = String(r[priceCols.imgFile!] || '').trim().split('/').pop() || '';
  mapping.rows.push(row);
  if (sku) mapping.bySku[sku] = { top, mid, end, name, pid };
  if (pid) mapping.byPid[pid] = { top, mid, end, name, sku };
}

fs.writeFileSync('/home/z/my-project/scripts/category-mapping.json', JSON.stringify(mapping, null, 1));
console.log(`\nSaved mapping: ${Object.keys(mapping.bySku).length} SKUs, ${mapping.rows.length} rows -> scripts/category-mapping.json`);
