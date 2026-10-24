/** POST /api/admin/catalog/apply-categories — bulk category taxonomy update.
 *  Body: { dryRun?: boolean, tops?: TopInput[], assignments?: AssignInput[] }
 *  - tops: upsert TopCategory by name (name/emoji/color/sortOrder/image)
 *  - assignments: { sku, top, mid, end } — ensures Mid (topId+name) and End (midId+name)
 *    chains exist (batched createMany), then re-points products via ONE temp-table
 *    UPDATE..JOIN per request (Hostinger shared MySQL: ~1.5s per round trip, so the
 *    number of queries matters far more than the data volume).
 *  Idempotent: safe to re-run / chunk.
 *  GET: current top->mid tree with product counts (verification).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TopInput = { name: string; emoji?: string; color?: string; sortOrder?: number; image?: string };
type AssignInput = { sku: string; top: string; mid: string; end: string };

const clean = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");
const NAME_MAX = 80;

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const tops = await db.topCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { mids: { orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }, _count: { select: { products: true } } },
    });
    return NextResponse.json({
      ok: true,
      tops: tops.map((t) => ({
        id: t.id, name: t.name, emoji: t.emoji, color: t.color, image: t.image, sortOrder: t.sortOrder,
        products: t._count.products,
        mids: t.mids.map((m) => ({ id: m.id, name: m.name, products: m._count.products })),
      })),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load categories", 500);
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const started = Date.now();
  try {
    const body = (await req.json()) as { dryRun?: boolean; tops?: TopInput[]; assignments?: AssignInput[] };
    const dryRun = !!body.dryRun;
    const topsIn = Array.isArray(body.tops) ? body.tops : [];
    const assignsIn = Array.isArray(body.assignments) ? body.assignments : [];

    // ── 1. Upsert top categories ──
    const topIdByName = new Map<string, string>();
    let topsUpserted = 0;
    for (const t of topsIn) {
      const name = clean(t.name);
      if (!name || name.length > NAME_MAX) continue;
      const data = {
        name,
        emoji: clean(t.emoji) || "🧺",
        color: clean(t.color) || "#facc15",
        sortOrder: Number.isFinite(t.sortOrder) ? Number(t.sortOrder) : 100,
        ...(t.image !== undefined ? { image: clean(t.image) } : {}),
      };
      if (dryRun) { topIdByName.set(name, `dry:${name}`); topsUpserted++; continue; }
      const row = await db.topCategory.upsert({ where: { name }, create: data, update: data });
      topIdByName.set(name, row.id);
      topsUpserted++;
    }

    // ── 2. Group assignments by (top, mid, end) ──
    const groups = new Map<string, { top: string; mid: string; end: string; skus: string[] }>();
    const skipped: string[] = [];
    for (const a of assignsIn) {
      const sku = clean(a.sku), top = clean(a.top), mid = clean(a.mid) || "General", end = clean(a.end) || "General";
      if (!sku || !topIdByName.has(top) || top.length > NAME_MAX) { if (sku) skipped.push(sku); continue; }
      const key = `${top}||${mid}||${end}`;
      if (!groups.has(key)) groups.set(key, { top, mid, end, skus: [] });
      groups.get(key)!.skus.push(sku);
    }

    let midsCreated = 0, endsCreated = 0, productsUpdated = 0;

    if (!dryRun && groups.size > 0) {
      // ── 3a. Batch-create missing mids (one createMany + one findMany) ──
      const midWanted = new Map<string, { topId: string; name: string }>(); // key: topId||midName
      for (const g of groups.values()) {
        const topId = topIdByName.get(g.top)!;
        midWanted.set(`${topId}||${g.mid}`, { topId, name: g.mid });
      }
      if (midWanted.size) {
        await db.midCategory.createMany({
          data: [...midWanted.values()].map((m) => ({ topId: m.topId, name: m.name })),
          skipDuplicates: true,
        });
        const midRows = await db.midCategory.findMany({
          where: { OR: [...midWanted.values()].map((m) => ({ topId: m.topId, name: m.name })) },
          select: { id: true, topId: true, name: true },
        });
        const midIdByKey = new Map<string, string>();
        for (const m of midRows) midIdByKey.set(`${m.topId}||${m.name}`, m.id);
        midsCreated = [...midWanted.keys()].filter((k) => midIdByKey.has(k)).length;

        // ── 3b. Batch-create missing ends (one createMany + one findMany) ──
        const endWanted = new Map<string, { midId: string; name: string }>(); // key: midId||endName
        for (const g of groups.values()) {
          const topId = topIdByName.get(g.top)!;
          const midId = midIdByKey.get(`${topId}||${g.mid}`);
          if (!midId) continue;
          endWanted.set(`${midId}||${g.end}`, { midId, name: g.end });
        }
        if (endWanted.size) {
          await db.endCategory.createMany({
            data: [...endWanted.values()].map((e) => ({ midId: e.midId, name: e.name })),
            skipDuplicates: true,
          });
          const endRows = await db.endCategory.findMany({
            where: { OR: [...endWanted.values()].map((e) => ({ midId: e.midId, name: e.name })) },
            select: { id: true, midId: true, name: true },
          });
          const endIdByKey = new Map<string, string>();
          for (const e of endRows) endIdByKey.set(`${e.midId}||${e.name}`, e.id);
          endsCreated = [...endWanted.keys()].filter((k) => endIdByKey.has(k)).length;

          // ── 3c. Re-point products: temp table + ONE UPDATE..JOIN ──
          type Row = { sku: string; topId: string; midId: string; endId: string };
          const rows: Row[] = [];
          const missing: string[] = [];
          for (const g of groups.values()) {
            const topId = topIdByName.get(g.top)!;
            const midId = midIdByKey.get(`${topId}||${g.mid}`);
            const endId = midId ? endIdByKey.get(`${midId}||${g.end}`) : undefined;
            if (!midId || !endId) { missing.push(...g.skus); continue; }
            for (const sku of g.skus) rows.push({ sku, topId, midId, endId });
          }

          await db.$transaction(
            async (tx) => {
              // temp tables are connection-scoped — everything must run on ONE pooled
              // connection, hence the interactive transaction
              await tx.$executeRawUnsafe(`DROP TEMPORARY TABLE IF EXISTS _cat_tmp`);
              await tx.$executeRawUnsafe(`CREATE TEMPORARY TABLE _cat_tmp (sku VARCHAR(64) PRIMARY KEY, topId VARCHAR(64), midId VARCHAR(64), endId VARCHAR(64))`);
              for (let i = 0; i < rows.length; i += 800) {
                const batch = rows.slice(i, i + 800);
                const values = Prisma.join(
                  batch.map((r) => Prisma.sql`(${r.sku}, ${r.topId}, ${r.midId}, ${r.endId})`),
                  ", "
                );
                await tx.$executeRaw(Prisma.sql`INSERT INTO _cat_tmp (sku, topId, midId, endId) VALUES ${values}`);
              }
              const res: any = await tx.$executeRawUnsafe(
                `UPDATE Product p JOIN _cat_tmp t ON p.sku = t.sku SET p.topId = t.topId, p.midId = t.midId, p.endId = t.endId, p.updatedAt = NOW()`
              );
              productsUpdated = Number(res ?? 0);
              await tx.$executeRawUnsafe(`DROP TEMPORARY TABLE IF EXISTS _cat_tmp`);
            },
            { timeout: 50_000, maxWait: 15_000 }
          );
          if (missing.length) skipped.push(...missing);
        }
      }
    } else if (dryRun) {
      for (const g of groups.values()) productsUpdated += g.skus.length;
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      topsUpserted,
      groups: groups.size,
      midsEnsured: midsCreated,
      endsEnsured: endsCreated,
      productsUpdated,
      skipped: skipped.length,
      durationMs: Date.now() - started,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "apply-categories failed", 500);
  }
}
