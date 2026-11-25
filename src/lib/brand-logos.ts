/**
 * Brand logos straight from the site's Cloudinary media library — brand MEANS
 * the company, so every brand (= company) gets its logo matched automatically.
 *
 * How matching works (no manual picking needed):
 *   1. List the image assets in BOTH logo folders — dmk-mart/brand-logos and
 *      dmk-mart/brands — via the signed Cloudinary Admin API (read-only).
 *   2. Turn each file name into a slug: "hd-polyplast.jpg" → "hd-polyplast".
 *   3. Match every brand on slug: brand's URL slug, its name, or any of its
 *      data-source (ERP company) aliases — case/spacing insensitive.
 *   4. Write the matched URL into Brand.logo (delivery URL with auto
 *      format/quality) — only when it actually changed. Brands without a
 *      matching file are reported back so the admin knows what to upload.
 *
 * Never deletes a logo: a brand whose file vanished keeps its current one.
 */
import {
  db,
} from "@/lib/db";

const FOLDERS = ["dmk-mart/brand-logos", "dmk-mart/brands"];
const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "";

type Asset = { publicId: string; url: string };

/** Signed, paginated Cloudinary Admin API list for one folder (read-only).
 *  HTTP BASIC auth (api_key:api_secret) — the query-signature variant
 *  intermittently answered "Invalid credentials" on this account. */
async function listFolder(cloud: string, key: string, secret: string, folder: string): Promise<Asset[]> {
  const out: Asset[] = [];
  let cursor = "";
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");
  for (let page = 0; page < 10; page++) {
    const timestamp = Math.floor(Date.now() / 1000);
    const qs = new URLSearchParams({ folder, max_results: "100", timestamp: String(timestamp) });
    if (cursor) qs.set("next_cursor", cursor);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image?${qs}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: { authorization: `Basic ${basic}` },
    });
    const data = (await res.json()) as {
      resources?: { secure_url?: string; public_id?: string }[];
      next_cursor?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      const msg = data.error?.message || "";
      if (/not found|no resources|empty/i.test(msg)) return out; // folder simply has nothing yet
      throw new Error(msg || `Cloudinary list failed (${res.status})`);
    }
    for (const r of data.resources || []) {
      if (r.public_id && r.secure_url) out.push({ publicId: r.public_id, url: r.secure_url });
    }
    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return out;
}

/** Delivery URL tuned for logos: auto format/quality, capped at 400px wide. */
function logoUrl(secureUrl: string): string {
  return secureUrl.includes("/upload/")
    ? secureUrl.replace("/upload/", "/upload/f_auto,q_auto:good,c_limit,w_400/")
    : secureUrl;
}

/** "dmk-mart/brand-logos/hd-polyplast.jpg" → "hd-polyplast" */
function slugFromPublicId(publicId: string): string {
  const file = publicId.split("/").pop() || "";
  return slugify(file.replace(/\.[a-z0-9]+$/i, ""));
}

export type LogoMatchResult = {
  totalBrands: number;
  libraryAssets: number;
  updated: number;
  alreadyOk: number;
  missing: { name: string; slug: string }[]; // brands with no Cloudinary file yet
  unmatched: string[]; // library files no brand claimed (wrong file name?)
};

/**
 * Match + apply. `onlyIds` limits the work to those brands (used right after
 * "Sync brands from companies" so fresh brands get logos immediately).
 */
export async function matchBrandLogosFromCloudinary(onlyIds?: string[]): Promise<LogoMatchResult> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME || "";
  const key = process.env.CLOUDINARY_API_KEY || "";
  const secret = process.env.CLOUDINARY_API_SECRET || "";
  if (!cloud || !key || !secret) throw new Error("Cloudinary is not configured (CLOUDINARY_* env vars missing).");

  const assets: Asset[] = [];
  for (const folder of FOLDERS) {
    try { assets.push(...(await listFolder(cloud, key, secret, folder))); } catch { /* one folder hiccup shouldn't block the other */ }
  }

  // slug → asset (first folder wins; brand-logos is the canonical one)
  const assetBySlug = new Map<string, Asset>();
  for (const a of assets) {
    const slug = slugFromPublicId(a.publicId);
    if (slug && !assetBySlug.has(slug)) assetBySlug.set(slug, a);
  }

  const brands = await db.brand.findMany({
    where: onlyIds?.length ? { id: { in: onlyIds } } : {},
    select: { id: true, name: true, slug: true, logo: true, erpNames: true },
  });

  let updated = 0;
  let alreadyOk = 0;
  const missing: { name: string; slug: string }[] = [];
  const claimed = new Set<string>();

  for (const b of brands) {
    const keys = [b.slug, ...(() => { try { return JSON.parse(b.erpNames || "[]") as string[]; } catch { return []; } })(), b.name]
      .map((v) => slugify(String(v || "")))
      .filter(Boolean);
    const hit = keys.map((k) => assetBySlug.get(k)).find(Boolean);
    if (!hit) {
      missing.push({ name: b.name, slug: b.slug });
      continue;
    }
    claimed.add(hit.publicId);
    const url = logoUrl(hit.url);
    if (b.logo === url) alreadyOk++;
    else {
      await db.brand.update({ where: { id: b.id }, data: { logo: url } });
      updated++;
    }
  }

  return {
    totalBrands: brands.length,
    libraryAssets: assets.length,
    updated,
    alreadyOk,
    missing,
    unmatched: assets.filter((a) => !claimed.has(a.publicId)).map((a) => a.publicId.split("/").pop() || a.publicId),
  };
}
