/**
 * Verifies the deployed brochure features on production:
 *  1. GET meta (+ per-warehouse SKU counts)
 *  2. GET ?warehouseId=PUNE → picker list (ALL products incl. inactive)
 *  3. POST generate with an explicit picked list (incl. a hidden product) → PDF
 *     saved to download/ for a visual 3x3 check.
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const { writeFileSync } = await import("fs");

const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${url} → ${res.status}: ${t.slice(0, 200)}`);
  }
  return res;
};

const login = await jf("/api/admin/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }),
});
const loginBody = await login.json();
const H = { authorization: `Bearer ${loginBody.token}` };

const meta = await (await jf("/api/admin/brochure/generate", { headers: H })).json();
console.log("warehouses:", meta.warehouses.map((w) => `${w.name}=${w.skus} in-stock`).join(", "));

const pune = meta.warehouses.find((w) => /PUNE/i.test(w.name));
if (!pune) throw new Error("no PUNE warehouse");
const pick = await (await jf(`/api/admin/brochure/generate?warehouseId=${pune.id}`, { headers: H })).json();
console.log(`picker for ${pick.warehouse?.name}: ${pick.products.length} products (inactive included)`);
const hiddenCount = pick.products.filter((p) => !p.active).length;
console.log(`  inactive/hidden in list: ${hiddenCount}`);
console.log(`  sample: ${pick.products.slice(0, 3).map((p) => `${p.name}[${p.company}] qty=${p.qty}${p.active ? "" : " HIDDEN"}`).join(" | ")}`);

// pick a mixed set: 9 in-stock + 9 more (any state) → 2 grid pages
const inStock = pick.products.filter((p) => p.qty > 0);
const rest = pick.products.filter((p) => p.qty === 0 || !p.active);
const chosen = [...inStock.slice(0, 9), ...rest.slice(0, 9)].map((p) => p.id);
console.log(`generating PDF with ${chosen.length} picked products (${rest.slice(0, 9).length} of them inactive/OOS)…`);

const t0 = Date.now();
const res = await fetch(`${BASE}/api/admin/brochure/generate`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: H.authorization },
  body: JSON.stringify({ warehouseId: pune.id, productIds: chosen, showPrices: true, tier: "dealer", maxProducts: "all" }),
});
const ct = res.headers.get("content-type") || "";
console.log(`status ${res.status} ${ct} in ${Math.round((Date.now() - t0) / 1000)}s`);
if (ct.includes("application/json")) {
  const d = await res.json();
  console.log("large-PDF share path:", d.shareUrl ? "hosted link" : JSON.stringify(d).slice(0, 300));
  if (d.meta) console.log(`meta: count=${d.meta.count} warehouse=${d.meta.warehouse}`);
  if (d.shareUrl) {
    const buf = Buffer.from(await (await fetch(d.shareUrl)).arrayBuffer());
    writeFileSync("/home/z/my-project/download/DMK-Catalog-live-sample.pdf", buf);
    console.log(`saved hosted PDF (${Math.round(buf.length / 1024)} KB) → download/DMK-Catalog-live-sample.pdf`);
  }
} else {
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync("/home/z/my-project/download/DMK-Catalog-live-sample.pdf", buf);
  console.log(`saved PDF ${Math.round(buf.length / 1024)} KB → download/DMK-Catalog-live-sample.pdf`);
}
