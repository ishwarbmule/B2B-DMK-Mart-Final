/**
 * GO-LIVE homepage seeding — restores the content a fresh DB lacks after the ERP pull:
 *   1. Brand logos  (39 saved Cloudinary URLs → matched by brand slug, only fills empty)
 *   2. Hero sliders (2 slides using committed /images art)
 *   3. Ad cards     (4 ads using committed /images/ads/*.jpg)
 *   4. Home rails   (Deals/Featured/Top/Hot flags on products that HAVE working Cloudinary images)
 * All steps are idempotent — safe to re-run.
 *
 * Usage: PROD_BASE=... ADMIN_LOGIN_ID=... ADMIN_PASSWORD=... npx tsx scripts/go-live-seed-home.ts
 */
const BASE = process.env.PROD_BASE || "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "";

const TOKEN_FILE = "/home/z/my-project/.golive-token";
import fs from "fs";

let TOKEN = fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, "utf8").trim() : "";

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(60_000),
    headers: { "content-type": "application/json", ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}), ...(init?.headers || {}) },
  });
  let body: any = null;
  try { body = await res.json(); } catch { body = `<non-json ${res.status}>`; }
  if (res.status === 401 && !init) {
    // token expired → re-login once and retry
    const l = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
    const lb = await l.json().catch(() => ({}));
    if (lb?.token) { TOKEN = lb.token; fs.writeFileSync(TOKEN_FILE, TOKEN); return api(path, init); }
  }
  return { status: res.status, body };
}

const BRAND_LOGOS: Record<string, string> = JSON.parse(fs.readFileSync("/home/z/my-project/scripts/brand-logo-urls.json", "utf8"));
const LOGOS2: Record<string, string> = JSON.parse(fs.readFileSync("/home/z/my-project/scripts/brand-logo-new-urls.json", "utf8"));
for (const [k, v] of Object.entries(LOGOS2)) if (!BRAND_LOGOS[k]) BRAND_LOGOS[k] = v;

const listOf = (b: any): any[] => (Array.isArray(b) ? b : (b?.rows ?? b?.items ?? []));

async function main() {
  console.log(`Seeding homepage content on ${BASE}`);

  // ── 1. Brand logos ──────────────────────────────────────────────
  const brands = await api("/api/admin/crud/brands");
  let logosSet = 0;
  if (brands.status === 200) {
    for (const b of listOf(brands.body) as any[]) {
      const url = BRAND_LOGOS[b.slug];
      if (url && !b.logo) {
        const r = await api("/api/admin/crud/brands", { method: "PATCH", body: JSON.stringify({ id: b.id, logo: url }) });
        if (r.status === 200) logosSet++; else console.log(`  logo FAIL ${b.slug}: ${r.status}`);
      }
    }
    console.log(`1. brand logos: set ${logosSet} of ${Object.keys(BRAND_LOGOS).length} available (brands: ${listOf(brands.body).length})`);
  } else console.log(`1. brand logos: SKIP (${brands.status})`);

  // ── 2. Sliders ──────────────────────────────────────────────────
  const sliders = await api("/api/admin/crud/sliders");
  if (sliders.status === 200 && listOf(sliders.body).length === 0) {
    const slides = [
      { heading: "Wholesale Made Simple", content: "2,000+ products from trusted brands — live stock & wholesale rates, straight from DMK Mart ERP.", buttonText: "Shop Catalog", buttonUrl: "/catalog", image: "/images/hero-banner.jpg", position: "LEFT", active: true, sortOrder: 0 },
      { heading: "Bulk Storage Deals", content: "Containers, dabbas & kitchen storage at wholesale prices. Minimum order quantities that make sense.", buttonText: "Explore Storage", buttonUrl: "/catalog", image: "/images/ads/ad-storage.jpg", position: "RIGHT", active: true, sortOrder: 1 },
    ];
    for (const s of slides) {
      const r = await api("/api/admin/crud/sliders", { method: "POST", body: JSON.stringify(s) });
      console.log(`2. slider "${s.heading}": ${r.status}`);
    }
  } else console.log(`2. sliders: SKIP (already ${listOf(sliders.body).length} present)`);

  // ── 3. Ads ──────────────────────────────────────────────────────
  const ads = await api("/api/admin/crud/ads");
  if (ads.status === 200 && listOf(ads.body).length === 0) {
    const adDefs = [
      { title: "Bulk Buy Bonanza", link: "/catalog", image: "/images/ads/ad-bulk.jpg", sortOrder: 0 },
      { title: "Kitchen Launch", link: "/catalog", image: "/images/ads/ad-kitchen-launch.jpg", sortOrder: 1 },
      { title: "Storage Solutions", link: "/catalog", image: "/images/ads/ad-storage.jpg", sortOrder: 2 },
      { title: "Garden & Outdoor", link: "/catalog", image: "/images/ads/ad-garden.jpg", sortOrder: 3 },
    ];
    for (const a of adDefs) {
      const r = await api("/api/admin/crud/ads", { method: "POST", body: JSON.stringify({ ...a, active: true }) });
      console.log(`3. ad "${a.title}": ${r.status}`);
    }
  } else console.log(`3. ads: SKIP (already ${listOf(ads.body).length} present)`);

  // ── 4. Home rails: flag products WITH working images ───────────
  const withImages: { id: string; name: string; discount: number }[] = [];
  for (let page = 1; page <= 30; page++) {
    const r = await api(`/api/admin/products?limit=100&page=${page}`);
    if (r.status !== 200) { console.log(`4. products page ${page}: ${r.status}`); break; }
    const rows = r.body?.rows ?? [];
    if (!rows.length) break;
    for (const p of rows as any[]) {
      const img = p.image || "";
      if (img.startsWith("http") && !p.isDeal && !p.isFeatured && !p.isTop && !p.isHot) {
        const mrp = Number(p.mrp) || 0, dealer = Number(p.dealerPrice) || 0;
        const discount = mrp > 0 && dealer > 0 ? (mrp - dealer) / mrp : 0;
        withImages.push({ id: p.id, name: p.name, discount });
      }
    }
    const pages = Number(r.body?.pages) || 1;
    if (page >= pages) break;
  }
  // best-discount first for deals, then spread the rest
  withImages.sort((a, b) => b.discount - a.discount);
  const dealIds = withImages.slice(0, 24).map((x) => x.id);
  const featuredIds = withImages.slice(24, 48).map((x) => x.id);
  const topIds = withImages.slice(48, 68).map((x) => x.id);
  const hotIds = withImages.slice(68, 84).map((x) => x.id);
  const flagSets: [string, string[], string][] = [
    ["isDeal", dealIds, "Deals of the Day"],
    ["isFeatured", featuredIds, "Featured"],
    ["isTop", topIds, "Top Selling"],
    ["isHot", hotIds, "Hot Products"],
  ];
  for (const [flag, ids, label] of flagSets) {
    if (!ids.length) { console.log(`4. ${label}: no candidates (working-image products: ${withImages.length})`); continue; }
    const r = await api("/api/admin/products/flags", { method: "POST", body: JSON.stringify({ ids, flag, value: true }) });
    console.log(`4. ${label}: flagged ${r.body?.count ?? r.status}`);
  }
  console.log(`   (candidates with working images: ${withImages.length})`);
  console.log("DONE");
}

main().catch((e) => { console.error("ERROR:", e?.message || e); process.exit(1); });
