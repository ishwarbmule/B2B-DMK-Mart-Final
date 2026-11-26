/** DESCRIBE the ERP Product table via the production columns API. */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 200)}`);
  return d;
};

const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

for (const t of ["Product", "Firm", "Warehouse", "WarehouseStock"]) {
  const d = await jf(`/api/admin/erp-direct/columns?table=${t}`, { headers: H });
  console.log(`\n=== ${t} (${d.rows} rows) ===`);
  for (const c of d.columns) console.log(`  ${c.field}: ${c.type} ${c.key ? `[${c.key}]` : ""}`);
}
