/**
 * /api/salesteam/customers — the salesperson's shop book (portal: /salesteam).
 *   GET  — customers created by this salesperson + every customer they have placed
 *          orders for (the shops on their beat).
 *   POST — create a new customer account while visiting a new shop: all shop details
 *          + location (address, city, pincode) + customer type. createdBy = salesperson.
 * Auth: SLS staff token (lib/staff-auth.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { staffIdentity } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2),
  shopName: z.string().optional().or(z.literal("")),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  email: z.string().email().optional().or(z.literal("")),
  gstin: z.string().optional().or(z.literal("")),
  address: z.string().min(6),
  city: z.string().min(2),
  pincode: z.string().regex(/^\d{6}$/),
  customerType: z.enum(["RETAILER", "WHOLESALE", "SEMI_WHOLESALE", "DISTRIBUTOR"]).optional(),
});

export async function GET(req: NextRequest) {
  const identity = await staffIdentity(req);
  if (!identity || identity.role !== "salesperson") {
    return NextResponse.json({ error: "Salesperson login required" }, { status: 401 });
  }
  const name = identity.name;

  const [created, servedOrders] = await Promise.all([
    db.customer.findMany({ where: { createdBy: name }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.order.findMany({ where: { salesPerson: name }, select: { customerId: true, phone: true }, take: 500 }),
  ]);

  // shops served on the beat (orders placed for them) — union by id/phone, keep createdBy ones
  const servedIds = new Set(servedOrders.map((o) => o.customerId).filter(Boolean));
  const servedPhones = new Set(servedOrders.map((o) => o.phone));
  const extra = await db.customer.findMany({
    where: { OR: [{ id: { in: [...servedIds] } }, { phone: { in: [...servedPhones] } }] },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const byKey = new Map<string, (typeof created)[number]>();
  for (const c of [...created, ...extra]) byKey.set(c.phone, c);
  const customers = [...byKey.values()].map((c) => ({ ...c, mine: c.createdBy === name }));

  return NextResponse.json({ customers, count: customers.length });
}

export async function POST(req: NextRequest) {
  const identity = await staffIdentity(req);
  if (!identity || identity.role !== "salesperson") {
    return NextResponse.json({ error: "Salesperson login required" }, { status: 401 });
  }

  try {
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid customer data", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const d = parsed.data;

    const existing = await db.customer.findUnique({ where: { phone: d.phone } });
    if (existing) {
      return NextResponse.json({ error: `A customer with phone ${d.phone} already exists (${existing.name})` }, { status: 400 });
    }

    const customer = await db.customer.create({
      data: {
        name: d.name,
        shopName: d.shopName || "",
        phone: d.phone,
        email: d.email || "",
        gstin: d.gstin || "",
        address: d.address,
        city: d.city,
        pincode: d.pincode,
        customerType: d.customerType || "RETAILER",
        tier: "tier2",
        status: "PENDING",
        source: "WEB",
        createdBy: identity.name,
      },
    });

    await db.activityLog.create({
      data: { action: "CREATE", entity: "customer", entityId: customer.id, detail: `New shop "${d.shopName || d.name}" (${d.phone}) added by salesperson ${identity.name}` },
    });

    return NextResponse.json({ ok: true, customer });
  } catch (e) {
    console.error("[salesteam/customers] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
