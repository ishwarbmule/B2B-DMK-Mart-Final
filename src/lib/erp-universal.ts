/**
 * DMK Universal Inventory API sync — the ERP's official REST layer at
 * https://dmkmarterp.in/api/universal/v1 (replaces direct MySQL reads for live sync).
 *
 * CONTRACT (owner-provided):
 *   AUTH    — every request sends header X-API-Key: <api key>
 *   VERIFY  — GET  /api/universal/v1/health                     → "UP"
 *   PULL    — GET  /api/universal/v1/products?limit=200&offset=0 (paginate via hasMore)
 *             delta: same endpoint + ?since=<ISO>
 *             Response shape { ok, data } — ONLY the fields the ERP admin ticked appear:
 *               sku, name, isActive, updatedAt   always present
 *               pricing.mrp / pricing.costPrice / pricing.deliveryRate  only when ticked
 *               stock.availableStock = what buyers can order
 *   PUSH    — POST /api/dmk-inventory/sync (our webhook) with header
 *             X-DMK-Signature: sha256=HMAC-SHA256(rawRequestBody, PUSH SECRET)
 *             Payload { type:"CATALOG_DELTA", products:[…] } — upsert by SKU, 200 in <5s
 *   RULES   — sku unique locally · costPrice NEVER public · missing field = not shared,
 *             hide it · pushes failing → fall back to ?since= delta pulls (daily cron)
 *
 * Storage:
 *   Setting table keys: erp_universal_url / erp_universal_api_key / erp_universal_push_secret
 *   (env ERP_UNIVERSAL_* wins, mirroring the ERP_MYSQL_* pattern), erp_universal_watermark
 *   (ISO delta cursor — max erpUpdatedAt ever applied, in the ERP's clock domain),
 *   erp_universal_last_push_at / _last_full_at / _last_delta_at, erp_universal_daily_enabled.
 *   ErpProductMirror = the SKU-keyed mirror of exactly what the ERP shares; the catalog
 *   Product table is projected from it (shared fields only, admin-created rows protected).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { getSetting, setSetting, logSyncEvent } from "@/lib/settings";

// ───────── config ─────────

export type UniversalConfig = { url: string; apiKey: string; pushSecret: string; configured: boolean };

const URL_KEY = "erp_universal_url";
const KEY_SETTING = "erp_universal_api_key";
const SECRET_SETTING = "erp_universal_push_secret";

export const DEFAULT_UNIVERSAL_URL = "https://dmkmarterp.in";

export async function getUniversalConfig(): Promise<UniversalConfig> {
  const [urlSetting, keySetting, secretSetting] = await Promise.all([
    getSetting(URL_KEY, ""),
    getSetting(KEY_SETTING, ""),
    getSetting(SECRET_SETTING, ""),
  ]);
  const url = (process.env.ERP_UNIVERSAL_URL || urlSetting || DEFAULT_UNIVERSAL_URL).trim().replace(/\/+$/, "");
  const apiKey = (process.env.ERP_UNIVERSAL_API_KEY || keySetting).trim();
  const pushSecret = (process.env.ERP_UNIVERSAL_PUSH_SECRET || secretSetting).trim();
  return { url, apiKey, pushSecret, configured: Boolean(apiKey) };
}

// ───────── signature verification (timing-safe) ─────────

/** sha256=HMAC-SHA256(rawRequestBody, pushSecret) — accepts the spec header form and a bare hex. */
export function verifyPushSignature(rawBody: string, signatureHeader: string, pushSecret: string): boolean {
  if (!pushSecret || !signatureHeader) return false;
  const provided = signatureHeader.trim().toLowerCase().replace(/^sha256\s*=\s*/, "");
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = createHmac("sha256", pushSecret).update(rawBody, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function signPayload(rawBody: string, pushSecret: string): string {
  return `sha256=${createHmac("sha256", pushSecret).update(rawBody, "utf8").digest("hex")}`;
}

// ───────── mirror table (idempotent — Hostinger MariaDB) ─────────

let mirrorTableEnsured = false;

/** CREATE TABLE IF NOT EXISTS — the established Hostinger deploy pattern (no manual prisma push).
 *  MySQL dialect only: the local sandbox runs the SQLite twin where prisma db push already
 *  created the table, so the DDL is skipped there. */
export async function ensureMirrorTable(force = false): Promise<void> {
  if (mirrorTableEnsured && !force) return;
  const dbUrl = (process.env.APP_DATABASE_URL || process.env.DATABASE_URL || "").toLowerCase();
  if (!dbUrl.startsWith("mysql")) {
    mirrorTableEnsured = true; // SQLite twin — table comes from prisma/schema.sqlite.prisma
    return;
  }
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ErpProductMirror\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`sku\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`mrp\` DOUBLE NULL,
      \`costPrice\` DOUBLE NULL,
      \`deliveryRate\` DOUBLE NULL,
      \`availableStock\` DOUBLE NULL,
      \`erpUpdatedAt\` DATETIME(3) NULL,
      \`lastSource\` VARCHAR(191) NOT NULL DEFAULT '',
      \`payloadJson\` TEXT NULL,
      \`lastSyncedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`ErpProductMirror_sku_key\` (\`sku\`),
      INDEX \`ErpProductMirror_isActive_idx\` (\`isActive\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  mirrorTableEnsured = true;
}

// ───────── HTTP client ─────────

const API_TIMEOUT_MS = 15000;

async function universalFetch(path: string, config: UniversalConfig): Promise<{ ok: boolean; httpStatus: number; body: string }> {
  const res = await fetch(`${config.url}${path}`, {
    headers: { "X-API-Key": config.apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    cache: "no-store",
  });
  return { ok: res.ok, httpStatus: res.status, body: await res.text() };
}

function extractJson(body: string): Record<string, unknown> | null {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type UniversalHealth = { configured: boolean; up: boolean; httpStatus: number; message: string; url: string };

/** VERIFY — GET /api/universal/v1/health → "UP" (tolerates JSON envelopes and plain text). */
export async function verifyUniversalHealth(config?: UniversalConfig): Promise<UniversalHealth> {
  const cfg = config ?? (await getUniversalConfig());
  const base: UniversalHealth = { configured: cfg.configured, up: false, httpStatus: 0, message: "", url: cfg.url };
  if (!cfg.configured) return { ...base, message: "API key not set — paste it in Inventory Sync settings" };
  try {
    const res = await universalFetch("/api/universal/v1/health", cfg);
    const body = (res.body || "").trim();
    const json = extractJson(body);
    // status may sit at top level, inside data, or be the literal body "UP"
    const candidates = [
      json?.status, json?.health, json?.state,
      (json?.data as Record<string, unknown> | undefined)?.status,
      (json?.data as Record<string, unknown> | undefined)?.health,
      body,
    ];
    const up = res.ok && candidates.some((c) => typeof c === "string" && c.trim().toUpperCase() === "UP");
    return {
      ...base,
      httpStatus: res.httpStatus,
      up,
      message: up ? "UP" : res.ok ? `Unexpected health payload: ${body.slice(0, 120)}` : `HTTP ${res.httpStatus}: ${body.slice(0, 120)}`,
    };
  } catch (e) {
    return { ...base, message: e instanceof Error ? e.message.slice(0, 200) : "Health check failed" };
  }
}

// ───────── payload parsing ─────────

export type ParsedUniversalProduct = {
  sku: string;
  name: string;
  isActive: boolean;
  erpUpdatedAt: Date | null;
  mrp: number | null; // null = ERP did not share (field hidden, never invented)
  costPrice: number | null; // admin-only — never exposed publicly
  deliveryRate: number | null;
  availableStock: number | null;
  raw: Record<string, unknown>;
};

/** a field counts as "shared" only when it is present, non-null and a finite number */
function sharedNumber(obj: Record<string, unknown> | undefined, ...keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function sharedText(obj: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

/** parse one universal product row — absent/unticked fields become null (hidden) */
export function parseUniversalProduct(raw: Record<string, unknown>): ParsedUniversalProduct | null {
  const sku = sharedText(raw, "sku", "SKU", "itemCode", "item_code", "productCode", "product_code");
  const name = sharedText(raw, "name", "productName", "product_name", "itemName", "item_name");
  if (!sku || !name) return null; // sku + name are the always-present contract fields

  const pricing = (raw.pricing ?? {}) as Record<string, unknown>;
  const stock = (raw.stock ?? {}) as Record<string, unknown>;

  const isActive = parseActiveFlag(raw.isActive ?? raw.is_active ?? raw.active ?? raw.status);

  let erpUpdatedAt: Date | null = null;
  const updatedRaw = raw.updatedAt ?? raw.updated_at ?? raw.lastUpdated ?? raw.last_updated;
  if (updatedRaw !== undefined && updatedRaw !== null && updatedRaw !== "") {
    const d = typeof updatedRaw === "number" ? new Date(updatedRaw) : new Date(String(updatedRaw));
    if (!Number.isNaN(d.getTime())) erpUpdatedAt = d;
  }

  return {
    sku,
    name,
    isActive,
    erpUpdatedAt,
    mrp: sharedNumber(pricing, "mrp") ?? sharedNumber(raw, "mrp"),
    costPrice: sharedNumber(pricing, "costPrice", "cost_price") ?? sharedNumber(raw, "costPrice", "cost_price"),
    deliveryRate: sharedNumber(pricing, "deliveryRate", "delivery_rate") ?? sharedNumber(raw, "deliveryRate", "delivery_rate"),
    availableStock: sharedNumber(stock, "availableStock", "available_stock") ?? sharedNumber(raw, "availableStock", "available_stock"),
    raw,
  };
}

/** active flag in any style (1/0, true/false, "Y"/"N", "Active"/"Inactive") — absent → true */
function parseActiveFlag(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  return !["0", "false", "n", "no", "inactive", "disabled", "off", "draft"].includes(s);
}

// ───────── warehouse + per-warehouse stock parsing (optional ERP endpoints) ─────────

export type UniversalWarehouse = {
  code: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  isActive: boolean;
  raw: Record<string, unknown>;
};

export type WarehouseStockRow = {
  warehouseCode: string;
  sku: string;
  qty: number;
  raw: Record<string, unknown>;
};

/** parse one universal warehouse row — code is the only always-present contract field */
export function parseUniversalWarehouse(raw: Record<string, unknown>): UniversalWarehouse | null {
  const code = sharedText(raw, "code", "warehouseCode", "warehouse_code", "whCode");
  if (!code) return null;
  return {
    code,
    name: sharedText(raw, "name", "warehouseName", "title"),
    city: sharedText(raw, "city"),
    address: sharedText(raw, "address"),
    phone: sharedText(raw, "phone"),
    isActive: parseActiveFlag(raw.isActive ?? raw.is_active ?? raw.active ?? raw.status),
    raw,
  };
}

/** parse one per-warehouse stock row — negative qty = upstream inconsistency, row skipped */
export function parseWarehouseStockRow(raw: Record<string, unknown>): WarehouseStockRow | null {
  const warehouseCode = sharedText(raw, "warehouseCode", "warehouse_code", "whCode", "wh_code", "code");
  const sku = sharedText(raw, "sku", "SKU", "itemCode", "item_code");
  if (!warehouseCode || !sku) return null;
  const qty = sharedNumber(raw, "qty", "quantity", "availableStock", "available_stock", "stock") ?? 0; // missing qty = zero stock
  if (qty < 0) return null;
  return { warehouseCode, sku, qty, raw };
}

// ───────── pull (paginated + delta) ─────────

export type UniversalPage = { products: ParsedUniversalProduct[]; hasMore: boolean; total: number | null; httpStatus: number };

/** GET /api/universal/v1/products?limit=&offset=[&since=] — response { ok, data } parsed defensively. */
export async function fetchUniversalProducts(opts: { limit?: number; offset?: number; since?: string; cfg?: UniversalConfig } = {}): Promise<UniversalPage> {
  const cfg = opts.cfg ?? (await getUniversalConfig());
  if (!cfg.configured) throw new Error("Universal API key not configured — save it in Admin → Inventory Sync");
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (opts.since) qs.set("since", opts.since);
  const res = await universalFetch(`/api/universal/v1/products?${qs.toString()}`, cfg);
  if (!res.ok) throw new Error(`Universal products pull failed — HTTP ${res.httpStatus}: ${res.body.slice(0, 200)}`);
  const json = extractJson(res.body);
  if (!json) throw new Error("Universal products pull returned non-JSON body");
  if (json.ok === false) throw new Error(`Universal API rejected the pull: ${String(json.error ?? json.message ?? "unknown error").slice(0, 200)}`);

  const data = (json.data ?? json) as Record<string, unknown>;
  const listRaw: unknown[] = Array.isArray(data) ? data : ((data.products ?? data.items ?? data.rows ?? []) as unknown[]);
  const products = listRaw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .map((r) => parseUniversalProduct(r))
    .filter((p): p is ParsedUniversalProduct => Boolean(p));
  const hasMoreField = data.hasMore ?? data.has_more ?? data.more;
  const hasMore = hasMoreField === undefined ? products.length >= limit : Boolean(hasMoreField);
  const total = typeof data.total === "number" ? data.total : typeof data.count === "number" ? data.count : null;
  return { products, hasMore, total, httpStatus: res.httpStatus };
}

// ───────── warehouse + stock pull (optional endpoints — tolerant of absence) ─────────

export type UniversalWarehousesPage = { available: boolean; warehouses: UniversalWarehouse[]; note: string; httpStatus: number };

/**
 * GET /api/universal/v1/warehouses — OPTIONAL: an ERP that has not shipped the endpoint
 * yet answers 404. Any non-OK answer degrades to available:false (never throws); network
 * errors propagate so the caller's try/catch can note them.
 */
export async function fetchUniversalWarehouses(cfg?: UniversalConfig): Promise<UniversalWarehousesPage> {
  const config = cfg ?? (await getUniversalConfig());
  if (!config.configured) throw new Error("Universal API key not configured — save it in Admin → Inventory Sync");
  const res = await universalFetch("/api/universal/v1/warehouses", config);
  if (!res.ok) {
    return { available: false, warehouses: [], note: `ERP does not expose /warehouses (HTTP ${res.httpStatus})`, httpStatus: res.httpStatus };
  }
  const json = extractJson(res.body);
  if (!json || json.ok === false) {
    return { available: false, warehouses: [], note: `Unexpected /warehouses payload: ${(json ? res.body : "non-JSON body").slice(0, 120)}`, httpStatus: res.httpStatus };
  }
  const data = json.data as Record<string, unknown> | unknown[] | undefined;
  const listRaw: unknown[] =
    data && !Array.isArray(data) && Array.isArray((data as Record<string, unknown>).warehouses)
      ? ((data as Record<string, unknown>).warehouses as unknown[])
      : Array.isArray(json.warehouses)
        ? (json.warehouses as unknown[])
        : Array.isArray(data)
          ? (data as unknown[])
          : [];
  const warehouses = listRaw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .map((r) => parseUniversalWarehouse(r))
    .filter((w): w is UniversalWarehouse => Boolean(w));
  return { available: true, warehouses, note: "", httpStatus: res.httpStatus };
}

export type UniversalStockPage = { available: boolean; rows: WarehouseStockRow[]; hasMore: boolean; total: number | null; note: string; httpStatus: number };

/**
 * GET /api/universal/v1/warehouse-stock?limit=&offset= — OPTIONAL per-warehouse stock
 * feed with the same tolerant semantics as /warehouses (404 / non-OK → available:false).
 */
export async function fetchUniversalWarehouseStock(limit = 500, offset = 0, cfg?: UniversalConfig): Promise<UniversalStockPage> {
  const config = cfg ?? (await getUniversalConfig());
  if (!config.configured) throw new Error("Universal API key not configured — save it in Admin → Inventory Sync");
  const lim = Math.min(Math.max(limit, 1), 1000);
  const off = Math.max(offset, 0);
  const qs = new URLSearchParams({ limit: String(lim), offset: String(off) });
  const res = await universalFetch(`/api/universal/v1/warehouse-stock?${qs.toString()}`, config);
  if (!res.ok) {
    return { available: false, rows: [], hasMore: false, total: null, note: `ERP does not expose /warehouse-stock (HTTP ${res.httpStatus})`, httpStatus: res.httpStatus };
  }
  const json = extractJson(res.body);
  if (!json || json.ok === false) {
    return { available: false, rows: [], hasMore: false, total: null, note: `Unexpected /warehouse-stock payload: ${(json ? res.body : "non-JSON body").slice(0, 120)}`, httpStatus: res.httpStatus };
  }
  const data = (json.data ?? json) as Record<string, unknown>;
  const listRaw: unknown[] = Array.isArray(data) ? data : ((data.rows ?? data.items ?? data.stock ?? []) as unknown[]);
  const rows = listRaw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .map((r) => parseWarehouseStockRow(r))
    .filter((r): r is WarehouseStockRow => Boolean(r));
  const hasMoreField = data.hasMore ?? data.has_more;
  const hasMore = hasMoreField === undefined ? rows.length >= lim : Boolean(hasMoreField);
  const total = typeof data.total === "number" ? data.total : typeof data.count === "number" ? data.count : null;
  return { available: true, rows, hasMore, total, note: "", httpStatus: res.httpStatus };
}

// ───────── apply (mirror upsert + catalog projection) ─────────

export type ApplyResult = { seen: number; created: number; updated: number; skipped: number; mirrorUpdated: number; errors: string[] };

const round2 = (n: number) => Math.round(n * 100) / 100;
const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "item";

const sameNum = (a: number | null, b: number | null) => (a === null ? b === null : b !== null && round2(a) === round2(b));

/** fallback category chain (universal payload carries no categories) */
async function fallbackCategoryIds(): Promise<{ topId: string; midId: string; endId: string }> {
  const [tops, mids, ends] = await Promise.all([
    db.topCategory.findMany({ select: { id: true, name: true } }),
    db.midCategory.findMany({ select: { id: true, name: true, topId: true } }),
    db.endCategory.findMany({ select: { id: true, name: true, midId: true } }),
  ]);
  let top = tops.find((t) => t.name === "HouseHold Unbreakable") ?? tops.find((t) => t.name === "General") ?? tops[0];
  if (!top) top = await db.topCategory.create({ data: { name: "General" } });
  let mid = mids.find((m) => m.name === "General" && m.topId === top.id) ?? mids.find((m) => m.topId === top.id) ?? mids[0];
  if (!mid) mid = await db.midCategory.create({ data: { name: "General", topId: top.id } });
  let end = ends.find((e) => e.name === "General" && e.midId === mid.id) ?? ends.find((e) => e.midId === mid.id) ?? ends[0];
  if (!end) end = await db.endCategory.create({ data: { name: "General", midId: mid.id } });
  return { topId: top.id, midId: mid.id, endId: end.id };
}

async function mapWithConcurrency<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map((it) => fn(it).catch(() => { /* counted by caller */ })));
  }
}

/**
 * Upsert universal products: mirror row = EXACTLY what the latest payload shares
 * (absent field → null = hidden), then project into the catalog Product table keyed
 * by SKU. ERP-controlled products get un-shared fields zeroed (hidden); admin-created
 * rows (syncSource != "ERP") are only touched on shared fields. costPrice lands in
 * Product.purchaseCost which has never been exposed by any public API.
 */
export async function applyUniversalProducts(products: Record<string, unknown>[], source: "PUSH" | "PULL" | "DELTA"): Promise<ApplyResult> {
  const result: ApplyResult = { seen: products.length, created: 0, updated: 0, skipped: 0, mirrorUpdated: 0, errors: [] };
  const parsed = products.map((r) => parseUniversalProduct(r)).filter((p): p is ParsedUniversalProduct => Boolean(p));
  result.skipped = products.length - parsed.length;
  if (!parsed.length) return result;
  await ensureMirrorTable();

  const skus = [...new Set(parsed.map((p) => p.sku))];
  const now = new Date();
  const maxUpdated = parsed.reduce<Date | null>((acc, p) => (!p.erpUpdatedAt || (acc && acc >= p.erpUpdatedAt) ? acc : p.erpUpdatedAt), null);

  // ── 1. mirror upsert (diffed) ──
  const existingMirrors = await db.erpProductMirror.findMany({ where: { sku: { in: skus } } });
  const mirrorBySku = new Map(existingMirrors.map((m) => [m.sku, m]));
  const mirrorCreates: { sku: string; name: string; isActive: boolean; mrp: number | null; costPrice: number | null; deliveryRate: number | null; availableStock: number | null; erpUpdatedAt: Date | null; lastSource: string; payloadJson: string; lastSyncedAt: Date }[] = [];
  const mirrorUpdates: { sku: string; data: Record<string, unknown> }[] = [];

  for (const p of parsed) {
    const data = {
      name: p.name,
      isActive: p.isActive,
      mrp: p.mrp,
      costPrice: p.costPrice,
      deliveryRate: p.deliveryRate,
      availableStock: p.availableStock,
      erpUpdatedAt: p.erpUpdatedAt,
      lastSource: source,
      payloadJson: JSON.stringify(p.raw).slice(0, 8000),
      lastSyncedAt: now,
    };
    const existing = mirrorBySku.get(p.sku);
    if (!existing) {
      mirrorCreates.push({ sku: p.sku, ...data });
    } else if (
      existing.name !== p.name || existing.isActive !== p.isActive ||
      !sameNum(existing.mrp, p.mrp) || !sameNum(existing.costPrice, p.costPrice) ||
      !sameNum(existing.deliveryRate, p.deliveryRate) || !sameNum(existing.availableStock, p.availableStock) ||
      (existing.erpUpdatedAt?.getTime() ?? 0) !== (p.erpUpdatedAt?.getTime() ?? 0) || existing.lastSource !== source
    ) {
      mirrorUpdates.push({ sku: p.sku, data });
    }
  }
  if (mirrorCreates.length) {
    await db.erpProductMirror.createMany({ data: mirrorCreates }).catch(async () => {
      // createMany can fail on a duplicate race (push + pull overlap) — fall back to per-row upsert
      for (const row of mirrorCreates) await db.erpProductMirror.upsert({ where: { sku: row.sku }, create: row, update: { ...row } });
    });
  }
  await mapWithConcurrency(mirrorUpdates, 12, (u) => db.erpProductMirror.update({ where: { sku: u.sku }, data: u.data }));
  // touch EVERY sku seen on this payload (changed or not) — the chunked full sync's
  // finish step de-lists by "mirror.lastSyncedAt < run start", so unchanged rows must
  // be stamped too or they would be falsely deactivated
  await db.erpProductMirror.updateMany({ where: { sku: { in: skus } }, data: { lastSyncedAt: now } }).catch(() => {});
  result.mirrorUpdated = mirrorCreates.length + mirrorUpdates.length;

  // ── 2. catalog projection (Product, keyed by SKU) ──
  const existingProducts = await db.product.findMany({
    where: { sku: { in: skus } },
    select: { id: true, sku: true, name: true, active: true, activeSource: true, syncSource: true, mrp: true, purchaseCost: true, deliveryRate: true, stock: true },
  });
  const productBySku = new Map(existingProducts.map((p) => [p.sku, p]));

  const productUpdates: { sku: string; data: Record<string, unknown> }[] = [];
  const productCreates: { p: ParsedUniversalProduct }[] = [];

  for (const p of parsed) {
    const existing = productBySku.get(p.sku);
    if (existing) {
      const data: Record<string, unknown> = {};
      if (existing.name !== p.name) data.name = p.name;
      // Active flag — ERP pull controls it unless an admin manually toggled (activeSource="ADMIN")
      if (existing.activeSource !== "ADMIN" && existing.active !== p.isActive) {
        data.active = p.isActive;
        data.activeSource = "ERP";
      }
      const erpControlled = existing.syncSource === "ERP";
      // shared field → write; un-shared field → hide (0) on ERP-controlled rows only
      if (p.mrp !== null) { if (existing.mrp !== p.mrp) data.mrp = p.mrp; }
      else if (erpControlled && existing.mrp !== 0) data.mrp = 0;
      if (p.costPrice !== null) { if (existing.purchaseCost !== p.costPrice) data.purchaseCost = p.costPrice; }
      else if (erpControlled && existing.purchaseCost !== 0) data.purchaseCost = 0;
      if (p.deliveryRate !== null) { if (existing.deliveryRate !== p.deliveryRate) data.deliveryRate = p.deliveryRate; }
      else if (erpControlled && existing.deliveryRate !== 0) data.deliveryRate = 0;
      if (p.availableStock !== null) { const s = Math.round(p.availableStock); if (existing.stock !== s) data.stock = s; }
      else if (erpControlled && existing.stock !== 0) data.stock = 0;
      if (Object.keys(data).length) {
        data.syncSource = "ERP";
        data.lastSyncedAt = now;
        productUpdates.push({ sku: p.sku, data });
        result.updated++;
      }
    } else {
      productCreates.push({ p });
      result.created++;
    }
  }
  await mapWithConcurrency(productUpdates, 12, (u) => db.product.update({ where: { sku: u.sku }, data: u.data }));

  if (productCreates.length) {
    const fallback = await fallbackCategoryIds();
    // unique slug pre-flight: fetch collisions for the candidates we are about to create
    const candidates = productCreates.map(({ p }) => `${slugify(p.name)}-${p.sku.slice(-8).toLowerCase()}`);
    const taken = new Set(
      (await db.product.findMany({ where: { slug: { in: candidates } }, select: { slug: true } })).map((r) => r.slug)
    );
    const rows = productCreates.map(({ p }) => {
      let slug = `${slugify(p.name)}-${p.sku.slice(-8).toLowerCase()}`;
      if (taken.has(slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      taken.add(slug);
      const dealer = p.mrp ?? 0;
      return {
        sku: p.sku,
        slug,
        name: p.name,
        company: "",
        brandId: null,
        topId: fallback.topId,
        midId: fallback.midId,
        endId: fallback.endId,
        unit: "Pcs",
        packQty: 1,
        purchaseCost: p.costPrice ?? 0, // admin-only column — never rendered publicly
        dealerPrice: dealer,
        basePrice: dealer,
        mrp: p.mrp ?? 0,
        deliveryRate: p.deliveryRate ?? 0,
        stock: Math.round(p.availableStock ?? 0),
        image: "",
        gallery: "[]",
        description: `${p.name} — synced live from DMK Mart inventory.`,
        seoTitle: `${p.name} | DMK Mart B2B`,
        seoDesc: `Buy ${p.name} at wholesale price on DMK Mart.`,
        keywords: `${p.name}, wholesale`,
        rating: 4.5,
        reviewCount: 10,
        active: p.isActive,
        activeSource: "ERP",
        syncSource: "ERP",
        lastSyncedAt: now,
      };
    });
    await db.product.createMany({ data: rows }).catch(async () => {
      for (const row of rows) await db.product.create({ data: row as never }).catch(() => { result.errors.push(`${row.sku}: create failed`); });
    });
  }

  // ── 3. delta watermark advance (ERP clock domain — max erpUpdatedAt applied) ──
  if (maxUpdated) await advanceWatermark(maxUpdated);
  return result;
}

// ───────── warehouse + stock apply ─────────

export type ApplyWarehousesResult = { seen: number; created: number; updated: number; deactivated: number };

/**
 * Mirror ERP warehouses into the Warehouse table (source="ERP"). Warehouse.code is not a
 * unique index (admin rows may carry ""), so the upsert-by-code is done manually —
 * identical semantics. A LOCAL row sharing an ERP code is claimed by the mirror; rows
 * the admin created without an ERP code are never touched. FULL mode deactivates ERP
 * warehouses missing from the pull — DELTA never deactivates (deltas are partial).
 */
export async function applyUniversalWarehouses(warehouses: UniversalWarehouse[], mode: "FULL" | "DELTA"): Promise<ApplyWarehousesResult> {
  const result: ApplyWarehousesResult = { seen: warehouses.length, created: 0, updated: 0, deactivated: 0 };
  const usable = warehouses.filter((w) => Boolean(w.code)); // parse already dropped code-less rows — defensive
  if (!usable.length) return result;
  const codes = usable.map((w) => w.code);
  // ONE findMany instead of a findFirst per warehouse — sequential round-trips to the
  // remote MySQL were a large share of the 504 gateway timeout
  const existing = await db.warehouse.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  const idByCode = new Map(existing.map((w) => [w.code, w.id] as const));
  for (const w of usable) {
    const data = { name: w.name, city: w.city, address: w.address, phone: w.phone, active: w.isActive, source: "ERP" };
    const id = idByCode.get(w.code);
    if (id) {
      await db.warehouse.update({ where: { id }, data });
      result.updated++;
    } else {
      const created = await db.warehouse.create({ data: { code: w.code, ...data } });
      idByCode.set(w.code, created.id);
      result.created++;
    }
  }
  if (mode === "FULL") {
    const gone = await db.warehouse.updateMany({ where: { source: "ERP", code: { notIn: codes } }, data: { active: false } });
    result.deactivated = gone.count;
  }
  return result;
}

export type ApplyStockResult = { seen: number; upserted: number; skipped: number; removed: number };

/**
 * Apply per-warehouse stock rows into WarehouseStock (upsert by warehouse+product).
 * LOCAL warehouses whose code matches an ERP row participate too (admin-created godowns
 * can be fed by the ERP by code). On a FULL pull, every ERP warehouse present in the
 * pull loses stock rows for SKUs the ERP no longer shares there (stale-row cleanup);
 * LOCAL warehouses are never cleaned.
 */
export async function applyUniversalWarehouseStock(rows: WarehouseStockRow[], full: boolean): Promise<ApplyStockResult> {
  const result: ApplyStockResult = { seen: rows.length, upserted: 0, skipped: 0, removed: 0 };
  if (!rows.length) return result;

  const warehouseCodes = [...new Set(rows.map((r) => r.warehouseCode))];
  const skus = [...new Set(rows.map((r) => r.sku))];
  const [warehouses, products] = await Promise.all([
    db.warehouse.findMany({ where: { code: { in: warehouseCodes } }, select: { id: true, code: true, source: true } }),
    db.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } }),
  ]);
  const warehouseByCode = new Map(warehouses.map((w) => [w.code, w]));
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  // group by warehouse — drives the upserts and is reused for the FULL stale cleanup.
  // De-duplicate warehouse+sku pairs (last row wins — pagination could overlap).
  const seenByWarehouse = new Map<string, Set<string>>(); // warehouse code → SKUs seen in this pull
  const pairByWarehouseProduct = new Map<string, { warehouseId: string; productId: string; qty: number }>();
  for (const row of rows) {
    const warehouse = warehouseByCode.get(row.warehouseCode);
    const product = productBySku.get(row.sku);
    if (!warehouse || !product) {
      result.skipped++; // unknown warehouse or SKU — the product pull creates products first, so rare
      continue;
    }
    let seen = seenByWarehouse.get(row.warehouseCode);
    if (!seen) {
      seen = new Set();
      seenByWarehouse.set(row.warehouseCode, seen);
    }
    seen.add(row.sku);
    pairByWarehouseProduct.set(`${warehouse.id}:${product.id}`, { warehouseId: warehouse.id, productId: product.id, qty: Math.round(row.qty) });
  }
  const pairs = [...pairByWarehouseProduct.values()];
  if (!pairs.length) return result;

  // ── batched upsert — the 504 killer was a sequential db.warehouseStock.upsert PER ROW
  // against the remote MySQL (hundreds of ~150ms round-trips per page). Now: one
  // findMany to split creates/updates, one createMany for the new rows, concurrent
  // update chunks for the rest. (@updatedAt stamps every touched row, which the
  // chunked-FULL stale cleanup relies on: updatedAt < run start = row absent upstream.)
  const whIds = [...new Set(pairs.map((p) => p.warehouseId))];
  const productIds = [...new Set(pairs.map((p) => p.productId))];
  const existingRows = await db.warehouseStock.findMany({
    where: { warehouseId: { in: whIds }, productId: { in: productIds } },
    select: { warehouseId: true, productId: true },
  });
  const existingKeys = new Set(existingRows.map((e) => `${e.warehouseId}:${e.productId}`));
  const creates = pairs.filter((p) => !existingKeys.has(`${p.warehouseId}:${p.productId}`));
  const updates = pairs.filter((p) => existingKeys.has(`${p.warehouseId}:${p.productId}`));

  for (let i = 0; i < creates.length; i += 500) {
    const chunk = creates.slice(i, i + 500);
    await db.warehouseStock.createMany({ data: chunk }).catch(async () => {
      // duplicate race (webhook push + pull step overlap) → per-row upsert fallback
      for (const p of chunk) {
        await db.warehouseStock.upsert({
          where: { warehouseId_productId: { warehouseId: p.warehouseId, productId: p.productId } },
          create: p,
          update: { qty: p.qty },
        }).catch(() => {});
      }
    });
  }
  for (let i = 0; i < updates.length; i += 25) {
    await Promise.all(
      updates.slice(i, i + 25).map((p) =>
        db.warehouseStock.update({
          where: { warehouseId_productId: { warehouseId: p.warehouseId, productId: p.productId } },
          data: { qty: p.qty },
        }).catch(() => { /* row vanished mid-run (cleanup race) — next sync fixes it */ })
      )
    );
  }
  result.upserted = creates.length + updates.length;

  if (full) {
    for (const [code, seenSkus] of seenByWarehouse) {
      const warehouse = warehouseByCode.get(code);
      if (!warehouse || warehouse.source !== "ERP") continue; // LOCAL rows are admin territory
      const productIdsForWarehouse = [...seenSkus]
        .map((sku) => productBySku.get(sku)?.id)
        .filter((id): id is string => Boolean(id));
      const stale = await db.warehouseStock.deleteMany({
        where: { warehouseId: warehouse.id, productId: { notIn: productIdsForWarehouse } },
      });
      result.removed += stale.count;
    }
  }
  return result;
}

/**
 * Stale-row cleanup for the CHUNKED full sync — the pull spans many requests so no
 * single request ever sees the complete SKU set. Timestamp rule instead: every row the
 * ERP shared was upserted during the run (updatedAt >= run start); rows on ERP-source
 * warehouses whose updatedAt predates the run start were absent from the whole pull.
 * LOCAL warehouses are never touched. Runs once in the finish step.
 */
export async function cleanupStaleWarehouseStock(runStartedAt: Date): Promise<number> {
  const erpWarehouses = await db.warehouse.findMany({ where: { source: "ERP" }, select: { id: true } });
  if (!erpWarehouses.length) return 0;
  const stale = await db.warehouseStock.deleteMany({
    where: { warehouseId: { in: erpWarehouses.map((w) => w.id) }, updatedAt: { lt: runStartedAt } },
  });
  return stale.count;
}

/**
 * De-listing for the CHUNKED full sync — same timestamp rule as the stock cleanup:
 * a mirror row whose lastSyncedAt predates the run start was never seen in the whole
 * pull, i.e. the SKU vanished upstream. applyUniversalProducts touches lastSyncedAt
 * for EVERY seen SKU (changed or not) via a bulk updateMany, so unchanged rows are
 * safe. Admin-pinned and admin-created products are never deactivated.
 */
export async function delistVanishedProducts(runStartedAt: Date): Promise<number> {
  // 1) mirror rule: a mirror row whose lastSyncedAt predates the run start was never
  //    seen in the whole pull, i.e. the SKU vanished upstream. applyUniversalProducts
  //    stamps lastSyncedAt for EVERY seen SKU (changed or not), so unchanged rows are safe.
  const staleMirror = await db.erpProductMirror.findMany({ where: { lastSyncedAt: { lt: runStartedAt } }, select: { sku: true } });
  // 2) catalog orphans: ERP-sourced active products with NO mirror row at all (legacy
  //    rows from the retired MySQL integration) — the mirror rule can never see them.
  const catalogErp = await db.product.findMany({
    where: { syncSource: "ERP", active: true, activeSource: { not: "ADMIN" } },
    select: { sku: true },
  });
  const mirrorSkus = new Set((await db.erpProductMirror.findMany({ select: { sku: true } })).map((r) => r.sku));
  const candidates = new Set<string>([
    ...staleMirror.map((m) => m.sku),
    ...catalogErp.filter((p) => !mirrorSkus.has(p.sku)).map((p) => p.sku),
  ]);
  const staleSkus = [...candidates];
  let delisted = 0;
  for (let i = 0; i < staleSkus.length; i += 500) {
    const gone = await db.product.updateMany({
      where: { sku: { in: staleSkus.slice(i, i + 500) }, syncSource: "ERP", active: true, activeSource: { not: "ADMIN" } },
      data: { active: false, activeSource: "ERP", lastSyncedAt: new Date() },
    });
    delisted += gone.count;
  }
  return delisted;
}

// ───────── watermark + sync runs ─────────

async function advanceWatermark(candidate: Date): Promise<void> {
  const current = await getSetting("erp_universal_watermark", "");
  const currentMs = current ? new Date(current).getTime() : 0;
  if (Number.isNaN(currentMs) || candidate.getTime() > currentMs) {
    await setSetting("erp_universal_watermark", candidate.toISOString());
  }
}

export type SyncRunResult = {
  mode: "FULL" | "DELTA";
  pages: number;
  seen: number;
  created: number;
  updated: number;
  skipped: number;
  delisted: number;
  warehouses: { available: boolean; seen: number; created: number; updated: number; deactivated: number; notes: string[] };
  stock: { available: boolean; seen: number; upserted: number; skipped: number; removed: number };
  durationMs: number;
  watermark: string;
};

const MAX_PAGES = 100; // 100 × 200 = 20k products hard cap per run

/**
 * FULL  — offset pagination from 0 until hasMore=false; SKUs of ERP-controlled
 *         products missing from a complete pull are de-listed (deleted upstream).
 * DELTA — ?since=<watermark>; no de-listing (deltas carry changes, not the full set).
 *         Without a watermark DELTA promotes itself to FULL (first run).
 */
export async function runUniversalSync(mode: "FULL" | "DELTA"): Promise<SyncRunResult> {
  const started = Date.now();
  await ensureMirrorTable();
  const cfg = await getUniversalConfig();
  if (!cfg.configured) throw new Error("Universal API key not configured — save it in Admin → Inventory Sync");
  let effectiveMode = mode;
  if (mode === "DELTA" && !(await getSetting("erp_universal_watermark", ""))) effectiveMode = "FULL";

  const since = effectiveMode === "DELTA" ? await getSetting("erp_universal_watermark", "") : undefined;
  const totals = { pages: 0, seen: 0, created: 0, updated: 0, skipped: 0, errors: [] as string[] };
  const allSkus: string[] = [];

  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchUniversalProducts({ limit: 200, offset, since, cfg });
    totals.pages++;
    totals.seen += res.products.length;
    allSkus.push(...res.products.map((p) => p.sku));
    if (res.products.length) {
      const applied = await applyUniversalProducts(res.products.map((p) => p.raw), effectiveMode === "DELTA" ? "DELTA" : "PULL");
      totals.created += applied.created;
      totals.updated += applied.updated;
      totals.skipped += applied.skipped;
      totals.errors.push(...applied.errors);
    }
    if (!res.hasMore) break;
    offset += 200;
  }

  // de-list: full pull only — ERP-controlled products absent from the complete set
  let delisted = 0;
  if (effectiveMode === "FULL" && allSkus.length) {
    const candidates = await db.product.findMany({
      where: { syncSource: "ERP", active: true, activeSource: { not: "ADMIN" } },
      select: { id: true, sku: true },
    });
    const erpSet = new Set(allSkus);
    const gone = candidates.filter((p) => !erpSet.has(p.sku));
    if (gone.length) {
      await mapWithConcurrency(gone, 12, (p) => db.product.update({ where: { id: p.id }, data: { active: false, activeSource: "ERP", lastSyncedAt: new Date() } }));
      delisted = gone.length;
    }
  }

  // ── warehouses + per-warehouse stock — optional endpoints, never fail the run ──
  const warehouses: SyncRunResult["warehouses"] = { available: false, seen: 0, created: 0, updated: 0, deactivated: 0, notes: [] };
  const stock: SyncRunResult["stock"] = { available: false, seen: 0, upserted: 0, skipped: 0, removed: 0 };
  try {
    const wres = await fetchUniversalWarehouses(cfg);
    warehouses.available = wres.available;
    if (!wres.available) warehouses.notes.push(wres.note);
    else if (wres.warehouses.length) {
      const wapp = await applyUniversalWarehouses(wres.warehouses, effectiveMode);
      warehouses.seen = wapp.seen;
      warehouses.created = wapp.created;
      warehouses.updated = wapp.updated;
      warehouses.deactivated = wapp.deactivated;
    }
  } catch (e) {
    warehouses.available = false;
    warehouses.notes.push((e instanceof Error ? e.message : String(e)).slice(0, 200));
  }
  try {
    const collected: WarehouseStockRow[] = [];
    let unavailable = "";
    let completed = false;
    let offset = 0;
    for (let page = 0; page < 50; page++) { // 50 × 500 = 25k stock rows hard cap per run
      const sres = await fetchUniversalWarehouseStock(500, offset, cfg);
      if (!sres.available) {
        unavailable = sres.note;
        break;
      }
      collected.push(...sres.rows);
      if (!sres.hasMore) {
        completed = true;
        break;
      }
      offset += 500;
    }
    stock.available = !unavailable;
    if (unavailable) warehouses.notes.push(unavailable);
    if (stock.available && collected.length) {
      // stale-row cleanup only after a COMPLETED pull — a partial pull must never
      // delete stock rows for SKUs it never saw (cap reached → upsert-only)
      const sapp = await applyUniversalWarehouseStock(collected, effectiveMode === "FULL" && completed);
      stock.seen = sapp.seen;
      stock.upserted = sapp.upserted;
      stock.skipped = sapp.skipped;
      stock.removed = sapp.removed;
    }
  } catch (e) {
    stock.available = false;
    warehouses.notes.push((e instanceof Error ? e.message : String(e)).slice(0, 200));
  }

  const watermark = await getSetting("erp_universal_watermark", "");
  const durationMs = Date.now() - started;
  await setSetting(effectiveMode === "FULL" ? "erp_universal_last_full_at" : "erp_universal_last_delta_at", new Date().toISOString());
  return {
    mode: effectiveMode,
    pages: totals.pages,
    seen: totals.seen,
    created: totals.created,
    updated: totals.updated,
    skipped: totals.skipped,
    delisted,
    warehouses,
    stock,
    durationMs,
    watermark,
  };
}

/** Last successful webhook receipt time (ISO) — used to prove the push path is alive. */
export async function getLastPushAt(): Promise<string> {
  return getSetting("erp_universal_last_push_at", "");
}

// ───────── CHUNKED full sync — the 504 fix ─────────
// The one-shot full re-sync could not fit inside a serverless function window: pages of
// remote ERP HTTP + per-row work against the remote MySQL ran minutes long, so Vercel
// killed the invocation and the admin browser saw 504. The chunked protocol performs
// ONE page of work per request and persists a cursor (Setting erp_sync_full_cursor);
// the admin UI loops until done:true. An interrupted run resumes exactly where it
// stopped — no duplicate work, no lost progress, no gateway timeout.

const CURSOR_KEY = "erp_sync_full_cursor";

export type FullSyncCursor = {
  v: 1;
  phase: "products" | "stock";
  offset: number;
  startedAt: string; // run start — timestamp anchor for de-list / stale-stock cleanup
  total: number | null;
  totals: { pages: number; seen: number; created: number; updated: number; skipped: number };
  ms: number; // accumulated work time across all steps
  warehouses: { available: boolean; seen: number; created: number; updated: number; deactivated: number } | null;
  stock: { available: boolean; seen: number; upserted: number; skipped: number } | null;
  notes: string[];
};

export type FullSyncStepResult = {
  done: boolean;
  phase: string;
  pages: number;
  total: number | null;
  productsSeen: number;
  stockSeen: number;
  created: number;
  updated: number;
  summary?: {
    pages: number;
    seen: number;
    created: number;
    updated: number;
    skipped: number;
    delisted: number;
    warehouses: { available: boolean; seen: number; created: number; updated: number; deactivated: number; notes: string[] } | null;
    stock: { available: boolean; seen: number; upserted: number; skipped: number; removed: number } | null;
    notes: string[];
    durationMs: number;
  };
};

async function readCursor(): Promise<FullSyncCursor | null> {
  const raw = await getSetting(CURSOR_KEY, "");
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as FullSyncCursor;
    return c && c.v === 1 && (c.phase === "products" || c.phase === "stock") ? c : null;
  } catch {
    return null;
  }
}

async function writeCursor(cursor: FullSyncCursor): Promise<void> {
  await setSetting(CURSOR_KEY, JSON.stringify(cursor));
}

export async function clearFullSyncCursor(): Promise<void> {
  await setSetting(CURSOR_KEY, "");
}

/** Cursor state for the admin UI ("a full sync is in progress — press to resume"). */
export async function getFullSyncCursorState(): Promise<{ active: boolean; phase: string; productsSeen: number; stockSeen: number; total: number | null; startedAt: string } | null> {
  const c = await readCursor();
  if (!c) return null;
  return { active: true, phase: c.phase, productsSeen: c.totals.seen, stockSeen: c.stock?.seen ?? 0, total: c.total, startedAt: c.startedAt };
}

const PRODUCTS_PER_STEP = 200;
const STOCK_PER_STEP = 500;

/**
 * Advance the chunked full sync by exactly one unit of work:
 *   products phase → one 200-product page (mirror + catalog projection)
 *   → on the last page: warehouse mirror (one cheap request) → stock phase
 *   stock phase → one 500-row stock page (upsert-only, batched)
 *   → on the last page: FINISH (de-list + stale stock cleanup + timestamps + history)
 * Throws only on hard failures (API not configured, ERP pull HTTP error) — the cursor
 * stays put so the next press resumes the same page.
 */
export async function runFullSyncStep(reset = false): Promise<FullSyncStepResult> {
  const stepStarted = Date.now();
  await ensureMirrorTable();
  let cursor = reset ? null : await readCursor();
  if (!cursor) {
    cursor = {
      v: 1,
      phase: "products",
      offset: 0,
      startedAt: new Date().toISOString(),
      total: null,
      totals: { pages: 0, seen: 0, created: 0, updated: 0, skipped: 0 },
      ms: 0,
      warehouses: null,
      stock: null,
      notes: [],
    };
  }
  const cfg = await getUniversalConfig();
  if (!cfg.configured) throw new Error("Universal API key not configured — save it in Admin → Inventory Sync");

  if (cursor.phase === "products") {
    const res = await fetchUniversalProducts({ limit: PRODUCTS_PER_STEP, offset: cursor.offset, cfg });
    cursor.totals.pages++;
    cursor.totals.seen += res.products.length;
    if (cursor.total === null && typeof res.total === "number") cursor.total = res.total;
    if (res.products.length) {
      const applied = await applyUniversalProducts(res.products.map((p) => p.raw), "PULL");
      cursor.totals.created += applied.created;
      cursor.totals.updated += applied.updated;
      cursor.totals.skipped += applied.skipped;
    }
    cursor.offset += PRODUCTS_PER_STEP;
    if (!res.hasMore) {
      // products complete → mirror ERP warehouses once (single cheap request) → stock
      try {
        const wres = await fetchUniversalWarehouses(cfg);
        if (!wres.available) cursor.notes.push(wres.note);
        else {
          const wapp = await applyUniversalWarehouses(wres.warehouses, "FULL");
          cursor.warehouses = { available: true, seen: wapp.seen, created: wapp.created, updated: wapp.updated, deactivated: wapp.deactivated };
        }
      } catch (e) {
        cursor.warehouses = { available: false, seen: 0, created: 0, updated: 0, deactivated: 0 };
        cursor.notes.push((e instanceof Error ? e.message : String(e)).slice(0, 200));
      }
      cursor.phase = "stock";
      cursor.offset = 0;
    }
    cursor.ms += Date.now() - stepStarted;
    await writeCursor(cursor);
    return { done: false, phase: "products", pages: cursor.totals.pages, total: cursor.total, productsSeen: cursor.totals.seen, stockSeen: 0, created: cursor.totals.created, updated: cursor.totals.updated };
  }

  // ── stock phase ──
  const sres = await fetchUniversalWarehouseStock(STOCK_PER_STEP, cursor.offset, cfg);
  if (!sres.available) {
    // ERP does not expose /warehouse-stock → note it and go straight to finish
    cursor.stock = { available: false, seen: 0, upserted: 0, skipped: 0 };
    cursor.notes.push(sres.note);
    cursor.ms += Date.now() - stepStarted;
    const summary = await finishFullSync(cursor);
    return { done: true, phase: "done", pages: cursor.totals.pages, total: cursor.total, productsSeen: cursor.totals.seen, stockSeen: 0, created: cursor.totals.created, updated: cursor.totals.updated, summary };
  }
  cursor.stock = cursor.stock ?? { available: true, seen: 0, upserted: 0, skipped: 0 };
  cursor.stock.available = true;
  cursor.stock.seen += sres.rows.length;
  if (sres.rows.length) {
    // upsert-only per page — stale-row cleanup happens ONCE in the finish step
    // (a per-page cleanup could never see the complete SKU set)
    const sapp = await applyUniversalWarehouseStock(sres.rows, false);
    cursor.stock.upserted += sapp.upserted;
    cursor.stock.skipped += sapp.skipped;
  }
  cursor.offset += STOCK_PER_STEP;

  if (!sres.hasMore) {
    cursor.ms += Date.now() - stepStarted;
    const summary = await finishFullSync(cursor);
    return { done: true, phase: "done", pages: cursor.totals.pages, total: cursor.total, productsSeen: cursor.totals.seen, stockSeen: cursor.stock.seen, created: cursor.totals.created, updated: cursor.totals.updated, summary };
  }
  cursor.ms += Date.now() - stepStarted;
  await writeCursor(cursor);
  return { done: false, phase: "stock", pages: cursor.totals.pages, total: cursor.total, productsSeen: cursor.totals.seen, stockSeen: cursor.stock.seen, created: cursor.totals.created, updated: cursor.totals.updated };
}

/**
 * Finish step of the chunked full sync — timestamp-rule cleanup (see the helper docs),
 * last_full_at stamp, sync-history entry, cursor release. Never persists the cursor
 * afterwards: a finished run must not resume.
 */
async function finishFullSync(cursor: FullSyncCursor): Promise<NonNullable<FullSyncStepResult["summary"]>> {
  const runStartedAt = new Date(cursor.startedAt);
  const notes = [...cursor.notes];

  // 1. de-list SKUs absent from the whole pull (mirror-timestamp rule + catalog orphans)
  let delisted = 0;
  try {
    delisted = await delistVanishedProducts(runStartedAt);
  } catch (e) {
    notes.push(`de-list check failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 150)}`);
  }

  // 2. stale per-warehouse stock rows on ERP warehouses (only when the stock feed ran)
  let removed = 0;
  if (cursor.stock?.available) {
    try {
      removed = await cleanupStaleWarehouseStock(runStartedAt);
    } catch (e) {
      notes.push(`stale stock cleanup failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 150)}`);
    }
  }

  // 3. timestamps + history — same message shape as the one-shot full sync
  await setSetting("erp_universal_last_full_at", new Date().toISOString());
  await logSyncEvent({
    direction: "PULL_ERP",
    action: "UNIVERSAL_FULL",
    status: "OK",
    message: `Chunked full re-sync: ${cursor.totals.pages} page(s) · seen ${cursor.totals.seen} · created ${cursor.totals.created} · updated ${cursor.totals.updated} · skipped ${cursor.totals.skipped} · de-listed ${delisted}${cursor.warehouses?.available ? ` · warehouses ${cursor.warehouses.created}+${cursor.warehouses.updated}${cursor.warehouses.deactivated ? ` (-${cursor.warehouses.deactivated})` : ""}` : " · warehouses: not exposed by ERP"}${cursor.stock?.available ? ` · stock ${cursor.stock.upserted} (stale removed ${removed})` : " · stock: not exposed by ERP"}`,
    seen: cursor.totals.seen,
    created: cursor.totals.created,
    updated: cursor.totals.updated,
    skipped: cursor.totals.skipped,
    durationMs: cursor.ms,
  });
  await clearFullSyncCursor();

  return {
    pages: cursor.totals.pages,
    seen: cursor.totals.seen,
    created: cursor.totals.created,
    updated: cursor.totals.updated,
    skipped: cursor.totals.skipped,
    delisted,
    // run-level notes ride on the warehouses object too — the admin UI renders
    // warehouses.notes under both the available and unavailable branches
    warehouses: cursor.warehouses ? { ...cursor.warehouses, notes } : null,
    stock: cursor.stock ? { ...cursor.stock, removed } : null,
    notes,
    durationMs: cursor.ms,
  };
}
