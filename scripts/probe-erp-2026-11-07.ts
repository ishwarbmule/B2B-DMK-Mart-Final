/* Read-only probe: ERP products table structure + row counts. No credentials printed. */
import mysql from "mysql2/promise";

const CFG = {
  host: process.env.ERP_HOST || "srv844.hstgr.io",
  port: Number(process.env.ERP_PORT || 3306),
  user: process.env.ERP_USER || "u671486929_dmkmarterp",
  password: process.env.ERP_PASSWORD || "DMKMart@26",
  database: process.env.ERP_DB || "u671486929_dmkmarterpdata",
  connectTimeout: 20000,
};

async function main() {
  const conn = await mysql.createConnection(CFG);
  console.log("CONNECTED ✓");

  // 1) ERP products table structure
  const [cols] = await conn.query("DESCRIBE `products`");
  console.log("\n=== DESCRIBE products ===");
  for (const c of cols as Record<string, unknown>[]) {
    console.log(`  ${c.Field}  ${c.Type}  null=${c.Null} key=${c.Key} default=${c.Default === null ? "NULL" : "''"}`);
  }

  const [cnt] = await conn.query("SELECT COUNT(*) AS n FROM `products`");
  console.log(`\nproducts rows: ${(cnt as { n: number }[])[0].n}`);

  // 2) sample 3 rows (trim long values)
  const [rows] = await conn.query("SELECT * FROM `products` ORDER BY id LIMIT 3");
  for (const r of rows as Record<string, unknown>[]) {
    const slim: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) slim[k] = typeof v === "string" && v.length > 60 ? v.slice(0, 60) + "…" : v;
    console.log(JSON.stringify(slim));
  }

  // 3) SKU sample to compare with Excel
  const [skus] = await conn.query("SELECT sku, name FROM `products` ORDER BY id LIMIT 8");
  console.log("\n=== first 8 SKUs ===");
  for (const s of skus as Record<string, unknown>[]) console.log(`  ${s.sku} | ${String(s.name).slice(0, 50)}`);

  // 4) which other DBs can this user see?
  try {
    const [dbs] = await conn.query("SHOW DATABASES");
    console.log("\n=== DATABASES visible ===");
    for (const d of dbs as Record<string, unknown>[]) console.log(`  ${Object.values(d)[0]}`);
  } catch (e) { console.log("SHOW DATABASES failed:", (e as Error).message); }

  await conn.end();
}

main().catch((e: unknown) => {
  const err = e as { code?: string; errno?: number; message?: string; fatal?: boolean };
  console.error("PROBE FAILED:", JSON.stringify({ code: err.code, errno: err.errno, fatal: err.fatal, message: err.message }));
  process.exit(1);
});
