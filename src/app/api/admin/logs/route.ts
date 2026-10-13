import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get("limit") || "100"));
  const rows = await db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return NextResponse.json({ rows });
}
