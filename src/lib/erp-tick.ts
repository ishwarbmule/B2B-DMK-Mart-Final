/**
 * ERP → B2B inventory auto-sync (the "tick").
 *
 * Runs every N minutes (15/30/60 — Setting `erp_auto_sync_minutes`, Vercel Cron fires /api/cron/erp-sync
 * every 15 min and this lib self-gates by interval). Designed for the 60s serverless cap:
 *   1. ONE read query pulls the whole ERP products table (~2.4k rows)
 *   2. Diff in memory against the B2B mirror (stock, tiers, MRP, prices, active, name, pack data)
 *   3. Batched temp-table UPDATE..JOIN — 3 queries total regardless of how many rows drifted
 *   4. New ERP SKUs are created via the full apply pipeline (capped per tick, remainder next tick)
 *   5. ERP-deleted SKUs (syncSource=ERP, admin never toggled) are de-listed
 *
 * Never touches: images (unless a product has none), slugs, ERP MySQL (read-only pull).
 */
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { pullErpProducts, getSetting, setSetting, normalizeErpProduct } from "@/lib/erp";
import type { NormalizedErpProduct } from "@/lib/erp";
import { applyErpProducts, logSyncEvent } from "@/lib/erp-sync";

export type TickResult = {
  ran: boolean;
  reason?: string;
  intervalMinutes: number;
  durationMs: number;
  seen: number;
  updated: number;
  created: number;
  createdSkippedRemainder: number;
  deactivated: number;
  errors: string[];
};

const CREATE_CAP_PER_TICK = 40;

export async function runErpTick(force = false): Promise<TickResult> {
  const t0 = Date.now();
  const errors: string[] = [];

  // interval gate
  const minutes = Math.max(5, Math.min(720, parseInt((await getSetting("erp_auto_sync_minutes", "30")).trim() || "30", 10) || 30));
  let lastRunAt = 0;
  try {
    const state = JSON.parse((await getSetting("erp_sync_state", "{}")) || "{}") as { lastRunAt?: string };
    if (state.lastRunAt) lastRunAt = new Date(state.lastRunAt).getTime() || 0;
  } catch { /* ignore */ }
  const elapsedMin = (Date.now() - lastRunAt) / 60000;
  if (!force && lastRunAt > 0 && elapsedMin < minutes - 0.5) {
    return { ran: false, reason: `last run ${elapsedMin.toFixed(1)} min ago — interval is ${minutes} min`, intervalMinutes: minutes, durationMs: 0, seen: 0, updated: 0, created: 0, createdSkippedRemainder: 0, deactivated: 0, errors };
  }

  // 1) pull whole ERP inventory
  const raw = await pullErpProducts(5000);
  const normalized = raw.map((r) => normalizeErpProduct(r)).filter((x): x is NormalizedErpProduct => Boolean(x));

  // 2) diff against the B2B mirror
  const locals = await db.product.findMany({
    select: {
      id: true, sku: true, name: true, stock: true, purchaseCost: true,
      tier1: true, tier2: true, tier3: true, tier4: true, tier5: true,
      dealerPrice: true, basePrice: true, mrp: true,
      active: true, activeSource: true, syncSource: true, image: true,
    },
  });
  const bySku = new Map(locals.map((p) => [p.sku, p]));

  type Row = {
    sku: string; name: string; stock: number; purchaseCost: number;
    tier1: number; tier2: number; tier3: number; tier4: number; tier5: number;
    dealerPrice: number; basePrice: number; mrp: number; active: number;
  };
  const dirty: Row[] = [];
  const newRows: NormalizedErpProduct[] = [];
  let updated = 0;

  for (const it of normalized) {
    const local = bySku.get(it.sku);
    if (!local) { newRows.push(it); continue; }
    const dealer = it.tier4 > 0 ? it.tier4 : it.tier5 > 0 ? it.tier5 : it.tier3;
    const mrp = it.tier5 > 0 ? it.tier5 : dealer;
    const base = it.tier3 > 0 ? it.tier3 : dealer;
    const nextActive = local.activeSource === "ADMIN" ? local.active : it.active;
    const r: Row = {
      sku: it.sku,
      name: it.name,
      stock: Math.round(it.stock),
      purchaseCost: it.purchaseCost,
      tier1: it.tier1, tier2: it.tier2, tier3: it.tier3, tier4: it.tier4, tier5: it.tier5,
      dealerPrice: dealer, basePrice: base, mrp,
      active: nextActive ? 1 : 0,
    };
    const changed =
      r.name !== local.name ||
      r.stock !== Math.round(local.stock) ||
      r.purchaseCost !== local.purchaseCost ||
      r.tier1 !== local.tier1 || r.tier2 !== local.tier2 || r.tier3 !== local.tier3 || r.tier4 !== local.tier4 || r.tier5 !== local.tier5 ||
      r.dealerPrice !== local.dealerPrice || r.basePrice !== local.basePrice || r.mrp !== local.mrp ||
      r.active !== (local.active ? 1 : 0);
    if (changed) { dirty.push(r); updated++; }
  }

  // 3) batched UPDATE..JOIN via temp table (constant query count regardless of drift size)
  if (dirty.length) {
    try {
      await db.$executeRawUnsafe(`DROP TEMPORARY TABLE IF EXISTS \`erp_tick\``);
      await db.$executeRawUnsafe(`CREATE TEMPORARY TABLE \`erp_tick\` (
        \`sku\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`stock\` DOUBLE NOT NULL DEFAULT 0,
        \`purchaseCost\` DOUBLE NOT NULL DEFAULT 0,
        \`tier1\` DOUBLE NOT NULL DEFAULT 0, \`tier2\` DOUBLE NOT NULL DEFAULT 0,
        \`tier3\` DOUBLE NOT NULL DEFAULT 0, \`tier4\` DOUBLE NOT NULL DEFAULT 0,
        \`tier5\` DOUBLE NOT NULL DEFAULT 0,
        \`dealerPrice\` DOUBLE NOT NULL DEFAULT 0, \`basePrice\` DOUBLE NOT NULL DEFAULT 0,
        \`mrp\` DOUBLE NOT NULL DEFAULT 0,
        \`active\` TINYINT NOT NULL DEFAULT 1
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

      const CHUNK = 100;
      for (let i = 0; i < dirty.length; i += CHUNK) {
        const chunk = dirty.slice(i, i + CHUNK);
        const values = Prisma.join(
          chunk.map((r) => Prisma.sql`(${r.sku}, ${r.name.slice(0, 180)}, ${r.stock}, ${r.purchaseCost}, ${r.tier1}, ${r.tier2}, ${r.tier3}, ${r.tier4}, ${r.tier5}, ${r.dealerPrice}, ${r.basePrice}, ${r.mrp}, ${r.active})`)
        );
        await db.$executeRaw(
          Prisma.sql`INSERT INTO \`erp_tick\` (\`sku\`,\`name\`,\`stock\`,\`purchaseCost\`,\`tier1\`,\`tier2\`,\`tier3\`,\`tier4\`,\`tier5\`,\`dealerPrice\`,\`basePrice\`,\`mrp\`,\`active\`) VALUES ${values}`
        );
      }

      await db.$executeRawUnsafe(`
        UPDATE \`Product\` p
        JOIN \`erp_tick\` t ON p.\`sku\` = t.\`sku\`
        SET
          p.\`name\` = t.\`name\`,
          p.\`stock\` = t.\`stock\`,
          p.\`purchaseCost\` = t.\`purchaseCost\`,
          p.\`tier1\` = t.\`tier1\`, p.\`tier2\` = t.\`tier2\`, p.\`tier3\` = t.\`tier3\`,
          p.\`tier4\` = t.\`tier4\`, p.\`tier5\` = t.\`tier5\`,
          p.\`dealerPrice\` = t.\`dealerPrice\`, p.\`basePrice\` = t.\`basePrice\`, p.\`mrp\` = t.\`mrp\`,
          p.\`active\` = IF(p.\`activeSource\` = 'ADMIN', p.\`active\`, t.\`active\`),
          p.\`lastSyncedAt\` = NOW(3)
      `);
      await db.$executeRawUnsafe(`DROP TEMPORARY TABLE IF EXISTS \`erp_tick\``);
    } catch (e) {
      errors.push(`batch-update: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 4) new SKUs — full pipeline, capped
  let created = 0;
  let createdSkippedRemainder = 0;
  if (newRows.length) {
    const capped = newRows.slice(0, CREATE_CAP_PER_TICK);
    createdSkippedRemainder = newRows.length - capped.length;
    try {
      const res = await applyErpProducts(capped as unknown as Record<string, unknown>[]);
      created = res.created;
      for (const err of res.errors.slice(0, 5)) errors.push(`create: ${err}`);
    } catch (e) {
      errors.push(`create-pipeline: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 5) de-list SKUs removed from ERP (respect admin-toggled products)
  let deactivated = 0;
  try {
    const erpSkus = new Set(normalized.map((r) => r.sku));
    const orphaned = locals.filter(
      (p) => p.syncSource === "ERP" && p.activeSource !== "ADMIN" && p.active && !erpSkus.has(p.sku)
    );
    if (orphaned.length) {
      const res = await db.product.updateMany({ where: { id: { in: orphaned.map((p) => p.id) } }, data: { active: false } });
      deactivated = res.count;
    }
  } catch (e) {
    errors.push(`deactivate: ${e instanceof Error ? e.message : String(e)}`);
  }

  const durationMs = Date.now() - t0;
  const result = { ran: true, intervalMinutes: minutes, durationMs, seen: normalized.length, updated, created, createdSkippedRemainder, deactivated, errors };

  await setSetting("erp_sync_state", JSON.stringify({ lastRunAt: new Date().toISOString(), ...result, reason: undefined })).catch(() => {});
  await logSyncEvent({
    direction: "PULL_ERP_AUTO", action: "TICK", status: errors.length ? "PARTIAL" : "OK",
    message: errors.length ? errors.join(" | ").slice(0, 480) : `auto tick: ${updated} updated, ${created} created, ${deactivated} de-listed`,
    seen: normalized.length, created, updated, skipped: createdSkippedRemainder, durationMs,
  }).catch(() => {});

  return result;
}

export async function getErpSyncStatus() {
  const [minutesRaw, stateRaw] = await Promise.all([
    getSetting("erp_auto_sync_minutes", "30"),
    getSetting("erp_sync_state", "{}"),
  ]);
  let state: Record<string, unknown> = {};
  try { state = JSON.parse(stateRaw || "{}"); } catch { /* ignore */ }
  const minutes = Math.max(5, Math.min(720, parseInt(minutesRaw.trim() || "30", 10) || 30));
  const lastRunAt = (state.lastRunAt as string) || "";
  const nextDueAt = lastRunAt ? new Date(new Date(lastRunAt).getTime() + minutes * 60000).toISOString() : "";
  return { minutes, state, lastRunAt, nextDueAt };
}
