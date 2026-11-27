/** Inspect the remaining "HD Poly Plast" company products: syncSource, stock, orders, created. */
const fs = require("fs");
const BASE = "https://b2b-dmk-mart.vercel.app";
const TOKEN_FILE = "/home/z/my-project/.golive-token";

async function api(path) {
  const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  const res = await fetch(BASE + path, { headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 400); }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${t.slice(0, 300)}`);
  return d;
}

(async () => {
  // exact-case company filter (API is exact match) — try both spellings
  for (const c of ["HD Poly Plast", "HD POLYPLAST", "DMK TRADERS", "PLASTIC WORLD", "STEELKING INDUSTRIES PRIVATE LIMITED", "Steel King Cleaning"]) {
    const d = await api(`/api/admin/products?company=${encodeURIComponent(c)}&limit=100`);
    console.log(`\ncompany="${c}": total=${d.total}`);
    for (const r of (d.rows || []).slice(0, 30)) {
      console.log(`  ${r.sku} | src=${r.syncSource} activeSrc=${r.activeSource} active=${r.active} stock=${r.stock} | ${r.name.slice(0, 45)} | created=${(r.createdAt || "").slice(0, 10)} | lastSync=${(r.lastSyncedAt || "").slice(0, 10) || "-"}`);
    }
  }
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
