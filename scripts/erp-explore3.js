/* Remap warehouses to include firmId, read rows, restore original */
const fs = require("fs");
const TOKEN = fs.readFileSync("/tmp/dmkadm.tok", "utf8").trim();
const BASE = "https://b2b-dmk-mart.vercel.app/api/admin/erp-direct";
const H = { "content-type": "application/json", authorization: `Bearer ${TOKEN}` };

async function call(path, init) {
  const res = await fetch(`${BASE}${path}`, { headers: H, ...init });
  return res.json().catch(() => ({}));
}

async function main() {
  const backup = JSON.parse(fs.readFileSync("/tmp/dmk-mappings-backup.json", "utf8"));
  const orig = backup.curW.current;

  const withFirm = { ...orig, columns: ["code", "name", "city", "type", "isActive", "firmId"] };
  await call(`/mapping`, { method: "POST", body: JSON.stringify({ entity: "warehouses", mapping: withFirm }) });
  const d = await call(`/data?entity=warehouses&page=1`);
  console.log("WAREHOUSES WITH FIRM:");
  for (const r of d.rows || []) console.log(JSON.stringify(r));
  await call(`/mapping`, { method: "POST", body: JSON.stringify({ entity: "warehouses", mapping: orig }) });
  console.log("restored");

  // FirmProductPrice sample — per-firm pricing tiers
  const firmPriceMap = { table: "FirmProductPrice", codeCol: "id", nameCol: "id", activeCol: undefined, columns: ["firmId", "productId", "tier1Distributor", "tier2Wholesale", "tier3SemiWholesale", "tier4Retailer", "tier5Mrp", "purchaseCost"] };
  await call(`/mapping`, { method: "POST", body: JSON.stringify({ entity: "warehouses", mapping: firmPriceMap }) });
  const fpp = await call(`/data?entity=warehouses&page=1`);
  console.log("\nFirmProductPrice SAMPLE:", JSON.stringify((fpp.rows || []).slice(0, 3)));
  console.log("FPP total:", fpp.total);
  await call(`/mapping`, { method: "POST", body: JSON.stringify({ entity: "warehouses", mapping: orig }) });
  console.log("restored again");
}
main().catch((e) => console.error(e));
