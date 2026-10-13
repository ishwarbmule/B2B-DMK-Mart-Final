import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public store directory for the storefront (approved stores only) */
export async function GET() {
  const rows = await db.store.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, manager: true, phone: true, zone: true, city: true, area: true, status: true },
  });
  return NextResponse.json({ rows });
}
