/** Remove TEST-* products created by the active/inactive flow test. */
const { PrismaClient } = require("/home/z/my-project/node_modules/.prisma/client");
const db = new PrismaClient();
(async () => {
  const r = await db.product.deleteMany({ where: { sku: { startsWith: "TEST-" } } });
  console.log("deleted test products:", r.count);
  await db.$disconnect();
})();
