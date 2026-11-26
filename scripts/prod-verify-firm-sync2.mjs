/** Full verification of the firm-catalog sync on production Neon. */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 200)}`);
  return d;
};
const nf = (n) => Number(n || 0).toLocaleString("en-IN");

const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

const total = async (sp) => (await jf(`/api/admin/products?limit=5&${sp}`, { headers: H })).total;

console.log("=== Neon catalog totals ===");
console.log("all products:      ", nf(await total("")));
console.log("active (listed):   ", nf(await total("status=active")));
console.log("inactive (hidden): ", nf(await total("status=inactive")));
console.log("in stock (stock>0):", nf(await total("stocked=1")));

console.log("\n=== the owner's P-pattern families (Pune catalog evidence) ===");
for (const c of ["AP Plastics", "Deep Household", "Garden Needs", "Goldex Kitchen Equipments", "Samarthya Cleaning", "Steel King Cleaning", "Mauli Plastic", "Maharashtra Unbreakable"]) {
  const all = await total(`company=${encodeURIComponent(c)}`);
  const act = await total(`company=${encodeURIComponent(c)}&status=active`);
  console.log(`  ${c}: ${nf(all)} in panel (${nf(act)} active)`);
}

console.log("\n=== a catalog-only Pune SKU end-to-end ===");
const one = await jf("/api/admin/products?q=PAPPLAS0001&limit=5", { headers: H });
const row = (one.products || [])[0];
if (row) {
  console.log(`  ${row.sku} · ${row.name}`);
  console.log(`  active=${row.active} stock=${row.stock} price=${row.dealerPrice ?? row.basePrice} company=${row.company}`);
}

console.log("\n=== warehouses ===");
const wh = await jf("/api/admin/warehouses", { headers: H });
const wl = wh.warehouses || wh || [];
for (const w of wl) console.log(`  ${w.name}: active=${w.active} · ${nf(w.productCount)} stocked products · ${nf(w.totalStock)} units`);
const pune = wl.find((w) => /PUNE/i.test(w.name));
if (pune) {
  const inPune = await jf(`/api/admin/products?limit=5&warehouseId=${pune.id}&onlyStocked=1`, { headers: H });
  console.log(`  products stocked in ${pune.name}: ${nf(inPune.total)}`);
}
console.log("\nDONE");
