/**
 * POST /api/admin/sync/migrate-inventory?key=<cron secret>
 *
 * ONE-TIME inventory migration driven by the owner's Excel sheet
 * (dmk-products-all-2026-11-07_gst_delivery.xlsx) — SKU renumbering included.
 *
 * mode "universal" (chunked, ?start= cursor):
 *   For every sheet row, find the SAME product in the B2B catalog:
 *     1. exact SKU match (normal re-upload case), else
 *     2. unique normalized-name match, else
 *     3. name+company match inside a duplicate-name group, else
 *     4. order pairing by SKU numeric suffix inside the group (sheet and catalog
 *        come from the same ERP, group order is preserved)
 *   …then UPDATE that product: new SKU + every filled sheet column (company,
 *   categories, unit, HSN, GST, delivery rate, cost, pack qty, tiers, stock,
 *   damaged/reserved, threshold, status→active, barcode, weight, pieces/box,
 *   image, created-on). Sheet rows matching NOTHING are created as new products.
 *   Empty cells never wipe existing values. Returns per-chunk report + the
 *   oldSku→newSku rename pairs (the client accumulates them for the ERP pass).
 *
 * mode "erp" (single call, all rows + renames):
 *   Aligns the owner's ERP MySQL `products` table to the same sheet —
 *   SAFETY: creates `products_backup_<date>` first (full copy), discovers the
 *   ERP's real column names via DESCRIBE, adds the new columns if missing
 *   (top_level_category / end_level_category / delivery_rate), then applies
 *   renames + value updates in one UPDATE..JOIN and inserts genuinely new SKUs.
 *
 * Auth: cron secret or admin Bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { erpPool, getSetting, setSetting, erpProductsTable } from "@/lib/erp";
import mysql from "mysql2/promise";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHUNK = 300; // default; overridable per request via ?chunk=
const MIGRATION_KEY = "inventory_migration_2026_11_07";

async function authorize(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET || "";
  const key = req.nextUrl.searchParams.get("key") || "";
  const auth = req.headers.get("authorization") || "";
  if (secret && (key === secret || auth === `Bearer ${secret}`)) return true;
  if (key || auth === "Bearer x") {
    try {
      const s = await db.setting.findUnique({ where: { key: "cron_secret" } });
      const dbSecret = s?.value?.trim() || "";
      if (dbSecret && (key === dbSecret || auth === `Bearer ${dbSecret}`)) return true;
    } catch { /* ignore */ }
  }
  return requireAdmin(req) === null;
}

// ───────── helpers ─────────
const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const normText = (v: unknown): string =>
  s(v).normalize("NFKD").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').toLowerCase();
const normName = (v: unknown): string => normText(v).replace(/[^a-z0-9]+/g, " ").trim();
const n = (v: unknown): number | null => {
  const t = s(v);
  if (!t) return null;
  const x = Number(t.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : null;
};
const suffixNum = (sku: string): number => {
  const m = sku.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
};
const slugify = (x: string) => x.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "item";

type SheetRow = Record<string, unknown>;

export async function POST(req: NextRequest) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json()) as {
      rows?: SheetRow[]; mode?: "universal" | "erp" | "apply-plan" | "erp-rows" | "erp-info"; start?: number; renames?: [string, string][]; force?: boolean;
      updates?: PlanUpdate[]; creates?: PlanCreate[];
    };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const mode = body.mode ?? "universal";

    if (mode === "apply-plan") return await applyPlan(body.updates ?? [], body.creates ?? []);
    if (mode === "erp-rows") return await erpRowsPass(rows, Array.isArray(body.renames) ? body.renames : []);
    if (mode === "erp-info") return await erpInfo();

    if (!rows.length) return NextResponse.json({ ok: false, error: "No rows provided" }, { status: 400 });

    if (mode === "universal") {
      const chunkParam = Math.max(20, Math.min(400, parseInt(req.nextUrl.searchParams.get("chunk") || "300", 10) || 300));
      return await universalPass(rows, Number(body.start) || 0, body.force === true, chunkParam);
    }
    return await erpPass(rows, Array.isArray(body.renames) ? body.renames : []);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 400) : "migration failed" }, { status: 500 });
  }
}

// ═══════════════════ APPLY-PLAN (precomputed batch update — fast path) ═══════════════════

/** One planned update: `sku` = the product's CURRENT sku; `set` holds ONLY the columns
 *  the sheet fills (blank sheet cells are simply absent → value kept). */
export type PlanUpdate = { sku: string; set: Record<string, unknown> };
export type PlanCreate = Record<string, unknown>;

const PLAN_STR_COLS = ["sku", "name", "company", "unit", "hsn", "barcode", "image"] as const;
const PLAN_NUM_COLS = ["gst", "deliveryRate", "purchaseCost", "packQty", "tier1", "tier2", "tier3", "tier4", "tier5", "dealerPrice", "basePrice", "mrp", "stock", "damagedStock", "reservedQty", "lowStockThreshold", "weightGrams", "piecesPerBox"] as const;
const PLAN_ID_COLS = ["topId", "midId", "endId"] as const;

async function applyPlan(updates: PlanUpdate[], creates: PlanCreate[]) {
  const t0 = Date.now();
  if (!updates.length && !creates.length) return NextResponse.json({ ok: false, error: "Empty plan" }, { status: 400 });

  // category text → ids (resolved server-side; unknown names reported, never invented)
  const [tops, mids, ends] = await Promise.all([
    db.topCategory.findMany({ select: { id: true, name: true } }),
    db.midCategory.findMany({ select: { id: true, name: true, topId: true } }),
    db.endCategory.findMany({ select: { id: true, name: true, midId: true } }),
  ]);
  const midById = new Map(mids.map((m) => [m.id, m]));
  const unmatchedCategories = new Set<string>();
  const resolveCat = (field: "topId" | "endId", text: unknown): string | null => {
    const t = normName(text);
    if (!t) return null;
    if (field === "topId") {
      const top = tops.find((x) => normName(x.name) === t);
      if (top) return top.id;
    } else {
      const end = ends.find((x) => normName(x.name) === t);
      if (end) return end.id;
    }
    unmatchedCategories.add(String(text));
    return null;
  };
  const endToMid = (endId: string | null): string | null => (endId ? midById.get(endId)?.id ?? null : null);
  const midToTop = (midId: string | null): string | null => (midId ? midById.get(midId)?.topId ?? null : null);

  // temp plan table — `old_sku` = JOIN key (product's current sku), `sku` = new sku (rename)
  await db.$executeRawUnsafe("DROP TEMPORARY TABLE IF EXISTS `mig_plan`");
  const colDefs = [
    "`old_sku` VARCHAR(191) NOT NULL PRIMARY KEY",
    "`sku` VARCHAR(191) NULL",
    ...PLAN_STR_COLS.filter((c) => c !== "sku").map((c) => `\`${c}\` VARCHAR(500) NULL`),
    ...PLAN_ID_COLS.map((c) => `\`${c}\` VARCHAR(191) NULL`),
    ...PLAN_NUM_COLS.map((c) => `\`${c}\` DOUBLE NULL`),
    "`active` TINYINT NULL",
    "`activeSource` VARCHAR(20) NULL",
    "`syncSource` VARCHAR(20) NULL",
    "`createdAt` DATETIME NULL",
    "`gallery` TEXT NULL",
  ].join(", ");
  await db.$executeRawUnsafe(`CREATE TEMPORARY TABLE \`mig_plan\` (${colDefs}) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  let staged = 0;
  const insChunk = 120;
  for (let i = 0; i < updates.length; i += insChunk) {
    const batch = updates.slice(i, i + insChunk);
    const values = batch.map((u) => {
      const s0 = u.set ?? {};
      const endId = resolveCat("endId", s0.endCategoryText ?? null);
      const midId = endId ? endToMid(endId) : (s0.midId ? String(s0.midId) : null);
      const topId = s0.topId ? String(s0.topId) : (midId ? midToTop(midId) : resolveCat("topId", s0.topCategoryText ?? null));
      const co = typeof s0.createdAt === "string" ? s0.createdAt.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
      const img = typeof s0.image === "string" && s0.image ? s0.image : null;
      const galleryJson = img && /^https?:\/\//.test(img) ? JSON.stringify([img]) : null;
      const strVal = (c: string): string | null => (c === "sku" ? String(s0.sku ?? u.sku ?? "").slice(0, 190) : s0[c] !== undefined && s0[c] !== null && s0[c] !== "" ? String(s0[c]).slice(0, c === "name" || c === "image" ? 190 : 490) : null);
      const numVal = (c: string): number | null => (typeof s0[c] === "number" ? (s0[c] as number) : s0[c] !== undefined && s0[c] !== "" ? Number(s0[c]) || null : null);
      return [
        String(u.sku ?? "").slice(0, 190), // old_sku — join key
        strVal("sku"),
        strVal("name"), strVal("company"), strVal("unit"), strVal("hsn"), strVal("barcode"), strVal("image"),
        topId, midId, endId,
        ...PLAN_NUM_COLS.map(numVal),
        typeof s0.active === "boolean" ? (s0.active ? 1 : 0) : null,
        typeof s0.activeSource === "string" ? s0.activeSource : null,
        typeof s0.syncSource === "string" ? s0.syncSource : null,
        co ? `${co[1]}-${co[2]}-${co[3]} 00:00:00` : null,
        galleryJson,
      ];
    });
    await db.$executeRaw(
      Prisma.sql`INSERT INTO \`mig_plan\` (\`old_sku\`,\`sku\`,\`name\`,\`company\`,\`unit\`,\`hsn\`,\`barcode\`,\`image\`,\`topId\`,\`midId\`,\`endId\`,${Prisma.raw(PLAN_NUM_COLS.map((c) => `\`${c}\``).join(","))},\`active\`,\`activeSource\`,\`syncSource\`,\`createdAt\`,\`gallery\`) VALUES ${
        Prisma.join(values.map((v) => Prisma.sql`(${Prisma.join(v)})`))
      }`
    );
    staged += values.length;
  }

  // single UPDATE..JOIN — COALESCE keeps current values where the plan cell is NULL
  const setExprs = [
    "`p`.`sku` = COALESCE(NULLIF(`m`.`sku`, ''), `p`.`sku`)",
    ...["name", "company", "unit", "hsn", "barcode"].map((c) => `\`p\`.\`${c}\` = COALESCE(\`m\`.\`${c}\`, \`p\`.\`${c}\`)`),
    "`p`.`image` = COALESCE(`m`.`image`, `p`.`image`)",
    "`p`.`gallery` = COALESCE(`m`.`gallery`, `p`.`gallery`)",
    ...PLAN_ID_COLS.map((c) => `\`p\`.\`${c}\` = COALESCE(\`m\`.\`${c}\`, \`p\`.\`${c}\`)`),
    ...PLAN_NUM_COLS.map((c) => `\`p\`.\`${c}\` = COALESCE(\`m\`.\`${c}\`, \`p\`.\`${c}\`)`),
    "`p`.`active` = COALESCE(`m`.`active`, `p`.`active`)",
    "`p`.`activeSource` = COALESCE(`m`.`activeSource`, `p`.`activeSource`)",
    "`p`.`syncSource` = COALESCE(`m`.`syncSource`, `p`.`syncSource`)",
    "`p`.`createdAt` = COALESCE(`m`.`createdAt`, `p`.`createdAt`)",
    "`p`.`lastSyncedAt` = NOW(3)",
  ];
  let updatedRows = 0;
  if (updates.length) {
    const res = await db.$executeRawUnsafe(
      `UPDATE \`Product\` p JOIN \`mig_plan\` m ON \`p\`.\`sku\` = \`m\`.\`old_sku\` SET ${setExprs.join(", ")}`
    );
    updatedRows = Number(res);
  }
  await db.$executeRawUnsafe("DROP TEMPORARY TABLE IF EXISTS `mig_plan`");

  // creates — createMany (slugs are pre-uniqued by the driver)
  let createdRows = 0;
  if (creates.length) {
    const fbTop = tops.find((t) => t.name === "General") ?? tops[0];
    const fbMid = mids.find((m) => m.name === "General") ?? mids.find((m) => m.topId === fbTop?.id) ?? mids[0];
    const fbEnd = ends.find((e2) => e2.name === "General") ?? ends.find((e2) => e2.midId === fbMid?.id) ?? ends[0];
    const rows = creates.map((c) => {
      const endId = resolveCat("endId", c.endCategoryText ?? null);
      const midId = (endId ? endToMid(endId) : (c.midId ? String(c.midId) : "")) || fbMid?.id || "";
      const topId = (c.topId ? String(c.topId) : (midId ? midToTop(midId) : resolveCat("topId", c.topCategoryText ?? null))) || fbTop?.id || "";
      return ({
      sku: String(c.sku ?? "").slice(0, 190),
      slug: String(c.slug ?? `p-${Date.now()}`),
      name: String(c.name ?? ""),
      company: String(c.company ?? "").slice(0, 190),
      topId, midId, endId: endId ?? fbEnd?.id ?? "",
      unit: String(c.unit || "Pcs"), hsn: String(c.hsn ?? ""),
      gst: Number(c.gst ?? 18), deliveryRate: Number(c.deliveryRate ?? 0),
      purchaseCost: Number(c.purchaseCost ?? 0), packQty: Math.max(1, Math.round(Number(c.packQty ?? 1))),
      tier1: Number(c.tier1 ?? 0), tier2: Number(c.tier2 ?? 0), tier3: Number(c.tier3 ?? 0),
      tier4: Number(c.tier4 ?? 0), tier5: Number(c.tier5 ?? 0),
      dealerPrice: Number(c.dealerPrice ?? 0), basePrice: Number(c.basePrice ?? 0), mrp: Number(c.mrp ?? 0),
      stock: Number(c.stock ?? 0), damagedStock: Number(c.damagedStock ?? 0), reservedQty: Number(c.reservedQty ?? 0),
      lowStockThreshold: Math.round(Number(c.lowStockThreshold ?? 10)),
      barcode: String(c.barcode ?? ""), weightGrams: Number(c.weightGrams ?? 0),
      piecesPerBox: Math.max(1, Math.round(Number(c.piecesPerBox ?? 1))),
      image: String(c.image || "/dmk-logo.png"),
      gallery: typeof c.gallery === "string" ? c.gallery : "[]",
      description: String(c.description ?? ""), seoTitle: String(c.seoTitle ?? ""), seoDesc: String(c.seoDesc ?? ""), keywords: String(c.keywords ?? ""),
      active: c.active !== false, activeSource: "ERP", syncSource: "ERP",
      rating: 4.5, reviewCount: 10,
      ...(c.createdAt ? { createdAt: new Date(String(c.createdAt)) } : {}),
      lastSyncedAt: new Date(),
      });
    });
    const res = await db.product.createMany({ data: rows, skipDuplicates: true });
    createdRows = res.count;
  }

  return NextResponse.json({
    ok: true,
    staged, updatedRows, createdRows,
    unmatchedCategories: [...unmatchedCategories].slice(0, 40),
    durationMs: Date.now() - t0,
  });
}

// ═══════════════════ UNIVERSAL PASS (B2B catalog) ═══════════════════

async function universalPass(rows: SheetRow[], start: number, force: boolean, chunkSize = CHUNK) {
  const state = await getSetting(MIGRATION_KEY, "");
  if (state === "done" && !force && start === 0) {
    return NextResponse.json({ ok: false, error: "Migration already completed. Pass force=true to re-run.", state }, { status: 409 });
  }
  if (start === 0) await setSetting(MIGRATION_KEY, "running");

  const [tops, mids, ends] = await Promise.all([
    db.topCategory.findMany({ select: { id: true, name: true } }),
    db.midCategory.findMany({ select: { id: true, name: true, topId: true } }),
    db.endCategory.findMany({ select: { id: true, name: true, midId: true } }),
  ]);
  const midById = new Map(mids.map((m) => [m.id, m]));
  const unmatchedCategories = new Set<string>();
  const resolveCats = (topText: string, endText: string): { topId?: string; midId?: string; endId?: string } => {
    const out: { topId?: string; midId?: string; endId?: string } = {};
    const t = normName(topText);
    if (t) {
      const top = tops.find((x) => normName(x.name) === t);
      if (top) out.topId = top.id; else unmatchedCategories.add(s(topText));
    }
    const e = normName(endText);
    if (e) {
      const end = ends.find((x) => normName(x.name) === e);
      if (end) {
        out.endId = end.id;
        const mid = midById.get(end.midId);
        if (mid) { out.midId = mid.id; if (!out.topId) out.topId = mid.topId; }
      } else unmatchedCategories.add(s(endText));
    }
    return out;
  };

  // local catalog + name groups
  const locals = await db.product.findMany({
    select: { id: true, sku: true, name: true, company: true, active: true, syncSource: true, tier4: true, tier5: true, stock: true },
  });
  const bySku = new Map(locals.map((p) => [p.sku, p]));
  const byName = new Map<string, typeof locals>();
  for (const p of locals) {
    const k = normName(p.name);
    const arr = byName.get(k) ?? [];
    arr.push(p);
    byName.set(k, arr);
  }

  const chunk = rows.slice(start, start + chunkSize);
  let updated = 0, renamedCount = 0, created = 0, skipped = 0;
  const renames: [string, string][] = [];
  const errors: string[] = [];
  const unmatchedRows: { sku: string; name: string }[] = [];

  for (const row of chunk) {
    const newSku = s(row.SKU);
    const name = s(row["Product Name"]);
    if (!newSku || !name) { skipped++; continue; }
    const company = s(row.Company);
    const status = s(row.Status).toUpperCase();
    const active = status !== "INACTIVE";

    try {
      // ── match the same product ──
      let target: (typeof locals)[number] | undefined = bySku.get(newSku);
      let oldSku = target ? target.sku : "";
      if (!target) {
        const group = (byName.get(normName(name)) ?? []).filter((p) => !renames.some(([, ns]) => ns === p.sku && p.sku !== newSku));
        if (group.length === 1) {
          target = group[0];
        } else if (group.length > 1) {
          // prefer same company, then pair by SKU suffix order within the group
          const compKey = normName(company);
          const byCompany = compKey ? group.filter((p) => normName(p.company) === compKey) : [];
          const pool = byCompany.length ? byCompany : group;
          pool.sort((a, b) => suffixNum(a.sku) - suffixNum(b.sku));
          target = pool.find((p) => !renames.some(([, ns]) => ns === p.sku));
        }
        if (target) { oldSku = target.sku; renamedCount++; renames.push([oldSku, newSku]); }
      }

      const cats = resolveCats(s(row["Top Level Category"]), s(row["End Level Category"]));
      const dealer = n(row["Tier 4 Retailer"]);
      const t5 = n(row["Tier 5 MRP"]);
      const t3 = n(row["Tier 3 Semi-Wholesale"]);

      if (target) {
        const data: Record<string, unknown> = {
          sku: newSku,
          name,
          company: company || target.company,
          syncSource: "ERP",
          lastSyncedAt: new Date(),
        };
        if (cats.topId) data.topId = cats.topId;
        if (cats.midId) data.midId = cats.midId;
        if (cats.endId) data.endId = cats.endId;
        const unit = s(row.Unit); if (unit) data.unit = unit;
        const hsn = s(row.HSN); if (hsn) data.hsn = hsn;
        const gst = n(row["GST %"]); if (gst !== null) data.gst = gst;
        const dr = n(row["Delivery Rate"]); if (dr !== null) data.deliveryRate = dr;
        const cost = n(row["Cost Price"]); if (cost !== null) data.purchaseCost = cost;
        const pq = n(row["Pack Qty"]); if (pq !== null && pq >= 1) data.packQty = Math.round(pq);
        const t1 = n(row["Tier 1 Distributor"]); if (t1 !== null) data.tier1 = t1;
        const t2 = n(row["Tier 2 Wholesale"]); if (t2 !== null) data.tier2 = t2;
        if (t3 !== null) { data.tier3 = t3; data.basePrice = t3 > 0 ? t3 : (dealer ?? 0); }
        if (dealer !== null) { data.tier4 = dealer; data.dealerPrice = dealer > 0 ? dealer : (t5 ?? 0); }
        if (t5 !== null) { data.tier5 = t5; data.mrp = t5 > 0 ? t5 : (dealer ?? 0); }
        const stock = n(row["Sellable Stock"]); if (stock !== null) data.stock = stock;
        const dmg = n(row["Damaged Stock"]); if (dmg !== null) data.damagedStock = dmg;
        const rsv = n(row.Reserved); if (rsv !== null) data.reservedQty = rsv;
        const low = n(row["Low Stock Threshold"]); if (low !== null) data.lowStockThreshold = Math.round(low);
        if (status === "ACTIVE" || status === "INACTIVE") { data.active = active; data.activeSource = "ERP"; }
        const barcode = s(row.Barcode); if (barcode) data.barcode = barcode;
        const w = n(row["Weight (g)"]); if (w !== null) data.weightGrams = w;
        const ppb = n(row["Pieces/Box"]); if (ppb !== null && ppb >= 1) data.piecesPerBox = Math.round(ppb);
        const img = s(row["Image URL"]);
        if (img) { data.image = img; if (/^https?:\/\//.test(img)) data.gallery = JSON.stringify([img]); }
        const createdOn = s(row["Created On"]);
        const co = createdOn.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (co) data.createdAt = new Date(`${co[1]}-${co[2]}-${co[3]}T00:00:00.000Z`);

        if (target.sku === newSku) {
          delete data.sku;
          await db.product.update({ where: { id: target.id }, data });
        } else {
          const clash = await db.product.findUnique({ where: { sku: newSku } });
          if (clash && clash.id !== target.id) {
            errors.push(`${oldSku}→${newSku}: SKU already used by another product (${clash.name})`);
            continue;
          }
          await db.product.update({ where: { id: target.id }, data });
        }
        updated++;
      } else {
        // ── genuinely new product ──
        const comp = company || "DMK Mart";
        const topId = cats.topId ?? tops.find((t) => t.name === "General")?.id ?? tops[0]?.id;
        const midId = cats.midId ?? mids.find((m) => m.name === "General")?.id ?? mids.find((m) => m.topId === topId)?.id ?? mids[0]?.id;
        const endId = cats.endId ?? ends.find((e2) => e2.name === "General")?.id ?? ends.find((e2) => e2.midId === midId)?.id ?? ends[0]?.id;
        if (!topId || !midId || !endId) { errors.push(`${newSku}: category tree empty`); continue; }
        let slug = slugify(`${comp}-${name}`);
        if (await db.product.findUnique({ where: { slug } })) slug = `${slug}-${newSku.slice(-6).toLowerCase()}`;
        const img = s(row["Image URL"]);
        const createdOn = s(row["Created On"]);
        const co = createdOn.match(/^(\d{4})-(\d{2})-(\d{2})/);
        await db.product.create({
          data: {
            sku: newSku,
            slug,
            name,
            company: comp.slice(0, 190),
            topId, midId, endId,
            unit: s(row.Unit) || "Pcs",
            hsn: s(row.HSN),
            gst: n(row["GST %"]) ?? 18,
            deliveryRate: n(row["Delivery Rate"]) ?? 0,
            purchaseCost: n(row["Cost Price"]) ?? 0,
            packQty: Math.max(1, Math.round(n(row["Pack Qty"]) ?? 1)),
            tier1: n(row["Tier 1 Distributor"]) ?? 0,
            tier2: n(row["Tier 2 Wholesale"]) ?? 0,
            tier3: t3 ?? 0,
            tier4: dealer ?? 0,
            tier5: t5 ?? 0,
            dealerPrice: (dealer ?? 0) > 0 ? (dealer as number) : (t5 ?? 0),
            basePrice: t3 ?? dealer ?? 0,
            mrp: (t5 ?? 0) > 0 ? (t5 as number) : (dealer ?? 0),
            stock: n(row["Sellable Stock"]) ?? 0,
            damagedStock: n(row["Damaged Stock"]) ?? 0,
            reservedQty: n(row.Reserved) ?? 0,
            lowStockThreshold: Math.round(n(row["Low Stock Threshold"]) ?? 10),
            active,
            activeSource: "ERP",
            syncSource: "ERP",
            barcode: s(row.Barcode) || newSku,
            weightGrams: n(row["Weight (g)"]) ?? 0,
            piecesPerBox: Math.max(1, Math.round(n(row["Pieces/Box"]) ?? 1)),
            image: img || "/dmk-logo.png",
            gallery: /^https?:\/\//.test(img) ? JSON.stringify([img]) : "[]",
            description: `${name} — ${comp}.`,
            seoTitle: `${name} | DMK Mart B2B`,
            seoDesc: `Buy ${name} at wholesale price on DMK Mart.`,
            keywords: `${name}, ${comp}, wholesale`,
            rating: 4.5,
            reviewCount: 10,
            ...(co ? { createdAt: new Date(`${co[1]}-${co[2]}-${co[3]}T00:00:00.000Z`) } : {}),
          },
        });
        created++;
        unmatchedRows.push({ sku: newSku, name });
      }
    } catch (e) {
      errors.push(`${newSku}: ${e instanceof Error ? e.message.slice(0, 160) : "row failed"}`);
    }
  }

  const nextStart = start + chunk.length;
  const done = nextStart >= rows.length;
  if (done) {
    await setSetting(MIGRATION_KEY, "done");
    await db.activityLog.create({
      data: { action: "MIGRATE", entity: "product", detail: `Inventory migration (2026-11-07 sheet): ${updated} updated (${renamedCount} SKUs renumbered), ${created} created` },
    });
  }
  return NextResponse.json({
    ok: true, totalRows: rows.length, processed: chunk.length, nextStart, done,
    updated, renamed: renamedCount, created, skipped,
    renames, unmatchedRows: unmatchedRows.slice(0, 50),
    unmatchedCategories: [...unmatchedCategories].slice(0, 30),
    errors: errors.slice(0, 10),
  });
}

// ═══════════════════ ERP PASS (owner's MySQL — aligned to the sheet) ═══════════════════

// candidate ERP column names per canonical field — matched ALPHANUMERIC-CASELESS
// (so "tier1Distributor", "tier1_distributor" and "TIER1_DISTRIBUTOR" all hit)
const ERP_COL_CANDIDATES: Record<string, string[]> = {
  sku: ["sku", "skucode", "itemcode", "productcode"],
  name: ["name", "productname", "itemname"],
  company: ["company", "companyname", "brand", "make"],
  unit: ["unit", "uom", "unitname"],
  hsn: ["hsn", "hsncode"],
  gst: ["gst", "gstrate", "gstpercent", "gstpercentage"],
  deliveryRate: ["deliveryrate", "deliverycharges"],
  cost: ["costprice", "cost", "purchasecost", "purchaseprice"],
  packQty: ["packqty", "packsize"],
  tier1: ["tier1distributor", "tier1"],
  tier2: ["tier2wholesale", "tier2"],
  tier3: ["tier3semiwholesale", "tier3semiwholesale", "tier3"],
  tier4: ["tier4retailer", "tier4"],
  tier5: ["tier5mrp", "tier5", "mrp"],
  stock: ["stockquantity", "sellablestock", "stockqty", "stock", "qty"],
  damaged: ["damagedstock", "damaged", "damagedqty"],
  reserved: ["reservedqty", "reserved", "reservedquantity"],
  lowStock: ["lowstockthreshold", "lowstock", "minstock"],
  status: ["isactive", "status", "active"],
  barcode: ["barcode", "barcodeno", "barcode", "ean"],
  weight: ["weightgrams", "weight", "weightg"],
  piecesPerBox: ["piecesperbox", "piecesbox", "pcsperbox"],
  topCat: ["toplevelcategory", "topcategory"],
  endCat: ["endlevelcategory", "endcategory"],
  endCatAlt: ["endcategory"],
  deliveryRateAlt: ["deliveryrate"],
  createdOn: ["createdat", "createdon", "createddate"],
  photoUrl: ["photourl", "imageurl", "image"],
};

function discoverColumns(describe: { Field: string }[]): Record<string, string> {
  const canon = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const lower = new Map(describe.map((c) => [canon(c.Field), c.Field]));
  const found: Record<string, string> = {};
  for (const [field, candidates] of Object.entries(ERP_COL_CANDIDATES)) {
    for (const c of candidates) {
      const actual = lower.get(canon(c));
      if (actual) { found[field] = actual; break; }
    }
  }
  return found;
}

/**
 * Chunked ERP alignment: ≤80 sheet rows per call. Each row is one UPDATE by its
 * CURRENT (old) SKU — renaming the SKU and setting every discovered column — and
 * falls back to INSERT when the old SKU is absent (genuinely new products).
 * The full-table backup is created once, guarded by the `erp_backup_20261107` Setting.
 */
async function erpRowsPass(rows: SheetRow[], renamePairs: [string, string][]) {
  const pool = await erpPool();
  const table = await erpProductsTable();
  const stamp = "20261107";

  const [desc] = await pool.query<mysql.RowDataPacket[]>(`DESCRIBE \`${table}\``);
  const describeRows = desc as unknown as { Field: string; Null: string; Default: unknown; Extra: string; Type: string }[];
  const cols = discoverColumns(describeRows);
  if (!cols.sku) return NextResponse.json({ ok: false, error: `ERP table \`${table}\` has no recognizable SKU column` }, { status: 400 });

  // one-time safety backup
  const bk = await getSetting("erp_backup_20261107", "");
  let backupTable = "";
  if (bk !== "done") {
    await pool.query(`CREATE TABLE IF NOT EXISTS \`${table}_backup_${stamp}\` AS SELECT * FROM \`${table}\``);
    await setSetting("erp_backup_20261107", "done");
    backupTable = `${table}_backup_${stamp}`;
  }

  // ensure the new sheet columns exist in the ERP (harmless additions, once)
  for (const [field, ddl] of [
    ["topCat", "ADD COLUMN `top_level_category` VARCHAR(191) NOT NULL DEFAULT ''"],
    ["endCat", "ADD COLUMN `end_level_category` VARCHAR(191) NOT NULL DEFAULT ''"],
    ["deliveryRate", "ADD COLUMN `delivery_rate` DOUBLE NOT NULL DEFAULT 0"],
  ] as const) {
    if (!cols[field]) {
      try {
        await pool.query(`ALTER TABLE \`${table}\` ${ddl}`);
        cols[field] = ddl.match(/`(\w+)`/)?.[1] ?? "";
      } catch { /* column may exist under another name */ }
    }
  }

  const renameMap = new Map<string, string>(renamePairs.map(([oldSku, newSku]) => [newSku, oldSku]));
  const statusCol = cols.status;
  // status column may be numeric (is_active) or text (ACTIVE/INACTIVE)
  const statusIsNumeric = statusCol ? /int|tinyint|bit/i.test(describeRows.find((c) => c.Field === statusCol)?.Type ?? "") : false;

  // the ERP may carry BOTH naming variants of the new sheet columns (end_level_category +
  // endCategory, delivery_rate + deliveryRate) — update every variant that exists
  const allFields = describeRows.map((c) => c.Field);
  const endCatCols = allFields.filter((f) => /^end_?level_?category$|^endcategory$/i.test(f.replace(/\s/g, "")));
  const delivCols = allFields.filter((f) => /^delivery_?rate$/i.test(f));

  // INSERT template: the ERP is a Prisma-style table — required FK columns (e.g. firmId)
  // and NOT-NULL-no-default columns must be cloned from an existing row.
  const [sampleRows] = await pool.query<mysql.RowDataPacket[]>(`SELECT * FROM \`${table}\` LIMIT 1`);
  const sample = (sampleRows as Record<string, unknown>[])[0] ?? {};
  const requiredTemplate: Record<string, unknown> = {};
  for (const c of describeRows) {
    if (c.Field === cols.sku) continue;
    const isAuto = String(c.Extra || "").includes("auto_increment");
    const hasDefault = c.Default !== null && c.Default !== undefined;
    const notNull = String(c.Null || "").toUpperCase() === "NOT NULL";
    if (isAuto || !notNull || hasDefault) continue;
    const v = sample[c.Field];
    const t = String(c.Type || "").toLowerCase();
    requiredTemplate[c.Field] = v !== undefined && v !== null ? v : (/int|decimal|double|float|bit/.test(t) ? 0 : "");
  }

  let updated = 0, inserted = 0, unchanged = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const newSku = s(row.SKU);
    const oldSku = renameMap.get(newSku) ?? newSku;
    if (!newSku) continue;
    const status = s(row.Status).toUpperCase();
    const statusVal = statusIsNumeric ? (status === "INACTIVE" ? 0 : 1) : status === "INACTIVE" ? "INACTIVE" : "ACTIVE";

    const set: Record<string, unknown> = {};
    set[cols.sku] = newSku;
    if (cols.name) set[cols.name] = s(row["Product Name"]).slice(0, 190);
    if (cols.company) set[cols.company] = s(row.Company).slice(0, 190);
    if (cols.unit) set[cols.unit] = s(row.Unit).slice(0, 30);
    if (cols.hsn) set[cols.hsn] = s(row.HSN).slice(0, 30);
    if (cols.gst) set[cols.gst] = n(row["GST %"]) ?? 0;
    if (cols.deliveryRate) set[cols.deliveryRate] = n(row["Delivery Rate"]) ?? 0;
    if (cols.cost) set[cols.cost] = n(row["Cost Price"]) ?? 0;
    if (cols.packQty) set[cols.packQty] = Math.round(n(row["Pack Qty"]) ?? 1);
    if (cols.tier1) set[cols.tier1] = n(row["Tier 1 Distributor"]) ?? 0;
    if (cols.tier2) set[cols.tier2] = n(row["Tier 2 Wholesale"]) ?? 0;
    if (cols.tier3) set[cols.tier3] = n(row["Tier 3 Semi-Wholesale"]) ?? 0;
    if (cols.tier4) set[cols.tier4] = n(row["Tier 4 Retailer"]) ?? 0;
    if (cols.tier5) set[cols.tier5] = n(row["Tier 5 MRP"]) ?? 0;
    if (cols.stock) set[cols.stock] = n(row["Sellable Stock"]) ?? 0;
    if (cols.damaged) set[cols.damaged] = n(row["Damaged Stock"]) ?? 0;
    if (cols.reserved) set[cols.reserved] = n(row.Reserved) ?? 0;
    if (cols.lowStock) set[cols.lowStock] = Math.round(n(row["Low Stock Threshold"]) ?? 0);
    if (cols.barcode) set[cols.barcode] = s(row.Barcode).slice(0, 60);
    if (cols.weight) set[cols.weight] = n(row["Weight (g)"]) ?? 0;
    if (cols.piecesPerBox) set[cols.piecesPerBox] = Math.round(n(row["Pieces/Box"]) ?? 1);
    if (cols.topCat) set[cols.topCat] = s(row["Top Level Category"]).slice(0, 190);
    for (const ec of endCatCols) set[ec] = s(row["End Level Category"]).slice(0, 190);
    for (const dc of delivCols) set[dc] = n(row["Delivery Rate"]) ?? 0;
    if (cols.photoUrl) set[cols.photoUrl] = s(row["Image URL"]).slice(0, 250);
    if (statusCol) set[statusCol] = statusVal;
    if (cols.createdOn && s(row["Created On"])) set[cols.createdOn] = s(row["Created On"]).slice(0, 10);

    const keys = Object.keys(set);
    try {
      const [res] = await pool.query(
        `UPDATE \`${table}\` SET ${keys.map((k) => `\`${k}\` = ?`).join(", ")} WHERE \`${cols.sku}\` = ? LIMIT 1`,
        [...keys.map((k) => set[k]), oldSku]
      );
      const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
      if (affected > 0) { updated++; continue; }
      // old SKU absent → genuinely new product → INSERT (with required template columns, e.g. firmId)
      const insertKeys = [...new Set([...Object.keys(requiredTemplate), ...keys])];
      const insertVals = insertKeys.map((k) => (k in set ? set[k] : requiredTemplate[k]));
      await pool.query(
        `INSERT INTO \`${table}\` (${insertKeys.map((k) => `\`${k}\``).join(", ")}) VALUES (${insertKeys.map(() => "?").join(", ")})`,
        insertVals
      );
      inserted++;
    } catch (e) {
      errors.push(`${newSku}: ${e instanceof Error ? e.message.slice(0, 140) : "row failed"}`);
    }
  }

  return NextResponse.json({ ok: true, updated, inserted, unchanged, backupTable, columns: cols, errors: errors.slice(0, 10) });
}

/** Diagnostic: ERP table structure + a full-error test UPDATE (no data changed on failure). */
async function erpInfo() {
  const pool = await erpPool();
  const table = await erpProductsTable();
  const [desc] = await pool.query<mysql.RowDataPacket[]>(`DESCRIBE \`${table}\``);
  const [cnt] = await pool.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${table}\``);
  const [sample] = await pool.query<mysql.RowDataPacket[]>(`SELECT * FROM \`${table}\` LIMIT 1`);
  let updateTest = "";
  try {
    const [res] = await pool.query(`UPDATE \`${table}\` SET \`name\` = \`name\` WHERE \`sku\` = ? LIMIT 1`, [s((sample as Record<string, unknown>[])[0]?.sku)]);
    updateTest = `self-update ok (${(res as { affectedRows?: number }).affectedRows})`;
  } catch (e) {
    updateTest = e instanceof Error ? e.message.slice(0, 500) : String(e);
  }
  let renameTest = "";
  try {
    const [res] = await pool.query(`UPDATE \`${table}\` SET \`sku\` = \`sku\` WHERE \`sku\` = ? LIMIT 1`, [s((sample as Record<string, unknown>[])[0]?.sku)]);
    renameTest = `sku-self-update ok (${(res as { affectedRows?: number }).affectedRows})`;
  } catch (e) {
    renameTest = e instanceof Error ? e.message.slice(0, 500) : String(e);
  }
  const [fk] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT constraint_name, column_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND referenced_column_name IS NOT NULL`,
    [table]
  );
  return NextResponse.json({
    ok: true,
    table,
    count: Number((cnt as { n: number }[])[0]?.n ?? 0),
    columns: desc,
    sampleKeys: Object.keys((sample as Record<string, unknown>[])[0] ?? {}),
    updateTest, renameTest,
    foreignKeys: fk,
  });
}

async function erpPass(rows: SheetRow[], renamePairs: [string, string][]) {
  const pool = await erpPool();
  const table = await erpProductsTable();
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // 0) discover columns
  const [desc] = await pool.query<mysql.RowDataPacket[]>(`DESCRIBE \`${table}\``);
  const cols = discoverColumns(desc as { Field: string }[]);
  if (!cols.sku) return NextResponse.json({ ok: false, error: `ERP table \`${table}\` has no recognizable SKU column` }, { status: 400 });

  // 1) SAFETY BACKUP — full table copy (kept, never dropped automatically)
  await pool.query(`CREATE TABLE IF NOT EXISTS \`${table}_backup_${stamp}\` AS SELECT * FROM \`${table}\``);

  // 2) ensure the new sheet columns exist in the ERP (harmless additions)
  for (const [field, ddl] of [
    ["topCat", "ADD COLUMN `top_level_category` VARCHAR(191) NOT NULL DEFAULT ''"],
    ["endCat", "ADD COLUMN `end_level_category` VARCHAR(191) NOT NULL DEFAULT ''"],
    ["deliveryRate", "ADD COLUMN `delivery_rate` DOUBLE NOT NULL DEFAULT 0"],
  ] as const) {
    if (!cols[field]) {
      try {
        await pool.query(`ALTER TABLE \`${table}\` ${ddl}`);
        cols[field] = ddl.match(/`(\w+)`/)?.[1] ?? "";
      } catch { /* column may exist under another name */ }
    }
  }

  // 3) temp table with the sheet's desired state per OLD sku
  await pool.query("DROP TEMPORARY TABLE IF EXISTS `erp_mig`");
  await pool.query(`CREATE TEMPORARY TABLE \`erp_mig\` (
    \`old_sku\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`sku\` VARCHAR(191) NOT NULL DEFAULT '',
    \`name\` VARCHAR(191) NOT NULL DEFAULT '',
    \`company\` VARCHAR(191) NOT NULL DEFAULT '',
    \`unit\` VARCHAR(32) NOT NULL DEFAULT '',
    \`hsn\` VARCHAR(32) NOT NULL DEFAULT '',
    \`gst\` DOUBLE NOT NULL DEFAULT 0,
    \`delivery\` DOUBLE NOT NULL DEFAULT 0,
    \`cost\` DOUBLE NOT NULL DEFAULT 0,
    \`pack_qty\` INT NOT NULL DEFAULT 1,
    \`t1\` DOUBLE NOT NULL DEFAULT 0, \`t2\` DOUBLE NOT NULL DEFAULT 0, \`t3\` DOUBLE NOT NULL DEFAULT 0,
    \`t4\` DOUBLE NOT NULL DEFAULT 0, \`t5\` DOUBLE NOT NULL DEFAULT 0,
    \`stock\` DOUBLE NOT NULL DEFAULT 0, \`damaged\` DOUBLE NOT NULL DEFAULT 0, \`reserved\` DOUBLE NOT NULL DEFAULT 0,
    \`low\` INT NOT NULL DEFAULT 0,
    \`barcode\` VARCHAR(64) NOT NULL DEFAULT '',
    \`weight\` DOUBLE NOT NULL DEFAULT 0, \`ppb\` INT NOT NULL DEFAULT 1,
    \`top\` VARCHAR(191) NOT NULL DEFAULT '', \`end\` VARCHAR(191) NOT NULL DEFAULT '',
    \`active\` TINYINT NOT NULL DEFAULT 1,
    \`created_on\` VARCHAR(10) NOT NULL DEFAULT ''
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  const renameMap = new Map(renamePairs);
  const insertChunkSize = 150;
  let staged = 0;
  for (let i = 0; i < rows.length; i += insertChunkSize) {
    const chunk = rows.slice(i, i + insertChunkSize);
    if (!chunk.length) break;
    const values = chunk.map((row) => {
      const sku = s(row.SKU);
      const oldSku = renameMap.get(sku) ?? sku; // unchanged SKUs map to themselves
      const status = s(row.Status).toUpperCase();
      const co = s(row["Created On"]).slice(0, 10);
      return [
        oldSku.slice(0, 190), sku.slice(0, 190), s(row["Product Name"]).slice(0, 190), s(row.Company).slice(0, 190),
        s(row.Unit).slice(0, 30), s(row.HSN).slice(0, 30),
        n(row["GST %"]) ?? 0, n(row["Delivery Rate"]) ?? 0, n(row["Cost Price"]) ?? 0,
        Math.round(n(row["Pack Qty"]) ?? 1),
        n(row["Tier 1 Distributor"]) ?? 0, n(row["Tier 2 Wholesale"]) ?? 0, n(row["Tier 3 Semi-Wholesale"]) ?? 0,
        n(row["Tier 4 Retailer"]) ?? 0, n(row["Tier 5 MRP"]) ?? 0,
        n(row["Sellable Stock"]) ?? 0, n(row["Damaged Stock"]) ?? 0, n(row.Reserved) ?? 0,
        Math.round(n(row["Low Stock Threshold"]) ?? 0),
        s(row.Barcode).slice(0, 60), n(row["Weight (g)"]) ?? 0, Math.round(n(row["Pieces/Box"]) ?? 1),
        s(row["Top Level Category"]).slice(0, 190), s(row["End Level Category"]).slice(0, 190),
        status === "INACTIVE" ? 0 : 1, co,
      ];
    });
    await pool.query(
      `INSERT INTO \`erp_mig\` (\`old_sku\`,\`sku\`,\`name\`,\`company\`,\`unit\`,\`hsn\`,\`gst\`,\`delivery\`,\`cost\`,\`pack_qty\`,\`t1\`,\`t2\`,\`t3\`,\`t4\`,\`t5\`,\`stock\`,\`damaged\`,\`reserved\`,\`low\`,\`barcode\`,\`weight\`,\`ppb\`,\`top\`,\`end\`,\`active\`,\`created_on\`) VALUES ?`,
      [values]
    );
    staged += values.length;
  }

  // 4) UPDATE..JOIN — renames + every available column
  const sets = [
    "`e`.`sku` = `m`.`sku`",
    cols.name ? "`e`.`" + cols.name + "` = `m`.`name`" : "",
    cols.company ? "`e`.`" + cols.company + "` = `m`.`company`" : "",
    cols.unit ? "`e`.`" + cols.unit + "` = `m`.`unit`" : "",
    cols.hsn ? "`e`.`" + cols.hsn + "` = `m`.`hsn`" : "",
    cols.gst ? "`e`.`" + cols.gst + "` = `m`.`gst`" : "",
    cols.deliveryRate ? "`e`.`" + cols.deliveryRate + "` = `m`.`delivery`" : "",
    cols.cost ? "`e`.`" + cols.cost + "` = `m`.`cost`" : "",
    cols.packQty ? "`e`.`" + cols.packQty + "` = `m`.`pack_qty`" : "",
    cols.tier1 ? "`e`.`" + cols.tier1 + "` = `m`.`t1`" : "",
    cols.tier2 ? "`e`.`" + cols.tier2 + "` = `m`.`t2`" : "",
    cols.tier3 ? "`e`.`" + cols.tier3 + "` = `m`.`t3`" : "",
    cols.tier4 ? "`e`.`" + cols.tier4 + "` = `m`.`t4`" : "",
    cols.tier5 ? "`e`.`" + cols.tier5 + "` = `m`.`t5`" : "",
    cols.stock ? "`e`.`" + cols.stock + "` = `m`.`stock`" : "",
    cols.damaged ? "`e`.`" + cols.damaged + "` = `m`.`damaged`" : "",
    cols.reserved ? "`e`.`" + cols.reserved + "` = `m`.`reserved`" : "",
    cols.lowStock ? "`e`.`" + cols.lowStock + "` = `m`.`low`" : "",
    cols.barcode ? "`e`.`" + cols.barcode + "` = `m`.`barcode`" : "",
    cols.weight ? "`e`.`" + cols.weight + "` = `m`.`weight`" : "",
    cols.piecesPerBox ? "`e`.`" + cols.piecesPerBox + "` = `m`.`ppb`" : "",
    cols.topCat ? "`e`.`" + cols.topCat + "` = `m`.`top`" : "",
    cols.endCat ? "`e`.`" + cols.endCat + "` = `m`.`end`" : "",
    cols.status ? "`e`.`" + cols.status + "` = IF(`m`.`active` = 1, IF(`e`.`" + cols.status + "` IN ('0','INACTIVE','Inactive'), 'ACTIVE', `e`.`" + cols.status + "`), 'INACTIVE')" : "",
    cols.createdOn ? "`e`.`" + cols.createdOn + "` = IF(`m`.`created_on` <> '', `m`.`created_on`, `e`.`" + cols.createdOn + "`)" : "",
  ].filter(Boolean);
  const [updRes] = await pool.query(
    `UPDATE \`${table}\` e JOIN \`erp_mig\` m ON e.\`${cols.sku}\` = m.\`old_sku\` SET ${sets.join(", ")}`
  );
  const updatedRows = (updRes as { affectedRows?: number }).affectedRows ?? 0;

  // 5) genuinely new SKUs (present in the sheet, absent in the ERP) → INSERT
  const [missing] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT m.* FROM \`erp_mig\` m LEFT JOIN \`${table}\` e ON e.\`${cols.sku}\` = m.\`sku\`
     WHERE e.\`${cols.sku}\` IS NULL AND m.\`old_sku\` = m.\`sku\``
  );
  let inserted = 0;
  const insErrors: string[] = [];
  for (const m of missing as Record<string, unknown>[]) {
    try {
      const rowData: Record<string, unknown> = {};
      if (cols.sku) rowData[cols.sku] = m.sku;
      if (cols.name) rowData[cols.name] = m.name;
      if (cols.company) rowData[cols.company] = m.company;
      if (cols.unit) rowData[cols.unit] = m.unit;
      if (cols.hsn) rowData[cols.hsn] = m.hsn;
      if (cols.gst) rowData[cols.gst] = m.gst;
      if (cols.deliveryRate) rowData[cols.deliveryRate] = m.delivery;
      if (cols.cost) rowData[cols.cost] = m.cost;
      if (cols.packQty) rowData[cols.packQty] = m.pack_qty;
      if (cols.tier1) rowData[cols.tier1] = m.t1;
      if (cols.tier2) rowData[cols.tier2] = m.t2;
      if (cols.tier3) rowData[cols.tier3] = m.t3;
      if (cols.tier4) rowData[cols.tier4] = m.t4;
      if (cols.tier5) rowData[cols.tier5] = m.t5;
      if (cols.stock) rowData[cols.stock] = m.stock;
      if (cols.damaged) rowData[cols.damaged] = m.damaged;
      if (cols.reserved) rowData[cols.reserved] = m.reserved;
      if (cols.lowStock) rowData[cols.lowStock] = m.low;
      if (cols.barcode) rowData[cols.barcode] = m.barcode;
      if (cols.weight) rowData[cols.weight] = m.weight;
      if (cols.piecesPerBox) rowData[cols.piecesPerBox] = m.ppb;
      if (cols.topCat) rowData[cols.topCat] = m.top;
      if (cols.endCat) rowData[cols.endCat] = m.end;
      if (cols.status) rowData[cols.status] = Number(m.active) === 1 ? "ACTIVE" : "INACTIVE";
      if (cols.createdOn && m.created_on) rowData[cols.createdOn] = m.created_on;
      const keys = Object.keys(rowData);
      await pool.query(`INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, keys.map((k) => rowData[k]));
      inserted++;
    } catch (e) {
      insErrors.push(`${m.sku}: ${e instanceof Error ? e.message.slice(0, 140) : "insert failed"}`);
    }
  }

  await pool.query("DROP TEMPORARY TABLE IF EXISTS `erp_mig`");

  return NextResponse.json({
    ok: true,
    backupTable: `${table}_backup_${stamp}`,
    erpColumns: cols,
    staged, updatedRows, inserted,
    errors: insErrors.slice(0, 20),
  });
}
