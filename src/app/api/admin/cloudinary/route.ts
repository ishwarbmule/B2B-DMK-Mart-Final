/**
 * GET /api/admin/cloudinary?folder=brands — browse images already stored in the
 * site's Cloudinary media library so the admin can PICK an existing asset
 * instead of re-uploading. Signed Admin API call, server-side only.
 *   folder  → dmk-mart/<folder> (brands | products | ads | categories)
 *   max     → 1..100 (default 60, newest first)
 * Response: { images: [{ url, publicId, bytes, width, height }] } — the URLs are
 * plain delivery links with auto format/quality inserted so pickers preview fast.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FOLDERS: Record<string, string> = {
  brands: "dmk-mart/brands",
  products: "dmk-mart/products",
  ads: "dmk-mart/ads",
  categories: "dmk-mart/categories",
  brochures: "dmk-mart/brochures",
};

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const cloud = process.env.CLOUDINARY_CLOUD_NAME || "";
  const key = process.env.CLOUDINARY_API_KEY || "";
  const secret = process.env.CLOUDINARY_API_SECRET || "";
  if (!cloud || !key || !secret) {
    return jsonError("Cloudinary is not configured (CLOUDINARY_* env vars missing).", 500);
  }

  const sp = req.nextUrl.searchParams;
  const folder = FOLDERS[(sp.get("folder") || "products").toLowerCase()] || "dmk-mart/products";
  const max = Math.max(1, Math.min(100, parseInt(sp.get("max") || "60") || 60));

  // signed Cloudinary Admin API: params sorted alphabetically, sha1(param_str + secret)
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha1")
    .update(`folder=${folder}&max_results=${max}&timestamp=${timestamp}${secret}`)
    .digest("hex");
  const qs = new URLSearchParams({
    folder,
    max_results: String(max),
    timestamp: String(timestamp),
    api_key: key,
    signature,
  });

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image?${qs}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json()) as {
      resources?: { secure_url?: string; public_id?: string; bytes?: number; width?: number; height?: number; created_at?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      // "Not found" simply means the folder has no images yet — return an empty list.
      const msg = data.error?.message || "";
      if (/not found|no resources|empty/i.test(msg)) return NextResponse.json({ images: [] });
      return jsonError(msg || `Cloudinary list failed (${res.status})`, 502);
    }
    const images = (data.resources || []).map((r) => {
      const base = r.secure_url || "";
      const pretty = base.includes("/upload/")
        ? base.replace("/upload/", "/upload/c_fill,g_center,q_auto:good,w_320,h_320/")
        : base;
      return {
        url: pretty,
        originalUrl: base,
        publicId: r.public_id || "",
        bytes: r.bytes || 0,
        width: r.width || 0,
        height: r.height || 0,
        createdAt: r.created_at || "",
      };
    });
    return NextResponse.json({ images, folder });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 200) : "Cloudinary list failed", 502);
  }
}
