/**
 * POST /api/salesteam/login — salesperson sign-in for the /salesteam portal.
 * Credentials are created by the Super Admin (Salesperson Management).
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

    const sp = await db.salesPerson.findFirst({
      where: { OR: [{ username: id }, { mobile: id }] },
    });
    if (!sp || !sp.active || !sp.password || sp.password !== pass) {
      return NextResponse.json({ error: "Invalid credentials — ask admin for your sales-team login" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      token: makeStaffToken("SLS", sp.id),
      profile: { id: sp.id, name: sp.name, mobile: sp.mobile, area: sp.area, email: sp.email, historyAccess: sp.historyAccess },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
