/**
 * Applies ERP product payloads into the local catalog mirror.
 * Used by: POST /api/inventory/webhook (ERP auto-push) and POST /api/admin/sync/pull (manual).
 * Only touches the B2B app database — the owner's ERP MySQL stays read-only.
 */
import { db } from "@/lib/db";
import type { NormalizedErpProduct } from "@/lib/erp";
import { normalizeErpProduct, resolveErpImage, pullErpProducts, getSetting, setSetting, erpProductsTable, assertReadOnly, assertIdentifier } from "@/lib/erp";

const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "item";

type CatCache = {
  tops: { id: string; name: string }[];
  mids: { id: string; name: string }[];
  ends: { id: string; name: string; midId: string }[];
  fallback: { topId: string; midId: string; endId: string };
};

const normCat = (s: string) => s.normalize("NFKD").replace(/\s+/g, " ").trim().toLowerCase();

async function loadCatCache(): Promise<CatCache> {
  const [tops, mids, ends] = await Promise.all([
    db.topCategory.findMany({ select: { id: true, name: true } }),
    db.midCategory.findMany({ select: { id: true, name: true, topId: true } }),
    db.endCategory.findMany({ select: { id: true, name: true, midId: true } }),
  ]);
  // Fresh/empty database safety: create the full fallback chain (Top → Mid → End).
  let fallbackTop = tops.find((t) => t.name === "HouseHold Unbreakable") ?? tops[0];
  if (!fallbackTop) fallbackTop = await db.topCategory.create({ data: { name: "General" } });
  let fallbackMid = mids.find((m) => m.name === "General" && m.topId === fallbackTop.id)
    ?? mids.find((m) => m.name === "General")
    ?? mids.find((m) => m.topId === fallbackTop.id)
    ?? mids[0];
  if (!fallbackMid) fallbackMid = await db.midCategory.create({ data: { name: "General", topId: fallbackTop.id } });
  let fallbackEnd = ends.find((e) => e.name === "General" && e.midId === fallbackMid.id)
    ?? ends.find((e) => e.name === "General")
    ?? ends.find((e) => e.midId === fallbackMid.id)
    ?? ends[0];
  if (!fallbackEnd) fallbackEnd = await db.endCategory.create({ data: { name: "General", midId: fallbackMid.id } });
  return { tops, mids, ends, fallback: { topId: fallbackTop.id, midId: fallbackMid.id, endId: fallbackEnd.id } };
}

/**
 * Company + category resolution — brand-free.
 * Company comes through verbatim (exact ERP/Excel text, no merging, no auto-creation of brands).
 * Categories match by normalized name against the existing tree only (never create new nodes
 * from sync data — unknown values are reported, not invented):
 *   - topCategory text → TopCategory
 *   - endCategory text → EndCategory (its mid follows); top falls back to the end's mid.top
 *   - legacy single `category` text still matches top/mid/end as before
 */
function resolveCategories(cache: CatCache, topText: string, endText: string, legacyText = "") {
  const top = topText ? cache.tops.find((x) => normCat(x.name) === normCat(topText)) : undefined;
  const end = endText ? cache.ends.find((x) => normCat(x.name) === normCat(endText)) : undefined;
  const legacy = legacyText
    ? {
        t: cache.tops.find((x) => normCat(x.name) === normCat(legacyText)),
        m: cache.mids.find((x) => normCat(x.name) === normCat(legacyText)),
        e: cache.ends.find((x) => normCat(x.name) === normCat(legacyText)),
      }
    : { t: undefined, m: undefined, e: undefined };

  const endMid = end ? cache.mids.find((m) => m.id === end.midId) : undefined;
  const topId = top?.id ?? endMid?.topId ?? legacy.t?.id ?? legacy.m?.topId ?? cache.fallback.topId;
  const midId = endMid?.id ?? legacy.m?.id ?? legacy.e?.midId ?? cache.fallback.midId;
  const endId = end?.id ?? legacy.e?.id ?? cache.fallback.endId;
  return { topId, midId, endId, matchedTop: Boolean(top), matchedEnd: Boolean(end) };
}

export type ApplyResult = { seen: number; created: number; updated: number; skipped: number; unmatchedCategories: string[]; errors: string[] };

export async function applyErpProducts(payload: unknown): Promise<ApplyResult> {
  const result: ApplyResult = { seen: 0, created: 0, updated: 0, skipped: 0, unmatchedCategories: [], errors: [] };

  // accept multiple payload shapes
  let list: Record<string, unknown>[] = [];
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p?.products)) list = p.products as Record<string, unknown>[];
  else if (Array.isArray(p?.data)) list = p.data as Record<string, unknown>[];
  else if (Array.isArray(p?.items)) list = p.items as Record<string, unknown>[];
  else if (Array.isArray(p)) list = p as Record<string, unknown>[];
  else if (p && typeof p === "object" && (p.sku || p.name)) list = [p];

  const normalized = list.map((r) => normalizeErpProduct(r)).filter((x): x is NormalizedErpProduct => Boolean(x));
  result.seen = list.length;
  result.skipped = list.length - normalized.length;
  if (!normalized.length) return result;

  const catCache = await loadCatCache();
  const unmatched = new Set<string>();

  for (const item of normalized) {
    try {
      const cats = resolveCategories(catCache, item.topCategory, item.endCategory);
      if ((item.topCategory || item.endCategory) && (!cats.matchedTop || !(item.endCategory ? cats.matchedEnd : true))) {
        unmatched.add([item.topCategory, item.endCategory].filter(Boolean).join(" > "));
      }
      const dealer = item.tier4 > 0 ? item.tier4 : item.tier5 > 0 ? item.tier5 : item.tier3;
      const mrp = item.tier5 > 0 ? item.tier5 : dealer;
      const base = item.tier3 > 0 ? item.tier3 : dealer;
      const data = {
        erpId: item.erpId,
        name: item.name,
        company: item.company,
        topId: cats.topId, midId: cats.midId, endId: cats.endId,
        unit: item.unit, packQty: item.packQty, piecesPerBox: item.piecesPerBox,
        purchaseCost: item.purchaseCost,
        dealerPrice: dealer, basePrice: base, mrp,
        tier1: item.tier1, tier2: item.tier2, tier3: item.tier3, tier4: item.tier4, tier5: item.tier5,
        deliveryRate: item.deliveryRate,
        stock: Math.round(item.stock), damagedStock: Math.round(item.damaged), reservedQty: Math.round(item.reserved),
        lowStockThreshold: item.lowStockThreshold,
        barcode: item.barcode, hsn: item.hsn, gst: item.gst, weightGrams: item.weightGrams,
        syncSource: "ERP",
        lastSyncedAt: new Date(),
      };

      const existing = item.erpId
        ? (await db.product.findFirst({ where: { OR: [{ erpId: item.erpId }, { sku: item.sku }] } }))
        : await db.product.findUnique({ where: { sku: item.sku } });

      if (existing) {
        const update: Record<string, unknown> = { ...data };
        if (item.image) update.image = await resolveErpImage(item.image); // keep local image if ERP sends none
        // Active flag — last writer wins: admin decisions are never silently reverted by a pull.
        // ERP active=true always re-lists an ERP-controlled product; ERP active=false de-lists it
        // UNLESS an admin manually toggled it (activeSource="ADMIN").
        if (existing.activeSource !== "ADMIN") {
          update.active = item.active;
          update.activeSource = "ERP";
        }
        await db.product.update({ where: { id: existing.id }, data: update });
        result.updated++;
      } else {
        let slug = slugify(`${item.company || "dmk"}-${item.name}`);
        if (await db.product.findUnique({ where: { slug } })) slug = `${slug}-${item.sku.slice(-6).toLowerCase()}`;
        const img = await resolveErpImage(item.image);
        await db.product.create({
          data: {
            ...data,
            sku: item.sku,
            slug,
            active: item.active,
            activeSource: "ERP",
            image: img,
            gallery: img ? JSON.stringify([img]) : "[]",
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
  result.unmatchedCategories = [...unmatched].slice(0, 40);
  return result;
}

export async function logSyncEvent(data: { direction: string; action: string; status?: string; message?: string; seen?: number; created?: number; updated?: number; skipped?: number; durationMs?: number }) {
  await db.syncEvent.create({
    data: {
      direction: data.direction,
      action: data.action,
      status: data.status ?? "OK",
      message: (data.message ?? "").slice(0, 500),
      productsSeen: data.seen ?? 0,
      created: data.created ?? 0,
      updated: data.updated ?? 0,
      skipped: data.skipped ?? 0,
      durationMs: data.durationMs ?? 0,
    },
  });
}

// ───────── PUSH (B2B → ERP) — LOCKED BY DEFAULT ─────────
//
// The owner's ERP MySQL is the live business core. Writes are blocked unless
// the Setting "erp_write_enabled" is explicitly "true" (Admin → Data Sync toggle).
// Even when unlocked, only the whitelisted numeric columns below may change,
// matched strictly by SKU — identifiers, names, orders etc. are NEVER pushed.

const PUSHABLE_FIELDS = ["stock", "tier1", "tier2", "tier3", "tier4", "tier5", "purchaseCost"] as const;
type PushableField = (typeof PUSHABLE_FIELDS)[number];

const DEFAULT_ERP_COLUMNS: Record<PushableField | "sku", string> = {
  sku: "sku",
  stock: "stock_quantity",
  tier1: "tier1_distributor",
  tier2: "tier2_wholesale",
  tier3: "tier3_semiwholesale",
  tier4: "tier4_retailer",
  tier5: "tier5_mrp",
  purchaseCost: "purchase_cost",
};

async function erpColumnMap(): Promise<Record<string, string>> {
  let aliases: Record<string, string> = {};
  try { aliases = JSON.parse(await getSetting("erp_product_aliases", "{}")) as Record<string, string>; } catch { /* ignore */ }
  return { ...DEFAULT_ERP_COLUMNS, ...aliases };
}

export type PushFieldDiff = { field: PushableField; erpColumn: string; erpValue: number; webValue: number };
export type PushRowDiff = { sku: string; name: string; diffs: PushFieldDiff[] };

export type PushPreview = {
  writeEnabled: boolean;
  writeUnlockedAt: string;
  checkedErpRows: number;
  matchedSkus: number;
  rowsWithChanges: number;
  sample: PushRowDiff[];
  columns: Record<string, string>;
};

async function computePushDiff(limit: number): Promise<{ rows: PushRowDiff[]; checkedErpRows: number; matchedSkus: number; columns: Record<string, string> }> {
  const raw = await pullErpProducts(limit);
  const erpRows = raw.map((r) => normalizeErpProduct(r)).filter((x): x is NormalizedErpProduct => Boolean(x));
  const bySku = new Map(erpRows.map((r) => [r.sku, r]));

  const locals = await db.product.findMany({
    select: { sku: true, name: true, stock: true, tier1: true, tier2: true, tier3: true, tier4: true, tier5: true, purchaseCost: true },
  });
  const columns = await erpColumnMap();

  const rows: PushRowDiff[] = [];
  let matchedSkus = 0;
  for (const p of locals) {
    const erp = bySku.get(p.sku);
    if (!erp) continue;
    matchedSkus++;
    const diffs: PushFieldDiff[] = [];
    for (const field of PUSHABLE_FIELDS) {
      const webValue = Number(p[field] ?? 0);
      const erpValue = Number(erp[field] ?? 0);
      if (webValue !== erpValue) diffs.push({ field, erpColumn: columns[field] || DEFAULT_ERP_COLUMNS[field], erpValue, webValue });
    }
    if (diffs.length) rows.push({ sku: p.sku, name: p.name, diffs });
  }
  return { rows, checkedErpRows: raw.length, matchedSkus, columns };
}

/** Dry-run: what WOULD be written to the ERP if pushes were unlocked. Read-only. */
export async function previewPushToErp(limit = 5000): Promise<PushPreview> {
  const { rows, checkedErpRows, matchedSkus, columns } = await computePushDiff(limit);
  const writeEnabled = (await getSetting("erp_write_enabled", "false")) === "true";
  const writeUnlockedAt = await getSetting("erp_write_unlocked_at", "");
  return {
    writeEnabled,
    writeUnlockedAt,
    checkedErpRows,
    matchedSkus,
    rowsWithChanges: rows.length,
    sample: rows.slice(0, 50),
    columns,
  };
}

/** Execute the push. Throws unless "erp_write_enabled" === "true". */
export async function executePushToErp(limit = 5000): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const writeEnabled = (await getSetting("erp_write_enabled", "false")) === "true";
  if (!writeEnabled) {
    throw new Error("ERP writes are LOCKED (safety). The ERP database was NOT modified. Unlock the toggle in Admin → Data Sync first.");
  }
  const { rows } = await computePushDiff(limit);
  const { erpPool } = await import("@/lib/erp");
  const pool = await erpPool();
  const table = await erpProductsTable();
  const columns = await erpColumnMap();
  const skuCol = assertIdentifier(columns.sku || DEFAULT_ERP_COLUMNS.sku);

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const row of rows) {
    try {
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const d of row.diffs) {
        sets.push(`\`${assertIdentifier(d.erpColumn)}\` = ?`);
        vals.push(d.webValue);
      }
      if (!sets.length) { skipped++; continue; }
      vals.push(row.sku);
      await pool.query(`UPDATE \`${table}\` SET ${sets.join(", ")} WHERE \`${skuCol}\` = ? LIMIT 1`, vals);
      updated++;
    } catch (e) {
      errors.push(`${row.sku}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { updated, skipped, errors };
}
