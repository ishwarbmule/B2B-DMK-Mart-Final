import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/products/import — SKU-based inventory upsert.
 *
 * Re-upload flow (company-based Excel): a row whose SKU already exists in the
 * inventory UPDATES that product with the sheet's values; a row with a NEW SKU
 * is ADDED as a new product. Nothing is ever duplicated by re-uploading.
 *
 * Safety rule: an EMPTY cell never clears a field — only filled cells update.
 * (Protects partially-edited sheets from wiping names, prices and stock.)
 *
 * Accepted payloads:
 *  - multipart/form-data  file=<.xlsx|.csv>            (admin UI upload)
 *  - JSON { rows: [...], start?: 0 }                    (API / migration script; chunked)
 *  - JSON { csv: "..." , start?: 0 }                    (legacy pasted-CSV flow)
 *
 * Column headers (case/space-insensitive, same as the company-based export):
 *   SKU, Product Name, Image URL, Company, Top Level Category, End Level Category,
 *   Unit, HSN, GST %, Delivery Rate, Cost Price, Pack Qty, Tier 1 Distributor,
 *   Tier 2 Wholesale, Tier 3 Semi-Wholesale, Tier 4 Retailer, Tier 5 MRP,
 *   Sellable Stock, Damaged Stock, Reserved, Low Stock Threshold, Status, Barcode,
 *   Weight (g), Pieces/Box, Created On
 *
 * Response: { ok, processed, nextStart, done, updated, created, skipped, errors[], unmatchedCategories[] }
 */

const CHUNK = 400;

const normKey = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");

// canonical field -> accepted header keys (normalized)
const HEADER_MAP: Record<string, string[]> = {
  sku: ["sku", "skuno", "itemcode"],
  name: ["productname", "name", "itemname"],
  image: ["imageurl", "image", "photo", "photourl"],
  company: ["company", "companyname", "brand"], // brand header tolerated → treated as company
  topCategory: ["toplevelcategory", "topcategory", "department"],
  endCategory: ["endlevelcategory", "endcategory", "subcategory"],
  unit: ["unit"],
  hsn: ["hsn", "hsncode"],
  gst: ["gst", "gstpercent", "gstrate"],
  deliveryRate: ["deliveryrate"],
  purchaseCost: ["costprice", "cost", "purchasecost"],
  packQty: ["packqty", "packsize"],
  tier1: ["tier1distributor", "tier1"],
  tier2: ["tier2wholesale", "tier2"],
  tier3: ["tier3semiwholesale", "tier3"],
  tier4: ["tier4retailer", "tier4"],
  tier5: ["tier5mrp", "tier5", "mrp"],
  stock: ["sellablestock", "stock", "stockqty"],
  damagedStock: ["damagedstock", "damaged"],
  reservedQty: ["reserved", "reservedqty"],
  lowStockThreshold: ["lowstockthreshold", "lowstock"],
  status: ["status"],
  barcode: ["barcode"],
  weightGrams: ["weightg", "weight", "weightgrams"],
  piecesPerBox: ["piecesbox", "piecesperbox"],
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const strv = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const normCat = (s: string) => s.normalize("NFKD").replace(/\s+/g, " ").trim().toLowerCase();
const slugify = (s: string) => s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "item";

type SheetRow = Record<string, unknown>;

// reverse lookup: normalized header key → canonical field
const HEADER_LOOKUP: Record<string, string> = {};
for (const [canonical, aliases] of Object.entries(HEADER_MAP)) {
  HEADER_LOOKUP[normKey(canonical)] = canonical;
  for (const a of aliases) HEADER_LOOKUP[normKey(a)] = canonical;
}

function sheetToRows(sheet: Record<string, unknown>[]): SheetRow[] {
  return sheet.map((raw) => {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      const canonical = HEADER_LOOKUP[normKey(k)];
      if (canonical && row[canonical] === undefined) row[canonical] = v;
    }
    return row;
  });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    let allRows: SheetRow[] = [];
    let start = 0;

    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonError("No file uploaded");
      const buf = Buffer.from(await file.arrayBuffer());
      if (/\.(csv|txt)$/i.test(file.name)) {
        const wb = XLSX.read(buf, { type: "buffer" });
        allRows = sheetToRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false }));
      } else {
        const wb = XLSX.read(buf, { type: "buffer" });
        allRows = sheetToRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false }));
      }
    } else {
      const body = (await req.json()) as { rows?: SheetRow[]; csv?: string; start?: number };
      start = Math.max(0, Number(body.start) || 0);
      if (Array.isArray(body.rows) && body.rows.length) {
        allRows = sheetToRows(body.rows);
      } else if (body.csv && body.csv.trim()) {
        const wb = XLSX.read(body.csv, { type: "string", raw: false });
        allRows = sheetToRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false }));
      }
    }

    if (!allRows.length) return jsonError("No data rows found — expected the company-based product sheet");

    // category caches (match-only; unknown names are reported, never invented)
    const [tops, mids, ends] = await Promise.all([
      db.topCategory.findMany({ select: { id: true, name: true } }),
      db.midCategory.findMany({ select: { id: true, name: true, topId: true } }),
      db.endCategory.findMany({ select: { id: true, name: true, midId: true } }),
    ]);
    const unmatchedCategories = new Set<string>();

    const resolveCats = (topText: string, endText: string): { topId?: string; midId?: string; endId?: string } => {
      const out: { topId?: string; midId?: string; endId?: string } = {};
      const t = normCat(topText || "");
      if (t) {
        const top = tops.find((x) => normCat(x.name) === t);
        if (top) out.topId = top.id; else unmatchedCategories.add(topText);
      }
      const e = normCat(endText || "");
      if (e) {
        const end = ends.find((x) => normCat(x.name) === e);
        if (end) {
          out.endId = end.id;
          const mid = mids.find((m) => m.id === end.midId);
          if (mid) { out.midId = mid.id; if (!out.topId) out.topId = mid.topId; }
        } else unmatchedCategories.add(endText);
      }
      return out;
    };

    const chunk = allRows.slice(start, start + CHUNK);
    let updated = 0, created = 0, skipped = 0;
    const errors: string[] = [];

    for (const row of chunk) {
      const sku = strv(row.sku);
      const name = strv(row.name);
      if (!sku) { skipped++; continue; }

      try {
        const existing = await db.product.findUnique({ where: { sku } });

        if (existing) {
          // ── UPDATE by SKU — only filled cells change anything ──
          const data: Record<string, unknown> = {};
          if (name) data.name = name;
          const image = strv(row.image);
          if (image) {
            data.image = image;
            if (image.startsWith("http")) data.gallery = JSON.stringify([image]);
          }
          const company = strv(row.company);
          if (company) data.company = company.slice(0, 190);
          const cats = resolveCats(strv(row.topCategory), strv(row.endCategory));
          if (cats.topId) data.topId = cats.topId;
          if (cats.midId) data.midId = cats.midId;
          if (cats.endId) data.endId = cats.endId;
          const unit = strv(row.unit); if (unit) data.unit = unit;
          const hsn = strv(row.hsn); if (hsn) data.hsn = hsn;
          const gst = num(row.gst); if (gst !== null) data.gst = gst;
          const deliveryRate = num(row.deliveryRate); if (deliveryRate !== null) data.deliveryRate = deliveryRate;
          const cost = num(row.purchaseCost); if (cost !== null) data.purchaseCost = cost;
          const packQty = num(row.packQty); if (packQty !== null && packQty >= 1) data.packQty = Math.round(packQty);
          const tier1 = num(row.tier1); if (tier1 !== null) data.tier1 = tier1;
          const tier2 = num(row.tier2); if (tier2 !== null) data.tier2 = tier2;
          const tier3 = num(row.tier3); if (tier3 !== null) data.tier3 = tier3;
          const tier4 = num(row.tier4); if (tier4 !== null) { data.tier4 = tier4; data.dealerPrice = tier4 > 0 ? tier4 : existing.dealerPrice; }
          const tier5 = num(row.tier5); if (tier5 !== null) { data.tier5 = tier5; data.mrp = tier5 > 0 ? tier5 : existing.mrp; }
          const stock = num(row.stock); if (stock !== null) data.stock = stock;
          const damaged = num(row.damagedStock); if (damaged !== null) data.damagedStock = damaged;
          const reserved = num(row.reservedQty); if (reserved !== null) data.reservedQty = reserved;
          const low = num(row.lowStockThreshold); if (low !== null) data.lowStockThreshold = Math.round(low);
          const status = strv(row.status).toUpperCase();
          if (status === "ACTIVE" || status === "INACTIVE") { data.active = status === "ACTIVE"; data.activeSource = "ADMIN"; }
          const barcode = strv(row.barcode); if (barcode) data.barcode = barcode;
          const weight = num(row.weightGrams); if (weight !== null) data.weightGrams = weight;
          const ppb = num(row.piecesPerBox); if (ppb !== null && ppb >= 1) data.piecesPerBox = Math.round(ppb);

          if (Object.keys(data).length) {
            await db.product.update({ where: { id: existing.id }, data });
            updated++;
          } else skipped++;
        } else {
          // ── NEW SKU → create the product ──
          if (!name) { errors.push(`${sku}: new product row has no Product Name`); continue; }
          const cats = resolveCats(strv(row.topCategory), strv(row.endCategory));
          const company = (strv(row.company) || "DMK Mart").slice(0, 190);
          const topId = cats.topId ?? tops.find((t) => t.name === "General")?.id ?? tops[0]?.id;
          const midId = cats.midId ?? mids.find((m) => m.name === "General")?.id ?? mids.find((m) => m.topId === topId)?.id ?? mids[0]?.id;
          const endId = cats.endId ?? ends.find((e2) => e2.name === "General")?.id ?? ends.find((e2) => e2.midId === midId)?.id ?? ends[0]?.id;
          if (!topId || !midId || !endId) { errors.push(`${sku}: category tree is empty`); continue; }
          const tier4 = num(row.tier4) ?? 0;
          const tier5 = num(row.tier5) ?? 0;
          const status = strv(row.status).toUpperCase();
          let slug = slugify(`${company}-${name}`);
          if (await db.product.findUnique({ where: { slug } })) slug = `${slug}-${sku.slice(-6).toLowerCase()}`;
          const image = strv(row.image);
          await db.product.create({
            data: {
              sku,
              slug,
              name,
              company,
              topId, midId, endId,
              unit: strv(row.unit) || "Pcs",
              hsn: strv(row.hsn),
              gst: num(row.gst) ?? 18,
              deliveryRate: num(row.deliveryRate) ?? 0,
              purchaseCost: num(row.purchaseCost) ?? 0,
              packQty: Math.max(1, Math.round(num(row.packQty) ?? 1)),
              tier1: num(row.tier1) ?? 0,
              tier2: num(row.tier2) ?? 0,
              tier3: num(row.tier3) ?? 0,
              tier4,
              tier5,
              dealerPrice: tier4 > 0 ? tier4 : tier5,
              basePrice: num(row.tier3) ?? tier4,
              mrp: tier5 > 0 ? tier5 : tier4,
              stock: num(row.stock) ?? 0,
              damagedStock: num(row.damagedStock) ?? 0,
              reservedQty: num(row.reservedQty) ?? 0,
              lowStockThreshold: Math.round(num(row.lowStockThreshold) ?? 10),
              barcode: strv(row.barcode) || sku,
              weightGrams: num(row.weightGrams) ?? 0,
              piecesPerBox: Math.max(1, Math.round(num(row.piecesPerBox) ?? 1)),
              image: image || "/dmk-logo.png",
              gallery: image.startsWith("http") ? JSON.stringify([image]) : "[]",
              description: `${name} — ${company}.`,
              seoTitle: `${name} | DMK Mart B2B`,
              seoDesc: `Buy ${name} at wholesale price on DMK Mart.`,
              keywords: `${name}, ${company}, wholesale`,
              active: status !== "INACTIVE",
              activeSource: "ADMIN",
              syncSource: "LOCAL",
              rating: 4.5,
              reviewCount: 10,
            },
          });
          created++;
        }
      } catch (e) {
        errors.push(`${sku || "(no sku)"}: ${e instanceof Error ? e.message.slice(0, 140) : "row failed"}`);
      }
    }

    const nextStart = start + chunk.length;
    const done = nextStart >= allRows.length;
    if (done) {
      await db.activityLog.create({
        data: { action: "IMPORT", entity: "product", detail: `SKU import: ${updated} updated, ${created} created, ${skipped} skipped${unmatchedCategories.size ? ` · unmatched categories: ${[...unmatchedCategories].slice(0, 6).join(", ")}` : ""}` },
      });
    }
    return NextResponse.json({
      ok: true,
      totalRows: allRows.length,
      processed: chunk.length,
      nextStart,
      done,
      updated, created, skipped,
      errors: errors.slice(0, 10),
      unmatchedCategories: [...unmatchedCategories].slice(0, 20),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Import failed", 500);
  }
}
