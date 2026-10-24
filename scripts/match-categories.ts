/**
 * Fetch ALL production products (paginated, incl. inactive) and save a compact index.
 * Then match Excel rows -> DB products by (brand + name) with aggressive normalization.
 */
import fs from "fs";

const BASE = "https://b2b-dmk-mart.vercel.app";
const OUT = "/tmp/db-all-products.json";

async function fetchAll(): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  for (;;) {
    const r = await fetch(`${BASE}/api/products?all=1&limit=60&page=${page}`, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} on page ${page}`);
    const d = await r.json();
    const rows: any[] = d.products ?? [];
    all.push(...rows);
    if (all.length >= (d.total ?? 0) || rows.length === 0 || page > 60) break;
    page++;
  }
  return all;
}

// ---------- normalization ----------
const fillers = new Set([
  "the", "and", "with", "for", "of", "a", "an", "new", "no", "no.", "size", "colour", "color",
]);
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !fillers.has(w))
    .join(" ")
    .trim();
}
function stripBrand(name: string, brand: string): string {
  let n = name.toLowerCase();
  const b = brand.toLowerCase();
  // remove brand tokens and brand-ish words from the start of the name
  const tokens = b.split(/[^a-z0-9]+/g).filter((t) => t.length > 2 && !["furniture", "garden", "tools", "plastic", "household", "unbreakable", "cleaning", "kitchen", "equipments", "equip"].includes(t));
  for (const t of tokens) n = n.replace(new RegExp(`(^|\\b)${t}(s)?(\\b|$)`, "g"), " ");
  return n.replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean).join(" ").trim();
}

async function main() {
  if (!fs.existsSync(OUT)) {
    console.log("Fetching all products from production...");
    const products = await fetchAll();
    fs.writeFileSync(OUT, JSON.stringify(products));
    console.log(`Saved ${products.length} products`);
  } else {
    console.log("Using cached products");
  }
  const dbProducts: any[] = JSON.parse(fs.readFileSync(OUT, "utf8"));
  console.log(`DB products: ${dbProducts.length}`);
  console.log("sample:", JSON.stringify(dbProducts[0], null, 1).slice(0, 500));

  // Build match index
  const byKey = new Map<string, any>();
  for (const p of dbProducts) {
    const brandName = p.brand?.name ?? "";
    const k1 = `${norm(brandName)}|${norm(p.name)}`;
    const k2 = `${norm(brandName)}|${stripBrand(p.name, brandName)}`;
    if (!byKey.has(k1)) byKey.set(k1, p);
    if (!byKey.has(k2)) byKey.set(k2, p);
  }

  // Match Excel rows
  const mapping = JSON.parse(fs.readFileSync("/home/z/my-project/scripts/category-mapping.json", "utf8")) as any;
  const rows: any[] = mapping.rows;
  let matched = 0, unmatched = 0;
  const unmatchedSamples: string[] = [];
  const assignments: { sku: string; name: string; top: string; mid: string; end: string }[] = [];
  const seenSku = new Set<string>();

  for (const r of rows) {
    if (!r.sku || !r.name || !r.top) continue;
    if (seenSku.has(r.sku)) continue; // first occurrence wins
    const brandN = norm(r.brand || "");
    let p = byKey.get(`${brandN}|${norm(r.name)}`) ?? byKey.get(`${brandN}|${stripBrand(r.name, r.brand || "")}`);
    // fallback: full-name match ignoring brand
    if (!p) {
      const stripped = stripBrand(r.name, r.brand || "");
      for (const [k, v] of byKey) {
        if (k.endsWith(`|${norm(r.name)}`) || (stripped && k.endsWith(`|${stripped}`))) { p = v; break; }
      }
    }
    if (p) {
      matched++;
      seenSku.add(r.sku);
      assignments.push({ sku: p.sku, name: r.name, top: r.top, mid: r.mid, end: r.end });
    } else {
      unmatched++;
      if (unmatchedSamples.length < 25) unmatchedSamples.push(`${r.sku} | ${r.brand} | ${r.name}`);
    }
  }

  console.log(`\nMatched: ${matched}, Unmatched: ${unmatched}`);
  console.log("Unmatched samples:");
  unmatchedSamples.forEach((s) => console.log("  -", s));
  fs.writeFileSync("/home/z/my-project/scripts/category-assignments.json", JSON.stringify({ matched, unmatched, assignments }, null, 1));
  console.log(`\nSaved ${assignments.length} assignments -> scripts/category-assignments.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
