/** POST /api/coupons/validate — validate a coupon against the current cart. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().min(2),
  itemTotal: z.number().nonnegative(),
  productIds: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  const { code, itemTotal, productIds } = parsed.data;
  const c = await db.coupon.findFirst({ where: { code: code.toUpperCase().trim(), active: true } });
  if (!c) return NextResponse.json({ ok: false, error: "Coupon not found" }, { status: 404 });
  const now = new Date();
  if (c.startAt && c.startAt > now) return NextResponse.json({ ok: false, error: "Coupon not active yet" }, { status: 400 });
  if (c.endAt && c.endAt < now) return NextResponse.json({ ok: false, error: "Coupon expired" }, { status: 400 });
  if (c.usageLimit > 0 && c.usedCount >= c.usageLimit) return NextResponse.json({ ok: false, error: "Coupon fully redeemed" }, { status: 400 });
  if (itemTotal < c.minOrder) return NextResponse.json({ ok: false, error: `Minimum order ₹${c.minOrder.toLocaleString("en-IN")} required` }, { status: 400 });

  let scopeOk = true;
  if (c.scopeType !== "ALL") {
    const products = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, brandId: true, topId: true, midId: true, endId: true, brand: { select: { slug: true } } } });
    const scopeIds = JSON.parse(c.scopeIds || "[]") as string[];
    scopeOk = products.some((p) => {
      if (c.scopeType === "BRAND") return scopeIds.includes(p.brand.slug);
      if (c.scopeType === "PRODUCT") return scopeIds.includes(p.id);
      if (c.scopeType === "CATEGORY") return scopeIds.includes(p.endId) || scopeIds.includes(p.midId) || scopeIds.includes(p.topId);
      return false;
    });
    if (!scopeOk) return NextResponse.json({ ok: false, error: `Coupon applies only to selected ${c.scopeType.toLowerCase()}s` }, { status: 400 });
  }

  const raw = c.type === "PERCENT" ? itemTotal * c.value / 100 : c.value;
  const discount = c.maxDiscount > 0 ? Math.min(raw, c.maxDiscount) : raw;
  return NextResponse.json({
    ok: true, code: c.code, headline: c.headline, type: c.type, value: c.value,
    discount: Math.round(discount * 100) / 100,
  });
}
