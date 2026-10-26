#!/usr/bin/env node
/**
 * Diwali demo seed — Hero v5 showcase:
 *  1. login → admin token
 *  2. wait for the v5 deploy, then POST apply-hero-schema (adds per-element styling columns)
 *  3. upload 3 crops of the shared Diwali artwork (desktop / mobile 3:4 / offer banner 16:9)
 *  4. create the Diwali hero slide (multicolour headline, custom sizes/padding demo)
 *  5. create the "Diwali Stocking Carnival" FESTIVAL offer → auto banner + yellow marquee above hero
 *  6. create 2 copyable homepage coupons (DIWALI10, DIWALI500)
 *  7. verify /api/catalog
 */
import fs from "node:fs";

const BASE = "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = "B2B DMK Mart";
const PASSWORD = "DmkMartB2B!2026";
const IMG = "/home/z/my-project/scripts/diwali";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init = {}, token) {
  const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) };
  if (init.body && !(init.body instanceof FormData) && typeof init.body === "string") {
    headers["content-type"] = "application/json";
  }
  const res = await fetch(BASE + path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function upload(token, file, name) {
  const buf = fs.readFileSync(`${IMG}/${file}`);
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "image/jpeg" }), name);
  const { url } = await api("/api/admin/upload", { method: "POST", body: fd }, token);
  console.log(`✓ uploaded ${name} → ${url.slice(0, 80)}…`);
  return url;
}

(async () => {
  /* 1 — login */
  const login = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
  const token = login.token || login.accessToken;
  if (!token) throw new Error("no token: " + JSON.stringify(login).slice(0, 150));
  console.log("✓ logged in");

  /* 2 — wait for v5 deploy, then migrate */
  let migrated = false;
  for (let i = 0; i < 18; i++) {
    try {
      const mig = await api("/api/admin/sync/apply-hero-schema", { method: "POST" }, token);
      const all = [...(mig.applied || []), ...(mig.skipped || [])].join(",");
      if (all.includes("padTop")) {
        console.log(`✓ v5 migration live — applied: [${(mig.applied || []).join(", ")}]`);
        migrated = true;
        break;
      }
      console.log(`… old deploy still live (no v5 columns in response), retry ${i + 1}/18`);
    } catch (e) {
      console.log(`… migration attempt ${i + 1} failed: ${e.message.slice(0, 120)}`);
    }
    await sleep(20000);
  }
  if (!migrated) throw new Error("v5 columns never appeared — deployment not picked up in time");

  /* 3 — preflight */
  const pre = await api("/api/catalog");
  console.log(`preflight: sliders=${pre.sliders?.length} activeOffer=${pre.activeOffer ? pre.activeOffer.headline : "none"} homeCoupons=${pre.homeCoupons?.length}`);

  /* 4 — upload artwork variants */
  const desktopUrl = await upload(token, "diwali-desktop.jpg", "diwali-desktop.jpg");
  const mobileUrl = await upload(token, "diwali-mobile.jpg", "diwali-mobile.jpg");
  const bannerUrl = await upload(token, "diwali-banner.jpg", "diwali-banner.jpg");

  /* 5 — Diwali hero slide (v5 styling demo) */
  const existing = await api("/api/admin/crud/sliders", {}, token);
  const dup = (existing.rows || []).find((r) => (r.heading || "").includes("Diwali"));
  if (dup) {
    await api("/api/admin/crud/sliders", {
      method: "PATCH",
      body: JSON.stringify({
        id: dup.id, image: desktopUrl, mobileImage: mobileUrl, active: true, sortOrder: -1,
        position: "TOP-LEFT", mobilePosition: "TOP-LEFT", textColor: "DARK",
      }),
    }, token);
    console.log(`✓ refreshed existing Diwali slide ${dup.id}`);
  } else {
    await api("/api/admin/crud/sliders", {
      method: "POST",
      body: JSON.stringify({
        kicker: "Festival of Lights · Limited Stock",
        heading: "Light up your *Diwali* with *wholesale* home essentials",
        highlight: "",
        content: "Kitchenware, storage, decor & gifting — dealer prices on 600+ festive essentials. Stock up before the rush!",
        chips: "Festive Gift Sets,Bulk Discounts,Fast Restock",
        tagline: "Shubh Deepavali!",
        buttonText: "Shop Diwali Store",
        buttonUrl: "/catalog",
        image: desktopUrl,
        mobileImage: mobileUrl,
        position: "TOP-LEFT",
        mobilePosition: "TOP-LEFT",
        textColor: "DARK",
        headingScale: "L",
        headingSize: 54,
        kickerSize: 13,
        contentSize: 15,
        headingColors: JSON.stringify(["#ea580c", "#dc2626", "#b45309"]),
        padTop: 50,
        padBottom: 50,
        padLeft: 50,
        padRight: 50,
        sortOrder: -1,
        active: true,
      }),
    }, token);
    console.log("✓ Diwali hero slide created (multicolour headline, TOP-LEFT, 50px pads)");
  }

  /* 6 — Diwali FESTIVAL offer (auto banner + yellow marquee above hero) */
  const now = Date.now();
  const startAt = new Date(now - 3600e3).toISOString().slice(0, 10);
  const endAt = new Date(now + 14 * 864e5).toISOString().slice(0, 10);
  await api("/api/admin/crud/offers", {
    method: "POST",
    body: JSON.stringify({
      name: "Diwali Stocking Carnival",
      slug: `diwali-stock-carnival-${now.toString(36)}`,
      type: "FESTIVAL",
      headline: "Diwali Big Sale Days",
      subText: "Festival of Lights offer — wholesale prices on 600+ festive essentials",
      ctaText: "Shop the Bazaar",
      ctaUrl: "/catalog",
      bannerImage: bannerUrl,
      contentPosition: "TOP-LEFT",
      bgColor: "#111111",
      textColor: "#facc15",
      startAt,
      endAt,
      scopeType: "ALL",
      discountType: "PERCENT",
      discountValue: 10,
      minOrder: 0,
      heroSlot: true,
      active: true,
    }),
  }, token);
  console.log(`✓ Diwali offer created (${startAt} → ${endAt}) — banner + yellow marquee go live above hero`);

  /* 7 — copyable homepage coupons */
  const coupons = [
    { code: "DIWALI10", headline: "Festive 10% OFF", subText: "On orders above ₹2,999 · Diwali week", type: "PERCENT", value: 10, minOrder: 2999, maxDiscount: 1500 },
    { code: "DIWALI500", headline: "Flat ₹500 OFF", subText: "Diwali hampers above ₹5,999", type: "AMOUNT", value: 500, minOrder: 5999, maxDiscount: 0 },
  ];
  const cList = await api("/api/admin/crud/coupons", {}, token);
  for (const c of coupons) {
    const found = (cList.rows || []).find((r) => r.code === c.code);
    const payload = {
      ...c,
      bgColor: "#111111",
      textColor: "#facc15",
      scopeType: "ALL",
      showOnHome: true,
      active: true,
      startAt,
      endAt,
    };
    if (found) {
      await api("/api/admin/crud/coupons", { method: "PATCH", body: JSON.stringify({ id: found.id, ...payload }) }, token);
      console.log(`✓ coupon ${c.code} refreshed`);
    } else {
      await api("/api/admin/crud/coupons", { method: "POST", body: JSON.stringify(payload) }, token);
      console.log(`✓ coupon ${c.code} created`);
    }
  }

  /* 8 — verify storefront payload */
  const post = await api("/api/catalog");
  const s0 = post.sliders?.[0];
  console.log("── VERIFY ──");
  console.log(`sliders=${post.sliders?.length} | slide[0]: "${s0?.heading}" pos=${s0?.position}/${s0?.mobilePosition} headingSize=${s0?.headingSize} pad=${s0?.padTop}/${s0?.padRight}/${s0?.padBottom}/${s0?.padLeft} palette=${s0?.headingColors}`);
  console.log(`activeOffer: ${post.activeOffer ? `${post.activeOffer.headline} (${post.activeOffer.contentPosition}, banner: ${!!post.activeOffer.bannerImage})` : "NONE"}`);
  console.log(`homeCoupons: ${(post.homeCoupons || []).map((c) => c.code).join(", ") || "none"}`);
})().catch((e) => {
  console.error("✗ FAILED:", e.message);
  process.exit(1);
});
