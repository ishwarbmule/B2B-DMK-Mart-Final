/**
 * GET /api/site-settings — public, non-secret storefront settings.
 * Public, non-secret storefront settings.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.setting.findMany({
      where: { key: { in: ["site_title", "site_tagline", "firm_name", "firm_phone"] } },
    });
    const S: Record<string, string> = {};
    for (const r of rows) S[r.key] = r.value;
    return NextResponse.json({
      siteTitle: S.site_title || "DMK Mart",
      siteTagline: S.site_tagline || "",
      // Task 15: barcode labels carry the firm name + phone at the bottom
      firmName: S.firm_name || "DMK Mart",
      firmPhone: S.firm_phone || "",
    });
  } catch {
    return NextResponse.json({});
  }
}
