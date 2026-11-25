/**
 * Applies Cloudinary category images (dmk-mart/categories folder) to top-level
 * categories: matches file-name slug ↔ category-name slug, PATCHes only `image`.
 */
const BASE = "https://b2b-dmk-mart.vercel.app";

const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 200)}`);
  return d;
};
const slugify = (s) => s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();

const login = await jf("/api/admin/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }),
});
const H = { authorization: `Bearer ${login.token}` };

const lib = await jf("/api/admin/cloudinary?folder=categories&max=100", { headers: H });
const images = lib.images || [];
console.log(`Cloudinary dmk-mart/categories: ${images.length} assets`);
const bySlug = new Map();
for (const img of images) {
  const file = (img.publicId || "").split("/").pop() || "";
  const slug = slugify(file.replace(/\.[a-z0-9]+$/i, ""));
  if (slug && !bySlug.has(slug)) bySlug.set(slug, img.originalUrl || img.url);
}

const tops = await jf("/api/admin/crud/tops", { headers: H });
const rows = Array.isArray(tops) ? tops : tops.items || tops.rows || [];
console.log(`top-level categories: ${rows.length}`);
let set = 0;
for (const t of rows) {
  const hit = bySlug.get(slugify(t.name));
  if (!hit) { console.log(`  – ${t.name}: no Cloudinary image`); continue; }
  if (t.image === hit) { console.log(`  = ${t.name}: already set`); continue; }
  await jf("/api/admin/crud/tops", { method: "PATCH", headers: H, body: JSON.stringify({ id: t.id, image: hit }) });
  set++;
  console.log(`  ✓ ${t.name} ← ${hit}`);
}
console.log(`done — ${set} top categories got an image`);
