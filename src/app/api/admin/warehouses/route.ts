/**
 * /api/admin/warehouses — Super Admin warehouse CRUD (godowns).
 *   GET           → all warehouses ordered isDefault desc → name asc, each with
 *                   productCount (stock rows) + totalStock (sum of qty)
 *   GET ?id=<id>  → detail: { warehouse, products: WarehouseStock ⋈ Product, ordered by product name }
 *   POST          → create a LOCAL warehouse (source is forced to "LOCAL" — ERP godowns
 *                   are only ever mirrored by the universal sync), unique non-empty code,
 *                   isDefault=true unsets every other default in the same transaction.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const id = req.nextUrl.searchParams.get("id") || "";

  if (id) {
    // detail — one warehouse + every stock row joined to its product
    const warehouse = await db.warehouse.findUnique({ where: { id } });
    if (!warehouse) return jsonError("Warehouse not found", 404);
    const rows = await db.warehouseStock.findMany({
      where: { warehouseId: id },
      orderBy: { product: { name: "asc" } },
      include: {
        product: {
          select: { id: true, sku: true, name: true, image: true, unit: true, packQty: true, dealerPrice: true, mrp: true, stock: true },
        },
      },
    });
    return NextResponse.json({
      warehouse,
      products: rows.map((r) => ({
        stockId: r.id,
        productId: r.product.id,
        sku: r.product.sku,
        name: r.product.name,
        image: r.product.image,
        qty: r.qty,
        unit: r.product.unit,
        packQty: r.product.packQty,
        dealerPrice: r.product.dealerPrice,
        mrp: r.product.mrp,
        stock: r.product.stock,
      })),
    });
  }

  // list — only in-scope godowns. ERP rows the admin unticked in Data Sync are
  // hidden entirely (never shown as "INACTIVE" — the wizard owns their visibility);
  // admin-created LOCAL godowns always appear so they stay manageable.
  const [warehouses, totals] = await Promise.all([
    db.warehouse.findMany({
      where: { OR: [{ active: true }, { source: { not: "ERP" } }] },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: { _count: { select: { stocks: true } } },
    }),
    db.warehouseStock.groupBy({ by: ["warehouseId"], _sum: { qty: true } }),
  ]);
  const totalMap = new Map(totals.map((t) => [t.warehouseId, t._sum.qty ?? 0]));

  return NextResponse.json({
    warehouses: warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      code: w.code,
      source: w.source,
      address: w.address,
      city: w.city,
      phone: w.phone,
      isDefault: w.isDefault,
      active: w.active,
      sortOrder: w.sortOrder,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      productCount: w._count.stocks,
      totalStock: totalMap.get(w.id) ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return jsonError("Name is required");
    const code = String(body.code || "").trim();
    if (code) {
      const clash = await db.warehouse.findFirst({ where: { code } });
      if (clash) return jsonError("Warehouse code already in use", 409);
    }
    const data = {
      name,
      code,
      source: "LOCAL", // admin-created godowns are always LOCAL — the ERP sync owns "ERP" rows
      address: String(body.address || ""),
      city: String(body.city || ""),
      phone: String(body.phone || ""),
      isDefault: Boolean(body.isDefault),
      active: body.active === undefined ? true : Boolean(body.active),
      sortOrder: Math.max(0, Math.round(Number(body.sortOrder) || 0)),
    };
    const created = data.isDefault
      ? (await db.$transaction([
          db.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
          db.warehouse.create({ data }),
        ]))[1]
      : await db.warehouse.create({ data });
    await db.activityLog.create({
      data: {
        action: "CREATE",
        entity: "warehouse",
        entityId: created.id,
        detail: `Created LOCAL warehouse "${name}"${code ? ` (${code})` : ""}`,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Create failed", 400);
  }
}
