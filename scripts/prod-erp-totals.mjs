/** ERP-side totals via the admin data browser (read-only). */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return d;
};
const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

for (const entity of ["products", "warehouses", "stock"]) {
  const d = await jf(`/api/admin/erp-direct/data?entity=${entity}&page=1`, { headers: H });
  console.log(`ERP ${entity}: table=${d.table} total=${d.total}`);
}

// first page of the stock browser — see what a row looks like (columns incl. warehouseId)
const s = await jf(`/api/admin/erp-direct/data?entity=stock&page=1`, { headers: H });
console.log("stock columns:", s.columns?.join(", "));
console.log("sample rows:", JSON.stringify((s.rows || []).slice(0, 3), null, 1));
