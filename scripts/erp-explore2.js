/* Read Warehouse + stock overview rows via live API (read-only) */
const fs = require("fs");
const TOKEN = fs.readFileSync("/tmp/dmkadm.tok", "utf8").trim();
const BASE = "https://b2b-dmk-mart.vercel.app/api/admin/erp-direct";
const H = { "content-type": "application/json", authorization: `Bearer ${TOKEN}` };
const NON_GST = ["cmwi87vjr000m3nox0uc4cok3", "cmudweei00000lx4suflu947i"]; // DMK MART, Jay Yogeshwar

async function call(path) {
  const res = await fetch(`${BASE}${path}`, { headers: H });
  return res.json().catch(() => ({}));
}

async function main() {
  const w = await call(`/data?entity=warehouses&page=1`);
  console.log("WAREHOUSE ROWS:");
  for (const r of w.rows || []) {
    console.log(JSON.stringify({ id: r.id, code: r.code, name: r.name, city: r.city, type: r.type, isActive: r.isActive, isDefault: r.isDefault }));
  }
  console.log("\nselected codes (current scope):", JSON.stringify((await call(`/selection`)).codes));

  // stock: remap stock→WarehouseStock joined (already is). Read first rows
  const s = await call(`/data?entity=stock&page=1`);
  console.log("\nSTOCK SAMPLE:", JSON.stringify((s.rows || []).slice(0, 3)));
  console.log("stock total:", s.total);

  // products sample
  const p = await call(`/data?entity=products&page=1`);
  console.log("\nPRODUCT SAMPLE:", JSON.stringify((p.rows || []).slice(0, 2), null, 1).slice(0, 1200));
  console.log("products total:", p.total);
}
main().catch((e) => console.error(e));
