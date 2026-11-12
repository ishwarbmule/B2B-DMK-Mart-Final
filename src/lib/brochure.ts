/**
 * Brochure / Catalog — DATA LAYER (server-side, Vercel-safe).
 *
 * Loads live products per filters, prepares images/QR/settings, then hands off
 * to the pure doc builder in brochure-doc.ts (design v2 — brochure standard:
 * full-bleed cover collage, TOC page, section-per-page, big product cards).
 * Every generation carries a unique version ID + timestamp.
 */
import { readFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import QRCode from "qrcode";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildDocDefinition, renderPdf, type BrochureCard } from "@/lib/brochure-doc";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://b2b-dmk-mart.vercel.app";

export interface BrochureFilters {
  companies: string[];        // exact Product.company values (company = THE grouping)
  topId?: string; midId?: string; endId?: string;  // category narrowing (cascade)
  readyOnly?: boolean;        // only in-stock, ready-to-dispatch items
  includeOutOfStock?: boolean; // keep OOS lines but badge them
  showPrices?: boolean;       // false → "Login to view price"
  tier?: string;              // tier1..tier5 | dealer (default dealer)
  maxProducts?: number;       // clamp 10..400
}

export interface BrochureMeta {
  id: string;
  filename: string;
  count: number;
  companies: string[];
  sections: { name: string; count: number }[];
  generatedAtIST: string;
  validTillIST: string;
  shareUrl?: string;
}

/* ── ids / formatting ── */

const istParts = (d = new Date()) => {
  const fmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
  return p;
};

function makeId(): string {
  const p = istParts();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BR-${p.year}${p.month}${p.day}-${p.hour}${p.minute}-${rand}`;
}

/* ── images ── */

const IMG_PLACEHOLDER_W = 420;
const IMG_CACHE = new Map<string, string>(); // url → dataURL (process lifetime)

function cloudinaryThumb(url: string): string | null {
  if (!url || !url.includes("/upload/")) return null;
  if (url.startsWith("data:")) return null;
  return url.replace("/upload/", `/upload/c_fill,g_center,h_${IMG_PLACEHOLDER_W},q_auto:good,w_${IMG_PLACEHOLDER_W}/`);
}

async function fetchImage(url: string, fit: "cover" | "inside" = "cover"): Promise<string | null> {
  const cacheKey = `${fit}:${url}`;
  const cached = IMG_CACHE.get(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    // "inside" keeps brand logos uncropped on white; "cover" squares product shots
    const jpg = await sharp(buf).rotate()
      .flatten({ background: "#ffffff" })
      .resize(IMG_PLACEHOLDER_W, IMG_PLACEHOLDER_W, { fit })
      .jpeg({ quality: 74 }).toBuffer();
    const dataUrl = `data:image/jpeg;base64,${jpg.toString("base64")}`;
    if (IMG_CACHE.size > 600) IMG_CACHE.clear();
    IMG_CACHE.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  });
  await Promise.all(workers);
}

let logoDataUrl: string | null = null;
async function getLogo(): Promise<string> {
  if (logoDataUrl) return logoDataUrl;
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "dmk-logo.png"));
    logoDataUrl = `data:image/png;base64,${raw.toString("base64")}`;
  } catch {
    logoDataUrl = "";
  }
  return logoDataUrl;
}

/** Homepage hero artwork (cover band) — crop the product-arrangement side of
 *  public/images/hero-banner.jpg (left ~38% is the baked-in headline copy),
 *  vertically centered to the exact aspect of the 595×318pt cover band. */
let heroDataUrl: string | null = null;
async function getHeroImage(): Promise<string> {
  if (heroDataUrl !== null) return heroDataUrl;
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "images", "hero-banner.jpg"));
    const meta = await sharp(raw).metadata();
    const w = meta.width || 1920;
    const h = meta.height || 702;
    const left = Math.round(w * 0.38);
    const cw = w - left;
    const ch = Math.min(h, Math.round((cw * 318) / 595.28));
    const top = Math.max(0, Math.round((h - ch) / 2));
    const jpg = await sharp(raw).extract({ left, top, width: cw, height: ch }).resize(1190).jpeg({ quality: 80 }).toBuffer();
    heroDataUrl = `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    heroDataUrl = "";
  }
  return heroDataUrl;
}

/* ── data ── */

interface BrochureProduct {
  id: string; sku: string; name: string; company: string; dept: string;
  packLabel: string; image: string;
  price: number | null; mrp: number; stock: number; low: number;
  isTop: boolean; isHot: boolean;
  section: string; sectionKey: string;
}

export async function loadBrochureProducts(f: BrochureFilters) {
  const max = Math.max(10, Math.min(400, Number(f.maxProducts) || 200));
  const where: Prisma.ProductWhereInput = { active: true };
  if (f.companies?.length) where.company = { in: f.companies };
  if (f.endId) where.endId = f.endId;
  else if (f.midId) where.midId = f.midId;
  else if (f.topId) where.topId = f.topId;
  if (f.readyOnly) where.stock = { gt: 0 };

  const products = await db.product.findMany({
    where,
    include: { top: { select: { name: true, sortOrder: true } }, mid: { select: { name: true } }, end: { select: { name: true } } },
    orderBy: [{ top: { sortOrder: "asc" } }, { company: "asc" }, { name: "asc" }],
    take: max,
  });

  const tier = f.tier && ["tier1", "tier2", "tier3", "tier4", "tier5"].includes(f.tier) ? f.tier : "dealer";

  const rows: BrochureProduct[] = products
    .filter((p) => (f.includeOutOfStock ? true : p.stock > 0))
    .map((p) => {
      const price = tier === "dealer" ? p.dealerPrice : (p as unknown as Record<string, number>)[tier] ?? p.dealerPrice;
      const section = p.end?.name || p.mid?.name || p.top?.name || "General";
      const pack = p.packQty > 1 ? `Pack of ${p.packQty} ${p.unit || "Pcs"}` : p.piecesPerBox > 0 ? `Box of ${p.piecesPerBox} ${p.unit || "Pcs"}` : `1 ${p.unit || "Pcs"}`;
      return {
        id: p.id, sku: p.sku, name: p.name, company: p.company || "DMK Mart",
        dept: p.top?.name || "",
        packLabel: pack,
        image: p.image,
        price: f.showPrices ? price : null,
        mrp: p.mrp,
        stock: p.stock,
        low: p.lowStockThreshold,
        isTop: p.isTop,
        isHot: p.isHot,
        section,
        sectionKey: p.endId || p.midId || p.topId || "gen",
      };
    });

  const sections: { name: string; count: number }[] = [];
  const seen = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    const cur = seen.get(r.sectionKey);
    if (cur) cur.count += 1;
    else seen.set(r.sectionKey, { name: r.section, count: 1 });
  }
  for (const v of seen.values()) sections.push(v);

  const companiesUsed = Array.from(new Set(rows.map((r) => r.company)));
  return { rows, sections, companiesUsed, max };
}

/* ── brands (brand page: logo + clickable storefront name) ── */

export interface BrochureBrandRow {
  name: string; url: string; logo: string; skus: number; tagline: string; isFeatured: boolean;
}

async function loadBrochureBrands(): Promise<BrochureBrandRow[]> {
  const raw = await db.brand.findMany({
    where: { active: true },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { name: true, slug: true, logo: true, tagline: true, isFeatured: true, _count: { select: { products: { where: { active: true } } } } },
  }).catch(() => [] as { name: string; slug: string; logo: string; tagline: string; isFeatured: boolean; _count: { products: number } }[]);

  const rows: BrochureBrandRow[] = raw.slice(0, 60).map((b) => ({
    name: b.name,
    url: `${SITE_URL}/brand/${b.slug}`,
    logo: b.logo,
    skus: b._count?.products ?? 0,
    tagline: b.tagline || "",
    isFeatured: b.isFeatured,
  }));

  // logos → white-background contain thumbs (uncropped, like the /brands page)
  await runPool(rows, 6, async (b) => {
    b.logo = b.logo ? (await fetchImage(b.logo, "inside")) || "" : "";
  });
  return rows;
}

/* ── generation ── */

export async function generateBrochure(f: BrochureFilters): Promise<{ buffer: Buffer; meta: BrochureMeta }> {
  const { rows, sections, companiesUsed } = await loadBrochureProducts(f);
  if (!rows.length) throw new Error("No products match these filters — nothing to put in the brochure.");

  const settings = await db.setting.findMany({
    where: { key: { in: ["firm_name", "firm_phone", "site_title", "site_tagline"] } },
  }).catch(() => [] as { key: string; value: string }[]);
  const S: Record<string, string> = {};
  for (const s of settings) S[s.key] = s.value;
  const firmName = S.firm_name || "DMK Mart";
  const firmPhone = S.firm_phone || "";

  const logo = await getLogo();
  const heroImage = await getHeroImage();
  const brands = await loadBrochureBrands();
  const id = makeId();
  const nowP = istParts();
  const generatedAtIST = `${nowP.day}-${nowP.month}-${nowP.year}, ${nowP.hour}:${nowP.minute} IST`;
  const valid = new Date(Date.now() + 30 * 86400_000);
  const validP = istParts(valid);
  const validTillIST = `${validP.day}-${validP.month}-${validP.year}`;

  // images (Cloudinary thumbs first, then downloads; failures → logo placeholder)
  await runPool(rows, 8, async (p) => {
    const thumb = cloudinaryThumb(p.image);
    p.image = (thumb ? await fetchImage(thumb) : p.image ? await fetchImage(p.image) : null) || "";
  });

  // QR → the storefront ordering page
  const qrTarget = companiesUsed.length === 1 ? `${SITE_URL}/?company=${encodeURIComponent(companiesUsed[0])}` : SITE_URL;
  const qr = await QRCode.toDataURL(qrTarget, { margin: 1, width: 220, color: { dark: "#111111", light: "#FFFFFF" } }).catch(() => "");

  const titleScope = companiesUsed.length === 1
    ? companiesUsed[0]
    : companiesUsed.length <= 3
      ? companiesUsed.join(" · ")
      : `All Companies (${companiesUsed.length})`;

  const monthName = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" }).format(new Date());
  const tierLabel = f.tier && f.tier !== "dealer" ? f.tier.toUpperCase() : "DEALER";

  const cards: BrochureCard[] = rows.map((r) => ({
    id: r.id, sku: r.sku, name: r.name, company: r.company,
    dept: r.dept,
    packLabel: r.packLabel, image: r.image,
    price: r.price, mrp: r.mrp, stock: r.stock, low: r.low,
    isTop: r.isTop, isHot: r.isHot,
    section: r.section, sectionKey: r.sectionKey,
  }));

  const docDefinition = buildDocDefinition(cards, sections, {
    firmName, firmPhone, logo, qr, heroImage, brands,
    id, generatedAtIST, validTillIST,
    titleScope, monthName, tierLabel,
    siteDisplay: SITE_URL.replace(/^https?:\/\//, ""),
    siteUrl: SITE_URL,
  });

  const buffer: Buffer = await renderPdf(docDefinition);
  const meta: BrochureMeta = {
    id,
    filename: `DMK-Catalog-${(companiesUsed[0] || "All").replace(/[^a-z0-9]+/gi, "-")}-${id}.pdf`,
    count: rows.length,
    companies: companiesUsed,
    sections,
    generatedAtIST,
    validTillIST,
  };
  return { buffer, meta };
}

/* ── Cloudinary raw upload (shareable WhatsApp link) ── */

export async function uploadBrochureShare(buffer: Buffer, filename: string): Promise<string | null> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME || "";
  const key = process.env.CLOUDINARY_API_KEY || "";
  const secret = process.env.CLOUDINARY_API_SECRET || "";
  if (!cloud || !key || !secret) return null;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "dmk-mart/brochures";
    const signature = createHash("sha1").update(`folder=${folder}&public_id=${filename.replace(/\.pdf$/, "")}&timestamp=${timestamp}${secret}`).digest("hex");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), filename);
    form.append("api_key", key);
    form.append("timestamp", String(timestamp));
    form.append("folder", folder);
    form.append("public_id", filename.replace(/\.pdf$/, ""));
    form.append("signature", signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/raw/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(45000) });
    const data = (await res.json()) as { secure_url?: string };
    return data.secure_url || null;
  } catch {
    return null;
  }
}
