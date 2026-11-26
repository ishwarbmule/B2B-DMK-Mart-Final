/**
 * READ-ONLY ERP probe — answers the owner's "one main work" question:
 * which godown really holds DMK Mart Pune's 2000+ products?
 * Only SELECT / SHOW / DESCRIBE statements are used (mirrors lib/erp-mysql.ts guard).
 * Credentials are parsed from scripts/save-erp-creds.js — never printed.
 */
import { readFileSync } from "fs";

const src = readFileSync("/home/z/my-project/scripts/save-erp-creds.js", "utf8");
const grab = (k) => (src.match(new RegExp(`value: "${k}", value: "([^"]*)"`.replace(k, k))) || [])[1];
// SETTINGS rows look like { key: "erp_db_host", value: "..." } — parse pairs instead
const pairs = [...src.matchAll(/key:\s*"(erp_db_\w+)",\s*value:\s*"([^"]*)"/g)];
const cfg = Object.fromEntries(pairs.map((m) => [m[1], m[2]]));
const mysql = (await import("mysql2/promise")).default;

const conn = await mysql.createConnection({
  host: cfg.erp_db_host,
  port: Number(cfg.erp_db_port || 3306),
  user: cfg.erp_db_user,
  password: cfg.erp_db_password,
  database: cfg.erp_db_name,
  connectTimeout: 20000,
  ssl: { rejectUnauthorized: false },
});

const q = async (sql, label) => {
  const [rows] = await conn.query(sql);
  console.log(`\n=== ${label} ===`);
  console.table ? null : null;
  for (const r of rows.slice(0, 40)) console.log(JSON.stringify(r));
  if (rows.length > 40) console.log(`… (${rows.length} rows total)`);
  return rows;
};

try {
  // 1. Firms and their tax modes
  await q("SELECT `id`, `name`, `gstMode`, (`gstin` IS NOT NULL AND `gstin` <> '') AS hasGstin FROM `Firm` ORDER BY `name`", "Firms");

  // 2. Godowns with owning firm + stock-row counts
  await q(
    "SELECT w.`id`, w.`code`, w.`name`, w.`city`, w.`isActive`, f.`name` AS firm, f.`gstMode`, " +
    "(SELECT COUNT(*) FROM `WarehouseStock` s WHERE s.`warehouseId` = w.`id`) AS stockRows " +
    "FROM `Warehouse` w LEFT JOIN `Firm` f ON f.`id` = w.`firmId` ORDER BY stockRows DESC",
    "Godowns (all firms, ERP-side stock rows)"
  );

  // 3. Product table shape — look for firm/godown-ish linkage columns
  const cols = await q("DESCRIBE `Product`", "Product table columns");
  const interesting = cols.filter((c) => /firm|godown|wareh|wh|company|branch|location|store/i.test(c.Field || ""));
  console.log("\n→ Product columns matching firm/godown/company:", interesting.map((c) => c.Field).join(", ") || "NONE");

  // 4. Stock rows per godown including zero-qty split for the two non-GST godowns
  await q(
    "SELECT s.`warehouseId`, w.`name`, COUNT(*) AS rows_, SUM(CASE WHEN s.`quantity` > 0 THEN 1 ELSE 0 END) AS withQty " +
    "FROM `WarehouseStock` s LEFT JOIN `Warehouse` w ON w.`id` = s.`warehouseId` GROUP BY s.`warehouseId`, w.`name` ORDER BY rows_ DESC",
    "Stock rows per godown (total vs quantity>0)"
  );
} finally {
  await conn.end();
}
