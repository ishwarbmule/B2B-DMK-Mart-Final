/**
 * Brochure / Catalog PDF builder (server-side, pure JS — Vercel-safe).
 *
 * Generates a professionally-designed A4 catalog from LIVE database data:
 *   cover → table of contents → 2-column product grid → terms + QR footer.
 * Every generation carries a unique version ID + timestamp, so old price lists
 * can never be confused with fresh ones.
 *
 * Engine: pdfmake (fonts embedded, no headless browser). Images are pulled from
 * Cloudinary with URL-based resizing (fast, no download of originals); anything
 * not on Cloudinary is downloaded + resized with sharp. Missing images fall back
 * to the DMK Mart logo placeholder.
 */
import { readFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import pdfmake from "pdfmake";
import Roboto from "pdfmake/fonts/Roboto";
import QRCode from "qrcode";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

pdfmake.addFonts(Roboto);
pdfmake.setUrlAccessPolicy(() => true); // only Cloudinary fetches, from the API route
pdfmake.setLocalAccessPolicy(() => true);

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

const YELLOW = "#facc15";
const INK = "#111111";
const GRAY = "#6b7280";

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

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const clean = (s: string | null | undefined, max = 90) =>
  (s || "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, max);

/* ── images ── */

const IMG_PLACEHOLDER_W = 360;
const IMG_CACHE = new Map<string, string>(); // url → dataURL (process lifetime)

function cloudinaryThumb(url: string): string | null {
  if (!url || !url.includes("/upload/")) return null;
  if (url.startsWith("data:")) return null;
  return url.replace("/upload/", `/upload/c_fill,g_center,h_${IMG_PLACEHOLDER_W},q_auto:good,w_${IMG_PLACEHOLDER_W}/`);
}

async function fetchImage(url: string): Promise<string | null> {
  const cached = IMG_CACHE.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    const jpg = await sharp(buf).rotate().resize(IMG_PLACEHOLDER_W, IMG_PLACEHOLDER_W, { fit: "cover" }).jpeg({ quality: 72 }).toBuffer();
    const dataUrl = `data:image/jpeg;base64,${jpg.toString("base64")}`;
    if (IMG_CACHE.size > 600) IMG_CACHE.clear();
    IMG_CACHE.set(url, dataUrl);
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

/* ── data ── */

interface BrochureProduct {
  id: string; sku: string; name: string; company: string;
  description: string; packLabel: string; image: string;
  price: number | null; mrp: number; stock: number; low: number;
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
        description: clean(p.description, 95),
        packLabel: pack,
        image: p.image,
        price: f.showPrices ? price : null,
        mrp: p.mrp,
        stock: p.stock,
        low: p.lowStockThreshold,
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

/* ── document ── */

function footerFn(brochureId: string, firmName: string) {
  return (currentPage: number, pageCount: number) => ({
    margin: [28, 6, 28, 0],
    stack: [
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 0.7, lineColor: "#d1d5db" }] },
      {
        columns: [
          { text: `${firmName} · Catalog ${brochureId}`, fontSize: 6.5, color: GRAY, alignment: "left" },
          { text: `Page ${currentPage} of ${pageCount}`, fontSize: 6.5, color: GRAY, alignment: "right" },
        ],
        margin: [0, 2, 0, 0],
      },
    ],
  });
}

function productCell(p: BrochureProduct, logo: string): unknown {
  const stockState = p.stock > p.low
    ? { text: "● IN STOCK", color: "#16a34a" }
    : p.stock > 0
      ? { text: `● LOW STOCK (${Math.floor(p.stock)})`, color: "#d97706" }
      : { text: "● OUT OF STOCK", color: "#dc2626" };

  const priceLine: unknown[] = p.price != null
    ? [
        { text: inr(p.price), fontSize: 11, bold: true, color: INK },
        ...(p.mrp > p.price ? [{ text: `  MRP ${inr(p.mrp)}`, fontSize: 7, color: GRAY, decoration: "lineThrough" }] : []),
        { text: `  / ${p.packLabel.replace(/^Pack of /i, "")}`, fontSize: 7, color: GRAY },
      ]
    : [{ text: "Login to view price", fontSize: 9, bold: true, color: GRAY, italics: true }];

  return {
    stack: [
      p.image
        ? { image: p.image, fit: [126, 108], alignment: "center", margin: [0, 0, 0, 4] }
        : logo
          ? { image: logo, fit: [70, 70], alignment: "center", opacity: 0.55, margin: [26, 16, 26, 22] }
          : { text: " ", margin: [0, 40] },
      { text: p.name, fontSize: 8.6, bold: true, color: INK, alignment: "center", margin: [0, 0, 0, 1.5] },
      { text: `SKU ${p.sku} · ${p.company}`, fontSize: 6.8, color: GRAY, alignment: "center", margin: [0, 0, 0, 1.5] },
      ...(p.description ? [{ text: p.description, fontSize: 7, color: GRAY, alignment: "center", margin: [0, 0, 0, 1.5] }] : []),
      { text: p.packLabel, fontSize: 7, color: GRAY, alignment: "center", margin: [0, 0, 0, 2.5] },
      { columns: priceLine, alignment: "center" },
      { text: stockState.text, fontSize: 7, bold: true, color: stockState.color, alignment: "center", margin: [0, 1.5, 0, 0] },
    ],
    margin: [8, 8, 8, 10],
    alignment: "center",
  };
}

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
  const qr = await QRCode.toDataURL(qrTarget, { margin: 1, width: 220, color: { dark: INK, light: "#FFFFFF" } }).catch(() => "");

  const titleScope = companiesUsed.length === 1
    ? companiesUsed[0]
    : companiesUsed.length <= 3
      ? companiesUsed.join(" · ")
      : `All Companies (${companiesUsed.length})`;

  const monthName = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" }).format(new Date());

  const content: unknown[] = [];

  /* cover */
  content.push(
    { canvas: [{ type: "rect", x: -28, y: -32, w: 595, h: 8, color: YELLOW }] },
    { canvas: [{ type: "rect", x: -28, y: -24, w: 595, h: 3, color: INK }] },
    { text: " ", margin: [0, 26] },
    ...(logo ? [{ image: logo, width: 88, alignment: "center", margin: [0, 0, 0, 10] }] : []),
    { text: firmName.toUpperCase(), fontSize: 26, bold: true, alignment: "center", color: INK, margin: [0, 0, 0, 2] },
    { text: "WHOLESALE · B2B PRODUCT CATALOG", fontSize: 10, bold: true, alignment: "center", color: GRAY, characterSpacing: 2, margin: [0, 0, 0, 18] },
    { canvas: [{ type: "line", x1: 150, y1: 0, x2: 389, y2: 0, lineWidth: 1.4, lineColor: YELLOW }] },
    { text: `Official Product Catalog — ${titleScope}`, fontSize: 16, bold: true, alignment: "center", color: INK, margin: [0, 14, 0, 2] },
    { text: monthName, fontSize: 12, bold: true, alignment: "center", color: GRAY, margin: [0, 0, 0, 22] },
    {
      columns: [
        { stack: [{ text: "PRODUCTS", fontSize: 7, bold: true, color: GRAY, characterSpacing: 1.5, alignment: "center" }, { text: String(rows.length), fontSize: 20, bold: true, alignment: "center", color: INK }] },
        { stack: [{ text: "COMPANIES", fontSize: 7, bold: true, color: GRAY, characterSpacing: 1.5, alignment: "center" }, { text: String(companiesUsed.length), fontSize: 20, bold: true, alignment: "center", color: INK }] },
        { stack: [{ text: "SECTIONS", fontSize: 7, bold: true, color: GRAY, characterSpacing: 1.5, alignment: "center" }, { text: String(sections.length), fontSize: 20, bold: true, alignment: "center", color: INK }] },
        { stack: [{ text: "STOCK DATA", fontSize: 7, bold: true, color: GRAY, characterSpacing: 1.5, alignment: "center" }, { text: f.readyOnly ? "READY" : "LIVE", fontSize: 20, bold: true, alignment: "center", color: INK }] },
      ],
      margin: [30, 6, 30, 26],
    },
    { text: `Version ${id}  ·  Generated ${generatedAtIST}`, fontSize: 8.5, color: GRAY, alignment: "center", margin: [0, 0, 0, 3] },
    { text: `Prices valid till ${validTillIST}  ·  Live data from DMK Mart inventory`, fontSize: 8.5, color: GRAY, alignment: "center", margin: [0, 0, 0, 30] },
    {
      table: {
        widths: ["*"],
        body: [[{
          stack: [
            { text: "ORDER ON", fontSize: 7, bold: true, color: GRAY, characterSpacing: 1.5, margin: [0, 4, 0, 3] },
            { text: [`www ${SITE_URL.replace(/^https?:\/\//, "")}`, firmPhone ? `call / WhatsApp ${firmPhone}` : "", "orders open 7 days"].filter(Boolean).join("   ·   "), fontSize: 9.5, bold: true, color: INK, margin: [0, 0, 0, 4] },
          ],
        }]],
      },
      layout: { hLineColor: () => "#e5e7eb", vLineColor: () => "#e5e7eb", paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 6, paddingBottom: () => 6 },
      margin: [40, 0, 40, 0],
    },
    { text: " ", margin: [0, 28] },
    { text: "Prices are exclusive of GST unless stated. Tier pricing applies to approved B2B accounts. This document was generated in realtime from live stock and pricing data.", fontSize: 7.5, color: GRAY, alignment: "center", margin: [40, 0, 40, 0], pageBreak: "after" },
  );

  /* table of contents */
  content.push(
    { text: "TABLE OF CONTENTS", fontSize: 15, bold: true, color: INK, characterSpacing: 1.5, margin: [0, 0, 0, 3] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 1.2, lineColor: YELLOW }], margin: [0, 0, 0, 12] },
    ...sections.map((s, i) => ({
      columns: [
        { text: `${String(i + 1).padStart(2, "0")}`, fontSize: 9, bold: true, color: GRAY, width: 30 },
        { text: s.name, fontSize: 10.5, bold: true, color: INK },
        { text: `${s.count} product${s.count > 1 ? "s" : ""}`, fontSize: 8.5, color: GRAY, alignment: "right" },
      ],
      margin: [0, 4, 0, 4],
    })),
    {
      text: `Every product below shows its current stock position and ${f.showPrices ? `the ${f.tier && f.tier !== "dealer" ? f.tier.toUpperCase() : "dealer"} price` : "login-gated pricing"} as of ${generatedAtIST}.`,
      fontSize: 8, color: GRAY, italics: true, margin: [0, 14, 0, 0], pageBreak: "after",
    },
  );

  /* product grid — 2 columns */
  for (let i = 0; i < rows.length; i += 2) {
    const pair = [productCell(rows[i], logo), rows[i + 1] ? productCell(rows[i + 1], logo) : { text: "" }];
    const sectionBreak = i === 0 || rows[i].sectionKey !== rows[i - 1]?.sectionKey;
    const sectionHeader = sectionBreak
      ? [{ columns: [
          { text: rows[i].section.toUpperCase(), fontSize: 10, bold: true, color: INK, characterSpacing: 1.2 },
          { text: `${sections.find((s) => s.name === rows[i].section)?.count ?? ""}`, fontSize: 8, color: GRAY, alignment: "right" },
        ], margin: [0, i === 0 ? 0 : 10, 0, 4] },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 0.9, lineColor: YELLOW }], margin: [0, 0, 0, 6] }]
      : [];
    content.push(...sectionHeader, {
      table: { widths: ["50%", "50%"], body: [pair] },
      layout: {
        hLineColor: () => "#f1f1f4", vLineColor: () => "#f1f1f4",
        paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2,
      },
      pageBreak: "auto",
    });
  }

  /* terms + QR closing block */
  content.push(
    { text: " ", margin: [0, 16], pageBreak: "before" },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 1, lineColor: INK }], margin: [0, 0, 0, 8] },
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: "TERMS & CONDITIONS", fontSize: 9, bold: true, color: INK, margin: [0, 0, 0, 4] },
            { text: `1. Prices listed are ${f.tier && f.tier !== "dealer" ? f.tier.toUpperCase() + " tier" : "dealer"} rates, exclusive of GST, and valid till ${validTillIST}.`, fontSize: 7.6, color: GRAY, margin: [0, 0, 0, 1.5] },
            { text: "2. Stock shown is live at generation time and is reserved only on confirmed orders.", fontSize: 7.6, color: GRAY, margin: [0, 0, 0, 1.5] },
            { text: "3. Minimum wholesale quantities apply on marked pack sizes. Damaged-goods claims within 48 hours of delivery.", fontSize: 7.6, color: GRAY, margin: [0, 0, 0, 1.5] },
            { text: "4. Catalog version " + id + " supersedes all earlier price lists and printouts.", fontSize: 7.6, color: GRAY },
          ],
        },
        ...(qr ? [{ width: 84, stack: [{ image: qr, width: 78, alignment: "right" }, { text: "SCAN → ORDER ONLINE", fontSize: 6.3, bold: true, color: INK, alignment: "center", margin: [0, 2, 0, 0] }] }] : []),
      ],
    },
    { text: `${firmName}${firmPhone ? ` · ${firmPhone}` : ""} · ${SITE_URL.replace(/^https?:\/\//, "")}`, fontSize: 8, bold: true, color: INK, alignment: "center", margin: [0, 10, 0, 0] },
  );

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [28, 32, 28, 40] as [number, number, number, number],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#1f2937" },
    header: (currentPage: number) => currentPage === 1 ? null : ({
      margin: [28, 10, 28, 0],
      columns: [
        { text: `${firmName} — Product Catalog`, fontSize: 7.5, bold: true, color: INK },
        { text: titleScope.slice(0, 48), fontSize: 7.5, color: GRAY, alignment: "right" },
      ],
    }),
    footer: footerFn(id, firmName),
    info: { title: `${firmName} Catalog ${id}`, author: firmName, subject: `Official product catalog ${monthName}` },
    content,
  };

  const buffer: Buffer = await pdfmake.createPdf(docDefinition).getBuffer();
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
