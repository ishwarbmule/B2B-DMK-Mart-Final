// Read the two uploaded Excel files fully and produce the exclusion list.
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use xlsx package if available, else try python later. First check availability.
let XLSX;
try {
  XLSX = (await import('xlsx')).default ?? (await import('xlsx'));
} catch (e) {
  console.error('NO_XLSX_PACKAGE');
  process.exit(2);
}

const files = [
  '/home/z/my-project/upload/dmk-products-all-2026-11-27 (1).xlsx',
  '/home/z/my-project/upload/dmk-products-all-2026-11-27.xlsx',
];

const perFile = {};
const companies = new Set();

for (const f of files) {
  const wb = XLSX.readFile(f);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
  perFile[f] = { sheet: sheetName, count: rows.length };
  for (const r of rows) {
    const sku = String(r['SKU'] ?? '').trim();
    const name = String(r['Product Name'] ?? '').trim();
    const company = String(r['Company'] ?? '').trim();
    const gst = r['GST %'];
    const wh = r['Warehouse'] ?? r['Godown'] ?? null;
    companies.add(company || '(blank)');
    if (!perFile[f].skus) perFile[f].skus = [];
    perFile[f].skus.push({ sku, company, gst, name: name.slice(0, 60) });
  }
}

console.log('FILE SUMMARY:');
for (const [f, info] of Object.entries(perFile)) {
  console.log(`\n${path.basename(f)}: sheet=${info.sheet} rows=${info.count}`);
}
console.log('\nDISTINCT COMPANIES across both files:', JSON.stringify([...companies]));

// SKU union across both files
const union = new Set();
for (const f of files) {
  for (const s of perFile[f].skus) union.add(s.sku);
}
console.log('\nUNION SKU COUNT:', union.size);
console.log('\nALL SKUS:');
console.log([...union].join('\n'));

// Check overlap between files
const s1 = new Set(perFile[files[0]].skus.map(s => s.sku));
const s2 = new Set(perFile[files[1]].skus.map(s => s.sku));
const only1 = [...s1].filter(x => !s2.has(x));
const only2 = [...s2].filter(x => !s1.has(x));
console.log('\nOnly in file (1):', only1.length, only1.slice(0, 20));
console.log('Only in file (2):', only2.length, only2.slice(0, 20));
console.log('In both:', [...s1].filter(x => s2.has(x)).length);

// GST values present
const gsts = new Set();
for (const f of files) for (const s of perFile[f].skus) gsts.add(String(s.gst));
console.log('\nGST values in these files:', JSON.stringify([...gsts]));
