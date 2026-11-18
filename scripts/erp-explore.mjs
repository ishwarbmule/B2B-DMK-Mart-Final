// Explore the ERP MySQL schema: list tables, sizes, and find order/warehouse/product/company tables.
import mysql from 'mysql2/promise';

const cfg = {
  host: process.env.ERP_MYSQL_HOST,
  port: Number(process.env.ERP_MYSQL_PORT || 3306),
  user: process.env.ERP_MYSQL_USER,
  password: process.env.ERP_MYSQL_PASSWORD,
  database: process.env.ERP_MYSQL_DATABASE,
  connectTimeout: 15000,
  ssl: { rejectUnauthorized: false },
};

const conn = await mysql.createConnection(cfg);
console.log('CONNECTED as', cfg.user, '@', cfg.host, '/', cfg.database);

const [tables] = await conn.query('SHOW TABLES');
const names = tables.map((r) => Object.values(r)[0]);
console.log('\n== ALL TABLES (' + names.length + ') ==');
console.log(names.join('\n'));

// Row counts for interesting tables
const interesting = names.filter((n) =>
  /order|sale|invoice|stock|warehouse|godown|product|item|company|brand|categor|rate|price/i.test(n),
);
console.log('\n== RELEVANT TABLE ROW COUNTS ==');
for (const t of interesting) {
  try {
    const [c] = await conn.query('SELECT COUNT(*) AS n FROM `' + t + '`');
    console.log(t, '=', c[0].n);
  } catch (e) {
    console.log(t, 'ERR', e.message);
  }
}

await conn.end();
console.log('\nDONE');
