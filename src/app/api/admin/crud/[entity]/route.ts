import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type AnyRec = Record<string, unknown>;

interface EntityDef {
  model: keyof typeof db & string;
  label: string;
  nameField: string;
  include?: AnyRec;
  orderBy?: AnyRec;
}

const ENTITIES: Record<string, EntityDef> = {
  tops: { model: "topCategory", label: "Top Category", nameField: "name", orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: true } } } },
  mids: { model: "midCategory", label: "Mid Category", nameField: "name", include: { top: true }, orderBy: { name: "asc" } },
  ends: { model: "endCategory", label: "End Category", nameField: "name", include: { mid: { include: { top: true } } }, orderBy: { name: "asc" } },
  sizes: { model: "size", label: "Size", nameField: "name", orderBy: { name: "asc" } },
  colors: { model: "color", label: "Color", nameField: "name", orderBy: { name: "asc" } },
  stores: { model: "store", label: "Store", nameField: "name", orderBy: { createdAt: "desc" } },
  zones: { model: "zone", label: "Zone", nameField: "name", orderBy: { name: "asc" } },
  coupons: { model: "coupon", label: "Coupon", nameField: "code", orderBy: { createdAt: "desc" } },
  offers: { model: "offer", label: "Offer", nameField: "name", orderBy: { createdAt: "desc" } },
  slabs: { model: "priceSlab", label: "Price Slab", nameField: "title", orderBy: { minQty: "asc" } },
  ads: { model: "ad", label: "Ad", nameField: "title", orderBy: { sortOrder: "asc" }, include: { brand: true } },
  sliders: { model: "slider", label: "Slider", nameField: "heading", orderBy: { sortOrder: "asc" } },
  salespersons: { model: "salesPerson", label: "Salesperson", nameField: "name", orderBy: { createdAt: "desc" } },
  delivery: { model: "deliveryMan", label: "Delivery Man", nameField: "name", orderBy: { createdAt: "desc" } },
  customers: { model: "customer", label: "Customer", nameField: "name", orderBy: { createdAt: "desc" } },
  users: { model: "adminUser", label: "User", nameField: "fullName", orderBy: { createdAt: "desc" } },
  brands: { model: "brand", label: "Brand", nameField: "name", include: { _count: { select: { products: true } } }, orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }] },
  pages: { model: "page", label: "Page", nameField: "title", orderBy: { sortOrder: "asc" } },
  warehouses: { model: "warehouse", label: "Warehouse", nameField: "name", orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], include: { _count: { select: { stocks: true } } } },
  seoMeta: { model: "seoMeta", label: "SEO Meta", nameField: "path", orderBy: { path: "asc" } },
  purchases: { model: "purchase", label: "Purchase", nameField: "ref", orderBy: { createdAt: "desc" } },
  returns: { model: "returnRequest", label: "Return", nameField: "orderId", orderBy: { createdAt: "desc" } },
};

function def(entity: string): EntityDef {
  const d = ENTITIES[entity];
  if (!d) throw new Error("Unknown entity");
  return d;
}

/** DateTime fields used across crud-managed models (Offer/Coupon windows, etc.).
 *  The admin forms submit plain text ("" or "YYYY-MM-DD") — convert to what Prisma expects. */
function sanitizeDates(data: AnyRec): AnyRec {
  const out: AnyRec = { ...data };
  for (const key of ["startAt", "endAt"]) {
    if (!(key in out)) continue;
    const v = out[key];
    if (v === "" || v === undefined || v === null) {
      out[key] = null;
    } else if (typeof v === "string") {
      const d = new Date(v);
      out[key] = Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return out;
}

/** Turn raw Prisma errors into short, human-readable messages for admin toasts. */
function friendlyError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  const msg = e instanceof Error ? e.message : String(e);
  if (code === "P2002" || /Unique constraint/i.test(msg)) {
    const field = msg.match(/fields?:\s*\(?`?(\w+)`?/)?.[1] ?? msg.match(/constraint: `?(\w+)/)?.[1] ?? "value";
    return `"${field}" already exists — use a different one`;
  }
  if (code === "P2025" || /Record to (update|delete) not found/i.test(msg)) return "Record not found (it may have been deleted)";
  if (code === "P2003") return "Linked record missing — check the selected reference";
  // Extract "Argument xyz: ..." lines from Prisma invocation dumps
  const arg = msg.match(/Argument `?(\w+)`?:\s*([^{\n]+)/);
  if (arg) return `Invalid value for "${arg[1]}" — ${arg[2].trim().slice(0, 120)}`;
  const firstLine = msg.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("{") && !l.startsWith("}") && !l.startsWith("data:") && !l.includes("invocation") && !l.startsWith("Invalid `prisma"))[0];
  return (firstLine || "Operation failed").slice(0, 200);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "offer";
}

/** Offer.slug is @unique but the admin form historically had no slug field —
 *  every admin-created offer collided on slug="". Auto-generate a unique one. */
async function ensureOfferSlug(data: AnyRec): Promise<void> {
  if (typeof data.slug !== "string" || !data.slug.trim()) {
    const base = slugify(String(data.name ?? "offer"));
    let slug = base;
    let n = 2;
    while (await db.offer.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${n++}`;
    }
    data.slug = slug;
  }
}

async function log(action: string, entity: string, detail: string) {
  try {
    await db.activityLog.create({ data: { action, entity, detail, user: "Super Admin" } });
  } catch { /* non-blocking */ }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const { entity } = await ctx.params;
    const d = def(entity);
    const rows = await (db as never as AnyRec)[d.model].findMany({
      include: d.include,
      orderBy: d.orderBy ?? { createdAt: "desc" },
    });
    return NextResponse.json({ rows });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "List failed", 400);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const { entity } = await ctx.params;
  const d = def(entity);
  try {
    const body = sanitizeDates(((await req.json()) as AnyRec) ?? {});
    delete body.id;
    delete body.createdAt;
    if (entity === "offers") await ensureOfferSlug(body);
    const row = await (db as never as AnyRec)[d.model].create({ data: body, include: d.include });
    await log("CREATE", entity, `${d.label} "${String(body[d.nameField] ?? "")}" created`);
    return NextResponse.json({ row });
  } catch (e) {
    return jsonError(friendlyError(e), 400);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const { entity } = await ctx.params;
  const d = def(entity);
  try {
    const body = sanitizeDates(((await req.json()) as AnyRec) ?? {});
    const { id, ...data } = body;
    if (!id) return jsonError("Missing id");
    delete data.createdAt;
    const row = await (db as never as AnyRec)[d.model].update({ where: { id: String(id) }, data, include: d.include });
    await log("UPDATE", entity, `${d.label} "${String(row[d.nameField] ?? id)}" updated`);
    return NextResponse.json({ row });
  } catch (e) {
    return jsonError(friendlyError(e), 400);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const { entity } = await ctx.params;
  const d = def(entity);
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return jsonError("Missing id");
    const row = await (db as never as AnyRec)[d.model].delete({ where: { id } });
    await log("DELETE", entity, `${d.label} "${String(row[d.nameField] ?? id)}" deleted`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(friendlyError(e), 400);
  }
}
