/** POST /api/admin/upload — multipart image upload → Cloudinary (folder: dmk-mart/ads).
 *  Returns { url }. Admin-only. Validations: image/* only, ≤ 8 MB. */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

function cloudinaryCreds() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME || "";
  const key = process.env.CLOUDINARY_API_KEY || "";
  const secret = process.env.CLOUDINARY_API_SECRET || "";
  return { cloud, key, secret };
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { cloud, key, secret } = cloudinaryCreds();
  if (!cloud || !key || !secret) {
    return jsonError("Cloudinary is not configured (CLOUDINARY_* env vars missing).", 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Expected multipart/form-data with a `file` field.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Missing file field.", 400);
  if (!ALLOWED.includes(file.type)) return jsonError(`Unsupported file type ${file.type}. Use JPG, PNG, WEBP, GIF or AVIF.`, 400);
  if (file.size > MAX_BYTES) return jsonError("Image is larger than 8 MB.", 400);

  // Timestamp + signature (sha1 of `folder=...&timestamp=...` + api_secret)
  const folder = "dmk-mart/ads";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${secret}`)
    .digest("hex");

  const upload = new FormData();
  upload.append("file", file, file.name || "ad-image");
  upload.append("api_key", key);
  upload.append("timestamp", String(timestamp));
  upload.append("folder", folder);
  upload.append("signature", signature);

  let result: { secure_url?: string; error?: { message?: string } };
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
      method: "POST",
      body: upload,
    });
    result = await res.json();
    if (!res.ok || !result.secure_url) {
      return jsonError(result.error?.message || `Cloudinary upload failed (${res.status})`, 502);
    }
  } catch {
    return jsonError("Could not reach Cloudinary. Check network/firewall.", 502);
  }

  try {
    await db.activityLog.create({
      data: { action: "UPLOAD", entity: "ad-image", detail: `Uploaded ${folder}/${(file.name || "image").slice(0, 60)} → ${result.secure_url}`, user: "Super Admin" },
    });
  } catch { /* non-blocking */ }

  return NextResponse.json({ url: result.secure_url, bytes: file.size, type: file.type });
}
