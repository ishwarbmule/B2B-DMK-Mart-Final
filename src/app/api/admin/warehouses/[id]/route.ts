/**
 * /api/admin/warehouses/[id] — update / delete one warehouse.
 *   PATCH   { name?, code?, city?, address?, phone?, isDefault?, active?, sortOrder? }
 *           → isDefault=true unsets every other default (transaction);
 *             non-empty code must stay unique (409 on clash).
 *   DELETE  → removes the godown; if the row is still referenced (transfers, etc.)
 *             Prisma throws P2003 and we ask the admin to deactivate instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Prisma errors carry `code` on the instance — read it without importing the namespace. */
const errCode = (e: unknown) => (e as { code?: string } | null)?.code;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const { id } = await ctx.params;
  try {
    const wh = await db.warehouse.findUnique({ where: { id } });
    if (!wh) return jsonError("Warehouse not found", 404);
    const body = await req.json();

    const data: {
      name?: string; code?: string; city?: string; address?: string; phone?: string;
      sortOrder?: number; active?: boolean;
    } = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return jsonError("Name cannot be empty");
      data.name = name;
    }
    if (body.code !== undefined) {
      const code = String(body.code).trim();
      if (code) {
        const clash = await db.warehouse.findFirst({ where: { code, id: { not: id } } });
        if (clash) return jsonError("Warehouse code already in use", 409);
      }
      data.code = code;
    }
    if (body.city !== undefined) data.city = String(body.city || "");
    if (body.address !== undefined) data.address = String(body.address || "");
    if (body.phone !== undefined) data.phone = String(body.phone || "");
    if (body.sortOrder !== undefined) data.sortOrder = Math.max(0, Math.round(Number(body.sortOrder) || 0));
    if (body.active !== undefined) data.active = Boolean(body.active);

    const isDefault = body.isDefault === undefined ? undefined : Boolean(body.isDefault);
    if (isDefault) {
      await db.$transaction([
        db.warehouse.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } }),
        db.warehouse.update({ where: { id }, data: { ...data, isDefault: true } }),
      ]);
    } else {
      await db.warehouse.update({ where: { id }, data });
    }
    const updated = await db.warehouse.findUnique({ where: { id } });
    if (isDefault) {
      await db.activityLog.create({ data: { action: "UPDATE", entity: "warehouse", entityId: id, detail: `"${updated?.name}" is now the default warehouse` } });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Update failed", 400);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const { id } = await ctx.params;
  try {
    const wh = await db.warehouse.findUnique({ where: { id } });
    if (!wh) return jsonError("Warehouse not found", 404);
    await db.warehouse.delete({ where: { id } });
    await db.activityLog.create({ data: { action: "DELETE", entity: "warehouse", entityId: id, detail: `Deleted warehouse "${wh.name}"` } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (errCode(e) === "P2003") return jsonError("Warehouse has stock, managers or transfers — deactivate it instead", 409);
    if (errCode(e) === "P2025") return jsonError("Warehouse not found", 404);
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Delete failed", 400);
  }
}
