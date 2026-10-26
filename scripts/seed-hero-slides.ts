/**
 * Seed hero slider rows with the 3 new campaign images.
 * - Removes old baked-artwork slider rows
 * - Inserts 3 slides (image / headline / paragraph / CTA text / CTA URL)
 *   All fields remain editable via Admin → Website Management → Manage Sliders.
 * Run: npx tsx scripts/seed-hero-slides.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const slides = [
  {
    heading: "Everyday Essentials for a Better Tomorrow",
    content:
      "Housewares, kitchenware & storage from 40+ trusted brands — live stock, true wholesale rates, straight from DMK Mart ERP.",
    buttonText: "Shop Catalog",
    buttonUrl: "/catalog",
    image: "/images/hero/hero-1.jpg",
    position: "LEFT",
    sortOrder: 0,
  },
  {
    heading: "Bulk Storage, Bigger Savings",
    content:
      "Baskets, bins, buckets & containers at slab pricing. Stock up in bulk — the more cases you take, the more you save.",
    buttonText: "Explore Storage",
    buttonUrl: "/catalog",
    image: "/images/hero/hero-2.jpg",
    position: "LEFT",
    sortOrder: 1,
  },
  {
    heading: "One Mart. Every Business.",
    content:
      "Retailer, wholesaler or distributor — get your own price slabs. Pickup at your nearest warehouse or get bulk-case delivery.",
    buttonText: "Create Account",
    buttonUrl: "/account",
    image: "/images/hero/hero-3.jpg",
    position: "LEFT",
    sortOrder: 2,
  },
];

async function main() {
  const old = await db.slider.findMany({ select: { id: true, heading: true, image: true } });
  console.log("Existing sliders:", old);
  await db.slider.deleteMany({});
  for (const s of slides) {
    await db.slider.create({ data: s });
  }
  const now = await db.slider.findMany({ orderBy: { sortOrder: "asc" } });
  console.log(`Seeded ${now.length} hero slides:`);
  for (const s of now) console.log(`  [${s.sortOrder}] ${s.heading} → ${s.image} (${s.buttonText} → ${s.buttonUrl})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
