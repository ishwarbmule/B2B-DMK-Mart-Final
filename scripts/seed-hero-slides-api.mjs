/**
 * Seed hero slides via the PRODUCTION admin CRUD API
 * (DB credentials live only on Vercel — local env has no APP_DATABASE_URL).
 * Flow: login → list sliders → delete old rows → create 3 new slides.
 * Run: node scripts/seed-hero-slides-api.mjs [baseUrl]
 */
const BASE = process.argv[2] || "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "DmkMartB2B!2026";

const slides = [
  {
    heading: "Everyday Essentials for a Better Tomorrow",
    content:
      "Housewares, kitchenware & storage from 40+ trusted brands — live stock, true wholesale rates, straight from DMK Mart ERP.",
    buttonText: "Shop Catalog",
    buttonUrl: "/catalog",
    image: "/images/hero/hero-1.jpg",
    position: "LEFT",
    sortOrder: 0,
    active: true,
  },
  {
    heading: "Bulk Storage, Bigger Savings",
    content:
      "Baskets, bins, buckets & containers at slab pricing. Stock up in bulk — the more cases you take, the more you save.",
    buttonText: "Explore Storage",
    buttonUrl: "/catalog",
    image: "/images/hero/hero-2.jpg",
    position: "LEFT",
    sortOrder: 1,
    active: true,
  },
  {
    heading: "One Mart. Every Business.",
    content:
      "Retailer, wholesaler or distributor — get your own price slabs. Pickup at your nearest warehouse or get bulk-case delivery.",
    buttonText: "Create Account",
    buttonUrl: "/account",
    image: "/images/hero/hero-3.jpg",
    position: "LEFT",
    sortOrder: 2,
    active: true,
  },
];

const api = async (path, opts = {}) => {
  const r = await fetch(`${BASE}${path}`, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};

const main = async () => {
  const login = await api("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }),
  });
  const auth = { Authorization: `Bearer ${login.token}`, "Content-Type": "application/json" };
  console.log("✓ admin login ok");

  const { rows = [] } = await api("/api/admin/crud/sliders", { headers: auth });
  console.log(`✓ existing sliders: ${rows.length}`);
  for (const r of rows) {
    await api(`/api/admin/crud/sliders?id=${r.id}`, { method: "DELETE", headers: auth });
    console.log(`  − deleted old: "${r.heading}" (${r.image})`);
  }

  for (const s of slides) {
    const { row } = await api("/api/admin/crud/sliders", {
      method: "POST",
      headers: auth,
      body: JSON.stringify(s),
    });
    console.log(`  + created [${row.sortOrder}] "${row.heading}" → ${row.image}`);
  }
  console.log("✓ hero slides seeded");
};

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
