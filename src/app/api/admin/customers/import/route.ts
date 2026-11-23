/**
 * POST /api/admin/customers/import — bulk customer migration (old-website export).
 *
 * Upserts customers by phone (source WEB). Every imported customer lands:
 *   • APPROVED (approvedAt/approvedBy = MIGRATION) — straight into the approved list
 *   • demo password (default 1234) + mustChangePassword = true → the mandatory
 *     "Set your new password" popup opens right after their first login
 *   • city/address/pincode from the export (city drives warehouse visibility)
 *   • lat/lng store pin (geoSource ADMIN) → appears instantly on the admin Store Map
 *
 * Safety rules:
 *   • an existing customer who already chose their own password (mustChangePassword
 *     false + password set) is NEVER reset to the demo password — we only fix status,
 *     profile fields and add a pin if missing
 *   • admin-supplied coordinates win; the endpoint never geocodes on its own
 *
 * Body: { rows: Array<{ phone, fullName?, shopName?, email?, demoPassword?,
 *                        address?, city?, pincode?, customerType?, lat?, lng? }>,
 *         dryRun?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

interface ImportRow {
  phone?: string;
  fullName?: string;
  shopName?: string;
  email?: string;
  demoPassword?: string;
  address?: string;
  city?: string;
  pincode?: string;
  customerType?: string;
  tier?: string;
  lat?: number | null;
  lng?: number | null;
  createdAt?: string; // registration date from the old-site export (optional)
}

/** normalize a mobile: keep last 10 digits for Indian numbers ("+91 98765 43210" → "9876543210") */
function normPhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => null)) as { rows?: ImportRow[]; dryRun?: boolean } | null;
  if (!body || !Array.isArray(body.rows) || body.rows.length === 0) {
    return jsonError("Send { rows: [...] } with at least one customer", 400);
  }
  if (body.rows.length > 500) return jsonError("Import up to 500 customers per call", 400);

  let created = 0;
  let updated = 0;
  const errors: { phone: string; error: string }[] = [];
  const results: { phone: string; action: string; id?: string }[] = [];

  for (const row of body.rows) {
    const phone = normPhone(row.phone ?? "");
    if (!phone || phone.length !== 10) {
      errors.push({ phone: String(row.phone ?? ""), error: "Invalid 10-digit mobile number" });
      continue;
    }
    const name = String(row.fullName ?? "").trim() || "Customer";
    const shopName = String(row.shopName ?? "").trim();
    const email = String(row.email ?? "").trim();
    const emailNorm = email && email.includes("@") && email !== "*" ? email.toLowerCase() : "";
    const address = String(row.address ?? "").trim();
    const city = String(row.city ?? "").trim();
    const pincode = /^\d{6}$/.test(String(row.pincode ?? "").trim()) ? String(row.pincode).trim() : "";
    const demoPassword = String(row.demoPassword ?? "1234").trim() || "1234";
    const customerType = ["RETAILER", "WHOLESALE", "SEMI_WHOLESALE", "DISTRIBUTOR"].includes(String(row.customerType))
      ? String(row.customerType)
      : "RETAILER";
    const tier = /^tier[1-5]$/.test(String(row.tier ?? "")) ? String(row.tier) : "tier4";
    const lat = Number.isFinite(Number(row.lat)) ? Number(row.lat) : null;
    const lng = Number.isFinite(Number(row.lng)) ? Number(row.lng) : null;
    const hasPin = lat != null && lng != null;
    const regDate = row.createdAt && !Number.isNaN(Date.parse(row.createdAt)) ? new Date(row.createdAt) : null;

    try {
      const existing = await db.customer.findUnique({ where: { phone } });
      const now = new Date();

      if (!existing) {
        if (body.dryRun) {
          results.push({ phone, action: "CREATE" });
          created++;
          continue;
        }
        const rowCreated = await db.customer.create({
          data: {
            name,
            shopName,
            phone,
            email: emailNorm,
            password: sha(demoPassword),
            mustChangePassword: true, // demo password → force the set-new-password popup on first login
            address,
            city,
            pincode,
            customerType,
            tier,
            status: "APPROVED",
            approvedAt: now,
            approvedBy: "MIGRATION",
            source: "WEB", // WEB = loginable by phone/email on this site
            createdBy: "MIGRATION",
            ...(regDate ? { createdAt: regDate } : {}),
            ...(hasPin ? { lat, lng, geoSource: "ADMIN", geoUpdatedAt: now } : {}),
          },
        });
        created++;
        results.push({ phone, action: "CREATE", id: rowCreated.id });
      } else {
        if (body.dryRun) {
          results.push({ phone, action: "UPDATE" });
          updated++;
          continue;
        }
        // password policy: only hand out the demo password when the account has no
        // working password yet — never clobber a password the customer chose
        const needsDemo = !existing.password || existing.mustChangePassword;
        await db.customer.update({
          where: { phone },
          data: {
            ...(name && name !== "Customer" ? { name } : {}),
            ...(shopName ? { shopName } : {}),
            ...(emailNorm && !existing.email ? { email: emailNorm } : {}),
            ...(address ? { address } : {}),
            ...(city ? { city } : {}),
            ...(pincode ? { pincode } : {}),
            ...(needsDemo ? { password: sha(demoPassword), mustChangePassword: true } : {}),
            // approve: migrated buyers go straight into the approved list
            ...(existing.status !== "APPROVED" ? { status: "APPROVED", approvedAt: now, approvedBy: "MIGRATION" } : {}),
            ...(hasPin && existing.lat == null ? { lat, lng, geoSource: "ADMIN", geoUpdatedAt: now } : {}),
          },
        });
        updated++;
        results.push({ phone, action: "UPDATE", id: existing.id });
      }
    } catch (e) {
      errors.push({ phone, error: e instanceof Error ? e.message.slice(0, 200) : "Import failed" });
    }
  }

  if (!body.dryRun && (created > 0 || updated > 0)) {
    await db.activityLog.create({
      data: {
        action: "IMPORT",
        entity: "Customer",
        detail: `Customer migration import: ${created} created, ${updated} updated, ${errors.length} failed`,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: errors.length === 0, dryRun: !!body.dryRun, created, updated, failed: errors.length, errors, results });
}
