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
 * (badges isHot/isTop/isFeatured/isDeal, dealPrice, images uploaded via
 * Cloudinary) is admin-owned overlay data — a sync never overwrites it.
 * Categories: the ERP's top-level / end-level category columns DO sync — they
 * build the Top→Mid→End tree and classify every product they cover; products
 * the ERP leaves unclassified keep their admin-assigned categories.
 *
 * Big catalogs exceed the 60s serverless cap → sync runs ONE page per call with
 * a persisted cursor (the 504 lesson): products chunk via erp_sync_cursor_products.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting, setSetting, logSyncEvent } from "@/lib/settings";
import { assertIdentifier, assertReadOnly, describeErpTable, erpPool, erpQuery, fetchErpPage } from "@/lib/erp-mysql";

// ───────── mapping types + storage ─────────

export type ProductMapping = {
  table: string;
  skuCol: string; nameCol: string; companyCol: string;
  mrpCol: string; rateCol: string; costCol?: string; deliveryRateCol?: string;
  stockCol?: string; imageCol?: string; activeCol?: string;
  unitCol?: string; packQtyCol?: string; hsnCol?: string; gstCol?: string;
  barcodeCol?: string; weightCol?: string; piecesPerBoxCol?: string;
  tier1Col?: string; tier2Col?: string; tier3Col?: string; tier4Col?: string; tier5Col?: string;
  // category source columns (ERP → Top/Mid/End taxonomy). A stored mapping
  // WITHOUT these keys triggers a one-time DESCRIBE backfill on the next sync
  // page; "" = checked, no such column exists (never probed again).
  topCatCol?: string; midCatCol?: string; endCatCol?: string;
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
const KEY_SELECTED_WAREHOUSES = "erp_sync_selected_warehouses"; // legacy: godown CODES
const KEY_SELECTED_WAREHOUSE_IDS = "erp_sync_selected_whids";   // current: ERP godown row IDs (codes collide across firms)
const KEY_PRODUCT_GROUPS = "erp_sync_product_groups";           // friendly "product details" ticks
const KEY_WH_NEON_MAP = "erp_wh_neon_map";                      // ERP godown ID → Neon Warehouse.id
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

/**
 * Sync scope — which ERP godowns (warehouses) feed the website. Persisted as a
 * Setting (NO new tables). Empty list / unset = ALL godowns (legacy behaviour).
 * Products sync only pulls SKUs that have rows in the selected godowns' stock
 * table; stock sync only pulls rows of the selected godowns. The ERP stays
 * strictly read-only: bound-parameter WHERE on SELECTs only.
 */
export async function getSelectedWarehouseCodes(): Promise<string[]> {
  try {
    const raw = await getSetting(KEY_SELECTED_WAREHOUSES, "");
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function saveSelectedWarehouseCodes(codes: string[]): Promise<void> {
  const clean = [...new Set((codes || []).map((c) => String(c).trim()).filter(Boolean))];
  await setSetting(KEY_SELECTED_WAREHOUSES, JSON.stringify(clean));
}

// ───────── godown listing (read-only ERP read, firm-aware) ─────────

export type ErpGodown = {
  erpId: string; code: string; name: string; city: string;
  isActive: boolean; productCount: number;
  gstMode: string; gstin: string; // internal — NEVER shown in the UI
};

/**
 * Read-only ERP read: every godown joined with its owning firm's tax mode.
 * The admin UI only ever shows NON_GST-firm godowns and never renders the firm
 * name, tax status, code, table or column names — just "Warehouse · City".
 */
export async function listErpGodowns(): Promise<ErpGodown[]> {
  const rows = await erpQuery(
    "SELECT w.`id` AS erpId, w.`code` AS code, w.`name` AS name, w.`city` AS city, " +
    "w.`isActive` AS isActive, f.`gstMode` AS gstMode, f.`gstin` AS gstin, " +
    "(SELECT COUNT(*) FROM `WarehouseStock` s WHERE s.`warehouseId` = w.`id`) AS productCount " +
    "FROM `Warehouse` w JOIN `Firm` f ON f.`id` = w.`firmId` ORDER BY w.`name` ASC, w.`id` ASC"
  );
  return rows.map((r) => ({
    erpId: str(r.erpId),
    code: str(r.code),
    name: str(r.name) || str(r.code) || "Warehouse",
    city: str(r.city),
    isActive: coerceActive(r.isActive),
    productCount: num(r.productCount),
    gstMode: str(r.gstMode).toUpperCase(),
    gstin: str(r.gstin),
  }));
}

/** Godowns the admin is allowed to pick — non-GST firms only (UI shows them
 *  without any firm/tax wording). */
export async function listNonGstGodowns(): Promise<ErpGodown[]> {
  const all = await listErpGodowns();
  return all.filter((g) => g.gstMode === "NON_GST" || (!g.gstMode && !g.gstin));
}

// ───────── selection state (which godowns feed the site) ─────────

export async function getSelectedWarehouseIds(): Promise<string[]> {
  try {
    const raw = await getSetting(KEY_SELECTED_WAREHOUSE_IDS, "");
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function saveSelectedWarehouseIds(ids: string[]): Promise<void> {
  const clean = [...new Set((ids || []).map((s) => String(s).trim()).filter(Boolean))];
  await setSetting(KEY_SELECTED_WAREHOUSE_IDS, JSON.stringify(clean));
}

async function loadWhNeonMap(): Promise<Record<string, string>> {
  try { return JSON.parse(await getSetting(KEY_WH_NEON_MAP, "{}")) as Record<string, string>; } catch { return {}; }
}
async function saveWhNeonMap(m: Record<string, string>): Promise<void> {
  await setSetting(KEY_WH_NEON_MAP, JSON.stringify(m));
}

/**
 * The authoritative selection: ERP godown row IDs. IDs (not codes) because this
 * source has godown codes shared by different firms ("WH-MAIN" twice) and all
 * stock rows key by row ID. A legacy code-based selection is migrated once,
 * so the daily cron keeps its scope right after deploy.
 */
export async function selectionState(): Promise<{ configured: boolean; ids: string[] }> {
  const raw = await getSetting(KEY_SELECTED_WAREHOUSE_IDS, "");
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      return { configured: true, ids: Array.isArray(arr) ? arr.map(String).filter(Boolean) : [] };
    } catch { /* fall through to legacy */ }
  }
  const codes = await getSelectedWarehouseCodes();
  if (!codes.length) return { configured: false, ids: [] };
  try {
    const all = await listErpGodowns();
    const ids = codes.map((c) => all.find((g) => g.code === c)?.erpId ?? "").filter(Boolean);
    if (ids.length) {
      await saveSelectedWarehouseIds(ids);
      return { configured: true, ids };
    }
  } catch { /* source unreachable — fall back to legacy unscoped behaviour */ }
  return { configured: false, ids: [] };
}

/** WHERE fragment limiting an ERP read to the selected godowns; null = no filter. */
async function selectedGodownWhere(
  godownCol: string,
  opts?: { viaStockTable?: { table: string; skuCol: string } }
): Promise<{ whereSql: string; params: unknown[] } | null> {
  const codes = await getSelectedWarehouseCodes();
  if (!codes.length) return null;
  const col = assertIdentifier(godownCol);
  const marks = codes.map(() => "?").join(", ");
  if (opts?.viaStockTable) {
    const tbl = assertIdentifier(opts.viaStockTable.table);
    const skuCol = assertIdentifier(opts.viaStockTable.skuCol);
    return { whereSql: `\`${col}\` IN (SELECT \`${skuCol}\` FROM \`${tbl}\` WHERE \`${col}\` IN (${marks}))`, params: codes };
  }
  return { whereSql: `\`${col}\` IN (${marks})`, params: codes };
}

export async function saveProductsMapping(m: ProductMapping): Promise<void> {
  assertIdentifier(m.table);
  for (const c of [m.skuCol, m.nameCol, m.companyCol, m.mrpCol, m.rateCol, m.topCatCol, m.midCatCol, m.endCatCol, ...(m.columns || [])].filter(Boolean) as string[]) assertIdentifier(c);
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

/** Category column detection — single source of regex truth for top/mid/end
 *  category source columns. This ERP exposes top_level_category +
 *  end_level_category (the owner's "top level and end level categories");
 *  sub/mid-named columns are picked up when present. */
async function detectCatCols(table: string): Promise<{ top: string; mid: string; end: string }> {
  const cols = await describeErpTable(table);
  return {
    top: pick(cols, /^top[_\-]?level[_\-]?cat/i, /^top[_\-]?cat/i, /^department$/i, /^dept$/i) || "",
    mid: pick(cols, /sub[_\-]?cat/i, /mid[_\-]?cat/i, /sub[_\-]?dept/i) || "",
    end: pick(cols, /^end[_\-]?level[_\-]?cat/i, /^end[_\-]?cat/i, /last[_\-]?cat/i) || "",
  };
}

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
    const catCols = await detectCatCols(table);
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
      topCatCol: catCols.top || undefined,
      midCatCol: catCols.mid || undefined,
      endCatCol: catCols.end || undefined,
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
  topCat: string; midCat: string; endCat: string; // cleaned ERP category names (may be empty)
  extras: Record<string, unknown>; // ticked columns verbatim
};

/** Category names straight from the source system: trim, collapse spaces,
 *  strip curly/straight apostrophes, title-case ALL-CAPS words (keeping short
 *  acronyms like SS/NV/HD readable) — stable, display-clean names so the
 *  taxonomy matches case-insensitively across syncs. */
function cleanCatName(s: string): string {
  let t = s.replace(/[\u2018\u2019]/g, "").replace(/\s+/g, " ").trim();
  if (/^[A-Z0-9 &()\/.\-]+$/.test(t) && t.length > 4) {
    t = t.toLowerCase().replace(/(^|[\s(&/.\-])([a-z])/g, (_m, p1: string, p2: string) => p1 + p2.toUpperCase());
    t = t.replace(/\bSs\b/g, "SS").replace(/\bNv\b/g, "NV").replace(/\bGn\b/g, "GN").replace(/\bHd\b/g, "HD");
  }
  return t.slice(0, 80).replace(/\s*[!.,;:]+\s*$/, "").trim();
}

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
     m.piecesPerBoxCol, m.tier1Col, m.tier2Col, m.tier3Col, m.tier4Col, m.tier5Col,
     m.topCatCol, m.midCatCol, m.endCatCol].filter(Boolean) as string[]
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
    topCat: cleanCatName(str(val(raw, m.topCatCol))),
    midCat: cleanCatName(str(val(raw, m.midCatCol))),
    endCat: cleanCatName(str(val(raw, m.endCatCol))),
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

// ───────── category taxonomy built from the ERP pull ─────────

type CatTriple = { topId: string; midId: string; endId: string };
type CatTreeStats = { tops: number; mids: number; ends: number };

/**
 * Build the site taxonomy from this page's ERP category names and return a
 * per-item resolver.
 *
 * - top level category → TopCategory, end level category → EndCategory; when
 *   the source has no mid/sub-department column the top doubles as the mid so
 *   every End has a proper home (Top → Mid(same name) → End).
 * - matching is case-insensitive, so repeated syncs never duplicate categories;
 *   missing rows are batch-created. Existing rows are NEVER restyled — images,
 *   emojis and colors stay admin-owned.
 * - items with NO top-level category in the ERP resolve to null: their products
 *   keep whatever classification the admin assigned (the ERP only claims
 *   products it actually classifies; the old always-fallback behaviour is what
 *   kept flattening the whole tree back to "General" on every sync).
 */
async function resolveCatChains(items: NormalizedRow[]): Promise<{ chainFor: (it: NormalizedRow) => CatTriple | null; created: CatTreeStats }> {
  const created: CatTreeStats = { tops: 0, mids: 0, ends: 0 };
  const lcase = (s: string) => s.trim().toLowerCase();

  // distinct wanted chains (display-cleaned names, case-insensitive keys)
  const wanted = new Map<string, { top: string; mid: string; end: string }>();
  for (const it of items) {
    if (!it.topCat) continue;
    const top = it.topCat;
    const mid = it.midCat || top; // no mid column → the top groups its own ends
    const end = it.endCat || "General";
    const key = `${lcase(top)}||${lcase(mid)}||${lcase(end)}`;
    if (!wanted.has(key)) wanted.set(key, { top, mid, end });
  }
  if (!wanted.size) return { chainFor: () => null, created };

  // tops — find-or-create by (case-insensitive) name
  const topByName = new Map((await db.topCategory.findMany({ select: { id: true, name: true } })).map((t) => [lcase(t.name), t.id] as const));
  const missingTops = [...new Set([...wanted.values()].map((w) => w.top))].filter((n) => !topByName.has(lcase(n)));
  if (missingTops.length) {
    await db.topCategory.createMany({ data: missingTops.map((name) => ({ name })), skipDuplicates: true });
    for (const t of await db.topCategory.findMany({ where: { name: { in: missingTops } }, select: { id: true, name: true } })) {
      topByName.set(lcase(t.name), t.id);
    }
    created.tops = missingTops.length;
  }

  // mids — unique per (top, name)
  const midByKey = new Map<string, string>((await db.midCategory.findMany({ select: { id: true, name: true, topId: true } })).map((m) => [`${m.topId}||${lcase(m.name)}`, m.id]));
  const missingMids = new Map<string, { topId: string; name: string }>();
  for (const w of wanted.values()) {
    const topId = topByName.get(lcase(w.top));
    if (!topId) continue;
    const key = `${topId}||${lcase(w.mid)}`;
    if (!midByKey.has(key) && !missingMids.has(key)) missingMids.set(key, { topId, name: w.mid });
  }
  if (missingMids.size) {
    await db.midCategory.createMany({ data: [...missingMids.values()], skipDuplicates: true });
    for (const m of await db.midCategory.findMany({ where: { OR: [...missingMids.values()].map((v) => ({ topId: v.topId, name: v.name })) }, select: { id: true, name: true, topId: true } })) {
      midByKey.set(`${m.topId}||${lcase(m.name)}`, m.id);
    }
    created.mids = missingMids.size;
  }

  // ends — unique per (mid, name)
  const endByKey = new Map<string, string>((await db.endCategory.findMany({ select: { id: true, name: true, midId: true } })).map((e) => [`${e.midId}||${lcase(e.name)}`, e.id]));
  const missingEnds = new Map<string, { midId: string; name: string }>();
  for (const w of wanted.values()) {
    const topId = topByName.get(lcase(w.top));
    const midId = topId ? midByKey.get(`${topId}||${lcase(w.mid)}`) : undefined;
    if (!topId || !midId) continue;
    const key = `${midId}||${lcase(w.end)}`;
    if (!endByKey.has(key) && !missingEnds.has(key)) missingEnds.set(key, { midId, name: w.end });
  }
  if (missingEnds.size) {
    await db.endCategory.createMany({ data: [...missingEnds.values()], skipDuplicates: true });
    for (const e of await db.endCategory.findMany({ where: { OR: [...missingEnds.values()].map((v) => ({ midId: v.midId, name: v.name })) }, select: { id: true, name: true, midId: true } })) {
      endByKey.set(`${e.midId}||${lcase(e.name)}`, e.id);
    }
    created.ends = missingEnds.size;
  }

  // resolve every wanted chain to ids
  const resolved = new Map<string, CatTriple>();
  for (const [key, w] of wanted) {
    const topId = topByName.get(lcase(w.top));
    const midId = topId ? midByKey.get(`${topId}||${lcase(w.mid)}`) : undefined;
    const endId = midId ? endByKey.get(`${midId}||${lcase(w.end)}`) : undefined;
    if (topId && midId && endId) resolved.set(key, { topId, midId, endId });
  }

  return {
    chainFor: (it: NormalizedRow): CatTriple | null => {
      if (!it.topCat) return null;
      const mid = it.midCat || it.topCat;
      const end = it.endCat || "General";
      return resolved.get(`${lcase(it.topCat)}||${lcase(mid)}||${lcase(end)}`) ?? null;
    },
    created,
  };
}

/**
 * Category column backfill: mappings saved before the guided flow knew about
 * categories carry no topCatCol/endCatCol keys. DESCRIBE the products table
 * once, detect, and persist the outcome ("checked, none found" persists as
 * empty strings so it never re-probes). Respects the wizard's "Departments &
 * categories" tick — unticked means the owner wants no category sync, so the
 * keys stay absent and every page keeps skipping the taxonomy.
 */
async function ensureCategoryCols(pm: ProductMapping, catsTicked: boolean): Promise<ProductMapping> {
  if ("topCatCol" in pm || "endCatCol" in pm) return pm;
  if (!catsTicked) return pm;
  try {
    const det = await detectCatCols(pm.table);
    const next: ProductMapping = { ...pm, topCatCol: det.top, midCatCol: det.mid, endCatCol: det.end };
    const add = [det.top, det.mid, det.end].filter(Boolean) as string[];
    if (add.length) next.columns = [...new Set([...(pm.columns || []), ...add])];
    await saveProductsMapping(next);
    return next;
  } catch {
    return pm; // DESCRIBE hiccup — retry on the next page call
  }
}

// ───────── product sync (one page per call, persisted cursor) ─────────

export type SyncPageResult = { seen: number; created: number; updated: number; skipped: number; offset: number; done: boolean; errors: string[] };

export async function syncProductsPage(pageSize = 300, offsetOverride?: number): Promise<SyncPageResult> {
  const catsTicked = (await getProductGroups()).find((g) => g.id === "cats")?.ticked ?? true;
  const m0 = await getProductsMapping();
  if (!m0) throw new Error("Product mapping not configured — tick columns in Admin → ERP Data first");
  const m = await ensureCategoryCols(m0, catsTicked);
  const imageBase = (await getSetting("erp_image_base_url", "")).trim().replace(/\/+$/, "");
  const cursorRaw = await getSetting("erp_sync_cursor_products", "0");
  const offset = offsetOverride ?? Number(cursorRaw || 0);
  const allCols = [...new Set([m.skuCol, m.nameCol, m.companyCol, m.mrpCol, m.rateCol, m.costCol, m.deliveryRateCol,
    m.stockCol, m.imageCol, m.activeCol, m.unitCol, m.packQtyCol, m.hsnCol, m.gstCol, m.barcodeCol, m.weightCol,
    m.piecesPerBoxCol, m.tier1Col, m.tier2Col, m.tier3Col, m.tier4Col, m.tier5Col, m.topCatCol, m.midCatCol, m.endCatCol,
    ...(m.columns || [])].filter(Boolean) as string[])];
  // godown scope: when the admin picked specific warehouses, only pull SKUs
  // stocked in those godowns. This source keys stock rows by godown row ID and
  // joins them to products/warehouses by ID, so the scope runs through the
  // stock table on IDs — codes collide across firms here. Read-only: SELECT
  // subquery with bound params.
  const smForScope = await getStockMapping();
  const sel = await selectionState();
  let scope: { whereSql: string; params: unknown[] } | null = null;
  if (sel.configured) {
    if (!sel.ids.length) {
      scope = { whereSql: "1 = 0", params: [] }; // every godown unticked → pull nothing
    } else if (smForScope?.skuJoin) {
      // stock rows key products by row ID → translate through the same JOIN the
      // stock pull uses, so the outer sku column compares against real SKUs
      const sj = smForScope.skuJoin;
      const skuCol = assertIdentifier(m.skuCol);
      const jt = assertIdentifier(sj.table);
      const jid = assertIdentifier(sj.idCol);
      const jsel = assertIdentifier(sj.selectCol);
      const st = assertIdentifier(smForScope.table);
      const pidCol = assertIdentifier(smForScope.skuCol);
      const gidCol = assertIdentifier(smForScope.warehouseCodeCol);
      const marks = sel.ids.map(() => "?").join(", ");
      scope = {
        whereSql: `\`${skuCol}\` IN (SELECT j.\`${jsel}\` FROM \`${jt}\` j JOIN \`${st}\` s ON s.\`${pidCol}\` = j.\`${jid}\` WHERE s.\`${gidCol}\` IN (${marks}))`,
        params: sel.ids,
      };
    } else if (smForScope?.warehouseJoin) {
      // godown keyed by row ID, stock rows carry the sku directly
      const skuCol = assertIdentifier(m.skuCol);
      const st = assertIdentifier(smForScope.table);
      const pidCol = assertIdentifier(smForScope.skuCol);
      const gidCol = assertIdentifier(smForScope.warehouseCodeCol);
      const marks = sel.ids.map(() => "?").join(", ");
      scope = {
        whereSql: `\`${skuCol}\` IN (SELECT s.\`${pidCol}\` FROM \`${st}\` s WHERE s.\`${gidCol}\` IN (${marks}))`,
        params: sel.ids,
      };
    } else if (smForScope) {
      // legacy code-keyed source — unchanged behaviour
      scope = await selectedGodownWhere(smForScope.warehouseCodeCol, { viaStockTable: { table: smForScope.table, skuCol: smForScope.skuCol } });
    }
  }
  const rows = await fetchErpPage(m.table, allCols, {
    limit: pageSize, offset, orderBy: m.skuCol,
    ...(scope ? { extraWhere: scope.whereSql, extraParams: scope.params } : {}),
  });

  const result: SyncPageResult = { seen: rows.length, created: 0, updated: 0, skipped: 0, offset, done: rows.length < pageSize, errors: [] };

  // normalize in memory — no DB access per row
  const items: NormalizedRow[] = [];
  for (const raw of rows) {
    const it = normalizeProductRow(raw, m, imageBase);
    if (it) items.push(it);
    else result.skipped++;
  }
  if (!items.length) {
    if (result.done) { await setSetting("erp_sync_cursor_products", "0"); await setSetting("erp_sync_last_full_at", new Date().toISOString()); }
    else await setSetting("erp_sync_cursor_products", String(offset + rows.length));
    return result;
  }

  const catCache = await loadCatCache();
  // taxonomy from the ERP's own top/end category columns (null resolver when
  // the cats tick is off — products then keep their current classification)
  const catTree = catsTicked ? await resolveCatChains(items) : null;
  const now = new Date();

  // ── brands: ONE table load, match in memory, create only missing (brand = ERP company) ──
  const companies = [...new Set(items.map((i) => i.company.trim()).filter(Boolean))];
  const brandRows = await db.brand.findMany({ select: { id: true, name: true, slug: true, erpNames: true } });
  const norm = (s: string) => s.trim().toLowerCase();
  const brandIdFor = new Map<string, string | null>();
  const brandSlugTaken = new Set(brandRows.map((b) => b.slug));
  for (const c of companies) {
    const hit = brandRows.find((b) => norm(b.name) === norm(c))
      ?? brandRows.find((b) => { try { return (JSON.parse(b.erpNames || "[]") as string[]).some((a) => norm(a) === norm(c)); } catch { return false; } });
    brandIdFor.set(c, hit ? hit.id : null);
  }
  for (const c of companies.filter((x) => !brandIdFor.get(x))) {
    let slug = slugify(c);
    let n = 0;
    while (brandSlugTaken.has(slug + (n ? `-${n}` : ""))) n++;
    const finalSlug = n ? `${slug}-${n}` : slug;
    brandSlugTaken.add(finalSlug);
    try {
      const created = await db.brand.create({ data: { name: c, slug: finalSlug, erpNames: JSON.stringify([c]) } });
      brandIdFor.set(c, created.id);
    } catch {
      const again = await db.brand.findFirst({ where: { name: c } });
      if (again) brandIdFor.set(c, again.id);
    }
  }

  // ── ONE query: existing products (full rows for diffing) ──
  const skus = items.map((i) => i.sku);
  const existingRows = await db.product.findMany({ where: { sku: { in: skus } } });
  const existingBySku = new Map(existingRows.map((p) => [p.sku, p]));

  const common = (item: NormalizedRow, brandId: string | null) => {
    const dealer = item.rate > 0 ? item.rate : item.mrp;
    return {
      erpId: item.erpId, name: item.name, company: item.company.trim(),
      ...(brandId ? { brandId } : {}),
      // NOTE: categories are deliberately NOT here — see the create/update
      // branches below. Putting the fallback in common() re-pointed EVERY
      // product to "General" on each sync and wiped the taxonomy.
      unit: item.unit, packQty: item.packQty, piecesPerBox: item.piecesPerBox,
      purchaseCost: item.costPrice, dealerPrice: dealer, basePrice: dealer,
      mrp: item.mrp > 0 ? item.mrp : dealer,
      tier1: item.tier1, tier2: item.tier2, tier3: item.tier3, tier4: item.tier4, tier5: item.tier5,
      deliveryRate: item.deliveryRate,
      ...(m.stockCol ? { stock: Math.round(item.stock) } : {}),
      lowStockThreshold: 10,
      barcode: item.barcode, hsn: item.hsn, gst: item.gst, weightGrams: item.weightGrams,
    };
  };

  // ── split creates vs updates (diff in memory, write only real changes) ──
  const creates: Record<string, unknown>[] = [];
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  for (const item of items) {
    const company = item.company.trim();
    const brandId = brandIdFor.get(company) ?? null;
    const chain = catTree?.chainFor(item) ?? null; // null = ERP has no category for this row → leave its current one
    if (!existingBySku.has(item.sku)) {
      creates.push({
        ...common(item, brandId),
        // new rows always need a full chain: the ERP one when it classifies
        // this product, the fallback chain otherwise
        ...(chain ?? catCache.fallback),
        syncSource: "ERP", lastSyncedAt: now,
        sku: item.sku,
        slug: `${slugifyProduct(`${company || "dmk"}-${item.name}`)}-${item.sku.slice(-6).toLowerCase()}`,
        active: item.active, activeSource: "ERP",
        image: item.image,
        gallery: item.image ? JSON.stringify([item.image]) : "[]",
        description: `${item.name} — synced from DMK Mart ERP.`,
        seoTitle: `${item.name} | DMK Mart B2B`,
        seoDesc: `Buy ${item.name} at wholesale price on DMK Mart.`,
        keywords: `${item.name}, ${item.company}, wholesale`,
        rating: 4.5, reviewCount: 10,
      });
      result.created++;
    } else {
      const ex = existingBySku.get(item.sku)!;
      const base = common(item, brandId) as Record<string, unknown>;
      const prev = ex as unknown as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(base)) {
        const pv = prev[k] instanceof Date ? (prev[k] as Date).getTime() : prev[k];
        const cv = v instanceof Date ? v.getTime() : v;
        if (JSON.stringify(pv) !== JSON.stringify(cv)) data[k] = v;
      }
      if (chain) {
        // ERP classifies this product → keep its categories true to the source
        if (prev.topId !== chain.topId) data.topId = chain.topId;
        if (prev.midId !== chain.midId) data.midId = chain.midId;
        if (prev.endId !== chain.endId) data.endId = chain.endId;
      }
      if (item.image) { if (prev.image !== item.image) data.image = item.image; } // keep local/Cloudinary image if ERP sends none
      if (ex.activeSource !== "ADMIN") { if (prev.active !== item.active) data.active = item.active; data.activeSource = "ERP"; }
      if (ex.syncSource === "LOCAL") { data.erpId = item.erpId; data.lastSyncedAt = now; } // admin-owned rows: link only
      if (Object.keys(data).length) { data.lastSyncedAt = now; updates.push({ id: ex.id, data }); result.updated++; }
    }
  }

  // slug collision guard for the whole page in ONE query
  if (creates.length) {
    const wanted = creates.map((c) => c.slug as string);
    const taken = new Set((await db.product.findMany({ where: { slug: { in: wanted } }, select: { slug: true } })).map((r) => r.slug));
    for (const c of creates) {
      if (taken.has(c.slug as string)) c.slug = `${c.slug}-${String(c.sku).slice(-4).toLowerCase()}`;
    }
    for (let i = 0; i < creates.length; i += 250) {
      await db.product.createMany({ data: creates.slice(i, i + 250) as never, skipDuplicates: true });
    }
  }
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(updates.slice(i, i + 10).map((u) => db.product.update({ where: { id: u.id }, data: u.data })));
  }

  // ── mirror: batch creates + changed-only updates (costPrice admin-only field) ──
  const mirrorRows = await db.erpProductMirror.findMany({ where: { sku: { in: skus } } });
  const mirrorBySku = new Map(mirrorRows.map((r) => [r.sku, r]));
  const mCreates: Record<string, unknown>[] = [];
  const mUpdates: { id: string; data: Record<string, unknown> }[] = [];
  for (const item of items) {
    const row: Record<string, unknown> = {
      sku: item.sku, name: item.name, isActive: item.active,
      mrp: m.mrpCol ? item.mrp : null,
      costPrice: m.costCol ? item.costPrice : null,
      deliveryRate: m.deliveryRateCol ? item.deliveryRate : null,
      availableStock: m.stockCol ? Math.round(item.stock) : null,
      lastSource: "MYSQL", payloadJson: JSON.stringify(item.extras),
    };
    const ex = mirrorBySku.get(item.sku);
    if (!ex) mCreates.push({ ...row, erpUpdatedAt: now, lastSyncedAt: now });
    else {
      const diff: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (JSON.stringify((ex as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v)) diff[k] = v;
      }
      if (Object.keys(diff).length) { diff.lastSource = "MYSQL"; diff.lastSyncedAt = now; diff.erpUpdatedAt = now; mUpdates.push({ id: ex.id, data: diff }); }
    }
  }
  for (let i = 0; i < mCreates.length; i += 500) {
    await db.erpProductMirror.createMany({ data: mCreates.slice(i, i + 500) as never, skipDuplicates: true });
  }
  for (let i = 0; i < mUpdates.length; i += 10) {
    await Promise.all(mUpdates.slice(i, i + 10).map((u) => db.erpProductMirror.update({ where: { id: u.id }, data: u.data })));
  }

  // persisted cursor — one page per request, next call continues (504 lesson)
  if (result.done) {
    await setSetting("erp_sync_cursor_products", "0");
    await setSetting("erp_sync_last_full_at", new Date().toISOString());
  } else {
    await setSetting("erp_sync_cursor_products", String(offset + rows.length));
  }
  await logSyncEvent({
    direction: "ERP→WEB", action: "mysql-products", status: result.errors.length ? "PARTIAL" : "OK",
    message: `page@${offset} ${result.created}c/${result.updated}u/${result.skipped}s`
      + (catTree ? ` cats ${catTree.created.tops}t/${catTree.created.mids}m/${catTree.created.ends}e` : "")
      + ` ${result.done ? "(full done)" : "(continues next page)"}`,
    seen: result.seen, created: result.created, updated: result.updated, skipped: result.skipped,
  });
  return result;
}

function slugifyProduct(s: string) {
  return s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "item";
}

// ───────── warehouses (godowns) ─────────

export async function syncWarehouses(): Promise<{ seen: number; created: number; updated: number; deactivated: number; skipped: boolean; errors: string[] }> {
  const m = await getWarehousesMapping();
  if (!m) throw new Error("Warehouse mapping not configured");
  const result = { seen: 0, created: 0, updated: 0, deactivated: 0, skipped: false, errors: [] as string[] };
  const sel = await selectionState();
  // every godown unticked → nothing to mirror; visibility reconciliation happens at finalize
  if (sel.configured && !sel.ids.length) {
    result.skipped = true;
    await setSetting("erp_sync_last_warehouses_at", new Date().toISOString());
    return result;
  }
  // read-only ERP read — godown list with firm tax mode (only used to scope)
  const godowns = await listErpGodowns();
  const byId = new Map(godowns.map((g) => [g.erpId, g]));
  const wanted = sel.configured ? sel.ids : godowns.map((g) => g.erpId);
  const neonMap = await loadWhNeonMap();
  const claimedNeon = new Set(Object.values(neonMap));
  const keptIds = new Set<string>();
  for (const id of wanted) {
    const g = byId.get(id);
    if (!g) continue;
    result.seen++;
    keptIds.add(id);
    try {
      const data = { code: g.code, name: g.name, city: g.city || "", active: true, source: "ERP" };
      // resolve the Neon row: mapped first, then legacy adopt by code (skip rows
      // already claimed by another godown — codes can repeat across firms)
      let row = neonMap[id] ? await db.warehouse.findFirst({ where: { id: neonMap[id] } }) : null;
      if (!row && g.code) {
        const legacy = await db.warehouse.findFirst({ where: { code: g.code, source: "ERP" }, orderBy: { createdAt: "asc" } });
        if (legacy && !claimedNeon.has(legacy.id)) row = legacy;
      }
      if (row) {
        await db.warehouse.update({ where: { id: row.id }, data });
        neonMap[id] = row.id;
        claimedNeon.add(row.id);
        result.updated++;
      } else {
        const created = await db.warehouse.create({ data });
        neonMap[id] = created.id;
        claimedNeon.add(created.id);
        result.created++;
      }
    } catch (e: unknown) {
      result.errors.push(`${g.code}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // hide godown rows that are no longer selected (never delete — order FK safety)
  const erpRows = await db.warehouse.findMany({ where: { source: "ERP" }, select: { id: true, code: true, active: true } });
  const wantedCodes = new Set(wanted.map((id) => byId.get(id)?.code).filter(Boolean) as string[]);
  const neonToErp = new Map(Object.entries(neonMap).map(([erpId, neonId]) => [neonId, erpId] as const));
  for (const w of erpRows) {
    const erpId = neonToErp.get(w.id);
    const keep = erpId ? keptIds.has(erpId) : wantedCodes.has(w.code);
    if (!keep && w.active) {
      await db.warehouse.update({ where: { id: w.id }, data: { active: false } });
      result.deactivated++;
    }
  }
  await saveWhNeonMap(neonMap);
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
  // godown scope: only stock rows of the warehouses the admin picked. The
  // joined read keys godowns by row ID — scope on IDs, never on codes (codes
  // are shared by different firms here).
  const whSel = await selectionState();
  const params: unknown[] = [];
  if (whSel.configured) {
    if (!whSel.ids.length) {
      sql += ` WHERE 1 = 0`;
    } else {
      const marks = whSel.ids.map(() => "?").join(", ");
      sql += ` WHERE s.\`${assertIdentifier(sm.warehouseCodeCol)}\` IN (${marks})`;
      params.push(...whSel.ids);
    }
  }
  sql += ` LIMIT 5000`;
  assertReadOnly(sql);
  const [rows] = await p.query(sql, params);
  return rows as Record<string, unknown>[];
}

export async function syncStock(): Promise<{ rows: number; stocksUpserted: number; productsUpdated: number; missing: number; errors: string[] }> {
  const sm = await getStockMapping();
  const wm = await getWarehousesMapping();
  const pm = await getProductsMapping();
  if (!sm) throw new Error("Stock mapping not configured — tick columns in Admin → ERP Data first");
  const allCols = [...new Set([sm.skuCol, sm.warehouseCodeCol, sm.qtyCol, ...(sm.columns || [])].filter(Boolean) as string[])];
  // godown scope: only stock rows of the warehouses the admin picked
  const scope = await selectedGodownWhere(sm.warehouseCodeCol);
  const rows = (sm.skuJoin || sm.warehouseJoin)
    ? await fetchStockJoined(sm)
    : await fetchErpPage(sm.table, allCols, {
        limit: 5000, orderBy: sm.skuCol,
        ...(scope ? { extraWhere: scope.whereSql, extraParams: scope.params } : {}),
      });
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

// ───────── guided sync — friendly "product details" ticks + staged apply ─────────

/**
 * The owner-facing product detail groups. Each group owns the mapping keys of
 * the synced product fields it stands for. Locked groups stay on (name, code
 * and selling price keep the store working). The ticks are the UX layer; the
 * mapping rebuilt from them is the execution layer.
 */
const GROUP_DEFS: { id: string; label: string; keys: (keyof ProductMapping)[]; locked?: boolean }[] = [
  { id: "pricing", label: "Selling price", keys: ["rateCol", "tier4Col"], locked: true },
  { id: "mrp", label: "MRP", keys: ["mrpCol", "tier5Col"] },
  { id: "tiers", label: "Wholesale tier prices", keys: ["tier1Col", "tier2Col", "tier3Col"] },
  { id: "delivery", label: "Delivery rate", keys: ["deliveryRateCol"] },
  { id: "stock", label: "Stock quantity", keys: ["stockCol"] },
  { id: "unitPack", label: "Unit & pack size", keys: ["unitCol", "packQtyCol", "piecesPerBoxCol"] },
  { id: "barcode", label: "Barcode", keys: ["barcodeCol"] },
  { id: "hsnTax", label: "HSN & tax rate", keys: ["hsnCol", "gstCol"] },
  { id: "image", label: "Product image", keys: ["imageCol"] },
  { id: "brand", label: "Brand / company", keys: ["companyCol"] },
  { id: "cats", label: "Departments & categories", keys: ["topCatCol", "midCatCol", "endCatCol"] },
  { id: "weight", label: "Weight", keys: ["weightCol"] },
];

export type ProductGroupState = { id: string; label: string; ticked: boolean; locked?: boolean };

/** Current ticks (the guided flow's staged surface). Defaults to all-on until
 *  the owner saves a first choice. "other" covers unmapped ticked columns. */
export async function getProductGroups(): Promise<ProductGroupState[]> {
  let saved: Record<string, boolean> = {};
  try {
    const raw = await getSetting(KEY_PRODUCT_GROUPS, "");
    if (raw) saved = JSON.parse(raw) as Record<string, boolean>;
  } catch { saved = {}; }
  const out: ProductGroupState[] = GROUP_DEFS.map((g) => ({
    id: g.id,
    label: g.label,
    locked: g.locked,
    ticked: g.locked ? true : saved[g.id] !== false,
  }));
  out.push({ id: "other", label: "Extra details", ticked: saved["other"] !== false });
  return out;
}

function groupOn(groups: Record<string, boolean>, id: string, locked?: boolean): boolean {
  return locked ? true : groups[id] !== false;
}

/**
 * Rebuild the products mapping from the friendly ticks. Locked groups stay;
 * unticked groups drop their mapped columns AND their mapping keys, so the
 * sync stops pulling those details and admin surfaces hide them.
 */
export function rebuildMappingFromGroups(pm: ProductMapping, groups: Record<string, boolean>): ProductMapping {
  const next: ProductMapping = { ...pm };
  const semanticCols = new Set<string>();
  const keptCols = new Set<string>();
  for (const g of GROUP_DEFS) {
    const on = groupOn(groups, g.id, g.locked);
    for (const k of g.keys) {
      const col = pm[k];
      if (!col) continue;
      const c = String(col);
      semanticCols.add(c);
      if (on) keptCols.add(c);
      else (next as unknown as Record<string, unknown>)[k] = undefined;
    }
  }
  const basic = [String(pm.skuCol), String(pm.nameCol)].filter(Boolean);
  const extras = (pm.columns || []).filter((c) => !semanticCols.has(c));
  const other = groupOn(groups, "other");
  next.columns = [...new Set([...basic, ...keptCols, ...(other ? extras : [])])];
  return next;
}

// ───────── staged apply (the "Update Products" button) ─────────

export type ApplyResult = { shownWarehouses: number; hiddenWarehouses: number };

/**
 * Apply, part 1 (fast, site-database only): persist the ticked godown IDs and
 * the product-detail groups, then flip visibility for warehouses already
 * mapped here. Unticked → hidden (active=false, its stock rows removed);
 * re-ticked → visible again and refilled by the pull that follows.
 */
export async function applySyncSelection(input: { ids?: string[]; groups?: Record<string, boolean> }): Promise<ApplyResult> {
  if (input.ids) {
    const clean = [...new Set(input.ids.map((s) => String(s).trim()).filter(Boolean))];
    if (!clean.length) throw new Error("Pick at least one warehouse");
    await saveSelectedWarehouseIds(clean);
  }
  if (input.groups) {
    await setSetting(KEY_PRODUCT_GROUPS, JSON.stringify(input.groups));
    const pm = await getProductsMapping();
    if (pm) await saveProductsMapping(rebuildMappingFromGroups(pm, input.groups));
  }
  const ids = new Set(await getSelectedWarehouseIds());
  const neonMap = await loadWhNeonMap();
  let shownWarehouses = 0;
  let hiddenWarehouses = 0;
  for (const [erpId, neonId] of Object.entries(neonMap)) {
    const w = await db.warehouse.findFirst({ where: { id: neonId, source: "ERP" } });
    if (!w) continue;
    if (ids.has(erpId) && !w.active) {
      await db.warehouse.update({ where: { id: neonId }, data: { active: true } });
      shownWarehouses++;
    } else if (!ids.has(erpId) && w.active) {
      await db.warehouse.update({ where: { id: neonId }, data: { active: false } });
      await db.warehouseStock.deleteMany({ where: { warehouseId: neonId } });
      hiddenWarehouses++;
    }
  }
  await logSyncEvent({
    direction: "ERP→WEB", action: "selection-apply", status: "OK",
    message: `${ids.size} warehouse(s) selected · ${shownWarehouses} shown / ${hiddenWarehouses} hidden`,
  });
  return { shownWarehouses, hiddenWarehouses };
}

export type FinalizeResult = { shownWarehouses: number; hiddenWarehouses: number; shownProducts: number; hiddenProducts: number };

/**
 * Apply, part 2 (runs after the pull completes): reconcile visibility with the
 * saved selection. ERP rows never mapped here get hidden too, and products not
 * stocked in any shown warehouse stop being listed (active=false; admin-owned
 * active overrides are respected).
 */
export async function finalizeSyncSelection(): Promise<FinalizeResult> {
  const sel = await selectionState();
  let godowns: ErpGodown[] = [];
  try { godowns = await listErpGodowns(); } catch { /* source offline — reconcile with what the site knows */ }
  const wantedIds = new Set(sel.ids);
  const wantedCodes = new Set(godowns.filter((g) => wantedIds.has(g.erpId)).map((g) => g.code));
  const neonMap = await loadWhNeonMap();
  const neonToErp = new Map(Object.entries(neonMap).map(([erpId, neonId]) => [neonId, erpId] as const));
  const rows = await db.warehouse.findMany({ where: { source: "ERP" }, select: { id: true, code: true, active: true } });
  let shownWarehouses = 0;
  let hiddenWarehouses = 0;
  for (const w of rows) {
    const erpId = neonToErp.get(w.id);
    const want = sel.configured ? (erpId ? wantedIds.has(erpId) : wantedCodes.has(w.code)) : true;
    if (want && !w.active) {
      await db.warehouse.update({ where: { id: w.id }, data: { active: true } });
      shownWarehouses++;
    } else if (!want && w.active) {
      await db.warehouse.update({ where: { id: w.id }, data: { active: false } });
      await db.warehouseStock.deleteMany({ where: { warehouseId: w.id } });
      hiddenWarehouses++;
    }
  }
  // products: listed = stocked in a shown warehouse
  const stockRows = await db.warehouseStock.findMany({
    where: { warehouse: { source: "ERP", active: true } },
    select: { productId: true },
  });
  const covered = [...new Set(stockRows.map((r) => r.productId))];
  const syncOwned: Prisma.ProductWhereInput = {
    syncSource: "ERP",
    activeSource: { not: "ADMIN" }, // column is NOT NULL — admin overrides stay untouched
  };
  const hiddenProducts = Number(await db.product.updateMany({
    where: covered.length
      ? { ...syncOwned, active: true, id: { notIn: covered } }
      : { ...syncOwned, active: true },
    data: { active: false },
  }).then((r) => (typeof r === "number" ? r : r.count)));
  const shownProducts = covered.length
    ? Number(await db.product.updateMany({ where: { ...syncOwned, active: false, id: { in: covered } }, data: { active: true } }).then((r) => (typeof r === "number" ? r : r.count)))
    : 0;
  await logSyncEvent({
    direction: "ERP→WEB", action: "selection-finalize", status: "OK",
    message: `${shownWarehouses} wh shown / ${hiddenWarehouses} hidden · ${shownProducts} products shown / ${hiddenProducts} hidden`,
  });
  return { shownWarehouses, hiddenWarehouses, shownProducts, hiddenProducts };
}

// ───────── bootstrap (first run — the guided flow needs no manual mapping) ─────────

const DMK_DEFAULT_WAREHOUSES: WarehouseMapping = {
  table: "Warehouse", codeCol: "code", nameCol: "name", activeCol: "isActive",
  columns: ["code", "name", "city", "type", "isActive"],
};
const DMK_DEFAULT_STOCK: StockMapping = {
  table: "WarehouseStock", skuCol: "productId", warehouseCodeCol: "warehouseId", qtyCol: "quantity",
  columns: ["quantity", "reservedQty", "damagedQty"],
  skuJoin: { table: "Product", idCol: "id", selectCol: "sku" },
  warehouseJoin: { table: "Warehouse", idCol: "id", selectCol: "code" },
};
const DMK_DEFAULT_PRODUCTS: ProductMapping = {
  table: "Product", skuCol: "sku", nameCol: "name", companyCol: "company",
  mrpCol: "tier5Mrp", rateCol: "tier4Retailer", costCol: "purchaseCost", deliveryRateCol: "deliveryRate",
  stockCol: "stockQuantity", imageCol: "photoUrl", activeCol: "isActive", unitCol: "unit", packQtyCol: "packQty",
  piecesPerBoxCol: "piecesPerBox", hsnCol: "hsnCode", gstCol: "gstRate", barcodeCol: "barcode",
  weightCol: "weightGrams", tier1Col: "tier1Distributor", tier2Col: "tier2Wholesale", tier3Col: "tier3SemiWholesale",
  tier4Col: "tier4Retailer", tier5Col: "tier5Mrp",
  topCatCol: "top_level_category", endCatCol: "end_level_category",
  columns: ["sku", "name", "company", "brand", "category", "top_level_category", "end_level_category",
    "tier1Distributor", "tier2Wholesale", "tier3SemiWholesale", "tier4Retailer", "tier5Mrp", "deliveryRate",
    "stockQuantity", "photoUrl", "isActive", "unit", "packQty", "piecesPerBox", "hsnCode", "gstRate",
    "barcode", "weightGrams", "alternateName"],
};

/** Create the mappings on first use so the guided flow never needs manual mapping. */
export async function ensureSyncMappings(): Promise<void> {
  if (!(await getWarehousesMapping())) await saveWarehousesMapping(DMK_DEFAULT_WAREHOUSES);
  if (!(await getStockMapping())) await saveStockMapping(DMK_DEFAULT_STOCK);
  if (!(await getProductsMapping())) await saveProductsMapping(DMK_DEFAULT_PRODUCTS);
}

/** Guard: any accidental write path that reaches for the ERP pool fails here first.
 *  The ERP is READ-ONLY by design — orders are entered in the ERP software by the
 *  owner's team; ERP stock reduces there; the next sync reads the new level. */
export function erpWriteGuard(): never {
  throw new Error("ERP writes are permanently disabled — the connection is read-only by design");
}
