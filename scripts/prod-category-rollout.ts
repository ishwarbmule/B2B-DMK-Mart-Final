/**
 * Production category rollout: loop the ERP product pull (stage: products)
 * until done, finalize, then print the resulting category tree.
 * Token via env or /tmp/tok.txt. Read-only toward the ERP (the sync itself
 * only SELECTs; all writes land in the site's own database).
 */
import fs from "fs";

const BASE = "https://b2b-dmk-mart.vercel.app";
let TOKEN = process.env.TOKEN || fs.readFileSync("/tmp/tok.txt", "utf8").trim();

async function api(p: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    signal: AbortSignal.timeout(90_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("401 — re-login needed");
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body as Record<string, unknown>;
}

async function main() {
  let pages = 0;
  for (let i = 0; i < 40; i++) {
    const r = await api("/api/admin/erp-direct/sync", { method: "POST", body: JSON.stringify({ action: "resync", stage: "products" }) });
    pages++;
    const p = r.products as { seen: number; created: number; updated: number; offset: number; done: boolean; errors: string[] } | undefined;
    if (!p) { console.log("no products payload:", JSON.stringify(r).slice(0, 200)); break; }
    console.log(`page ${pages}: +${p.created}c/~${p.updated}u seen=${p.seen} @${p.offset}${p.done ? " DONE" : ""}${p.errors.length ? " ERRORS: " + p.errors.join(" | ").slice(0, 200) : ""}`);
    if (p.done) break;
  }
  const f = await api("/api/admin/erp-direct/apply", { method: "POST", body: JSON.stringify({ action: "finalize" }) });
  console.log("finalize:", JSON.stringify(f));
  const tree = await api("/api/admin/catalog/apply-categories");
  for (const t of (tree.tops ?? []) as { name: string; products: number; mids: { name: string; products: number }[] }[]) {
    const endCount = t.mids?.length ?? 0;
    console.log(`TOP ${t.name}: ${t.products} products · ${endCount} mid(s)`);
    for (const m of (t.mids ?? []).slice(0, 6)) console.log(`   - ${m.name}: ${m.products}`);
    if (endCount > 6) console.log(`   … +${endCount - 6} more`);
  }
}

main().catch((e) => { console.error("ROLLOUT-ERROR:", e.message); process.exit(1); });
