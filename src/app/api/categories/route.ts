import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const categories = await db.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json({ categories });
  } catch (err) {
    console.error("GET /api/categories failed", err);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}
