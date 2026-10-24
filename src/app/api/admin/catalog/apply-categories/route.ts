/** POST /api/admin/catalog/apply-categories — bulk category taxonomy update.
 *  Body: { dryRun?: boolean, tops?: TopInput[], assignments?: AssignInput[] }
 *  - tops: upsert TopCategory by name (name/emoji/color/sortOrder/image)
 *  - assignments: { sku, top, mid, end } — ensures Mid (topId+name) and End (midId+name)
 *    chains exist, then re-points products (topId/midId/endId) in grouped updateMany batches.
 *  Idempotent: safe to re-run / chunk.
 *  GET: current top->mid tree with product counts (verification).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { db } from "@/lib/db";

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
      const row = await db.topCategory.upsert({
        where: { name },
        create: data,
        update: data,
      });
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

    // ── 3. Ensure mid/end chains + update products ──
    const midIdByKey = new Map<string, string>();
    const endIdByKey = new Map<string, string>();
    let midsCreated = 0, endsCreated = 0, productsUpdated = 0;

    if (!dryRun) {
      const topIds = [...new Set([...topIdByName.values()])];
      if (topIds.length) {
        const existingMids = await db.midCategory.findMany({
          where: { topId: { in: topIds } },
          select: { id: true, topId: true, name: true },
        });
        for (const m of existingMids) midIdByKey.set(`${m.topId}||${m.name}`, m.id);
      }
    }

    for (const g of groups.values()) {
      const topId = topIdByName.get(g.top)!;
      if (dryRun) { productsUpdated += g.skus.length; continue; }

      const midKey = `${topId}||${g.mid}`;
      let midId = midIdByKey.get(midKey);
      if (!midId) {
        const mid = await db.midCategory.upsert({
          where: { topId_name: { topId, name: g.mid } },
          create: { topId, name: g.mid },
          update: {},
        });
        midId = mid.id;
        midIdByKey.set(midKey, midId);
        midsCreated++;
      }

      const endKey = `${midId}||${g.end}`;
      let endId = endIdByKey.get(endKey);
      if (!endId) {
        const end = await db.endCategory.upsert({
          where: { midId_name: { midId, name: g.end } },
          create: { midId, name: g.end },
          update: {},
        });
        endId = end.id;
        endIdByKey.set(endKey, endId);
        endsCreated++;
      }

      // update in sku batches of 300 (MySQL IN-list size guard)
      for (let i = 0; i < g.skus.length; i += 300) {
        const batch = g.skus.slice(i, i + 300);
        const res = await db.product.updateMany({
          where: { sku: { in: batch } },
          data: { topId, midId, endId },
        });
        productsUpdated += res.count;
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      topsUpserted,
      groups: groups.size,
      midsCreated,
      endsCreated,
      productsUpdated,
      skipped: skipped.length,
      durationMs: Date.now() - started,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "apply-categories failed", 500);
  }
}
