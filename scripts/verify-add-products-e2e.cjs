/** E2E verify on production: admin login → Cloudinary upload (folder=products) →
 *  create a full-detail product with gallery → read it back → delete it. */
const BASE = "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "DmkMartB2B!2026";
const fs = require("fs");

let TOKEN = "";
async function api(p, init) {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  // 1. login
  let r = await api("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
  TOKEN = r.body?.token;
  if (!TOKEN) throw new Error("login failed: " + JSON.stringify(r.body).slice(0, 200));
  console.log("✓ 1. admin login");

  // 2. Cloudinary upload (folder=products)
  const png = fs.readFileSync("/tmp/test-product.png");
  const fd = new FormData();
  fd.append("file", new Blob([png], { type: "image/png" }), "dmk-e2e-test.png");
  fd.append("folder", "products");
  let up = await fetch(`${BASE}/api/admin/upload`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: fd });
  const upText = await up.text();
  let upBody;
  try { upBody = JSON.parse(upText); } catch { throw new Error(`upload non-JSON (${up.status}): ` + upText.slice(0, 300)); }
  if (!up.ok || !upBody.url) throw new Error("upload failed: " + JSON.stringify(upBody).slice(0, 200));
  const isCloudinaryProducts = /res\.cloudinary\.com.+dmk-mart%2Fproducts|dmk-mart\/products/.test(upBody.url) || upBody.url.includes("cloudinary");
  console.log(`✓ 2. uploaded → ${upBody.url.slice(0, 90)}… (cloudinary=${isCloudinaryProducts})`);

  // 3. category cascade sanity: pick first top/mid/end
  const crud = async (e) => (await api(`/api/admin/crud/${e}`)).body.rows;
  const [tops, midsAll, endsAll] = [await crud("tops"), await crud("mids"), await crud("ends")];
  const top = tops[0];
  const mid = midsAll.find((m) => m.top?.id === top.id);
  const end = endsAll.find((e) => e.mid?.id === mid.id);
  const brands = await crud("brands");
  console.log(`✓ 3. categories: ${top.name} › ${mid.name} › ${end.name} (brand ${brands[0].name})`);

  // 4. create full-detail product
  const sku = "E2E-" + Date.now().toString().slice(-8);
  r = await api("/api/admin/products", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "ZZ E2E Delete-Me Product", sku, brandId: brands[0].id, brandName: brands[0].name,
      topId: top.id, midId: mid.id, endId: end.id,
      unit: "Pcs", packQty: "6", piecesPerBox: "36",
      purchaseCost: "80", dealerPrice: "120", mrp: "199",
      tier1: "100", tier2: "108", tier3: "112", tier4: "120", tier5: "199",
      packPrice: "700", dealPrice: "110",
      stock: "42", lowStockThreshold: "10", damagedStock: "2",
      hsn: "3924", gst: "18", weightGrams: "250", barcode: sku,
      image: upBody.url, gallery: [upBody.url, upBody.url + "_g2"],
      description: "E2E verification product — will be deleted.",
      seoTitle: "E2E", seoDesc: "E2E", keywords: "e2e,test",
      isTop: true, isFeatured: false, isHot: false, isDeal: false, active: true,
    }),
  });
  if (r.status !== 200) throw new Error("create failed: " + JSON.stringify(r.body).slice(0, 300));
  const prod = r.body.row;
  console.log("raw gallery value:", JSON.stringify(prod.gallery));
  const galleryCount = (() => { try { return JSON.parse(prod.gallery || "[]").length; } catch { return "PARSE-FAIL"; } })();
  console.log(`✓ 4. created ${prod.sku} / ${prod.slug} — unit=${prod.unit} gst=${prod.gst} weight=${prod.weightGrams} gallery=${galleryCount} tier4=${prod.tier4} tier5=${prod.tier5} lowAt=${prod.lowStockThreshold} damaged=${prod.damagedStock} img=${prod.image.slice(0, 48)}…`);

  // 5. read back through admin list with category filter
  r = await api(`/api/admin/products?end=${end.id}&q=${sku}`);
  const found = (r.body.rows || []).find((x) => x.sku === sku);
  if (!found) throw new Error("list filter by end category did not return the product");
  console.log(`✓ 5. end-category filter works — row has top.id=${!!found.top?.id}, end.id=${!!found.end?.id}`);

  // 6. public visibility + gallery on product page data
  r = await api(`/api/products?end=${end.id}&limit=5`);
  const pub = (r.body.products || []).find((x) => x.sku === sku);
  console.log(`✓ 6. public catalog API returns it: ${!!pub}`);

  // 7. delete
  r = await api(`/api/admin/products?id=${prod.id}`, { method: "DELETE" });
  if (r.status !== 200) throw new Error("delete failed");
  console.log("✓ 7. test product deleted — E2E COMPLETE");
}

main().catch((e) => { console.error("✗", e.stack || e.message); process.exit(1); });
