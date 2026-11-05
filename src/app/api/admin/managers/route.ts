/**
 * /api/admin/managers — warehouse manager accounts for the /warehouse portal.
 *   GET     — all managers with their warehouse
 *   POST    — create manager (admin picks warehouse + which admin sections to grant)
 *   PATCH   — update details / permissions / password / active
 *   DELETE  — remove manager
 * Auth: Super Admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const rows = await db.warehouseManager.findMany({
    include: { warehouse: { select: { id: true, name: true, city: true } } },
    orderBy: { createdAt: "desc" },
  });
  const warehouses = await db.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], select: { id: true, name: true, city: true } });
  return NextResponse.json({ rows, warehouses });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const b = await req.json();
    const name = String(b.name ?? "").trim();
    const username = String(b.username ?? "").trim();
    const password = String(b.password ?? "").trim();
    const warehouseId = String(b.warehouseId ?? "").trim();
    if (!name || !username || !password || !warehouseId) return jsonError("Name, username, password and warehouse are required");
    if (password.length < 4) return jsonError("Password must be at least 4 characters");

    const wh = await db.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) return jsonError("Warehouse not found");

    const dupe = await db.warehouseManager.findUnique({ where: { username } });
    if (dupe) return jsonError(`Username "${username}" already exists`);

    const manager = await db.warehouseManager.create({
      data: {
        name, username, password, warehouseId,
        phone: String(b.phone ?? ""), email: String(b.email ?? ""),
        permissions: JSON.stringify(Array.isArray(b.permissions) ? b.permissions : []),
        active: b.active === undefined ? true : Boolean(b.active),
      },
      include: { warehouse: { select: { id: true, name: true, city: true } } },
    });
    await db.activityLog.create({ data: { action: "CREATE", entity: "warehouseManager", entityId: manager.id, detail: `Manager "${name}" (${username}) created for ${wh.name}` } });
    return NextResponse.json({ ok: true, manager });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Create failed", 400);
  }
}

export async function PATCH(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const b = await req.json();
    const id = String(b.id ?? "");
    if (!id) return jsonError("Missing id");
    const data: Record<string, unknown> = {};
    if (b.name !== undefined) data.name = String(b.name).trim();
    if (b.phone !== undefined) data.phone = String(b.phone);
    if (b.email !== undefined) data.email = String(b.email);
    if (b.warehouseId !== undefined) data.warehouseId = String(b.warehouseId);
    if (b.permissions !== undefined) data.permissions = JSON.stringify(Array.isArray(b.permissions) ? b.permissions : []);
    if (b.active !== undefined) data.active = Boolean(b.active);
    if (b.password) {
      const pw = String(b.password).trim();
      if (pw.length < 4) return jsonError("Password must be at least 4 characters");
      data.password = pw;
    }
    if (b.username !== undefined) {
      const username = String(b.username).trim();
      const dupe = await db.warehouseManager.findFirst({ where: { username, NOT: { id } } });
      if (dupe) return jsonError(`Username "${username}" already exists`);
      data.username = username;
    }
    const manager = await db.warehouseManager.update({ where: { id }, data, include: { warehouse: { select: { id: true, name: true, city: true } } } });
    await db.activityLog.create({ data: { action: "UPDATE", entity: "warehouseManager", entityId: id, detail: `Manager "${manager.name}" updated` } });
    return NextResponse.json({ ok: true, manager });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Update failed", 400);
  }
}

export async function DELETE(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return jsonError("Missing id");
    const m = await db.warehouseManager.delete({ where: { id } });
    await db.activityLog.create({ data: { action: "DELETE", entity: "warehouseManager", entityId: id, detail: `Manager "${m.name}" (${m.username}) deleted` } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Delete failed", 400);
  }
}
