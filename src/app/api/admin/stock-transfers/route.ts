/**
 * /api/admin/stock-transfers — warehouse → warehouse stock movement (single or bulk).
 *   GET            → transfer history (latest 50, with items)
 *   POST { fromWarehouseId, toWarehouseId, note?, items: [{ productId, qty }] }
 *                 → atomically: validate → decrement source WarehouseStock →
 *                   upsert destination WarehouseStock → log transfer + activity.
 * One call = one executed move (status RECEIVED), so the ledger always matches reality.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const transfers = await db.stockTransfer.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      items: true,
      fromWarehouse: { select: { name: true, city: true } },
      toWarehouse: { select: { name: true, city: true } },
    },
  });
  return NextResponse.json({ transfers });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const fromWarehouseId = String(body.fromWarehouseId || "");
    const toWarehouseId = String(body.toWarehouseId || "");
    const note = String(body.note || "").slice(0, 300);
    const items: Array<{ productId: string; qty: number }> = Array.isArray(body.items) ? body.items : [];

    if (!fromWarehouseId || !toWarehouseId) return jsonError("Pick both source and destination warehouses");
    if (fromWarehouseId === toWarehouseId) return jsonError("Source and destination must be different warehouses");
    const clean = items
      .map((i) => ({ productId: String(i.productId), qty: Math.round(Number(i.qty) || 0) }))
      .filter((i) => i.productId && i.qty > 0);
    if (!clean.length) return jsonError("Add at least one product with a quantity");

    const [from, to] = await Promise.all([
      db.warehouse.findUnique({ where: { id: fromWarehouseId } }),
      db.warehouse.findUnique({ where: { id: toWarehouseId } }),
    ]);
    if (!from || !to) return jsonError("Warehouse not found", 404);

    // validate source stock + collect product snapshots
    const srcRows = await db.warehouseStock.findMany({ where: { warehouseId: fromWarehouseId, productId: { in: clean.map((i) => i.productId) } } });
    const srcMap = new Map(srcRows.map((r) => [r.productId, r.qty]));
    const prods = await db.product.findMany({ where: { id: { in: clean.map((i) => i.productId) } }, select: { id: true, sku: true, name: true } });
    const pMap = new Map(prods.map((p) => [p.id, p]));
    for (const it of clean) {
      const avail = srcMap.get(it.productId) ?? 0;
      if (it.qty > avail) {
        return jsonError(`${pMap.get(it.productId)?.name ?? it.productId}: only ${avail} in "${from.name}" — cannot move ${it.qty}`, 400);
      }
    }

    const count = await db.stockTransfer.count();
    const code = `TRF-${String(count + 1).padStart(4, "0")}`;

    const transfer = await db.$transaction(async (tx) => {
      // 1) decrement source (rows already exist — validated above)
      for (const it of clean) {
        await tx.warehouseStock.update({
          where: { warehouseId_productId: { warehouseId: fromWarehouseId, productId: it.productId } },
          data: { qty: { decrement: it.qty } },
        });
      }
      // 2) upsert destination
      for (const it of clean) {
        await tx.warehouseStock.upsert({
          where: { warehouseId_productId: { warehouseId: toWarehouseId, productId: it.productId } },
          create: { warehouseId: toWarehouseId, productId: it.productId, qty: it.qty },
          update: { qty: { increment: it.qty } },
        });
      }
      // 3) ledger
      return tx.stockTransfer.create({
        data: {
          code,
          fromWarehouseId,
          toWarehouseId,
          note,
          itemCount: clean.length,
          totalQty: clean.reduce((s, i) => s + i.qty, 0),
          items: { create: clean.map((i) => ({ productId: i.productId, sku: pMap.get(i.productId)?.sku ?? "", name: pMap.get(i.productId)?.name ?? "", qty: i.qty })) },
        },
        include: { items: true },
      });
    });

    await db.activityLog.create({
      data: {
        action: "TRANSFER", entity: "warehouse", entityId: transfer.id,
        detail: `${code}: moved ${transfer.totalQty} pcs of ${transfer.itemCount} products from "${from.name}" to "${to.name}"${note ? ` — ${note}` : ""}`,
      },
    });

    return NextResponse.json({ ok: true, transfer });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Transfer failed", 400);
  }
}
