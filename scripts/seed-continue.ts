/**
 * Continuation seed for the Neon app DB — seeds everything AFTER products (which are already in).
 * Bulk createMany with explicit IDs (no per-row WAN round-trips).
 * Run: DATABASE_URL="<neon app url>" bun scripts/seed-continue.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { createHash, randomUUID } from "crypto";

const db = new PrismaClient();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rnd = (seed: string, mod: number) => parseInt(createHash("md5").update(seed).digest("hex").slice(0, 8), 16) % mod;

type CatalogProduct = {
  sku: string; name: string; brand: string; packQty: number; piecesPerBox: number;
  tier1: number; tier2: number; tier3: number; tier4: number; dealerPrice: number;
  mrp: number; gst: number; hsn: string; image: string; isDeal: boolean; dealPrice: number;
};

async function main() {
  console.log("🌱 Continuation seed…");
  const catalog = JSON.parse(readFileSync("scripts/catalog-final.json", "utf-8"));
  const products: CatalogProduct[] = catalog.products;

  // clean partial demo orders, keep products/brands/customers/etc.
  await db.orderItem.deleteMany();
  await db.order.deleteMany();

  const prodRows = await db.product.findMany({
    where: { active: true },
    select: { id: true, sku: true, name: true, image: true, dealerPrice: true, mrp: true, gst: true, hsn: true },
  });
  const prodBySku = new Map(prodRows.map((p) => [p.sku, p]));
  const catBySku = new Map(products.map((p) => [p.sku, p]));

  const custRows = await db.customer.findMany({ select: { id: true, phone: true, shopName: true, city: true } });
  const custByPhone = new Map(custRows.map((c) => [c.phone, c]));
  const customersData = [
    { name: "Rajesh Traders", shopName: "Rajesh General Stores", phone: "9822011101", customerType: "RETAILER", city: "Pune" },
    { name: "Sai Distribution", shopName: "Sai Distributors", phone: "9822011102", customerType: "WHOLESALE", city: "Solapur" },
    { name: "Mahalaxmi Enterprises", shopName: "Mahalaxmi Enterprises", phone: "9822011103", customerType: "DISTRIBUTOR", city: "Kolhapur" },
    { name: "Ganesh Provision", shopName: "Ganesh Provision Store", phone: "9822011104", customerType: "RETAILER", city: "Nashik" },
    { name: "Bharat Wholesale", shopName: "Bharat Bazar", phone: "9822011105", customerType: "WHOLESALE", city: "Mumbai" },
    { name: "Sharma Kirana & Plastic", shopName: "Sharma Stores", phone: "9822011106", customerType: "RETAILER", city: "Nagpur" },
    { name: "Om Sai Plastics", shopName: "Om Sai Trading", phone: "9822011107", customerType: "WHOLESALE", city: "Pune" },
    { name: "Vidarbha Distributors", shopName: "Vidarbha Agency", phone: "9822011108", customerType: "DISTRIBUTOR", city: "Amravati" },
  ];

  const types = ["GUEST", "RETAILER", "WHOLESALE", "DISTRIBUTOR"] as const;
  const tierByType: Record<string, string> = { GUEST: "tier4", RETAILER: "tier4", WHOLESALE: "tier2", DISTRIBUTOR: "tier1" };
  const payModes = ["UPI", "CASH", "CREDIT", "UPI", "UPI", "CASH"];
  const statuses = ["DELIVERED", "DELIVERED", "DISPATCHED", "PACKED", "CONFIRMED", "PENDING"];
  const prices = (p: any, tier: string) => (tier === "tier1" ? p.tier1 || p.dealerPrice : tier === "tier2" ? p.tier2 || p.dealerPrice : tier === "tier3" ? p.tier3 || p.dealerPrice : p.dealerPrice);

  const activeProducts = prodRows.map((p) => ({ ...p, cat: catBySku.get(p.sku) }));

  const ordersData: any[] = [];
  const itemsData: any[] = [];
  let invoiceSeq = 1000;
  for (let d = 88; d >= 0; d--) {
    const ordersToday = d < 7 ? 1 + rnd(`d${d}`, 3) : rnd(`d${d}`, 3);
    for (let k = 0; k < ordersToday; k++) {
      const seed = `o${d}-${k}`;
      const custType = types[rnd(seed + "t", types.length)];
      const tier = tierByType[custType];
      const nItems = 2 + rnd(seed + "i", 5);
      const picked: typeof activeProducts = [];
      for (let j = 0; j < nItems; j++) {
        const p = activeProducts[rnd(seed + "p" + j, activeProducts.length)];
        if (!picked.find((x) => x.id === p.id)) picked.push(p);
      }
      const orderId = randomUUID();
      const items = picked.map((p) => {
        const cat = p.cat ?? { packQty: 6, piecesPerBox: 0 };
        const unitType = rnd(seed + "u" + p.sku, 10) < 5 ? "SINGLE" : rnd(seed + "u" + p.sku, 10) < 8 ? "PACK" : "BULK";
        const packQty = unitType === "SINGLE" ? 1 : unitType === "PACK" ? Math.max(1, cat.packQty || 6) : Math.max(cat.piecesPerBox || cat.packQty * 4 || 24, 12);
        const unitPrice = prices(p, tier) * (unitType === "SINGLE" ? 1 : unitType === "PACK" ? packQty * 0.94 : packQty * 0.88);
        const qty = unitType === "SINGLE" ? 6 + rnd(seed + "q" + p.sku, 24) : 1 + rnd(seed + "q" + p.sku, 4);
        const total = Math.round(unitPrice * qty * 100) / 100;
        return {
          id: randomUUID(), orderId,
          productId: p.id, sku: p.sku, name: p.name, image: p.image, unitType,
          packQty, qty, pieces: qty * packQty, unitPrice: Math.round(unitPrice * 100) / 100,
          gst: p.gst, hsn: p.hsn, total, discount: 0,
          barcode: `${p.sku}-${unitType[0]}`,
        };
      });
      const itemTotal = Math.round(items.reduce((a, b) => a + b.total, 0) * 100) / 100;
      const gstAmount = Math.round(itemTotal * 0.18 * 100) / 100;
      const discount = rnd(seed + "disc", 10) < 3 ? Math.round(itemTotal * 0.05 * 100) / 100 : 0;
      const grandTotal = Math.round((itemTotal + gstAmount - discount) * 100) / 100;
      const createdAt = new Date(Date.now() - d * 86400000 - k * 3600000 - rnd(seed, 500) * 60000);
      const cust = customersData[rnd(seed + "c", customersData.length)];
      const status = statuses[rnd(seed + "s", statuses.length)];
      ordersData.push({
        id: orderId,
        invoiceNo: `DMK/2026-27/INV/${invoiceSeq++}`,
        otp: String(1000 + rnd(seed + "otp", 9000)),
        otpSentAt: createdAt,
        itemTotal, gstAmount, discount, grandTotal,
        totalSavings: Math.round(items.reduce((a, b) => a + (b.unitPrice * 0.06 * b.qty), 0) * 100) / 100,
        customerId: custType === "GUEST" ? "" : custByPhone.get(cust.phone)?.id ?? "",
        customerName: custType === "GUEST" ? ["Walk-in Retail", "Quick Order", "Guest Buyer"][rnd(seed, 3)] : cust.shopName,
        customerType: custType, priceTier: tier,
        phone: custType === "GUEST" ? `9${800000000 + rnd(seed, 99999999)}` : cust.phone,
        addressLine: `Shop ${1 + rnd(seed, 40)}, Main Market`,
        city: cust.city, pincode: "411001",
        paymentMethod: payModes[rnd(seed + "pm", payModes.length)],
        paymentStatus: ["PAID", "PAID", "PENDING"][rnd(seed + "ps", 3)],
        shippingStatus: status === "DELIVERED" ? "DELIVERED" : ["PENDING", "PACKED", "IN_TRANSIT"][rnd(seed + "ss", 3)],
        status, source: rnd(seed + "src", 10) < 8 ? "WEB" : "POS",
        couponCode: discount > 0 ? "DMK10" : "",
        createdAt,
      });
      itemsData.push(...items);
    }
  }
  for (let i = 0; i < ordersData.length; i += 50) await db.order.createMany({ data: ordersData.slice(i, i + 50) });
  for (let i = 0; i < itemsData.length; i += 100) await db.orderItem.createMany({ data: itemsData.slice(i, i + 100) });
  console.log(`  orders: ${ordersData.length}, items: ${itemsData.length}`);

  const now = Date.now();
  await db.offer.createMany({
    data: [
      {
        name: "DMK Big Wholesale Days", slug: "dmk-big-wholesale-days", type: "MEGA_SALE",
        headline: "Big Wholesale Days", subText: "Up to 32% off on 2,200+ SKUs · Festival stocking prices live now",
        ctaText: "Grab the Deals", ctaUrl: "/catalog?deals=1",
        bgColor: "#111111", textColor: "#facc15", heroSlot: true,
        startAt: new Date(now - 3 * 86400000), endAt: new Date(now + 11 * 86400000),
        scopeType: "ALL", discountType: "PERCENT", discountValue: 10, minOrder: 5000, active: true,
      },
      {
        name: "Diwali Stocking Carnival", slug: "diwali-stocking-carnival", type: "FESTIVAL",
        headline: "Diwali Stocking Carnival", subText: "Planter, kitchenware & gift ranges at season-best rates",
        ctaText: "View Range", ctaUrl: "/brand/garden-needs",
        bgColor: "#7c2d12", textColor: "#fde68a", heroSlot: false,
        startAt: new Date(now + 20 * 86400000), endAt: new Date(now + 40 * 86400000),
        scopeType: "BRAND", scopeIds: JSON.stringify(["garden-needs", "pariwar-households"]), discountType: "PERCENT", discountValue: 12, active: true,
      },
      {
        name: "Monsoon Home Refresh", slug: "monsoon-home-refresh", type: "SEASON",
        headline: "Monsoon Home Refresh", subText: "Mops, wipers, buckets & bins — buy 1 get 5% back in cart",
        ctaText: "Shop Cleaning", ctaUrl: "/catalog?department=cleaning",
        bgColor: "#0c4a6e", textColor: "#bae6fd", heroSlot: false,
        startAt: new Date(now - 30 * 86400000), endAt: new Date(now - 5 * 86400000),
        scopeType: "CATEGORY", discountType: "AMOUNT", discountValue: 1500, active: false,
      },
    ],
  });

  await db.coupon.createMany({
    data: [
      { code: "DMK10", headline: "FLAT 10% OFF", subText: "On orders above ₹5,000", type: "PERCENT", value: 10, minOrder: 5000, maxDiscount: 3000, bgColor: "#111111", textColor: "#facc15", showOnHome: true, usedCount: 28, startAt: new Date(now - 86400000), endAt: new Date(now + 30 * 86400000) },
      { code: "BULK15", headline: "BULK SAVINGS 15%", subText: "Orders above ₹50,000", type: "PERCENT", value: 15, minOrder: 50000, maxDiscount: 25000, bgColor: "#1a1a1a", textColor: "#4ade80", showOnHome: true, usedCount: 6, startAt: new Date(now - 86400000), endAt: new Date(now + 30 * 86400000) },
      { code: "NEWBIZ500", headline: "₹500 OFF FIRST ORDER", subText: "New business accounts", type: "AMOUNT", value: 500, minOrder: 4000, bgColor: "#111111", textColor: "#f87171", showOnHome: true, usedCount: 14, startAt: new Date(now - 86400000), endAt: new Date(now + 60 * 86400000) },
      { code: "FESTIVE12", headline: "FESTIVE 12% OFF", subText: "Deep Household range", type: "PERCENT", value: 12, minOrder: 8000, maxDiscount: 5000, bgColor: "#3b0764", textColor: "#e9d5ff", scopeType: "BRAND", scopeIds: JSON.stringify(["deep-household"]), showOnHome: true, usedCount: 3, startAt: new Date(now - 86400000), endAt: new Date(now + 20 * 86400000) },
    ],
  });

  await db.page.createMany({
    data: [
      {
        slug: "home", title: "Homepage", type: "SYSTEM",
        blocks: JSON.stringify([
          { id: "hero", type: "hero", visible: true, headline: "Wholesale That Works Harder", sub: "Pieces, packs & bulk cases from 39 brands — one B2B account.", bg: "#0a0a0a", textColor: "#ffffff" },
          { id: "brands", type: "brand-strip", visible: true, headline: "Shop by Brand" },
          { id: "deals", type: "deals", visible: true, headline: "Deals of the Day" },
          { id: "featured", type: "tabs", visible: true, headline: "Featured, Top Selling & Hot Deals" },
          { id: "coupons", type: "coupons", visible: true, headline: "Live Coupons" },
        ]),
        metaTitle: "DMK Mart — B2B Wholesale Marketplace for Plastic & Home Appliances",
        metaDescription: "Wholesale plastic household, kitchenware & appliances from 39 brands. Retailer, wholesaler & distributor pricing with GST invoicing.",
        keywords: "dmk mart, wholesale plastic, b2b household, bulk kitchenware",
        sortOrder: 0,
      },
      { slug: "about-us", title: "About Us", type: "CUSTOM", blocks: JSON.stringify([{ id: "body", type: "richtext", visible: true, text: "DMK Mart is a Maharashtra-based B2B marketplace for plastic household products, kitchenware, furniture and home appliances. We stock 2,200+ SKUs from 39 trusted brands and serve retailers, wholesalers and distributors across India with tier-based pricing, GST invoicing and reliable dispatch from our Pune warehouse." }]), metaTitle: "About DMK Mart", metaDescription: "DMK Mart company profile — B2B wholesale marketplace.", inFooter: true, sortOrder: 1 },
      { slug: "contact-us", title: "Contact Us", type: "CUSTOM", blocks: JSON.stringify([{ id: "body", type: "richtext", visible: true, text: "DMK Mart, Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019.\nPhone: +91 98220 12345 · Email: dmkmartdata@gmail.com\nSales hours: Mon–Sat, 9:30 AM – 6:30 PM." }]), metaTitle: "Contact DMK Mart", metaDescription: "Contact DMK Mart sales & support.", inFooter: true, sortOrder: 2 },
      { slug: "terms-and-conditions", title: "Terms & Conditions", type: "LEGAL", blocks: JSON.stringify([{ id: "body", type: "richtext", visible: true, text: "1. All prices are exclusive of GST unless stated. 2. Orders are confirmed upon payment or approved credit line. 3. Delivery OTP verification is mandatory at handover. 4. Returns accepted within 7 days for damaged/defective goods only. 5. Tier pricing applies per account type as approved by DMK Mart." }]), metaTitle: "Terms & Conditions — DMK Mart", metaDescription: "DMK Mart B2B terms of trade.", inFooter: true, sortOrder: 3 },
      { slug: "privacy-policy", title: "Privacy Policy", type: "LEGAL", blocks: JSON.stringify([{ id: "body", type: "richtext", visible: true, text: "DMK Mart collects business contact details, order history and GST information solely to fulfil B2B orders and comply with tax law. We never sell customer data. Delivery OTPs are shared only with the registered phone number of the order." }]), metaTitle: "Privacy Policy — DMK Mart", metaDescription: "How DMK Mart handles your business data.", inFooter: true, sortOrder: 4 },
      { slug: "refund-policy", title: "Refund & Return Policy", type: "LEGAL", blocks: JSON.stringify([{ id: "body", type: "richtext", visible: true, text: "Damaged or defective goods must be reported within 7 days of delivery with photos and the order OTP. Approved refunds are issued to the original payment method or adjusted against the account ledger within 10 working days." }]), metaTitle: "Refund & Return Policy — DMK Mart", metaDescription: "DMK Mart returns and refunds for B2B orders.", inFooter: true, sortOrder: 5 },
      { slug: "shipping-policy", title: "Shipping Policy", type: "LEGAL", blocks: JSON.stringify([{ id: "body", type: "richtext", visible: true, text: "Orders dispatch from Pune within 48 hours of payment confirmation. Freight is billed at actuals for case loads; free delivery within 40 km for orders above ₹25,000. Every shipment carries a delivery OTP printed on the invoice." }]), metaTitle: "Shipping Policy — DMK Mart", metaDescription: "DMK Mart dispatch and freight policy.", inFooter: true, sortOrder: 6 },
    ],
  });

  await db.seoMeta.createMany({
    data: [
      { path: "/", title: "DMK Mart — B2B Wholesale Marketplace", description: "Wholesale plastic household, kitchenware & appliances from 39 brands.", keywords: "wholesale, b2b, plastic household, dmkmart" },
      { path: "/catalog", title: "Wholesale Catalog — 2,200+ SKUs | DMK Mart", description: "Browse the full DMK Mart wholesale catalog by brand, department and price.", keywords: "wholesale catalog, plastic products bulk" },
      { path: "/brands", title: "All Brands | DMK Mart B2B", description: "39 trusted brands — Deep Household, Garden Needs, Goldex, Pariwar and more.", keywords: "brands, wholesale brands" },
      { path: "/account", title: "B2B Account — Login / Register | DMK Mart", description: "Retailer, wholesaler & distributor accounts with tier pricing.", keywords: "b2b login, wholesale account" },
    ],
  });

  await db.salesPerson.createMany({ data: [
    { name: "Sunil Jagtap", mobile: "9850001101" },
    { name: "Kavita More", mobile: "9850001102" },
    { name: "Imran Qureshi", mobile: "9850001103" },
  ] });
  await db.deliveryMan.createMany({ data: [
    { name: "Sanjay Pawar", username: "sanjay.p", phone: "9850002201" },
    { name: "Dipak Shinde", username: "dipak.s", phone: "9850002202" },
    { name: "Rafik Sayyed", username: "rafik.s", phone: "9850002203" },
  ] });
  await db.activityLog.createMany({ data: [
    { action: "SYNC", entity: "ERP", detail: "Initial catalog pull from Neon ERP — 2,272 products, 39 brands" },
    { action: "CREATE", entity: "Offer", detail: "DMK Big Wholesale Days scheduled" },
    { action: "CREATE", entity: "Coupon", detail: "4 coupons published to homepage" },
  ] });
  await db.syncEvent.create({ data: { direction: "PULL_ERP", action: "PRODUCTS", status: "OK", message: "Initial seed pull — 2,272 products, 39 brands", productsSeen: 2272, created: 2272, updated: 0 } });

  console.log("✅ Continuation seed complete.");
  console.log({
    products: await db.product.count(), orders: await db.order.count(), orderItems: await db.orderItem.count(),
    offers: await db.offer.count(), coupons: await db.coupon.count(), pages: await db.page.count(),
    customers: await db.customer.count(), brands: await db.brand.count(),
  });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
