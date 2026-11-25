/**
 * One-off read-only probe: DESCRIBE the ERP products table + sample rows to
 * identify which columns carry the top/mid/end category names.
 * Credentials come from env only (never written to any file).
 */
import mysql from "mysql2/promise";

const host = process.env.ERP_MYSQL_HOST!;
const port = Number(process.env.ERP_MYSQL_PORT || 3306);
const user = process.env.ERP_MYSQL_USER!;
const password = process.env.ERP_MYSQL_PASSWORD!;
const database = process.env.ERP_MYSQL_DATABASE!;

async function main() {
  const conn = await mysql.createConnection({ host, port, user, password, database, ssl: { rejectUnauthorized: false }, connectTimeout: 20000 });
  const [cols]: any[] = await conn.query("DESCRIBE `Product`");
  console.log("── Product columns ──");
  for (const c of cols) console.log(`  ${c.Field}  ${c.Type}`);
  const catLike = cols.map((c: any) => c.Field).filter((f: string) => /cat|dept|group|type|class|segment/i.test(f));
  console.log("── category-like columns ──", catLike);
  const pick = ["id", "sku", ...catLike].filter(Boolean);
  const [rows]: any[] = await conn.query(
    `SELECT ${pick.map((p) => `\`${p}\``).join(", ")} FROM \`Product\` ORDER BY \`id\` ASC LIMIT 8`
  );
  console.log("── sample rows ──");
  for (const r of rows) console.log(JSON.stringify(r));
  const [cnt]: any[] = await conn.query("SELECT COUNT(*) AS n FROM `Product`");
  console.log("total products:", cnt[0].n);
  await conn.end();
}
main().catch((e) => { console.error("PROBE-ERROR:", e.code || "", e.message, e.syscall || "", e.address || "", e.port || ""); process.exit(1); });
