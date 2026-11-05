/**
 * POST /api/warehouse/login — warehouse-manager sign-in for the /warehouse portal.
 * Credentials are created by the Super Admin per warehouse; admin picks which
 * admin sections each manager can open (stored as a JSON permission list).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeStaffToken } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    const id = String(username ?? "").trim();
    const pass = String(password ?? "");
    if (!id || !pass) {
      return NextResponse.json({ error: "Enter username and password" }, { status: 400 });
    }

    const mgr = await db.warehouseManager.findFirst({ where: { OR: [{ username: id }, { email: id }] } });
    if (!mgr || !mgr.active || mgr.password !== pass) {
      return NextResponse.json({ error: "Invalid credentials — ask admin for your warehouse login" }, { status: 401 });
    }

    let permissions: string[] = [];
    try { permissions = JSON.parse(mgr.permissions || "[]") as string[]; } catch { permissions = []; }

    const wh = await db.warehouse.findUnique({ where: { id: mgr.warehouseId }, select: { id: true, name: true, city: true } });

    return NextResponse.json({
      ok: true,
      token: makeStaffToken("WHM", mgr.id),
      profile: {
        id: mgr.id, name: mgr.name, username: mgr.username,
        warehouseId: wh?.id ?? mgr.warehouseId,
        warehouseName: wh?.name ?? "",
        warehouseCity: wh?.city ?? "",
        permissions,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
