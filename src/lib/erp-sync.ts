/**
 * Applies ERP product payloads into the local catalog mirror.
 * Used by: POST /api/inventory/webhook (ERP auto-push) and POST /api/admin/sync/pull (manual).
 * Only touches local SQLite — Neon stays read-only.
 */
import { db } from "@/lib/db";
import type { NormalizedErpProduct } from "@/lib/erp";
import { normalizeErpProduct } from "@/lib/erp";

const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "item";

type CatCache = {
  tops: { id: string; name: string }[];
  mids: { id: string; name: string }[];
  ends: { id: string; name: string }[];
  fallback: { topId: string; midId: string; endId: string };
};

async function loadCatCache(): Promise<CatCache> {
  const [tops, mids, ends] = await Promise.all([
    db.topCategory.findMany({ select: { id: true, name: true } }),
    db.midCategory.findMany({ select: { id: true, name: true } }),
    db.endCategory.findMany({ select: { id: true, name: true } }),
  ]);
  const fallbackTop = tops.find((t) => t.name === "HouseHold Unbreakable") ?? tops[0];
  const fallbackMid = mids.find((m) => m.name === "General") ?? mids[0];
  let fallbackEnd = ends.find((e) => e.name === "General") ?? ends[0];
  if (!fallbackEnd && fallbackMid) {
    fallbackEnd = await db.endCategory.create({ data: { name: "General", midId: fallbackMid.id } });
  }
  return { tops, mids, ends, fallback: { topId: fallbackTop.id, midId: fallbackMid.id, endId: fallbackEnd.id } };
}

function resolveCategories(cache: CatCache, categoryText: string) {
  const t = categoryText.trim();
  const top = cache.tops.find((x) => x.name.toLowerCase() === t.toLowerCase());
  const mid = cache.mids.find((x) => x.name.toLowerCase() === t.toLowerCase());
  const end = cache.ends.find((x) => x.name.toLowerCase() === t.toLowerCase());
  return { topId: top?.id ?? cache.fallback.topId, midId: mid?.id ?? cache.fallback.midId, endId: end?.id ?? cache.fallback.endId };
}

export type ApplyResult = { seen: number; created: number; updated: number; skipped: number; newBrands: string[]; errors: string[] };

export async function applyErpProducts(payload: unknown): Promise<ApplyResult> {
  const result: ApplyResult = { seen: 0, created: 0, updated: 0, skipped: 0, newBrands: [], errors: [] };

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

  const [brands, catCache] = await Promise.all([db.brand.findMany({ select: { id: true, name: true, erpNames: true, active: true } }), loadCatCache()]);
  const aliasIndex = new Map<string, string>(); // lower alias -> brandId
  for (const b of brands) {
    aliasIndex.set(b.name.toLowerCase(), b.id);
    try {
      for (const a of JSON.parse(b.erpNames || "[]") as string[]) aliasIndex.set(String(a).toLowerCase(), b.id);
    } catch { /* ignore */ }
  }

  const resolveBrand = async (company: string, brand: string): Promise<string> => {
    for (const raw of [company, brand]) {
      const key = (raw || "").trim().toLowerCase();
      if (key && aliasIndex.has(key)) return aliasIndex.get(key)!;
    }
    // prefix fallback
    for (const raw of [company, brand]) {
      const key = (raw || "").trim().toLowerCase();
      if (!key) continue;
      for (const [alias, id] of aliasIndex.entries()) {
        if (alias && (key.startsWith(alias) || alias.startsWith(key)) && alias.length >= 4) return id;
      }
    }
    // auto-create brand for unknown company
    const name = (company || brand || "DMK Mart").trim();
    const existing = await db.brand.findUnique({ where: { name } });
    if (existing) return existing.id;
    let slug = slugify(name);
    if (await db.brand.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const createdBrand = await db.brand.create({
      data: {
        name, slug,
        erpNames: JSON.stringify([company, brand].filter(Boolean)),
        description: `${name} — newly synced from the DMK Mart ERP.`,
        storefrontLayout: 1,
        storefrontConfig: JSON.stringify({ heroHeadline: `Shop ${name}`, heroSub: `Explore the ${name} range at wholesale rates.`, showCategories: true, showTopProducts: true, showHotDeals: true, showAllProducts: true, bg: "#ffffff", accent: "#facc15" }),
      },
    });
    aliasIndex.set(name.toLowerCase(), createdBrand.id);
    result.newBrands.push(name);
    return createdBrand.id;
  };

  for (const item of normalized) {
    try {
      const brandId = await resolveBrand(item.company, item.brand);
      const cats = resolveCategories(catCache, item.category);
      const dealer = item.tier4 > 0 ? item.tier4 : item.tier5 > 0 ? item.tier5 : item.tier3;
      const mrp = item.tier5 > 0 ? item.tier5 : dealer;
      const base = item.tier3 > 0 ? item.tier3 : dealer;
      const data = {
        erpId: item.erpId,
        name: item.name,
        brandId,
        topId: cats.topId, midId: cats.midId, endId: cats.endId,
        unit: item.unit, packQty: item.packQty, piecesPerBox: item.piecesPerBox,
        purchaseCost: item.purchaseCost,
        dealerPrice: dealer, basePrice: base, mrp,
        tier1: item.tier1, tier2: item.tier2, tier3: item.tier3, tier4: item.tier4, tier5: item.tier5,
        packPrice: item.packPrice, packDiscountPct: item.packDiscountPct,
        stock: Math.round(item.stock), damagedStock: Math.round(item.damaged), reservedQty: Math.round(item.reserved),
        lowStockThreshold: item.lowStockThreshold,
        barcode: item.barcode, hsn: item.hsn, gst: item.gst, weightGrams: item.weightGrams,
        active: item.active,
        syncSource: "ERP",
        lastSyncedAt: new Date(),
      };

      const existing = item.erpId
        ? (await db.product.findFirst({ where: { OR: [{ erpId: item.erpId }, { sku: item.sku }] } }))
        : await db.product.findUnique({ where: { sku: item.sku } });

      if (existing) {
        const update: Record<string, unknown> = { ...data };
        if (item.image) update.image = item.image; // keep local image if ERP sends none
        await db.product.update({ where: { id: existing.id }, data: update });
        result.updated++;
      } else {
        let slug = slugify(`${item.company || item.brand || "dmk"}-${item.name}`);
        if (await db.product.findUnique({ where: { slug } })) slug = `${slug}-${item.sku.slice(-6).toLowerCase()}`;
        await db.product.create({
          data: {
            ...data,
            sku: item.sku,
            slug,
            image: item.image,
            gallery: item.image ? JSON.stringify([item.image]) : "[]",
            description: `${item.name} — synced from DMK Mart ERP.`,
            seoTitle: `${item.name} | DMK Mart B2B`,
            seoDesc: `Buy ${item.name} at wholesale price on DMK Mart.`,
            keywords: `${item.name}, ${item.brand || item.company}, wholesale`,
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
