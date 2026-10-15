/** Point the demo ads at the real uploaded banner (Ad.title is not unique → find by id). */
const BANNER = "https://res.cloudinary.com/dmkmart/image/upload/v1791951336/dmk-mart/ads/uomyqxldrgljhltqedbk.png";

(async () => {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();

  const cello = await p.ad.findFirst({ where: { title: "Cello Deep Dhamaka" } });
  if (cello) {
    await p.ad.update({ where: { id: cello.id }, data: { image: BANNER, sortOrder: 1 } });
    console.log("cello ad → real banner");
  }

  const brand = (await p.brand.findFirst({ where: { name: { contains: "gold", mode: "insensitive" } } }))
    || (await p.brand.findFirst({ orderBy: { name: "asc" }, skip: 1 }));
  const goldex = await p.ad.findFirst({ where: { title: "New: Goldex commercial kitchen line now in stock" } });
  if (goldex) {
    await p.ad.update({ where: { id: goldex.id }, data: { image: BANNER, brandId: brand?.id ?? null, sortOrder: 2 } });
    console.log("goldex ad → real banner, brand:", brand?.name ?? "—");
  }
  await p.$disconnect();
})();
