/**
 * POST /api/admin/brands/cloudinary-logos — one click "update brand logos from
 * Cloudinary". Brand = company, so every brand gets the logo whose file name
 * matches its name / URL slug / data-source alias (brand-logos + brands
 * folders). Read-only Cloudinary read; website logos are written only where a
 * match exists — nothing is deleted, brands without a file are reported back.
 *   POST → { updated, alreadyOk, totalBrands, libraryAssets,
 *            missing: [{ name, slug }], unmatched: [fileName] }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { matchBrandLogosFromCloudinary } from "@/lib/brand-logos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const result = await matchBrandLogosFromCloudinary();
    await db.activityLog.create({
      data: { action: "UPDATE", entity: "brand", detail: `Brand logos pulled from Cloudinary — ${result.updated} updated, ${result.alreadyOk} already current, ${result.missing.length} without a match`, user: "Super Admin" },
    }).catch(() => {});
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Logo pull failed", 500);
  }
}
