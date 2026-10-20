/** Save ERP MySQL credentials into the Setting table + configure products table. */
const { PrismaClient } = require("/home/z/my-project/node_modules/.prisma/client");
const db = new PrismaClient();

const SETTINGS = [
  { key: "erp_db_host", value: "srv844.hstgr.io" },
  { key: "erp_db_port", value: "3306" },
  { key: "erp_db_user", value: "u671486929_dmkmarterp" },
  { key: "erp_db_password", value: "DMKMart@26" },
  { key: "erp_db_name", value: "u671486929_dmkmarterpdata" },
  { key: "erp_products_table", value: "products" },
  { key: "erp_write_enabled", value: "false" },
];

(async () => {
  for (const s of SETTINGS) {
    await db.setting.upsert({ where: { key: s.key }, create: s, update: { value: s.value } });
  }
  console.log("ERP credentials saved to Setting table ✓");
  await db.$disconnect();
})();
