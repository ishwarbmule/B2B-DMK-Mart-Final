/**
 * Layered matcher: Excel rows -> production products
 *  L1: normalized name (spaces/punct-insensitive) + brand
 *  L2: brand + price fingerprint (dealerPrice, basePrice, mrp, stock) unique within brand
 *  L3: fuzzy token-overlap name + price fingerprint agreement
 * Output: category-assignments.json + match report
 */
import fs from "fs";

const dbProducts: any[] = JSON.parse(fs.readFileSync("/tmp/db-all-products.json", "utf8"));
const mapping = JSON.parse(fs.readFileSync("/home/z/my-project/scripts/category-mapping.json", "utf8")) as any;

const STOP = new Set(["the", "and", "with", "for", "of", "a", "an", "no", "size", "color", "colour"]);
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w && !STOP.has(w)).join(" ").trim();
}
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function stripBrand(name: string, brand: string): string {
  let n = ` ${name.toLowerCase()} `;
  const b = brand.toLowerCase();
  const tokens = b.split(/[^a-z0-9]+/g).filter((t) => t.length > 2);
  for (const t of tokens) n = n.replace(new RegExp(`(^|\\s)${t}(s)?(\\s|$)`, "g"), " ");
  return n.replace(/\s+/g, " ").trim();
}
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(" "));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
const r2 = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;

// ---------- index ----------
const byName = new Map<string, any>();
const bySquash = new Map<string, any>();
const byImgFile = new Map<string, any>();
for (const p of dbProducts) {
  const brandName = p.brand?.name ?? "";
  for (const nm of [p.name, stripBrand(p.name, brandName)]) {
    const k1 = `${norm(brandName)}|${norm(nm)}`;
    const k2 = `${norm(brandName)}#${squash(nm)}`;
    if (!byName.has(k1)) byName.set(k1, p);
    if (!bySquash.has(k2)) bySquash.set(k2, p);
  }
  const img = String(p.image || "").split("?")[0].split("/").pop() || "";
  if (img && !byImgFile.has(img)) byImgFile.set(img, p);
}

// price fingerprint index within brand
const byBrandPrice = new Map<string, any[]>();
for (const p of dbProducts) {
  const bN = norm(p.brand?.name ?? "");
  const fp = `${r2(p.dealerPrice)}|${r2(p.basePrice)}|${r2(p.mrp)}|${Math.round(p.stock)}`;
  const k = `${bN}|${fp}`;
  if (!byBrandPrice.has(k)) byBrandPrice.set(k, []);
  byBrandPrice.get(k)!.push(p);
}

// ---------- match ----------
type Assign = { sku: string; dbSku: string; name: string; method: string; top: string; mid: string; end: string };
const assignments: Assign[] = [];
const unmatched: any[] = [];
const seenDb = new Set<string>(); // one db product per excel sku (dupe excel skus get same target naturally, but avoid double-assigning db products to different rows)
const usedDbIds = new Set<string>();
const stats = { L0_img: 0, L1: 0, L3: 0, none: 0 };

for (const r of mapping.rows) {
  if (!r.sku || !r.name || !r.top) continue;
  const brandN = norm(r.brand || "");
  const stripped = stripBrand(r.name, r.brand || "");
  let p: any = null, method = "";

  // L0 image filename — strongest signal (same ERP asset)
  const imgFile = String(r.imgFile || "").trim();
  if (imgFile && imgFile !== "*") {
    const c = byImgFile.get(imgFile);
    if (c && !usedDbIds.has(c.id)) { p = c; method = "L0_img"; }
  }

  // L1 name
  if (!p) {
    p = byName.get(`${brandN}|${norm(r.name)}`) ?? byName.get(`${brandN}|${norm(stripped)}`);
    if (!p) {
      p = bySquash.get(`${brandN}#${squash(r.name)}`) ?? bySquash.get(`${brandN}#${squash(stripped)}`);
    }
    if (p) method = "L1";
    if (p && usedDbIds.has(p.id)) { p = null; }
  }

  const fp = `${r2(String(r.selling || "0").replace(/[₹,]/g, ""))}|${r2(String(r.base || "0").replace(/[₹,]/g, ""))}|${r2(String(r.mrp || "0").replace(/[₹,]/g, ""))}|${Math.round(Number(r.stock || 0))}`;

  // L3 fuzzy name (token overlap) within brand — prices unreliable, name only
  if (!p) {
    const pool = dbProducts.filter((c) => norm(c.brand?.name ?? "") === brandN && !usedDbIds.has(c.id));
    const tExcel = tokens(stripped);
    const numExcel = new Set((stripped.match(/\d+/g) ?? []));
    let best: any = null, bestScore = 0;
    for (const c of pool) {
      const cName = stripBrand(c.name, c.brand?.name ?? "");
      const score = Math.max(jaccard(tExcel, tokens(c.name)), jaccard(tExcel, tokens(cName)));
      if (score <= bestScore) continue;
      // numbers (sizes, model codes) must be a subset match
      const numDb = new Set((cName.match(/\d+/g) ?? []));
      let numOk = true;
      for (const n of numExcel) if (!numDb.has(n)) { numOk = false; break; }
      if (!numOk) continue;
      bestScore = score; best = c;
    }
    if (best && bestScore >= 0.5) { p = best; method = "L3"; }
  }

  if (p) {
    stats[method as "L0_img" | "L1" | "L3"]++;
    usedDbIds.add(p.id);
    seenDb.add(r.sku);
    assignments.push({ sku: r.sku, dbSku: p.sku, name: r.name, method, top: r.top, mid: r.mid, end: r.end });
  } else {
    stats.none++;
    unmatched.push({ sku: r.sku, brand: r.brand, name: r.name, fp });
  }
}

// unmatched DB products
const matchedDbSkus = new Set(assignments.map((a) => a.dbSku));
const dbUnmatched = dbProducts.filter((p) => !matchedDbSkus.has(p.sku));

console.log(`Excel rows: ${mapping.rows.length} | assignments: ${assignments.length}`);
console.log(`Match stats:`, stats);
console.log(`DB products unmatched (keep General): ${dbUnmatched.length}`);
console.log(`\nUnmatched excel samples (first 20):`);
unmatched.slice(0, 20).forEach((u) => console.log(`  ${u.sku} | ${u.brand} | ${u.name.slice(0, 45)} | fp=${u.fp}`));
console.log(`\nUnmatched DB samples (first 15):`);
dbUnmatched.slice(0, 15).forEach((p) => console.log(`  ${p.sku} | ${(p.brand || {}).name} | ${p.name.slice(0, 45)} | ${p.dealerPrice}/${p.basePrice}/${p.mrp}/${p.stock}`));

// category distribution of assignments
const catDist = new Map<string, number>();
for (const a of assignments) catDist.set(a.top, (catDist.get(a.top) || 0) + 1);
console.log(`\nCategory distribution of assignments:`, Object.fromEntries(catDist));

fs.writeFileSync("/home/z/my-project/scripts/category-assignments.json", JSON.stringify({
  assignments, unmatched, dbUnmatched: dbUnmatched.map((p) => p.sku),
}, null, 1));
console.log(`\nSaved -> scripts/category-assignments.json`);
