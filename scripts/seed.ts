/**
 * DMK Mart restructured seed: brands-first catalog from ERP merge + operational demo data.
 * Run: bunx tsx scripts/seed.ts  (or bun run scripts/seed.ts)
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { createHash, randomUUID } from "crypto";

const db = new PrismaClient();

type CatalogProduct = {
  erpId: string; sku: string; name: string; brand: string; company: string; brandRaw: string;
  top: string; mid: string; end: string; unit: string; packQty: number; piecesPerBox: number;
  purchaseCost: number; tier1: number; tier2: number; tier3: number; tier4: number; tier5: number;
  dealerPrice: number; basePrice: number; mrp: number; packPrice: number; packDiscountPct: number;
  stock: number; damaged: number; reserved: number; lowStockThreshold: number;
  barcode: string; hsn: string; gst: number; weightGrams: number; image: string; isActive: boolean;
  isFeatured: boolean; isTop: boolean; isHot: boolean; isDeal: boolean; dealPrice: number;
  rating: number; reviewCount: number;
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "item";
const rnd = (seed: string, mod: number) =>
  parseInt(createHash("md5").update(seed).digest("hex").slice(0, 8), 16) % mod;

async function main() {
  console.log("🌱 Seeding DMK Mart (brands-first)…");
  const catalog = JSON.parse(readFileSync("scripts/catalog-final.json", "utf-8"));
  const brands: any[] = catalog.brands;
  const tops: any[] = catalog.tops;
  const mids: any[] = catalog.mids;
  const ends: any[] = catalog.ends;
  const products: CatalogProduct[] = catalog.products;

  // wipe
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.priceChangeLog.deleteMany();
  await db.syncEvent.deleteMany();
  await db.product.deleteMany();
  await db.endCategory.deleteMany();
  await db.midCategory.deleteMany();
  await db.topCategory.deleteMany();
  await db.brand.deleteMany();
  await db.customer.deleteMany();
  await db.offer.deleteMany();
  await db.coupon.deleteMany();
  await db.page.deleteMany();
  await db.seoMeta.deleteMany();
  await db.slider.deleteMany();
  await db.ad.deleteMany();
  await db.priceSlab.deleteMany();
  await db.setting.deleteMany();
  await db.store.deleteMany();
  await db.zone.deleteMany();
  await db.salesPerson.deleteMany();
  await db.deliveryMan.deleteMany();
  await db.activityLog.deleteMany();
  await db.purchase.deleteMany();
  await db.returnRequest.deleteMany();

  // ── Brands ──
  const brandId = new Map<string, string>();
  for (const [i, b] of brands.entries()) {
    const row = await db.brand.create({
      data: {
        name: b.name,
        slug: b.slug,
        logo: b.logo || "",
        description: b.productCount > 0 ? `${b.name} — a trusted DMK Mart brand with ${b.productCount}+ products across household, kitchen and industrial lines.` : `${b.name} — distributed by DMK Mart.`,
        tagline: b.productCount >= 200 ? "Best seller brand" : b.productCount >= 50 ? "Popular brand" : "New at DMK Mart",
        color: "#111111",
        erpNames: JSON.stringify(b.aliases ?? []),
        storefrontLayout: 1 + (i % 10),
        storefrontConfig: JSON.stringify({
          heroHeadline: `Shop ${b.name}`,
          heroSub: `Wholesale rates on the full ${b.name} range — pieces, packs & bulk cases.`,
          showCategories: true,
          showTopProducts: true,
          showHotDeals: true,
          showAllProducts: true,
          bg: "#ffffff",
          accent: "#facc15",
        }),
        isFeatured: b.isFeatured,
        sortOrder: i,
        active: b.productCount > 0,
      },
    });
    brandId.set(b.name, row.id);
  }
  console.log(`  brands: ${brandId.size}`);

  // ── Categories ──
  const topId = new Map<string, string>();
  for (const [i, t] of tops.entries()) {
    const row = await db.topCategory.create({
      data: { name: t.name, emoji: t.emoji || "🧺", image: t.image || "", color: "#facc15", sortOrder: i },
    });
    topId.set(t.name, row.id);
  }
  const midId = new Map<string, string>();
  for (const m of mids) {
    const t = topId.get(m.top);
    if (!t) continue;
    const row = await db.midCategory.create({ data: { name: m.name, topId: t } }).catch(() => null);
    if (row) midId.set(`${m.top}|${m.name}`, row.id);
  }
  const endId = new Map<string, string>();
  for (const e of ends) {
    const m = midId.get(e.mid.includes("|") ? e.mid : e.mid) ?? null;
    // ends store "mid" as plain name — find via any top
    let midRowId: string | null = null;
    if (m) midRowId = m;
    if (!midRowId) {
      // lookup by mid name across tops
      for (const [key, val] of midId.entries()) {
        if (key.split("|")[1] === e.mid) { midRowId = val; break; }
      }
    }
    if (!midRowId) continue;
    const row = await db.endCategory.create({ data: { name: e.name, midId: midRowId } }).catch(() => null);
    if (row) endId.set(`${e.mid}|${e.name}`, row.id);
  }
  console.log(`  categories: ${topId.size} tops / ${midId.size} mids / ${endId.size} ends`);

  // fallback categories
  const fallbackTop = topId.get("HouseHold Unbreakable") ?? [...topId.values()][0];
  let fallbackMid = [...midId.entries()].find(([k]) => k.startsWith("HouseHold Unbreakable|"))?.[1];
  if (!fallbackMid) fallbackMid = [...midId.values()][0];
  let fallbackEnd = [...endId.values()][0];
  if (!fallbackEnd) {
    const row = await db.endCategory.create({ data: { name: "General", midId: fallbackMid } });
    fallbackEnd = row.id;
  }

  // ── Products ──
  const usedSlugs = new Set<string>();
  const productIdBySku = new Map<string, string>();
  const activeProducts: { id: string; sku: string; name: string; image: string; dealerPrice: number; mrp: number; gst: number; hsn: string; purchaseCost: number; brand: string }[] = [];
  let created = 0;
  const CHUNK = 200;
  for (let i = 0; i < products.length; i += CHUNK) {
    const batch = products.slice(i, i + CHUNK);
    for (const p of batch) {
      let slug = slugify(`${p.brand}-${p.name}`);
      if (usedSlugs.has(slug)) slug = slugify(`${p.brand}-${p.name}-${p.sku.slice(-6)}`);
      if (usedSlugs.has(slug)) slug = `${slug}-${rnd(p.sku, 9999)}`;
      usedSlugs.add(slug);
      const t = topId.get(p.top) ?? fallbackTop;
      const m = midId.get(`${p.top}|${p.mid}`) ?? [...midId.entries()].find(([k]) => k.split("|")[1] === p.mid)?.[1] ?? fallbackMid;
      const e = endId.get(`${p.mid}|${p.end}`) ?? [...endId.entries()].find(([k]) => k.split("|")[1] === p.end)?.[1] ?? fallbackEnd;
      const desc = `${p.name} from ${p.brand} — dependable quality for retail counters, wholesale buyers and distributors. Available as single piece or full pack of ${p.packQty} pcs${p.piecesPerBox ? `, bulk case of ${p.piecesPerBox} pcs` : ""}. HSN ${p.hsn || "—"}, GST ${p.gst}%. Backed by DMK Mart's B2B service network across Maharashtra.`;
      const row = await db.product.create({
        data: {
          sku: p.sku,
          erpId: p.erpId,
          slug,
          name: p.name,
          brandId: brandId.get(p.brand)!,
          topId: t, midId: m, endId: e,
          unit: p.unit || "Pcs",
          packQty: Math.max(1, p.packQty || 1),
          piecesPerBox: p.piecesPerBox || 0,
          purchaseCost: p.purchaseCost || 0,
          dealerPrice: p.dealerPrice,
          basePrice: p.basePrice || p.dealerPrice,
          mrp: p.mrp,
          tier1: p.tier1, tier2: p.tier2, tier3: p.tier3, tier4: p.tier4, tier5: p.tier5,
          packPrice: p.packPrice,
          packDiscountPct: p.packDiscountPct,
          dealPrice: p.dealPrice || 0,
          stock: Math.round(p.stock),
          damagedStock: Math.round(p.damaged),
          reservedQty: Math.round(p.reserved),
          lowStockThreshold: p.lowStockThreshold || 10,
          barcode: p.barcode || "",
          hsn: p.hsn || "",
          gst: p.gst || 0,
          weightGrams: p.weightGrams || 0,
          image: p.image,
          gallery: p.image ? JSON.stringify([p.image]) : "[]",
          description: desc,
          seoTitle: `${p.name} — ${p.brand} | DMK Mart B2B`,
          seoDesc: `Buy ${p.name} (${p.brand}) at wholesale price. Single piece, pack of ${p.packQty} & bulk. GST invoice, fast dispatch.`,
          keywords: `${p.name}, ${p.brand}, ${p.end}, wholesale, bulk, dmkmart`,
          rating: p.rating,
          reviewCount: p.reviewCount,
          isHot: p.isHot, isTop: p.isTop, isFeatured: p.isFeatured, isDeal: p.isDeal,
          active: p.isActive,
          syncSource: "ERP",
          lastSyncedAt: new Date(),
        },
      });
      productIdBySku.set(p.sku, row.id);
      if (p.isActive && p.dealerPrice > 0) {
        activeProducts.push({ id: row.id, sku: p.sku, name: p.name, image: p.image, dealerPrice: p.dealerPrice, mrp: p.mrp, gst: p.gst, hsn: p.hsn, purchaseCost: p.purchaseCost, brand: p.brand });
      }
      created++;
    }
  }
  console.log(`  products: ${created}`);

  // ── Settings (site identity + firm profile for invoices) ──
  const settings: [string, string][] = [
    ["site_title", "DMK Mart — B2B Wholesale Marketplace"],
    ["site_tagline", "Plastic & Home Appliances Wholesale"],
    ["meta_description", "DMK Mart B2B — wholesale plastic household, kitchenware & home appliances from 39 trusted brands. Retailer, wholesaler & distributor pricing."],
    ["social_image", "https://res.cloudinary.com/dmkmart/image/upload/dmk-mart/brand/dmk-mart-logo.png"],
    ["logo_url", "/dmk-logo.png"],
    ["support_phone", "+91 98220 12345"],
    ["support_email", "dmkmartdata@gmail.com"],
    ["address", "Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019"],
    ["robots_txt", "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: {SITE_URL}/sitemap.xml"],
    ["firm_name", "DMK Mart"],
    ["firm_gstin", "27ABCDE1234F1Z5"],
    ["firm_address", "Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019"],
    ["firm_phone", "+91 98220 12345"],
    ["firm_email", "books@dmkmart.in"],
    ["firm_bank", "HDFC Bank"],
    ["firm_bank_account", "50200045678901"],
    ["firm_ifsc", "HDFC0001234"],
    ["firm_upi", "dmkmart@hdfcbank"],
    ["invoice_prefix", "DMK"],
    ["gst_state", "Maharashtra (27)"],
    ["erp_sync_enabled", "true"],
  ];
  for (const [key, value] of settings) await db.setting.create({ data: { key, value } });

  // ── Sliders + Ads ──
  await db.slider.createMany({
    data: [
      { heading: "Wholesale Rates, Straight from the Brands", content: "Pieces, packs & bulk cases on 2,200+ SKUs from 39 brands.", buttonText: "Start Ordering", buttonUrl: "/catalog", image: "", sortOrder: 0 },
      { heading: "Deep Household — Flat 15% on Buckets & Tubs", content: "Top-selling unbreakable range, now at distributor pricing.", buttonText: "Shop Deep", buttonUrl: "/brand/deep-household", image: "", sortOrder: 1 },
      { heading: "Garden Needs Planters — Season's Best Prices", content: "500+ planter SKUs ready to dispatch.", buttonText: "Explore Planters", buttonUrl: "/brand/garden-needs", image: "", sortOrder: 2 },
    ],
  });
  await db.ad.createMany({
    data: [
      { title: "Bulk Pack Savings — Buy by the case, save up to 22%", link: "/catalog?sort=discount", image: "", sortOrder: 0 },
      { title: "New: Goldex commercial kitchen line now in stock", link: "/brand/goldex-kitchen-equipments", image: "", sortOrder: 1 },
    ],
  });

  // ── Price slabs / Zones / Stores ──
  await db.priceSlab.createMany({
    data: [
      { title: "Retail Counter", minQty: 1, discountPct: 0, note: "MRP-linked retail pricing" },
      { title: "Wholesale Pack", minQty: 25, discountPct: 6, note: "6% off on 25+ mixed units" },
      { title: "Distributor Case", minQty: 100, discountPct: 11, note: "11% off on 100+ units" },
      { title: "Container Load", minQty: 1000, discountPct: 16, note: "Talk to sales for container pricing" },
    ],
  });
  await db.zone.createMany({ data: [{ name: "West" }, { name: "North" }, { name: "South" }, { name: "East" }] });
  await db.store.createMany({
    data: [
      { name: "DMK Mart Pune (Flagship)", manager: "Ramesh Kulkarni", phone: "+91 98220 12345", city: "Pune", area: "MIDC", zone: "West", status: "APPROVED" },
      { name: "DMK Mart Solapur", manager: "Sunita Pawar", phone: "+91 98220 12346", city: "Solapur", area: "Industrial Estate", zone: "West", status: "APPROVED" },
      { name: "DMK Mart Kolhapur", manager: "Vikas Patil", phone: "+91 98220 12347", city: "Kolhapur", area: "Shahupuri", zone: "West", status: "APPROVED" },
      { name: "DMK Mart Nashik", manager: "Amit Deshmukh", phone: "+91 98220 12348", city: "Nashik", area: "Satpur MIDC", zone: "North", status: "APPROVED" },
      { name: "DMK Mart Nagpur", manager: "Priya Joshi", phone: "+91 98220 12349", city: "Nagpur", area: "Hingna", zone: "East", status: "APPROVED" },
      { name: "DMK Mart Mumbai", manager: "Farhan Shaikh", phone: "+91 98220 12350", city: "Mumbai", area: "Bhiwandi", zone: "West", status: "PENDING" },
    ],
  });

  // ── Customers (B2B) ──
  const customersData = [
    { name: "Rajesh Traders", shopName: "Rajesh General Stores", phone: "9822011101", customerType: "RETAILER", tier: "tier4", status: "APPROVED", city: "Pune", gstin: "" },
    { name: "Sai Distribution", shopName: "Sai Distributors", phone: "9822011102", customerType: "WHOLESALE", tier: "tier2", status: "APPROVED", city: "Solapur", gstin: "27AAACS1234A1Z2" },
    { name: "Mahalaxmi Enterprises", shopName: "Mahalaxmi Enterprises", phone: "9822011103", customerType: "DISTRIBUTOR", tier: "tier1", status: "APPROVED", city: "Kolhapur", gstin: "27AABCM5678C1Z3" },
    { name: "Ganesh Provision", shopName: "Ganesh Provision Store", phone: "9822011104", customerType: "RETAILER", tier: "tier4", status: "APPROVED", city: "Nashik", gstin: "" },
    { name: "Bharat Wholesale", shopName: "Bharat Bazar", phone: "9822011105", customerType: "WHOLESALE", tier: "tier3", status: "APPROVED", city: "Mumbai", gstin: "27AAFCB9012D1Z4" },
    { name: "Sharma Kirana & Plastic", shopName: "Sharma Stores", phone: "9822011106", customerType: "RETAILER", tier: "tier4", status: "PENDING", city: "Nagpur", gstin: "" },
    { name: "Om Sai Plastics", shopName: "Om Sai Trading", phone: "9822011107", customerType: "WHOLESALE", tier: "tier2", status: "PENDING", city: "Pune", gstin: "" },
    { name: "Vidarbha Distributors", shopName: "Vidarbha Agency", phone: "9822011108", customerType: "DISTRIBUTOR", tier: "tier1", status: "APPROVED", city: "Amravati", gstin: "27AAGCV3456E1Z5" },
  ];
  const customerRows: Record<string, string> = {};
  for (const c of customersData) {
    const row = await db.customer.create({
      data: { ...c, email: `${c.phone}@dmkmart.in`, password: sha("demo1234"), address: `Shop 12, Market Road, ${c.city}`, pincode: "411001", source: "WEB", creditLimit: c.customerType === "DISTRIBUTOR" ? 500000 : c.customerType === "WHOLESALE" ? 200000 : 50000 },
    });
    customerRows[c.phone] = row.id;
  }

  // ── Orders (90 days of demo activity with unit-aware items + OTP) ──
  const types = ["GUEST", "RETAILER", "WHOLESALE", "DISTRIBUTOR"] as const;
  const tierByType: Record<string, string> = { GUEST: "tier4", RETAILER: "tier4", WHOLESALE: "tier2", DISTRIBUTOR: "tier1" };
  const payModes = ["UPI", "CASH", "CREDIT", "UPI", "UPI", "CASH"];
  const statuses = ["DELIVERED", "DELIVERED", "DISPATCHED", "PACKED", "CONFIRMED", "PENDING"];
  const prices = (p: any, tier: string) => (tier === "tier1" ? p.tier1 || p.dealerPrice : tier === "tier2" ? p.tier2 || p.dealerPrice : tier === "tier3" ? p.tier3 || p.dealerPrice : p.dealerPrice);
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
      const itemsData = picked.map((p) => {
        const unitType = rnd(seed + "u" + p.sku, 10) < 5 ? "SINGLE" : rnd(seed + "u" + p.sku, 10) < 8 ? "PACK" : "BULK";
        const prod = products.find((x) => x.sku === p.sku)!;
        const packQty = unitType === "SINGLE" ? 1 : unitType === "PACK" ? Math.max(1, prod.packQty || 6) : Math.max(prod.piecesPerBox || prod.packQty * 4 || 24, 12);
        const unitPrice = prices(p, tier) * (unitType === "SINGLE" ? 1 : unitType === "PACK" ? packQty * 0.94 : packQty * 0.88);
        const qty = unitType === "SINGLE" ? 6 + rnd(seed + "q" + p.sku, 24) : 1 + rnd(seed + "q" + p.sku, 4);
        const total = Math.round(unitPrice * qty * 100) / 100;
        return {
          productId: p.id, sku: p.sku, name: p.name, image: p.image, unitType,
          packQty, qty, pieces: qty * packQty, unitPrice: Math.round(unitPrice * 100) / 100,
          gst: p.gst, hsn: p.hsn, total, discount: 0,
          barcode: `${p.sku}-${unitType[0]}`,
        };
      });
      const itemTotal = Math.round(itemsData.reduce((a, b) => a + b.total, 0) * 100) / 100;
      const gstAmount = Math.round(itemTotal * 0.18 * 100) / 100;
      const discount = rnd(seed + "disc", 10) < 3 ? Math.round(itemTotal * 0.05 * 100) / 100 : 0;
      const grandTotal = Math.round((itemTotal + gstAmount - discount) * 100) / 100;
      const createdAt = new Date(Date.now() - d * 86400000 - k * 3600000 - rnd(seed, 500) * 60000);
      const cust = customersData[rnd(seed + "c", customersData.length)];
      const status = statuses[rnd(seed + "s", statuses.length)];
      const order = await db.order.create({
        data: {
          invoiceNo: `DMK/2026-27/INV/${invoiceSeq++}`,
          otp: String(1000 + rnd(seed + "otp", 9000)),
          otpSentAt: createdAt,
          itemTotal, gstAmount, discount, grandTotal,
          totalSavings: Math.round(itemsData.reduce((a, b) => a + (b.unitPrice * 0.06 * b.qty), 0) * 100) / 100,
          customerId: custType === "GUEST" ? "" : customerRows[cust.phone] ?? "",
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
        },
      });
      for (const it of itemsData) {
        await db.orderItem.create({ data: { ...it, orderId: order.id } });
      }
    }
  }
  const orderCount = await db.order.count();
  console.log(`  orders: ${orderCount} (with items)`);

  // coupon usage
  await db.coupon.update({ where: { code: "DMK10" }, data: { usedCount: 28 } }).catch(() => {});

  // ── Offers (Big Million Days engine) ──
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

  // ── Coupons (auto-creatives on homepage) ──
  await db.coupon.createMany({
    data: [
      { code: "DMK10", headline: "FLAT 10% OFF", subText: "On orders above ₹5,000", type: "PERCENT", value: 10, minOrder: 5000, maxDiscount: 3000, bgColor: "#111111", textColor: "#facc15", showOnHome: true, usedCount: 28, startAt: new Date(now - 86400000), endAt: new Date(now + 30 * 86400000) },
      { code: "BULK15", headline: "BULK SAVINGS 15%", subText: "Orders above ₹50,000", type: "PERCENT", value: 15, minOrder: 50000, maxDiscount: 25000, bgColor: "#1a1a1a", textColor: "#4ade80", showOnHome: true, usedCount: 6, startAt: new Date(now - 86400000), endAt: new Date(now + 30 * 86400000) },
      { code: "NEWBIZ500", headline: "₹500 OFF FIRST ORDER", subText: "New business accounts", type: "AMOUNT", value: 500, minOrder: 4000, bgColor: "#111111", textColor: "#f87171", showOnHome: true, usedCount: 14, startAt: new Date(now - 86400000), endAt: new Date(now + 60 * 86400000) },
      { code: "FESTIVE12", headline: "FESTIVE 12% OFF", subText: "Deep Household range", type: "PERCENT", value: 12, minOrder: 8000, maxDiscount: 5000, bgColor: "#3b0764", textColor: "#e9d5ff", scopeType: "BRAND", scopeIds: JSON.stringify(["deep-household"]), showOnHome: true, usedCount: 3, startAt: new Date(now - 86400000), endAt: new Date(now + 20 * 86400000) },
    ],
  });

  // ── Pages (Website Management + legal) ──
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

  // ── SEO meta per route ──
  await db.seoMeta.createMany({
    data: [
      { path: "/", title: "DMK Mart — B2B Wholesale Marketplace", description: "Wholesale plastic household, kitchenware & appliances from 39 brands.", keywords: "wholesale, b2b, plastic household, dmkmart" },
      { path: "/catalog", title: "Wholesale Catalog — 2,200+ SKUs | DMK Mart", description: "Browse the full DMK Mart wholesale catalog by brand, department and price.", keywords: "wholesale catalog, plastic products bulk" },
      { path: "/brands", title: "All Brands | DMK Mart B2B", description: "39 trusted brands — Deep Household, Garden Needs, Goldex, Pariwar and more.", keywords: "brands, wholesale brands" },
      { path: "/account", title: "B2B Account — Login / Register | DMK Mart", description: "Retailer, wholesaler & distributor accounts with tier pricing.", keywords: "b2b login, wholesale account" },
    ],
  });

  // ── People ──
  await db.salesPerson.createMany({
    data: [
      { name: "Sunil Jagtap", mobile: "9850001101" },
      { name: "Kavita More", mobile: "9850001102" },
      { name: "Imran Qureshi", mobile: "9850001103" },
    ],
  });
  await db.deliveryMan.createMany({
    data: [
      { name: "Sanjay Pawar", username: "sanjay.p", phone: "9850002201" },
      { name: "Dipak Shinde", username: "dipak.s", phone: "9850002202" },
      { name: "Rafik Sayyed", username: "rafik.s", phone: "9850002203" },
    ],
  });
  await db.activityLog.createMany({
    data: [
      { action: "SYNC", entity: "ERP", detail: "Initial catalog pull from Neon ERP — 2,272 products, 39 brands" },
      { action: "CREATE", entity: "Offer", detail: "DMK Big Wholesale Days scheduled" },
      { action: "CREATE", entity: "Coupon", detail: "4 coupons published to homepage" },
    ],
  });
  await db.syncEvent.create({
    data: { direction: "PULL_ERP", action: "PRODUCTS", status: "OK", message: "Initial seed pull — 2,272 products, 39 brands", productsSeen: 2272, created: 2272, updated: 0 },
  });

  console.log("✅ Seed complete.");
  const counts = {
    brands: await db.brand.count(), products: await db.product.count(),
    activeProducts: await db.product.count({ where: { active: true } }),
    orders: await db.order.count(), orderItems: await db.orderItem.count(),
    customers: await db.customer.count(), offers: await db.offer.count(),
    coupons: await db.coupon.count(), pages: await db.page.count(),
  };
  console.log(counts);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
