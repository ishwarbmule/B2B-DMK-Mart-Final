/** POST /api/admin/sync/fix-images — one-shot image cleanup (idempotent):
 *  - ERP image base CONFIGURED  → prefix bare filenames so they resolve.
 *  - NO base configured         → blank them (they 404; ERP's unverified imageFileName
 *    guesses). Verified full Cloudinary URLs (photoUrl) are never touched.
 *  Future pulls follow the same rule via resolveErpImage. */
import { NextRequest } from "next/server";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { erpImageBase } from "@/lib/erp";
import { logSyncEvent } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const base = (await erpImageBase()).replace(/\/+$/, "");
    // MySQL evaluates SET assignments left→right, so gallery must be assigned
    // BEFORE image (it reads the original image value).
    const affected = base
      ? await db.$executeRawUnsafe(
          "UPDATE `Product` SET `gallery` = JSON_ARRAY(CONCAT(?, `image`)), `image` = CONCAT(?, `image`) WHERE `image` != '' AND `image` NOT LIKE 'http%' AND `image` NOT LIKE 'data:%'",
          `${base}/`, `${base}/`
        )
      : await db.$executeRawUnsafe(
          "UPDATE `Product` SET `image` = '', `gallery` = '[]' WHERE `image` != '' AND `image` NOT LIKE 'http%' AND `image` NOT LIKE 'data:%'"
        );
    await logSyncEvent({
      direction: "MAINTENANCE", action: "FIX_IMAGES", status: "OK",
      message: base
        ? `Prefixed ${affected} product images with ERP image base`
        : `Blanked ${affected} product images with unresolvable (non-http) filenames`,
    });
    return Response.json({ ok: true, mode: base ? "prefixed" : "blanked", affected });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "fix-images failed", 500);
  }
}
