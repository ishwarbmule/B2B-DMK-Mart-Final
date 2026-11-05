/** Read-only: dump distinct EndCategory names (+ product counts) to tailor icon mapping. */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const ends = await db.endCategory.findMany({
    select: { name: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
  const seen = new Map<string, number>();
  for (const e of ends) seen.set(e.name, (seen.get(e.name) ?? 0) + e._count.products);
  console.log(`distinct end categories: ${seen.size}`);
  for (const [name, cnt] of [...seen.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${cnt}\t${name}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
