import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { requireStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaff(req, "products");
  if (unauthorized) return unauthorized;
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const company = sp.get("company")?.trim() || "";
  const brand = sp.get("brand") || ""; // legacy param — old storefront-brand links only
  const flag = sp.get("flag") || "";
  const status = sp.get("status") || "";
  const top = sp.get("top") || "";
  const mid = sp.get("mid") || "";
  const end = sp.get("end") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20")));

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { sku: { contains: q } },
      { barcode: { contains: q } },
      { company: { contains: q } },
    ];
  }
  if (company) where.company = company;
  if (brand) where.brandId = brand;
  if (top) where.topId = top;
  if (mid) where.midId = mid;
  if (end) where.endId = end;
  if (flag === "hot") where.isHot = true;
  if (flag === "top") where.isTop = true;
  if (flag === "featured") where.isFeatured = true;
  if (flag === "deal") where.isDeal = true;
  if (status === "active") where.active = true;
  if (status === "inactive") where.active = false;
  if (status === "lowstock") where.stock = { lte: 10 };

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        brand: { select: { name: true, slug: true, logo: true } },
        top: { select: { id: true, name: true } },
        mid: { select: { id: true, name: true } },
        end: { select: { id: true, name: true } },
      },
    }),
  ]);
  return NextResponse.json({ rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaff(req, "products");
  if (unauthorized) return unauthorized;
  try {
    const b = await req.json();
    if (!b.name || !b.company || !b.topId || !b.midId || !b.endId) {
      return jsonError("Name, Company and Top/Mid/End Category are required");
    }
    if (!b.dealerPrice || Number(b.dealerPrice) <= 0) return jsonError("Selling price (tier4) is required");
    if (!b.mrp || Number(b.mrp) <= 0) return jsonError("MRP is required");
    const sku = b.sku || String(Math.floor(10000 + Math.random() * 89999));
    const exists = await db.product.findUnique({ where: { sku } });
    if (exists) return jsonError(`SKU ${sku} already exists`);
    const slugify = (s: string) => s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "item";
    let slug = slugify(`${b.company || "dmk"}-${b.name}`);
    if (await db.product.findUnique({ where: { slug } })) slug = `${slug}-${sku.slice(-5).toLowerCase()}`;
    const gallery = Array.isArray(b.gallery)
      ? (b.gallery as unknown[]).filter((u): u is string => typeof u === "string" && !!u.trim()).slice(0, 10)
      : [];
    const row = await db.product.create({
      data: {
        sku,
        slug,
        name: b.name,
        company: String(b.company || "").slice(0, 190),
        topId: b.topId, midId: b.midId, endId: b.endId,
        unit: b.unit || "Pcs",
        dealerPrice: Number(b.dealerPrice) || 0,
        basePrice: Number(b.basePrice) || Number(b.dealerPrice) || 0,
        mrp: Number(b.mrp) || 0,
        purchaseCost: Number(b.purchaseCost) || 0,
        tier1: Number(b.tier1) || 0, tier2: Number(b.tier2) || 0, tier3: Number(b.tier3) || 0,
        tier4: Number(b.tier4) || Number(b.dealerPrice) || 0, tier5: Number(b.tier5) || Number(b.mrp) || 0,
        deliveryRate: Number(b.deliveryRate) || 0,
        packPrice: Number(b.packPrice) || 0,
        packQty: Math.max(1, parseInt(b.packQty) || 1),
        piecesPerBox: parseInt(b.piecesPerBox) || 0,
        stock: parseInt(b.stock) || 0,
        damagedStock: parseInt(b.damagedStock) || 0,
        lowStockThreshold: parseInt(b.lowStockThreshold) || 10,
        barcode: b.barcode || sku,
        hsn: b.hsn || "",
        gst: Number(b.gst) || 18,
        weightGrams: Number(b.weightGrams) || 0,
        image: b.image || "/dmk-logo.png",
        gallery: JSON.stringify(gallery),
        description: b.description || "",
        seoTitle: b.seoTitle || "",
        seoDesc: b.seoDesc || "",
        keywords: b.keywords || "",
        isHot: !!b.isHot, isTop: !!b.isTop, isFeatured: !!b.isFeatured, isDeal: !!b.isDeal,
        dealPrice: Number(b.dealPrice) || 0,
        active: b.active !== false,
        activeSource: "ADMIN",
        syncSource: "LOCAL",
      },
    });
    await db.activityLog.create({ data: { action: "CREATE", entity: "product", entityId: row.id, detail: `Product "${row.name}" (${row.sku}) created via Add Products` } });
    return NextResponse.json({ row });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Create failed", 400);
  }
}

export async function PATCH(req: NextRequest) {
  const unauthorized = await requireStaff(req, "products");
  if (unauthorized) return unauthorized;
  try {
    const { id, ...data } = await req.json();
    if (!id) return jsonError("Missing id");
    const clean: Record<string, unknown> = {};
    const numFields = ["dealerPrice", "basePrice", "mrp", "gst", "stock", "packQty", "piecesPerBox", "purchaseCost", "tier1", "tier2", "tier3", "tier4", "tier5", "deliveryRate", "packPrice", "dealPrice", "weightGrams", "lowStockThreshold", "damagedStock", "rating"];
    const boolFields = ["isHot", "isTop", "isFeatured", "isDeal", "active"];
    const strFields = ["name", "sku", "barcode", "hsn", "image", "gallery", "company", "topId", "midId", "endId", "description", "seoTitle", "seoDesc", "keywords", "unit"];
    for (const k of strFields) if (k in data) clean[k] = k === "company" ? String(data[k] ?? "").slice(0, 190) : data[k];
    for (const k of numFields) if (k in data) clean[k] = Number(data[k]) || 0;
    for (const k of boolFields) if (k in data) clean[k] = !!data[k];
    // Manual admin activation/deactivation is recorded so ERP pulls never undo it (last-writer-wins).
    if ("active" in clean) clean.activeSource = "ADMIN";
    const row = await db.product.update({
      where: { id: String(id) },
      data: clean,
      include: { brand: { select: { name: true } } },
    });
    await db.activityLog.create({ data: { action: "UPDATE", entity: "product", entityId: row.id, detail: `Product "${row.name}" (${row.sku}) updated` } });
    return NextResponse.json({ row });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Update failed", 400);
  }
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireStaff(req, "products");
  if (unauthorized) return unauthorized;
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return jsonError("Missing id");
    const row = await db.product.delete({ where: { id } });
    await db.activityLog.create({ data: { action: "DELETE", entity: "product", entityId: id, detail: `Product "${row.name}" (${row.sku}) deleted` } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Delete failed", 400);
  }
}
