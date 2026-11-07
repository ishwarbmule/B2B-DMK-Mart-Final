/**
 * /api/admin/warehouse-stock — per-warehouse product quantities.
 *   GET  ?warehouseId=&q=&page=   → product list with current qty in that warehouse (+ totals)
 *   POST { warehouseId, rows: [{ productId, qty }] } → upsert quantities
 *   POST { warehouseId, action: "seed" } → seed this warehouse from Product.stock (missing rows only)
 *   POST { warehouseId, action: "bulkAdd" | "bulkRemove", mode: "ALL"|"BRAND"|"TOP"|"MID"|"END", id?, qty? }
 *        → bulk assign products to a warehouse — individually, brand-wise or category-wise.
 *          qty omitted/"STOCK" copies the product's live stock; a number sets a fixed qty.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { requireStaff, staffIdentity } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaff(req, "warehouseStock");
  if (unauthorized) return unauthorized;
  const sp = req.nextUrl.searchParams;
  let warehouseId = sp.get("warehouseId") || "";
  const q = (sp.get("q") || "").trim();
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const limit = 40;

  // manager scope — a godown manager can only read their own warehouse's stock
  const identity = await staffIdentity(req);
  if (identity?.role === "manager") warehouseId = identity.warehouseId;

  const warehouses = await db.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] });
  if (!warehouseId) return NextResponse.json({ warehouses, rows: [], total: 0, page, pages: 1 });

  const where = q
    ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] }
    : {};
  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, sku: true, name: true, image: true, stock: true, unit: true, packQty: true },
    }),
  ]);
  const stocks = await db.warehouseStock.findMany({ where: { warehouseId, productId: { in: products.map((p) => p.id) } } });
  const sMap = new Map(stocks.map((s) => [s.productId, s.qty]));
  const allocated = await db.warehouseStock.aggregate({ where: { warehouseId }, _sum: { qty: true } });

  return NextResponse.json({
    warehouses,
    rows: products.map((p) => ({ ...p, qty: sMap.get(p.id) ?? 0 })),
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
    warehouseTotal: allocated._sum.qty ?? 0,
  });
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaff(req, "warehouseStock");
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    let warehouseId = String(body.warehouseId || "");
    // manager scope — writes are forced onto their own godown
    const identity = await staffIdentity(req);
    if (identity?.role === "manager") warehouseId = identity.warehouseId;
    if (!warehouseId) return jsonError("Missing warehouseId");
    const wh = await db.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) return jsonError("Warehouse not found", 404);

    if (body.action === "bulkAdd" || body.action === "bulkRemove") {
      const mode = String(body.mode || "ALL").toUpperCase();
      const id = String(body.id || "");
      const isAdd = body.action === "bulkAdd";
      const where: Record<string, unknown> = { active: true };
      if (mode === "COMPANY") where.company = id;
      else if (mode === "BRAND") where.brandId = id;
      else if (mode === "TOP") where.topId = id;
      else if (mode === "MID") where.midId = id;
      else if (mode === "END") where.endId = id;
      // ALL → every active product

      const products = await db.product.findMany({ where, select: { id: true, stock: true } });
      if (!products.length) return NextResponse.json({ ok: true, affected: 0, message: "No products matched" });
      const ids = products.map((p) => p.id);

      if (!isAdd) {
        const res = await db.warehouseStock.deleteMany({ where: { warehouseId, productId: { in: ids } } });
        await db.activityLog.create({
          data: { action: "UPDATE", entity: "warehouse", entityId: warehouseId, detail: `Bulk removed ${res.count} products (${mode}${id ? `:${id}` : ""}) from warehouse "${wh.name}"` },
        });
        return NextResponse.json({ ok: true, affected: res.count });
      }

      const fixedQty = body.qty === undefined || body.qty === null || body.qty === "" || body.qty === "STOCK" ? null : Math.max(0, Math.round(Number(body.qty) || 0));
      const existing = await db.warehouseStock.findMany({ where: { warehouseId, productId: { in: ids } }, select: { productId: true } });
      const have = new Set(existing.map((e) => e.productId));
      const qtyOf = (p: { id: string; stock: number }) => (fixedQty === null ? Math.max(0, Math.round(p.stock)) : fixedQty);

      // create missing rows in bulk; refresh existing rows too (fixed qty) via raw UPDATE
      const missing = products.filter((p) => !have.has(p.id));
      for (let i = 0; i < missing.length; i += 500) {
        await db.warehouseStock.createMany({
          data: missing.slice(i, i + 500).map((p) => ({ warehouseId, productId: p.id, qty: qtyOf(p) })),
          skipDuplicates: true,
        });
      }
      let refreshed = 0;
      if (fixedQty !== null) {
        const res = await db.warehouseStock.updateMany({ where: { warehouseId, productId: { in: ids } }, data: { qty: fixedQty } });
        refreshed = res.count;
      }
      await db.activityLog.create({
        data: { action: "UPDATE", entity: "warehouse", entityId: warehouseId, detail: `Bulk added ${missing.length} products (${mode}${id ? `:${id}` : ""}) to warehouse "${wh.name}"${fixedQty !== null ? ` at fixed qty ${fixedQty}` : " from live stock"}` },
      });
      return NextResponse.json({ ok: true, affected: missing.length, refreshed });
    }

    if (body.action === "seed") {
      // copy Product.stock into missing WarehouseStock rows for this warehouse
      const products = await db.product.findMany({ where: { active: true, stock: { gt: 0 } }, select: { id: true, stock: true } });
      const existing = await db.warehouseStock.findMany({ where: { warehouseId }, select: { productId: true } });
      const have = new Set(existing.map((e) => e.productId));
      const missing = products.filter((p) => !have.has(p.id));
      await db.warehouseStock.createMany({ data: missing.map((p) => ({ warehouseId, productId: p.id, qty: Math.round(p.stock) })), skipDuplicates: true });
      await db.activityLog.create({ data: { action: "UPDATE", entity: "warehouse", entityId: warehouseId, detail: `Seeded ${missing.length} products into warehouse "${wh.name}" from live stock` } });
      return NextResponse.json({ ok: true, seeded: missing.length });
    }

    const rows: Array<{ productId: string; qty: number }> = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return jsonError("No rows to save");
    let upserted = 0;
    for (const r of rows) {
      const qty = Math.max(0, Math.round(Number(r.qty) || 0));
      await db.warehouseStock.upsert({
        where: { warehouseId_productId: { warehouseId, productId: r.productId } },
        create: { warehouseId, productId: r.productId, qty },
        update: { qty },
      });
      upserted++;
    }
    await db.activityLog.create({ data: { action: "UPDATE", entity: "warehouse", entityId: warehouseId, detail: `Warehouse "${wh.name}" stock updated (${upserted} products)` } });
    return NextResponse.json({ ok: true, upserted });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Save failed", 400);
  }
}
