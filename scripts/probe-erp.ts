/* Read-only probe of the owner's ERP MySQL — lists tables, finds products table, shows columns + 2 sample rows. */
import mysql from "mysql2/promise";

const CFG = {
  host: process.env.ERP_HOST || "srv844.hstgr.io",
  port: Number(process.env.ERP_PORT || 3306),
  user: process.env.ERP_USER || "u671486929_dmkmarterp",
  password: process.env.ERP_PASSWORD || "DMKMart@26",
  database: process.env.ERP_DB || "u671486929_dmkmarterpdata",
  connectTimeout: 15000,
};

async function main() {
  console.log(`Connecting to ${CFG.host}:${CFG.port} db=${CFG.database} ...`);
  const conn = await mysql.createConnection(CFG);
  console.log("CONNECTED ✓");

  const [tables] = await conn.query("SHOW TABLES");
  console.log("\n=== TABLES ===");
  for (const row of tables as Record<string, unknown>[]) {
    const name = Object.values(row)[0] as string;
    const [cnt] = await conn.query(`SELECT COUNT(*) AS n FROM \`${name}\``);
    console.log(`  ${name}  (${(cnt as { n: number }[])[0].n} rows)`);
  }

  // find the products table
  const candidates = (tables as Record<string, unknown>[])
    .map((r) => String(Object.values(r)[0]))
    .filter((n) => /product/i.test(n));

  for (const t of candidates) {
    console.log(`\n=== DESCRIBE ${t} ===`);
    const [cols] = await conn.query(`DESCRIBE \`${t}\``);
    for (const c of cols as Record<string, unknown>[]) {
      console.log(`  ${c.Field}  ${c.Type}  null=${c.Null} key=${c.Key}`);
    }
    console.log(`\n=== SAMPLE ROWS ${t} (2) ===`);
    const [rows] = await conn.query(`SELECT * FROM \`${t}\` LIMIT 2`);
    for (const r of rows as Record<string, unknown>[]) {
      console.log(JSON.stringify(r, null, 2).slice(0, 2500));
      console.log("  ---");
    }
  }

  await conn.end();
  console.log("\nDONE (read-only, connection closed)");
}

main().catch((e) => {
  console.error("PROBE FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
