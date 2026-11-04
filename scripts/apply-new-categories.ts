/**
 * Apply scripts/new-category-payload.json to production via /api/admin/catalog/apply-categories.
 * Preserves existing top emoji/color/sortOrder (fetched live); no image upload.
 */
import fs from "fs";

const BASE = process.env.PROD_BASE || "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "DmkMartB2B!2026";
const PAYLOAD = "/home/z/my-project/scripts/new-category-payload.json";

let TOKEN = "";
async function api(p: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    signal: AbortSignal.timeout(120_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  const cmd = process.argv[2] || "dry";
  const payload = JSON.parse(fs.readFileSync(PAYLOAD, "utf8")) as {
    tops: { name: string; emoji: string; color: string; sortOrder: number }[];
    assignments: { sku: string; top: string; mid: string; end: string }[];
  };
  const dry = cmd !== "apply";

  const login = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
  TOKEN = login.body?.token;
  if (!TOKEN) throw new Error("login failed");
  console.log("✓ logged in");

  // current tree → preserve existing top styling
  const cur = await api("/api/admin/catalog/apply-categories");
  const existing = new Map<string, { emoji: string; color: string; sortOrder: number }>();
  for (const t of cur.body?.tops ?? []) existing.set(String(t.name), { emoji: t.emoji, color: t.color, sortOrder: t.sortOrder });

  const tops = payload.tops.map((t, i) => {
    const e = existing.get(t.name);
    return e ? { name: t.name, emoji: e.emoji, color: e.color, sortOrder: e.sortOrder } : { ...t, sortOrder: 900 + i * 10 };
  });
  console.log(`tops payload: ${tops.map((t) => t.name).join(", ")}`);

  const r1 = await api("/api/admin/catalog/apply-categories", { method: "POST", body: JSON.stringify({ dryRun: dry, tops }) });
  console.log("tops:", JSON.stringify(r1.body));
  if (r1.status !== 200) throw new Error("tops failed");

  const chunks = [payload.assignments.slice(0, Math.ceil(payload.assignments.length / 2)), payload.assignments.slice(Math.ceil(payload.assignments.length / 2))];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`${dry ? "DRY" : "APPLY"} assignments ${i + 1}/${chunks.length} (${chunks[i].length})…`);
    const r = await api("/api/admin/catalog/apply-categories", { method: "POST", body: JSON.stringify({ dryRun: dry, tops, assignments: chunks[i] }) });
    console.log(JSON.stringify(r.body));
    if (r.status !== 200) throw new Error(`chunk ${i + 1} failed`);
  }
  console.log("done", dry ? "(dry)" : "(applied)");
}

main().catch((e) => { console.error(e); process.exit(1); });
