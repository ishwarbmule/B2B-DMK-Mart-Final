/** POST /api/auth/register — B2B account signup. Tier/pricing is NEVER self-selected:
 *  the buyer only declares a business type (no pricing shown); DMK Mart assigns the
 *  price tier at approval time from the admin panel. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2),
  shopName: z.string().min(2),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6),
  customerType: z.enum(["RETAILER", "WHOLESALE", "SEMI_WHOLESALE", "DISTRIBUTOR"]),
  gstin: z.string().optional().or(z.literal("")),
  city: z.string().min(2, "Enter your city (delivery location)"),
  pincode: z.string().regex(/^\d{6}$/, "Enter the 6-digit pincode of your location"), // buyer location → nearest warehouse
  address: z.string().optional().or(z.literal("")),
  // Store map — pin dropped on the signup map. Required so the admin Store Map
  // section shows every customer store (lat/lng validated range; source = MAP|GPS).
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  geoSource: z.enum(["MAP", "GPS"]).default("MAP"),
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
      tier: "tier4", // assigned by admin at approval — never self-selected
      gstin: d.gstin || "",
      city: d.city || "",
      pincode: d.pincode || "",
      address: d.address || "",
      lat: d.lat,
      lng: d.lng,
      geoSource: d.geoSource,
      geoUpdatedAt: new Date(),
      status: "PENDING",
      source: "WEB",
      creditLimit: 0, // assigned by admin at approval
    },
  });
  return NextResponse.json({
    ok: true,
    message: "Account created! It will open as soon as the DMK Mart team verifies your business — you'll get a WhatsApp message once approved.",
    customer: { id: customer.id, name: customer.name, customerType: customer.customerType, status: customer.status },
  });
}
