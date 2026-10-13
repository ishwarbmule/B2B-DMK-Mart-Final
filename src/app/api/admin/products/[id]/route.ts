import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractToken, verifyToken } from "@/lib/admin-auth";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(240).optional(),
  brand: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  categoryId: z.string().min(1).optional(),
  price: z.number().nonnegative().optional(),
  mrp: z.number().nonnegative().optional(),
  tier1: z.number().nonnegative().optional(),
  tier2: z.number().nonnegative().optional(),
  tier3: z.number().nonnegative().optional(),
  tier4: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  packQty: z.number().int().positive().optional(),
  unit: z.string().max(20).optional(),
  hsn: z.string().max(20).optional(),
  gst: z.number().min(0).max(100).optional(),
  stock: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyToken(extractToken(req.headers.get("x-admin-token")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const d = { ...parsed.data };
    const current = await db.product.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const price = d.price ?? current.price;
    const mrp = d.mrp ?? current.mrp;
    if (mrp < price) d.mrp = price;

    const packQty = d.packQty ?? current.packQty;
    const unit = d.unit ?? current.unit;

    const product = await db.product.update({
      where: { id },
      data: {
        ...d,
        packSize: packQty > 1 ? `Pack of ${packQty}` : `1 ${unit}`,
      },
      include: { category: { select: { name: true, color: true } } },
    });
    return NextResponse.json({ product });
  } catch (err) {
    console.error("PATCH /api/admin/products/[id] failed", err);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyToken(extractToken(req.headers.get("x-admin-token")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    await db.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/products/[id] failed", err);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
