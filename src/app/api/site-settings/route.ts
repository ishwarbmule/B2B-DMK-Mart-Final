/**
 * GET /api/site-settings — public, non-secret storefront settings.
 * gstEnabled drives the site-wide GST Mode (admin Settings → GST toggle):
 *   gst_enabled = "off" → no GST is added or shown anywhere on the website.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.setting.findMany({
      where: { key: { in: ["gst_enabled", "site_title", "site_tagline"] } },
    });
    const S: Record<string, string> = {};
    for (const r of rows) S[r.key] = r.value;
    return NextResponse.json({
      gstEnabled: S.gst_enabled !== "off",
      siteTitle: S.site_title || "DMK Mart",
      siteTagline: S.site_tagline || "",
    });
  } catch {
    return NextResponse.json({ gstEnabled: true });
  }
}
