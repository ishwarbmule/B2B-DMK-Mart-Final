/**
 * Brochure / Catalog — DATA LAYER (server-side, Vercel-safe).
 *
 * ZERO runtime file reads: fonts, logo and cover artwork are embedded base64
 * (see scripts/gen-brochure-assets.mjs + brochure-assets.generated.ts) — the
 * serverless 500s all came from file-traced assets going missing on Vercel.
 * sharp loads lazily and is optional — Cloudinary thumbs arrive pre-sized via
 * URL transformations, so images still work without it.
 *
 * Loads live products per filters, prepares images/QR/settings, then hands off
 * to the pure doc builder in brochure-doc.ts (design v2 — brochure standard:
 * full-bleed cover collage, TOC page, section-per-page, big product cards).
 * Every generation carries a unique version ID + timestamp.
 *
 * WAREHOUSE SCOPING (owner requirement): a brochure is always for ONE godown —
 * the warehouseId is mandatory, the product list is the warehouse's stock and
 * every qty line prints that godown's own numbers.
 */
import { createHash } from "crypto";
import QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildDocDefinition, renderPdf, type BrochureCard } from "@/lib/brochure-doc";
import { LOGO_PNG_BASE64, HERO_JPEG_BASE64 } from "@/lib/brochure-assets.generated";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://b2b-dmk-mart.vercel.app";

export interface BrochureFilters {
  warehouseId: string;        // MANDATORY — the godown this brochure is printed for
  companies: string[];        // exact Product.company values (company = THE grouping)
  topId?: string; midId?: string; endId?: string;  // category narrowing (cascade)
  readyOnly?: boolean;        // only in-stock, ready-to-dispatch items
  includeOutOfStock?: boolean; // keep OOS lines but badge them
  showPrices?: boolean;       // false → "Login to view price"
  tier?: string;              // tier1..tier5 | dealer (default dealer)
  maxProducts?: number | "all"; // numeric clamp 10..250; "all" = up to the hard server cap
  productIds?: string[];      // EXPLICIT picked products (ordered) — bypasses every
                              // other filter, INACTIVE products included, up to 600
}

export interface BrochureMeta {
  id: string;
  filename: string;
  count: number;
  companies: string[];
  warehouse?: string;         // godown name the brochure was printed for
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

const IMG_PLACEHOLDER_W = 300; // small thumbs keep the PDF well inside serverless response limits
/** Huge catalogs ("All products" prints) automatically drop to smaller, lighter
 *  thumbs so the generated PDF stays under the Cloudinary share-upload limit. */
const IMG_PLACEHOLDER_W_COMPACT = 210;
const IMG_CACHE = new Map<string, string>(); // url → dataURL (process lifetime)

function cloudinaryThumb(url: string, width = IMG_PLACEHOLDER_W): string | null {
  if (!url || !url.includes("/upload/")) return null;
  if (url.startsWith("data:")) return null;
  return url.replace("/upload/", `/upload/c_fill,g_center,h_${width},q_auto:good,w_${width}/`);
}

async function fetchImage(url: string, fit: "cover" | "inside" = "cover", width = IMG_PLACEHOLDER_W): Promise<string | null> {
  const cacheKey = `${fit}:${width}:${url}`;
  const cached = IMG_CACHE.get(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    // sharp is optional: Cloudinary thumbs are already exactly sized by the URL
    // transformation, so a raw passthrough is a faithful fallback when the
    // native binary is unavailable in the runtime.
    let jpg: Buffer;
    try {
      const sharpMod = (await import("sharp")).default;
      jpg = await sharpMod(buf).rotate()
        .flatten({ background: "#ffffff" })
        .resize(width, width, { fit })
        .jpeg({ quality: 62 }).toBuffer();
    } catch {
      jpg = buf; // raw passthrough — PDFKit renders JPEG/PNG bytes natively
    }
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

/* Logo + cover artwork ship as embedded base64 constants — no fs, no tracing. */
let logoDataUrl: string | null = null;
async function getLogo(): Promise<string> {
  if (logoDataUrl === null) logoDataUrl = LOGO_PNG_BASE64 ? `data:image/png;base64,${LOGO_PNG_BASE64}` : "";
  return logoDataUrl;
}

/** Cover band artwork — pre-cropped at generation time (scripts/gen-brochure-assets.mjs). */
let heroDataUrl: string | null = null;
async function getHeroImage(): Promise<string> {
  if (heroDataUrl === null) heroDataUrl = HERO_JPEG_BASE64 ? `data:image/jpeg;base64,${HERO_JPEG_BASE64}` : "";
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

/** Beyond this many products the PDF skips image downloads (logo placeholder
 *  renders instead) — keeps whole-godown catalogs inside the 60s serverless
 *  budget while still printing EVERY product of the godown. */
const BROCHURE_IMAGE_CAP = 300;

export async function loadBrochureProducts(f: BrochureFilters) {
  const explicit = (f.productIds ?? []).map(String).filter(Boolean);
  // "All" → NO cap: the limit is the godown's own catalog (owner's rule — the
  // old 600 ceiling is gone). numeric → 10..250 for legacy API callers.
  const max = f.maxProducts === "all"
    ? undefined
    : Math.max(10, Math.min(250, Number(f.maxProducts) || 120));
  const take = explicit.length ? explicit.length : max;
  const where: Prisma.ProductWhereInput = {};
  if (!explicit.length) {
    // filter flow — classic behaviour: active products narrowed by company/category
    where.active = true;
    if (f.companies?.length) where.company = { in: f.companies };
    if (f.endId) where.endId = f.endId;
    else if (f.midId) where.midId = f.midId;
    else if (f.topId) where.topId = f.topId;
  }

  // WAREHOUSE SCOPE — the brochure prints ONE godown: only products carried by
  // that warehouse, and every qty shown is THAT godown's own number.
  let whName = "";
  const qtyByProduct = new Map<string, number>();
  if (f.warehouseId) {
    const wh = await db.warehouse.findUnique({ where: { id: f.warehouseId }, select: { name: true, city: true, active: true } });
    if (!wh) throw new Error("That warehouse no longer exists — pick another one.");
    whName = wh.city ? `${wh.name} — ${wh.city}` : wh.name;
    // explicit picks may include INACTIVE products — the warehouse rows decide
    // stock either way; filter-flow keeps hidden products out of the pool
    const stockRows = await db.warehouseStock.findMany({
      where: { warehouseId: f.warehouseId, ...(explicit.length ? {} : { product: { active: true } }) },
      select: { productId: true, qty: true },
    });
    for (const s of stockRows) qtyByProduct.set(s.productId, s.qty);
    if (explicit.length) {
      where.id = { in: explicit };
    } else {
      const ids = [...qtyByProduct.keys()];
      where.id = ids.length ? { in: ids } : { in: [""] }; // empty godown → empty brochure
      if (f.readyOnly) {
        const stocked = [...qtyByProduct.entries()].filter(([, q]) => q > 0).map(([id]) => id);
        where.id = stocked.length ? { in: stocked } : { in: [""] };
      }
    }
  } else if (f.readyOnly) {
    where.stock = { gt: 0 };
  }

  const products = await db.product.findMany({
    where,
    include: { top: { select: { name: true, sortOrder: true } }, mid: { select: { name: true } }, end: { select: { name: true } } },
    orderBy: [{ top: { sortOrder: "asc" } }, { company: "asc" }, { name: "asc" }],
    take,
  });

  const tier = f.tier && ["tier1", "tier2", "tier3", "tier4", "tier5"].includes(f.tier) ? f.tier : "dealer";

  const rows: BrochureProduct[] = products
    .filter((p) => {
      if (explicit.length) return true; // the picker already decided — OOS lines keep their badge
      // warehouse scope → the godown's qty decides in/out of stock
      const qty = f.warehouseId ? (qtyByProduct.get(p.id) ?? 0) : p.stock;
      return f.includeOutOfStock ? true : qty > 0;
    })
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
        stock: f.warehouseId ? (qtyByProduct.get(p.id) ?? 0) : p.stock,
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
  return { rows, sections, companiesUsed, max, whName };
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
  const { rows, sections, companiesUsed, whName } = await loadBrochureProducts(f);
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

  // images (Cloudinary thumbs first, then downloads; failures → logo placeholder).
  // Big "All products" prints automatically switch to smaller, lighter thumbs so
  // the PDF stays inside the share-upload budget — and beyond the image cap the
  // downloads are skipped entirely (placeholder art) so whole-godown catalogs
  // (2,000+ SKUs) still render inside the serverless time budget.
  const skipImages = rows.length > BROCHURE_IMAGE_CAP;
  const thumbW = rows.length > 250 ? IMG_PLACEHOLDER_W_COMPACT : IMG_PLACEHOLDER_W;
  await runPool(rows, 8, async (p) => {
    if (skipImages) { p.image = ""; return; }
    const thumb = cloudinaryThumb(p.image, thumbW);
    p.image = (thumb ? await fetchImage(thumb, "cover", thumbW) : p.image ? await fetchImage(p.image, "cover", thumbW) : null) || "";
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
    warehouseName: whName,
    siteDisplay: SITE_URL.replace(/^https?:\/\//, ""),
    siteUrl: SITE_URL,
  });

  const buffer: Buffer = await renderPdf(docDefinition);
  const meta: BrochureMeta = {
    id,
    filename: `DMK-Catalog-${(companiesUsed[0] || "All").replace(/[^a-z0-9]+/gi, "-")}-${id}.pdf`,
    count: rows.length,
    companies: companiesUsed,
    ...(whName ? { warehouse: whName } : {}),
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
