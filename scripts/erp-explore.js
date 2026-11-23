/* Temporarily remap warehouses→Firm to READ rows (restore after). Read-only toward ERP. */
const fs = require("fs");
const TOKEN = fs.readFileSync("/tmp/dmkadm.tok", "utf8").trim();
const BASE = "https://b2b-dmk-mart.vercel.app/api/admin/erp-direct";
const H = { "content-type": "application/json", authorization: `Bearer ${TOKEN}` };

async function call(path, init) {
  const res = await fetch(`${BASE}${path}`, { headers: H, ...init });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 400), status: res.status }; }
}

async function main() {
  // save current mappings
  const curW = await call(`/mapping?entity=warehouses`);
  const curS = await call(`/mapping?entity=stock`);
  const curP = await call(`/mapping?entity=products`);
  fs.writeFileSync("/tmp/dmk-mappings-backup.json", JSON.stringify({ curW, curS, curP }, null, 2));
  console.log("BACKED UP current mappings:",
    JSON.stringify({ w: curW.current?.table, s: curS.current?.table, p: curP.current?.table }));
  console.log("stock mapping:", JSON.stringify(curS.current, null, 1).slice(0, 800));
  console.log("warehouses mapping:", JSON.stringify(curW.current, null, 1).slice(0, 600));
  console.log("products mapping cols:", JSON.stringify(curP.current, null, 1).slice(0, 1400));

  // remap warehouses → Firm
  const firmMap = {
    table: "Firm", codeCol: "id", nameCol: "firmName",
    activeCol: "isActive", columns: ["id", "firmName", "firmCode", "gstin", "state", "stateCode", "gstMode", "pricingMode", "isActive"],
  };
  const r1 = await call(`/mapping`, { method: "POST", body: JSON.stringify({ entity: "warehouses", mapping: firmMap }) });
  console.log("\nremap→Firm:", JSON.stringify(r1));

  const d = await call(`/data?entity=warehouses&page=1`);
  console.log("\nFIRM ROWS:", JSON.stringify(d, null, 1).slice(0, 3000));

  // restore
  const r2 = await call(`/mapping`, { method: "POST", body: JSON.stringify({ entity: "warehouses", mapping: curW.current }) });
  console.log("\nrestored warehouses mapping:", JSON.stringify(r2));
}
main().catch((e) => console.error(e));
