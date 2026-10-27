/**
 * /api/admin/customers/approve — B2B buyer account approvals.
 *   GET  → all PENDING accounts (full details) + counts
 *   POST { id, action: "APPROVE" | "REJECT", tier, customerType }
 *        → updates the account and returns a premade WhatsApp welcome text.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  RETAILER: "Retailer",
  WHOLESALE: "Wholesaler",
  SEMI_WHOLESALE: "Semi-Wholesaler",
  DISTRIBUTOR: "Distributor",
};
const TIER_LABEL: Record<string, string> = {
  tier1: "Tier 1 (Distributor)",
  tier2: "Tier 2 (Wholesale)",
  tier3: "Tier 3 (Semi-Wholesale)",
  tier4: "Tier 4 (Retail)",
};
const DEFAULT_LIMIT: Record<string, number> = {
  RETAILER: 50000, SEMI_WHOLESALE: 100000, WHOLESALE: 200000, DISTRIBUTOR: 500000,
};

function waTextFor(c: { shopName: string; name: string; phone: string; customerType: string; tier: string }, support: string) {
  const shop = c.shopName || c.name;
  return [
    `🎉 Welcome to DMK Mart B2B, ${shop}!`,
    ``,
    `✅ Your business account is APPROVED.`,
    `👤 Account: ${c.name}`,
    `📱 Login mobile: ${c.phone}`,
    `🏷️ Price tier: ${TIER_LABEL[c.tier] ?? c.tier} (${TYPE_LABEL[c.customerType] ?? c.customerType})`,
    ``,
    `🛒 Login & start ordering: https://b2b-dmk-mart.vercel.app/account`,
    `📦 Bulk auto-slabs: ₹5,000+ 2% · ₹25,000+ 4% · ₹50,000+ 7% · ₹1,00,000+ 10%`,
    `🚚 Dispatch in 48h · OTP-verified delivery · Itemised invoice`,
    ``,
    `Need help? WhatsApp us: ${support || "+91 98220 12345"} — DMK Mart, Pune`,
  ].join("\n");
}

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const [pending, counts] = await Promise.all([
    db.customer.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" } }),
    db.customer.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c.status] = c._count._all;
  const support = (await db.setting.findUnique({ where: { key: "support_phone" } }))?.value || "+91 98220 12345";
  return NextResponse.json({
    rows: pending.map((c) => ({ ...c, waText: waTextFor(c, support) })),
    counts: countMap,
  });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const { id, action, tier, customerType } = await req.json();
    if (!id || !["APPROVE", "REJECT"].includes(action)) return jsonError("Missing id or invalid action");

    const customer = await db.customer.findUnique({ where: { id: String(id) } });
    if (!customer) return jsonError("Customer not found", 404);

    if (action === "REJECT") {
      const updated = await db.customer.update({
        where: { id: customer.id },
        data: { status: "SUSPENDED", approvedAt: new Date(), approvedBy: "Super Admin" },
      });
      await db.activityLog.create({ data: { action: "REJECT", entity: "customer", entityId: customer.id, detail: `Buyer account rejected: ${customer.name} (${customer.phone})` } });
      return NextResponse.json({ ok: true, customer: updated });
    }

    const finalTier = ["tier1", "tier2", "tier3", "tier4"].includes(tier) ? tier : "tier4";
    const finalType = ["RETAILER", "WHOLESALE", "SEMI_WHOLESALE", "DISTRIBUTOR"].includes(customerType) ? customerType : customer.customerType;
    const support = (await db.setting.findUnique({ where: { key: "support_phone" } }))?.value || "+91 98220 12345";

    const updated = await db.customer.update({
      where: { id: customer.id },
      data: {
        status: "APPROVED",
        tier: finalTier,
        customerType: finalType,
        creditLimit: DEFAULT_LIMIT[finalType] ?? 50000,
        approvedAt: new Date(),
        approvedBy: "Super Admin",
      },
    });
    await db.activityLog.create({
      data: { action: "APPROVE", entity: "customer", entityId: customer.id, detail: `Buyer approved: ${customer.name} (${customer.phone}) → ${finalType} @ ${finalTier}` },
    });
    return NextResponse.json({ ok: true, customer: updated, waText: waTextFor(updated, support) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Approval failed", 400);
  }
}
