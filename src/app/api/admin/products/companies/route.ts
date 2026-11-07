/** GET /api/admin/products/companies — distinct company list with product counts (inventory filter). */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaff(req, "products");
  if (unauthorized) return unauthorized;
  const rows = await db.product.groupBy({
    by: ["company"],
    _count: { _all: true },
    orderBy: { _count: { company: "desc" } },
  });
  const companies = rows
    .map((r) => ({ name: r.company || "(No company)", count: r._count._all }))
    .filter((c) => c.name !== "(No company)" || c.count > 0);
  return NextResponse.json({ companies });
}
