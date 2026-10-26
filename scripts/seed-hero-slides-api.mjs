/**
 * Hero art-direction seeding via PRODUCTION admin API:
 *   1. Apply Slider.mobileImage migration (idempotent)
 *   2. Replace slides with ONE responsive slide:
 *        image (wide)       → desktop / laptop / tablet
 *        mobileImage (3:4)  → phones
 *   3. Point the "Bulk Buy Bonanza" ad at the square artwork (uniform square tile)
 * Run: node scripts/seed-hero-slides-api.mjs [baseUrl]
 */
const BASE = process.argv[2] || "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "DmkMartB2B!2026";

const slides = [
  {
    kicker: "Wholesale Home Essentials",
    heading: "Everyday Storage & Care",
    highlight: "for Less",
    content: "Baskets, bins, towels & cookware from 40+ brands at true wholesale rates.",
    chips: "Wide Product Range,Trusted Quality,Built for Businesses",
    tagline: "",
    buttonText: "Shop Now",
    buttonUrl: "/catalog",
    image: "/images/hero/hero-d1.jpg",       // wide — vacant left wall → copy MIDDLE-LEFT
    mobileImage: "/images/hero/hero-m1.jpg", // portrait — vacant top wall → copy TOP-LEFT
    position: "MIDDLE-LEFT",
    mobilePosition: "TOP-LEFT",
    textColor: "DARK",
    headingScale: "M",
    sortOrder: 0,
    active: true,
  },
  {
    kicker: "Kitchen & Appliances",
    heading: "Cook, Store & Serve",
    highlight: "Better",
    content: "Air fryers, cookware, jars & storage — bulk deals for your business.",
    chips: "Tier Pricing,OTP Delivery,48h Dispatch",
    tagline: "",
    buttonText: "Explore Kitchen",
    buttonUrl: "/catalog",
    image: "/images/hero/hero-d2.jpg",       // wide — vacant upper-left wall → copy MIDDLE-LEFT
    mobileImage: "/images/hero/hero-m2.jpg", // portrait — vacant top wall → copy TOP-CENTER
    position: "MIDDLE-LEFT",
    mobilePosition: "TOP-CENTER",
    textColor: "DARK",
    headingScale: "M",
    sortOrder: 1,
    active: true,
  },
];

const AD_TITLE = "Bulk Buy Bonanza";
const AD_IMAGE = "/images/hero/hero-2.jpg"; // square → ad/promo tiles

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

  // 1. Migration (idempotent)
  const mig = await api("/api/admin/sync/apply-hero-schema", { method: "POST", headers: auth });
  console.log(`✓ schema: applied=${JSON.stringify(mig.applied)} skipped=${JSON.stringify(mig.skipped)}`);

  // 2. Replace slides with one responsive slide
  const { rows = [] } = await api("/api/admin/crud/sliders", { headers: auth });
  for (const r of rows) {
    await api(`/api/admin/crud/sliders?id=${r.id}`, { method: "DELETE", headers: auth });
    console.log(`  − deleted old slide: "${r.heading}"`);
  }
  for (const slide of slides) {
    const { row } = await api("/api/admin/crud/sliders", {
      method: "POST",
      headers: auth,
      body: JSON.stringify(slide),
    });
    console.log(`✓ slide [${row.sortOrder}]: "${row.heading}" desktop=${row.image}@${row.position} mobile=${row.mobileImage}@${row.mobilePosition}`);
  }

  // 3. Square artwork → ad tile
  const ads = await api("/api/admin/crud/ads", { headers: auth });
  const ad = (ads.rows || []).find((a) => a.title === AD_TITLE);
  if (ad && ad.image !== AD_IMAGE) {
    await api("/api/admin/crud/ads", {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ id: ad.id, image: AD_IMAGE }),
    });
    console.log(`✓ ad "${AD_TITLE}" image → ${AD_IMAGE} (square)`);
  } else {
    console.log(ad ? `✓ ad "${AD_TITLE}" already points at ${AD_IMAGE}` : `⚠ ad "${AD_TITLE}" not found`);
  }
  console.log("✓ hero art-direction seeded");
};

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
