/**
 * Deploy-followup: login to production admin, upload category images to Cloudinary,
 * apply category taxonomy (tops + assignments) via /api/admin/catalog/apply-categories.
 *
 * Usage:
 *   npx tsx scripts/apply-categories.ts check     # current production tree
 *   npx tsx scripts/apply-categories.ts dry       # dry run
 *   npx tsx scripts/apply-categories.ts apply     # real run (images must exist)
 */
import fs from "fs";
import path from "path";

const BASE = process.env.PROD_BASE || "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "DmkMartB2B!2026";
const IMG_DIR = "/home/z/my-project/download/category-images";
const PAYLOAD = "/home/z/my-project/scripts/category-payload.json";

// image file per top name (General fallback included)
const IMAGE_FOR: Record<string, string> = {
  "NV Products & Feriwala": "nv-products-feriwala.png",
  "Gardening Tools & Planters": "gardening-tools-planters.png",
  "Cleaning & Households": "cleaning-households.png",
  "Commercial Kitchen Equipments": "commercial-kitchen-equipments.png",
  "Furniture": "furniture.png",
  "Household Unbreakable": "household-unbreakable.png",
  "Water Jar & Bottles": "water-jar-bottles.png",
  "Kitchen Ware": "kitchen-ware.png",
  "General": "general.png",
};

let TOKEN = process.env.TOKEN || "";
async function api(p: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    signal: AbortSignal.timeout(120_000),
    headers: {
      "content-type": "application/json",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}`, "x-admin-token": TOKEN } : {}),
      ...(init?.headers || {}),
    },
  });
  let body: any = null;
  try { body = await res.json(); } catch { body = `<non-json ${res.status}>`; }
  return { status: res.status, body };
}

async function login() {
  const r = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
  const tok = r.body?.token ?? r.body?.accessToken ?? r.body?.access_token;
  if (r.status !== 200 || !tok) throw new Error(`login failed ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  TOKEN = String(tok);
  console.log("✓ logged in");
}

async function uploadImages(): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const [topName, file] of Object.entries(IMAGE_FOR)) {
    const p = path.join(IMG_DIR, file);
    if (!fs.existsSync(p)) { console.log(`  ! missing image for ${topName}: ${file}`); continue; }
    const form = new FormData();
    const buf = fs.readFileSync(p);
    form.append("file", new Blob([new Uint8Array(buf)], { type: "image/png" }), file);
    const res = await fetch(`${BASE}/api/admin/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "x-admin-token": TOKEN },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const d = await res.json().catch(() => null);
    if (res.status === 200 && d?.url) {
      urls[topName] = d.url;
      console.log(`  ✓ ${topName} -> ${d.url}`);
    } else {
      console.log(`  ! upload failed ${topName}: ${res.status} ${JSON.stringify(d).slice(0, 200)}`);
    }
  }
  return urls;
}

async function main() {
  const cmd = process.argv[2] || "check";
  await login();

  if (cmd === "check") {
    const r = await api("/api/admin/catalog/apply-categories");
    console.log(JSON.stringify(r.body, null, 1).slice(0, 3000));
    return;
  }

  if (cmd === "layout") {
    // read current home_sections, insert categoryGrid right before dealsRail, save
    const r = await api("/api/admin/settings");
    const raw = (r.body?.settings ?? {})["home_sections"] as string | undefined;
    let arr: { id: string; visible: boolean; title?: string; sub?: string }[] = [];
    try { arr = raw ? JSON.parse(raw) : []; } catch { arr = []; }
    if (!Array.isArray(arr) || !arr.length) {
      arr = ["offerHero", "brandStrip", "couponStrip", "categoryGrid", "dealsRail", "tabbedShowcase", "adsStrip", "deptCards", "trustStrip", "howItWorks"].map((id) => ({ id, visible: id !== "brandStrip" && id !== "deptCards" }));
    } else {
      if (!arr.some((s) => s.id === "categoryGrid")) {
        const i = arr.findIndex((s) => s.id === "dealsRail");
        arr.splice(i >= 0 ? i : arr.length, 0, { id: "categoryGrid", visible: true });
      }
      // append any other known-but-missing sections at the end
      const known = ["offerHero", "brandStrip", "couponStrip", "categoryGrid", "dealsRail", "tabbedShowcase", "adsStrip", "deptCards", "trustStrip", "howItWorks"];
      for (const id of known) if (!arr.some((s) => s.id === id)) arr.push({ id, visible: true });
    }
    const put = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ home_sections: JSON.stringify(arr) }) });
    console.log("layout saved:", JSON.stringify(put.body).slice(0, 200));
    console.log(arr.map((s) => `${s.visible ? "x" : " "} ${s.id}`).join("\n"));
    return;
  }

  const payload = JSON.parse(fs.readFileSync(PAYLOAD, "utf8")) as {
    tops: { name: string; emoji: string; color: string; sortOrder: number }[];
    assignments: { sku: string; top: string; mid: string; end: string }[];
  };
  const dry = cmd === "dry";

  // upload images only for the real run
  let imgUrls: Record<string, string> = {};
  if (!dry) {
    console.log("Uploading category images...");
    imgUrls = await uploadImages();
  }

  // tops payload (+ General fallback top so unmatched products keep a home)
  const tops = [
    ...payload.tops.map((t) => ({ ...t, ...(imgUrls[t.name] ? { image: imgUrls[t.name] } : {}) })),
    { name: "General", emoji: "🧺", color: "#6b7280", sortOrder: 1000, ...(imgUrls["General"] ? { image: imgUrls["General"] } : {}) },
  ];

  console.log(`${dry ? "DRY" : "APPLY"}: tops...`);
  const r1 = await api("/api/admin/catalog/apply-categories", { method: "POST", body: JSON.stringify({ dryRun: dry, tops }) });
  console.log(JSON.stringify(r1.body));

  // assignments in 2 chunks to stay under serverless timeout
  const chunks = [payload.assignments.slice(0, Math.ceil(payload.assignments.length / 2)), payload.assignments.slice(Math.ceil(payload.assignments.length / 2))];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`${dry ? "DRY" : "APPLY"}: assignments chunk ${i + 1}/${chunks.length} (${chunks[i].length})...`);
    const r = await api("/api/admin/catalog/apply-categories", { method: "POST", body: JSON.stringify({ dryRun: dry, assignments: chunks[i] }) });
    console.log(JSON.stringify(r.body));
    if (r.status !== 200) throw new Error(`chunk ${i + 1} failed`);
  }
  console.log("done");
}

main().catch((e) => { console.error(e); process.exit(1); });
