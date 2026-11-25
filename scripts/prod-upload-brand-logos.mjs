/**
 * Uploads every brand logo from upload/brand-logos to Cloudinary (dmk-mart/brands)
 * via the production admin upload API, then triggers the brand-logo matcher.
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";

const BASE = "https://b2b-dmk-mart.vercel.app";
const DIR = "/home/z/my-project/upload/brand-logos/All Brand Logos";

const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 200)}`);
  return d;
};

const login = await jf("/api/admin/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }),
});
const H = { authorization: `Bearer ${login.token}` };

const files = readdirSync(DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
console.log(`uploading ${files.length} logo files → dmk-mart/brands (publicId = file slug)`);
const uploaded = [];
for (const f of files) {
  const buf = readFileSync(path.join(DIR, f));
  const type = /\.jpe?g$/i.test(f) ? "image/jpeg" : /\.webp$/i.test(f) ? "image/webp" : "image/png";
  const slug = f.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9_-]/g, "-");
  const form = new FormData();
  form.append("file", new Blob([buf], { type }), f);
  form.append("folder", "brands");
  form.append("publicId", slug);
  try {
    const r = await jf("/api/admin/upload", { method: "POST", headers: H, body: form });
    uploaded.push({ file: f, url: r.url });
    console.log(`  ✓ ${f} → ${r.url}`);
  } catch (e) {
    console.log(`  ✗ ${f}: ${e.message}`);
  }
}

console.log("\nmatching brand logos from Cloudinary library…");
const m = await jf("/api/admin/brands/cloudinary-logos", { method: "POST", headers: H });
console.log(JSON.stringify({
  totalBrands: m.totalBrands,
  libraryAssets: m.libraryAssets,
  updated: m.updated,
  alreadyOk: m.alreadyOk,
  missing: m.missing,
  unmatched: m.unmatched,
}, null, 1));
