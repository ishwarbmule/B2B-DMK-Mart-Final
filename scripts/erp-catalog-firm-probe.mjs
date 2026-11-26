/**
 * READ-ONLY ERP probe — how do catalog products link to firms/godowns?
 * Owner's goal: when DMK Mart Pune + Jay Yogeshwar (Kolhar) are selected,
 * EVERY catalog product of those two firms must sync (2043 for Pune), not
 * only the ones that already have stock rows.
 * Only SELECT / SHOW / DESCRIBE — mirrors lib/erp-mysql.ts guard.
 * Credentials parsed from scripts/save-erp-creds.js — never printed.
 */
import { readFileSync } from "fs";

const src = readFileSync("/home/z/my-project/scripts/save-erp-creds.js", "utf8");
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

const q = async (sql, label, cap = 40) => {
  const [rows] = await conn.query(sql);
  console.log(`\n=== ${label} ===`);
  for (const r of rows.slice(0, cap)) console.log(JSON.stringify(r));
  if (rows.length > cap) console.log(`… (${rows.length} rows total)`);
  return rows;
};

try {
  // 1. Firms — confirm "Jay Yogeshwar" and "DMK Mart" names + tax modes
  await q("SELECT `id`, `name`, `gstMode` FROM `Firm` ORDER BY `name`", "Firms");

  // 2. Product table shape — linkage columns
  const cols = await q("DESCRIBE `Product`", "Product columns", 60);
  const linkCols = cols.filter((c) => /firm|godown|wareh|company|branch|loc/i.test(c.Field || ""));
  console.log("\n→ linkage-ish Product columns:", linkCols.map((c) => `${c.Field}:${c.Type}`).join(", ") || "NONE");

  // 3. Products per firm (if firmId exists on Product)
  const hasFirmId = cols.some((c) => c.Field === "firmId");
  if (hasFirmId) {
    await q(
      "SELECT f.`name` AS firm, f.`gstMode`, COUNT(*) AS products " +
      "FROM `Product` p JOIN `Firm` f ON f.`id` = p.`firmId` GROUP BY f.`id`, f.`name`, f.`gstMode` ORDER BY products DESC",
      "Catalog products per firm"
    );
    // 4. The owner's pattern: P + 6 letters + 4 digits  → which firm holds them
    await q(
      "SELECT f.`name` AS firm, COUNT(*) AS patternProducts " +
      "FROM `Product` p JOIN `Firm` f ON f.`id` = p.`firmId` " +
      "WHERE p.`sku` REGEXP '^P[A-Za-z]{6}[0-9]{4}$' GROUP BY f.`id`, f.`name` ORDER BY patternProducts DESC",
      "SKU pattern ^P + 6 letters + 4 digits$ per firm"
    );
    // looser variant — starts with P, ends with 4+ digits
    await q(
      "SELECT f.`name` AS firm, COUNT(*) AS loosePattern " +
      "FROM `Product` p JOIN `Firm` f ON f.`id` = p.`firmId` " +
      "WHERE p.`sku` REGEXP '^P[A-Za-z]{6}[0-9]+' GROUP BY f.`id`, f.`name` ORDER BY loosePattern DESC",
      "Looser pattern ^P + 6 letters + digits$ per firm"
    );
  }

  // 5. Total catalog size + active split
  await q("SELECT COUNT(*) AS totalProducts FROM `Product`", "ERP Product catalog total");
  const actCol = cols.find((c) => /^is|isactive|active|status|enabled|listed/i.test(c.Field) && /tinyint|int|bit|bool|char|varchar/i.test(c.Type || ""));
  if (actCol && hasFirmId) {
    await q(
      `SELECT f.\`name\` AS firm, p.\`${actCol.Field}\` AS flag, COUNT(*) AS products ` +
      "FROM `Product` p JOIN `Firm` f ON f.`id` = p.`firmId` GROUP BY f.`id`, f.`name`, flag ORDER BY f.`name`, flag",
      `Catalog per firm × ${actCol.Field} (source active flag)`
    );
  } else {
    console.log("\n(no obvious active/status column or no firmId — DESCRIBE above is the reference)");
  }

  // 6. Stock coverage: distinct products with stock rows per godown vs firm catalog
  await q(
    "SELECT w.`name` AS godown, f.`name` AS firm, COUNT(DISTINCT s.`productId`) AS stockedProducts, COUNT(*) AS stockRows " +
    "FROM `WarehouseStock` s JOIN `Warehouse` w ON w.`id` = s.`warehouseId` LEFT JOIN `Firm` f ON f.`id` = w.`firmId` " +
    "GROUP BY w.`id`, w.`name`, f.`name` ORDER BY stockedProducts DESC",
    "Distinct stocked products per godown"
  );

  if (hasFirmId) {
    // 7. For the two non-GST firms: how many of their catalog products have NO stock row at all
    await q(
      "SELECT f.`name` AS firm, " +
      "COUNT(*) AS catalogProducts, " +
      "SUM(CASE WHEN EXISTS (SELECT 1 FROM `WarehouseStock` s WHERE s.`productId` = p.`id`) THEN 1 ELSE 0 END) AS withAnyStockRow, " +
      "SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM `WarehouseStock` s WHERE s.`productId` = p.`id`) THEN 1 ELSE 0 END) AS noStockRowAtAll " +
      "FROM `Product` p JOIN `Firm` f ON f.`id` = p.`firmId` " +
      "WHERE f.`gstMode` = 'NON_GST' OR f.`gstin` IS NULL OR f.`gstin` = '' " +
      "GROUP BY f.`id`, f.`name` ORDER BY catalogProducts DESC",
      "Non-GST firms: catalog vs stocked split"
    );

    // 8. Where are the Pune firm's products stocked, if anywhere?
    await q(
      "SELECT w.`name` AS godown, COUNT(DISTINCT p.`id`) AS stockedProducts " +
      "FROM `Product` p JOIN `Firm` f ON f.`id` = p.`firmId` " +
      "JOIN `WarehouseStock` s ON s.`productId` = p.`id` " +
      "JOIN `Warehouse` w ON w.`id` = s.`warehouseId` " +
      "GROUP BY w.`id`, w.`name` ORDER BY stockedProducts DESC",
      "All-firm stocked products by godown (via Product.firmId join)"
    );

    // 9. Sample of the pattern products (5 rows, sku+name only)
    await q(
      "SELECT p.`sku`, p.`name` FROM `Product` p WHERE p.`sku` REGEXP '^P[A-Za-z]{6}[0-9]{4}$' LIMIT 5",
      "Sample pattern products", 5
    );
  }
} finally {
  await conn.end();
}
