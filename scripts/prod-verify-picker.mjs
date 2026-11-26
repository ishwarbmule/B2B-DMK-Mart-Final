/**
 * Post-deploy verification:
 *  1. picker = FULL catalog per godown (qty lens, inactive included)
 *  2. brochure PDF from explicit picks incl. an inactive + a zero-qty product
 *  3. active/covered consistency tally for the owner report
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const fs = await import("fs");

const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 200)}`);
  return d;
};

const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

const PUNE = "cmwoih7d70002l80796kwykd5"; // Neon Warehouse id (PDMKMAIN01)
const KOLHAR = "cmwoihb1m0004l807v4ggvzv3"; // Neon Warehouse id (WH-MAIN)

const tally = (label, list) => {
  const inStock = list.filter((p) => p.qty > 0);
  const inactive = list.filter((p) => !p.active);
  const pPat = list.filter((p) => /^P[A-Za-z]{6}\d{4}$/.test(p.sku));
  console.log(`${label}: total=${list.length} | qty>0: ${inStock.length} | hidden: ${inactive.length} | P-pattern: ${pPat.length} (stocked: ${pPat.filter((p) => p.qty > 0).length})`);
  return { inStock, inactive };
};

const pune = await jf(`/api/admin/brochure/generate?warehouseId=${PUNE}`, { headers: H });
console.log(`Pune picker: ${pune.products.length} rows`);
tally("  DMK MART PUNE", pune.products || []);

const kol = await jf(`/api/admin/brochure/generate?warehouseId=${KOLHAR}`, { headers: H });
console.log(`Kolhar picker: ${kol.products.length} rows`);
tally("  KOLHAR", kol.products || []);

// brochure generation with explicit picks: one stocked Pune item, one zero-qty, one hidden
const stocked = (pune.products || []).find((p) => p.qty > 0 && p.active);
const zero = (pune.products || []).find((p) => p.qty === 0 && p.active);
const hidden = (pune.products || []).find((p) => !p.active);
const picks = [stocked, zero, hidden].filter(Boolean).map((p) => p.id);
console.log(`\ngenerating 3-product brochure (stocked: ${stocked?.sku}, zero-qty: ${zero?.sku}, hidden: ${hidden?.sku})…`);
const res = await fetch(BASE + "/api/admin/brochure/generate", {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ warehouseId: PUNE, productIds: picks, showPrices: true, tier: "dealer" }),
});
const ct = res.headers.get("content-type") || "";
if (ct.includes("application/pdf")) {
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync("/tmp/brochure-picks.pdf", buf);
  console.log(`PDF binary: ${(buf.length / 1024).toFixed(0)} KB — saved /tmp/brochure-picks.pdf`);
} else {
  const d = await res.json().catch(() => ({}));
  console.log(`shareUrl mode: ${d.shareUrl || JSON.stringify(d).slice(0, 200)}`);
  if (d.shareUrl) {
    const pdf = await fetch(d.shareUrl);
    const buf = Buffer.from(await pdf.arrayBuffer());
    fs.writeFileSync("/tmp/brochure-picks.pdf", buf);
    console.log(`downloaded share PDF: ${(buf.length / 1024).toFixed(0)} KB`);
  }
}

// active/covered consistency
const products = [];
for (let page = 1; ; page++) {
  const p = await jf(`/api/admin/products?status=&page=${page}&limit=100`, { headers: H });
  products.push(...(p.rows || []));
  if (page >= (p.pages || 1) || !(p.rows || []).length) break;
}
const qtyPune = new Map((pune.products || []).map((p) => [p.id, p.qty]));
const qtyKol = new Map((kol.products || []).map((p) => [p.id, p.qty]));
const covered = products.filter((p) => (qtyPune.get(p.id) ?? null) !== null || (qtyKol.get(p.id) ?? null) !== null);
console.log(`\nconsistency: products=${products.length} | with a stock row in a shown godown: ${covered.length}`);
console.log(`  active=${products.filter((p) => p.active).length} | covered AND active=${covered.filter((p) => p.active).length} | covered AND hidden=${covered.filter((p) => !p.active).length}`);
const patCovered = covered.filter((p) => /^P[A-Za-z]{6}\d{4}$/.test(p.sku));
console.log(`  P-pattern covered: ${patCovered.length} | P-pattern active: ${patCovered.filter((p) => p.active).length}`);
console.log("DONE");
