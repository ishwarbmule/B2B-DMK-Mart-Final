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
import { getSetting, setSetting } from "@/lib/erp";

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

  // active flag in any style (1/0, true/false, "Y"/"N", "Active"/"Inactive")
  let isActive = true;
  const activeRaw = raw.isActive ?? raw.is_active ?? raw.active ?? raw.status;
  if (activeRaw !== undefined && activeRaw !== null && activeRaw !== "") {
    if (typeof activeRaw === "boolean") isActive = activeRaw;
    else if (typeof activeRaw === "number") isActive = activeRaw !== 0;
    else {
      const s = String(activeRaw).trim().toLowerCase();
      isActive = !["0", "false", "n", "no", "inactive", "disabled", "off", "draft"].includes(s);
    }
  }

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

// ───────── pull (paginated + delta) ─────────

export type UniversalPage = { products: ParsedUniversalProduct[]; hasMore: boolean; total: number | null; httpStatus: number };

/** GET /api/universal/v1/products?limit=&offset=[&since=] — response { ok, data } parsed defensively. */
export async function fetchUniversalProducts(opts: { limit?: number; offset?: number; since?: string } = {}): Promise<UniversalPage> {
  const cfg = await getUniversalConfig();
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
  let effectiveMode = mode;
  if (mode === "DELTA" && !(await getSetting("erp_universal_watermark", ""))) effectiveMode = "FULL";

  const since = effectiveMode === "DELTA" ? await getSetting("erp_universal_watermark", "") : undefined;
  const totals = { pages: 0, seen: 0, created: 0, updated: 0, skipped: 0, errors: [] as string[] };
  const allSkus: string[] = [];

  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchUniversalProducts({ limit: 200, offset, since });
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
    durationMs,
    watermark,
  };
}

/** Last successful webhook receipt time (ISO) — used to prove the push path is alive. */
export async function getLastPushAt(): Promise<string> {
  return getSetting("erp_universal_last_push_at", "");
}
