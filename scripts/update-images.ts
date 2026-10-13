/**
 * Apply final image mapping to Product.image in DB.
 * 1,757 direct Cloudinary matches + 507 category/token fallbacks + 136 AI-generated.
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const p = new PrismaClient();

async function main() {
  const mapping: Record<string, string> = JSON.parse(
    fs.readFileSync("scripts/final-image-update.json", "utf8")
  );
  const entries = Object.entries(mapping);
  console.log(`Updating ${entries.length} product images...`);

  let updated = 0;
  const CHUNK = 200;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(([id, image]) =>
        p.product.update({ where: { id }, data: { image } }).catch((e) => {
          console.error(`FAIL id=${id}: ${e.message.slice(0, 80)}`);
        })
      )
    );
    updated += chunk.length;
    if (updated % 800 === 0) console.log(`  ${updated} done...`);
  }

  const stats = await p.$queryRawUnsafe<{ cloudinary: number; gen: number; svg: number }>(
    `SELECT
      COUNT(CASE WHEN image LIKE '%res.cloudinary.com%' THEN 1 END) as cloudinary,
      COUNT(CASE WHEN image LIKE '%/products/gen/%' THEN 1 END) as gen,
      COUNT(CASE WHEN image LIKE '%.svg' THEN 1 END) as svg
     FROM Product`
  );
  console.log("Final image stats:", stats);
  await p.$disconnect();
}

main();
