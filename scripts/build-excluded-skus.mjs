// Build scripts/excluded-skus.json = union of SKUs from the two uploaded Excel files.
import fs from 'fs';

const XLSX = (await import('xlsx')).default ?? (await import('xlsx'));

const files = [
  '/home/z/my-project/upload/dmk-products-all-2026-11-27 (1).xlsx',
  '/home/z/my-project/upload/dmk-products-all-2026-11-27.xlsx',
];
const union = new Map(); // sku -> companies seen
for (const f of files) {
  const wb = XLSX.readFile(f);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  for (const r of rows) {
    const sku = String(r['SKU'] ?? '').trim();
    const company = String(r['Company'] ?? '').trim();
    if (!sku) continue;
    const entry = union.get(sku) || { sku, companies: new Set() };
    if (company) entry.companies.add(company);
    union.set(sku, entry);
  }
}
const out = [...union.values()].map((e) => ({ sku: e.sku, companies: [...e.companies] }));
fs.writeFileSync('/home/z/my-project/scripts/excluded-skus.json', JSON.stringify(out.map((e) => e.sku), null, 1));
fs.writeFileSync('/home/z/my-project/scripts/excluded-skus-full.json', JSON.stringify(out, null, 1));
console.log('SKUs written:', out.length);
console.log('with company labels:', out.filter((e) => e.companies.length).length);
