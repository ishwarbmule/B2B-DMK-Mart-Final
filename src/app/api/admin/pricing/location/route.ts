/**
 * POST /api/admin/pricing/location — location-wise bulk pricing (Neon ONLY;
 * the ERP MySQL is never written to by this or any other route).
 *
 * Body: {
 *   cities: string[],                      — target cities/towns (multi-select)
 *   warehouseId?: string,                  — optional scope: only products stocked at this godown
 *   target: "company" | "category" | "products" | "all",
 *   companies?: string[], topId?, midId?, endId?, ids?: string[],
 *   ops: [{ field: "dealerPrice" | "mrp", mode: "set" | "percent" | "amount", value: number }],
 *   clear?: boolean,                       — remove overrides for the given cities instead of setting
 *   preview?: boolean
 * }
 *
 * Store: Product.locationPrices JSON — { "<city>": { dealerPrice?, mrp? } }.
 * Resolution: lib/pricing.ts piecePriceOf() → a buyer whose Customer.city matches
 * sees the override; everyone else keeps the base slab prices untouched.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FIELDS = ["dealerPrice", "mrp"] as const;
type Field = (typeof FIELDS)[number];

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = (await req.json()) as {
      cities?: string[];
      warehouseId?: string;
      target?: "company" | "category" | "products" | "all";
      companies?: string[];
      topId?: string; midId?: string; endId?: string;
      ids?: string[];
      ops?: { field: string; mode: string; value: number }[];
      clear?: boolean;
      preview?: boolean;
    };

    const cities = [...new Set((body.cities || []).map((c) => String(c).trim()).filter(Boolean))];
    if (!cities.length) return jsonError("Pick at least one city/town");
    if (!body.clear) {
      if (!body.ops?.length) return jsonError("No price operations provided");
      for (const op of body.ops) {
        if (!FIELDS.includes(op.field as Field)) return jsonError(`Invalid field: ${op.field}`);
        if (!["set", "percent", "amount"].includes(op.mode)) return jsonError(`Invalid mode: ${op.mode}`);
        if (!Number.isFinite(op.value)) return jsonError("Operation value must be a number");
      }
    }

    const where: Record<string, unknown> = {};
    const target = body.target || "all";
    if (target === "company" && body.companies?.length) where.company = { in: body.companies };
    if (target === "category") {
      if (body.endId) where.endId = body.endId;
      else if (body.midId) where.midId = body.midId;
      else if (body.topId) where.topId = body.topId;
      else return jsonError("Pick a category");
    }
    if (target === "products") {
      if (!body.ids?.length) return jsonError("No products selected");
      where.id = { in: body.ids };
    }
    if (target === "all" && body.preview) { /* allowed for preview */ }
    if (target === "all" && !body.preview && !body.warehouseId) {
      return jsonError("Refusing to touch ALL products — pick a warehouse or a narrower scope");
    }
    if (body.warehouseId) where.warehouseStocks = { some: { warehouseId: body.warehouseId } };

    const products = await db.product.findMany({
      where,
      select: { id: true, sku: true, name: true, dealerPrice: true, mrp: true, locationPrices: true },
      take: 3000,
    });
    if (!products.length) return NextResponse.json({ ok: true, changed: 0, products: 0, cities });

    const changes: { sku: string; name: string; cityCount: number; dealerPrice?: number; mrp?: number }[] = [];

    if (body.preview) {
      for (const p of products.slice(0, 8)) {
        const first = body.ops?.[0];
        const base = first?.field === "mrp" ? p.mrp : p.dealerPrice;
        const val = first ? (first.mode === "set" ? first.value : first.mode === "percent" ? base * (1 + first.value / 100) : base + first.value) : base;
        changes.push({ sku: p.sku, name: p.name, cityCount: cities.length, dealerPrice: first?.field === "dealerPrice" ? Math.round(val * 100) / 100 : undefined, mrp: first?.field === "mrp" ? Math.round(val * 100) / 100 : undefined });
      }
      return NextResponse.json({ ok: true, preview: true, products: products.length, cities, sample: changes });
    }

    // merge per product: load current JSON, set/clear each city, save back
    let changed = 0;
    const nowIso = new Date();
    for (let i = 0; i < products.length; i += 250) {
      const batch = products.slice(i, i + 250);
      await Promise.all(batch.map(async (p) => {
        let map: Record<string, { dealerPrice?: number; mrp?: number }> = {};
        try { map = JSON.parse(p.locationPrices || "{}") as typeof map; } catch { map = {}; }
        map = map && typeof map === "object" ? map : {};
        for (const city of cities) {
          if (body.clear) {
            delete map[city];
            continue;
          }
          const cur = { ...(map[city] ?? {}) };
          for (const op of body.ops!) {
            const base = op.field === "mrp" ? p.mrp : p.dealerPrice;
            const v = op.mode === "set" ? op.value : op.mode === "percent" ? base * (1 + op.value / 100) : base + op.value;
            const rounded = Math.round(v * 100) / 100;
            if (op.field === "mrp") cur.mrp = rounded; else cur.dealerPrice = rounded;
          }
          map[city] = cur;
        }
        await db.product.update({
          where: { id: p.id },
          data: { locationPrices: JSON.stringify(map), updatedAt: nowIso },
        });
        changed++;
      }));
    }

    await db.activityLog.create({
      data: {
        action: "UPDATE", entity: "products", user: "Super Admin",
        detail: `Location pricing ${body.clear ? "cleared" : "applied"} — ${cities.length} cities × ${changed} products (${body.ops?.map((o) => `${o.field} ${o.mode} ${o.value}`).join(", ") ?? "clear"})`,
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, changed, products: products.length, cities });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Location pricing failed", 500);
  }
}
