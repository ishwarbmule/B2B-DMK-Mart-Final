/**
 * seed-home2-demo.js — local SQLite demo seed for visual verification of /home-2
 * Real brand names + Cloudinary logos, real product names from the ERP dump,
 * picsum photos for product imagery, price spread across the 4 Shop-by-Price bands.
 * Usage: node scripts/seed-home2-demo.js
 */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const topsSrc = require("./catalog-final.json").tops ?? [];
const brandLogos = require("./brand-logo-urls.json");
const dump = require("./db-products-dump.json");

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const titleCase = (s) =>
  s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const pic = (seed, w = 600, h = 600) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

async function main() {
  console.log("Seeding demo data…");

  // ── settings ──
  const settings = [
    { key: "support_phone", value: "+919822012345" },
    { key: "wa_provider", value: "OFF" },
    { key: "sms_provider", value: "OFF" },
  ];
  for (const s of settings) {
    await db.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: s });
  }

  // ── sliders ──
  await db.slider.deleteMany({});
  await db.slider.createMany({
    data: [
      { heading: "Everyday Essentials for a Better Tomorrow", content: "Household, kitchenware, furniture and planters at true wholesale dealer rates — one cart, one invoice.", buttonText: "Shop Now", buttonUrl: "/catalog", sortOrder: 0 },
      { heading: "Bulk Cases, Dealer Slabs, GST Invoices", content: "Save up to 16% on container-load pricing across 39 trusted brands.", buttonText: "See Deals", buttonUrl: "/catalog?flag=deal", sortOrder: 1 },
    ],
  });

  // ── categories: 9 tops + 1 mid + 1 end each ──
  await db.returnRequest.deleteMany({}).catch(() => {});
  await db.purchase.deleteMany({}).catch(() => {});
  await db.orderItem.deleteMany({}).catch(() => {});
  await db.order.deleteMany({}).catch(() => {});
  await db.product.deleteMany({});
  await db.endCategory.deleteMany({});
  await db.midCategory.deleteMany({});
  await db.topCategory.deleteMany({});
  const tops = [];
  for (const t of topsSrc.slice(0, 9)) {
    const top = await db.topCategory.create({
      data: { name: t.name, emoji: t.emoji || "🧺", image: t.image || "", color: "#facc15", sortOrder: t.sortOrder ?? tops.length },
    });
    const mid = await db.midCategory.create({ data: { name: `${t.name} — General`, topId: top.id } });
    const end = await db.endCategory.create({ data: { name: "Assorted", midId: mid.id } });
    tops.push({ top, mid, end });
  }
  console.log(`tops: ${tops.length}`);

  // ── brands (real logos) ──
  await db.ad.deleteMany({});
  await db.brand.deleteMany({});
  const pickedSlugs = [
    "deep-household", "prestige-ltd", "milton-kitchenware", "borosil-kitchenware", "nayasa",
    "mango-furniture", "paras-plastics", "ap-plastics", "anjali-kitchenware", "falcon-garden-tools",
    "goldex-kitchen-equipments", "jaipan-home-appliance", "hd-polyplast", "steel-king-cleaning",
  ].filter((s) => brandLogos[s]);
  const brands = [];
  for (const slug of pickedSlugs.slice(0, 14)) {
    const b = await db.brand.create({
      data: { name: titleCase(slug), slug, logo: brandLogos[slug], active: true },
    });
    brands.push(b);
  }
  console.log(`brands: ${brands.length}`);

  // ── products: real names, spread across tops, brands, price bands & flags ──
  const priceBands = [89, 149, 199, 249, 399, 499, 599, 749, 999, 1299, 1799, 2499];
  const byCompany = new Map();
  for (const p of dump) {
    const arr = byCompany.get(p.company) ?? [];
    arr.push(p);
    byCompany.set(p.company, arr);
  }
  const companyNames = [...byCompany.keys()].sort((a, b) => byCompany.get(b).length - byCompany.get(a).length);

  const products = [];
  let i = 0;
  const TOTAL = 56;
  while (products.length < TOTAL) {
    for (const comp of companyNames) {
      if (products.length >= TOTAL) break;
      const src = byCompany.get(comp)[i % byCompany.get(comp).length];
      const slot = tops[products.length % tops.length];
      const brand = brands.find((b) => slugify(b.name) === slugify(comp)) ?? brands[products.length % brands.length];
      const dealerPrice = priceBands[products.length % priceBands.length];
      const mrp = Math.round(dealerPrice * (1.2 + (products.length % 4) * 0.08));
      products.push({
        sku: `DMK-H2-${String(1000 + products.length)}`,
        name: src.name,
        slug: `${slugify(src.name).slice(0, 60)}-${products.length + 1}`,
        brandId: brand.id,
        topId: slot.top.id,
        midId: slot.mid.id,
        endId: slot.end.id,
        unit: "Pcs",
        packQty: 6,
        piecesPerBox: 48,
        dealerPrice,
        basePrice: dealerPrice,
        mrp,
        stock: 120,
        gst: 18,
        image: pic(`dmkh2-${products.length + 1}`),
        isTop: products.length < 8,
        isFeatured: products.length >= 8 && products.length < 30,
        isHot: products.length >= 30 && products.length < 42,
      });
    }
    i++;
    if (i > 5) break;
  }
  await db.product.createMany({ data: products });
  console.log(`products: ${products.length} (top:${products.filter((p) => p.isTop).length}, featured:${products.filter((p) => p.isFeatured).length}, hot:${products.filter((p) => p.isHot).length})`);

  // ── sponsored ads (wide banners) ──
  const adData = [
    { title: "Cleaning Made Easy — Spotless Homes", image: pic("dmk-ad-clean", 1200, 510), brandId: brands[0]?.id, sortOrder: 0 },
    { title: "Durable Planters for Every Space", image: pic("dmk-ad-planter", 1200, 510), brandId: brands[1]?.id, sortOrder: 1 },
    { title: "Classic Essentials since 1961", image: pic("dmk-ad-classic", 1200, 510), brandId: brands[2]?.id, sortOrder: 2 },
  ];
  await db.ad.createMany({ data: adData.map((a) => ({ ...a, link: "#", active: true })) });
  console.log(`ads: ${adData.length}`);
  console.log("DONE");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
