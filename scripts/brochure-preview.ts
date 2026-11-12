/**
 * Local DESIGN PREVIEW for the brochure doc-builder (no DB, no aliases).
 * Pulls real product images from the live public API, builds the PDF with
 * src/lib/brochure-doc.ts, writes download/DMK-Catalog-preview.pdf.
 * Run: npx -y tsx scripts/brochure-preview.ts
 */
import { readFile } from "fs/promises";
import path from "path";
import { mkdir } from "fs/promises";
import QRCode from "qrcode";
import sharp from "sharp";
import { buildDocDefinition, renderPdf, type BrochureCard, type BrochureBrand } from "../src/lib/brochure-doc";

const SITE = "https://b2b-dmk-mart.vercel.app";

async function fetchImage(url: string, fit: "cover" | "inside" = "cover"): Promise<string> {
  try {
    const thumb = url.includes("/upload/") && !url.startsWith("data:")
      ? url.replace("/upload/", "/upload/c_fill,g_center,h_420,q_auto:good,w_420/")
      : url;
    const res = await fetch(thumb, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    const jpg = await sharp(buf).rotate().flatten({ background: "#ffffff" }).resize(420, 420, { fit }).jpeg({ quality: 74 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    return "";
  }
}

async function getHero(): Promise<string> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "images", "hero-banner.jpg"));
    // same crop as brochure.ts getHeroImage: skip the baked-in headline copy
    // on the left ~38%, vertically centered to the 595×318pt band aspect
    const meta = await sharp(raw).metadata();
    const w = meta.width || 1920;
    const h = meta.height || 702;
    const left = Math.round(w * 0.38);
    const cw = w - left;
    const ch = Math.min(h, Math.round((cw * 318) / 595.28));
    const top = Math.max(0, Math.round((h - ch) / 2));
    const jpg = await sharp(raw).extract({ left, top, width: cw, height: ch }).resize(1190).jpeg({ quality: 80 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch { return ""; }
}

async function main() {
  // 1. real products from the live storefront API
  const res = await fetch(`${SITE}/api/products?limit=48&sort=top`, { signal: AbortSignal.timeout(20000) });
  const data = (await res.json()) as { products?: Record<string, string | number | boolean>[] };
  const raw = (data.products || []).slice(0, 45);
  if (!raw.length) throw new Error("no products from API");

  const CATS = [
    ["Cleaning Tools", "Household"],
    ["Kitchen & Dining", "Kitchenware"],
    ["Packaging Supplies", "Packaging"],
    ["Garden Needs", "Garden"],
    ["Storage Baskets", "Household"],
    ["Water Jars", "Household"],
  ];

  // 2. map to cards
  const cards: BrochureCard[] = raw.map((p, i) => {
    const packQty = Number(p.packQty) || 1;
    const perBox = Number(p.piecesPerBox) || 0;
    const unit = String(p.unit || "Pcs");
    const cat = CATS[i % CATS.length];
    return {
      id: String(p.id), sku: String(p.sku), name: String(p.name),
      company: String(p.company || "DMK Mart"),
      dept: cat[1],
      packLabel: packQty > 1 ? `Pack of ${packQty} ${unit}` : perBox > 0 ? `Box of ${perBox} ${unit}` : `1 ${unit}`,
      image: "", // filled below
      price: Number(p.dealerPrice) || 0,
      mrp: Number(p.mrp) || 0,
      stock: i % 7 === 3 ? 0 : 40, low: 10,
      isTop: i % 5 === 0, isHot: i % 4 === 1,
      section: cat[0],
      sectionKey: `sec-${i % CATS.length}`,
    };
  });

  // 3. images (parallel)
  await Promise.all(cards.map(async (c, i) => { c.image = await fetchImage(String(raw[i].image || "")); }));

  // 4. logo + QR + hero
  let logo = "";
  try { logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public", "dmk-logo.png"))).toString("base64")}`; } catch { /* none */ }
  const qr = await QRCode.toDataURL(SITE, { margin: 1, width: 220, color: { dark: "#111111", light: "#FFFFFF" } }).catch(() => "");
  const heroImage = await getHero();

  // 5. brands (fabricated from the live storefront's known brand stores)
  const brandNames = ["Deep Household", "Garden Needs", "Goldex", "Pariwar", "Samarthya", "Mahananda", "Novel", "Cello", "Scotch-Brite"];
  const brands: BrochureBrand[] = [];
  for (const b of brandNames) {
    brands.push({
      name: b,
      url: `${SITE}/brand/${b.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      logo: await fetchImage(`${SITE}/dmk-logo.png`, "inside"),
      skus: 12 + Math.floor(Math.random() * 40),
      tagline: "Everyday essentials",
      isFeatured: Math.random() > 0.6,
    });
  }

  // 6. sections aggregation (same rule as brochure.ts) + group cards by section
  const seen = new Map<string, { name: string; count: number }>();
  for (const c of cards) {
    const cur = seen.get(c.sectionKey);
    if (cur) cur.count += 1; else seen.set(c.sectionKey, { name: c.section, count: 1 });
  }
  const sections = [...seen.values()];
  const keyOrder = new Map(sections.map((s, i) => [cards.find((c) => c.section === s.name)!.sectionKey, i]));
  cards.sort((a, b) => (keyOrder.get(a.sectionKey) ?? 0) - (keyOrder.get(b.sectionKey) ?? 0));

  const now = new Date();
  const monthName = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" }).format(now);

  // 7. build + write
  const doc = buildDocDefinition(cards, sections, {
    firmName: "DMK Mart", firmPhone: "+91 98765 43210",
    logo, qr, heroImage, brands,
    id: "BR-PREVIEW-0001",
    generatedAtIST: "11-11-2026, 18:30 IST",
    validTillIST: "11-12-2026",
    titleScope: "All Companies",
    monthName, tierLabel: "DEALER",
    siteDisplay: "b2b-dmk-mart.vercel.app",
    siteUrl: SITE,
  });
  const buffer: Buffer = await renderPdf(doc);
  await mkdir("download", { recursive: true });
  const out = path.join(process.cwd(), "download", "DMK-Catalog-preview.pdf");
  const { writeFile } = await import("fs/promises");
  await writeFile(out, buffer);
  console.log("written:", out, `${Math.round(buffer.length / 1024)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
