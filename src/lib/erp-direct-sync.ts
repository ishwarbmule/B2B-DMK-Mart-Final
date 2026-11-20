/**
 * ERP → website sync engine (direct MySQL, read-only pull).
 *
 * The owner ticks which ERP tables/columns to share (Admin → ERP Data). The
 * ticked columns are stored as mapping configs in the Setting table:
 *
 *   erp_map_products    { table, skuCol, nameCol, companyCol, mrpCol, rateCol,
 *                         costCol, deliveryRateCol, stockCol, imageCol, activeCol,
 *                         unitCol, packQtyCol, hsnCol, gstCol, barcodeCol,
 *                         weightCol, piecesPerBoxCol, tier1Col..tier5Col, columns[] }
 *   erp_map_warehouses  { table, codeCol, nameCol, activeCol, columns[] }
 *   erp_map_stock       { table, skuCol, warehouseCodeCol, qtyCol, columns[] }
 *
 * `columns[]` = the ticked "show on website/admin" columns — they are stored
 * verbatim in ErpProductMirror.payloadJson (audit + admin data browser) and are
 * NEVER mapped into website pricing logic.
 *
 * Mandatory working surfaces (owner requirement):
 *   - Warehouses + their products (per-godown stock) — Warehouse / WarehouseStock
 *   - Product pricing (MRP + rate) — projected automatically
 *   - Brand = ERP company name — auto-upserted into Brand with erpNames aliases
 *
 * NEVER touches the ERP database (see lib/erp-mysql.ts). Website merchandising
 * (badges isHot/isTop/isFeatured/isDeal, dealPrice, categories, images uploaded
 * via Cloudinary) is admin-owned overlay data — a sync never overwrites it.
 *
 * Big catalogs exceed the 60s serverless cap → sync runs ONE page per call with
 * a persisted cursor (the 504 lesson): products chunk via erp_sync_cursor_products.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting, setSetting, logSyncEvent } from "@/lib/settings";
import { assertIdentifier, assertReadOnly, describeErpTable, erpPool, fetchErpPage } from "@/lib/erp-mysql";

// ───────── mapping types + storage ─────────

export type ProductMapping = {
  table: string;
  skuCol: string; nameCol: string; companyCol: string;
  mrpCol: string; rateCol: string; costCol?: string; deliveryRateCol?: string;
  stockCol?: string; imageCol?: string; activeCol?: string;
  unitCol?: string; packQtyCol?: string; hsnCol?: string; gstCol?: string;
  barcodeCol?: string; weightCol?: string; piecesPerBoxCol?: string;
  tier1Col?: string; tier2Col?: string; tier3Col?: string; tier4Col?: string; tier5Col?: string;
  columns: string[]; // ticked — shown in admin + exposed to the website verbatim
};
export type WarehouseMapping = { table: string; codeCol: string; nameCol: string; activeCol?: string; columns: string[] };
export type StockMapping = {
  table: string; skuCol: string; warehouseCodeCol: string; qtyCol: string; columns: string[];
  // ERP WarehouseStock rows key products/warehouses by ID, not sku/code. When set,
  // the stock pull runs a READ-ONLY ERP-side JOIN so `skuCol`/`warehouseCodeCol`
  // values arrive as the referenced columns' values under the same keys:
  //   skuJoin:        { table: "Product",   idCol: "id", selectCol: "sku"  }
  //   warehouseJoin:  { table: "Warehouse", idCol: "id", selectCol: "code" }
  skuJoin?: { table: string; idCol: string; selectCol: string };
  warehouseJoin?: { table: string; idCol: string; selectCol: string };
};

const KEY_PRODUCTS = "erp_map_products";
const KEY_WAREHOUSES = "erp_map_warehouses";
const KEY_STOCK = "erp_map_stock";

export async function getProductsMapping(): Promise<ProductMapping | null> {
  const raw = await getSetting(KEY_PRODUCTS, "");
  if (!raw) return null;
  try { return JSON.parse(raw) as ProductMapping; } catch { return null; }
}
export async function getWarehousesMapping(): Promise<WarehouseMapping | null> {
  const raw = await getSetting(KEY_WAREHOUSES, "");
  if (!raw) return null;
  try { return JSON.parse(raw) as WarehouseMapping; } catch { return null; }
}
export async function getStockMapping(): Promise<StockMapping | null> {
  const raw = await getSetting(KEY_STOCK, "");
  if (!raw) return null;
  try { return JSON.parse(raw) as StockMapping; } catch { return null; }
}

export async function saveProductsMapping(m: ProductMapping): Promise<void> {
  assertIdentifier(m.table);
  for (const c of [m.skuCol, m.nameCol, m.companyCol, m.mrpCol, m.rateCol, ...(m.columns || [])]) assertIdentifier(c);
  await setSetting(KEY_PRODUCTS, JSON.stringify(m));
}
export async function saveWarehousesMapping(m: WarehouseMapping): Promise<void> {
  assertIdentifier(m.table);
  for (const c of [m.codeCol, m.nameCol, ...(m.columns || [])]) assertIdentifier(c);
  await setSetting(KEY_WAREHOUSES, JSON.stringify(m));
}
export async function saveStockMapping(m: StockMapping): Promise<void> {
  assertIdentifier(m.table);
  for (const c of [m.skuCol, m.warehouseCodeCol, m.qtyCol, ...(m.columns || [])]) assertIdentifier(c);
  await setSetting(KEY_STOCK, JSON.stringify(m));
}

// ───────── auto-detect (first connect — the owner just ticks to confirm) ─────────

const SKU_RE = /^(sku|item_?codes?|product_?codes?|items?_?codes?|ref_?nos?|part_?(no|number|code)s?|article_?(no|code)s?|items?_?ids?)$/i;
const NAME_RE = /^(names?|items?_?names?|products?_?names?|titles?|descriptions?)$/i;
const COMPANY_RE = /(company|firm|brand|supplier|vendor|make)/i;
const MRP_RE = /(mrp|max.?retail|msrp|tier5)/i;
const RATE_RE = /(rate|price|retail|sell|tier4|dealer|wholesale)/i;
const COST_RE = /(cost|purchase|buy)/i;
const STOCK_RE = /(stock|qty|quantity|balance|available)/i;
const IMAGE_RE = /(image|img|photo|pic|thumb|picture)/i;
const ACTIVE_RE = /(active|status)/i;
const CODE_RE = /(code|^id$|short|abbr)/i;
const GODOWN_RE = /(godown|warehouse|wh|location|store|branch)/i;
const QTY_RE = /(qty|quantity|stock|balance|pieces|pcs)/i;

function pick(cols: { field: string }[], ...regexes: RegExp[]): string {
  for (const re of regexes) {
    const hit = cols.find((c) => re.test(c.field));
    if (hit) return hit.field;
  }
  return "";
}

/** Best-guess mapping from a DESCRIBE — the admin panel prefills this; the owner ticks/overrides. */
export async function autoDetectMapping(entity: "products" | "warehouses" | "stock", table: string) {
  const cols = await describeErpTable(table);
  if (entity === "products") {
    const m: ProductMapping = {
      table,
      skuCol: pick(cols, SKU_RE, CODE_RE) || cols[0]?.field || "",
      nameCol: pick(cols, NAME_RE) || cols[1]?.field || "",
      companyCol: pick(cols, COMPANY_RE),
      mrpCol: pick(cols, MRP_RE),
      rateCol: pick(cols, RATE_RE),
      costCol: pick(cols, COST_RE) || undefined,
      deliveryRateCol: pick(cols, /delivery/i) || undefined,
      stockCol: pick(cols, STOCK_RE) || undefined,
      imageCol: pick(cols, IMAGE_RE) || undefined,
      activeCol: pick(cols, ACTIVE_RE) || undefined,
      unitCol: pick(cols, /^unit/i) || undefined,
      packQtyCol: pick(cols, /(pack|box|case)/i) || undefined,
      hsnCol: pick(cols, /hsn/i) || undefined,
      gstCol: pick(cols, /gst|tax/i) || undefined,
      barcodeCol: pick(cols, /barcode|bar_?code|ean/i) || undefined,
      weightCol: pick(cols, /weight/i) || undefined,
      piecesPerBoxCol: pick(cols, /pieces|per_?box/i) || undefined,
      columns: cols.map((c) => c.field).filter((f) => [SKU_RE, NAME_RE, COMPANY_RE, MRP_RE, RATE_RE, IMAGE_RE, STOCK_RE].some((re) => re.test(f))),
    };
    if (!m.mrpCol && m.rateCol) m.mrpCol = m.rateCol;
    if (!m.rateCol && m.mrpCol) m.rateCol = m.mrpCol;
    return m;
  }
  if (entity === "warehouses") {
    const m: WarehouseMapping = {
      table,
      codeCol: pick(cols, CODE_RE) || cols[0]?.field || "",
      nameCol: pick(cols, GODOWN_RE, NAME_RE) || cols[1]?.field || "",
      activeCol: pick(cols, ACTIVE_RE) || undefined,
      columns: cols.map((c) => c.field),
    };
    return m;
  }
  const m: StockMapping = {
    table,
    skuCol: pick(cols, SKU_RE, /item_?code/i) || cols[0]?.field || "",
    warehouseCodeCol: pick(cols, GODOWN_RE) || cols[1]?.field || "",
    qtyCol: pick(cols, QTY_RE) || cols[2]?.field || "",
    columns: cols.map((c) => c.field),
  };
  return m;
}

// ───────── normalization ─────────

const num = (v: unknown, d = 0) => (v === null || v === undefined || v === "" ? d : Number(v) || d);
const str = (v: unknown, d = "") => (v === null || v === undefined ? d : String(v)).trim();

function coerceActive(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (["0", "false", "n", "no", "inactive", "disabled", "off", "draft"].includes(s)) return false;
  return true;
}

function val(raw: Record<string, unknown>, col?: string): unknown {
  if (!col) return undefined;
  const direct = raw[col];
  if (direct !== undefined) return direct;
  const lower = new Map(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
  return lower.get(col.toLowerCase());
}

export type NormalizedRow = {
  erpId: string; sku: string; name: string; company: string;
  unit: string; hsn: string; gst: number; costPrice: number;
  packQty: number; piecesPerBox: number;
  mrp: number; rate: number; deliveryRate: number; tier1: number; tier2: number; tier3: number; tier4: number; tier5: number;
  stock: number; weightGrams: number; barcode: string; image: string; active: boolean;
  extras: Record<string, unknown>; // ticked columns verbatim
};

export function normalizeProductRow(raw: Record<string, unknown>, m: ProductMapping, imageBase: string): NormalizedRow | null {
  const sku = str(val(raw, m.skuCol));
  const name = str(val(raw, m.nameCol));
  if (!sku || !name) return null;
  const mrp = num(val(raw, m.mrpCol));
  const rate = num(val(raw, m.rateCol));
  const tierN = (col?: string) => (col ? num(val(raw, col)) : 0);
  const image = str(val(raw, m.imageCol) ?? "");
  const img = image
    ? (/^(https?:)?\/\//i.test(image) || image.startsWith("data:") ? image : imageBase ? `${imageBase}/${image.replace(/^\/+/, "")}` : "")
    : "";
  // ticked columns verbatim — cost price NEVER goes here (admin-only field)
  const ticked = new Set(m.columns || []);
  const mapped = new Set(
    [m.skuCol, m.nameCol, m.companyCol, m.mrpCol, m.rateCol, m.costCol, m.deliveryRateCol, m.stockCol,
     m.imageCol, m.activeCol, m.unitCol, m.packQtyCol, m.hsnCol, m.gstCol, m.barcodeCol, m.weightCol,
     m.piecesPerBoxCol, m.tier1Col, m.tier2Col, m.tier3Col, m.tier4Col, m.tier5Col].filter(Boolean) as string[]
  );
  const extras: Record<string, unknown> = {};
  for (const c of ticked) {
    if (mapped.has(c)) continue;
    extras[c] = val(raw, c);
  }
  return {
    erpId: str(val(raw, "id") ?? val(raw, "ID") ?? val(raw, m.skuCol)),
    sku, name,
    company: str(val(raw, m.companyCol)),
    unit: str(val(raw, m.unitCol), "Pcs") || "Pcs",
    hsn: str(val(raw, m.hsnCol)),
    gst: num(val(raw, m.gstCol), 18),
    costPrice: num(val(raw, m.costCol)),
    packQty: Math.max(1, Math.round(num(val(raw, m.packQtyCol), 1))),
    piecesPerBox: Math.round(num(val(raw, m.piecesPerBoxCol))),
    mrp, rate,
    deliveryRate: num(val(raw, m.deliveryRateCol)),
    tier1: tierN(m.tier1Col), tier2: tierN(m.tier2Col), tier3: tierN(m.tier3Col),
    tier4: tierN(m.tier4Col) || rate, tier5: tierN(m.tier5Col) || mrp,
    stock: num(val(raw, m.stockCol)),
    weightGrams: num(val(raw, m.weightCol)),
    barcode: str(val(raw, m.barcodeCol)),
    image: img,
    active: coerceActive(val(raw, m.activeCol)),
    extras,
  };
}

// ───────── company → Brand (brand MEANS the ERP company) ─────────

const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "brand";

async function upsertBrandForCompany(company: string): Promise<string | null> {
  const c = company.trim();
  if (!c) return null;
  const brands = await db.brand.findMany({ select: { id: true, name: true, erpNames: true } });
  const norm = (s: string) => s.trim().toLowerCase();
  const hit = brands.find((b) => norm(b.name) === norm(c))
    ?? brands.find((b) => {
      try { return (JSON.parse(b.erpNames || "[]") as string[]).some((a) => norm(a) === norm(c)); } catch { return false; }
    });
  if (hit) return hit.id;
  let slug = slugify(c);
  if (await db.brand.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const created = await db.brand.create({ data: { name: c, slug, erpNames: JSON.stringify([c]) } });
  return created.id;
}

// ───────── categories (fallback chain; ERP category picking comes later) ─────────

type CatCache = { fallback: { topId: string; midId: string; endId: string } };
async function loadCatCache(): Promise<CatCache> {
  const [tops, mids, ends] = await Promise.all([
    db.topCategory.findMany({ select: { id: true, name: true } }),
    db.midCategory.findMany({ select: { id: true, name: true, topId: true } }),
    db.endCategory.findMany({ select: { id: true, name: true, midId: true } }),
  ]);
  let fallbackTop = tops[0];
  if (!fallbackTop) fallbackTop = await db.topCategory.create({ data: { name: "General" } });
  let fallbackMid = mids.find((m) => m.topId === fallbackTop.id) ?? mids[0];
  if (!fallbackMid) fallbackMid = await db.midCategory.create({ data: { name: "General", topId: fallbackTop.id } });
  let fallbackEnd = ends.find((e) => e.midId === fallbackMid.id) ?? ends[0];
  if (!fallbackEnd) fallbackEnd = await db.endCategory.create({ data: { name: "General", midId: fallbackMid.id } });
  return { fallback: { topId: fallbackTop.id, midId: fallbackMid.id, endId: fallbackEnd.id } };
}

// ───────── product sync (one page per call, persisted cursor) ─────────

export type SyncPageResult = { seen: number; created: number; updated: number; skipped: number; offset: number; done: boolean; errors: string[] };

export async function syncProductsPage(pageSize = 300, offsetOverride?: number): Promise<SyncPageResult> {
  const m = await getProductsMapping();
  if (!m) throw new Error("Product mapping not configured — tick columns in Admin → ERP Data first");
  const imageBase = (await getSetting("erp_image_base_url", "")).trim().replace(/\/+$/, "");
  const cursorRaw = await getSetting("erp_sync_cursor_products", "0");
  const offset = offsetOverride ?? Number(cursorRaw || 0);
  const allCols = [...new Set([m.skuCol, m.nameCol, m.companyCol, m.mrpCol, m.rateCol, m.costCol, m.deliveryRateCol,
    m.stockCol, m.imageCol, m.activeCol, m.unitCol, m.packQtyCol, m.hsnCol, m.gstCol, m.barcodeCol, m.weightCol,
    m.piecesPerBoxCol, m.tier1Col, m.tier2Col, m.tier3Col, m.tier4Col, m.tier5Col, ...(m.columns || [])].filter(Boolean) as string[])];
  const rows = await fetchErpPage(m.table, allCols, { limit: pageSize, offset, orderBy: m.skuCol });

  const result: SyncPageResult = { seen: rows.length, created: 0, updated: 0, skipped: 0, offset, done: rows.length < pageSize, errors: [] };
  const catCache = await loadCatCache();

  for (const raw of rows) {
    const item = normalizeProductRow(raw, m, imageBase);
    if (!item) { result.skipped++; continue; }
    try {
      // mirror upsert (SKU-keyed) — costPrice admin-only, ticked extras verbatim
      const mirrorData = {
        sku: item.sku, name: item.name, isActive: item.active,
        mrp: m.mrpCol ? item.mrp : null,
        costPrice: m.costCol ? item.costPrice : null,
        deliveryRate: m.deliveryRateCol ? item.deliveryRate : null,
        availableStock: m.stockCol ? item.stock : null,
        erpUpdatedAt: new Date(),
        lastSource: "MYSQL",
        payloadJson: JSON.stringify(item.extras),
        lastSyncedAt: new Date(),
      };
      await db.erpProductMirror.upsert({ where: { sku: item.sku }, create: mirrorData, update: mirrorData });

      const brandId = await upsertBrandForCompany(item.company);
      const dealer = item.rate > 0 ? item.rate : item.mrp;
      const mrp = item.mrp > 0 ? item.mrp : dealer;
      const data = {
        erpId: item.erpId,
        name: item.name,
        company: item.company,
        ...(brandId ? { brandId } : {}),
        topId: catCache.fallback.topId, midId: catCache.fallback.midId, endId: catCache.fallback.endId,
        unit: item.unit, packQty: item.packQty, piecesPerBox: item.piecesPerBox,
        purchaseCost: item.costPrice,
        dealerPrice: dealer, basePrice: dealer, mrp,
        tier1: item.tier1, tier2: item.tier2, tier3: item.tier3, tier4: item.tier4, tier5: item.tier5,
        deliveryRate: item.deliveryRate,
        ...(m.stockCol ? { stock: Math.round(item.stock) } : {}),
        lowStockThreshold: 10,
        barcode: item.barcode, hsn: item.hsn, gst: item.gst, weightGrams: item.weightGrams,
        syncSource: "ERP",
        lastSyncedAt: new Date(),
      };

      const existing = await db.product.findUnique({ where: { sku: item.sku } })
        ?? (item.erpId ? await db.product.findFirst({ where: { erpId: item.erpId } }) : null);

      if (existing) {
        // syncSource=LOCAL rows are admin-owned: a pull never overwrites their catalog data
        if (existing.syncSource !== "LOCAL") {
          const update: Record<string, unknown> = { ...data };
          if (item.image) update.image = item.image; // keep local/Cloudinary image if ERP sends none
          if (existing.activeSource !== "ADMIN") { update.active = item.active; update.activeSource = "ERP"; }
          await db.product.update({ where: { id: existing.id }, data: update });
        } else {
          await db.product.update({ where: { id: existing.id }, data: { erpId: item.erpId, lastSyncedAt: new Date() } });
        }
        result.updated++;
      } else {
        let slug = slugifyProduct(`${item.company || "dmk"}-${item.name}`);
        if (await db.product.findUnique({ where: { slug } })) slug = `${slug}-${item.sku.slice(-6).toLowerCase()}`;
        await db.product.create({
          data: {
            ...data,
            sku: item.sku,
            slug,
            active: item.active,
            activeSource: "ERP",
            image: item.image,
            gallery: item.image ? JSON.stringify([item.image]) : "[]",
            description: `${item.name} — synced from DMK Mart ERP.`,
            seoTitle: `${item.name} | DMK Mart B2B`,
            seoDesc: `Buy ${item.name} at wholesale price on DMK Mart.`,
            keywords: `${item.name}, ${item.company}, wholesale`,
            rating: 4.5,
            reviewCount: 10,
          },
        });
        result.created++;
      }
    } catch (e: unknown) {
      result.errors.push(`${item.sku}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // persisted cursor — one page per request, next call continues (504 lesson)
  if (result.done) {
    await setSetting("erp_sync_cursor_products", "0");
    await setSetting("erp_sync_last_full_at", new Date().toISOString());
  } else {
    await setSetting("erp_sync_cursor_products", String(offset + rows.length));
  }
  return result;
}

function slugifyProduct(s: string) {
  return s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "item";
}

// ───────── warehouses (godowns) ─────────

export async function syncWarehouses(): Promise<{ seen: number; created: number; updated: number; deactivated: number; errors: string[] }> {
  const m = await getWarehousesMapping();
  if (!m) throw new Error("Warehouse mapping not configured — tick columns in Admin → ERP Data first");
  const allCols = [...new Set([m.codeCol, m.nameCol, m.activeCol, ...(m.columns || [])].filter(Boolean) as string[])];
  const rows = await fetchErpPage(m.table, allCols, { limit: 1000, orderBy: m.codeCol });
  const result = { seen: 0, created: 0, updated: 0, deactivated: 0, errors: [] as string[] };
  const seenCodes = new Set<string>();
  for (const raw of rows) {
    const code = str(val(raw, m.codeCol));
    const name = str(val(raw, m.nameCol)) || code;
    if (!code) continue;
    result.seen++;
    seenCodes.add(code);
    try {
      const active = m.activeCol ? coerceActive(val(raw, m.activeCol)) : true;
      const existing = await db.warehouse.findFirst({ where: { code } });
      if (existing) {
        await db.warehouse.update({ where: { id: existing.id }, data: { name, active, source: "ERP" } });
        result.updated++;
      } else {
        await db.warehouse.create({ data: { code, name, active, source: "ERP" } });
        result.created++;
      }
    } catch (e: unknown) {
      result.errors.push(`${code}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // FULL pull: ERP godowns that vanished get deactivated (never deleted — order history FK safety)
  if (rows.length < 1000) {
    const erpWarehouses = await db.warehouse.findMany({ where: { source: "ERP" }, select: { id: true, code: true, active: true } });
    for (const w of erpWarehouses) {
      if (w.code && !seenCodes.has(w.code) && w.active) {
        await db.warehouse.update({ where: { id: w.id }, data: { active: false } });
        result.deactivated++;
      }
    }
  }
  await setSetting("erp_sync_last_warehouses_at", new Date().toISOString());
  return result;
}

// ───────── per-warehouse stock ─────────

/** Read-only JOINed stock fetch: substitutes ID-keyed columns with the values
 *  they reference (Product.sku under the skuCol key, Warehouse.code under the
 *  warehouseCodeCol key) so the existing row-processing logic is unchanged. */
async function fetchStockJoined(sm: StockMapping): Promise<Record<string, unknown>[]> {
  const p = await erpPool();
  const sel: string[] = [];
  for (const c of [...new Set([sm.qtyCol, ...(sm.columns || [])].filter(Boolean) as string[])]) {
    assertIdentifier(c);
    sel.push(`s.\`${c}\` AS \`${c}\``);
  }
  if (sm.skuJoin) {
    assertIdentifier(sm.skuJoin.table); assertIdentifier(sm.skuJoin.idCol); assertIdentifier(sm.skuJoin.selectCol);
    sel.push(`j1.\`${sm.skuJoin.selectCol}\` AS \`${sm.skuCol}\``);
  }
  if (sm.warehouseJoin) {
    assertIdentifier(sm.warehouseJoin.table); assertIdentifier(sm.warehouseJoin.idCol); assertIdentifier(sm.warehouseJoin.selectCol);
    sel.push(`j2.\`${sm.warehouseJoin.selectCol}\` AS \`${sm.warehouseCodeCol}\``);
  }
  assertIdentifier(sm.table);
  let sql = `SELECT ${sel.join(", ")} FROM \`${sm.table}\` s`;
  if (sm.skuJoin) sql += ` JOIN \`${sm.skuJoin.table}\` j1 ON j1.\`${sm.skuJoin.idCol}\` = s.\`${sm.skuCol}\``;
  if (sm.warehouseJoin) sql += ` JOIN \`${sm.warehouseJoin.table}\` j2 ON j2.\`${sm.warehouseJoin.idCol}\` = s.\`${sm.warehouseCodeCol}\``;
  sql += ` LIMIT 5000`;
  assertReadOnly(sql);
  const [rows] = await p.query(sql);
  return rows as Record<string, unknown>[];
}

export async function syncStock(): Promise<{ rows: number; stocksUpserted: number; productsUpdated: number; missing: number; errors: string[] }> {
  const sm = await getStockMapping();
  const wm = await getWarehousesMapping();
  const pm = await getProductsMapping();
  if (!sm) throw new Error("Stock mapping not configured — tick columns in Admin → ERP Data first");
  const allCols = [...new Set([sm.skuCol, sm.warehouseCodeCol, sm.qtyCol, ...(sm.columns || [])].filter(Boolean) as string[])];
  const rows = (sm.skuJoin || sm.warehouseJoin)
    ? await fetchStockJoined(sm)
    : await fetchErpPage(sm.table, allCols, { limit: 5000, orderBy: sm.skuCol });
  const result = { rows: rows.length, stocksUpserted: 0, productsUpdated: 0, missing: 0, errors: [] as string[] };

  const warehouses = await db.warehouse.findMany({ where: { source: "ERP" }, select: { id: true, code: true } });
  const whByCode = new Map(warehouses.map((w) => [w.code, w.id]));
  const erpWhIds = warehouses.map((w) => w.id);

  // parse + resolve in memory (no per-row DB queries)
  const parsed: { sku: string; whId: string; qty: number }[] = [];
  for (const raw of rows) {
    const sku = str(val(raw, sm.skuCol));
    const whCode = str(val(raw, sm.warehouseCodeCol));
    const qty = Math.round(num(val(raw, sm.qtyCol)));
    if (!sku || !whCode) continue;
    const whId = whByCode.get(whCode);
    if (!whId) { result.missing++; continue; }
    parsed.push({ sku, whId, qty });
  }
  const skus = [...new Set(parsed.map((r) => r.sku))];
  const prodRows = skus.length
    ? await db.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } })
    : [];
  const prodBySku = new Map(prodRows.map((p) => [p.sku, p.id]));

  const totals = new Map<string, number>(); // sku -> sum across godowns
  const desired = new Map<string, { whId: string; pid: string; qty: number }>(); // "whId:pid" -> row
  const touched = new Map<string, Set<string>>(); // warehouseId -> productIds seen (stale cleanup)
  for (const r of parsed) {
    const pid = prodBySku.get(r.sku);
    if (!pid) { result.missing++; continue; }
    totals.set(r.sku, (totals.get(r.sku) ?? 0) + r.qty);
    desired.set(`${r.whId}:${pid}`, { whId: r.whId, pid, qty: r.qty });
    if (!touched.has(r.whId)) touched.set(r.whId, new Set());
    touched.get(r.whId)!.add(pid);
  }

  // ONE query for existing rows, then diff in memory
  const pidList = [...new Set([...desired.values()].map((v) => v.pid))];
  const existingRows = pidList.length
    ? await db.warehouseStock.findMany({
        where: { warehouseId: { in: erpWhIds }, productId: { in: pidList } },
        select: { id: true, warehouseId: true, productId: true, qty: true },
      })
    : [];
  const existingByKey = new Map(existingRows.map((e) => [`${e.warehouseId}:${e.productId}`, e]));

  const creates: { warehouseId: string; productId: string; qty: number }[] = [];
  const updateIds: { id: string; qty: number }[] = [];
  for (const [key, d] of desired) {
    const ex = existingByKey.get(key);
    if (!ex) creates.push({ warehouseId: d.whId, productId: d.pid, qty: d.qty });
    else if (ex.qty !== d.qty) updateIds.push({ id: ex.id, qty: d.qty });
  }
  for (let i = 0; i < creates.length; i += 1000) {
    await db.warehouseStock.createMany({ data: creates.slice(i, i + 1000), skipDuplicates: true });
  }
  for (let i = 0; i < updateIds.length; i += 25) {
    await Promise.all(updateIds.slice(i, i + 25).map((u) => db.warehouseStock.update({ where: { id: u.id }, data: { qty: u.qty } })));
  }
  result.stocksUpserted = desired.size;

  // roll up per-godown totals onto the product (what buyers can order) —
  // single bulk UPDATE ... FROM (VALUES ...) per table (the 504 lesson again:
  // 2.8k per-row updateMany calls would blow the 60s serverless budget)
  const totalsArr = [...totals.entries()];
  if (totalsArr.length) {
    const values = Prisma.join(
      totalsArr.map(([sku, total]) => Prisma.sql`(${sku}, ${total})`),
    );
    result.productsUpdated = await db.$executeRaw(
      Prisma.sql`UPDATE "Product" p SET "stock" = v.total FROM (VALUES ${values}) AS v(sku, total) WHERE p."sku" = v.sku AND p."syncSource" <> 'LOCAL'`,
    );
    await db.$executeRaw(
      Prisma.sql`UPDATE "ErpProductMirror" m SET "availableStock" = v.total FROM (VALUES ${values}) AS v(sku, total) WHERE m."sku" = v.sku`,
    );
  }

  // stale rows: ERP godown stock rows that no longer exist upstream (full pull covers it)
  if (rows.length < 5000 && wm) {
    for (const [whId, productIds] of touched) {
      await db.warehouseStock.deleteMany({ where: { warehouseId: whId, productId: { notIn: [...productIds] } } });
    }
  }
  await setSetting("erp_sync_last_stock_at", new Date().toISOString());
  return result;
}

// ───────── orchestration (cron tick / Re-sync now loop driver) ─────────

export type TickResult = { ran: boolean; reason?: string; products?: SyncPageResult; warehouses?: { created: number; updated: number; deactivated: number }; stock?: { rows: number; stocksUpserted: number; productsUpdated: number }; durationMs: number; errors: string[] };

/**
 * Daily sync for Vercel HOBBY (cron limited to once per day): refreshes
 * warehouses + stock fully, then pulls product pages IN A LOOP within the
 * function time budget (Hobby serverless cap 60s), pageBudget caps the worst
 * case. Cursor persists, so whatever the budget could not cover continues on
 * the next daily run — or instantly via the admin "Re-sync now" loop.
 */
export async function runErpDaily(opts?: { timeBudgetMs?: number; pageBudget?: number }): Promise<TickResult> {
  const t0 = Date.now();
  const budget = opts?.timeBudgetMs ?? 50_000;
  const pageCap = opts?.pageBudget ?? 15;
  await setSetting("erp_sync_last_tick_at", new Date().toISOString());
  const errors: string[] = [];
  const out: TickResult = { ran: true, durationMs: 0, errors };

  const pm = await getProductsMapping();
  const wm = await getWarehousesMapping();
  const sm = await getStockMapping();
  if (!pm && !wm && !sm) {
    out.reason = "no ERP mappings configured yet";
    out.durationMs = Date.now() - t0;
    return out;
  }

  if (wm) {
    try {
      const w = await syncWarehouses();
      out.warehouses = { created: w.created, updated: w.updated, deactivated: w.deactivated };
    } catch (e) { errors.push(`warehouses: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (sm) {
    try {
      const s = await syncStock();
      out.stock = { rows: s.rows, stocksUpserted: s.stocksUpserted, productsUpdated: s.productsUpdated };
      if (s.errors.length) errors.push(...s.errors.slice(0, 5));
    } catch (e) { errors.push(`stock: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (pm) {
    let pages = 0;
    let last: SyncPageResult | null = null;
    try {
      do {
        last = await syncProductsPage(300);
        pages++;
        if (last.errors.length) errors.push(...last.errors.slice(0, 3));
      } while (!last.done && pages < pageCap && Date.now() - t0 < budget);
      out.products = last;
      await logSyncEvent({
        direction: "ERP→WEB", action: "mysql-daily", status: errors.length ? "PARTIAL" : "OK",
        message: `${pages} page(s), last@${last.offset} ${last.created}c/${last.updated}u/${last.skipped}s ${last.done ? "(full done)" : "(budget cap — continues tomorrow or Re-sync now)"}`,
        seen: last.seen, created: last.created, updated: last.updated, skipped: last.skipped, durationMs: Date.now() - t0,
      });
    } catch (e) { errors.push(`products: ${e instanceof Error ? e.message : String(e)}`); }
  }
  out.durationMs = Date.now() - t0;
  return out;
}

/**
 * One tick = ensure warehouses+stock fresh (cheap) + advance products by one
 * page (bounded work for the 60s cap). The admin "Re-sync now" loop calls this
 * repeatedly until products.done, so a full 2k+ catalog never times out.
 */
export async function runErpTick(force = false): Promise<TickResult> {
  const t0 = Date.now();
  const intervalMin = Number(await getSetting("erp_auto_sync_minutes", "15"));
  const lastAt = await getSetting("erp_sync_last_tick_at", "");
  if (!force && lastAt) {
    const elapsedMin = (Date.now() - new Date(lastAt).getTime()) / 60000;
    if (elapsedMin < intervalMin) return { ran: false, reason: `interval gate (${intervalMin}min)`, durationMs: Date.now() - t0, errors: [] };
  }
  await setSetting("erp_sync_last_tick_at", new Date().toISOString());

  const errors: string[] = [];
  const out: TickResult = { ran: true, durationMs: 0, errors };

  const pm = await getProductsMapping();
  const wm = await getWarehousesMapping();
  const sm = await getStockMapping();
  if (!pm && !wm && !sm) {
    out.reason = "no ERP mappings configured yet";
    out.durationMs = Date.now() - t0;
    return out;
  }

  if (wm) {
    try {
      const w = await syncWarehouses();
      out.warehouses = { created: w.created, updated: w.updated, deactivated: w.deactivated };
    } catch (e) { errors.push(`warehouses: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (sm) {
    try {
      const s = await syncStock();
      out.stock = { rows: s.rows, stocksUpserted: s.stocksUpserted, productsUpdated: s.productsUpdated };
      if (s.errors.length) errors.push(...s.errors.slice(0, 5));
    } catch (e) { errors.push(`stock: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (pm) {
    try {
      const p = await syncProductsPage(300);
      out.products = p;
      if (p.errors.length) errors.push(...p.errors.slice(0, 5));
      await logSyncEvent({
        direction: "ERP→WEB", action: "mysql-tick", status: p.errors.length ? "PARTIAL" : "OK",
        message: `page@${p.offset} ${p.created}c/${p.updated}u/${p.skipped}s ${p.done ? "(full done)" : "(continues next tick)"}`,
        seen: p.seen, created: p.created, updated: p.updated, skipped: p.skipped, durationMs: Date.now() - t0,
      });
    } catch (e) { errors.push(`products: ${e instanceof Error ? e.message : String(e)}`); }
  }
  out.durationMs = Date.now() - t0;
  return out;
}

/** Full re-sync driver: loops product pages until done (called per HTTP request, cursor persisted). */
export async function fullResyncChunk(pageSize = 300, stage?: "warehouses" | "stock" | "products"): Promise<{ products?: SyncPageResult; warehouses?: unknown; stock?: unknown; errors: string[]; stageTimings?: Record<string, number> }> {
  const errors: string[] = [];
  const timings: Record<string, number> = {};
  const t = (k: string, fn: () => Promise<void>) => async () => { const t0 = Date.now(); await fn(); timings[k] = Date.now() - t0; };
  const out: { products?: SyncPageResult; warehouses?: unknown; stock?: unknown; errors: string[]; stageTimings?: Record<string, number> } = { errors, stageTimings: timings };
  const wm = await getWarehousesMapping();
  const sm = await getStockMapping();
  const pm = await getProductsMapping();
  if (wm && (!stage || stage === "warehouses")) {
    try { await t("warehouses", async () => { out.warehouses = await syncWarehouses(); })(); } catch (e) { errors.push(`warehouses: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (sm && (!stage || stage === "stock")) {
    try {
      await t("stock", async () => {
        const s = await syncStock();
        out.stock = { rows: s.rows, stocksUpserted: s.stocksUpserted, productsUpdated: s.productsUpdated };
      })();
    } catch (e) { errors.push(`stock: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (pm && (!stage || stage === "products")) {
    try { await t("products", async () => { out.products = await syncProductsPage(pageSize); })(); } catch (e) { errors.push(`products: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return out;
}

/** Guard: any accidental write path that reaches for the ERP pool fails here first.
 *  The ERP is READ-ONLY by design — orders are entered in the ERP software by the
 *  owner's team; ERP stock reduces there; the next sync reads the new level. */
export function erpWriteGuard(): never {
  throw new Error("ERP writes are permanently disabled — the connection is read-only by design");
}
