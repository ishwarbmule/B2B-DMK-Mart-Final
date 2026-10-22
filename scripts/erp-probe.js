/* Probe the owner's ERP MySQL: connectivity + schema discovery (READ-ONLY). */
const mysql = require("/home/z/my-project/node_modules/mysql2/promise.js");

const conn = {
  host: process.env.ERP_HOST || "srv844.hstgr.io",
  port: Number(process.env.ERP_PORT || 3306),
  user: process.env.ERP_USER || "u671486929_dmkmarterp",
  password: process.env.ERP_PASS || "DMKMart@26",
  database: process.env.ERP_DB || "u671486929_dmkmarterpdata",
  connectTimeout: 20000,
  multipleStatements: false,
};

(async () => {
  try {
    const pool = mysql.createPool({ ...conn, connectionLimit: 2 });
    const [v] = await pool.query("SELECT VERSION() AS v, DATABASE() AS d");
    console.log("CONNECTED ✓  MySQL", v[0].v, "· db:", v[0].d);

    const [tables] = await pool.query(
      `SELECT table_name AS name, table_rows AS approxRows
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    console.log(`\nTABLES (${tables.length}):`);
    for (const t of tables) console.log("  -", t.name, t.approxRows !== null ? `(~${t.approxRows})` : "");

    await pool.end();
  } catch (e) {
    console.error("CONNECT FAILED:", e.code || "", e.message);
    process.exit(1);
  }
})();
