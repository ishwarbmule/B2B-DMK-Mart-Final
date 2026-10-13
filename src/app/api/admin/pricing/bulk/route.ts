/**
 * POST /api/admin/pricing/bulk — bulk price editing on purchase-cost basis.
 * Body: { target: "brand"|"category"|"products"|"all", ids: [], filters: {},
 *         basis: "purchaseCost"|"dealerPrice"|"mrp",
 *         ops: [{field: "mrp"|"dealerPrice"|"tier1".."tier5"|"dealPrice", mode: "percent"|"amount"|"set", value: number}],
 *         preview?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const FIELDS = ["mrp", "dealerPrice", "tier1", "tier2", "tier3", "tier4", "tier5", "dealPrice"] as const;
type Field = (typeof FIELDS)[number];

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = (await req.json()) as {
      target: "brand" | "category" | "products" | "all";
      brandIds?: string[];
      topId?: string; midId?: string; endId?: string;
      ids?: string[];
      ops: { field: string; mode: "percent" | "amount" | "set"; value: number }[];
      preview?: boolean;
    };
    if (!body.ops?.length) return jsonError("No operations provided");
    for (const op of body.ops) if (!FIELDS.includes(op.field as Field)) return jsonError(`Invalid field: ${op.field}`);

    const where: Record<string, unknown> = {};
    if (body.target === "brand" && body.brandIds?.length) where.brandId = { in: body.brandIds };
    if (body.target === "category") {
      if (body.endId) where.endId = body.endId;
      else if (body.midId) where.midId = body.midId;
      else if (body.topId) where.topId = body.topId;
      else return jsonError("Pick a category");
    }
    if (body.target === "products" && body.ids?.length) where.id = { in: body.ids };
    if (body.target === "all" && !body.preview) {
      return jsonError("Refusing to apply to ALL products without selection — use preview or pick a scope");
    }

    const products = await db.product.findMany({
      where,
      select: { id: true, sku: true, name: true, purchaseCost: true, dealerPrice: true, mrp: true, tier1: true, tier2: true, tier3: true, tier4: true, tier5: true, dealPrice: true },
      take: 2000,
    });

    const changes: { id: string; sku: string; name: string; updates: Record<string, number> }[] = [];
    for (const p of products) {
      const updates: Record<string, number> = {};
      for (const op of body.ops) {
        const basisVal =
          op.mode === "set" ? 0 :
          op.basis ? 0 :
          0; // basis chosen per op below
        void basisVal;
        const base =
          op.field === "mrp" ? p.mrp :
          op.field === "dealerPrice" ? p.dealerPrice :
          op.field === "tier1" ? p.tier1 :
          op.field === "tier2" ? p.tier2 :
          op.field === "tier3" ? p.tier3 :
          op.field === "tier4" ? p.tier4 :
          op.field === "tier5" ? p.tier5 :
          p.dealPrice;
        // basis: purchaseCost applied as the source for percent/amount ops on any field
        const basis = (body as { basis?: string }).basis === "purchaseCost" ? p.purchaseCost : base;
        let next = base;
        if (op.mode === "percent") next = Math.round(basis * (1 + op.value / 100) * 100) / 100;
        else if (op.mode === "amount") next = Math.round((basis + op.value) * 100) / 100;
        else next = Math.round(op.value * 100) / 100;
        if (next < 0) next = 0;
        if (next !== base) updates[op.field] = next;
      }
      if (Object.keys(updates).length) changes.push({ id: p.id, sku: p.sku, name: p.name, updates });
    }

    if (body.preview) {
      return NextResponse.json({ ok: true, preview: true, matched: products.length, changes: changes.slice(0, 25), totalChanges: changes.length });
    }

    let applied = 0;
    for (const ch of changes) {
      await db.product.update({ where: { id: ch.id }, data: ch.updates });
      for (const [field, newVal] of Object.entries(ch.updates)) {
        const oldP = products.find((p) => p.id === ch.id)!;
        const oldVal = Number((oldP as unknown as Record<string, number>)[field] ?? 0);
        await db.priceChangeLog.create({
          data: { productId: ch.id, sku: ch.sku, name: ch.name, field, oldVal, newVal, basis: (body as { basis?: string }).basis ?? "current", user: "Super Admin" },
        });
      }
      applied++;
    }
    await db.activityLog.create({
      data: { action: "UPDATE", entity: "pricing", detail: `Bulk pricing applied to ${applied} products (${body.ops.map((o) => `${o.field} ${o.mode} ${o.value}`).join(", ")})` },
    });
    return NextResponse.json({ ok: true, applied, matched: products.length });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Bulk pricing failed", 400);
  }
}

/** GET — recent price change log */
export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const logs = await db.priceChangeLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ logs });
}
