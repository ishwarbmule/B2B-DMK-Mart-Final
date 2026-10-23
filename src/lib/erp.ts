/**
 * ERP sync layer — the owner's ERP runs on THEIR OWN MySQL server.
 * That MySQL is the core of the business (ERP software) — NEVER touch its data.
 *
 * STRICT RULE: this module NEVER writes to the ERP database.
 *  - Every query goes through assertReadOnly() which rejects anything that is
 *    not SELECT / SHOW / DESCRIBE / EXPLAIN.
 *  - mysql2 multipleStatements stays OFF, so stacked `;DROP ...` payloads fail.
 *  - Identifiers (table names) are validated against /^[\w]+$/.
 *
 * Connection credentials come from env (ERP_MYSQL_*) first, then from the
 * Setting table (Admin → Data Sync form) so the owner can paste them at runtime.
 */
import mysql from "mysql2/promise";
import { db } from "@/lib/db";

// ───────── settings helpers (Setting table) ─────────

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

// ───────── connection config ─────────

export type ErpConn = { host: string; port: number; user: string; password: string; database: string };

const ENV_KEYS: Record<keyof Omit<ErpConn, "port">, string> = {
  host: "ERP_MYSQL_HOST",
  user: "ERP_MYSQL_USER",
  password: "ERP_MYSQL_PASSWORD",
  database: "ERP_MYSQL_DATABASE",
};

/** Resolve ERP MySQL credentials: env vars win, Setting table is the fallback. */
export async function erpConn(): Promise<ErpConn | null> {
  const envHost = process.env[ENV_KEYS.host];
  const envUser = process.env[ENV_KEYS.user];
  const envDb = process.env[ENV_KEYS.database];
  if (envHost && envUser && envDb) {
    return {
      host: envHost,
      port: Number(process.env.ERP_MYSQL_PORT || 3306),
      user: envUser,
      password: process.env.ERP_MYSQL_PASSWORD || "",
      database: envDb,
    };
  }
  // Setting table fallback (saved from Admin → Data Sync)
  const keys = ["erp_db_host", "erp_db_port", "erp_db_user", "erp_db_password", "erp_db_name"];
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const host = map.get("erp_db_host");
  const user = map.get("erp_db_user");
  const database = map.get("erp_db_name");
  if (!host || !user || !database) return null;
  return {
    host,
    port: Number(map.get("erp_db_port") || 3306),
    user,
    password: map.get("erp_db_password") || "",
    database,
  };
}

let pool: mysql.Pool | null = null;
let poolKey = "";

/** Pooled ERP connection — recreated automatically when credentials change. */
export async function erpPool(): Promise<mysql.Pool> {
  const conn = await erpConn();
  if (!conn) throw new Error("ERP MySQL not configured — add credentials in Admin → Data Sync");
  const key = `${conn.host}:${conn.port}/${conn.database}|${conn.user}`;
  if (pool && poolKey === key) return pool;
  if (pool) await pool.end().catch(() => { /* ignore */ });
  pool = mysql.createPool({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database: conn.database,
    waitForConnections: true,
    connectionLimit: 3,
    connectTimeout: 15000,
    multipleStatements: false, // hard block stacked statements
    dateStrings: false,
  });
  poolKey = key;
  return pool;
}

export async function closeErpPool(): Promise<void> {
  if (pool) await pool.end().catch(() => { /* ignore */ });
  pool = null;
  poolKey = "";
}

// ───────── read-only enforcement ─────────

const READ_ONLY_RE = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;

/** Throw unless the statement is guaranteed read-only. */
export function assertReadOnly(sql: string): void {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  if (!READ_ONLY_RE.test(trimmed)) {
    throw new Error("BLOCKED: the ERP MySQL connection is strictly read-only");
  }
  if (trimmed.includes(";")) {
    throw new Error("BLOCKED: multiple SQL statements are not allowed on the ERP connection");
  }
}

/** Only bare identifiers (letters, digits, _, $) survive this. */
export function assertIdentifier(name: string): string {
  if (!/^[\w$]+$/.test(name)) throw new Error(`Blocked identifier: ${name}`);
  return name;
}

// ───────── status / explorer (all read-only) ─────────

export type ErpStatus = {
  configured: boolean;
  connected: boolean;
  error?: string;
  version?: string;
  database?: string;
  host?: string;
  tables?: number;
};

/** Quick connectivity probe: SELECT VERSION() + table count. */
export async function testErpConnection(): Promise<ErpStatus> {
  try {
    const conn = await erpConn();
    if (!conn) return { configured: false, connected: false, error: "No credentials saved" };
    const p = await erpPool();
    const [vRows] = await p.query<mysql.RowDataPacket[]>("SELECT VERSION() AS v");
    const [tRows] = await p.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()"
    );
    return {
      configured: true,
      connected: true,
      version: String(vRows[0]?.v ?? ""),
      database: conn.database,
      host: `${conn.host}:${conn.port}`,
      tables: Number(tRows[0]?.n ?? 0),
    };
  } catch (e) {
    return { configured: true, connected: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listErpTables(): Promise<{ name: string; rows: number | null }[]> {
  const p = await erpPool();
  const [rows] = await p.query<mysql.RowDataPacket[]>(
    `SELECT table_name AS name, table_rows AS row_count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  // NOTE: alias must NOT be `rows` — reserved keyword in MariaDB (Hostinger ERP runs MariaDB).
  return rows.map((r) => ({ name: String(r.name), rows: r.row_count === null ? null : Number(r.row_count) }));
}

export async function describeErpTable(table: string): Promise<{ field: string; type: string; null: string; key: string }[]> {
  const t = assertIdentifier(table);
  const p = await erpPool();
  const [rows] = await p.query<mysql.RowDataPacket[]>("DESCRIBE `" + t + "`");
  return rows.map((r) => ({ field: String(r.Field), type: String(r.Type), null: String(r.Null), key: String(r.Key ?? "") }));
}

export async function countErpTable(table: string): Promise<number> {
  const t = assertIdentifier(table);
  const p = await erpPool();
  const [rows] = await p.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${t}\``);
  return Number(rows[0]?.n ?? 0);
}

// ───────── product pull ─────────

export type ErpProduct = {
  id: string; sku: string; name: string; category: string; brand: string; company: string;
  unit: string; hsnCode: string; gstRate: number; purchaseCost: number; packQty: number;
  packPrice: number; packDiscountPercent: number; tier1Distributor: number; tier2Wholesale: number;
  tier3SemiWholesale: number; tier4Retailer: number; tier5Mrp: number; stockQuantity: number;
  reservedQty: number; damagedStock: number; lowStockThreshold: number; weightGrams: number;
  piecesPerBox: number; barcode: string; photoUrl: string; isActive: boolean; updatedAt: string;
};

/** Setting "erp_products_table" — the ERP's product table name (validated). */
export async function erpProductsTable(): Promise<string> {
  const t = (await getSetting("erp_products_table", "products")).trim();
  return assertIdentifier(t || "products");
}

/** Apply optional aliases (Setting "erp_product_aliases" JSON) before normalization. */
function applyAliases(row: Record<string, unknown>, aliases: Record<string, string>): Record<string, unknown> {
  if (!aliases || typeof aliases !== "object") return row;
  const lowerIndex = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) lowerIndex.set(k.toLowerCase(), v);
  const out: Record<string, unknown> = { ...row };
  for (const [canonical, actual] of Object.entries(aliases)) {
    if (typeof actual !== "string" || !actual) continue;
    const v = lowerIndex.get(actual.toLowerCase());
    if (v !== undefined) out[canonical] = v;
  }
  return out;
}

/** Pull products from the ERP (read-only). Supports chunked pulls: limit+offset (large catalogs exceed serverless timeouts in one call). */
export async function pullErpProducts(limit = 5000, offset = 0): Promise<Record<string, unknown>[]> {
  const p = await erpPool();
  const table = await erpProductsTable();
  let aliases: Record<string, string> = {};
  try { aliases = JSON.parse(await getSetting("erp_product_aliases", "{}")) as Record<string, string>; } catch { /* ignore */ }
  const [rows] = await p.query<mysql.RowDataPacket[]>(`SELECT * FROM \`${table}\` ORDER BY \`id\` LIMIT ? OFFSET ?`, [limit, offset]);
  return (rows as unknown as Record<string, unknown>[]).map((r) => applyAliases(r, aliases));
}

/**
 * Optional ERP image URL prefix (Setting "erp_image_base_url").
 * If the ERP stores relative paths (e.g. uploads/xyz.jpg), the B2B site prefixes
 * this so product images render. Cloudinary/absolute URLs pass through untouched.
 */
export async function erpImageBase(): Promise<string> {
  return (await getSetting("erp_image_base_url", "")).trim().replace(/\/+$/, "");
}

// ───────── webhook payload normalization ─────────
export type NormalizedErpProduct = {
  erpId: string; sku: string; name: string; category: string; brand: string; company: string;
  unit: string; hsn: string; gst: number; purchaseCost: number; packQty: number; packPrice: number;
  packDiscountPct: number; tier1: number; tier2: number; tier3: number; tier4: number; tier5: number;
  stock: number; reserved: number; damaged: number; lowStockThreshold: number; weightGrams: number;
  piecesPerBox: number; barcode: string; image: string; active: boolean;
};

const num = (v: unknown, d = 0) => (v === null || v === undefined || v === "" ? d : Number(v) || d);
const str = (v: unknown, d = "") => (v === null || v === undefined ? d : String(v)).trim();

/** Coerce ERP active flags in any style: 1/0, "1"/"0", true/false, "Y"/"N", "Yes"/"No", "Active"/"Inactive". */
function coerceActive(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (["0", "false", "n", "no", "inactive", "disabled", "off", "draft"].includes(s)) return false;
  return true; // "1", "true", "y", "yes", "active", "enabled", "on", anything else
}

const IMAGE_KEY_RE = /(image|img|photo|pic|thumb|picture)/i;
const NUMERIC_RE = /^\d+(\.\d+)?$/;

/**
 * Last-resort image finder: the owner's ERP keeps an image URL on every product
 * row, but the column name is unknown until the first live DESCRIBE. Scan the row
 * for any image-ish column holding a URL/path; URL-looking values win.
 * An explicit alias (Setting "erp_product_aliases") always overrides this.
 */
function autoDetectImage(raw: Record<string, unknown>): string {
  let fallback = "";
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (!s || s.length > 2048 || NUMERIC_RE.test(s)) continue;
    if (!IMAGE_KEY_RE.test(k)) continue;
    if (/^(https?:)?\/\//i.test(s) || s.startsWith("data:")) return s;
    if (!fallback) fallback = s;
  }
  return fallback;
}

/**
 * Last-resort active-flag finder: after the well-known columns, look for any
 * column named like a status/active flag whose VALUE looks like a flag
 * (0/1, y/n, yes/no, true/false, active/inactive, ...). Never matches dates,
 * free text or foreign keys. Returns undefined when nothing qualifies.
 */
function findActiveValue(raw: Record<string, unknown>): unknown {
  const direct = raw.isActive ?? raw.is_active ?? raw.active ?? raw.status ?? raw.productStatus ?? raw.product_status;
  if (direct !== undefined && direct !== null && direct !== "") return direct;
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) continue;
    if (!/status|active/i.test(k)) continue;
    if (typeof v === "number") { if (v === 0 || v === 1) return v; continue; }
    if (typeof v === "boolean") return v;
    const s = String(v).trim();
    if (!s || s.length > 20) continue;
    if (/^(0|1)$/.test(s) || /^(y|n|yes|no|true|false|active|inactive|enabled|disabled|on|off|live|draft)$/i.test(s)) return s;
  }
  return undefined;
}

const SKU_KEY_RE = /^(sku|item_?codes?|product_?codes?|items?_?codes?|ref_?nos?|part_?(no|number|code)s?|article_?(no|code)s?|items?_?ids?)$/i;
const NAME_KEY_RE = /^(names?|items?_?names?|products?_?names?|titles?)$/i;
const DESC_KEY_RE = /^(items?_?(desc|description)s?|products?_?(desc|description)s?|descriptions?)$/i;

/** Find the first column whose name matches one of the regexes (in priority order) with a usable short string value. */
function findValue(raw: Record<string, unknown>, regexes: RegExp[]): string {
  for (const re of regexes) {
    for (const [k, v] of Object.entries(raw)) {
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (!s || s.length > 300) continue;
      if (re.test(k)) return s;
    }
  }
  return "";
}

/** Accepts the ERP's product row shape (snake or camel, partial) and normalizes it. */
export function normalizeErpProduct(raw: Record<string, unknown>): NormalizedErpProduct | null {
  const sku = str(raw.sku ?? raw.SKU ?? raw.itemCode ?? raw.item_code ?? raw.productCode ?? raw.product_code) || findValue(raw, [SKU_KEY_RE]);
  const name = str(raw.name ?? raw.productName ?? raw.product_name ?? raw.itemName ?? raw.item_name) || findValue(raw, [NAME_KEY_RE, DESC_KEY_RE]);
  if (!sku || !name) return null;
  return {
    erpId: str(raw.id ?? raw.erpId ?? raw.item_id ?? raw.itemId),
    sku, name,
    category: str(raw.category ?? raw.categoryName ?? raw.category_name, "General"),
    brand: str(raw.brand ?? raw.brandName ?? raw.brand_name),
    company: str(raw.company ?? raw.companyName ?? raw.company_name),
    unit: str(raw.unit, "Pcs"),
    hsn: str(raw.hsnCode ?? raw.hsn ?? raw.hsn_code),
    gst: num(raw.gstRate ?? raw.gst ?? raw.gst_rate),
    purchaseCost: num(raw.purchaseCost ?? raw.purchase_cost),
    packQty: Math.max(1, Math.round(num(raw.packQty ?? raw.pack_qty, 1))),
    packPrice: num(raw.packPrice ?? raw.pack_price),
    packDiscountPct: num(raw.packDiscountPercent ?? raw.packDiscountPct ?? raw.pack_discount_pct),
    tier1: num(raw.tier1Distributor ?? raw.tier1 ?? raw.tier1_distributor),
    tier2: num(raw.tier2Wholesale ?? raw.tier2 ?? raw.tier2_wholesale),
    tier3: num(raw.tier3SemiWholesale ?? raw.tier3 ?? raw.tier3_semiwholesale),
    tier4: num(raw.tier4Retailer ?? raw.tier4 ?? raw.tier4_retailer),
    tier5: num(raw.tier5Mrp ?? raw.tier5 ?? raw.mrp ?? raw.tier5_mrp),
    stock: num(raw.stockQuantity ?? raw.stock ?? raw.stock_quantity),
    reserved: num(raw.reservedQty ?? raw.reserved ?? raw.reserved_qty),
    damaged: num(raw.damagedStock ?? raw.damaged ?? raw.damaged_stock),
    lowStockThreshold: Math.round(num(raw.lowStockThreshold ?? raw.low_stock_threshold, 10)),
    weightGrams: num(raw.weightGrams ?? raw.weight_grams),
    piecesPerBox: Math.round(num(raw.piecesPerBox ?? raw.pieces_per_box)),
    barcode: str(raw.barcode),
    image: str(raw.photoUrl ?? raw.image ?? raw.imageUrl ?? raw.photo_url ?? raw.image_url ?? raw.productImage ?? raw.product_image) || autoDetectImage(raw),
    active: coerceActive(findActiveValue(raw)),
  };
}

/**
 * Build the final image URL for the B2B site: absolute/http(s)/Cloudinary URLs
 * pass through untouched; relative paths get the configured ERP image base.
 */
export async function resolveErpImage(image: string): Promise<string> {
  const img = image.trim();
  if (!img) return "";
  if (/^(https?:)?\/\//i.test(img) || img.startsWith("data:")) return img;
  const base = await erpImageBase();
  return base ? `${base}/${img.replace(/^\/+/, "")}` : img;
}
