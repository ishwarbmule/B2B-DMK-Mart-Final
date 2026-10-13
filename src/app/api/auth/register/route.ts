/** POST /api/auth/register — B2B account signup (RETAILER / WHOLESALE / DISTRIBUTOR). */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const TIER_BY_TYPE: Record<string, string> = { RETAILER: "tier4", WHOLESALE: "tier2", DISTRIBUTOR: "tier1" };

const schema = z.object({
  name: z.string().min(2),
  shopName: z.string().min(2),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6),
  customerType: z.enum(["RETAILER", "WHOLESALE", "DISTRIBUTOR"]),
  gstin: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
});

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  const d = parsed.data;
  const exists = await db.customer.findUnique({ where: { phone: d.phone } });
  if (exists) return NextResponse.json({ error: "This phone number is already registered. Please login." }, { status: 409 });
  const customer = await db.customer.create({
    data: {
      name: d.name,
      shopName: d.shopName,
      phone: d.phone,
      email: d.email || "",
      password: sha(d.password),
      customerType: d.customerType,
      tier: TIER_BY_TYPE[d.customerType] ?? "tier4",
      gstin: d.gstin || "",
      city: d.city || "",
      address: d.address || "",
      status: "PENDING",
      source: "WEB",
      creditLimit: d.customerType === "DISTRIBUTOR" ? 500000 : d.customerType === "WHOLESALE" ? 200000 : 50000,
    },
  });
  return NextResponse.json({
    ok: true,
    message: "Account created! It will be active once the DMK Mart team approves your business account.",
    customer: { id: customer.id, name: customer.name, customerType: customer.customerType, status: customer.status },
  });
}
